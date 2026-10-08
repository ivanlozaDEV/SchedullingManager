// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to parse dates like "9/28/22", "8-24-23", "08/29/2024", or ISO
function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === 'None' || s === 'N/A') return null;

  // If already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Split by slash or dash
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    let month = parseInt(parts[0], 10);
    let day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (year < 100) {
      year += year < 70 ? 2000 : 1900;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // Fallback to Date parser
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

// Helper to parse address into city, state, zip
function parseAddress(addrStr) {
  const result = {
    address: addrStr ? String(addrStr).trim() : '',
    city: 'Miami',
    state: 'FL',
    zip: ''
  };

  if (!result.address) return result;

  // Match e.g. "..., Fort Myers, FL 33907" or "..., Miami, FL 33157"
  const regex = /,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i;
  const match = result.address.match(regex);
  if (match) {
    result.city = match[1].trim();
    result.state = match[2].trim().toUpperCase();
    if (match[3]) result.zip = match[3].trim();
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json();
    const {
      adjuster,
      client,
      phone,
      email,
      carrier,
      address,
      policyNumber,
      claimNumber,
      typeOfLoss,
      dateOfLoss,
      createInitialEvent = false
    } = payload;

    const trimmedClaimNumber = claimNumber ? String(claimNumber).trim() : '';
    if (!trimmedClaimNumber) {
      return new Response(JSON.stringify({ error: "claimNumber is required" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Check if Claim already exists
    const { data: existingClaim } = await supabaseAdmin
      .from('claims')
      .select('id, claim_number')
      .eq('claim_number', trimmedClaimNumber)
      .maybeSingle();

    if (existingClaim) {
      return new Response(JSON.stringify({
        status: 'already_exists',
        message: `Claim ${trimmedClaimNumber} already exists in database.`,
        claimId: existingClaim.id,
        claimNumber: existingClaim.claim_number
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Insured: Find or create
    let insuredId = null;
    const clientName = client ? String(client).trim() : 'Unnamed Client';
    const clientPhone = phone ? String(phone).trim() : null;
    const clientEmail = email ? String(email).trim() : null;

    if (clientEmail || clientName) {
      let query = supabaseAdmin.from('insureds').select('id, name');
      if (clientEmail) {
        query = query.eq('email', clientEmail);
      } else {
        query = query.eq('name', clientName);
      }
      const { data: existingInsured } = await query.maybeSingle();

      if (existingInsured) {
        insuredId = existingInsured.id;
        // Optionally update phone if missing
        if (clientPhone) {
          await supabaseAdmin.from('insureds').update({ phone: clientPhone }).eq('id', insuredId);
        }
      } else {
        const { data: newInsured, error: insuredErr } = await supabaseAdmin
          .from('insureds')
          .insert({
            name: clientName,
            phone: clientPhone,
            email: clientEmail
          })
          .select('id')
          .single();

        if (!insuredErr && newInsured) {
          insuredId = newInsured.id;
        }
      }
    }

    // 3. Public Adjuster: Find or create
    let publicAdjusterId = null;
    if (adjuster) {
      const paName = String(adjuster).trim();
      const { data: existingPa } = await supabaseAdmin
        .from('public_adjusters')
        .select('id')
        .ilike('name', `%${paName}%`)
        .maybeSingle();

      if (existingPa) {
        publicAdjusterId = existingPa.id;
      } else {
        const { data: newPa, error: paErr } = await supabaseAdmin
          .from('public_adjusters')
          .insert({
            name: paName,
            role: 'adjuster',
            color_code: '#0284c7'
          })
          .select('id')
          .single();

        if (!paErr && newPa) {
          publicAdjusterId = newPa.id;
        }
      }
    }

    // 4. Address & Date parsing
    const parsedAddr = parseAddress(address);
    const parsedDol = parseDate(dateOfLoss);

    // 5. Insert Claim
    const claimPayload = {
      claim_number: trimmedClaimNumber,
      policy_number: policyNumber ? String(policyNumber).trim() : null,
      carrier: carrier ? String(carrier).trim() : 'Unknown Carrier',
      type_of_loss: typeOfLoss ? String(typeOfLoss).trim() : 'Water Damage',
      property_address: parsedAddr.address || 'Address pending',
      city: parsedAddr.city,
      state: parsedAddr.state,
      zip_code: parsedAddr.zip || null,
      date_of_loss: parsedDol,
      status: 'Open',
      insured_id: insuredId,
      public_adjuster_id: publicAdjusterId,
      notes: `Imported via Google Sheets sync on ${new Date().toISOString()}`
    };

    const { data: createdClaim, error: claimInsertErr } = await supabaseAdmin
      .from('claims')
      .insert(claimPayload)
      .select()
      .single();

    if (claimInsertErr) {
      throw new Error(`Database error creating claim: ${claimInsertErr.message}`);
    }

    // 6. Optional: Create Initial Inspection Event in Stage 1
    let createdEventId = null;
    if (createInitialEvent) {
      const { data: event, error: eventErr } = await supabaseAdmin
        .from('events')
        .insert({
          claim_id: createdClaim.id,
          event_type: 'Initial Inspection',
          status: 'coordinating',
          coordination_stage: '1_awaiting_carrier_slots',
          location: createdClaim.property_address
        })
        .select('id')
        .single();

      if (!eventErr && event) {
        createdEventId = event.id;

        // Add participants
        if (insuredId) {
          await supabaseAdmin.from('event_participants').insert({
            event_id: event.id,
            participant_type: 'insured',
            role_type: 'actor',
            insured_id: insuredId
          });
        }
        if (publicAdjusterId) {
          await supabaseAdmin.from('event_participants').insert({
            event_id: event.id,
            participant_type: 'public_adjuster',
            role_type: 'staff',
            public_adjuster_id: publicAdjusterId
          });
        }

        // Add initial coordination log
        await supabaseAdmin.from('coordination_logs').insert({
          event_id: event.id,
          contact_target: 'internal',
          contact_target_name: 'Google Sheets Integration',
          channel: 'other',
          notes: `Claim and Initial Inspection event automatically created from Google Sheets sync.`
        });
      }
    }

    return new Response(JSON.stringify({
      status: 'created',
      message: `Claim ${trimmedClaimNumber} successfully created`,
      claimId: createdClaim.id,
      claimNumber: createdClaim.claim_number,
      eventId: createdEventId
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Error in sync-sheet-claim:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

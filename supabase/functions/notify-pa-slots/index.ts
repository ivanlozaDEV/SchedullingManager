// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.13"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  const url = new URL(req.url)
  const functionUrl = `${supabaseUrl}/functions/v1/notify-pa-slots`

  // =========================================================================
  // 1. GET HANDLER: 1-CLICK ACTION DIRECTLY FROM EMAIL OR INTERACTIVE PORTAL
  // =========================================================================
  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'portal'
    const eventId = url.searchParams.get('eventId')
    const discardId = url.searchParams.get('discardId')
    const slotsParam = url.searchParams.get('slots')

    if (!eventId) {
      return buildRedirectResponse({
        role: 'pa',
        status: 'error',
        title: "Error: Missing Event ID",
        message: "No valid event identifier was provided in the link."
      })
    }

    try {
      // Fetch event, claim, insured, PA, and slots
      const { data: event, error: eventErr } = await supabaseAdmin
        .from('events')
        .select(`
          *,
          claim:claims (
            *,
            insured:insureds (*),
            public_adjuster:public_adjusters (*)
          ),
          slots:event_slots (*)
        `)
        .eq('id', eventId)
        .single()

      if (eventErr || !event) {
        return buildRedirectResponse({
          status: 'error',
          title: "Event Not Found",
          message: "We could not locate this event in the system. It may have been reassigned or removed."
        })
      }

      const claim = event.claim
      const insuredName = claim?.insured?.name || 'Insured Client'
      const claimNumber = claim?.claim_number || 'N/A'
      const carrier = claim?.carrier || 'Carrier'
      const propertyAddress = claim?.property_address || event.location || 'N/A'
      const paName = claim?.public_adjuster?.name || 'Public Adjuster'
      const rawSlots = event.slots || []
      const sortedSlots = [...rawSlots].sort((a, b) => (a.slot_date > b.slot_date ? 1 : -1))

      // A) ACTION: Discard one option and approve the remaining ones
      if (action === 'discard' && discardId) {
        const acceptedSlots = sortedSlots.filter(s => s.id !== discardId)
        const rejectedSlots = sortedSlots.filter(s => s.id === discardId)

        return await executeSlotSelection({
          supabaseAdmin,
          eventId,
          event,
          acceptedSlots,
          rejectedSlots,
          claimNumber,
          insuredName,
          carrier,
          propertyAddress,
          paName
        })
      }

      // B) ACTION: Select specific pair of options (slots=id1,id2)
      if (action === 'select_pair' && slotsParam) {
        const selectedIds = slotsParam.split(',').map(s => s.trim())
        const acceptedSlots = sortedSlots.filter(s => selectedIds.includes(s.id))
        const rejectedSlots = sortedSlots.filter(s => !selectedIds.includes(s.id))

        if (acceptedSlots.length === 0) {
          return buildRedirectResponse({
            status: 'error',
            title: "Invalid Selection",
            message: "No valid options were identified to approve."
          })
        }

        return await executeSlotSelection({
          supabaseAdmin,
          eventId,
          event,
          acceptedSlots,
          rejectedSlots,
          claimNumber,
          insuredName,
          carrier,
          propertyAddress,
          paName
        })
      }

      // C) ACTION: Interactive Web Portal (Visual Checkbox Selector)
      return new Response(renderPortalHtml({
        eventId,
        functionUrl,
        claimNumber,
        insuredName,
        carrier,
        propertyAddress,
        paName,
        slots: sortedSlots,
        currentStage: event.coordination_stage
      }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 200
      })

    } catch (err: any) {
      console.error("Error processing GET slot selection:", err)
      return buildRedirectResponse({
        role: 'pa',
        status: 'error',
        title: "Processing Error",
        message: err.message || "An unexpected error occurred while processing your selection."
      })
    }
  }

  // =========================================================================
  // 2. POST HANDLER: SEND NOTIFICATION EMAIL WITH 1-CLICK ACTION BUTTONS
  // =========================================================================
  try {
    const { eventId } = await req.json()
    if (!eventId) throw new Error("eventId is required")

    // Fetch details of event, claim, insured, PA, and slots
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select(`
        *,
        claim:claims (
          *,
          insured:insureds (*),
          public_adjuster:public_adjusters (*)
        ),
        slots:event_slots (*)
      `)
      .eq('id', eventId)
      .single()

    if (eventErr || !event) {
      throw eventErr || new Error("Event not found")
    }

    const pa = event.claim?.public_adjuster
    const paEmail = pa?.email
    const paName = pa?.name || 'Public Adjuster'

    if (!paEmail) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: "No public adjuster email associated with this claim" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const claim = event.claim
    const insuredName = claim?.insured?.name || 'Insured Client'
    const carrier = claim?.carrier || 'Carrier'
    const claimNumber = claim?.claim_number || 'N/A'
    const address = claim?.property_address || event.location || 'N/A'
    const eventType = event.event_type || 'Inspection'

    // Format proposed slots
    const rawSlots = event.slots || []
    const sortedSlots = [...rawSlots].sort((a, b) => (a.slot_date > b.slot_date ? 1 : -1))

    let slotsHtml = ''
    let slotsPlainText = ''

    sortedSlots.forEach((slot, index) => {
      const optNum = index + 1
      const sTime = slot.start_time ? slot.start_time.slice(0, 5) : '09:00'
      const eTime = slot.end_time ? slot.end_time.slice(0, 5) : '11:00'
      const dateStr = slot.slot_date || 'Date pending'
      
      // Direct 1-click link to discard this option and approve others
      const discardLink = `${functionUrl}?action=discard&eventId=${eventId}&discardId=${slot.id}`

      slotsPlainText += `Option #${optNum}: ${dateStr} from ${sTime} to ${eTime}\n`
      slotsPlainText += `  👉 Discard this date & approve the other 2: ${discardLink}\n\n`

      slotsHtml += `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px; background-color:#ffffff; border-radius:8px; border:1px solid #d1d5db; overflow:hidden;">
          <tr>
            <td style="padding:16px 18px; border-left:5px solid #0071bc;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top">
                    <span style="display:inline-block; font-size:12px; font-weight:bold; background-color:#e0f2fe; color:#0284c7; padding:3px 9px; border-radius:4px; text-transform:uppercase; margin-bottom:6px;">
                      Option #${optNum}
                    </span>
                    <div style="font-size:16px; font-weight:bold; color:#004E91; margin-top:2px;">
                      📅 ${dateStr}
                    </div>
                    <div style="font-size:13px; color:#4b5563; margin-top:2px; font-family:Courier, monospace;">
                      ⏰ ${sTime} - ${eTime}
                    </div>
                  </td>
                  <td align="right" valign="middle" style="padding-left:10px;">
                    <!-- 1-Click Button to discard this option and approve the others -->
                    <a href="${discardLink}" target="_blank" style="display:inline-block; background-color:#dc2626; color:#ffffff; font-size:12px; font-weight:bold; text-decoration:none; padding:9px 13px; border-radius:5px; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
                      ❌ Discard this date<br><span style="font-size:10px; font-weight:normal; opacity:0.95;">(Approve other 2)</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    })

    // Generate pair combinations for 1-click selection
    let pairButtonsHtml = ''
    if (sortedSlots.length === 3) {
      const pairs = [
        { label: 'Approve Option 1 & Option 2', sA: sortedSlots[0], sB: sortedSlots[1] },
        { label: 'Approve Option 1 & Option 3', sA: sortedSlots[0], sB: sortedSlots[2] },
        { label: 'Approve Option 2 & Option 3', sA: sortedSlots[1], sB: sortedSlots[2] },
      ]

      pairButtonsHtml = `
        <div style="margin:20px 0 10px 0; background-color:#ffffff; border-radius:8px; border:1px solid #d1d5db; padding:16px;">
          <div style="font-size:13px; font-weight:bold; color:#004E91; text-transform:uppercase; margin-bottom:10px; letter-spacing:0.5px;">
            ⚡ Or approve your preferred pair in 1 single click:
          </div>
          ${pairs.map(p => {
            const pairUrl = `${functionUrl}?action=select_pair&eventId=${eventId}&slots=${p.sA.id},${p.sB.id}`
            return `
              <div style="margin-bottom:8px;">
                <a href="${pairUrl}" target="_blank" style="display:block; text-align:center; background-color:#0284c7; color:#ffffff; font-size:13px; font-weight:bold; text-decoration:none; padding:10px 14px; border-radius:5px;">
                  ✅ ${p.label}
                </a>
              </div>
            `
          }).join('')}
        </div>
      `
    }

    const portalLink = `${functionUrl}?action=portal&eventId=${eventId}`
    const subject = `Carrier Proposed Dates for Review | ${insuredName} - Claim #${claimNumber}`

    // Plain Text Template
    const plainText = `Dear ${paName},

The insurance carrier (${carrier}) has provided ${sortedSlots.length} proposed inspection dates for Claim #${claimNumber}.

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Carrier: ${carrier}
- Property Address: ${address}
- Inspection Type: ${eventType}

PROPOSED DATES FROM CARRIER:
${slotsPlainText}

1-CLICK QUICK SELECTION:
You can directly approve 2 options in 1 click or open the selection portal:
👉 ${portalLink}

Once you select your 2 dates, the IP Scheduling Manager system will automatically advance the claim to Stage 3 (Insured Selection).

Best regards,
IP Scheduling Manager
IP Adjusting Group LLC
1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
`

    // Official Corporate HTML Template of IP Adjusting Group
    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Carrier Proposed Dates for Review</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; display:block; border:0; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; height:100% !important; }
    @media screen and (max-width:600px){
      .container { width:100% !important; }
      .content, .footer { width:100% !important; }
      img { max-width:100% !important; height:auto !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#d6d9e0; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#d6d9e0">
    <tr>
      <td align="center" style="padding: 25px 0;">

        <!-- Container (600px) -->
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">

          <!-- BRAND HEADER -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:22px 20px 18px 20px; border-bottom:3px solid #0071bc;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l" alt="IP Adjusting Group" width="180" style="display:block; max-width:220px; height:auto; border:0; margin:0 auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td class="content" style="padding:28px 40px 15px 40px; font-size:15px; color:#004E91; line-height:1.6; font-family:Arial, Helvetica, sans-serif; background-color:#F0F0F0;">
              
              <p style="margin:0 0 14px 0; font-size:16px;">Dear <strong>${paName}</strong>,</p>
              
              <p style="margin:0 0 16px 0;">
                The insurance carrier (<strong>${carrier}</strong>) has provided <strong>${sortedSlots.length} proposed inspection dates</strong> for your claim. Please review the options below and choose <strong>2 dates</strong> to present to the client.
              </p>

              <!-- CLAIM SUMMARY BOX -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#ffffff; border-left:4px solid #0071bc; border-radius:4px; padding:16px;">
                <tr>
                  <td>
                    <div style="font-size:12px; font-weight:bold; color:#0071bc; text-transform:uppercase; margin-bottom:8px;">
                      Claim Information
                    </div>
                    <div style="font-size:14px; color:#111827; line-height:1.7;">
                      <strong>Claim Number:</strong> ${claimNumber}<br>
                      <strong>Insured:</strong> ${insuredName}<br>
                      <strong>Carrier:</strong> ${carrier}<br>
                      <strong>Property Address:</strong> ${address}<br>
                      <strong>Inspection Type:</strong> ${eventType}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- INSTRUCTIONS BANNER -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px; background-color:#e0f2fe; border:1px solid #bae6fd; border-radius:6px; padding:12px 16px;">
                <tr>
                  <td>
                    <div style="font-size:13px; color:#0369a1; font-weight:bold; line-height:1.4;">
                      💡 Select your 2 preferred inspection dates directly from this email:
                    </div>
                    <div style="font-size:12px; color:#075985; margin-top:3px; line-height:1.4;">
                      Click the red <strong>"Discard this date"</strong> button on the date that does NOT work for you, or approve a pair below.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- PROPOSED DATES SECTION -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td style="border-bottom:2px solid #0071bc; padding-bottom:6px;">
                    <span style="font-size:16px; font-weight:bold; color:#004E91;">
                      Carrier Proposed Dates:
                    </span>
                  </td>
                </tr>
              </table>

              ${slotsHtml}

              ${pairButtonsHtml}

              <!-- INTERACTIVE MOBILE PORTAL LINK -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 10px 0;">
                <tr>
                  <td align="center" style="background-color:#004E91; border-radius:6px; padding:14px 20px;">
                    <a href="${portalLink}" target="_blank" style="color:#ffffff; font-size:14px; font-weight:bold; display:block; text-decoration:none;">
                      📱 Open Fullscreen Interactive Selector →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 5px 0; font-size:14px; color:#004E91;">Warm regards,</p>
              <p style="margin:0 0 15px 0; font-size:14px; font-weight:bold; color:#004E91;">IP Scheduling Coordination Team</p>

            </td>
          </tr>

          <!-- SIGNATURE / LOGO -->
          <tr>
            <td align="right" style="padding:0px 40px 25px 0px; background-color:#F0F0F0;">
              <img src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l" alt="IP Adjusters" width="140" style="display:block; max-width:160px; height:auto; border:0;">
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer" bgcolor="#0071bc" align="center" style="padding:22px; color:#ffffff; font-size:13px; font-family:Arial, Helvetica, sans-serif; line-height:1.4;">
              
              <!-- Social links -->
              <p style="margin:0 0 12px 0;">
                <a href="https://www.instagram.com/ip_adjusting_group/" style="margin:0 10px; text-decoration:underline; color:#ffffff; font-weight:normal;">
                  <img src="https://drive.google.com/uc?export=view&id=1eVdlspnkXxuauln84a3TvwX7CkoPzUtN" alt="Instagram" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">Instagram
                </a>

                <a href="https://wa.me/17722820862" style="margin:0 10px; text-decoration:none; color:#ffffff; font-weight:normal;">
                  <img src="https://drive.google.com/uc?export=view&id=1sNAL_a5ISR1Xa3SFz5DFxsdf5v6Ka7O0" alt="WhatsApp" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">WhatsApp
                </a>

                <a href="https://www.ipadjustinggroup.com" style="margin:0 10px; text-decoration:underline; color:#ffffff; font-weight:normal;">
                  <img src="https://drive.google.com/uc?export=view&id=1OBMR1DYrpf7DEVIGoUGMGSTz9FAlOtsJ" alt="Website" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">Website
                </a>
              </p>

              <!-- Address and Contact -->
              <p style="margin:20px 0 10px 0; font-size:13px;">
                1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986<br>
                admin@ipadjustinggroup.com | (772) 282-0862
              </p>

              <!-- Legal text -->
              <p style="margin:18px 25px 0px 25px; font-size:9px; color:#ffffff; line-height:1.3;">
                IP Adjusting Group is a licensed public adjusting firm proudly serving homeowners and business owners across Florida. The information in this email is meant to be general in nature and should not be taken as legal or insurance advice.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`

    // Send email via Nodemailer with Google SMTP
    const smtpUser = Deno.env.get('GMAIL_SMTP_USER')
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD')

    if (!smtpUser || !smtpPass) {
      console.warn("GMAIL_SMTP_USER or GMAIL_SMTP_PASSWORD not set.")
      return new Response(JSON.stringify({ 
        success: false, 
        message: "No Google SMTP credentials configured" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass }
    })

    const mailOptions = {
      from: `"IP Adjusting Group" <${smtpUser}>`,
      to: paEmail,
      subject: subject,
      text: plainText,
      html: htmlBody
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Email to PA successfully sent:", info.messageId)

    // Insert into coordination_logs
    await supabaseAdmin.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'pa',
      contact_target_name: paName,
      channel: 'email',
      notes: `📧 Interactive email notification sent to PA (${paEmail}) with 1-click selection links.`
    })

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: info.messageId, 
      recipient: paEmail 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error("Error in notify-pa-slots:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})

// =========================================================================
// HELPER: BUILD 302 REDIRECT TO FRONTEND CONFIRMATION PORTAL
// =========================================================================
function buildRedirectResponse({
  role = 'pa',
  status = 'success',
  claim = '',
  insured = '',
  carrier = '',
  address = '',
  date = '',
  time = '',
  title = '',
  message = ''
}: any) {
  const baseUrl = Deno.env.get('FRONTEND_URL') || 'https://ip-scheduling-manager.onrender.com'
  const redirectUrl = new URL(baseUrl)
  redirectUrl.searchParams.set('view', 'confirmation')
  if (role) redirectUrl.searchParams.set('role', role)
  if (status) redirectUrl.searchParams.set('status', status)
  if (claim) redirectUrl.searchParams.set('claim', claim)
  if (insured) redirectUrl.searchParams.set('insured', insured)
  if (carrier) redirectUrl.searchParams.set('carrier', carrier)
  if (address) redirectUrl.searchParams.set('address', address)
  if (date) redirectUrl.searchParams.set('date', date)
  if (time) redirectUrl.searchParams.set('time', time)
  if (title) redirectUrl.searchParams.set('title', title)
  if (message) redirectUrl.searchParams.set('message', message)

  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirectUrl.toString()
    }
  })
}

// =========================================================================
// HELPER: EXECUTE DATABASE UPDATE & RENDER CONFIRMATION SCREEN
// =========================================================================
async function executeSlotSelection({
  supabaseAdmin,
  eventId,
  event,
  acceptedSlots,
  rejectedSlots,
  claimNumber,
  insuredName,
  carrier,
  propertyAddress,
  paName
}: any) {
  // 1. Mark accepted slots
  const acceptedIds = acceptedSlots.map((s: any) => s.id)
  if (acceptedIds.length > 0) {
    const { error: accErr } = await supabaseAdmin
      .from('event_slots')
      .update({ status: 'pa_accepted' })
      .in('id', acceptedIds)
    if (accErr) console.error("Error updating accepted slots:", accErr)
  }

  // 2. Mark rejected slots
  const rejectedIds = rejectedSlots.map((s: any) => s.id)
  if (rejectedIds.length > 0) {
    const { error: rejErr } = await supabaseAdmin
      .from('event_slots')
      .update({ status: 'pa_rejected' })
      .in('id', rejectedIds)
    if (rejErr) console.error("Error updating rejected slots:", rejErr)
  }

  // 3. Advance event stage to Stage 3: Insured Selection
  const { error: evtErr } = await supabaseAdmin
    .from('events')
    .update({
      coordination_stage: '3_insured_selection',
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)

  if (evtErr) console.error("Error updating event stage:", evtErr)

  // 4. Log in coordination audit bitacora
  const dateSummary = acceptedSlots.map((s: any) => `${s.slot_date} (${(s.start_time || '').slice(0, 5)}-${(s.end_time || '').slice(0, 5)})`).join(' & ')
  await supabaseAdmin.from('coordination_logs').insert({
    event_id: eventId,
    contact_target: 'pa',
    contact_target_name: paName,
    channel: 'email',
    notes: `⚡ 1-Click Email Selection: PA approved options [${dateSummary}]. Event advanced to Stage 3 (Insured Selection).`
  })

  // 4.1 Trigger notify-insured-slots to email the client with the 2 pre-approved dates
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  try {
    const notifyRes = await fetch(`${supabaseUrl}/functions/v1/notify-insured-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ eventId })
    })
    console.log("Triggered notify-insured-slots status:", notifyRes.status)
  } catch (err) {
    console.error("Error triggering notify-insured-slots from 1-click email:", err)
  }

  // 5. Return clean 302 redirect to frontend confirmation portal
  return buildRedirectResponse({
    role: 'pa',
    status: 'success',
    claim: claimNumber,
    insured: insuredName,
    carrier: carrier,
    address: propertyAddress,
    date: dateSummary
  })
}

// =========================================================================
// HTML TEMPLATE: SUCCESS CONFIRMATION WITH OFFICIAL BRANDING (IN ENGLISH)
// =========================================================================
function renderConfirmationSuccessHtml({
  claimNumber,
  insuredName,
  carrier,
  propertyAddress,
  paName,
  acceptedSlots
}: any) {
  const slotsCards = acceptedSlots.map((slot: any, idx: number) => `
    <div style="background-color:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:14px 18px; margin-bottom:10px;">
      <div style="font-size:12px; font-weight:bold; color:#166534; text-transform:uppercase;">
        Approved Option #${idx + 1}
      </div>
      <div style="font-size:17px; font-weight:bold; color:#14532d; margin-top:3px;">
        📅 ${slot.slot_date}
      </div>
      <div style="font-size:13px; color:#15803d; font-family:Courier, monospace; margin-top:2px;">
        ⏰ ${(slot.start_time || '').slice(0, 5)} - ${(slot.end_time || '').slice(0, 5)}
      </div>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selection Confirmed | IP Scheduling Manager</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 550px; margin: 20px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: #004E91; padding: 24px; text-align: center; }
    .content { padding: 26px 28px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l" alt="IP Adjusting Group" style="max-width: 170px; height: auto; margin: 0 auto; display: block; filter: brightness(0) invert(1);">
    </div>
    <div class="content">
      <div style="text-align:center; margin-bottom:20px;">
        <div style="font-size:42px; margin-bottom:8px;">✅</div>
        <h2 style="margin:0 0 6px 0; color:#0f172a; font-size:22px;">Selection Successfully Confirmed!</h2>
        <p style="margin:0; color:#64748b; font-size:14px;">Thank you, <strong>${paName}</strong>. Your preferred options have been recorded in the system.</p>
      </div>

      <!-- Claim Summary -->
      <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:18px; font-size:13px; line-height:1.6;">
        <div><strong>Claim #:</strong> ${claimNumber}</div>
        <div><strong>Insured:</strong> ${insuredName}</div>
        <div><strong>Carrier:</strong> ${carrier}</div>
        <div><strong>Property Address:</strong> ${propertyAddress}</div>
      </div>

      <div style="font-size:13px; font-weight:bold; color:#334155; text-transform:uppercase; margin-bottom:8px;">
        Approved Dates to Present to Insured Client:
      </div>

      ${slotsCards}

      <!-- Flow status -->
      <div style="background-color:#eff6ff; border-left:4px solid #0284c7; padding:12px 16px; border-radius:4px; margin-top:20px; font-size:13px; color:#0369a1; line-height:1.5;">
        🚀 <strong>Stage Updated:</strong> The claim has automatically advanced to <strong>Stage 3 (Client Selection)</strong> in IP Scheduling Manager.
      </div>

      <div style="text-align:center; margin-top:24px;">
        <span style="display:inline-block; font-size:12px; color:#94a3b8;">
          You may now safely close this window.
        </span>
      </div>
    </div>
  </div>
</body>
</html>`
}

// =========================================================================
// HTML TEMPLATE: INTERACTIVE MOBILE PORTAL (IN ENGLISH)
// =========================================================================
function renderPortalHtml({
  eventId,
  functionUrl,
  claimNumber,
  insuredName,
  carrier,
  propertyAddress,
  paName,
  slots,
  currentStage
}: any) {
  const isAlreadyAdvanced = currentStage && currentStage !== '2_pa_selection' && currentStage !== '1_carrier_outreach'

  const slotOptionsHtml = slots.map((s: any, idx: number) => {
    const sTime = s.start_time ? s.start_time.slice(0, 5) : '09:00'
    const eTime = s.end_time ? s.end_time.slice(0, 5) : '11:00'
    return `
      <label style="display:block; background-color:#ffffff; border:2px solid #cbd5e1; border-radius:8px; padding:14px; margin-bottom:10px; cursor:pointer;" class="slot-card" id="card-${s.id}">
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="checkbox" name="selectedSlot" value="${s.id}" style="width:20px; height:20px; cursor:pointer;" onchange="handleSlotChange()">
          <div style="flex:1;">
            <div style="font-size:11px; font-weight:bold; color:#0284c7; text-transform:uppercase;">Option #${idx + 1}</div>
            <div style="font-size:16px; font-weight:bold; color:#0f172a; margin-top:2px;">📅 ${s.slot_date}</div>
            <div style="font-size:13px; color:#64748b; font-family:Courier, monospace; margin-top:2px;">⏰ ${sTime} - ${eTime}</div>
          </div>
        </div>
      </label>
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Select Inspection Options | IP Adjusting Group</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 550px; margin: 20px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: #004E91; padding: 24px; text-align: center; }
    .content { padding: 26px 28px; }
    .slot-card.selected { border-color: #0284c7; background-color: #f0f9ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l" alt="IP Adjusting Group" style="max-width: 170px; height: auto; margin: 0 auto; display: block; filter: brightness(0) invert(1);">
    </div>
    <div class="content">
      <h2 style="margin:0 0 6px 0; color:#0f172a; font-size:20px;">Select 2 Inspection Dates for the Client</h2>
      <p style="margin:0 0 18px 0; color:#64748b; font-size:13px;">Dear <strong>${paName}</strong>, please select exactly <strong>2 options</strong> that work best for your schedule:</p>

      <!-- Claim Info -->
      <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:18px; font-size:12px; line-height:1.6;">
        <div><strong>Claim:</strong> ${claimNumber} | <strong>Insured:</strong> ${insuredName}</div>
        <div><strong>Carrier:</strong> ${carrier} | <strong>Property Address:</strong> ${propertyAddress}</div>
      </div>

      ${isAlreadyAdvanced ? `
        <div style="background-color:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:10px 14px; margin-bottom:16px; font-size:12px; color:#92400e;">
          ℹ️ <strong>Note:</strong> This event is already in progress (Current Stage: ${currentStage}). You can update the selection if needed.
        </div>
      ` : ''}

      <form id="selectionForm" onsubmit="submitSelection(event)">
        ${slotOptionsHtml}

        <div id="selectionStatus" style="font-size:13px; font-weight:bold; color:#dc2626; margin:14px 0 12px 0;">
          Please select 2 options to continue. (Selected: 0/2)
        </div>

        <button type="submit" id="btnSubmit" disabled style="width:100%; padding:14px; background-color:#94a3b8; color:#ffffff; font-size:15px; font-weight:bold; border:none; border-radius:8px; cursor:not-allowed; transition:background 0.2s;">
          Confirm Selection of 2 Options
        </button>
      </form>
    </div>
  </div>

  <script>
    function handleSlotChange() {
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="selectedSlot"]:checked'));
      const statusEl = document.getElementById('selectionStatus');
      const submitBtn = document.getElementById('btnSubmit');

      document.querySelectorAll('.slot-card').forEach(card => card.classList.remove('selected'));
      checkedBoxes.forEach(box => {
        const card = document.getElementById('card-' + box.value);
        if (card) card.classList.add('selected');
      });

      if (checkedBoxes.length === 2) {
        statusEl.style.color = '#16a34a';
        statusEl.innerText = '✓ Perfect! You have selected 2 options (2/2).';
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = '#004E91';
        submitBtn.style.cursor = 'pointer';
      } else if (checkedBoxes.length > 2) {
        statusEl.style.color = '#dc2626';
        statusEl.innerText = '⚠️ You can only select a maximum of 2 options (' + checkedBoxes.length + '/2).';
        submitBtn.disabled = true;
        submitBtn.style.backgroundColor = '#94a3b8';
        submitBtn.style.cursor = 'not-allowed';
      } else {
        statusEl.style.color = '#dc2626';
        statusEl.innerText = 'Please select 2 options to continue. (Selected: ' + checkedBoxes.length + '/2)';
        submitBtn.disabled = true;
        submitBtn.style.backgroundColor = '#94a3b8';
        submitBtn.style.cursor = 'not-allowed';
      }
    }

    function submitSelection(e) {
      e.preventDefault();
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="selectedSlot"]:checked'));
      if (checkedBoxes.length !== 2) return;
      const slotIds = checkedBoxes.map(b => b.value).join(',');
      window.location.href = '${functionUrl}?action=select_pair&eventId=${eventId}&slots=' + encodeURIComponent(slotIds);
    }
  </script>
</body>
</html>`
}

// =========================================================================
// HTML TEMPLATE: ERROR / NOTICE MESSAGES (IN ENGLISH)
// =========================================================================
function renderFeedbackHtml({ title, message, isSuccess }: any) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | IP Scheduling Manager</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 500px; margin: 30px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); overflow: hidden; padding: 30px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:44px; margin-bottom:12px;">${isSuccess ? '✅' : '⚠️'}</div>
    <h2 style="margin:0 0 10px 0; color:#0f172a; font-size:22px;">${title}</h2>
    <p style="margin:0; color:#64748b; font-size:14px; line-height:1.6;">${message}</p>
  </div>
</body>
</html>`
}

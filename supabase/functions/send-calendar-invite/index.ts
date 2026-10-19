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

  try {
    const { eventId, isTest, testEmail } = await req.json()
    if (!eventId && !isTest) throw new Error("eventId is required")

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let event = null;
    let uniqueRecipients: { email: string, name: string }[] = [];

    if (isTest && (!eventId || eventId === 'test')) {
      // Mock event for testing without touching database
      event = {
        id: 'test-calendar-event',
        final_date: '2026-10-30',
        final_start_time: '10:00:00',
        final_end_time: '12:00:00',
        location: '6539 Bellview Pines Rd, Pensacola, FL 32526',
        event_type: 'Initial Inspection',
        claim: {
          claim_number: 'HO0526444000',
          carrier: 'Monarch National Insurance',
          property_address: '6539 Bellview Pines Rd, Pensacola, FL 32526',
          city: 'Pensacola',
          state: 'FL',
          zip_code: '32526',
          insured: { name: 'Albert & Carmelita Kling', email: testEmail || 'ivanloza88@gmail.com' }
        }
      };
      uniqueRecipients = [{ email: testEmail || 'ivanloza88@gmail.com', name: 'Iván Loza (Test Preview)' }];
    } else {
      // 1. Fetch Event and Claim details
      const { data: dbEvent, error: eventErr } = await supabaseAdmin
        .from('events')
        .select(`*, claim:claims (*, insured:insureds (*), public_adjuster:public_adjusters (*))`)
        .eq('id', eventId)
        .single()

      if (eventErr || !dbEvent) throw eventErr || new Error("Event not found")
      event = dbEvent;

      // 2. Fetch Participants
      const { data: participants, error: partErr } = await supabaseAdmin
        .from('event_participants')
        .select(`*, public_adjuster:public_adjusters(email, name), carrier_rep:carrier_representatives(email, name), external_actor:external_actors(email, name)`)
        .eq('event_id', eventId)

      if (partErr) throw partErr

      // Collect all emails
      const emailRecipients: { email: string, name: string }[] = []
      if (event.claim?.insured?.email) emailRecipients.push({ email: event.claim.insured.email, name: event.claim.insured.name })
      if (event.claim?.public_adjuster?.email) emailRecipients.push({ email: event.claim.public_adjuster.email, name: event.claim.public_adjuster.name })
      
      for (const p of (participants || [])) {
        if (p.custom_email) emailRecipients.push({ email: p.custom_email, name: p.custom_name || 'Participant' })
        if (p.public_adjuster?.email) emailRecipients.push({ email: p.public_adjuster.email, name: p.public_adjuster.name })
        if (p.carrier_rep?.email) emailRecipients.push({ email: p.carrier_rep.email, name: p.carrier_rep.name })
        if (p.external_actor?.email) emailRecipients.push({ email: p.external_actor.email, name: p.external_actor.name })
      }

      if (isTest && testEmail) {
        uniqueRecipients = [{ email: testEmail, name: 'Iván Loza (Test Preview)' }]
      } else {
        uniqueRecipients = Array.from(new Map(emailRecipients.filter(r => r.email).map(item => [item.email, item])).values())
      }
    }

    if (uniqueRecipients.length === 0) {
      return new Response(JSON.stringify({ message: "No participants with emails found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // 3. Detect Property Timezone (Central Time vs Eastern Time)
    const combinedAddr = `${event.location || ''} ${event.claim?.property_address || ''} ${event.claim?.city || ''} ${event.claim?.zip_code || ''} ${event.notes || ''}`.toLowerCase();
    const isCt = /\[timezone:\s*ct\]/i.test(combinedAddr) || 
      /\b(324\d{2}|325\d{2})\b/.test(combinedAddr) ||
      ['pensacola', 'panama city', 'destin', 'fort walton', 'milton', 'crestview', 'navarre', 'gulf breeze', 'pace', 'escambia', 'santa rosa'].some(kw => combinedAddr.includes(kw));
    
    const ianaTz = isCt ? 'America/Chicago' : 'America/New_York';
    const tzLabel = isCt ? 'Central Time (CT - Pensacola)' : 'Eastern Time (ET - Miami)';

    // 4. Generate Dates & .ics content
    const cleanDate = (event.final_date || '').replace(/-/g, '')
    const cleanStartTime = (event.final_start_time || '09:00:00').slice(0, 8).replace(/:/g, '').padEnd(6, '0')
    const cleanEndTime = (event.final_end_time || '11:00:00').slice(0, 8).replace(/:/g, '').padEnd(6, '0')
    const dtStartIcs = `${cleanDate}T${cleanStartTime}`
    const dtEndIcs = `${cleanDate}T${cleanEndTime}`

    const insuredName = event.claim?.insured?.name || 'Insured Client'
    const claimNumber = event.claim?.claim_number || 'N/A'
    const eventType = event.event_type || 'Inspection'
    const title = `${eventType} Confirmed | ${insuredName} - Claim #${claimNumber}`
    const desc = `Address: ${event.claim?.property_address || ''}\nLocation: ${event.location || ''}\nTimezone: ${tzLabel}\nClaim Number: ${claimNumber}\nCarrier: ${event.claim?.carrier || ''}\nInsured: ${insuredName}`

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER') || 'scheduling@ipadjustinggroup.com'
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD')

    // Ensure the scheduling office/organizer also receives the invite to update their calendar
    if (smtpUser && !isTest && !uniqueRecipients.some(r => r.email.toLowerCase() === smtpUser.toLowerCase())) {
      uniqueRecipients.push({ email: smtpUser, name: 'IP Scheduling Coordinator' })
    }

    // Determine dynamic sequence number (RFC 5545) so updates modify existing calendar events instead of being ignored
    let sequenceNumber = 0
    if (event?.id && event.id !== 'test-calendar-event') {
      try {
        const { count } = await supabaseAdmin
          .from('coordination_logs')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id)
          .eq('channel', 'email')
        sequenceNumber = Math.max(0, count || 0)
      } catch (_) {
        sequenceNumber = 1
      }
    }

    const attendeesIcs = uniqueRecipients.map(r => 
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${(r.name || r.email).replace(/[;:,"]/g, '')}":mailto:${r.email}`
    ).join('\r\n')

    const icsContent = [
      'BEGIN:VCALENDAR',
      'PRODID:-//IP Adjusting Group//IP Scheduling Manager//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${event.id}@ipadjustinggroup.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}`,
      `ORGANIZER;CN="IP Scheduling":mailto:${smtpUser}`,
      attendeesIcs,
      `DTSTART;TZID=${ianaTz}:${dtStartIcs}`,
      `DTEND;TZID=${ianaTz}:${dtEndIcs}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc.replace(/\n/g, '\\n')}`,
      `LOCATION:${event.location || ''}`,
      'STATUS:CONFIRMED',
      `SEQUENCE:${sequenceNumber}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n')

    // Google Calendar Direct Web Link
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStartIcs}/${dtEndIcs}&ctz=${ianaTz}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(event.location || '')}`

    // 4. Send email via Google SMTP (Nodemailer)
    if (!smtpPass) {
      console.warn("GMAIL_SMTP_PASSWORD not set. Skipping actual email send.")
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Simulated success (No Google SMTP credentials configured)",
        googleCalendarUrl,
        recipients: uniqueRecipients.map(r => r.email)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass }
    })

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Confirmed: ${eventType} | ${insuredName} - Claim #${claimNumber}</title>
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
    a[x-apple-data-detectors] {
      color: #ffffff !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    .footer a, .footer a span, .footer span {
      color: #ffffff !important;
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#d6d9e0; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#d6d9e0">
    <tr>
      <td align="center" style="padding: 25px 0;">

        <!-- Container (600px) -->
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#F0F0F0" style="border-radius:8px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.12); background-color:#F0F0F0;">

          <!-- BRAND HEADER -->
          <tr>
            <td align="center" bgcolor="#F0F0F0" style="padding:22px 20px 18px 20px; border-bottom:3px solid #0071bc; background-color:#F0F0F0;">
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
              
              <p style="margin:0 0 14px 0; font-size:16px;">Dear <strong>${insuredName}</strong>,</p>
              
              <p style="margin:0 0 16px 0;">
                Your upcoming <strong>${eventType}</strong> for Claim <strong>#${claimNumber}</strong> has been officially confirmed and scheduled. Below are the details for your appointment:
              </p>

              <!-- APPOINTMENT DETAILS CARD -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#ffffff; border-left:4px solid #0071bc; border-radius:4px; padding:18px;">
                <tr>
                  <td>
                    <div style="font-size:12px; font-weight:bold; color:#0071bc; text-transform:uppercase; margin-bottom:10px;">
                      ✓ Confirmed Appointment Details
                    </div>
                    <div style="font-size:14px; color:#111827; line-height:1.8;">
                      <strong>📅 Date:</strong> ${event.final_date}<br>
                      <strong>⏰ Time Window:</strong> ${(event.final_start_time || '').slice(0, 5)} - ${(event.final_end_time || '').slice(0, 5)} (${tzLabel})<br>
                      <strong>📍 Location:</strong> ${event.location || event.claim?.property_address || 'N/A'}<br>
                      <strong>Claim Number:</strong> ${claimNumber}<br>
                      <strong>Insured Client:</strong> ${insuredName}<br>
                      <strong>Insurance Carrier:</strong> ${event.claim?.carrier || 'Carrier'}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- GOOGLE CALENDAR BUTTON -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 16px 0;">
                <tr>
                  <td align="center" style="background-color:#0071bc; border-radius:6px; padding:14px 22px;">
                    <a href="${googleCalendarUrl}" target="_blank" style="color:#ffffff; font-size:15px; font-weight:bold; text-decoration:none; display:inline-block;">
                      📅 Add to Google Calendar →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- NOTE ABOUT ICS FILE -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#e0f2fe; border:1px solid #bae6fd; border-radius:6px; padding:12px 16px;">
                <tr>
                  <td style="font-size:13px; color:#0369a1; line-height:1.5;">
                    📎 <strong>Calendar Invite Attached (.ics):</strong> An official calendar file is attached to this email. You can open it to automatically sync with Apple Calendar, Microsoft Outlook, or Google Calendar.
                  </td>
                </tr>
              </table>

              <!-- CLOSING -->
              <p style="margin:20px 0 4px 0; color:#004E91;">Stay safe,</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#004E91; font-size:16px;">Iván Hernández</p>
              <p style="margin:0 0 2px 0; color:#555555; font-size:14px;">Owner | Public Adjuster</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#0071bc; font-size:14px;">IP Adjusting Group LLC</p>
              <p style="margin:0 0 15px 0; color:#666666; font-style:italic; font-size:13px;">Advocating for what’s yours</p>

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

              <!-- Dirección y contacto -->
              <p style="margin:20px 0 10px 0; font-size:13px; color:#ffffff !important; line-height:1.6;">
                <a href="https://maps.google.com/?q=1729+NW+Saint+Lucie+West+Blvd+%231269,+Port+Saint+Lucie+FL,+34986" target="_blank" style="color:#ffffff !important; text-decoration:none !important; font-weight:normal;">
                  <span style="color:#ffffff !important; text-decoration:none !important;">1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986</span>
                </a>
                <br>
                <a href="mailto:admin@ipadjustinggroup.com" style="color:#ffffff !important; text-decoration:underline !important; font-weight:normal;">
                  <span style="color:#ffffff !important; text-decoration:underline !important;">admin@ipadjustinggroup.com</span>
                </a>
                <span style="color:#ffffff !important;"> | </span>
                <a href="tel:17722820862" style="color:#ffffff !important; text-decoration:none !important; font-weight:normal;">
                  <span style="color:#ffffff !important; text-decoration:none !important;">(772) 282-0862</span>
                </a>
              </p>

              <!-- Texto legal -->
              <p style="margin:15px 25px 0px 25px; font-size:9px; color:#e0f2fe; line-height:1.3;">
                IP Adjusting Group is a licensed public adjusting firm proudly serving homeowners and business owners across Florida. The information in this email is meant to be general in nature and should not be taken as legal or insurance advice. For specific guidance about your policy or claim, please reach out to your licensed insurance professional or attorney.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

    const mailOptions = {
      from: `"IP Scheduling" <${smtpUser}>`,
      to: uniqueRecipients.map(r => r.email).join(', '),
      subject: `${isTest ? '[TEST PREVIEW] ' : ''}Confirmed: ${eventType} | ${insuredName} - Claim #${claimNumber}`,
      html: htmlBody,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent
      }
    }

    try {
      const info = await transporter.sendMail(mailOptions)
      return new Response(JSON.stringify({ 
        success: true, 
        messageId: info.messageId,
        googleCalendarUrl,
        sentTo: uniqueRecipients.map(r => r.email)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } catch (mailErr: any) {
      console.warn("⚠️ Google SMTP delivery failed:", mailErr.message)
      return new Response(JSON.stringify({ 
        success: false, 
        warning: `Google SMTP rejected login or dispatch: ${mailErr.message}`,
        googleCalendarUrl,
        recipients: uniqueRecipients.map(r => r.email)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
  } catch (error: any) {
    console.error("Error in send-calendar-invite:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

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
    const { 
      eventId, 
      cancelledBy, 
      cancellationReason, 
      previousDate, 
      previousStartTime, 
      previousEndTime 
    } = await req.json()

    if (!eventId) throw new Error("eventId is required")

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Event, Claim, Insured, PA, Carrier Reps, and Participants
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select(`
        *,
        claim:claims (
          *,
          insured:insureds (*),
          public_adjuster:public_adjusters (*),
          carrier_reps:claim_carrier_representatives (
            *,
            carrier_rep:carrier_representatives (*)
          )
        )
      `)
      .eq('id', eventId)
      .single()

    if (eventErr || !event) throw eventErr || new Error("Event not found")

    // 2. Fetch event participants
    const { data: participants } = await supabaseAdmin
      .from('event_participants')
      .select(`*, carrier_rep:carrier_representatives(email, name), external_actor:external_actors(email, name)`)
      .eq('event_id', eventId)

    const claim = event.claim
    const insured = claim?.insured
    const pa = claim?.public_adjuster
    const claimNumber = claim?.claim_number || 'N/A'
    const insuredName = insured?.name || 'Insured Client'
    const carrier = claim?.carrier || 'Carrier'
    const propertyAddress = claim?.property_address || event.location || 'N/A'
    const eventType = event.event_type || 'Inspection'

    // Determine cancelled date/time info
    const cancelDate = previousDate || event.final_date
    const cancelStartTime = (previousStartTime || event.final_start_time || '').slice(0, 5)
    const cancelEndTime = (previousEndTime || event.final_end_time || '').slice(0, 5)

    // 3. Collect unique email recipients
    const emailRecipients: { email: string, name: string }[] = []
    if (insured?.email) emailRecipients.push({ email: insured.email, name: insuredName })
    if (pa?.email) emailRecipients.push({ email: pa.email, name: pa?.name || 'Public Adjuster' })

    // Carrier reps from claim
    for (const cr of (claim?.carrier_reps || [])) {
      if (cr.carrier_rep?.email) emailRecipients.push({ email: cr.carrier_rep.email, name: cr.carrier_rep.name })
    }

    // Additional event participants
    for (const p of (participants || [])) {
      if (p.custom_email) emailRecipients.push({ email: p.custom_email, name: p.custom_name || 'Participant' })
      if (p.carrier_rep?.email) emailRecipients.push({ email: p.carrier_rep.email, name: p.carrier_rep.name })
      if (p.external_actor?.email) emailRecipients.push({ email: p.external_actor.email, name: p.external_actor.name })
    }

    const uniqueRecipients = Array.from(new Map(emailRecipients.filter(r => r.email && r.email.includes('@')).map(i => [i.email.toLowerCase().trim(), i])).values())

    if (uniqueRecipients.length === 0) {
      console.log("No valid email recipients for cancellation notice.")
      return new Response(JSON.stringify({ 
        success: false, 
        message: "No email recipients found for this claim/event." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // 4. Build .ics cancellation attachment if there was a scheduled date
    const attachments: any[] = []
    if (cancelDate) {
      const formatIcsDate = (dateStr: string, timeStr: string) => {
        const d = new Date(`${dateStr}T${timeStr || '00:00:00'}`)
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      }
      const dtStart = formatIcsDate(cancelDate, previousStartTime || event.final_start_time || '09:00:00')
      const dtEnd = formatIcsDate(cancelDate, previousEndTime || event.final_end_time || '11:00:00')
      const icsTitle = `CANCELLED: ${eventType} - Claim ${claimNumber}`
      const icsDesc = `${eventType} appointment has been cancelled and returned to rescheduling.\nReason: ${cancellationReason || 'Reschedule requested'}\nCancelled by: ${cancelledBy || 'General'}`

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//IP Scheduling Manager//EN',
        'METHOD:CANCEL',
        'BEGIN:VEVENT',
        `UID:${event.id}@ipscheduling.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}`,
        `STATUS:CANCELLED`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${icsTitle}`,
        `DESCRIPTION:${icsDesc.replace(/\n/g, '\\n')}`,
        `LOCATION:${propertyAddress}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n')

      attachments.push({
        filename: 'invite-cancelled.ics',
        content: icsContent,
        contentType: 'text/calendar; method=CANCEL'
      })
    }

    const subject = `Notice: ${eventType} Cancelled / Rescheduling | ${insuredName} - Claim #${claimNumber}`

    const plainText = `NOTICE OF ${eventType.toUpperCase()} CANCELLATION & RESCHEDULING

Dear Parties,

Please be advised that the ${eventType.toLowerCase()} scheduled for Claim #${claimNumber} has been cancelled and returned to rescheduling.

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Insurance Carrier: ${carrier}
- Property Address: ${propertyAddress}
- Event Type: ${eventType}
${cancelDate ? `- Previous Scheduled Date: ${cancelDate} (${cancelStartTime} - ${cancelEndTime})\n` : ''}- Cancelled By / Requested By: ${cancelledBy || 'General'}
- Reason / Notes: ${cancellationReason || 'Rescheduling requested.'}

NEXT STEPS:
Our scheduling coordination team at IP Adjusting Group is actively working to coordinate new available dates with all parties. Updated options will be provided as soon as they are arranged.

If you have any questions, please contact our office at (772) 282-0862 or admin@ipadjustinggroup.com.

Best regards,
IP Scheduling Coordination Team
IP Adjusting Group LLC
1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
`

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Notice: ${eventType} Cancelled</title>
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
            <td align="center" bgcolor="#ffffff" style="padding:22px 20px 18px 20px; border-bottom:3px solid #dc2626;">
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
            <td class="content" style="padding:28px 40px 15px 40px; font-size:15px; color:#1e293b; line-height:1.6; font-family:Arial, Helvetica, sans-serif; background-color:#F0F0F0;">
              
              <!-- CANCELLATION NOTICE BANNER -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:14px 18px;">
                <tr>
                  <td>
                    <div style="font-size:15px; font-weight:bold; color:#b91c1c;">
                      ⚠️ Notice of Cancellation & Rescheduling
                    </div>
                    <div style="font-size:13px; color:#7f1d1d; margin-top:4px; line-height:1.5;">
                      The scheduled ${eventType.toLowerCase()} for <strong>Claim #${claimNumber}</strong> has been cancelled and returned to the coordination stage for rescheduling.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CLAIM & CANCELLATION DETAILS BOX -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#ffffff; border-left:4px solid #dc2626; border-radius:4px; padding:16px;">
                <tr>
                  <td>
                    <div style="font-size:12px; font-weight:bold; color:#b91c1c; text-transform:uppercase; margin-bottom:8px;">
                      Claim & Cancellation Details
                    </div>
                    <div style="font-size:14px; color:#111827; line-height:1.7;">
                      <strong>Claim Number:</strong> ${claimNumber}<br>
                      <strong>Insured:</strong> ${insuredName}<br>
                      <strong>Insurance Carrier:</strong> ${carrier}<br>
                      <strong>Property Address:</strong> ${propertyAddress}<br>
                      <strong>Event Type:</strong> ${eventType}<br>
                      ${cancelDate ? `<strong>Cancelled Appointment:</strong> 📅 ${cancelDate} (${cancelStartTime} - ${cancelEndTime})<br>` : ''}
                      <strong>Cancelled By / Requested By:</strong> ${cancelledBy || 'General'}<br>
                      <strong>Reason / Notes:</strong> ${cancellationReason || 'Rescheduling requested.'}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- NEXT STEPS BOX -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#ffffff; border-radius:6px; border:1px solid #d1d5db; padding:16px;">
                <tr>
                  <td>
                    <div style="font-size:13px; font-weight:bold; color:#004E91; margin-bottom:6px;">
                      🔄 What are the next steps?
                    </div>
                    <div style="font-size:13px; color:#475569; line-height:1.5;">
                      Our coordination team at <strong>IP Adjusting Group</strong> is actively working to arrange new available dates between the carrier and the public adjuster. We will reach out with updated options shortly.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 5px 0; font-size:14px; color:#004E91;">Sincerely,</p>
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

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER')
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD')

    if (!smtpUser || !smtpPass) {
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

    const recipientList = uniqueRecipients.map(r => r.email).join(', ')

    const mailOptions = {
      from: `"IP Adjusting Group" <${smtpUser}>`,
      to: recipientList,
      subject: subject,
      text: plainText,
      html: htmlBody,
      attachments: attachments
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Cancellation notice successfully sent to:", recipientList, "Message ID:", info.messageId)

    // Log to coordination_logs
    await supabaseAdmin.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'all_parties',
      contact_target_name: 'All Participants',
      channel: 'email',
      notes: `📧 Cancellation notice email sent to: [${recipientList}]. Reason: ${cancellationReason || 'Rescheduling requested'}.`
    })

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: info.messageId, 
      recipients: recipientList 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error("Error in send-cancellation-notice:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})

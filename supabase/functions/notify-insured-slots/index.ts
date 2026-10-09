// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.13"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildRedirectResponse({
  role = 'insured',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  const url = new URL(req.url)
  const functionUrl = `${supabaseUrl}/functions/v1/notify-insured-slots`

  // =========================================================================
  // 1. GET HANDLER: 1-CLICK CONFIRMATION DIRECTLY FROM THE INSURED'S EMAIL
  // =========================================================================
  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'confirm'
    const eventId = url.searchParams.get('eventId')
    const slotId = url.searchParams.get('slotId')

    if (!eventId || !slotId) {
      return buildRedirectResponse({
        role: 'insured',
        status: 'error',
        title: "Missing Parameters",
        message: "No valid event or date option was specified in the confirmation link."
      })
    }

    try {
      // Fetch Event, Claim, Insured, PA, and Slots
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
          role: 'insured',
          status: 'error',
          title: "Inspection Not Found",
          message: "We could not locate this inspection event in our system."
        })
      }

      const claim = event.claim
      const insuredName = claim?.insured?.name || 'Insured Client'
      const claimNumber = claim?.claim_number || 'N/A'
      const carrier = claim?.carrier || 'Carrier'
      const propertyAddress = claim?.property_address || event.location || 'N/A'
      const paName = claim?.public_adjuster?.name || 'Public Adjuster'

      const rawSlots = event.slots || []
      const chosenSlot = rawSlots.find((s: any) => s.id === slotId)

      if (!chosenSlot) {
        return buildRedirectResponse({
          role: 'insured',
          status: 'error',
          title: "Date Option Not Found",
          message: "The requested inspection date could not be found."
        })
      }

      const startTime = chosenSlot.start_time || '09:00:00'
      const endTime = chosenSlot.end_time || '11:00:00'
      const slotDate = chosenSlot.slot_date

      // Mark the chosen slot as insured_chosen
      await supabaseAdmin
        .from('event_slots')
        .update({ status: 'insured_chosen' })
        .eq('id', slotId)

      // Mark other slots as discarded
      await supabaseAdmin
        .from('event_slots')
        .update({ status: 'discarded' })
        .eq('event_id', eventId)
        .neq('id', slotId)

      // Update event to Stage 4 (Confirmed / Scheduled)
      await supabaseAdmin
        .from('events')
        .update({
          coordination_stage: '4_confirmed',
          status: 'scheduled',
          final_date: slotDate,
          final_start_time: startTime,
          final_end_time: endTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId)

      // Audit log
      await supabaseAdmin.from('coordination_logs').insert({
        event_id: eventId,
        contact_target: 'insured',
        contact_target_name: insuredName,
        channel: 'email',
        notes: `✓ 1-Click Email Confirmation: Insured (${insuredName}) selected date: ${slotDate} (${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}). Inspection locked & scheduled.`
      })

      // Automatically trigger calendar invite Edge Function in background
      try {
        const calRes = await fetch(`${supabaseUrl}/functions/v1/send-calendar-invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ eventId })
        })
        console.log("Triggered send-calendar-invite status:", calRes.status)
      } catch (err) {
        console.error("Error triggering send-calendar-invite:", err)
      }

      // Return clean 302 redirect to frontend confirmation portal
      return buildRedirectResponse({
        role: 'insured',
        status: 'success',
        claim: claimNumber,
        insured: insuredName,
        carrier: carrier,
        address: propertyAddress,
        date: slotDate,
        time: `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`
      })

    } catch (err: any) {
      console.error("Error confirming slot from client email:", err)
      return buildRedirectResponse({
        role: 'insured',
        status: 'error',
        title: "Confirmation Error",
        message: err.message || "An unexpected error occurred while confirming your inspection."
      })
    }
  }

  // =========================================================================
  // 2. POST HANDLER: SEND INVITATION EMAIL TO CLIENT WITH 1-CLICK DATES
  // =========================================================================
  try {
    const { eventId } = await req.json()
    if (!eventId) throw new Error("eventId is required")

    // Fetch Event, Claim, Insured, PA, and Slots
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

    if (eventErr || !event) throw eventErr || new Error("Event not found")

    const claim = event.claim
    const insured = claim?.insured
    const insuredEmail = insured?.email
    const insuredName = insured?.name || 'Insured Client'
    const pa = claim?.public_adjuster
    const paName = pa?.name || 'Your Public Adjuster'
    const carrier = claim?.carrier || 'the Insurance Carrier'
    const claimNumber = claim?.claim_number || 'N/A'
    const propertyAddress = claim?.property_address || event.location || 'N/A'
    const eventType = event.event_type || 'Inspection'

    if (!insuredEmail) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: "No email address found for the insured client." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Filter slots approved by PA (status === 'pa_accepted' or proposed fallback)
    const rawSlots = event.slots || []
    let availableSlots = rawSlots.filter((s: any) => s.status === 'pa_accepted')
    if (availableSlots.length === 0) {
      availableSlots = rawSlots.filter((s: any) => s.status === 'proposed')
    }
    const sortedSlots = [...availableSlots].sort((a: any, b: any) => (a.slot_date > b.slot_date ? 1 : -1))

    if (sortedSlots.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "No approved date slots found to offer to the insured."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    let slotsHtml = ''
    let slotsPlainText = ''

    sortedSlots.forEach((slot: any, index: number) => {
      const optNum = index + 1
      const sTime = slot.start_time ? slot.start_time.slice(0, 5) : '09:00'
      const eTime = slot.end_time ? slot.end_time.slice(0, 5) : '11:00'
      const dateStr = slot.slot_date || 'Date pending'
      const confirmLink = `${functionUrl}?action=confirm&eventId=${eventId}&slotId=${slot.id}`

      slotsPlainText += `Option #${optNum}: ${dateStr} from ${sTime} to ${eTime}\n`
      slotsPlainText += `  👉 Click here to confirm this date: ${confirmLink}\n\n`

      slotsHtml += `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px; background-color:#ffffff; border-radius:8px; border:1px solid #d1d5db; overflow:hidden;">
          <tr>
            <td style="padding:18px 20px; border-left:6px solid #0071bc;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top">
                    <span style="display:inline-block; font-size:12px; font-weight:bold; background-color:#e0f2fe; color:#0284c7; padding:3px 9px; border-radius:4px; text-transform:uppercase; margin-bottom:6px;">
                      Option #${optNum}
                    </span>
                    <div style="font-size:17px; font-weight:bold; color:#004E91; margin-top:2px;">
                      📅 ${dateStr}
                    </div>
                    <div style="font-size:14px; color:#4b5563; margin-top:3px; font-family:Courier, monospace;">
                      ⏰ ${sTime} - ${eTime}
                    </div>
                  </td>
                  <td align="right" valign="middle" style="padding-left:10px;">
                    <a href="${confirmLink}" target="_blank" style="display:inline-block; background-color:#0071bc; color:#ffffff; font-size:13px; font-weight:bold; text-decoration:none; padding:12px 18px; border-radius:6px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.15);">
                      ✅ Choose This Date
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    })

    const subject = `Action Required: Choose Your Inspection Date | Claim #${claimNumber} (${insuredName})`

    const plainText = `Dear ${insuredName},

The insurance company (${carrier}) has requested an on-site property inspection for your claim at ${propertyAddress}.

Your Public Adjuster, ${paName}, has reviewed the calendar and pre-approved the following ${sortedSlots.length} date options for you:

${slotsPlainText}

Simply click the confirmation link next to the date that works best for your schedule. Once you click, your appointment will be immediately confirmed and locked on the calendar.

If you have any questions, please contact our office at (772) 282-0862.

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
  <title>Choose Your Inspection Date</title>
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
              
              <p style="margin:0 0 14px 0; font-size:16px;">Dear <strong>${insuredName}</strong>,</p>
              
              <p style="margin:0 0 16px 0;">
                The insurance company (<strong>${carrier}</strong>) has scheduled an upcoming property inspection for your claim. Your Public Adjuster, <strong>${paName}</strong>, has coordinated and pre-approved the following <strong>${sortedSlots.length} available dates</strong> for you:
              </p>

              <!-- CLAIM SUMMARY BOX -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#ffffff; border-left:4px solid #0071bc; border-radius:4px; padding:16px;">
                <tr>
                  <td>
                    <div style="font-size:12px; font-weight:bold; color:#0071bc; text-transform:uppercase; margin-bottom:8px;">
                      Claim & Property Information
                    </div>
                    <div style="font-size:14px; color:#111827; line-height:1.7;">
                      <strong>Claim Number:</strong> ${claimNumber}<br>
                      <strong>Insurance Carrier:</strong> ${carrier}<br>
                      <strong>Property Address:</strong> ${propertyAddress}<br>
                      <strong>Inspection Type:</strong> ${eventType}<br>
                      <strong>Public Adjuster:</strong> ${paName}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- INSTRUCTIONS BANNER -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px; background-color:#e0f2fe; border:1px solid #bae6fd; border-radius:6px; padding:12px 16px;">
                <tr>
                  <td>
                    <div style="font-size:13px; color:#0369a1; font-weight:bold; line-height:1.4;">
                      👉 Please select 1 of the options below to confirm your inspection:
                    </div>
                    <div style="font-size:12px; color:#075985; margin-top:3px; line-height:1.4;">
                      Click the blue <strong>"Choose This Date"</strong> button on your preferred date. No password or app login is required.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- PROPOSED DATES SECTION -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td style="border-bottom:2px solid #0071bc; padding-bottom:6px;">
                    <span style="font-size:16px; font-weight:bold; color:#004E91;">
                      Available Inspection Dates:
                    </span>
                  </td>
                </tr>
              </table>

              ${slotsHtml}

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

    const mailOptions = {
      from: `"IP Adjusting Group" <${smtpUser}>`,
      to: insuredEmail,
      subject: subject,
      text: plainText,
      html: htmlBody
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Email to Insured successfully sent:", info.messageId)

    await supabaseAdmin.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'insured',
      contact_target_name: insuredName,
      channel: 'email',
      notes: `📧 Email notification sent to Insured (${insuredEmail}) with ${sortedSlots.length} pre-approved dates.`
    })

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: info.messageId, 
      recipient: insuredEmail 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error("Error in notify-insured-slots:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})

// =========================================================================
// HTML TEMPLATE: INSURED CONFIRMATION SUCCESS SCREEN
// =========================================================================
function renderClientConfirmationSuccessHtml({
  claimNumber,
  insuredName,
  carrier,
  propertyAddress,
  paName,
  date,
  startTime,
  endTime
}: any) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspection Confirmed | IP Adjusting Group</title>
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
        <div style="font-size:46px; margin-bottom:8px;">✅</div>
        <h2 style="margin:0 0 6px 0; color:#0f172a; font-size:22px;">Inspection Confirmed!</h2>
        <p style="margin:0; color:#64748b; font-size:14px;">Thank you, <strong>${insuredName}</strong>. Your property inspection is now scheduled.</p>
      </div>

      <!-- Confirmed Appointment Card -->
      <div style="background-color:#f0fdf4; border:2px solid #86efac; border-radius:10px; padding:18px; margin-bottom:20px; text-align:center;">
        <div style="font-size:12px; font-weight:bold; color:#166534; text-transform:uppercase; letter-spacing:0.5px;">
          Confirmed Appointment Date & Time
        </div>
        <div style="font-size:22px; font-weight:bold; color:#14532d; margin-top:6px;">
          📅 ${date}
        </div>
        <div style="font-size:16px; color:#15803d; font-family:Courier, monospace; margin-top:4px;">
          ⏰ ${startTime} - ${endTime}
        </div>
      </div>

      <!-- Claim & Location Details -->
      <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:18px; font-size:13px; line-height:1.7;">
        <div><strong>Claim Number:</strong> ${claimNumber}</div>
        <div><strong>Insurance Company:</strong> ${carrier}</div>
        <div><strong>Property Address:</strong> ${propertyAddress}</div>
        <div><strong>Public Adjuster:</strong> ${paName}</div>
      </div>

      <div style="background-color:#eff6ff; border-left:4px solid #0284c7; padding:12px 16px; border-radius:4px; margin-top:16px; font-size:13px; color:#0369a1; line-height:1.5;">
        📅 <strong>Calendar Invitation:</strong> A calendar invitation has been generated and sent to your email with all details.
      </div>

      <div style="text-align:center; margin-top:24px;">
        <span style="display:inline-block; font-size:12px; color:#94a3b8;">
          You may safely close this window.
        </span>
      </div>
    </div>
  </div>
</body>
</html>`
}

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

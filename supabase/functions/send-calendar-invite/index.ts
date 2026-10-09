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
    const { eventId } = await req.json()
    if (!eventId) throw new Error("eventId is required")

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Event and Claim details
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select(`*, claim:claims (*, insured:insureds (*), public_adjuster:public_adjusters (*))`)
      .eq('id', eventId)
      .single()

    if (eventErr || !event) throw eventErr || new Error("Event not found")

    // 2. Fetch Participants
    const { data: participants, error: partErr } = await supabaseAdmin
      .from('event_participants')
      .select(`*, carrier_rep:carrier_representatives(email, name), external_actor:external_actors(email, name)`)
      .eq('event_id', eventId)

    if (partErr) throw partErr

    // Collect all emails
    const emailRecipients: { email: string, name: string }[] = []
    if (event.claim?.insured?.email) emailRecipients.push({ email: event.claim.insured.email, name: event.claim.insured.name })
    if (event.claim?.public_adjuster?.email) emailRecipients.push({ email: event.claim.public_adjuster.email, name: event.claim.public_adjuster.name })
    
    for (const p of (participants || [])) {
      if (p.custom_email) emailRecipients.push({ email: p.custom_email, name: p.custom_name || 'Participant' })
      if (p.carrier_rep?.email) emailRecipients.push({ email: p.carrier_rep.email, name: p.carrier_rep.name })
      if (p.external_actor?.email) emailRecipients.push({ email: p.external_actor.email, name: p.external_actor.name })
    }

    const uniqueRecipients = Array.from(new Map(emailRecipients.filter(r => r.email).map(item => [item.email, item])).values())
    if (uniqueRecipients.length === 0) {
      return new Response(JSON.stringify({ message: "No participants with emails found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // 3. Generate Dates & .ics content
    const formatIcsDate = (dateStr: string, timeStr: string) => {
      const d = new Date(`${dateStr}T${timeStr}`)
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }
    const dtStart = formatIcsDate(event.final_date, event.final_start_time || '00:00:00')
    const dtEnd = formatIcsDate(event.final_date, event.final_end_time || '23:59:59')
    const insuredName = event.claim?.insured?.name || 'Insured Client'
    const claimNumber = event.claim?.claim_number || 'N/A'
    const eventType = event.event_type || 'Inspection'
    const title = `${eventType} Confirmed | ${insuredName} - Claim #${claimNumber}`
    const desc = `Address: ${event.claim?.property_address}\nLocation: ${event.location}\nClaim Number: ${claimNumber}\nCarrier: ${event.claim?.carrier}\nInsured: ${insuredName}`

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IP Scheduling Manager//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${event.id}@ipscheduling.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc.replace(/\n/g, '\\n')}`,
      `LOCATION:${event.location}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')

    // Google Calendar Link
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(event.location || '')}`

    // 4. Send email via Google SMTP (Nodemailer)
    const smtpUser = Deno.env.get('GMAIL_SMTP_USER') // e.g. you@gmail.com
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD') // e.g. App Password

    if (!smtpUser || !smtpPass) {
      console.warn("GMAIL_SMTP_USER or GMAIL_SMTP_PASSWORD not set. Skipping actual email send.")
      return new Response(JSON.stringify({ message: "Simulated success (No Google SMTP credentials)" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass }
    })

    const mailOptions = {
      from: `"IP Scheduling" <${smtpUser}>`,
      to: uniqueRecipients.map(r => r.email).join(', '),
      subject: `Confirmed: ${eventType} | ${insuredName} - Claim #${claimNumber}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #0f766e;">Inspection Scheduled</h2>
          <p>The inspection has been confirmed for <strong>${event.final_date}</strong> between <strong>${event.final_start_time?.slice(0, 5)}</strong> and <strong>${event.final_end_time?.slice(0, 5)}</strong>.</p>
          <p>Location: ${event.location}</p>
          <p>
            <a href="${googleCalendarUrl}" target="_blank" style="display: inline-block; padding: 10px 15px; background-color: #4285F4; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
              📅 Add to Google Calendar
            </a>
          </p>
          <p style="font-size: 12px; color: #666; margin-top: 20px;">
            A calendar invitation (.ics) is also attached to this email. You can open it to add it to Apple Calendar, Outlook, or Google Calendar.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: 'invite.ics',
          content: icsContent,
          contentType: 'text/calendar'
        }
      ]
    }

    const info = await transporter.sendMail(mailOptions)

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error("Error in send-calendar-invite:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

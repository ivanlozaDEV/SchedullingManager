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
    const cleanDate = (event.final_date || '').replace(/-/g, '')
    const cleanStartTime = (event.final_start_time || '09:00:00').slice(0, 8).replace(/:/g, '').padEnd(6, '0')
    const cleanEndTime = (event.final_end_time || '11:00:00').slice(0, 8).replace(/:/g, '').padEnd(6, '0')
    const dtStartIcs = `${cleanDate}T${cleanStartTime}`
    const dtEndIcs = `${cleanDate}T${cleanEndTime}`

    const insuredName = event.claim?.insured?.name || 'Insured Client'
    const claimNumber = event.claim?.claim_number || 'N/A'
    const eventType = event.event_type || 'Inspection'
    const title = `${eventType} Confirmed | ${insuredName} - Claim #${claimNumber}`
    const desc = `Address: ${event.claim?.property_address || ''}\nLocation: ${event.location || ''}\nClaim Number: ${claimNumber}\nCarrier: ${event.claim?.carrier || ''}\nInsured: ${insuredName}`

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER') || 'no-reply@ipadjustinggroup.com'
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD')

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
      `DTSTART;TZID=America/New_York:${dtStartIcs}`,
      `DTEND;TZID=America/New_York:${dtEndIcs}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc.replace(/\n/g, '\\n')}`,
      `LOCATION:${event.location || ''}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n')

    // Google Calendar Direct Web Link
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStartIcs}/${dtEndIcs}&ctz=America/New_York&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(event.location || '')}`

    // 4. Send email via Google SMTP (Nodemailer)
    if (!smtpPass) {
      console.warn("GMAIL_SMTP_PASSWORD not set. Skipping actual email send.")
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
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #1187AA 0%, #0C6079 100%); padding: 22px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 800; letter-spacing: 0.5px;">IP ADJUSTING GROUP</h1>
            <p style="margin: 3px 0 0 0; color: rgba(255,255,255,0.9); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Inspection Coordination & Scheduling</p>
          </div>
          <div style="padding: 24px;">
            <div style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; color: #15803d; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-bottom: 12px;">
              ✓ ${eventType} Confirmed
            </div>
            <h2 style="margin: 0 0 14px 0; color: #0f172a; font-size: 20px;">${eventType} Scheduled</h2>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 18px; line-height: 1.6; font-size: 14px;">
              <div><strong>📅 Date:</strong> ${event.final_date}</div>
              <div><strong>⏰ Time Window:</strong> ${(event.final_start_time || '').slice(0, 5)} - ${(event.final_end_time || '').slice(0, 5)} (Eastern Time)</div>
              <div><strong>📍 Location:</strong> ${event.location || event.claim?.property_address || 'N/A'}</div>
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
                <div><strong>Claim #:</strong> ${claimNumber}</div>
                <div><strong>Insured:</strong> ${insuredName}</div>
                <div><strong>Carrier:</strong> ${event.claim?.carrier || 'Carrier'}</div>
              </div>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <a href="${googleCalendarUrl}" target="_blank" style="display: inline-block; padding: 11px 22px; background-color: #1187AA; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                📅 Open in Google Calendar
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; margin: 16px 0 0 0; text-align: center; line-height: 1.5;">
              A formal calendar invitation is attached to automatically sync this appointment with Google Calendar, Apple Calendar, or Outlook.
            </p>
          </div>
        </div>
      `,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent
      }
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

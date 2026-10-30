import { useState } from 'react';
import { Mail, X, Send, Eye, FileText, CheckCircle2, Calendar, MapPin, Building, User, AlertCircle } from 'lucide-react';
import type { CoordinationEvent } from '../types';
import { detectPropertyTimezone, formatUsDate, resolveCityName, format12Hour, buildCalendarSubject } from '../lib/timezoneUtils';
import { hasEventSentCalendarNotice } from '../lib/schedulingService';
import { getGoogleCalendarUrl } from '../lib/slaUtils';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CoordinationEvent;
  type?: 'selection_options' | 'calendar_update' | 'calendar_confirmation';
  isUpdate?: boolean;
  onConfirmSend: () => Promise<void>;
  isSending?: boolean;
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  event,
  type = 'selection_options',
  isUpdate,
  onConfirmSend,
  isSending = false,
}: EmailPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'plain'>('visual');

  if (!isOpen) return null;

  // An event is ONLY an update if calendar invitations have already been sent previously
  // or if explicitly marked as an update / rescheduled. If invites were never sent yet, it is the initial Confirmation.
  const hasEverSentInvites = hasEventSentCalendarNotice(event);
  const isCalendarUpdate = 
    Boolean(isUpdate) || 
    event.status === 'rescheduled' || 
    (type === 'calendar_update' && hasEverSentInvites);
  const actionPrefix = isCalendarUpdate ? 'Update:' : 'Confirmed:';
  const actionLabel = isCalendarUpdate ? 'Update' : 'Confirmed';

  const claim = event.claim;
  const insured = claim?.insured;
  const assignedEventPa = event.publicAdjuster || (event.participants || []).find((p) => p.participantType === 'public_adjuster' && (!p.roleType || p.roleType === 'actor'))?.publicAdjuster;
  const pa = assignedEventPa || claim?.publicAdjuster;
  const eventType = event.eventType || 'Inspection';
  const claimNumber = claim?.claimNumber || 'N/A';
  const carrier = claim?.carrier || 'Insurance Carrier';
  const propertyAddress = claim?.propertyAddress || event.location || 'N/A';
  const insuredName = insured?.name || 'Insured Client';
  const insuredEmail = insured?.email || '';
  const paName = pa?.name || 'Your Public Adjuster';

  // Thoroughly strip internal tracking bracket tags from notes
  const cleanNotes = (event.notes || '')
    .replace(/\[CoordinationOrder:[^\]]*\]/gi, '')
    .replace(/\[CoordinationSequence:[^\]]*\]/gi, '')
    .replace(/\[SlotsOriginator:[^\]]*\]/gi, '')
    .replace(/\[Timezone:[^\]]*\]/gi, '')
    .replace(/\[Stage:[^\]]*\]/gi, '')
    .replace(/\[Status:[^\]]*\]/gi, '')
    .trim();

  // Available slots for Stage 3 (selection_options)
  const rawSlots = event.slots || [];
  const approvedSlots = rawSlots.filter((s) => s.status === 'pa_accepted');
  const availableSlots = approvedSlots.length > 0 ? approvedSlots : rawSlots.filter((s) => s.status === 'proposed');
  const sortedSlots = [...availableSlots].sort((a, b) => (a.slotDate > b.slotDate ? 1 : -1));

  // Calendar update recipients
  const participants = event.participants || [];
  const otherEmails = participants
    .map((p) => p.customEmail || p.publicAdjuster?.email || p.carrierRep?.email || p.externalActor?.email)
    .filter((em): em is string => Boolean(em && em.trim()));
  const calendarRecipients = Array.from(new Set([insuredEmail, pa?.email, ...otherEmails].filter(Boolean))) as string[];

  // Timezone and City dynamic resolution
  const propertyTz = detectPropertyTimezone(
    `${event.location || ''} ${propertyAddress} ${claim?.city || ''} ${event.notes || ''}`,
    event.timezone as any
  );
  const cityName = resolveCityName(claim?.city, propertyAddress, propertyTz);
  const tzLabel = propertyTz === 'CT' ? `Central Time (CT - ${cityName})` : `Eastern Time (ET - ${cityName})`;

  // 12-hour formatted time helper
  const formatTime12 = (t?: string): string => {
    if (!t) return '';
    return format12Hour(t).toLowerCase();
  };

  const formattedTimeRange = event.finalStartTime
    ? `${formatTime12(event.finalStartTime)}${event.finalEndTime ? ` to ${formatTime12(event.finalEndTime)}` : ''}`
    : '';

  const subject = type === 'selection_options'
    ? `Action Required: Choose your ${eventType} Date - ${insuredName}`
    : buildCalendarSubject({
        actionPrefix,
        eventType,
        insuredName,
        startTime: event.finalStartTime,
        city: claim?.city,
        address: propertyAddress,
        timezone: propertyTz,
        paName: pa?.name,
      });

  const badgeText = type === 'selection_options'
    ? '1-Click Date Selection'
    : isCalendarUpdate
      ? 'Calendar Update'
      : 'Calendar Confirmation';

  const recipientDisplay = type === 'selection_options'
    ? (insuredEmail ? `${insuredName} <${insuredEmail}>` : '⚠️ No email registered for Insured')
    : (calendarRecipients.length > 0 ? calendarRecipients.join(', ') : '⚠️ No recipient emails registered');

  const hasRecipient = type === 'selection_options' ? Boolean(insuredEmail) : calendarRecipients.length > 0;

  // Build complete In-Person Attendees / Coordination Team list
  const attendeeList: { name: string; role?: string; contact?: string }[] = [];
  if (insured?.name) {
    attendeeList.push({
      name: insured.name,
      role: 'Insured Policyholder',
      contact: insured.phone || undefined,
    });
  }
  if (pa?.name) {
    attendeeList.push({
      name: pa.name,
      role: `Public Adjuster (${pa.role ? pa.role.replace(/_/g, ' ') : 'Lead PA'})`,
      contact: [pa.phone, pa.email].filter(Boolean).join(' | ') || undefined,
    });
  }
  for (const p of participants) {
    if (p.publicAdjuster && p.publicAdjusterId !== claim?.publicAdjusterId) {
      attendeeList.push({
        name: p.publicAdjuster.name,
        role: `Support PA (${p.publicAdjuster.role ? p.publicAdjuster.role.replace(/_/g, ' ') : 'Adjuster'})`,
        contact: [p.publicAdjuster.phone, p.publicAdjuster.email].filter(Boolean).join(' | ') || undefined,
      });
    }
    if (p.carrierRep) {
      attendeeList.push({
        name: p.carrierRep.name,
        role: `Insurance Adjuster (${p.carrierRep.company || carrier})`,
        contact: [p.carrierRep.phone, p.carrierRep.email].filter(Boolean).join(' | ') || undefined,
      });
    }
    if (p.externalActor) {
      attendeeList.push({
        name: p.externalActor.name,
        role: `${p.externalActor.typeOfActor || 'Specialist'}${p.externalActor.company ? ` (${p.externalActor.company})` : ''}`,
        contact: [p.externalActor.phone, p.externalActor.email].filter(Boolean).join(' | ') || undefined,
      });
    }
    if (p.customName && !p.publicAdjuster && !p.carrierRep && !p.externalActor) {
      if (p.customName.trim().toLowerCase() !== 'participant') {
        attendeeList.push({
          name: p.customName,
          role: p.roleType === 'actor' ? 'Attendee' : 'Participant',
          contact: [p.customPhone, p.customEmail].filter(Boolean).join(' | ') || undefined,
        });
      }
    }
  }

  // Google Calendar Link
  const googleCalendarUrl = getGoogleCalendarUrl(event);

  const handleSend = async () => {
    if (!hasRecipient) return;
    await onConfirmSend();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]">
        
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-slate-900 via-maroon-950 to-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-tealBrand-600/30 border border-tealBrand-400/40 flex items-center justify-center text-tealBrand-300">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Email Preview & Verification</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-tealBrand-500/20 text-tealBrand-300 border border-tealBrand-500/30">
                  {badgeText}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Verifica el contenido y los destinatarios antes de enviar el correo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* EMAIL METADATA BAR */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 space-y-1.5 text-xs text-slate-700 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-bold text-slate-500 w-16 shrink-0">From:</span>
            <span className="font-medium text-slate-800">
              &quot;IP Adjusting Group&quot; &lt;admin@ipadjustinggroup.com&gt;
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-bold text-slate-500 w-16 shrink-0">To:</span>
            <span className={`font-semibold ${!hasRecipient ? 'text-amber-700 font-bold' : 'text-slate-900'} break-all`}>
              {recipientDisplay}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-bold text-slate-500 w-16 shrink-0">Subject:</span>
            <span className="font-bold text-maroon-900 break-words">{subject}</span>
          </div>

          {/* VIEW SWITCH TABS */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-200 mt-2">
            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('visual')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'visual'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-tealBrand-700" />
                <span>Visual Preview (HTML)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('plain')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'plain'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-slate-600" />
                <span>Plain Text</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
              {type === 'selection_options' ? `${sortedSlots.length} date options included` : 'Calendar .ics attached'}
            </div>
          </div>
        </div>

        {/* EMAIL PREVIEW BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-200/60">
          {!hasRecipient && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">No se puede enviar el correo: </span>
                <span>El destinatario no tiene un correo registrado en el sistema. Por favor agrégalo antes de continuar.</span>
              </div>
            </div>
          )}

          {activeTab === 'visual' ? (
            /* BRANDED HTML EMAIL PREVIEW (1:1 with real sent email) */
            <div className="max-w-xl mx-auto bg-[#F0F0F0] rounded-xl border border-slate-300 shadow-md overflow-hidden text-slate-800 font-sans">
              
              {/* BRAND HEADER */}
              <div className="p-5 bg-[#F0F0F0] border-b-[3px] border-[#0071bc] text-center">
                <img
                  src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l"
                  alt="IP Adjusting Group"
                  className="h-11 mx-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent && !parent.querySelector('.brand-fallback')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'brand-fallback text-sm font-extrabold text-[#0071bc] tracking-wider uppercase';
                      fallback.innerText = 'IP ADJUSTING GROUP';
                      parent.appendChild(fallback);
                    }
                  }}
                />
              </div>

              {/* CONTENT AREA */}
              <div className="p-6 sm:p-8 space-y-4 text-[14px] text-[#004E91] leading-relaxed">
                <p className="font-semibold text-[15px] text-[#004E91]">
                  Dear <span className="font-bold">{insuredName}</span>,
                </p>

                {type === 'selection_options' ? (
                  <>
                    <p>
                      The insurance company (<strong>{carrier}</strong>) has scheduled an upcoming <strong>{eventType}</strong> for your claim. Your Public Adjuster, <strong>{paName}</strong>, has coordinated and pre-approved the following <strong>{sortedSlots.length} available dates</strong> for you:
                    </p>

                    {/* CLAIM SUMMARY CARD */}
                    <div className="bg-white rounded-md border-l-4 border-[#0071bc] p-4 text-xs text-slate-800 space-y-1.5 shadow-xs">
                      <div className="text-[11px] font-bold text-[#0071bc] uppercase tracking-wider mb-1">
                        Claim & Property Information
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span><strong>Carrier:</strong> {carrier}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span><strong>Claim #:</strong> {claimNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate"><strong>Property:</strong> {propertyAddress}</span>
                      </div>
                      {event.accessInstructions && (
                        <div className="pt-1 text-slate-700">
                          <span className="font-bold text-slate-500">📝 Access Instructions: </span>
                          <em>{event.accessInstructions}</em>
                        </div>
                      )}
                      {cleanNotes && (
                        <div className="pt-1 text-slate-700">
                          <span className="font-bold text-slate-500">📋 Notes: </span>
                          <span>{cleanNotes}</span>
                        </div>
                      )}
                    </div>

                    {/* SLOTS LIST */}
                    <div className="space-y-2.5 pt-2">
                      <div className="text-xs font-bold text-[#004E91] uppercase tracking-wider border-b border-[#0071bc]/30 pb-1">
                        Available Date Options:
                      </div>

                      {sortedSlots.length === 0 ? (
                        <div className="text-center py-4 text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
                          No hay fechas aprobadas configuradas en este evento todavía.
                        </div>
                      ) : (
                        sortedSlots.map((slot, idx) => (
                          <div
                            key={slot.id}
                            className="bg-white rounded-lg border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-[#0071bc] transition-colors"
                          >
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-[#0071bc] border border-blue-200">
                                Option #{idx + 1}
                              </span>
                              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 pt-1">
                                <Calendar className="w-3.5 h-3.5 text-tealBrand-700" />
                                <span>{formatUsDate(slot.slotDate)}</span>
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                ⏰ {formatTime12(slot.startTime)} - {formatTime12(slot.endTime)}
                              </div>
                            </div>

                            <div className="self-end sm:self-center">
                              <button
                                type="button"
                                disabled
                                className="bg-[#0071bc] text-white text-xs font-bold px-4 py-2 rounded-md shadow-xs opacity-95 cursor-default flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm Date Option #{idx + 1}</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  /* FULL CALENDAR UPDATE / CONFIRMATION PREVIEW (1:1 with send-calendar-invite edge function) */
                  <>
                    <p>
                      {isCalendarUpdate ? (
                        <>
                          Your upcoming <strong>{eventType}</strong> for Claim <strong>#{claimNumber}</strong> has been officially <strong>updated</strong>. Below are the complete appointment and access details:
                        </>
                      ) : (
                        <>
                          Your upcoming <strong>{eventType}</strong> for Claim <strong>#{claimNumber}</strong> has been officially <strong>confirmed and scheduled</strong>. Below are the complete appointment and access details:
                        </>
                      )}
                    </p>

                    {/* CARD 1: APPOINTMENT DETAILS CARD */}
                    <div className="bg-white rounded-md border-l-4 border-[#0071bc] p-4 text-xs text-slate-900 shadow-xs space-y-2">
                      <div className="text-[11px] font-bold text-[#0071bc] uppercase tracking-wider">
                        ✓ {actionLabel} Appointment Details
                      </div>
                      <div className="space-y-1.5 text-slate-800 leading-relaxed text-[13px]">
                        <div><strong>📅 Date:</strong> {event.finalDate ? formatUsDate(event.finalDate) : 'Date pending'}</div>
                        <div>
                          <strong>⏰ Time Window:</strong>{' '}
                          {formattedTimeRange || `${(event.finalStartTime || '').slice(0, 5)} - ${(event.finalEndTime || '').slice(0, 5)}`} ({tzLabel})
                        </div>
                        <div><strong>📍 Location:</strong> {event.location || propertyAddress}</div>
                        {event.location && event.location !== propertyAddress && (
                          <div><strong>Property Address:</strong> {propertyAddress}</div>
                        )}
                        <div><strong>Claim Number:</strong> #{claimNumber}</div>
                        <div><strong>Insured Client:</strong> {insuredName}</div>
                        <div><strong>Insurance Carrier:</strong> {carrier}</div>
                        {pa?.name && (
                          <div>
                            <strong>Public Adjuster:</strong> {pa.name}
                            {pa.phone ? ` (${pa.phone})` : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CARD 2: PROPERTY ACCESS & ENTRY DETAILS CARD */}
                    {(event.gateCode || event.lockboxCode || event.accessInstructions) && (
                      <div className="bg-white rounded-md border-l-4 border-emerald-500 p-4 text-xs text-slate-900 shadow-xs space-y-2">
                        <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                          🔑 Property Access & Entry Details
                        </div>
                        <div className="space-y-1.5 text-slate-800 leading-relaxed text-[13px]">
                          {event.gateCode && (
                            <div>
                              <strong>🚪 Gate / Community Code:</strong>{' '}
                              <span className="font-mono font-bold bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded border border-emerald-200">
                                {event.gateCode}
                              </span>
                            </div>
                          )}
                          {event.lockboxCode && (
                            <div>
                              <strong>🔐 Lockbox / Key Code:</strong>{' '}
                              <span className="font-mono font-bold bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded border border-emerald-200">
                                {event.lockboxCode}
                              </span>
                            </div>
                          )}
                          {event.accessInstructions && (
                            <div>
                              <strong>📝 Access Instructions:</strong> <em>{event.accessInstructions}</em>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CARD 3: APPOINTMENT NOTES & INSTRUCTIONS CARD */}
                    {cleanNotes && (
                      <div className="bg-white rounded-md border-l-4 border-amber-500 p-4 text-xs text-slate-900 shadow-xs space-y-1.5">
                        <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                          📋 Appointment Notes & Instructions
                        </div>
                        <div className="text-slate-700 text-[13px] leading-relaxed whitespace-pre-wrap">
                          {cleanNotes}
                        </div>
                      </div>
                    )}

                    {/* CARD 4: IN-PERSON ATTENDEES & COORDINATION TEAM CARD */}
                    {attendeeList.length > 0 && (
                      <div className="bg-white rounded-md border-l-4 border-indigo-500 p-4 text-xs text-slate-900 shadow-xs space-y-2">
                        <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                          👥 In-Person Attendees & Coordination Team
                        </div>
                        <div className="space-y-1 text-slate-700 leading-relaxed text-[12px]">
                          {attendeeList.map((a, idx) => (
                            <div key={idx} className="flex items-start gap-1">
                              <span>•</span>
                              <div>
                                <strong className="text-slate-900">{a.name}</strong>
                                {a.role && <span className="text-slate-500"> ({a.role})</span>}
                                {a.contact && <span className="text-blue-600"> — {a.contact}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CARD 5: ADD TO GOOGLE CALENDAR BUTTON */}
                    {googleCalendarUrl && (
                      <div className="my-3 text-center">
                        <a
                          href={googleCalendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 bg-[#0071bc] hover:bg-[#005a96] text-white font-bold text-sm px-6 py-3 rounded-md shadow-xs transition-colors"
                        >
                          <span>📅 Add to Google Calendar →</span>
                        </a>
                      </div>
                    )}

                    {/* CARD 6: NOTE ABOUT ICS ATTACHMENT */}
                    <div className="bg-[#e0f2fe] border border-[#bae6fd] rounded-md p-3 text-xs text-[#0369a1] leading-relaxed">
                      📎 <strong>Calendar Invite Attached (.ics):</strong> An official calendar file is attached to this email. You can open it to automatically sync with Apple Calendar, Microsoft Outlook, or Google Calendar.
                    </div>
                  </>
                )}

                {/* CLOSING & SIGNATURE */}
                <div className="pt-2 text-xs text-[#004E91] space-y-0.5">
                  <p>Stay safe,</p>
                  <p className="font-bold text-[15px] text-[#0071bc] pt-0.5">IP Adjusting Group</p>
                  <p className="text-slate-500 italic text-[12px]">Advocating for what’s yours</p>
                </div>

                {/* SIGNATURE / LOGO */}
                <div className="text-right pt-1 pb-1">
                  <img
                    src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l"
                    alt="IP Adjusters"
                    className="w-32 inline-block object-contain"
                  />
                </div>
              </div>

              {/* RICH EMAIL FOOTER (Identical to send-calendar-invite edge function) */}
              <div className="p-5 bg-[#0071bc] text-white text-center text-xs space-y-3">
                
                {/* Social media links */}
                <div className="flex items-center justify-center gap-6 flex-wrap text-xs">
                  <a
                    href="https://www.instagram.com/ip_adjusting_group/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white underline hover:text-blue-100"
                  >
                    <img
                      src="https://drive.google.com/uc?export=view&id=1eVdlspnkXxuauln84a3TvwX7CkoPzUtN"
                      alt="Instagram"
                      className="w-4 h-4 inline-block object-contain"
                    />
                    <span>Instagram</span>
                  </a>

                  <a
                    href="https://wa.me/17722820862"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white hover:text-blue-100"
                  >
                    <img
                      src="https://drive.google.com/uc?export=view&id=1sNAL_a5ISR1Xa3SFz5DFxsdf5v6Ka7O0"
                      alt="WhatsApp"
                      className="w-4 h-4 inline-block object-contain"
                    />
                    <span>WhatsApp</span>
                  </a>

                  <a
                    href="https://www.ipadjustinggroup.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white underline hover:text-blue-100"
                  >
                    <img
                      src="https://drive.google.com/uc?export=view&id=1OBMR1DYrpf7DEVIGoUGMGSTz9FAlOtsJ"
                      alt="Website"
                      className="w-4 h-4 inline-block object-contain"
                    />
                    <span>Website</span>
                  </a>
                </div>

                {/* Address & contact info */}
                <div className="text-xs text-white leading-relaxed space-y-0.5 pt-1">
                  <a
                    href="https://maps.google.com/?q=1729+NW+Saint+Lucie+West+Blvd+%231269,+Port+Saint+Lucie+FL,+34986"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:underline block"
                  >
                    1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
                  </a>
                  <div>
                    <a href="mailto:admin@ipadjustinggroup.com" className="text-white underline">
                      admin@ipadjustinggroup.com
                    </a>
                    <span> | </span>
                    <a href="tel:17722820862" className="text-white">
                      (772) 282-0862
                    </a>
                  </div>
                </div>

                {/* Legal disclaimer */}
                <p className="text-[10px] text-blue-100 leading-tight pt-1 max-w-lg mx-auto">
                  IP Adjusting Group is a licensed public adjusting firm proudly serving homeowners and business owners across Florida. The information in this email is meant to be general in nature and should not be taken as legal or insurance advice. For specific guidance about your policy or claim, please reach out to your licensed insurance professional or attorney.
                </p>
              </div>

            </div>
          ) : (
            /* PLAIN TEXT VIEW (Full text equivalent of the sent email) */
            <div className="max-w-xl mx-auto bg-slate-900 text-slate-100 rounded-xl p-5 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-sm">
              {type === 'selection_options' ? (
`Subject: ${subject}
To: ${recipientDisplay}

Dear ${insuredName},

The insurance company (${carrier}) has scheduled an upcoming ${eventType} for your claim #${claimNumber}. Your Public Adjuster, ${paName}, has coordinated and pre-approved the following available dates for you:

Claim Number: #${claimNumber}
Carrier: ${carrier}
Property: ${propertyAddress}${cleanNotes ? `\nNotes: ${cleanNotes}` : ''}

${sortedSlots.map((s, idx) => `Option #${idx + 1}: ${formatUsDate(s.slotDate)} from ${formatTime12(s.startTime)} to ${formatTime12(s.endTime)}
👉 Confirm: [1-Click Confirmation Link]`).join('\n\n')}

Stay safe,
IP Adjusting Group
Advocating for what’s yours

1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
Website: https://www.ipadjustinggroup.com`
              ) : (
`Subject: ${subject}
To: ${recipientDisplay}

Dear ${insuredName},

Your upcoming ${eventType} for Claim #${claimNumber} has been officially ${isCalendarUpdate ? 'updated' : 'confirmed and scheduled'}. Below are the complete appointment and access details:

✓ ${actionLabel} Appointment Details:
📅 Date: ${formatUsDate(event.finalDate)}
⏰ Time Window: ${formattedTimeRange} (${tzLabel})
📍 Location: ${event.location || propertyAddress}${event.location && event.location !== propertyAddress ? `\nProperty Address: ${propertyAddress}` : ''}
Claim Number: #${claimNumber}
Insured Client: ${insuredName}
Insurance Carrier: ${carrier}${pa?.name ? `\nPublic Adjuster: ${pa.name}${pa.phone ? ` (${pa.phone})` : ''}` : ''}

${(event.gateCode || event.lockboxCode || event.accessInstructions) ? `🔑 Property Access & Entry Details:
${event.gateCode ? `• Gate Code: ${event.gateCode}\n` : ''}${event.lockboxCode ? `• Lockbox Code: ${event.lockboxCode}\n` : ''}${event.accessInstructions ? `• Access Instructions: ${event.accessInstructions}\n` : ''}` : ''}${cleanNotes ? `📋 Appointment Notes & Instructions:
${cleanNotes}\n\n` : ''}${attendeeList.length > 0 ? `👥 In-Person Attendees & Coordination Team:
${attendeeList.map(a => `• ${a.name}${a.role ? ` (${a.role})` : ''}${a.contact ? ` — ${a.contact}` : ''}`).join('\n')}\n\n` : ''}${googleCalendarUrl ? `📅 Add to Google Calendar: ${googleCalendarUrl}\n\n` : ''}📎 Calendar Invite Attached (.ics): An official calendar file is attached to this email. You can open it to automatically sync with Apple Calendar, Microsoft Outlook, or Google Calendar.

Stay safe,
IP Adjusting Group
Advocating for what’s yours

1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
Instagram: https://www.instagram.com/ip_adjusting_group/
WhatsApp: https://wa.me/17722820862
Website: https://www.ipadjustinggroup.com`
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER ACTIONS */}
        <div className="bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || !hasRecipient}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            {isSending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Enviando correo...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>
                  {type === 'selection_options'
                    ? 'Enviar Opciones por Correo ✉️'
                    : isCalendarUpdate
                      ? 'Confirmar y Enviar Actualización ✉️'
                      : 'Confirmar y Enviar Correo 🚀'}
                </span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

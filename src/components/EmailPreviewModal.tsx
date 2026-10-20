import { useState } from 'react';
import { Mail, X, Send, Eye, FileText, CheckCircle2, Calendar, MapPin, Building, User, AlertCircle } from 'lucide-react';
import type { CoordinationEvent } from '../types';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CoordinationEvent;
  type?: 'selection_options' | 'calendar_update';
  onConfirmSend: () => Promise<void>;
  isSending?: boolean;
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  event,
  type = 'selection_options',
  onConfirmSend,
  isSending = false,
}: EmailPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'plain'>('visual');

  if (!isOpen) return null;

  const claim = event.claim;
  const insured = claim?.insured;
  const pa = claim?.publicAdjuster;
  const eventType = event.eventType || 'Inspection';
  const claimNumber = claim?.claimNumber || 'N/A';
  const carrier = claim?.carrier || 'Insurance Carrier';
  const propertyAddress = claim?.propertyAddress || event.location || 'N/A';
  const insuredName = insured?.name || 'Insured Client';
  const insuredEmail = insured?.email || '';
  const paName = pa?.name || 'Your Public Adjuster';

  const cleanNotes = (event.notes || '')
    .replace(/\[CoordinationSequence:[^\]]*\]/gi, '')
    .replace(/\[SlotsOriginator:[^\]]*\]/gi, '')
    .replace(/\[Timezone:[^\]]*\]/gi, '')
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

  const subject = type === 'selection_options'
    ? `Action Required: Choose your ${eventType} Date - Claim #${claimNumber}`
    : `CALENDAR INVITE: ${eventType} - ${claimNumber} (${event.finalDate || 'Confirmed'})`;

  const recipientDisplay = type === 'selection_options'
    ? (insuredEmail ? `${insuredName} <${insuredEmail}>` : '⚠️ No email registered for Insured')
    : (calendarRecipients.length > 0 ? calendarRecipients.join(', ') : '⚠️ No recipient emails registered');

  const hasRecipient = type === 'selection_options' ? Boolean(insuredEmail) : calendarRecipients.length > 0;

  const handleSend = async () => {
    if (!hasRecipient) return;
    await onConfirmSend();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
        
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
                  {type === 'selection_options' ? '1-Click Date Selection' : 'Calendar Update'}
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
            <span className={`font-semibold ${!hasRecipient ? 'text-amber-700 font-bold' : 'text-slate-900'}`}>
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
        <div className="flex-1 overflow-y-auto p-5 bg-slate-100/70">
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
            /* BRANDED HTML EMAIL PREVIEW */
            <div className="max-w-xl mx-auto bg-[#F0F0F0] rounded-xl border border-slate-300 shadow-sm overflow-hidden text-slate-800 font-sans">
              
              {/* BRAND HEADER */}
              <div className="p-4 bg-[#F0F0F0] border-b-2 border-[#0071bc] text-center">
                <img
                  src="https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l"
                  alt="IP Adjusting Group"
                  className="h-10 mx-auto object-contain"
                  onError={(e) => {
                    // Fallback text if google drive preview is blocked
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
              <div className="p-6 space-y-4 text-[13px] text-[#004E91] leading-relaxed">
                <p className="font-semibold text-sm text-[#004E91]">
                  Dear <span className="font-bold">{insuredName}</span>,
                </p>

                {type === 'selection_options' ? (
                  <>
                    <p>
                      The insurance company (<strong>{carrier}</strong>) has scheduled an upcoming <strong>{eventType}</strong> for your claim. Your Public Adjuster, <strong>{paName}</strong>, has coordinated and pre-approved the following <strong>{sortedSlots.length} available dates</strong> for you:
                    </p>

                    {/* CLAIM SUMMARY CARD */}
                    <div className="bg-white rounded-lg border-l-4 border-[#0071bc] p-3 text-xs text-slate-800 space-y-1 shadow-2xs">
                      <div className="text-[10px] font-bold text-[#0071bc] uppercase tracking-wider mb-1">
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
                        <div className="flex items-center gap-1.5 pt-1 text-slate-700">
                          <span className="font-bold text-slate-500">📝 Access Instructions:</span>
                          <em>{event.accessInstructions}</em>
                        </div>
                      )}
                      {cleanNotes && (
                        <div className="flex items-center gap-1.5 pt-0.5 text-slate-700">
                          <span className="font-bold text-slate-500">📋 Notes:</span>
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
                            className="bg-white rounded-lg border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:border-[#0071bc] transition-colors"
                          >
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-[#0071bc] border border-blue-200">
                                Option #{idx + 1}
                              </span>
                              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 pt-1">
                                <Calendar className="w-3.5 h-3.5 text-tealBrand-700" />
                                <span>{slot.slotDate}</span>
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                ⏰ {slot.startTime.slice(0, 5)} - {slot.endTime.slice(0, 5)}
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
                  /* CALENDAR UPDATE PREVIEW */
                  <>
                    <p>
                      This is an official calendar notification for the upcoming <strong>{eventType}</strong> regarding Claim <strong>#{claimNumber}</strong>.
                    </p>

                    <div className="bg-white rounded-lg border border-emerald-300 p-4 text-xs text-slate-800 space-y-2 shadow-2xs">
                      <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Confirmed Appointment Details</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        📅 {event.finalDate || 'Date pending'} &bull; ⏰ {event.finalStartTime?.slice(0, 5)} - {event.finalEndTime?.slice(0, 5)}
                      </div>
                      <div><strong>Location:</strong> {propertyAddress}</div>
                      {event.location && event.location !== propertyAddress && (
                        <div><strong>Event Location:</strong> {event.location}</div>
                      )}
                      {event.gateCode && (
                        <div><strong>Gate Code:</strong> <span className="font-mono font-bold bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-200">{event.gateCode}</span></div>
                      )}
                      {event.lockboxCode && (
                        <div><strong>Lockbox Code:</strong> <span className="font-mono font-bold bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-200">{event.lockboxCode}</span></div>
                      )}
                      {event.accessInstructions && (
                        <div className="pt-0.5"><strong>Access Instructions:</strong> <em>{event.accessInstructions}</em></div>
                      )}
                      {cleanNotes && (
                        <div className="pt-1.5 border-t border-slate-100 text-slate-700">
                          <strong>Notes:</strong> {cleanNotes}
                        </div>
                      )}
                      {participants.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                          <strong>Coordination Team / Attendees:</strong>
                          <div className="mt-0.5 pl-2 space-y-0.5">
                            {participants.map((p, idx) => {
                              const pName = p.customName || p.publicAdjuster?.name || p.carrierRep?.name || p.externalActor?.name || 'Participant';
                              const pRole = p.roleType === 'actor' ? 'In-person' : 'Notified';
                              return <div key={p.id || idx}>• {pName} ({pRole})</div>;
                            })}
                          </div>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500 pt-1">
                        📎 An RFC-5545 compliant calendar file (<strong>invite.ics</strong>) is attached for 1-click addition to Google Calendar, Apple Calendar, and Outlook.
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-3 text-xs text-[#004E91]">
                  <p>Warm regards,</p>
                  <p className="font-bold">IP Scheduling Coordination Team</p>
                </div>
              </div>

              {/* EMAIL FOOTER */}
              <div className="p-4 bg-[#0071bc] text-white text-center text-[10px] space-y-1">
                <p className="font-medium">1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986</p>
                <p>admin@ipadjustinggroup.com | (772) 282-0862</p>
                <p className="text-[9px] text-blue-100 pt-1">
                  IP Adjusting Group is a licensed public adjusting firm proudly serving homeowners and business owners across Florida.
                </p>
              </div>
            </div>
          ) : (
            /* PLAIN TEXT VIEW */
            <div className="max-w-xl mx-auto bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-sm">
              {type === 'selection_options' ? (
`Subject: ${subject}
To: ${recipientDisplay}

Dear ${insuredName},

The insurance company (${carrier}) has scheduled an upcoming ${eventType} for your claim #${claimNumber}. Your Public Adjuster, ${paName}, has coordinated and pre-approved the following available dates for you:

Property: ${propertyAddress}

${sortedSlots.map((s, idx) => `Option #${idx + 1}: ${s.slotDate} from ${s.startTime.slice(0, 5)} to ${s.endTime.slice(0, 5)}
👉 Click here to confirm: [1-Click Confirmation Link]`).join('\n\n')}

Warm regards,
IP Scheduling Coordination Team
IP Adjusting Group
1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
(772) 282-0862 | admin@ipadjustinggroup.com`
              ) : (
`Subject: ${subject}
To: ${recipientDisplay}

Hello,

This is a calendar notification for the upcoming ${eventType} regarding Claim #${claimNumber}.

Date: ${event.finalDate}
Time: ${event.finalStartTime?.slice(0, 5)} - ${event.finalEndTime?.slice(0, 5)}
Location: ${propertyAddress}
${event.location && event.location !== propertyAddress ? `Event Location: ${event.location}\n` : ''}${event.gateCode ? `Gate Code: ${event.gateCode}\n` : ''}${event.lockboxCode ? `Lockbox Code: ${event.lockboxCode}\n` : ''}${event.accessInstructions ? `Access Instructions: ${event.accessInstructions}\n` : ''}${cleanNotes ? `Notes: ${cleanNotes}\n` : ''}
Calendar file (.ics) attached.

Warm regards,
IP Scheduling Coordination Team`
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
                <span>Confirmar y Enviar Correo 🚀</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

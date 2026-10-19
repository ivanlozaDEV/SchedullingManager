import { useState, useEffect } from 'react';
import { X, Calendar, Clock, CheckCircle2, AlertCircle, Mail, User } from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { formatTimeRangeWithDualTimezone } from '../lib/timezoneUtils';
import type { CoordinationEvent, Claim } from '../types';

interface DirectConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CoordinationEvent;
  claim: Claim;
  onConfirmed: () => void;
}

export function DirectConfirmModal({
  isOpen,
  onClose,
  event,
  claim,
  onConfirmed,
}: DirectConfirmModalProps) {
  const [finalDate, setFinalDate] = useState('');
  const [finalStartTime, setFinalStartTime] = useState('09:00');
  const [finalEndTime, setFinalEndTime] = useState('11:00');
  const [confirmedByActor, setConfirmedByActor] = useState('Coordinator');
  const [notes, setNotes] = useState('');
  const [sendCalendarInvite, setSendCalendarInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && event) {
      // Pre-fill from event or existing slots if available
      const proposedSlot = event.slots && event.slots.length > 0 ? event.slots[0] : null;
      setFinalDate(event.finalDate || proposedSlot?.slotDate || '');
      setFinalStartTime(event.finalStartTime?.slice(0, 5) || proposedSlot?.startTime?.slice(0, 5) || '09:00');
      setFinalEndTime(event.finalEndTime?.slice(0, 5) || proposedSlot?.endTime?.slice(0, 5) || '11:00');
      setNotes(event.notes || '');
      setConfirmedByActor('Coordinator');
      setSendCalendarInvite(false);
      setError(null);
    }
  }, [isOpen, event]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!finalDate) {
      setError('Please enter the confirmed appointment date.');
      return;
    }
    if (!finalStartTime || !finalEndTime) {
      setError('Please specify start time and end time.');
      return;
    }
    if (finalStartTime >= finalEndTime) {
      setError('End time must be later than start time.');
      return;
    }

    setSaving(true);
    try {
      await schedulingService.directConfirmEvent(event.id, {
        finalDate,
        finalStartTime: finalStartTime.length === 5 ? `${finalStartTime}:00` : finalStartTime,
        finalEndTime: finalEndTime.length === 5 ? `${finalEndTime}:00` : finalEndTime,
        confirmedByActor,
        notes: notes.trim() || undefined,
        sendCalendarInvite,
      });

      onConfirmed();
      onClose();
    } catch (err: any) {
      console.error('Error confirming appointment directly:', err);
      setError(err.message || 'Error confirming appointment.');
    } finally {
      setSaving(false);
    }
  };

  const isReschedule = event?.coordinationStage === '4_confirmed';

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1 ${
                isReschedule ? 'bg-tealBrand-100 text-tealBrand-900' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isReschedule ? <Clock className="w-3 h-3 text-tealBrand-700" /> : <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                <span>{isReschedule ? 'Reschedule / Update Time' : 'Fast-Track / Direct Confirmation'}</span>
              </span>
              <span className="text-xs text-slate-500 font-mono font-semibold">{claim.claimNumber}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {isReschedule ? 'Update Appointment Date & Time' : 'Directly Confirm Appointment'}
            </h3>
            <p className="text-xs text-slate-500">
              {isReschedule
                ? 'Update the scheduled date and time for this confirmed inspection.'
                : 'Locks the appointment immediately without going through funnel steps. Advances directly to Confirmed.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick slot shortcuts if event already had proposed slots */}
          {event.slots && event.slots.length > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 block">
                Previous proposed options (click to auto-fill):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {event.slots.map((s, idx) => (
                  <button
                    key={s.id || idx}
                    type="button"
                    onClick={() => {
                      setFinalDate(s.slotDate);
                      setFinalStartTime(s.startTime.slice(0, 5));
                      setFinalEndTime(s.endTime.slice(0, 5));
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-300 px-2 py-1 rounded-md transition-colors shadow-2xs"
                  >
                    📅 {s.slotDate} ({s.startTime.slice(0, 5)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Property Timezone Banner */}
          <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
            event?.timezone === 'CT' 
              ? 'bg-amber-50 border-amber-300 text-amber-950' 
              : 'bg-blue-50 border-blue-200 text-blue-950'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{event?.timezone === 'CT' ? '🏖️' : '🌴'}</span>
              <div>
                <span className="font-bold block">
                  {event?.timezone === 'CT' ? 'Timezone: Pensacola / Panhandle (Central Time - CT)' : 'Timezone: Miami / South Florida (Eastern Time - ET)'}
                </span>
                <span className="text-[11px] opacity-80 block">
                  {event?.timezone === 'CT' 
                    ? '💡 Enter property local time. Equal to +1 hour in Miami.' 
                    : '💡 Times entered are Miami local time (Eastern Time).'}
                </span>
              </div>
            </div>
            <span className="font-bold text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-300 uppercase">
              {event?.timezone === 'CT' ? 'CT' : 'ET'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-maroon-800" />
              <span>Confirmed Date <span className="text-red-500">*</span></span>
            </label>
            <input
              type="date"
              required
              value={finalDate}
              onChange={(e) => setFinalDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-maroon-800" />
                <span>Start Time <span className="text-red-500">*</span></span>
              </label>
              <input
                type="time"
                required
                value={finalStartTime}
                onChange={(e) => setFinalStartTime(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-maroon-800" />
                <span>End Time <span className="text-red-500">*</span></span>
              </label>
              <input
                type="time"
                required
                value={finalEndTime}
                onChange={(e) => setFinalEndTime(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
              />
            </div>
          </div>

          {finalStartTime && finalEndTime && (
            <div className="text-[11px] text-slate-600 font-mono bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-sans">Timezone conversion:</span>
              <strong className="text-tealBrand-800">
                {formatTimeRangeWithDualTimezone(finalStartTime, finalEndTime, event?.timezone || 'ET').displayFull}
              </strong>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-maroon-800" />
              <span>Who was this date agreed with?</span>
            </label>
            <select
              value={confirmedByActor}
              onChange={(e) => setConfirmedByActor(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
            >
              <option value="Carrier / Adjuster">🏢 Agreed with Insurance Carrier / Adjuster</option>
              <option value="Insured / Client">👤 Agreed with Insured / Client</option>
              <option value="Public Adjuster">⚖️ Agreed with Public Adjuster</option>
              <option value="Both Parties (Joint Call)">🤝 Both Parties (Joint Call)</option>
              <option value="Coordinator">Office Coordinator</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional notes or access instructions (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Confirmed by phone with adjuster. Client has lockbox #1234."
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="sendCalendarInvite"
              checked={sendCalendarInvite}
              onChange={(e) => setSendCalendarInvite(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-tealBrand-600 focus:ring-tealBrand-500 cursor-pointer"
            />
            <label htmlFor="sendCalendarInvite" className="text-xs text-slate-800 font-medium cursor-pointer">
              <span className="font-bold flex items-center gap-1.5 text-slate-900">
                <Mail className="w-3.5 h-3.5 text-tealBrand-700" />
                <span>Send calendar invitations (.ics) immediately</span>
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Unchecked by default so you can save schedule changes safely without sending automatic emails. You can also send the update manually whenever ready.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {saving
                  ? isReschedule ? 'Updating Schedule...' : 'Saving & Confirming...'
                  : isReschedule ? 'Save New Schedule ➔' : 'Confirm Appointment Now ➔'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

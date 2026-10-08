import { useState } from 'react';
import { RotateCcw, X, AlertTriangle, Calendar } from 'lucide-react';
import type { CoordinationEvent } from '../types';

interface ResetCoordinationModalProps {
  event: CoordinationEvent;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: { cancelledBy?: string; cancellationReason?: string }) => Promise<void>;
}

const CANCEL_PARTY_OPTIONS = [
  { id: 'Carrier / Adjuster', label: 'Carrier / Adjuster', icon: '🏢' },
  { id: 'Public Adjuster', label: 'Public Adjuster', icon: '⚖️' },
  { id: 'Insured / Client', label: 'Insured / Client', icon: '👤' },
  { id: 'Weather / Conflict', label: 'Weather / Conflict', icon: '🌧️' },
  { id: 'Other', label: 'Other', icon: '📝' },
];

export function ResetCoordinationModal({
  event,
  isOpen,
  onClose,
  onConfirm,
}: ResetCoordinationModalProps) {
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm({
        cancelledBy: selectedParty || undefined,
        cancellationReason: reason.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error('Error resetting event:', err);
      alert('Failed to reset event: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStageTitle = (stage: string) => {
    switch (stage) {
      case '1_awaiting_carrier_slots': return '1. Carrier Dates Offered';
      case '2_pa_review': return '2. PA Review (2 of 3)';
      case '3_insured_selection': return '3. Client Selection (1 of 2)';
      case '4_confirmed': return '4. Inspection Confirmed';
      default: return stage;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-rose-950 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <RotateCcw className="w-5 h-5 text-rose-200" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Reset Coordination Flow</h2>
              <p className="text-xs text-rose-200/90">Return event to Stage 1 (Awaiting Carrier Dates)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Event Context Pill */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="font-bold text-slate-800">{event.claim?.claimNumber}</span>
              <span className="text-slate-500 font-semibold">{event.claim?.carrier}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span><strong>Event:</strong> {event.eventType}</span>
              <span className="text-amber-800 font-medium">Currently in {getStageTitle(event.coordinationStage)}</span>
            </div>
            {event.finalDate && (
              <div className="flex items-center gap-1.5 text-emerald-800 font-medium pt-1 border-t border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cancelling confirmed appointment on <strong>{event.finalDate}</strong> ({event.finalStartTime?.slice(0, 5)} - {event.finalEndTime?.slice(0, 5)})</span>
              </div>
            )}
          </div>

          {/* Who Cancelled / Requested Reset? */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Who cancelled or requested the reset? <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CANCEL_PARTY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedParty(selectedParty === opt.id ? '' : opt.id)}
                  className={`p-2 rounded-lg border text-left text-xs font-medium flex items-center gap-2 transition-all ${
                    selectedParty === opt.id
                      ? 'bg-rose-50 border-rose-600 text-rose-950 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cancellation Reason / Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Reason / Cancellation Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Adjuster requested reschedule due to conflict, weather delay, insured out of town..."
              className="w-full p-2.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-700 focus:border-rose-700 placeholder:text-slate-400 transition-all resize-none"
            />
          </div>

          {/* Warning Banner */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-950 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-bold">What happens when you reset?</span>
              <p className="text-[11px] text-amber-900 opacity-90">
                The event will be returned to <strong>1. Carrier Dates</strong>, clearing any current slots so new dates can be offered. An audit entry will be logged into the claim's contact history with your notes.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Resetting...' : 'Confirm Reset Flow'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, Plus, Trash2, AlertCircle } from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import type { CoordinationEvent, Claim } from '../types';

interface RecordCarrierSlotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CoordinationEvent;
  claim: Claim;
  onSaved: () => void;
}

export function RecordCarrierSlotsModal({
  isOpen,
  onClose,
  event,
  claim,
  onSaved,
}: RecordCarrierSlotsModalProps) {
  // Default to 3 slots as requested by workflow
  const [slots, setSlots] = useState<Array<{ slotDate: string; startTime: string; endTime: string }>>([
    { slotDate: '', startTime: '09:00', endTime: '11:00' },
    { slotDate: '', startTime: '13:00', endTime: '15:00' },
    { slotDate: '', startTime: '10:00', endTime: '12:00' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(event?.slots && event.slots.length > 0);

  useEffect(() => {
    if (isOpen) {
      if (event?.slots && event.slots.length > 0) {
        setSlots(
          event.slots.map((s) => ({
            slotDate: s.slotDate || '',
            startTime: s.startTime?.slice(0, 5) || '09:00',
            endTime: s.endTime?.slice(0, 5) || '11:00',
          }))
        );
      } else {
        setSlots([
          { slotDate: '', startTime: '09:00', endTime: '11:00' },
          { slotDate: '', startTime: '13:00', endTime: '15:00' },
          { slotDate: '', startTime: '10:00', endTime: '12:00' },
        ]);
      }
      setError(null);
    }
  }, [isOpen, event]);

  if (!isOpen) return null;

  const handleSlotChange = (index: number, field: 'slotDate' | 'startTime' | 'endTime', value: string) => {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  };

  const handleAddSlot = () => {
    setSlots([...slots, { slotDate: '', startTime: '09:00', endTime: '11:00' }]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate that all slots have dates and logical times
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].slotDate) {
        setError(`Please provide a date for Option #${i + 1}`);
        return;
      }
      if (!slots[i].startTime || !slots[i].endTime) {
        setError(`Please provide both start and end times for Option #${i + 1}`);
        return;
      }
      if (slots[i].startTime >= slots[i].endTime) {
        setError(`Option #${i + 1}: End time (${slots[i].endTime}) must be after start time (${slots[i].startTime})`);
        return;
      }
    }

    setSaving(true);
    try {
      await schedulingService.recordCarrierSlots(event.id, slots);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save carrier slots:', err);
      setError(err.message || 'Failed to save carrier slots');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-maroon-100 text-maroon-800 uppercase tracking-wide">
                {isEditing ? 'Modify Carrier Dates' : 'Step 1 of Funnel'}
              </span>
              <span className="text-xs text-slate-500 font-mono font-semibold">{claim.claimNumber}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {isEditing ? 'Modify Carrier Proposed Dates' : 'Record Carrier Proposed Dates'}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing 
                ? `Edit or replace the date/time options provided by ${claim.carrier} (or external adjuster).`
                : `Enter the 3 date/time options provided by ${claim.carrier} (or external adjuster).`
              }
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {slots.map((slot, idx) => (
              <div 
                key={idx} 
                className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 relative group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-maroon-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Option #{idx + 1}
                  </span>
                  {slots.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(idx)}
                      title="Remove option"
                      className="text-slate-400 hover:text-red-600 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={slot.slotDate}
                      onChange={(e) => handleSlotChange(idx, 'slotDate', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Time *</label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="time"
                        required
                        value={slot.startTime}
                        onChange={(e) => handleSlotChange(idx, 'startTime', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded pl-8 pr-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Time *</label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="time"
                        required
                        value={slot.endTime}
                        onChange={(e) => handleSlotChange(idx, 'endTime', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded pl-8 pr-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleAddSlot}
              className="inline-flex items-center gap-1 text-xs text-tealBrand-700 hover:text-tealBrand-900 font-semibold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add another option</span>
            </button>
            <span className="text-[11px] text-slate-500">
              {slots.length} options entered
            </span>
          </div>

          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            ℹ️ <strong>Next Step:</strong> Once you submit these dates, the event will automatically move to <strong>Step 2: PA Review</strong> so the Public Adjuster can filter down to the 2 best options.
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1187AA] hover:bg-[#0C6079] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Dates & Refresh PA Review ➔' : 'Submit Dates & Advance to PA Review ➔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { formatTimeRangeWithDualTimezone, formatUsDate } from '../lib/timezoneUtils';
import { useToast } from '../context/ToastContext';
import type { EventSlot, CoordinationEvent, Claim } from '../types';

interface EditSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  slot: EventSlot;
  event: CoordinationEvent;
  claim: Claim;
  onSaved: () => void | Promise<any>;
  onConfirmSlot?: (slot: EventSlot, dateDetails: { date: string; startTime: string; endTime: string }) => void | Promise<any>;
}

export function EditSlotModal({
  isOpen,
  onClose,
  slot,
  event,
  claim,
  onSaved,
  onConfirmSlot,
}: EditSlotModalProps) {
  const toast = useToast();
  const [slotDate, setSlotDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && slot) {
      setSlotDate(slot.slotDate || '');
      setStartTime(slot.startTime?.slice(0, 5) || '09:00');
      setEndTime(slot.endTime?.slice(0, 5) || '11:00');
      setError(null);
    }
  }, [isOpen, slot]);

  if (!isOpen) return null;

  const timezone = event.timezone || claim.timezone || 'ET';

  const validate = (): boolean => {
    setError(null);
    if (!slotDate) {
      setError('Please select a valid date.');
      return false;
    }
    if (!startTime || !endTime) {
      setError('Please enter both start time and end time.');
      return false;
    }
    if (startTime >= endTime) {
      setError(`End time (${endTime}) must be later than start time (${startTime}).`);
      return false;
    }
    return true;
  };

  const handleSaveOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await schedulingService.updateSlot(slot.id, {
        slotDate,
        startTime,
        endTime,
      });

      // Log in audit trail
      await schedulingService.addCoordinationLog({
        eventId: event.id,
        contactTarget: 'internal',
        contactTargetName: 'Coordinator',
        channel: 'other',
        notes: `🕒 Date option adjusted: ${slotDate} (${startTime} - ${endTime} ${timezone}). Previous: ${slot.slotDate} (${slot.startTime?.slice(0, 5)} - ${slot.endTime?.slice(0, 5)}).`,
      });

      toast.success(
        'Fecha modificada',
        `La opción se actualizó a: ${formatUsDate(slotDate)} (${startTime} - ${endTime} ${timezone})`
      );

      await onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error updating slot:', err);
      setError(err.message || 'Error updating date option');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndConfirm = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      // 1. Update the slot date/time
      await schedulingService.updateSlot(slot.id, {
        slotDate,
        startTime,
        endTime,
      });

      // 2. Direct lock & confirm for the client
      if (onConfirmSlot) {
        await onConfirmSlot(slot, {
          date: slotDate,
          startTime,
          endTime,
        });
      } else {
        await schedulingService.insuredConfirmSlot(event.id, slot.id, {
          date: slotDate,
          startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
          endTime: endTime.length === 5 ? `${endTime}:00` : endTime,
        });
      }

      toast.success(
        '¡Cita Fijada y Confirmada!',
        `La inspección quedó confirmada para el ${formatUsDate(slotDate)} de ${startTime} a ${endTime} (${timezone}).`
      );

      await onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error confirming slot:', err);
      setError(err.message || 'Error saving and confirming date');
    } finally {
      setSaving(false);
    }
  };

  const dualTimeInfo = formatTimeRangeWithDualTimezone(startTime, endTime, timezone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-tealBrand-100 border border-tealBrand-300 flex items-center justify-center text-tealBrand-800 shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Modificar Fecha / Horario
              </h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                Claim #{claim.claimNumber} · {claim.insured?.name || 'Cliente'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSaveOnly} className="p-5 space-y-4 text-xs">
          
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-tealBrand-700" />
                <span>Fecha Propuesta *</span>
              </label>
              <input
                type="date"
                required
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:border-tealBrand-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-tealBrand-700" />
                  <span>Hora de Inicio *</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-tealBrand-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-tealBrand-700" />
                  <span>Hora de Fin *</span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-tealBrand-700"
                />
              </div>
            </div>

            {/* PREVIEW BOX */}
            <div className="p-2.5 bg-white border border-tealBrand-200 rounded-lg text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-tealBrand-800 block">
                Vista previa con zona horaria ({timezone}):
              </span>
              <p className="font-bold text-slate-900 font-mono text-[11px]">
                📅 {formatUsDate(slotDate) || 'MM/DD/YYYY'}
              </p>
              <p className="text-[11px] text-tealBrand-900 font-mono">
                ⏰ {dualTimeInfo.displayFull}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            💡 <strong>Nota:</strong> Modificar esta opción no altera las demás fechas ni reinicia la etapa actual del Funnel.
          </p>

          {/* FOOTER ACTIONS */}
          <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3.5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saving ? 'Guardando...' : 'Guardar Opción'}</span>
              </button>
            </div>

            {/* FAST-TRACK LOCK: If client agreed right now over phone */}
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAndConfirm}
              className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Guarda esta fecha y la fija directamente como la cita confirmada (Etapa 4)"
            >
              <span>⚡ Guardar y Fijar como Cita Confirmada ➔</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Calendar, Plus, Trash2, AlertCircle, CheckCircle2, User, Sparkles } from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { formatTimeRangeWithDualTimezone } from '../lib/timezoneUtils';
import type { CoordinationEvent, Claim, CoordinationStage } from '../types';

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
  // Mode: 'slots' for specific dates or 'open_availability' for "any day"
  const [mode, setMode] = useState<'slots' | 'open_availability'>('slots');

  // Who is providing the dates / availability
  const [proposedBy, setProposedBy] = useState<'carrier' | 'insured' | 'pa' | 'office'>('carrier');

  // Next stage preference
  const [targetStage, setTargetStage] = useState<CoordinationStage>('2_pa_review');

  // Slots state (starts with 3 or existing)
  const [slots, setSlots] = useState<Array<{ slotDate: string; startTime: string; endTime: string }>>([
    { slotDate: '', startTime: '09:00', endTime: '11:00' },
    { slotDate: '', startTime: '13:00', endTime: '15:00' },
    { slotDate: '', startTime: '10:00', endTime: '12:00' },
  ]);

  // Open availability notes
  const [openAvailNotes, setOpenAvailNotes] = useState('');

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
        // If slots had a proposer stored
        if (event.slots[0]?.proposedBy) {
          setProposedBy(event.slots[0].proposedBy as any);
        } else if (event.slotsOriginator) {
          setProposedBy(event.slotsOriginator as any);
        }
      } else {
        setSlots([
          { slotDate: '', startTime: '09:00', endTime: '11:00' },
          { slotDate: '', startTime: '13:00', endTime: '15:00' },
          { slotDate: '', startTime: '10:00', endTime: '12:00' },
        ]);
        setProposedBy((event?.slotsOriginator as any) || 'carrier');
      }

      if (event?.openAvailabilityActor) {
        setMode('open_availability');
        setProposedBy(event.openAvailabilityActor);
        setOpenAvailNotes(event.openAvailabilityNotes || '');
      } else {
        setMode('slots');
        setOpenAvailNotes('');
      }

      setError(null);
    }
  }, [isOpen, event]);

  // Dynamically adapt suggested target stage when proposedBy changes
  useEffect(() => {
    if (proposedBy === 'insured') {
      setTargetStage('2_pa_review'); // PA reviews insured dates or passes to carrier
    } else if (proposedBy === 'pa') {
      setTargetStage('3_insured_selection'); // PA gave dates -> goes to insured
    } else {
      setTargetStage('2_pa_review'); // Carrier gave dates -> goes to PA
    }
  }, [proposedBy]);

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

  // Submit Open Availability ("Cualquier día")
  const handleSaveOpenAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const actorLabels: Record<string, string> = {
        insured: claim.insured?.name || 'Cliente / Asegurado',
        pa: claim.publicAdjuster?.name || 'Public Adjuster',
        carrier: `${claim.carrier} (Ajustador)`,
        office: 'Coordinador',
      };
      const actorName = actorLabels[proposedBy] || proposedBy;

      await schedulingService.recordOpenAvailability(
        event.id,
        proposedBy as 'insured' | 'pa' | 'carrier',
        actorName,
        openAvailNotes.trim() || 'Disponible cualquier día',
        targetStage
      );

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error al guardar disponibilidad total:', err);
      setError(err.message || 'Error al guardar disponibilidad total');
    } finally {
      setSaving(false);
    }
  };

  // Submit Specific Date Options
  const handleSubmitSlots = async (e: React.FormEvent, directConfirmSingle = false) => {
    e.preventDefault();
    setError(null);

    // Validate that all slots have dates and logical times
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].slotDate) {
        setError(`Por favor ingresa una fecha para la Opción #${i + 1}`);
        return;
      }
      if (!slots[i].startTime || !slots[i].endTime) {
        setError(`Por favor indica hora de inicio y fin para la Opción #${i + 1}`);
        return;
      }
      if (slots[i].startTime >= slots[i].endTime) {
        setError(`Opción #${i + 1}: La hora de fin (${slots[i].endTime}) debe ser posterior a la de inicio (${slots[i].startTime})`);
        return;
      }
    }

    setSaving(true);
    try {
      await schedulingService.recordCarrierSlots(event.id, slots, {
        proposedBy,
        targetStage,
        directConfirmSingleSlot: directConfirmSingle && slots.length === 1,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error al guardar opciones de fecha:', err);
      setError(err.message || 'Error al guardar opciones de fecha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tealBrand-100 text-tealBrand-800 uppercase tracking-wide">
                Gestión Flexible de Fechas
              </span>
              <span className="text-xs text-slate-500 font-mono font-semibold">{claim.claimNumber}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {isEditing ? 'Modificar Fechas / Disponibilidad' : 'Proponer Fechas o Disponibilidad'}
            </h3>
            <p className="text-xs text-slate-500">
              Cualquier parte (Aseguradora, Cliente o PA) puede proponer fechas o indicar agenda abierta.
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

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('slots')}
            className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'slots'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-tealBrand-700" />
            <span>Opciones de Fecha (1-4)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('open_availability')}
            className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'open_availability'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-emerald-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>"Puede Cualquier Día"</span>
          </button>
        </div>

        {/* Section 1: Who is providing */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
          <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-maroon-800" />
            <span>¿Quién está indicando las fechas o disponibilidad?</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setProposedBy('carrier')}
              className={`p-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                proposedBy === 'carrier'
                  ? 'bg-maroon-50 border-maroon-700 text-maroon-900 ring-1 ring-maroon-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              🏢 Aseguradora
            </button>
            <button
              type="button"
              onClick={() => setProposedBy('insured')}
              className={`p-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                proposedBy === 'insured'
                  ? 'bg-tealBrand-50 border-tealBrand-700 text-tealBrand-900 ring-1 ring-tealBrand-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              👤 Cliente
            </button>
            <button
              type="button"
              onClick={() => setProposedBy('pa')}
              className={`p-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                proposedBy === 'pa'
                  ? 'bg-tealBrand-50 border-tealBrand-700 text-tealBrand-900 ring-1 ring-tealBrand-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              ⚖️ Public Adjuster
            </button>
          </div>
        </div>

        {/* MODE A: OPEN AVAILABILITY ("PUEDE CUALQUIER DÍA") */}
        {mode === 'open_availability' ? (
          <form onSubmit={handleSaveOpenAvailability} className="space-y-4">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-emerald-950">
                  {proposedBy === 'insured' ? 'El Cliente indicó que puede cualquier día' : proposedBy === 'pa' ? 'El PA tiene agenda abierta' : 'La Aseguradora tiene disponibilidad total'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Al guardar disponibilidad total, la pelota pasa a la contraparte. Tan pronto como acuerden una fecha y hora exacta, podrás usar el botón <strong>"Confirmar Cita Directamente"</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Acotaciones o Restricciones horarias (opcional)
              </label>
              <textarea
                rows={2}
                value={openAvailNotes}
                onChange={(e) => setOpenAvailNotes(e.target.value)}
                placeholder="e.g. Puede cualquier día después de las 2:00 PM. Hay lockbox en la puerta."
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Etapa siguiente sugerida
              </label>
              <select
                value={targetStage}
                onChange={(e) => setTargetStage(e.target.value as CoordinationStage)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
              >
                <option value="1_awaiting_carrier_slots">1. Esperando Fechas (Carrier o Contraparte)</option>
                <option value="2_pa_review">2. Pendiente Revisión PA</option>
                <option value="3_insured_selection">3. Pendiente Asegurado</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Guardando...' : 'Guardar Disponibilidad Total ➔'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* MODE B: SPECIFIC SLOTS */
          <form onSubmit={(e) => handleSubmitSlots(e, false)} className="space-y-4">
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
                    {event?.timezone === 'CT' ? 'Zona Horaria: Pensacola / Panhandle (Central Time - CT)' : 'Zona Horaria: Miami / Sur de la Florida (Eastern Time - ET)'}
                  </span>
                  <span className="text-[11px] opacity-80 block">
                    {event?.timezone === 'CT' 
                      ? '💡 Ingresa la hora local de la casa. En Miami (PA) será 1 hora más tarde.' 
                      : '💡 Las horas ingresadas son hora local de Miami (Eastern Time).'}
                  </span>
                </div>
              </div>
              <span className="font-bold text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-300 uppercase">
                {event?.timezone === 'CT' ? 'CT' : 'ET'}
              </span>
            </div>

            <div className="space-y-2.5">
              {slots.map((slot, idx) => (
                <div 
                  key={idx} 
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-maroon-800" />
                      Opción #{idx + 1}
                    </span>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(idx)}
                        title="Eliminar esta opción"
                        className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fecha *</label>
                      <input
                        type="date"
                        required
                        value={slot.slotDate}
                        onChange={(e) => handleSlotChange(idx, 'slotDate', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hora Inicio *</label>
                      <input
                        type="time"
                        required
                        value={slot.startTime}
                        onChange={(e) => handleSlotChange(idx, 'startTime', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hora Fin *</label>
                      <input
                        type="time"
                        required
                        value={slot.endTime}
                        onChange={(e) => handleSlotChange(idx, 'endTime', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                      />
                    </div>
                  </div>

                  {slot.startTime && slot.endTime && (
                    <div className="text-[11px] text-slate-600 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-sans">Equivalencia:</span>
                      <strong className="text-tealBrand-800">
                        {formatTimeRangeWithDualTimezone(slot.startTime, slot.endTime, event?.timezone || 'ET').displayFull}
                      </strong>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAddSlot}
                className="inline-flex items-center gap-1 text-xs text-tealBrand-700 hover:text-tealBrand-900 font-bold hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Agregar otra opción de fecha</span>
              </button>
              <span className="text-[11px] text-slate-500 font-medium">
                {slots.length} {slots.length === 1 ? 'opción' : 'opciones'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Etapa de Destino
              </label>
              <select
                value={targetStage}
                onChange={(e) => setTargetStage(e.target.value as CoordinationStage)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
              >
                <option value="2_pa_review">2. Revisión PA (Filtrar opciones)</option>
                <option value="3_insured_selection">3. Selección Asegurado (Ofrecer opciones)</option>
                <option value="1_awaiting_carrier_slots">1. Esperando Aseguradora</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {slots.length === 1 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => handleSubmitSlots(e, true)}
                  className="px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Confirmar directamente esta única fecha como la cita definitiva"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cerrar como Cita Confirmada ➔</span>
                </button>
              )}

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-white bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Guardar Opciones Propuestas ➔'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

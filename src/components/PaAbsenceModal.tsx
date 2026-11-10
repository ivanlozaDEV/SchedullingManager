import React, { useState, useEffect } from 'react';
import { 
  X, 
  CalendarOff, 
  Palmtree, 
  HeartPulse, 
  UserCheck, 
  Briefcase, 
  Trash2, 
  Plus, 
  AlertTriangle,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  Tag
} from 'lucide-react';
import type { PublicAdjuster, PaUnavailability } from '../types';
import { schedulingService } from '../lib/schedulingService';
import { useToast } from '../context/ToastContext';
import { format12Hour } from '../lib/timezoneUtils';

interface PaAbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  pa: PublicAdjuster | null;
  onChanged?: () => void;
}

const PRESET_REASONS = [
  { value: 'Vacaciones', label: '🏖️ Vacaciones', icon: Palmtree, color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'Médico', label: '🩺 Permiso Médico / Cita Médica', icon: HeartPulse, color: 'text-rose-700 bg-rose-50 border-rose-200' },
  { value: 'Personal / Día Libre', label: '👤 Asunto Personal / Día Libre', icon: UserCheck, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { value: 'Viaje', label: '✈️ Viaje de Trabajo / Fuera de Zona', icon: Briefcase, color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'Otro', label: '✏️ Otro Motivo (personalizado)', icon: Tag, color: 'text-purple-700 bg-purple-50 border-purple-200' },
];

export const PaAbsenceModal: React.FC<PaAbsenceModalProps> = ({
  isOpen,
  onClose,
  pa,
  onChanged
}) => {
  const { success, error } = useToast();
  const [unavailabilities, setUnavailabilities] = useState<PaUnavailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [absenceType, setAbsenceType] = useState<'all_day' | 'hourly'>('all_day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reasonSelect, setReasonSelect] = useState('Vacaciones');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load existing unavailabilities when PA changes or modal opens
  useEffect(() => {
    if (isOpen && pa?.id) {
      loadData();
      const todayStr = new Date().toISOString().split('T')[0];
      setAbsenceType('all_day');
      setStartDate(todayStr);
      setEndDate(todayStr);
      setStartTime('09:00');
      setEndTime('13:00');
      setReasonSelect('Vacaciones');
      setCustomReason('');
      setNotes('');
      setErrorMsg(null);
    }
  }, [isOpen, pa?.id]);

  const loadData = async () => {
    if (!pa?.id) return;
    setLoading(true);
    try {
      const data = await schedulingService.getPaUnavailabilities(pa.id);
      setUnavailabilities(data);
    } catch (err: any) {
      console.error('Error loading absences:', err);
      error('Error al cargar', 'No se pudieron cargar las ausencias del PA');
    } finally {
      setLoading(false);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (!endDate || val > endDate) {
      setEndDate(val);
    }
  };

  const getReasonMeta = (reasonName: string) => {
    const match = PRESET_REASONS.find((o) => o.value === reasonName);
    if (match) return match;
    return {
      value: reasonName,
      label: reasonName,
      icon: CalendarOff,
      color: 'text-purple-700 bg-purple-50 border-purple-200'
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pa?.id) return;
    setErrorMsg(null);

    // Resolve final reason
    let finalReason = reasonSelect;
    if (reasonSelect === 'Otro') {
      if (!customReason.trim()) {
        setErrorMsg('Por favor escribe el motivo específico de la ausencia.');
        return;
      }
      finalReason = customReason.trim();
    }

    if (absenceType === 'all_day') {
      if (!startDate) {
        setErrorMsg('Por favor selecciona una fecha de inicio.');
        return;
      }
      if (!endDate) {
        setErrorMsg('Por favor selecciona una fecha de fin.');
        return;
      }
      if (startDate > endDate) {
        setErrorMsg('La fecha de inicio no puede ser posterior a la fecha de fin.');
        return;
      }

      setSubmitting(true);
      try {
        await schedulingService.createPaUnavailability({
          publicAdjusterId: pa.id,
          startDate,
          endDate,
          isAllDay: true,
          reason: finalReason,
          notes: notes.trim() || undefined
        });

        success('Ausencia Registrada', `Período registrado para ${pa.name}`);
        setNotes('');
        setCustomReason('');
        await loadData();
        if (onChanged) onChanged();
      } catch (err: any) {
        console.error('Error saving absence:', err);
        setErrorMsg(err.message || 'Error guardando la ausencia.');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Hourly absence
      if (!startDate) {
        setErrorMsg('Por favor selecciona la fecha de la ausencia.');
        return;
      }
      if (!startTime || !endTime) {
        setErrorMsg('Por favor especifica la hora de inicio y hora de fin.');
        return;
      }
      if (startTime >= endTime) {
        setErrorMsg('La hora de fin debe ser posterior a la hora de inicio.');
        return;
      }

      setSubmitting(true);
      try {
        await schedulingService.createPaUnavailability({
          publicAdjusterId: pa.id,
          startDate,
          endDate: startDate,
          isAllDay: false,
          startTime,
          endTime,
          reason: finalReason,
          notes: notes.trim() || undefined
        });

        success('Ausencia por Horas Registrada', `Bloqueo horario registrado para ${pa.name}`);
        setNotes('');
        setCustomReason('');
        await loadData();
        if (onChanged) onChanged();
      } catch (err: any) {
        console.error('Error saving absence:', err);
        setErrorMsg(err.message || 'Error guardando la ausencia.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (item: PaUnavailability) => {
    const isHourly = item.isAllDay === false && item.startTime && item.endTime;
    const confirmPrompt = isHourly
      ? `¿Eliminar el bloqueo horario del ${item.startDate} (${format12Hour(item.startTime!)} a ${format12Hour(item.endTime!)})?`
      : `¿Eliminar el período bloqueado del ${item.startDate} al ${item.endDate}?`;

    if (!confirm(confirmPrompt)) {
      return;
    }

    setDeletingId(item.id);
    try {
      const ok = await schedulingService.deletePaUnavailability(item.id);
      if (ok) {
        success('Bloqueo Eliminado', 'Período de ausencia eliminado correctamente');
        setUnavailabilities((prev) => prev.filter((u) => u.id !== item.id));
        if (onChanged) onChanged();
      } else {
        error('Error', 'No se pudo eliminar el bloqueo');
      }
    } catch (err) {
      console.error('Error deleting absence:', err);
      error('Error', 'Error al eliminar bloqueo');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen || !pa) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  const activeAndUpcoming = unavailabilities.filter((u) => u.endDate >= todayStr);
  const past = unavailabilities.filter((u) => u.endDate < todayStr);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ backgroundColor: pa.colorCode || '#0284c7' }}
            >
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 font-['Montserrat',sans-serif]">
                  Bloqueo de Fechas & Ausencias
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-tealBrand-700 bg-tealBrand-50 px-2 py-0.5 rounded-full border border-tealBrand-200/60">
                  {pa.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configura vacaciones, permisos médicos o bloqueos por horas para prevenir citas conflictivas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Form to Register New Absence */}
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200/80 rounded-xl p-4.5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Plus className="w-4 h-4 text-tealBrand-600" />
                <span>Registrar Ausencia o Bloqueo</span>
              </div>

              {/* Mode Selector: All Day vs Hourly */}
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAbsenceType('all_day')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                    absenceType === 'all_day'
                      ? 'bg-white text-tealBrand-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>Día(s) Completo(s)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbsenceType('hourly')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                    absenceType === 'hourly'
                      ? 'bg-white text-tealBrand-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Por Horas (Parcial)</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Date and Time Fields depending on mode */}
            {absenceType === 'all_day' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Inicio <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <CalendarIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Fin <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <CalendarIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="date"
                      required
                      min={startDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fecha del Bloqueo <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <CalendarIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hora Inicio <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="time"
                        required
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hora Fin <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="time"
                        required
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-tealBrand-700 bg-tealBrand-50/70 p-2 rounded-lg border border-tealBrand-200/50">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-tealBrand-600" />
                  <span>
                    Bloqueo horario ({format12Hour(startTime)} a {format12Hour(endTime)}): el PA estará disponible para coordinar inspecciones durante las demás horas de ese día.
                  </span>
                </div>
              </div>
            )}

            {/* Motivo and Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo de la Ausencia
                </label>
                <select
                  value={reasonSelect}
                  onChange={(e) => setReasonSelect(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900 font-medium cursor-pointer"
                >
                  {PRESET_REASONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notas / Observaciones (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Trámite bancario, dentista, vuelo..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-tealBrand-500 focus:border-tealBrand-500 text-slate-900"
                />
              </div>
            </div>

            {/* Custom Reason Field if 'Otro' selected */}
            {reasonSelect === 'Otro' && (
              <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                <label className="block text-xs font-bold text-purple-900">
                  Especifica el Motivo Personalizado <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Capacitación técnica, Trámite legal, Emergencia personal..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-slate-900 font-medium"
                />
                <p className="text-[10px] text-purple-700">
                  Este texto se mostrará en los calendarios y alertas de conflicto para este PA.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-tealBrand-600 hover:bg-tealBrand-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{absenceType === 'hourly' ? 'Bloquear Rango Horario' : 'Bloquear Fechas'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* List of Registered Absences */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Bloqueos y Ausencias Registradas ({unavailabilities.length})</span>
              </h4>
            </div>

            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-tealBrand-600" />
                <span className="text-xs">Cargando ausencias...</span>
              </div>
            ) : unavailabilities.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <CalendarOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-600">No hay ausencias ni bloqueos registrados</p>
                <p className="text-[11px] text-slate-400 mt-0.5">El PA está disponible para todas las citas normales.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Active and Upcoming */}
                {activeAndUpcoming.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      Próximas y Activas ({activeAndUpcoming.length})
                    </span>
                    <div className="space-y-2">
                      {activeAndUpcoming.map((item) => {
                        const opt = getReasonMeta(item.reason);
                        const Icon = opt.icon;
                        const isHourly = item.isAllDay === false && item.startTime && item.endTime;
                        const isCurrent = isHourly 
                          ? item.startDate === todayStr
                          : (item.startDate <= todayStr && item.endDate >= todayStr);

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isCurrent 
                                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/30' 
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`p-2 rounded-lg border shrink-0 ${opt.color}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">
                                    {isHourly ? (
                                      item.startDate
                                    ) : item.startDate === item.endDate ? (
                                      item.startDate
                                    ) : (
                                      `${item.startDate} → ${item.endDate}`
                                    )}
                                  </span>

                                  {isHourly ? (
                                    <span className="text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-blue-600" />
                                      {format12Hour(item.startTime!)} - {format12Hour(item.endTime!)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                                      Día Completo
                                    </span>
                                  )}

                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${opt.color}`}>
                                    {item.reason}
                                  </span>

                                  {isCurrent && (
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                                      {isHourly ? 'Hoy (Por Horas)' : 'En Curso Hoy'}
                                    </span>
                                  )}
                                </div>
                                {item.notes && (
                                  <p className="text-[11px] text-slate-600 mt-1 italic">
                                    "{item.notes}"
                                  </p>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={deletingId === item.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                              title="Eliminar bloqueo"
                            >
                              {deletingId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Past Absences */}
                {past.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                      Historial Pasado ({past.length})
                    </span>
                    <div className="space-y-1.5 opacity-60 hover:opacity-100 transition-opacity">
                      {past.map((item) => {
                        const isHourly = item.isAllDay === false && item.startTime && item.endTime;
                        return (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>
                                {isHourly 
                                  ? `${item.startDate} (${format12Hour(item.startTime!)} - ${format12Hour(item.endTime!)})`
                                  : item.startDate === item.endDate 
                                  ? item.startDate 
                                  : `${item.startDate} → ${item.endDate}`}
                              </span>
                              <span className="font-semibold text-slate-700">({item.reason})</span>
                              {item.notes && <span className="italic text-slate-500">- {item.notes}</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Eliminar registro histórico"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

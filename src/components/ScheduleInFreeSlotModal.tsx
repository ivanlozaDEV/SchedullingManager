import { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock,
  MapPin, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  Car, 
  Loader2
} from 'lucide-react';
import type { Claim, CoordinationEvent, PublicAdjuster } from '../types';
import { formatUsDate, format12Hour, cleanAddress } from '../lib/timezoneUtils';
import { schedulingService } from '../lib/schedulingService';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { 
  analyzeBidirectionalTransit, 
  type BidirectionalTransitAnalysis 
} from '../lib/transitTravelUtils';

interface ScheduleInFreeSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  preselectedPaId?: string;
  claims: Claim[];
  events: CoordinationEvent[];
  pas: PublicAdjuster[];
  onEventCreated: () => void;
}

export function ScheduleInFreeSlotModal({
  isOpen,
  onClose,
  slotDate,
  startTime: initialStartTime,
  endTime: initialEndTime,
  preselectedPaId,
  claims,
  events,
  pas,
  onEventCreated
}: ScheduleInFreeSlotModalProps) {
  const { success, error } = useToast();

  const [selectedPaId, setSelectedPaId] = useState<string>(() => {
    if (preselectedPaId && preselectedPaId !== 'all' && preselectedPaId !== 'unassigned') {
      return preselectedPaId;
    }
    return pas[0]?.id || '';
  });

  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [claimSearch, setClaimSearch] = useState('');
  const [eventType, setEventType] = useState('Initial Inspection');
  const [startTime, setStartTime] = useState(initialStartTime || '09:00');
  const [endTime, setEndTime] = useState(initialEndTime || '11:00');
  const [accessNotes, setAccessNotes] = useState('');
  const [bookingMode, setBookingMode] = useState<'tentative' | 'confirmed'>('tentative');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transit Analysis State
  const [isAnalyzingTransit, setIsAnalyzingTransit] = useState(false);
  const [transitAnalysis, setTransitAnalysis] = useState<BidirectionalTransitAnalysis | null>(null);

  // Update when props change
  useEffect(() => {
    if (preselectedPaId && preselectedPaId !== 'all' && preselectedPaId !== 'unassigned') {
      setSelectedPaId(preselectedPaId);
    }
    if (initialStartTime) setStartTime(initialStartTime);
    if (initialEndTime) setEndTime(initialEndTime);
  }, [preselectedPaId, initialStartTime, initialEndTime, isOpen]);

  // Selected Claim Object
  const selectedClaim = useMemo(() => {
    return claims.find(c => c.id === selectedClaimId) || null;
  }, [claims, selectedClaimId]);

  // Filtered Claims for search selector
  const filteredClaims = useMemo(() => {
    const q = claimSearch.toLowerCase().trim();
    return claims.filter(c => {
      if (!q) return true;
      const num = c.claimNumber?.toLowerCase() || '';
      const name = c.insured?.name?.toLowerCase() || '';
      const carrier = c.carrier?.toLowerCase() || '';
      const addr = c.propertyAddress?.toLowerCase() || '';
      return num.includes(q) || name.includes(q) || carrier.includes(q) || addr.includes(q);
    });
  }, [claims, claimSearch]);

  // Appointments on this date to check transit
  const dayAppointments = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      location: string;
      startTime: string;
      endTime: string;
      paId?: string;
    }> = [];

    for (const evt of events) {
      if (evt.finalDate === slotDate && evt.finalStartTime && evt.finalEndTime) {
        const paPart = evt.participants?.find(p => p.participantType === 'public_adjuster')?.publicAdjusterId;
        const paId = paPart || evt.claim?.publicAdjusterId || '';
        list.push({
          id: evt.id,
          title: `${evt.claim?.claimNumber ? `#${evt.claim.claimNumber}` : 'Claim'} - ${evt.claim?.insured?.name || 'Insured'}`,
          location: evt.location || evt.claim?.propertyAddress || '',
          startTime: evt.finalStartTime,
          endTime: evt.finalEndTime,
          paId
        });
      }
    }

    return list;
  }, [events, slotDate]);

  // Run bidirectional transit analysis when claim, PA, or times change
  useEffect(() => {
    if (!selectedClaim || !selectedClaim.propertyAddress) {
      setTransitAnalysis(null);
      return;
    }

    let isMounted = true;
    setIsAnalyzingTransit(true);

    analyzeBidirectionalTransit({
      targetLocation: selectedClaim.propertyAddress,
      targetStartTime: startTime,
      targetEndTime: endTime,
      dayAppointments,
      selectedPaId
    }).then(result => {
      if (isMounted) {
        setTransitAnalysis(result);
        setIsAnalyzingTransit(false);
      }
    }).catch(err => {
      console.warn('Transit calculation error:', err);
      if (isMounted) setIsAnalyzingTransit(false);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedClaim, selectedPaId, startTime, endTime, dayAppointments]);

  if (!isOpen) return null;

  const currentPa = pas.find(p => p.id === selectedPaId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) {
      error('Reclamo requerido', 'Por favor selecciona un reclamo (Claim) para agendar');
      return;
    }

    setIsSubmitting(true);
    try {
      if (bookingMode === 'tentative') {
        // MODO TENTATIVO: Se crea como propuesta en coordinación (Stage 1 / proposed)
        // NO se envía ningún email ni se marca como confirmado en el Funnel
        const existingEvent = events.find(e => e.claimId === selectedClaim.id && e.status === 'coordinating');
        
        if (existingEvent) {
          // Agregar slot a evento en coordinación existente
          const { error: slotErr } = await supabase.from('event_slots').insert({
            event_id: existingEvent.id,
            slot_date: slotDate,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            status: 'proposed',
            rejection_reason: '[Slot tentativo desde calendario]'
          });
          if (slotErr) throw slotErr;

          // Asignar PA si no lo tenía
          if (selectedPaId) {
            const hasPaPart = existingEvent.participants?.some(p => p.participantType === 'public_adjuster');
            if (!hasPaPart) {
              await supabase.from('event_participants').insert({
                event_id: existingEvent.id,
                participant_type: 'public_adjuster',
                role_type: 'actor',
                public_adjuster_id: selectedPaId
              });
            }
          }
        } else {
          // Crear nuevo evento en Stage 1 (Awaiting Carrier Slots / coordinating)
          const newEvt = await schedulingService.createEvent({
            claimId: selectedClaim.id,
            eventType,
            publicAdjusterId: selectedPaId || undefined,
            location: selectedClaim.propertyAddress,
            coordinationStage: '1_awaiting_carrier_slots',
            status: 'coordinating',
            accessInstructions: accessNotes || undefined,
            participants: selectedPaId ? [
              {
                participantType: 'public_adjuster',
                roleType: 'actor',
                publicAdjusterId: selectedPaId
              }
            ] : undefined,
            notes: transitAnalysis?.summaryMessage ? `[Logística Transporte]: ${transitAnalysis.summaryMessage}` : undefined
          });

          // Insertar el slot propuesto en event_slots
          await supabase.from('event_slots').insert({
            event_id: newEvt.id,
            slot_date: slotDate,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            status: 'proposed',
            rejection_reason: '[Slot tentativo desde calendario]'
          });
        }

        success('Opción Tentativa Guardada', `⏱️ Se guardó en el Funnel en coordinación para el ${formatUsDate(slotDate)}. Sin envío de emails.`);
      } else {
        // MODO CONFIRMADO EN FIRME (Stage 4)
        await schedulingService.createEvent({
          claimId: selectedClaim.id,
          eventType,
          publicAdjusterId: selectedPaId || undefined,
          location: selectedClaim.propertyAddress,
          finalDate: slotDate,
          finalStartTime: `${startTime}:00`,
          finalEndTime: `${endTime}:00`,
          coordinationStage: '4_confirmed',
          status: 'scheduled',
          accessInstructions: accessNotes || undefined,
          participants: selectedPaId ? [
            {
              participantType: 'public_adjuster',
              roleType: 'actor',
              publicAdjusterId: selectedPaId
            }
          ] : undefined,
          notes: transitAnalysis?.summaryMessage ? `[Logística Transporte]: ${transitAnalysis.summaryMessage}` : undefined
        });

        success('Cita Confirmada', `✓ Inspección confirmada en firme para el ${formatUsDate(slotDate)}. Sin emails automáticos.`);
      }

      onEventCreated();
      onClose();
    } catch (err: any) {
      console.error('Error creating event:', err);
      error('Error al agendar', err.message || 'Error al agendar el evento');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Top Accent Stripe with PA color */}
        <div 
          className="h-2.5 w-full transition-colors" 
          style={{ backgroundColor: currentPa?.colorCode || '#0284c7' }}
        />

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                🟢 Espacio Libre
              </span>
              <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                {formatUsDate(slotDate)}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 font-['Montserrat',sans-serif]">
              Agendar Inspección en Horario Libre
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cálculo de logística y tiempo de manejo entre citas previas y posteriores.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Step 1: PA Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Public Adjuster (PA) Asignado
            </label>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full shrink-0 shadow-2xs border border-white" 
                style={{ backgroundColor: currentPa?.colorCode || '#0284c7' }}
              />
              <select
                value={selectedPaId}
                onChange={(e) => setSelectedPaId(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white"
              >
                {pas.filter(p => p.isActive !== false).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role || 'Adjuster'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2: Claim Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Seleccionar Reclamo (Claim)
            </label>
            
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por claim #, asegurado o dirección..."
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Claims Dropdown / Selector List */}
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-2xs">
              {filteredClaims.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 italic">
                  No se encontraron reclamos con ese criterio
                </div>
              ) : (
                filteredClaims.map((claim) => {
                  const isSelected = claim.id === selectedClaimId;
                  return (
                    <div
                      key={claim.id}
                      onClick={() => setSelectedClaimId(claim.id)}
                      className={`p-2.5 cursor-pointer text-xs transition-colors flex items-center justify-between ${
                        isSelected 
                          ? 'bg-tealBrand-50 text-tealBrand-900 font-bold border-l-4 border-tealBrand-600' 
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-700 font-bold">
                            #{claim.claimNumber}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                            {claim.carrier}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-900 mt-0.5">
                          👤 {claim.insured?.name || 'Asegurado sin nombre'}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{cleanAddress(claim.propertyAddress)}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-tealBrand-600 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Step 3: Event Type & Time Range */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tipo de Evento
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white"
              >
                <option value="Initial Inspection">Initial Inspection</option>
                <option value="Carrier Re-Inspection">Carrier Re-Inspection</option>
                <option value="Appraisal Meeting">Appraisal Meeting</option>
                <option value="Umpire Inspection">Umpire Inspection</option>
                <option value="Mediation">Mediation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Hora Inicio
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Hora Fin
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Step 4: Booking Mode Selector (Tentativo vs Confirmado en Firme) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">
                Modalidad en el Funnel
              </label>
              <span className="text-[10px] text-slate-500 font-medium">
                🔒 No envía correos automáticos
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBookingMode('tentative')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  bookingMode === 'tentative'
                    ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-950">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Opción Tentativa (Recomendado)</span>
                </div>
                <p className="text-[10px] text-slate-600 mt-1 leading-snug">
                  Se registra en el Funnel en coordinación (Stage 1 / Slot propuesto). Sin confirmación en firme ni correos.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setBookingMode('confirmed')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  bookingMode === 'confirmed'
                    ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-300 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-950">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Confirmar en Firme</span>
                </div>
                <p className="text-[10px] text-slate-600 mt-1 leading-snug">
                  Pasa directo a la columna "Confirmed" del Funnel (solo si ya se acordó por llamada).
                </p>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 4: BIDIRECTIONAL TRANSIT LOGISTICS REPORT (Antes y Después) */}
          {/* ========================================================================= */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 font-['Montserrat',sans-serif]">
                <Car className="w-4 h-4 text-tealBrand-700" />
                <span>
                  Logística de Manejo {currentPa ? `para ${currentPa.name}` : ''} (Ruta exclusiva de este PA)
                </span>
              </div>
              {isAnalyzingTransit && (
                <div className="flex items-center gap-1 text-[11px] text-tealBrand-700 font-semibold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Calculando ruta...</span>
                </div>
              )}
            </div>

            {!selectedPaId || selectedPaId === 'all' || selectedPaId === 'unassigned' ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                ⚠️ Selecciona un Public Adjuster (PA) arriba para calcular los tiempos de traslado de su ruta personal.
              </p>
            ) : !selectedClaim ? (
              <p className="text-xs text-slate-400 italic">
                Selecciona un reclamo arriba para calcular el tiempo de manejo entre las citas previas y posteriores de {currentPa?.name || 'este PA'}.
              </p>
            ) : transitAnalysis ? (
              <div className="space-y-2">
                {/* Leg 1: Previous Appointment -> Target */}
                {transitAnalysis.previousAppointment && transitAnalysis.legToNewEvent ? (
                  <div className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                    transitAnalysis.legToNewEvent.status === 'conflict'
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : transitAnalysis.legToNewEvent.status === 'tight'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-1.5">
                        <span>🚗 1. Trayecto de Llegada (Cita Anterior)</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          (Termina {format12Hour(transitAnalysis.previousAppointment.endTime)})
                        </span>
                      </div>
                      <span className="font-extrabold text-tealBrand-800">
                        ⏱️ {transitAnalysis.legToNewEvent.durationFormatted}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between">
                      <span className="truncate max-w-[320px]">
                        Desde: {cleanAddress(transitAnalysis.previousAppointment.location)}
                      </span>
                      <a
                        href={transitAnalysis.legToNewEvent.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-tealBrand-600 hover:underline flex items-center gap-0.5 text-[10px] font-bold shrink-0"
                      >
                        Ver mapa <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <div className="text-[10px] font-extrabold pt-0.5">
                      {transitAnalysis.legToNewEvent.statusMessage}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2 font-medium">
                    ✓ Primera cita del día para este PA: Salida directa sin cita previa.
                  </div>
                )}

                {/* Leg 2: Target -> Next Appointment */}
                {transitAnalysis.nextAppointment && transitAnalysis.legFromNewEvent ? (
                  <div className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                    transitAnalysis.legFromNewEvent.status === 'conflict'
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : transitAnalysis.legFromNewEvent.status === 'tight'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-1.5">
                        <span>🚗 2. Trayecto de Salida (Cita Posterior)</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          (Inicia {format12Hour(transitAnalysis.nextAppointment.startTime)})
                        </span>
                      </div>
                      <span className="font-extrabold text-tealBrand-800">
                        ⏱️ {transitAnalysis.legFromNewEvent.durationFormatted}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between">
                      <span className="truncate max-w-[320px]">
                        Hacia: {cleanAddress(transitAnalysis.nextAppointment.location)}
                      </span>
                      <a
                        href={transitAnalysis.legFromNewEvent.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-tealBrand-600 hover:underline flex items-center gap-0.5 text-[10px] font-bold shrink-0"
                      >
                        Ver mapa <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <div className="text-[10px] font-extrabold pt-0.5">
                      {transitAnalysis.legFromNewEvent.statusMessage}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2 font-medium">
                    ✓ Última cita del día para este PA: Sin citas posteriores que condicionen la salida.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Access / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Notas de Acceso o Lockbox (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Lockbox 1234, puerta trasera, perro en el patio..."
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !selectedClaimId}
              className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                bookingMode === 'tentative'
                  ? 'bg-amber-700 hover:bg-amber-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : bookingMode === 'tentative' ? (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  <span>Guardar Opción Tentativa</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar en Firme</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { 
  X, 
  Pencil, 
  Calendar, 
  MapPin, 
  Users, 
  Bell, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { useToast } from '../context/ToastContext';
import type { 
  CoordinationEvent, 
  Claim, 
  PublicAdjuster, 
  CarrierRepresentative, 
  ExternalActor, 
  CoordinationStage, 
  CoordinationParty,
  EventStatus
} from '../types';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CoordinationEvent;
  claim: Claim;
  pas: PublicAdjuster[];
  carrierReps?: CarrierRepresentative[];
  externalActors?: ExternalActor[];
  onSaved: () => void | Promise<any>;
  onOpenClaimDetail?: (claim: Claim) => void;
}

const DEFAULT_EVENT_TYPES = [
  'Initial Inspection',
  'Carrier Re-Inspection',
  'Appraisal Meeting',
  'Umpire Inspection',
  'Contractor Walkthrough',
  'Structural / Engineering Inspection',
  'Plumber / Leak Detection',
  'Underwriting Inspection',
  'Other Inspection',
];

export function EditEventModal({
  isOpen,
  onClose,
  event,
  claim,
  pas,
  carrierReps = [],
  externalActors = [],
  onSaved,
  onOpenClaimDetail,
}: EditEventModalProps) {
  const toast = useToast();

  const [eventType, setEventType] = useState(event.eventType || 'Initial Inspection');
  const [customEventType, setCustomEventType] = useState('');
  const [coordinationStage, setCoordinationStage] = useState<CoordinationStage>(event.coordinationStage || '1_awaiting_carrier_slots');
  const [eventStatus, setEventStatus] = useState<EventStatus>(event.status || 'coordinating');
  const [coordinationSequence, setCoordinationSequence] = useState<CoordinationParty[]>(['carrier', 'pa', 'insured']);
  const [timezone, setTimezone] = useState<'CT' | 'ET'>((event.timezone as 'CT' | 'ET') || 'ET');

  // Location & Access
  const [location, setLocation] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [lockboxCode, setLockboxCode] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [notes, setNotes] = useState('');

  // Confirmed details (Stage 4)
  const [finalDate, setFinalDate] = useState('');
  const [finalStartTime, setFinalStartTime] = useState('09:00');
  const [finalEndTime, setFinalEndTime] = useState('11:00');

  // Participants: In-Person Attendees (Actors)
  const [attendInsured, setAttendInsured] = useState(true);
  const [attendAssignedPa, setAttendAssignedPa] = useState(true);
  const [attendRepIds, setAttendRepIds] = useState<string[]>([]);
  const [attendExtActorIds, setAttendExtActorIds] = useState<string[]>([]);
  const [supportPaIds, setSupportPaIds] = useState<string[]>([]);
  const [additionalExtIds, setAdditionalExtIds] = useState<string[]>([]);

  // Participants: Informed / Notify (CC)
  const [notifyPaIds, setNotifyPaIds] = useState<string[]>([]);
  const [notifyExtIds, setNotifyExtIds] = useState<string[]>([]);
  const [customNotifyList, setCustomNotifyList] = useState<Array<{ id: string; name: string; email?: string; phone?: string }>>([]);
  const [showAddCustomNotify, setShowAddCustomNotify] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomEmail, setNewCustomEmail] = useState('');
  const [newCustomPhone, setNewCustomPhone] = useState('');

  // Directory lists
  const [directoryExternals, setDirectoryExternals] = useState<ExternalActor[]>(externalActors);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalActors.length > 0) {
      setDirectoryExternals(externalActors);
    } else {
      schedulingService.getExternalActors().then(setDirectoryExternals).catch(() => {});
    }
  }, [externalActors]);

  useEffect(() => {
    if (isOpen && event) {
      setError(null);

      // Event Type
      const isStandard = DEFAULT_EVENT_TYPES.includes(event.eventType);
      if (isStandard) {
        setEventType(event.eventType);
        setCustomEventType('');
      } else {
        setEventType('Other');
        setCustomEventType(event.eventType);
      }

      setCoordinationStage(event.coordinationStage || '1_awaiting_carrier_slots');
      setEventStatus(event.status || 'coordinating');

      const initialSeq = event.coordinationSequence || (
        event.slotsOriginator === 'insured' ? ['insured', 'pa', 'carrier'] :
        event.slotsOriginator === 'pa' ? ['pa', 'insured', 'carrier'] :
        ['carrier', 'pa', 'insured']
      );
      setCoordinationSequence(initialSeq as CoordinationParty[]);
      setTimezone((event.timezone as 'CT' | 'ET') || 'ET');

      setLocation(event.location || claim.propertyAddress || '');
      setGateCode(event.gateCode || '');
      setLockboxCode(event.lockboxCode || '');
      setAccessInstructions(event.accessInstructions || '');
      
      // Clean notes from internal tags
      const cleanNotes = (event.notes || '')
        .replace(/\[CoordinationOrder:[^\]]*\]/g, '')
        .replace(/\[SlotsOriginator:[^\]]*\]/g, '')
        .replace(/\[Timezone:[^\]]*\]/g, '')
        .trim();
      setNotes(cleanNotes);

      // Confirmed appointment
      setFinalDate(event.finalDate || '');
      setFinalStartTime(event.finalStartTime?.slice(0, 5) || '09:00');
      setFinalEndTime(event.finalEndTime?.slice(0, 5) || '11:00');

      // Participants
      const participants = event.participants || [];
      const actors = participants.filter((p) => !p.roleType || p.roleType === 'actor');
      const informed = participants.filter((p) => p.roleType === 'informed');

      setAttendInsured(actors.some((p) => p.participantType === 'insured'));
      setAttendAssignedPa(actors.some((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId === claim.publicAdjusterId));
      setAttendRepIds(actors.filter((p) => p.participantType === 'carrier_representative' && p.carrierRepId).map((p) => p.carrierRepId!));
      setAttendExtActorIds(actors.filter((p) => p.participantType === 'external_actor' && p.externalActorId && (claim.externalActors || []).some(a => a.id === p.externalActorId)).map((p) => p.externalActorId!));
      setSupportPaIds(actors.filter((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId && p.publicAdjusterId !== claim.publicAdjusterId).map((p) => p.publicAdjusterId!));
      setAdditionalExtIds(actors.filter((p) => p.participantType === 'external_actor' && p.externalActorId && !(claim.externalActors || []).some(a => a.id === p.externalActorId)).map((p) => p.externalActorId!));

      setNotifyPaIds(informed.filter((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId).map((p) => p.publicAdjusterId!));
      setNotifyExtIds(informed.filter((p) => p.participantType === 'external_actor' && p.externalActorId).map((p) => p.externalActorId!));
      
      const customInformed = informed.filter((p) => p.participantType === 'office' && p.customName).map((p) => ({
        id: p.id || Math.random().toString(),
        name: p.customName || '',
        email: p.customEmail || undefined,
        phone: p.customPhone || undefined,
      }));
      setCustomNotifyList(customInformed);
      setShowAddCustomNotify(false);
    }
  }, [isOpen, event, claim]);

  if (!isOpen) return null;

  const handleSelectStepParty = (index: number, party: CoordinationParty) => {
    const newSeq = [...coordinationSequence];
    const prevAtPos = newSeq[index];
    const otherIdx = newSeq.findIndex((p, i) => i !== index && p === party);
    if (otherIdx !== -1) {
      newSeq[otherIdx] = prevAtPos;
    }
    newSeq[index] = party;
    setCoordinationSequence(newSeq);
  };

  const handleAddCustomNotify = () => {
    if (!newCustomName.trim()) return;
    setCustomNotifyList([
      ...customNotifyList,
      {
        id: Math.random().toString(),
        name: newCustomName.trim(),
        email: newCustomEmail.trim() || undefined,
        phone: newCustomPhone.trim() || undefined,
      },
    ]);
    setNewCustomName('');
    setNewCustomEmail('');
    setNewCustomPhone('');
    setShowAddCustomNotify(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalEventType = eventType === 'Other' ? customEventType.trim() : eventType;
    if (!finalEventType) {
      setError('Please select or enter an event type.');
      return;
    }

    if (!location.trim()) {
      setError('Please provide an event location address.');
      return;
    }

    if (coordinationStage === '4_confirmed') {
      if (!finalDate) {
        setError('Please enter the confirmed appointment date for Stage 4.');
        return;
      }
      if (!finalStartTime || !finalEndTime) {
        setError('Please enter start and end time for the appointment.');
        return;
      }
    }

    setSaving(true);
    try {
      // Build participants payload
      const participants: Array<{
        participantType: 'insured' | 'public_adjuster' | 'carrier_representative' | 'external_actor' | 'office';
        roleType: 'actor' | 'informed';
        publicAdjusterId?: string;
        carrierRepId?: string;
        externalActorId?: string;
        insuredId?: string;
        customName?: string;
        customEmail?: string;
        customPhone?: string;
      }> = [];

      // 1. Actors
      if (attendInsured && claim.insuredId) {
        participants.push({ participantType: 'insured', roleType: 'actor', insuredId: claim.insuredId });
      }
      if (attendAssignedPa && claim.publicAdjusterId) {
        participants.push({ participantType: 'public_adjuster', roleType: 'actor', publicAdjusterId: claim.publicAdjusterId });
      }
      attendRepIds.forEach((id) => {
        participants.push({ participantType: 'carrier_representative', roleType: 'actor', carrierRepId: id });
      });
      attendExtActorIds.forEach((id) => {
        participants.push({ participantType: 'external_actor', roleType: 'actor', externalActorId: id });
      });
      supportPaIds.forEach((id) => {
        participants.push({ participantType: 'public_adjuster', roleType: 'actor', publicAdjusterId: id });
      });
      additionalExtIds.forEach((id) => {
        participants.push({ participantType: 'external_actor', roleType: 'actor', externalActorId: id });
      });

      // 2. Informed
      notifyPaIds.forEach((id) => {
        participants.push({ participantType: 'public_adjuster', roleType: 'informed', publicAdjusterId: id });
      });
      notifyExtIds.forEach((id) => {
        participants.push({ participantType: 'external_actor', roleType: 'informed', externalActorId: id });
      });
      customNotifyList.forEach((c) => {
        participants.push({
          participantType: 'office',
          roleType: 'informed',
          customName: c.name,
          customEmail: c.email,
          customPhone: c.phone,
        });
      });

      // Update event
      await schedulingService.updateEvent(event.id, {
        eventType: finalEventType,
        status: eventStatus,
        coordinationStage,
        slotsOriginator: coordinationStage === '4_confirmed' ? undefined : coordinationSequence[0],
        coordinationSequence: coordinationStage === '4_confirmed' ? undefined : coordinationSequence,
        location: location.trim(),
        gateCode: gateCode.trim() || undefined,
        lockboxCode: lockboxCode.trim() || undefined,
        accessInstructions: accessInstructions.trim() || undefined,
        notes: notes.trim() || undefined,
        finalDate: coordinationStage === '4_confirmed' ? finalDate : undefined,
        finalStartTime: coordinationStage === '4_confirmed' ? finalStartTime : undefined,
        finalEndTime: coordinationStage === '4_confirmed' ? finalEndTime : undefined,
        participants,
      });

      // Update timezone if changed
      if (timezone !== event.timezone) {
        await schedulingService.setEventTimezone(event.id, timezone);
      }

      toast.success('Evento actualizado', 'Los datos del evento se han guardado exitosamente.');
      await onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error updating event:', err);
      setError(err.message || 'Error updating event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const assignedPa = pas.find((p) => p.id === claim.publicAdjusterId);
  const claimCarrierReps = claim.carrierReps || carrierReps.filter((r) => r.carrierName === claim.carrier);
  const claimExternalActors = claim.externalActors || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full my-6 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-maroon-100 border border-maroon-200 flex items-center justify-center text-maroon-800 shrink-0 shadow-2xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  Edit Event: {event.eventType}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-maroon-50 text-maroon-800 border border-maroon-200">
                  {claim.claimNumber}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-tealBrand-50 text-tealBrand-800 font-semibold border border-tealBrand-200">
                  {claim.carrier}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                Client: <strong>{claim.insured?.name || 'Insured Client'}</strong> · {claim.propertyAddress || 'No property address'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Timezone pill button */}
            <button
              type="button"
              onClick={() => setTimezone(timezone === 'CT' ? 'ET' : 'CT')}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                timezone === 'CT'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
              }`}
              title={`Click to switch between Central Time and Eastern Time`}
            >
              <span>{timezone === 'CT' ? '🏖️ Central (CT)' : '🌴 Eastern (ET)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL FORM BODY */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* SECTION: BASIC EVENT INFORMATION */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-tealBrand-700" />
              <span>Event Classification & Status</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Event Type */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Event Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-maroon-800"
                >
                  {DEFAULT_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="Other">Other (Custom type...)</option>
                </select>

                {eventType === 'Other' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customEventType}
                      onChange={(e) => setCustomEventType(e.target.value)}
                      placeholder="Specify custom type name..."
                      className="w-full bg-white border border-maroon-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* Coordination Stage */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Funnel Stage
                </label>
                <select
                  value={coordinationStage}
                  onChange={(e) => setCoordinationStage(e.target.value as CoordinationStage)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-maroon-800"
                >
                  <option value="1_awaiting_carrier_slots">Stage 1: Awaiting Date Options</option>
                  <option value="2_pa_review">Stage 2: Review / Filter Dates</option>
                  <option value="3_insured_selection">Stage 3: Final Party Selection</option>
                  <option value="4_confirmed">Stage 4: Confirmed & Scheduled</option>
                </select>
              </div>

              {/* Event Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value as EventStatus)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-maroon-800"
                >
                  <option value="coordinating">Coordinating</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Sequence Order (Only when not confirmed) */}
            {coordinationStage !== '4_confirmed' && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">Coordination Flow Order:</span>
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                    <span>{coordinationSequence[0] === 'insured' ? 'Client' : coordinationSequence[0] === 'pa' ? 'PA' : 'Carrier'}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                    <span>{coordinationSequence[1] === 'insured' ? 'Client' : coordinationSequence[1] === 'pa' ? 'PA' : 'Carrier'}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                    <span>{coordinationSequence[2] === 'insured' ? 'Client' : coordinationSequence[2] === 'pa' ? 'PA' : 'Carrier'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">1. Proposes Dates:</span>
                    <select
                      value={coordinationSequence[0]}
                      onChange={(e) => handleSelectStepParty(0, e.target.value as CoordinationParty)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value="carrier">🏢 Carrier (Adjuster)</option>
                      <option value="pa">⚖️ Public Adjuster (PA)</option>
                      <option value="insured">👤 Client / Insured</option>
                    </select>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">2. Reviews / Filters:</span>
                    <select
                      value={coordinationSequence[1]}
                      onChange={(e) => handleSelectStepParty(1, e.target.value as CoordinationParty)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value="pa">⚖️ Public Adjuster (PA)</option>
                      <option value="insured">👤 Client / Insured</option>
                      <option value="carrier">🏢 Carrier (Adjuster)</option>
                    </select>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">3. Final Choice:</span>
                    <select
                      value={coordinationSequence[2]}
                      onChange={(e) => handleSelectStepParty(2, e.target.value as CoordinationParty)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value="insured">👤 Client / Insured</option>
                      <option value="carrier">🏢 Carrier (Adjuster)</option>
                      <option value="pa">⚖️ Public Adjuster (PA)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmed Details if Stage 4 */}
            {coordinationStage === '4_confirmed' && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Confirmed Appointment Schedule</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Confirmed Date *</label>
                    <input
                      type="date"
                      value={finalDate}
                      onChange={(e) => setFinalDate(e.target.value)}
                      required={coordinationStage === '4_confirmed'}
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Start Time *</label>
                    <input
                      type="time"
                      value={finalStartTime}
                      onChange={(e) => setFinalStartTime(e.target.value)}
                      required={coordinationStage === '4_confirmed'}
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">End Time *</label>
                    <input
                      type="time"
                      value={finalEndTime}
                      onChange={(e) => setFinalEndTime(e.target.value)}
                      required={coordinationStage === '4_confirmed'}
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: LOCATION & ACCESS */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-maroon-800" />
              <span>Location & Access Details</span>
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Event Location Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Street Address, City, State, ZIP"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gate / Community Code</label>
                <input
                  type="text"
                  value={gateCode}
                  onChange={(e) => setGateCode(e.target.value)}
                  placeholder="e.g. #1234 or Call box instructions"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lockbox / Key Code</label>
                <input
                  type="text"
                  value={lockboxCode}
                  onChange={(e) => setLockboxCode(e.target.value)}
                  placeholder="e.g. 5678 (Master lock)"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Access Instructions</label>
              <input
                type="text"
                value={accessInstructions}
                onChange={(e) => setAccessInstructions(e.target.value)}
                placeholder="e.g. Park on driveway, beware of dog, knock loudly"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
              />
            </div>
          </div>

          {/* SECTION: IN-PERSON ATTENDEES */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-tealBrand-800" />
                <span>In-Person Attendees (Actors)</span>
              </h4>
              <span className="text-[10px] text-slate-500">Must be present on site</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Insured */}
              {claim.insured && (
                <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100/80">
                  <input
                    type="checkbox"
                    checked={attendInsured}
                    onChange={(e) => setAttendInsured(e.target.checked)}
                    className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                  />
                  <div className="truncate">
                    <span className="font-bold text-slate-900 block truncate">{claim.insured.name}</span>
                    <span className="text-[10px] text-slate-500 block">Insured Policyholder</span>
                  </div>
                </label>
              )}

              {/* Assigned PA */}
              {assignedPa && (
                <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100/80">
                  <input
                    type="checkbox"
                    checked={attendAssignedPa}
                    onChange={(e) => setAttendAssignedPa(e.target.checked)}
                    className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                  />
                  <div className="truncate">
                    <span className="font-bold text-slate-900 block truncate">{assignedPa.name}</span>
                    <span className="text-[10px] text-slate-500 block">Assigned Public Adjuster</span>
                  </div>
                </label>
              )}

              {/* Claim Carrier Reps */}
              {claimCarrierReps.map((rep) => {
                const isChecked = attendRepIds.includes(rep.id);
                return (
                  <label key={rep.id} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100/80">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) setAttendRepIds([...attendRepIds, rep.id]);
                        else setAttendRepIds(attendRepIds.filter((id) => id !== rep.id));
                      }}
                      className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                    />
                    <div className="truncate">
                      <span className="font-bold text-slate-900 block truncate">{rep.name}</span>
                      <span className="text-[10px] text-slate-500 block">{rep.typeOfRepresentative || 'Carrier Rep'} ({rep.company || rep.carrierName})</span>
                    </div>
                  </label>
                );
              })}

              {/* Claim External Actors */}
              {claimExternalActors.map((ext) => {
                const isChecked = attendExtActorIds.includes(ext.id);
                return (
                  <label key={ext.id} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100/80">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) setAttendExtActorIds([...attendExtActorIds, ext.id]);
                        else setAttendExtActorIds(attendExtActorIds.filter((id) => id !== ext.id));
                      }}
                      className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                    />
                    <div className="truncate">
                      <span className="font-bold text-slate-900 block truncate">{ext.name}</span>
                      <span className="text-[10px] text-slate-500 block">{ext.typeOfActor} ({ext.company || 'External'})</span>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Support PA Picker */}
            <div className="pt-2 border-t border-slate-200/60 space-y-2">
              <span className="text-[11px] font-semibold text-slate-600 block">Add Support PA or Additional Specialist:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !supportPaIds.includes(e.target.value)) {
                      setSupportPaIds([...supportPaIds, e.target.value]);
                    }
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
                >
                  <option value="">+ Add Support PA (PA de apoyo)...</option>
                  {pas
                    .filter((p) => p.id !== claim.publicAdjusterId && !supportPaIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>PA: {p.name} ({p.role.replace('_', ' ')})</option>
                    ))}
                </select>

                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !additionalExtIds.includes(e.target.value)) {
                      setAdditionalExtIds([...additionalExtIds, e.target.value]);
                    }
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
                >
                  <option value="">+ Add Specialist / Contractor...</option>
                  {directoryExternals
                    .filter((ext) => !attendExtActorIds.includes(ext.id) && !additionalExtIds.includes(ext.id))
                    .map((ext) => (
                      <option key={ext.id} value={ext.id}>{ext.name} ({ext.typeOfActor} - {ext.company || 'Indep'})</option>
                    ))}
                </select>
              </div>

              {/* Support Attendees Badges */}
              {(supportPaIds.length > 0 || additionalExtIds.length > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {supportPaIds.map((id) => {
                    const p = pas.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <span>Support PA: {p?.name || id}</span>
                        <button
                          type="button"
                          onClick={() => setSupportPaIds(supportPaIds.filter((x) => x !== id))}
                          className="text-amber-700 hover:text-amber-950 font-bold ml-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}

                  {additionalExtIds.map((id) => {
                    const ext = directoryExternals.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 bg-tealBrand-50 text-tealBrand-900 border border-tealBrand-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <span>{ext?.name || id} ({ext?.typeOfActor})</span>
                        <button
                          type="button"
                          onClick={() => setAdditionalExtIds(additionalExtIds.filter((x) => x !== id))}
                          className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SECTION: NOTIFY / KEEP INFORMED (CC) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-tealBrand-700" />
                <span>Notify / Keep Informed (CC & Updates)</span>
              </h4>
              <span className="text-[10px] text-slate-500">Receive schedule logs & notices</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !notifyPaIds.includes(e.target.value)) {
                    setNotifyPaIds([...notifyPaIds, e.target.value]);
                  }
                }}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
              >
                <option value="">+ Select PA to Keep Informed...</option>
                {pas
                  .filter((p) => !notifyPaIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>PA: {p.name}</option>
                  ))}
              </select>

              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !notifyExtIds.includes(e.target.value)) {
                    setNotifyExtIds([...notifyExtIds, e.target.value]);
                  }
                }}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
              >
                <option value="">+ Select Specialist to Keep Informed...</option>
                {directoryExternals
                  .filter((ext) => !notifyExtIds.includes(ext.id))
                  .map((ext) => (
                    <option key={ext.id} value={ext.id}>{ext.name} ({ext.typeOfActor})</option>
                  ))}
              </select>
            </div>

            {/* Custom Office / External contact button */}
            {!showAddCustomNotify ? (
              <button
                type="button"
                onClick={() => setShowAddCustomNotify(true)}
                className="text-xs font-semibold text-tealBrand-800 hover:text-tealBrand-900 flex items-center gap-1 cursor-pointer pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Custom Contact or Office CC...</span>
              </button>
            ) : (
              <div className="p-3 bg-white border border-tealBrand-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                <span className="text-[11px] font-bold text-tealBrand-900 block">Add Custom Recipient:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    placeholder="Full Name *"
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                  <input
                    type="email"
                    value={newCustomEmail}
                    onChange={(e) => setNewCustomEmail(e.target.value)}
                    placeholder="Email address"
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={newCustomPhone}
                    onChange={(e) => setNewCustomPhone(e.target.value)}
                    placeholder="Phone number"
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomNotify(false)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomNotify}
                    disabled={!newCustomName.trim()}
                    className="px-3 py-1 bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-50 text-white text-xs font-bold rounded cursor-pointer"
                  >
                    Add Recipient
                  </button>
                </div>
              </div>
            )}

            {/* Badges for Informed Recipients */}
            {(notifyPaIds.length > 0 || notifyExtIds.length > 0 || customNotifyList.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {notifyPaIds.map((id) => {
                  const p = pas.find((x) => x.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-medium">
                      <span>CC PA: {p?.name || id}</span>
                      <button
                        type="button"
                        onClick={() => setNotifyPaIds(notifyPaIds.filter((x) => x !== id))}
                        className="text-slate-500 hover:text-slate-800 font-bold ml-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}

                {notifyExtIds.map((id) => {
                  const ext = directoryExternals.find((x) => x.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-medium">
                      <span>CC: {ext?.name || id}</span>
                      <button
                        type="button"
                        onClick={() => setNotifyExtIds(notifyExtIds.filter((x) => x !== id))}
                        className="text-slate-500 hover:text-slate-800 font-bold ml-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}

                {customNotifyList.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 bg-tealBrand-100/70 text-tealBrand-900 border border-tealBrand-200 px-2 py-0.5 rounded text-[11px] font-medium">
                    <span>CC: {c.name} {c.email ? `(${c.email})` : ''}</span>
                    <button
                      type="button"
                      onClick={() => setCustomNotifyList(customNotifyList.filter((x) => x.id !== c.id))}
                      className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: NOTES & INSTRUCTIONS */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              Event Notes / Instructions
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Additional coordination context, special adjuster requests, etc."
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 resize-none"
            />
          </div>

          {/* MODAL FOOTER */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div>
              {onOpenClaimDetail && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenClaimDetail(claim);
                    onClose();
                  }}
                  className="text-xs font-semibold text-maroon-800 hover:text-maroon-900 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Open full claim page with history and file documents"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Claim Details</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                className="px-5 py-2 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

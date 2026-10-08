import { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  MapPin, 
  Phone, 
  Mail, 
  User, 
  Briefcase, 
  Building2, 
  Scale, 
  Plus, 
  Calendar, 
  Clock, 
  Check, 
  AlertCircle, 
  ArrowRight, 
  Shield, 
  Layers, 
  Edit3, 
  Trash2, 
  Copy,
  X,
  Bell,
  Users
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import type { 
  Claim, 
  PublicAdjuster, 
  CoordinationEvent, 
  CoordinationStage,
  Insured,
  CarrierRepresentative,
  ExternalActor
} from '../types';

interface ClaimDetailViewProps {
  claim: Claim;
  onBack: () => void;
  pas: PublicAdjuster[];
  events: CoordinationEvent[];
  onEventCreated: () => void;
  onClaimUpdated: () => Promise<void>;
  onViewInFunnel: (claimNumber: string) => void;
}

const DEFAULT_EVENT_TYPES = [
  'Initial Inspection',
  'Carrier Re-Inspection',
  'Appraisal Meeting',
  'Umpire Inspection',
  'Contractor Walkthrough',
  'Structural / Engineering Inspection',
  'Plumber / Leak Detection',
  'Roof Assessment',
  'Examination Under Oath (EUO)',
  'Mediation / Settlement Conference',
  'Recorded Statement',
  'Underwriting Inspection',
  'Document Signing',
  'Other',
];

const STORAGE_KEY_EVENT_TYPES = 'ip_adjusters_custom_event_types';

type ActorEditTarget = 
  | { type: 'insured'; data: Insured }
  | { type: 'pa'; data: PublicAdjuster }
  | { type: 'carrierRep'; data: CarrierRepresentative }
  | { type: 'externalActor'; data: ExternalActor };

export function ClaimDetailView({
  claim,
  onBack,
  pas,
  events,
  onEventCreated,
  onClaimUpdated,
  onViewInFunnel,
}: ClaimDetailViewProps) {
  // Add Event Form State
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>(DEFAULT_EVENT_TYPES);
  const [eventType, setEventType] = useState('Initial Inspection');
  const [customEventType, setCustomEventType] = useState('');
  const [coordinationStage, setCoordinationStage] = useState<CoordinationStage>('1_awaiting_carrier_slots');
  const [location, setLocation] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [lockboxCode, setLockboxCode] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Directories for adding support actors or notify parties
  const [directoryPas, setDirectoryPas] = useState<PublicAdjuster[]>(pas);
  const [, setDirectoryReps] = useState<CarrierRepresentative[]>([]);
  const [directoryExternals, setDirectoryExternals] = useState<ExternalActor[]>([]);

  // Participants Attending in-person (role_type: 'actor')
  const [attendInsured, setAttendInsured] = useState(true);
  const [attendAssignedPa, setAttendAssignedPa] = useState(true);
  const [attendRepIds, setAttendRepIds] = useState<string[]>([]);
  const [attendExtActorIds, setAttendExtActorIds] = useState<string[]>([]);
  const [supportPaIds, setSupportPaIds] = useState<string[]>([]);
  const [additionalExtIds, setAdditionalExtIds] = useState<string[]>([]);

  // Participants to Notify Only (role_type: 'informed')
  const [notifyPaIds, setNotifyPaIds] = useState<string[]>([]);
  const [notifyExtIds, setNotifyExtIds] = useState<string[]>([]);
  const [customNotifyList, setCustomNotifyList] = useState<{ id: string; name: string; email?: string; phone?: string }[]>([]);
  const [showAddCustomNotify, setShowAddCustomNotify] = useState(false);
  const [customNotifyName, setCustomNotifyName] = useState('');
  const [customNotifyEmail, setCustomNotifyEmail] = useState('');
  const [customNotifyPhone, setCustomNotifyPhone] = useState('');

  // Quick Create Actor Modal State (from within New Event form)
  const [quickCreateModal, setQuickCreateModal] = useState<{
    type: 'pa' | 'external';
    target: 'attend_support' | 'notify' | 'attend_additional';
  } | null>(null);

  const [quickPaForm, setQuickPaForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'adjuster',
  });

  const [quickExtForm, setQuickExtForm] = useState({
    name: '',
    typeOfActor: 'Contractor',
    company: '',
    phone: '',
    email: '',
  });

  const [quickActorSaving, setQuickActorSaving] = useState(false);
  const [quickActorError, setQuickActorError] = useState<string | null>(null);

  // Load directories and stored event types
  useEffect(() => {
    Promise.all([
      schedulingService.getPublicAdjusters(),
      schedulingService.getCarrierReps(),
      schedulingService.getExternalActors(),
      schedulingService.getUniqueEventTypes(),
    ]).then(([dbPas, dbReps, dbExternals, dbEventTypes]) => {
      if (dbPas.length > 0) setDirectoryPas(dbPas);
      if (dbReps.length > 0) setDirectoryReps(dbReps);
      if (dbExternals.length > 0) setDirectoryExternals(dbExternals);

      let savedCustomTypes: string[] = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY_EVENT_TYPES);
        if (stored) savedCustomTypes = JSON.parse(stored);
      } catch (e) {
        console.warn('Failed parsing stored event types:', e);
      }

      const merged = Array.from(new Set([
        ...DEFAULT_EVENT_TYPES.filter(t => t !== 'Other'),
        ...savedCustomTypes,
        ...dbEventTypes
      ]));
      setAvailableEventTypes([...merged, 'Other']);
    }).catch(console.error);
  }, []);

  // Copied slot message state
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);

  // Actor Edit Modal State
  const [editingActor, setEditingActor] = useState<ActorEditTarget | null>(null);
  const [actorForm, setActorForm] = useState<any>({});
  const [savingActor, setSavingActor] = useState(false);
  const [actorError, setActorError] = useState<string | null>(null);

  // Claim Details Edit Modal State
  const [editingClaimInfo, setEditingClaimInfo] = useState(false);
  const [claimForm, setClaimForm] = useState({
    carrier: '',
    claimNumber: '',
    policyNumber: '',
    status: 'Open',
    typeOfLoss: 'Water Damage',
    propertyAddress: '',
    city: 'Miami',
    state: 'FL',
    zipCode: '',
    dateOfLoss: '',
    notes: '',
  });
  const [savingClaimInfo, setSavingClaimInfo] = useState(false);
  const [claimInfoError, setClaimInfoError] = useState<string | null>(null);

  const openEditClaimInfo = () => {
    setClaimForm({
      carrier: claim.carrier,
      claimNumber: claim.claimNumber,
      policyNumber: claim.policyNumber || '',
      status: claim.status || 'Open',
      typeOfLoss: claim.typeOfLoss || 'Water Damage',
      propertyAddress: claim.propertyAddress,
      city: claim.city || 'Miami',
      state: claim.state || 'FL',
      zipCode: claim.zipCode || '',
      dateOfLoss: claim.dateOfLoss || '',
      notes: claim.notes || '',
    });
    setClaimInfoError(null);
    setEditingClaimInfo(true);
  };

  const handleSaveClaimInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimForm.claimNumber.trim()) {
      setClaimInfoError('Claim number is required');
      return;
    }
    if (!claimForm.carrier.trim()) {
      setClaimInfoError('Carrier name is required');
      return;
    }
    if (!claimForm.propertyAddress.trim()) {
      setClaimInfoError('Property address is required');
      return;
    }

    setSavingClaimInfo(true);
    setClaimInfoError(null);
    try {
      await schedulingService.updateClaim(claim.id, {
        insuredId: claim.insuredId || (claim.insured?.id as string),
        carrier: claimForm.carrier.trim(),
        claimNumber: claimForm.claimNumber.trim(),
        policyNumber: claimForm.policyNumber.trim() || undefined,
        status: claimForm.status,
        typeOfLoss: claimForm.typeOfLoss,
        propertyAddress: claimForm.propertyAddress.trim(),
        city: claimForm.city.trim() || 'Miami',
        state: claimForm.state.trim() || 'FL',
        zipCode: claimForm.zipCode.trim() || undefined,
        dateOfLoss: claimForm.dateOfLoss || undefined,
        notes: claimForm.notes.trim() || undefined,
        publicAdjusterId: claim.publicAdjusterId,
        carrierRepId: claim.carrierReps?.[0]?.id,
        externalActorId: claim.externalActors?.[0]?.id,
      });

      await onClaimUpdated();
      setEditingClaimInfo(false);
    } catch (err: any) {
      console.error('Error updating claim details:', err);
      setClaimInfoError(err.message || 'Failed to update claim details');
    } finally {
      setSavingClaimInfo(false);
    }
  };

  // Actor Delete / Unlink Confirmation State
  const [deletingActor, setDeletingActor] = useState<{
    type: 'insured' | 'pa' | 'carrierRep' | 'externalActor';
    id: string;
    name: string;
    action: 'unlink' | 'deletePermanent';
  } | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Filter events belonging to this claim
  const claimEvents = events.filter((e) => e.claimId === claim.id);

  // Assigned PA
  const assignedPa = pas.find((p) => p.id === claim.publicAdjusterId) || claim.publicAdjuster;

  // Initialize event location and participant selections when opening form
  const handleOpenAddEvent = () => {
    setLocation(`${claim.propertyAddress}, ${claim.city || 'Miami'}, ${claim.state || 'FL'} ${claim.zipCode || ''}`.trim());
    setGateCode('');
    setLockboxCode('');
    setAccessInstructions('');
    setEventNotes('');
    setEventError(null);
    setEventType('Initial Inspection');
    setCustomEventType('');

    // Default In-Person Attendees
    setAttendInsured(Boolean(claim.insuredId));
    setAttendAssignedPa(Boolean(claim.publicAdjusterId));
    setAttendRepIds((claim.carrierReps || []).map(r => r.id));
    setAttendExtActorIds((claim.externalActors || []).map(a => a.id));
    setSupportPaIds([]);
    setAdditionalExtIds([]);

    // Default Notify Parties
    setNotifyPaIds([]);
    setNotifyExtIds([]);
    setCustomNotifyList([]);
    setShowAddCustomNotify(false);
    setCustomNotifyName('');
    setCustomNotifyEmail('');
    setCustomNotifyPhone('');

    setShowAddEvent(true);
  };

  const handleSaveQuickPa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPaForm.name.trim()) {
      setQuickActorError('PA full name is required');
      return;
    }
    setQuickActorSaving(true);
    setQuickActorError(null);
    try {
      const newPa = await schedulingService.createPublicAdjuster({
        name: quickPaForm.name.trim(),
        phone: quickPaForm.phone.trim() || undefined,
        email: quickPaForm.email.trim() || undefined,
        role: quickPaForm.role,
      });

      // Refresh PA directory
      const updatedPas = await schedulingService.getPublicAdjusters();
      setDirectoryPas(updatedPas);

      // Auto-assign to the intended participant group
      if (quickCreateModal?.target === 'attend_support') {
        setSupportPaIds((prev) => Array.from(new Set([...prev, newPa.id])));
      } else if (quickCreateModal?.target === 'notify') {
        setNotifyPaIds((prev) => Array.from(new Set([...prev, newPa.id])));
      }

      setQuickCreateModal(null);
      setQuickPaForm({ name: '', phone: '', email: '', role: 'adjuster' });
    } catch (err: any) {
      console.error('Failed to quick-create PA:', err);
      setQuickActorError(err.message || 'Failed to create Public Adjuster');
    } finally {
      setQuickActorSaving(false);
    }
  };

  const handleSaveQuickExt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickExtForm.name.trim()) {
      setQuickActorError('Contact name is required');
      return;
    }
    setQuickActorSaving(true);
    setQuickActorError(null);
    try {
      const newExt = await schedulingService.createExternalActor({
        name: quickExtForm.name.trim(),
        typeOfActor: quickExtForm.typeOfActor,
        company: quickExtForm.company.trim() || undefined,
        phone: quickExtForm.phone.trim() || undefined,
        email: quickExtForm.email.trim() || undefined,
      });

      // Refresh directory
      const updatedExts = await schedulingService.getExternalActors();
      setDirectoryExternals(updatedExts);

      // Auto-assign to the intended participant group
      if (quickCreateModal?.target === 'attend_additional') {
        setAdditionalExtIds((prev) => Array.from(new Set([...prev, newExt.id])));
      } else if (quickCreateModal?.target === 'notify') {
        setNotifyExtIds((prev) => Array.from(new Set([...prev, newExt.id])));
      }

      setQuickCreateModal(null);
      setQuickExtForm({ name: '', typeOfActor: 'Contractor', company: '', phone: '', email: '' });
    } catch (err: any) {
      console.error('Failed to quick-create external actor:', err);
      setQuickActorError(err.message || 'Failed to create specialist');
    } finally {
      setQuickActorSaving(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setEventError('Inspection location address is required');
      return;
    }

    let finalEventType = eventType;
    if (eventType === 'Other') {
      const trimmed = customEventType.trim();
      if (!trimmed) {
        setEventError('Please enter the custom event type name');
        return;
      }
      finalEventType = trimmed;
      // Persist in localStorage and available types
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_EVENT_TYPES) || '[]');
        const updated = Array.from(new Set([...stored, finalEventType]));
        localStorage.setItem(STORAGE_KEY_EVENT_TYPES, JSON.stringify(updated));
        setAvailableEventTypes(prev => Array.from(new Set([...prev.filter(t => t !== 'Other'), finalEventType, 'Other'])));
      } catch (err) {
        console.warn('Failed saving custom event type:', err);
      }
    }

    setSubmittingEvent(true);
    setEventError(null);

    try {
      const participants: any[] = [];

      // 1. IN-PERSON ATTENDEES (role_type: 'actor')
      if (attendInsured && claim.insuredId) {
        participants.push({
          participantType: 'insured',
          roleType: 'actor',
          insuredId: claim.insuredId,
        });
      }
      if (attendAssignedPa && claim.publicAdjusterId) {
        participants.push({
          participantType: 'public_adjuster',
          roleType: 'actor',
          publicAdjusterId: claim.publicAdjusterId,
        });
      }
      attendRepIds.forEach((repId) => {
        participants.push({
          participantType: 'carrier_representative',
          roleType: 'actor',
          carrierRepId: repId,
        });
      });
      attendExtActorIds.forEach((extId) => {
        participants.push({
          participantType: 'external_actor',
          roleType: 'actor',
          externalActorId: extId,
        });
      });
      supportPaIds.forEach((paId) => {
        participants.push({
          participantType: 'public_adjuster',
          roleType: 'actor',
          publicAdjusterId: paId,
        });
      });
      additionalExtIds.forEach((extId) => {
        participants.push({
          participantType: 'external_actor',
          roleType: 'actor',
          externalActorId: extId,
        });
      });

      // 2. INFORMED / NOTIFY RECIPIENTS (role_type: 'informed')
      notifyPaIds.forEach((paId) => {
        participants.push({
          participantType: 'public_adjuster',
          roleType: 'informed',
          publicAdjusterId: paId,
        });
      });
      notifyExtIds.forEach((extId) => {
        participants.push({
          participantType: 'external_actor',
          roleType: 'informed',
          externalActorId: extId,
        });
      });
      customNotifyList.forEach((c) => {
        participants.push({
          participantType: 'office',
          roleType: 'informed',
          customName: c.name,
          customEmail: c.email || undefined,
          customPhone: c.phone || undefined,
        });
      });

      await schedulingService.createEvent({
        claimId: claim.id,
        eventType: finalEventType,
        coordinationStage,
        location: location.trim(),
        gateCode: gateCode.trim() || undefined,
        lockboxCode: lockboxCode.trim() || undefined,
        accessInstructions: accessInstructions.trim() || undefined,
        notes: eventNotes.trim() || undefined,
        participants,
      });

      setShowAddEvent(false);
      onEventCreated();
    } catch (err: any) {
      console.error('Error creating event:', err);
      setEventError(err.message || 'Failed to create event');
    } finally {
      setSubmittingEvent(false);
    }
  };

  const copyInsuredMessage = (evt: CoordinationEvent) => {
    const insuredName = claim.insured?.name || 'Insured';
    const carrierName = claim.carrier;
    const address = evt.location;
    const acceptedSlots = (evt.slots || []).filter(s => s.status === 'pa_accepted' || s.status === 'proposed');

    let text = `Hello ${insuredName}, this is IP Adjusters coordinating the inspection for your claim with ${carrierName} (${address}).\n\n`;
    text += `We have the following date and time options available:\n`;
    acceptedSlots.forEach((s, idx) => {
      text += `📍 Option ${idx + 1}: ${s.slotDate} from ${s.startTime.slice(0, 5)} to ${s.endTime.slice(0, 5)}\n`;
    });
    text += `\nPlease let us know which option works best for you. Thank you!`;

    navigator.clipboard.writeText(text);
    setCopiedSlotId(evt.id);
    setTimeout(() => setCopiedSlotId(null), 2500);
  };

  // Open Actor Edit Modal
  const openEditActor = (target: ActorEditTarget) => {
    setEditingActor(target);
    setActorError(null);
    if (target.type === 'insured') {
      setActorForm({
        name: target.data.name || '',
        phone: target.data.phone || '',
        email: target.data.email || '',
        generalAvailability: target.data.generalAvailability || '',
        notes: target.data.notes || '',
      });
    } else if (target.type === 'pa') {
      setActorForm({
        name: target.data.name || '',
        phone: target.data.phone || '',
        email: target.data.email || '',
        role: target.data.role || 'adjuster',
        generalAvailability: target.data.generalAvailability || '',
        colorCode: target.data.colorCode || '#0284c7',
      });
    } else if (target.type === 'carrierRep') {
      setActorForm({
        name: target.data.name || '',
        carrierName: target.data.carrierName || claim.carrier,
        typeOfRepresentative: target.data.typeOfRepresentative || 'Field Adjuster',
        phone: target.data.phone || '',
        email: target.data.email || '',
        company: target.data.company || '',
        notes: target.data.notes || '',
      });
    } else if (target.type === 'externalActor') {
      setActorForm({
        name: target.data.name || '',
        typeOfActor: target.data.typeOfActor || 'Appraiser',
        company: target.data.company || '',
        phone: target.data.phone || '',
        email: target.data.email || '',
        generalAvailability: target.data.generalAvailability || '',
        notes: target.data.notes || '',
      });
    }
  };

  // Save Actor Edit
  const handleSaveActor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActor) return;
    if (!actorForm.name?.trim()) {
      setActorError('Name is required');
      return;
    }

    setSavingActor(true);
    setActorError(null);
    try {
      if (editingActor.type === 'insured') {
        if (editingActor.data.id) {
          await schedulingService.updateInsured(editingActor.data.id, {
            name: actorForm.name.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            generalAvailability: actorForm.generalAvailability.trim(),
            notes: actorForm.notes.trim(),
          });
        } else {
          const created = await schedulingService.createInsured({
            name: actorForm.name.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            generalAvailability: actorForm.generalAvailability.trim(),
            notes: actorForm.notes.trim(),
          });
          await schedulingService.linkInsuredToClaim(claim.id, created.id);
        }
      } else if (editingActor.type === 'pa') {
        if (editingActor.data.id) {
          await schedulingService.updatePublicAdjuster(editingActor.data.id, {
            name: actorForm.name.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            role: actorForm.role,
            generalAvailability: actorForm.generalAvailability.trim(),
            colorCode: actorForm.colorCode,
          });
        } else {
          const created = await schedulingService.createPublicAdjuster({
            name: actorForm.name.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            role: actorForm.role,
            generalAvailability: actorForm.generalAvailability.trim(),
            colorCode: actorForm.colorCode,
          });
          await schedulingService.linkPaToClaim(claim.id, created.id);
        }
      } else if (editingActor.type === 'carrierRep') {
        if (editingActor.data.id) {
          await schedulingService.updateCarrierRep(editingActor.data.id, {
            name: actorForm.name.trim(),
            carrierName: actorForm.carrierName.trim() || claim.carrier,
            typeOfRepresentative: actorForm.typeOfRepresentative.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            company: actorForm.company.trim(),
            notes: actorForm.notes.trim(),
          });
        } else {
          const created = await schedulingService.createCarrierRep({
            carrierName: actorForm.carrierName.trim() || claim.carrier,
            name: actorForm.name.trim(),
            typeOfRepresentative: actorForm.typeOfRepresentative.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            company: actorForm.company.trim(),
            notes: actorForm.notes.trim(),
          });
          await schedulingService.linkCarrierRepToClaim(claim.id, created.id, created.type_of_representative);
        }
      } else if (editingActor.type === 'externalActor') {
        if (editingActor.data.id) {
          await schedulingService.updateExternalActor(editingActor.data.id, {
            name: actorForm.name.trim(),
            typeOfActor: actorForm.typeOfActor.trim(),
            company: actorForm.company.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            generalAvailability: actorForm.generalAvailability.trim(),
            notes: actorForm.notes.trim(),
          });
        } else {
          const created = await schedulingService.createExternalActor({
            name: actorForm.name.trim(),
            typeOfActor: actorForm.typeOfActor.trim(),
            company: actorForm.company.trim(),
            phone: actorForm.phone.trim(),
            email: actorForm.email.trim(),
            generalAvailability: actorForm.generalAvailability.trim(),
            notes: actorForm.notes.trim(),
          });
          await schedulingService.linkExternalActorToClaim(claim.id, created.id, created.type_of_actor);
        }
      }

      await onClaimUpdated();
      setEditingActor(null);
    } catch (err: any) {
      console.error('Error updating actor:', err);
      setActorError(err.message || 'Failed to update actor');
    } finally {
      setSavingActor(false);
    }
  };

  // Confirm and Execute Delete / Unlink
  const handleExecuteDeleteActor = async () => {
    if (!deletingActor) return;
    setDeletingLoading(true);
    try {
      if (deletingActor.type === 'pa') {
        if (deletingActor.action === 'unlink') {
          await schedulingService.unlinkPaFromClaim(claim.id);
        } else {
          await schedulingService.deletePublicAdjuster(deletingActor.id);
        }
      } else if (deletingActor.type === 'carrierRep') {
        if (deletingActor.action === 'unlink') {
          await schedulingService.unlinkCarrierRepFromClaim(claim.id, deletingActor.id);
        } else {
          await schedulingService.deleteCarrierRep(deletingActor.id);
        }
      } else if (deletingActor.type === 'externalActor') {
        if (deletingActor.action === 'unlink') {
          await schedulingService.unlinkExternalActorFromClaim(claim.id, deletingActor.id);
        } else {
          await schedulingService.deleteExternalActor(deletingActor.id);
        }
      } else if (deletingActor.type === 'insured') {
        await schedulingService.deleteInsured(deletingActor.id);
      }

      await onClaimUpdated();
      setDeletingActor(null);
    } catch (err: any) {
      console.error('Error removing actor:', err);
      alert(err.message || 'Failed to delete/remove actor');
    } finally {
      setDeletingLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      
      {/* View Header / Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold"
            title="Return to claims directory"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-maroon-800 text-white flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5 text-tealBrand-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight font-mono">
                  {claim.claimNumber}
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  claim.status === 'Open' ? 'bg-emerald-100 text-emerald-800' :
                  claim.status === 'Appraisal' ? 'bg-amber-100 text-amber-800' :
                  claim.status === 'Settled' ? 'bg-tealBrand-100 text-tealBrand-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {claim.status || 'Open'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {claim.carrier} {claim.policyNumber ? `· Policy #${claim.policyNumber}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* View Actions */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {!showAddEvent && (
            <button
              type="button"
              onClick={handleOpenAddEvent}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-maroon-800 hover:bg-maroon-900 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Event</span>
            </button>
          )}

          {claimEvents.length > 0 && (
            <button
              type="button"
              onClick={() => onViewInFunnel(claim.claimNumber)}
              className="p-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
              title="View this claim's events in Funnel"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ======================================================== */}
        {/* LEFT COLUMN: CLAIM DETAILS & ALL ACTORS (5 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Claim & Property Overview Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Claim Details
              </h3>
              <button
                type="button"
                onClick={openEditClaimInfo}
                className="text-[11px] text-maroon-800 hover:underline font-semibold flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Carrier:</span>
                <strong className="text-slate-900 font-semibold">{claim.carrier}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Type of Loss:</span>
                <strong className="text-slate-900 font-semibold">{claim.typeOfLoss}</strong>
              </div>
              {claim.dateOfLoss && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Date of Loss:</span>
                  <strong className="text-slate-900 font-semibold">{claim.dateOfLoss}</strong>
                </div>
              )}
              <div className="py-1">
                <span className="text-slate-500 block mb-0.5">Property Location:</span>
                <div className="flex items-start gap-1.5 font-medium text-slate-900">
                  <MapPin className="w-3.5 h-3.5 text-maroon-800 shrink-0 mt-0.5" />
                  <span>{claim.propertyAddress}, {claim.city}, {claim.state} {claim.zipCode}</span>
                </div>
              </div>
              {claim.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block mb-0.5 font-medium">Remarks / Instructions:</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] whitespace-pre-wrap">
                    {claim.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ACTOR 1: Insured Policyholder */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Insured Policyholder
              </h3>
              {claim.insured && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditActor({ type: 'insured', data: claim.insured! })}
                    className="p-1 rounded text-slate-500 hover:text-maroon-800 hover:bg-slate-100 transition-colors"
                    title="Edit Insured"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingActor({
                      type: 'insured',
                      id: claim.insured!.id,
                      name: claim.insured!.name,
                      action: 'deletePermanent',
                    })}
                    className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                    title="Delete Insured"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {claim.insured ? (
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-900 text-sm">{claim.insured.name}</div>
                {claim.insured.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-tealBrand-700" />
                    <a href={`tel:${claim.insured.phone}`} className="hover:underline font-mono">{claim.insured.phone}</a>
                  </div>
                )}
                {claim.insured.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-tealBrand-700" />
                    <a href={`mailto:${claim.insured.email}`} className="hover:underline">{claim.insured.email}</a>
                  </div>
                )}
                {claim.insured.generalAvailability && (
                  <div className="mt-2 p-2 bg-tealBrand-50 border border-tealBrand-200 rounded text-[11px] text-tealBrand-900 font-medium">
                    📅 Availability: {claim.insured.generalAvailability}
                  </div>
                )}
                {claim.insured.notes && (
                  <p className="text-[11px] text-slate-500 italic mt-1">{claim.insured.notes}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-400 italic">
                <span>No insured details attached.</span>
                <button
                  type="button"
                  onClick={() => openEditActor({ type: 'insured', data: { id: '', name: '', phone: '', email: '', generalAvailability: '', notes: '' } })}
                  className="text-maroon-800 not-italic hover:underline font-semibold"
                >
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* ACTOR 2: Assigned Public Adjuster */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                Assigned Public Adjuster (PA)
              </h3>
              {assignedPa && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditActor({ type: 'pa', data: assignedPa })}
                    className="p-1 rounded text-slate-500 hover:text-maroon-800 hover:bg-slate-100 transition-colors"
                    title="Edit PA Details"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingActor({
                      type: 'pa',
                      id: assignedPa.id,
                      name: assignedPa.name,
                      action: 'unlink',
                    })}
                    className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                    title="Remove PA from Claim"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {assignedPa ? (
              <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: assignedPa.colorCode }}
                    />
                    <div>
                      <strong className="text-slate-900">{assignedPa.name}</strong>
                      <p className="text-[11px] text-slate-500 capitalize">{assignedPa.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  {assignedPa.phone && (
                    <a href={`tel:${assignedPa.phone}`} className="text-tealBrand-700 hover:text-tealBrand-900 font-mono text-[11px] font-bold">
                      {assignedPa.phone}
                    </a>
                  )}
                </div>
                {assignedPa.email && (
                  <p className="text-[11px] text-slate-600 pl-5">✉️ {assignedPa.email}</p>
                )}
                {assignedPa.generalAvailability && (
                  <p className="text-[11px] text-tealBrand-800 pl-5 font-medium">📅 Availability: {assignedPa.generalAvailability}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-400 italic">
                <span>No public adjuster assigned yet.</span>
                <button
                  type="button"
                  onClick={() => openEditActor({ type: 'pa', data: { id: '', name: '', phone: '', email: '', role: 'adjuster', generalAvailability: '', colorCode: '#0284c7', isActive: true } })}
                  className="text-maroon-800 not-italic hover:underline font-semibold"
                >
                  + Assign
                </button>
              </div>
            )}
          </div>

          {/* ACTOR 3: Carrier Representatives (Field / Desk Adjusters) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Carrier Representatives (Field / Desk)
              </h3>
              <button
                type="button"
                onClick={() => openEditActor({ type: 'carrierRep', data: { id: '', name: '', carrierName: claim.carrier, typeOfRepresentative: 'Field Adjuster', phone: '', email: '', company: '', notes: '' } })}
                className="text-[11px] text-maroon-800 hover:underline font-semibold"
              >
                + Add / Change
              </button>
            </div>

            {claim.carrierReps && claim.carrierReps.length > 0 ? (
              <div className="space-y-2">
                {claim.carrierReps.map((rep) => (
                  <div key={rep.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 font-bold">{rep.name}</strong>
                        <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-semibold">
                          {rep.typeOfRepresentative || 'Field Adjuster'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditActor({ type: 'carrierRep', data: rep })}
                          className="p-1 rounded text-slate-500 hover:text-maroon-800 hover:bg-white transition-colors"
                          title="Edit Representative"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingActor({
                            type: 'carrierRep',
                            id: rep.id,
                            name: rep.name,
                            action: 'unlink',
                          })}
                          className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-white transition-colors"
                          title="Remove from this claim"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500">Firm / Carrier: <strong>{rep.company || rep.carrierName}</strong></p>
                    <div className="flex items-center gap-3 pt-0.5 text-[11px] text-slate-600">
                      {rep.phone && (
                        <a href={`tel:${rep.phone}`} className="flex items-center gap-1 hover:underline font-mono">
                          <Phone className="w-3 h-3 text-tealBrand-700" />
                          <span>{rep.phone}</span>
                        </a>
                      )}
                      {rep.email && (
                        <a href={`mailto:${rep.email}`} className="flex items-center gap-1 hover:underline">
                          <Mail className="w-3 h-3 text-tealBrand-700" />
                          <span>{rep.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No carrier representative assigned yet.</p>
            )}
          </div>

          {/* ACTOR 4: External Actors (Contractors / Appraisers / Umpires) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                External Actors (Contractor / Appraiser)
              </h3>
              <button
                type="button"
                onClick={() => openEditActor({ type: 'externalActor', data: { id: '', name: '', typeOfActor: 'Appraiser', company: '', phone: '', email: '', generalAvailability: '', notes: '' } })}
                className="text-[11px] text-maroon-800 hover:underline font-semibold"
              >
                + Add / Change
              </button>
            </div>

            {claim.externalActors && claim.externalActors.length > 0 ? (
              <div className="space-y-2">
                {claim.externalActors.map((ext) => (
                  <div key={ext.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 font-bold">{ext.name}</strong>
                        <span className="text-[10px] bg-tealBrand-100 text-tealBrand-800 px-2 py-0.5 rounded font-semibold border border-tealBrand-200">
                          {ext.typeOfActor}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditActor({ type: 'externalActor', data: ext })}
                          className="p-1 rounded text-slate-500 hover:text-maroon-800 hover:bg-white transition-colors"
                          title="Edit External Actor"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingActor({
                            type: 'externalActor',
                            id: ext.id,
                            name: ext.name,
                            action: 'unlink',
                          })}
                          className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-white transition-colors"
                          title="Remove from this claim"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {ext.company && <p className="text-[11px] text-slate-500 font-medium">Company: <strong>{ext.company}</strong></p>}
                    <div className="flex items-center gap-3 pt-0.5 text-[11px] text-slate-600">
                      {ext.phone && (
                        <a href={`tel:${ext.phone}`} className="flex items-center gap-1 hover:underline font-mono">
                          <Phone className="w-3 h-3 text-tealBrand-700" />
                          <span>{ext.phone}</span>
                        </a>
                      )}
                      {ext.email && (
                        <a href={`mailto:${ext.email}`} className="flex items-center gap-1 hover:underline">
                          <Mail className="w-3 h-3 text-tealBrand-700" />
                          <span>{ext.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No external actor assigned yet.</p>
            )}
          </div>

        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: INSPECTION EVENTS & COORDINATION (7 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-maroon-800" />
                  Scheduled Inspections & Events ({claimEvents.length})
                </h3>
                <p className="text-xs text-slate-500">Appointments and coordination funnel for this claim</p>
              </div>

              {!showAddEvent && (
                <button
                  type="button"
                  onClick={handleOpenAddEvent}
                  className="inline-flex items-center gap-1.5 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Schedule Event</span>
                </button>
              )}
            </div>

            {/* INLINE FORM: SCHEDULE NEW EVENT */}
            {showAddEvent && (
              <div className="mt-4 bg-slate-50 border border-maroon-800/30 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold text-maroon-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    Create New Inspection Event
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    Cancel
                  </button>
                </div>

                {eventError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{eventError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateEvent} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Event Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                      >
                        {availableEventTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>

                      {eventType === 'Other' && (
                        <div className="mt-2 p-2.5 bg-maroon-50 border border-maroon-200 rounded-lg animate-in fade-in duration-150">
                          <label className="block text-[11px] font-bold text-maroon-900 mb-1">
                            Specify Custom Event Type Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={customEventType}
                            onChange={(e) => setCustomEventType(e.target.value)}
                            placeholder="e.g. Examination Under Oath (EUO), Settlement Mediation..."
                            className="w-full bg-white border border-maroon-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                            autoFocus
                          />
                          <p className="text-[10px] text-maroon-700 mt-1">This event type will be saved permanently for future occasions.</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Initial Funnel Stage
                      </label>
                      <select
                        value={coordinationStage}
                        onChange={(e) => setCoordinationStage(e.target.value as CoordinationStage)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      >
                        <option value="1_awaiting_carrier_slots">1. Awaiting Carrier Slots</option>
                        <option value="2_pa_review">2. PA Review (Filter Slots)</option>
                        <option value="3_insured_selection">3. Insured Choice (Offer Options)</option>
                        <option value="4_confirmed">4. Confirmed / Locked</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Event Location Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Street, City, State ZIP"
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
                        placeholder="e.g. #1234"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Lockbox / Key Code</label>
                      <input
                        type="text"
                        value={lockboxCode}
                        onChange={(e) => setLockboxCode(e.target.value)}
                        placeholder="e.g. 5678"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Access Instructions</label>
                    <input
                      type="text"
                      value={accessInstructions}
                      onChange={(e) => setAccessInstructions(e.target.value)}
                      placeholder="e.g. Park on driveway, side gate unlocked"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  {/* SECTION 1: IN-PERSON ATTENDEES */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-maroon-800" />
                        In-Person Attendees (Actors)
                      </span>
                      <span className="text-[11px] text-slate-500">Must attend the event</span>
                    </div>

                    {/* Claim Linked Parties Checkboxes */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold text-slate-600 block">Claim Assigned Parties:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {claim.insured && (
                          <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                            <input
                              type="checkbox"
                              checked={attendInsured}
                              onChange={(e) => setAttendInsured(e.target.checked)}
                              className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                            />
                            <div>
                              <span className="font-bold text-slate-900">{claim.insured.name}</span>
                              <p className="text-[10px] text-slate-500">Insured Policyholder</p>
                            </div>
                          </label>
                        )}

                        {assignedPa && (
                          <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                            <input
                              type="checkbox"
                              checked={attendAssignedPa}
                              onChange={(e) => setAttendAssignedPa(e.target.checked)}
                              className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                            />
                            <div>
                              <span className="font-bold text-slate-900">{assignedPa.name}</span>
                              <p className="text-[10px] text-slate-500">Assigned Public Adjuster</p>
                            </div>
                          </label>
                        )}

                        {(claim.carrierReps || []).map((rep) => {
                          const isChecked = attendRepIds.includes(rep.id);
                          return (
                            <label key={rep.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setAttendRepIds([...attendRepIds, rep.id]);
                                  else setAttendRepIds(attendRepIds.filter((id) => id !== rep.id));
                                }}
                                className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                              />
                              <div>
                                <span className="font-bold text-slate-900">{rep.name}</span>
                                <p className="text-[10px] text-slate-500">{rep.typeOfRepresentative || 'Carrier Rep'} ({rep.company || rep.carrierName})</p>
                              </div>
                            </label>
                          );
                        })}

                        {(claim.externalActors || []).map((ext) => {
                          const isChecked = attendExtActorIds.includes(ext.id);
                          return (
                            <label key={ext.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setAttendExtActorIds([...attendExtActorIds, ext.id]);
                                  else setAttendExtActorIds(attendExtActorIds.filter((id) => id !== ext.id));
                                }}
                                className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                              />
                              <div>
                                <span className="font-bold text-slate-900">{ext.name}</span>
                                <p className="text-[10px] text-slate-500">{ext.typeOfActor} ({ext.company || 'External'})</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Support PA & Additional Specialists */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <span className="text-[11px] font-semibold text-slate-600 block">Add Support PA / Additional Attendees:</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Support PA Picker */}
                        <div className="flex gap-1.5">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value === '__NEW_PA__') {
                                setQuickActorError(null);
                                setQuickPaForm({ name: '', phone: '', email: '', role: 'adjuster' });
                                setQuickCreateModal({ type: 'pa', target: 'attend_support' });
                              } else if (e.target.value && !supportPaIds.includes(e.target.value)) {
                                setSupportPaIds([...supportPaIds, e.target.value]);
                              }
                            }}
                            className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-maroon-800"
                          >
                            <option value="">+ Add Support PA (PA de apoyo)...</option>
                            <option value="__NEW_PA__" className="font-bold text-maroon-800 bg-amber-50">✨ + Create & Register New PA...</option>
                            {directoryPas
                              .filter((p) => p.id !== claim.publicAdjusterId && !supportPaIds.includes(p.id))
                              .map((p) => (
                                <option key={p.id} value={p.id}>PA: {p.name} ({p.role.replace('_', ' ')})</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            title="Create and register a new Public Adjuster"
                            onClick={() => {
                              setQuickActorError(null);
                              setQuickPaForm({ name: '', phone: '', email: '', role: 'adjuster' });
                              setQuickCreateModal({ type: 'pa', target: 'attend_support' });
                            }}
                            className="px-2.5 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New PA</span>
                          </button>
                        </div>

                        {/* Additional Specialist Picker */}
                        <div className="flex gap-1.5">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value === '__NEW_EXT__') {
                                setQuickActorError(null);
                                setQuickExtForm({ name: '', typeOfActor: 'Contractor', company: '', phone: '', email: '' });
                                setQuickCreateModal({ type: 'external', target: 'attend_additional' });
                              } else if (e.target.value && !additionalExtIds.includes(e.target.value)) {
                                setAdditionalExtIds([...additionalExtIds, e.target.value]);
                              }
                            }}
                            className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-maroon-800"
                          >
                            <option value="">+ Add Specialist / Contractor...</option>
                            <option value="__NEW_EXT__" className="font-bold text-tealBrand-900 bg-tealBrand-50">✨ + Create & Register New Specialist...</option>
                            {directoryExternals
                              .filter((ext) => !attendExtActorIds.includes(ext.id) && !additionalExtIds.includes(ext.id))
                              .map((ext) => (
                                <option key={ext.id} value={ext.id}>{ext.name} ({ext.typeOfActor} - {ext.company || 'Indep'})</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            title="Create and register a new Specialist or Contractor"
                            onClick={() => {
                              setQuickActorError(null);
                              setQuickExtForm({ name: '', typeOfActor: 'Contractor', company: '', phone: '', email: '' });
                              setQuickCreateModal({ type: 'external', target: 'attend_additional' });
                            }}
                            className="px-2.5 py-1.5 bg-tealBrand-800 hover:bg-tealBrand-900 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New</span>
                          </button>
                        </div>
                      </div>

                      {/* Badges for support attendees */}
                      {(supportPaIds.length > 0 || additionalExtIds.length > 0) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {supportPaIds.map((id) => {
                            const p = directoryPas.find((x) => x.id === id);
                            return (
                              <span key={id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                                <span>Support PA: {p?.name || id}</span>
                                <button
                                  type="button"
                                  onClick={() => setSupportPaIds(supportPaIds.filter((x) => x !== id))}
                                  className="text-amber-700 hover:text-amber-950 font-bold ml-1"
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
                                  className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1"
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

                  {/* SECTION 2: NOTIFY / KEEP INFORMED */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-tealBrand-700" />
                        Notify / Keep Informed (CC / Notificaciones)
                      </span>
                      <span className="text-[11px] text-slate-500">Receive schedule updates & logs</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Pick PA to Notify */}
                      <div className="flex gap-1.5">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value === '__NEW_PA__') {
                              setQuickActorError(null);
                              setQuickPaForm({ name: '', phone: '', email: '', role: 'adjuster' });
                              setQuickCreateModal({ type: 'pa', target: 'notify' });
                            } else if (e.target.value && !notifyPaIds.includes(e.target.value)) {
                              setNotifyPaIds([...notifyPaIds, e.target.value]);
                            }
                          }}
                          className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-maroon-800"
                        >
                          <option value="">+ Notify Another PA / Office...</option>
                          <option value="__NEW_PA__" className="font-bold text-maroon-800 bg-amber-50">✨ + Create & Register New PA...</option>
                          {directoryPas
                            .filter((p) => !notifyPaIds.includes(p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>Notify: {p.name} ({p.role.replace('_', ' ')})</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          title="Create and register a new Public Adjuster"
                          onClick={() => {
                            setQuickActorError(null);
                            setQuickPaForm({ name: '', phone: '', email: '', role: 'adjuster' });
                            setQuickCreateModal({ type: 'pa', target: 'notify' });
                          }}
                          className="px-2.5 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New PA</span>
                        </button>
                      </div>

                      {/* Pick External Actor to Notify */}
                      <div className="flex gap-1.5">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value === '__NEW_EXT__') {
                              setQuickActorError(null);
                              setQuickExtForm({ name: '', typeOfActor: 'Contractor', company: '', phone: '', email: '' });
                              setQuickCreateModal({ type: 'external', target: 'notify' });
                            } else if (e.target.value && !notifyExtIds.includes(e.target.value)) {
                              setNotifyExtIds([...notifyExtIds, e.target.value]);
                            }
                          }}
                          className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-maroon-800"
                        >
                          <option value="">+ Notify Specialist / Contractor...</option>
                          <option value="__NEW_EXT__" className="font-bold text-tealBrand-900 bg-tealBrand-50">✨ + Create & Register New Specialist...</option>
                          {directoryExternals
                            .filter((ext) => !notifyExtIds.includes(ext.id))
                            .map((ext) => (
                              <option key={ext.id} value={ext.id}>Notify: {ext.name} ({ext.typeOfActor})</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          title="Create and register a new Specialist or Contractor"
                          onClick={() => {
                            setQuickActorError(null);
                            setQuickExtForm({ name: '', typeOfActor: 'Contractor', company: '', phone: '', email: '' });
                            setQuickCreateModal({ type: 'external', target: 'notify' });
                          }}
                          className="px-2.5 py-1.5 bg-tealBrand-800 hover:bg-tealBrand-900 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New</span>
                        </button>
                      </div>
                    </div>

                    {/* Toggle Custom Notify Contact */}
                    <div>
                      {!showAddCustomNotify ? (
                        <button
                          type="button"
                          onClick={() => setShowAddCustomNotify(true)}
                          className="text-[11px] text-tealBrand-700 hover:underline font-semibold"
                        >
                          + Add Custom Contact to Notify (Attorney, Assistant, etc.)
                        </button>
                      ) : (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 mt-1">
                          <span className="text-[11px] font-bold text-slate-800 block">Add Custom Contact to Notify:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Full Name *"
                              value={customNotifyName}
                              onChange={(e) => setCustomNotifyName(e.target.value)}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={customNotifyEmail}
                              onChange={(e) => setCustomNotifyEmail(e.target.value)}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Phone Number"
                              value={customNotifyPhone}
                              onChange={(e) => setCustomNotifyPhone(e.target.value)}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddCustomNotify(false);
                                setCustomNotifyName('');
                                setCustomNotifyEmail('');
                                setCustomNotifyPhone('');
                              }}
                              className="text-[11px] text-slate-500 hover:text-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!customNotifyName.trim()) return;
                                setCustomNotifyList([
                                  ...customNotifyList,
                                  {
                                    id: `custom_${Date.now()}`,
                                    name: customNotifyName.trim(),
                                    email: customNotifyEmail.trim(),
                                    phone: customNotifyPhone.trim(),
                                  }
                                ]);
                                setCustomNotifyName('');
                                setCustomNotifyEmail('');
                                setCustomNotifyPhone('');
                                setShowAddCustomNotify(false);
                              }}
                              className="text-[11px] font-bold text-white bg-tealBrand-800 hover:bg-tealBrand-900 px-2.5 py-1 rounded"
                            >
                              Add to Notify
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Render Notify Badges */}
                    {(notifyPaIds.length > 0 || notifyExtIds.length > 0 || customNotifyList.length > 0) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {notifyPaIds.map((id) => {
                          const p = directoryPas.find((x) => x.id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 bg-tealBrand-100 text-tealBrand-900 border border-tealBrand-300 px-2 py-0.5 rounded text-[11px] font-medium">
                              <span>🔔 PA: {p?.name || id}</span>
                              <button
                                type="button"
                                onClick={() => setNotifyPaIds(notifyPaIds.filter((x) => x !== id))}
                                className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}

                        {notifyExtIds.map((id) => {
                          const ext = directoryExternals.find((x) => x.id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 bg-tealBrand-100 text-tealBrand-900 border border-tealBrand-300 px-2 py-0.5 rounded text-[11px] font-medium">
                              <span>🔔 {ext?.name || id} ({ext?.typeOfActor})</span>
                              <button
                                type="button"
                                onClick={() => setNotifyExtIds(notifyExtIds.filter((x) => x !== id))}
                                className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}

                        {customNotifyList.map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-1 bg-tealBrand-100 text-tealBrand-900 border border-tealBrand-300 px-2 py-0.5 rounded text-[11px] font-medium">
                            <span>🔔 {c.name} {c.email ? `(${c.email})` : ''}</span>
                            <button
                              type="button"
                              onClick={() => setCustomNotifyList(customNotifyList.filter((x) => x.id !== c.id))}
                              className="text-tealBrand-700 hover:text-tealBrand-950 font-bold ml-1"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Internal Coordination Notes</label>
                    <textarea
                      rows={2}
                      value={eventNotes}
                      onChange={(e) => setEventNotes(e.target.value)}
                      placeholder="Add any specific instructions for adjusters or inspection requirements..."
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowAddEvent(false)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingEvent}
                      className="px-4 py-2 text-xs font-bold text-white bg-maroon-800 hover:bg-maroon-900 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {submittingEvent ? 'Creating Event...' : 'Confirm & Create Event'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List of Existing Events */}
            <div className="mt-4 space-y-3">
              {claimEvents.length === 0 ? (
                <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="text-xs font-bold text-slate-800">No inspection events scheduled yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    This claim does not have any coordination events yet. You can create an Initial Inspection, Carrier Re-Inspection, or any other appointment.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddEvent}
                    className="inline-flex items-center gap-1.5 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Event</span>
                  </button>
                </div>
              ) : (
                claimEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="bg-slate-50/70 border border-slate-200 hover:border-slate-300 rounded-xl p-4 space-y-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">{evt.eventType}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            evt.coordinationStage === '4_confirmed' 
                              ? 'bg-emerald-100 text-emerald-800'
                              : evt.coordinationStage === '3_insured_selection'
                              ? 'bg-maroon-100 text-maroon-800'
                              : evt.coordinationStage === '2_pa_review'
                              ? 'bg-tealBrand-100 text-tealBrand-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {evt.coordinationStage.replace(/^[0-9]_/, '').replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{evt.location}</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onViewInFunnel(claim.claimNumber)}
                        className="text-xs font-bold text-tealBrand-700 hover:text-tealBrand-900 bg-white border border-tealBrand-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
                      >
                        <span>View Funnel</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Final Locked Time or Proposed Slots */}
                    {evt.finalDate ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-2 font-bold text-emerald-900">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Confirmed Inspection Date & Time</span>
                        </div>
                        <p className="text-emerald-800 text-xs pl-6">
                          📅 <strong>{evt.finalDate}</strong> · ⏰ {evt.finalStartTime?.slice(0, 5)} - {evt.finalEndTime?.slice(0, 5)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">
                            Available Time Slots ({(evt.slots || []).length}):
                          </span>
                          {(evt.slots || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => copyInsuredMessage(evt)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-tealBrand-700 hover:underline"
                            >
                              {copiedSlotId === evt.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Options for Client</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {(evt.slots || []).length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                            ⏳ Waiting for Carrier Adjuster to provide proposed time slots.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {evt.slots!.map((s) => (
                              <div
                                key={s.id}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                  s.status === 'pa_accepted'
                                    ? 'bg-tealBrand-50 border-tealBrand-300 text-tealBrand-900'
                                    : s.status === 'insured_chosen'
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                    : s.status === 'pa_rejected'
                                    ? 'bg-red-50 border-red-200 text-red-700 line-through opacity-70'
                                    : 'bg-white border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{s.slotDate} · {s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}</span>
                                </div>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/70">
                                  {s.status.replace('_', ' ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Access Codes Info if available */}
                    {(evt.gateCode || evt.lockboxCode || evt.accessInstructions) && (
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex flex-wrap gap-4">
                        {evt.gateCode && <span>Gate: <strong>{evt.gateCode}</strong></span>}
                        {evt.lockboxCode && <span>Lockbox: <strong>{evt.lockboxCode}</strong></span>}
                        {evt.accessInstructions && <span>Notes: <em>{evt.accessInstructions}</em></span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* ======================================================== */}
      {/* MODAL 1: EDIT ACTOR DETAILS */}
      {/* ======================================================== */}
      {editingActor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-maroon-800" />
                <span>
                  Edit {editingActor.type === 'insured' ? 'Insured Policyholder' :
                        editingActor.type === 'pa' ? 'Public Adjuster (PA)' :
                        editingActor.type === 'carrierRep' ? 'Carrier Representative' : 'External Actor'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingActor(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actorError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {actorError}
              </div>
            )}

            <form onSubmit={handleSaveActor} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={actorForm.name || ''}
                  onChange={(e) => setActorForm({ ...actorForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                />
              </div>

              {editingActor.type === 'carrierRep' && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Carrier Name</label>
                    <input
                      type="text"
                      value={actorForm.carrierName || ''}
                      onChange={(e) => setActorForm({ ...actorForm, carrierName: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Type of Representative</label>
                    <select
                      value={actorForm.typeOfRepresentative || 'Field Adjuster'}
                      onChange={(e) => setActorForm({ ...actorForm, typeOfRepresentative: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                    >
                      <option value="Field Adjuster">Field Adjuster</option>
                      <option value="Desk Adjuster">Desk Adjuster</option>
                      <option value="Independent Adjuster (IA)">Independent Adjuster (IA)</option>
                      <option value="Staff Adjuster">Staff Adjuster</option>
                      <option value="Supervisor / Manager">Supervisor / Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Independent Firm / Company</label>
                    <input
                      type="text"
                      value={actorForm.company || ''}
                      onChange={(e) => setActorForm({ ...actorForm, company: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                </>
              )}

              {editingActor.type === 'externalActor' && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Type of Actor</label>
                    <select
                      value={actorForm.typeOfActor || 'Appraiser'}
                      onChange={(e) => setActorForm({ ...actorForm, typeOfActor: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                    >
                      <option value="Appraiser">Appraiser</option>
                      <option value="Umpire">Umpire</option>
                      <option value="Contractor / Estimator">Contractor / Estimator</option>
                      <option value="Structural Engineer">Structural Engineer</option>
                      <option value="Plumber / Leak Detection">Plumber / Leak Detection</option>
                      <option value="Roofer">Roofer</option>
                      <option value="Other Specialist">Other Specialist</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Company / Organization</label>
                    <input
                      type="text"
                      value={actorForm.company || ''}
                      onChange={(e) => setActorForm({ ...actorForm, company: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                </>
              )}

              {editingActor.type === 'pa' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={actorForm.role || 'adjuster'}
                      onChange={(e) => setActorForm({ ...actorForm, role: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                    >
                      <option value="adjuster">Adjuster</option>
                      <option value="senior_adjuster">Senior Adjuster</option>
                      <option value="director">Director</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Badge Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={actorForm.colorCode || '#0284c7'}
                        onChange={(e) => setActorForm({ ...actorForm, colorCode: e.target.value })}
                        className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                      />
                      <span className="font-mono text-slate-600">{actorForm.colorCode}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={actorForm.phone || ''}
                    onChange={(e) => setActorForm({ ...actorForm, phone: e.target.value })}
                    placeholder="305-123-4567"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={actorForm.email || ''}
                    onChange={(e) => setActorForm({ ...actorForm, email: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              </div>

              {(editingActor.type === 'insured' || editingActor.type === 'pa' || editingActor.type === 'externalActor') && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">General Availability</label>
                  <input
                    type="text"
                    value={actorForm.generalAvailability || ''}
                    onChange={(e) => setActorForm({ ...actorForm, generalAvailability: e.target.value })}
                    placeholder="e.g. Weekday mornings, or Saturdays"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={actorForm.notes || ''}
                  onChange={(e) => setActorForm({ ...actorForm, notes: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingActor(null)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingActor}
                  className="px-4 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingActor ? 'Saving...' : 'Save Actor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CONFIRM DELETE / REMOVE ACTOR */}
      {/* ======================================================== */}
      {deletingActor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-sm w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {deletingActor.action === 'unlink' ? 'Remove Actor from Claim?' : 'Delete Actor Record?'}
                </h3>
                <p className="text-xs text-slate-500">
                  {deletingActor.action === 'unlink'
                    ? `Are you sure you want to remove "${deletingActor.name}" from this claim?`
                    : `Are you sure you want to permanently delete "${deletingActor.name}"?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingActor(null)}
                disabled={deletingLoading}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteActor}
                disabled={deletingLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {deletingLoading ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: EDIT CLAIM DETAILS */}
      {/* ======================================================== */}
      {editingClaimInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-lg w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-maroon-800" />
                <span>Edit Claim Details ({claim.claimNumber})</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingClaimInfo(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {claimInfoError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {claimInfoError}
              </div>
            )}

            <form onSubmit={handleSaveClaimInfo} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Carrier Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={claimForm.carrier}
                    onChange={(e) => setClaimForm({ ...claimForm, carrier: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Claim Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={claimForm.claimNumber}
                    onChange={(e) => setClaimForm({ ...claimForm, claimNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Policy Number</label>
                  <input
                    type="text"
                    value={claimForm.policyNumber}
                    onChange={(e) => setClaimForm({ ...claimForm, policyNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Claim Status</label>
                  <select
                    value={claimForm.status}
                    onChange={(e) => setClaimForm({ ...claimForm, status: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                  >
                    <option value="Open">Open</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Appraisal">Appraisal</option>
                    <option value="Settled">Settled</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type of Loss</label>
                  <select
                    value={claimForm.typeOfLoss}
                    onChange={(e) => setClaimForm({ ...claimForm, typeOfLoss: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                  >
                    <option value="Water Damage">Water Damage</option>
                    <option value="Fire & Smoke">Fire & Smoke</option>
                    <option value="Hurricane / Wind">Hurricane / Wind</option>
                    <option value="Hail / Roof">Hail / Roof</option>
                    <option value="Mold Remediation">Mold Remediation</option>
                    <option value="Theft / Vandalism">Theft / Vandalism</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Loss</label>
                  <input
                    type="date"
                    value={claimForm.dateOfLoss}
                    onChange={(e) => setClaimForm({ ...claimForm, dateOfLoss: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Property Address <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={claimForm.propertyAddress}
                  onChange={(e) => setClaimForm({ ...claimForm, propertyAddress: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={claimForm.city}
                    onChange={(e) => setClaimForm({ ...claimForm, city: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={claimForm.state}
                    onChange={(e) => setClaimForm({ ...claimForm, state: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={claimForm.zipCode}
                    onChange={(e) => setClaimForm({ ...claimForm, zipCode: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks / Internal Instructions</label>
                <textarea
                  rows={2}
                  value={claimForm.notes}
                  onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
                  placeholder="Additional claim background or specific adjuster remarks..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingClaimInfo(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClaimInfo}
                  className="px-4 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingClaimInfo ? 'Saving...' : 'Save Claim Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CREATE PA MODAL */}
      {quickCreateModal?.type === 'pa' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Register New Public Adjuster</h3>
                <p className="text-xs text-slate-500">
                  {quickCreateModal.target === 'attend_support' ? 'Will be added as In-Person Support PA' : 'Will be added to Notify list'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickCreateModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {quickActorError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {quickActorError}
              </div>
            )}

            <form onSubmit={handleSaveQuickPa} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe, PA"
                  value={quickPaForm.name}
                  onChange={(e) => setQuickPaForm({ ...quickPaForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="(305) 555-0199"
                    value={quickPaForm.phone}
                    onChange={(e) => setQuickPaForm({ ...quickPaForm, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role / Title</label>
                  <select
                    value={quickPaForm.role}
                    onChange={(e) => setQuickPaForm({ ...quickPaForm, role: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  >
                    <option value="adjuster">Public Adjuster</option>
                    <option value="senior_adjuster">Senior Adjuster</option>
                    <option value="apprentice">Apprentice / Assistant</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="john@ipadjusters.com"
                  value={quickPaForm.email}
                  onChange={(e) => setQuickPaForm({ ...quickPaForm, email: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickCreateModal(null)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickActorSaving}
                  className="px-4 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {quickActorSaving ? 'Registering...' : 'Register & Add PA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CREATE EXTERNAL ACTOR / SPECIALIST MODAL */}
      {quickCreateModal?.type === 'external' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Register New Specialist / Contractor</h3>
                <p className="text-xs text-slate-500">
                  {quickCreateModal.target === 'attend_additional' ? 'Will be added as In-Person Specialist' : 'Will be added to Notify list'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickCreateModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {quickActorError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {quickActorError}
              </div>
            )}

            <form onSubmit={handleSaveQuickExt} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name / Contact Person <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mike Vance"
                  value={quickExtForm.name}
                  onChange={(e) => setQuickExtForm({ ...quickExtForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specialty / Role</label>
                  <select
                    value={quickExtForm.typeOfActor}
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, typeOfActor: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  >
                    <option value="Contractor">Contractor / Builder</option>
                    <option value="Engineer">Structural Engineer</option>
                    <option value="Appraiser">Appraiser</option>
                    <option value="Umpire">Umpire</option>
                    <option value="Estimator">Estimator</option>
                    <option value="Attorney">Attorney</option>
                    <option value="Other">Other Specialist</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company / Firm</label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Restoration"
                    value={quickExtForm.company}
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, company: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="(305) 555-0144"
                    value={quickExtForm.phone}
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="mike@apexflorida.com"
                    value={quickExtForm.email}
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, email: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickCreateModal(null)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickActorSaving}
                  className="px-4 py-2 bg-tealBrand-800 hover:bg-tealBrand-900 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {quickActorSaving ? 'Registering...' : 'Register & Add Specialist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

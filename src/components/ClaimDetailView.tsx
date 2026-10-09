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
  Pencil,
  Trash2, 
  Copy,
  X,
  Bell,
  Users,
  Send,
  AlertTriangle,
  RotateCcw,
  History,
  RefreshCw
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { RecordCarrierSlotsModal } from './RecordCarrierSlotsModal';
import { ResetCoordinationModal } from './ResetCoordinationModal';
import { EventHistoryModal } from './EventHistoryModal';
import { getEventSlaStatus, getNextivaTelUri, formatPhoneNumber, getSlaConfig, type SlaConfig } from '../lib/slaUtils';
import { appSettingsService } from '../lib/appSettingsService';
import { 
  formatPhoneAsYouType, 
  isValidPhone, 
  isValidEmail, 
  formatZipCode, 
  formatClaimNumber 
} from '../lib/formatters';
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
  onClaimDeleted?: () => void;
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
  onClaimDeleted,
}: ClaimDetailViewProps) {
  const [slaConfig, setSlaConfig] = useState<SlaConfig>(getSlaConfig());

  useEffect(() => {
    appSettingsService.getSlaConfig().then(setSlaConfig);

    const handleConfigChange = (e: any) => {
      if (e.detail) setSlaConfig(e.detail);
      else setSlaConfig(getSlaConfig());
    };
    window.addEventListener('sla_config_updated', handleConfigChange);
    return () => window.removeEventListener('sla_config_updated', handleConfigChange);
  }, []);

  // Add/Edit Event Form State
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CoordinationEvent | null>(null);
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>(DEFAULT_EVENT_TYPES);
  const [eventType, setEventType] = useState('');
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

  // Dynamic catalog roles
  const [paRoles, setPaRoles] = useState<string[]>(['Public Adjuster', 'Senior Public Adjuster', 'Managing Director', 'Apprentice / Assistant']);
  const [carrierRepRoles, setCarrierRepRoles] = useState<string[]>(['Field Adjuster', 'Desk Adjuster', 'Independent Adjuster (IA)', 'Staff Adjuster', 'Supervisor / Manager', 'Engineer / Expert']);
  const [actorRoles, setActorRoles] = useState<string[]>(['Appraiser', 'Umpire', 'Contractor / Estimator', 'Structural Engineer', 'Plumber / Leak Detection', 'Roofer', 'Other Specialist']);

  // Load directories and stored event types
  useEffect(() => {
    Promise.all([
      schedulingService.getPublicAdjusters(),
      schedulingService.getCarrierReps(),
      schedulingService.getExternalActors(),
      schedulingService.getUniqueEventTypes(),
      appSettingsService.getCustomEventTypes(),
      appSettingsService.getCustomPaRoles(),
      appSettingsService.getCustomCarrierRepRoles(),
      appSettingsService.getCustomActorRoles(),
    ]).then(([dbPas, dbReps, dbExternals, dbEventTypes, customDbTypes, rPas, rCarrierReps, rActors]) => {
      if (dbPas.length > 0) setDirectoryPas(dbPas);
      if (dbReps.length > 0) setDirectoryReps(dbReps);
      if (dbExternals.length > 0) setDirectoryExternals(dbExternals);
      if (rPas?.length > 0) setPaRoles(rPas);
      if (rCarrierReps?.length > 0) setCarrierRepRoles(rCarrierReps);
      if (rActors?.length > 0) setActorRoles(rActors);

      let savedCustomTypes: string[] = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY_EVENT_TYPES);
        if (stored) savedCustomTypes = JSON.parse(stored);
      } catch (e) {
        console.warn('Failed parsing stored event types:', e);
      }

      const merged = Array.from(new Set([
        ...DEFAULT_EVENT_TYPES.filter(t => t !== 'Other'),
        ...customDbTypes,
        ...savedCustomTypes,
        ...dbEventTypes
      ]));
      setAvailableEventTypes([...merged, 'Other']);
    }).catch(console.error);
  }, []);

  // Copied slot message state
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);
  const [sendingEmailEventId, setSendingEmailEventId] = useState<string | null>(null);

  const handleSendInsuredEmail = async (eventId: string) => {
    setSendingEmailEventId(eventId);
    try {
      await schedulingService.notifyInsuredSlots(eventId);
      alert('Email successfully sent to insured client!');
    } catch (err: any) {
      alert('Error sending email: ' + (err.message || err));
    } finally {
      setSendingEmailEventId(null);
    }
  };

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
    if (claimForm.zipCode?.trim() && !/^\d{5}(-\d{4})?$/.test(claimForm.zipCode.trim())) {
      setClaimInfoError('ZIP code must be 5 digits (e.g. 33130)');
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

  // Event Delete State
  const [deletingEventTarget, setDeletingEventTarget] = useState<CoordinationEvent | null>(null);
  const [deletingEventLoading, setDeletingEventLoading] = useState(false);

  const handleConfirmDeleteEvent = async () => {
    if (!deletingEventTarget) return;
    setDeletingEventLoading(true);
    try {
      await schedulingService.deleteEvent(deletingEventTarget.id);
      setDeletingEventTarget(null);
      onEventCreated();
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setDeletingEventLoading(false);
    }
  };

  // Delete Claim State & Handler
  const [showDeleteClaimModal, setShowDeleteClaimModal] = useState(false);
  const [deletingClaimLoading, setDeletingClaimLoading] = useState(false);

  const handleConfirmDeleteClaim = async () => {
    setDeletingClaimLoading(true);
    try {
      await schedulingService.deleteClaim(claim.id);
      setShowDeleteClaimModal(false);
      if (onClaimDeleted) {
        onClaimDeleted();
      } else {
        await onEventCreated();
        onBack();
      }
    } catch (err: any) {
      console.error('Failed to delete claim:', err);
      alert('Error deleting claim: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingClaimLoading(false);
    }
  };

  // Funnel Flow States
  const [recordingSlotsEvent, setRecordingSlotsEvent] = useState<CoordinationEvent | null>(null);
  const [eventToReset, setEventToReset] = useState<CoordinationEvent | null>(null);
  const [historyEventTarget, setHistoryEventTarget] = useState<CoordinationEvent | null>(null);
  const [paSelectedSlotIds, setPaSelectedSlotIds] = useState<Record<string, string[]>>({});
  const [paConfirmingEventId, setPaConfirmingEventId] = useState<string | null>(null);
  const [insuredConfirmingSlotId, setInsuredConfirmingSlotId] = useState<string | null>(null);

  const handleConfirmReset = async (options: { cancelledBy?: string; cancellationReason?: string }) => {
    if (!eventToReset) return;
    try {
      await schedulingService.resetCoordinationEvent(eventToReset.id, options);
      await onClaimUpdated();
      onEventCreated();
      setEventToReset(null);
    } catch (err: any) {
      console.error('Failed to reset event:', err);
      alert('Failed to reset event: ' + (err.message || 'Unknown error'));
    }
  };

  const handleTogglePaSlot = (eventId: string, slotId: string) => {
    const current = paSelectedSlotIds[eventId] || [];
    if (current.includes(slotId)) {
      setPaSelectedSlotIds({
        ...paSelectedSlotIds,
        [eventId]: current.filter((id) => id !== slotId),
      });
    } else {
      if (current.length >= 2) return; // Only allow selecting 2
      setPaSelectedSlotIds({
        ...paSelectedSlotIds,
        [eventId]: [...current, slotId],
      });
    }
  };

  const handlePaConfirmSlots = async (evt: CoordinationEvent) => {
    const selected = paSelectedSlotIds[evt.id] || [];
    if (selected.length !== 2) return;
    const allSlotIds = (evt.slots || []).map((s) => s.id);
    setPaConfirmingEventId(evt.id);
    try {
      await schedulingService.paSelectSlots(evt.id, selected, allSlotIds);
      onEventCreated();
    } catch (err) {
      console.error('Failed to confirm PA selection:', err);
    } finally {
      setPaConfirmingEventId(null);
    }
  };

  const handleInsuredConfirmSlot = async (evt: CoordinationEvent, slot: any) => {
    setInsuredConfirmingSlotId(slot.id);
    try {
      await schedulingService.insuredConfirmSlot(evt.id, slot.id, {
        date: slot.slotDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      onEventCreated();
    } catch (err) {
      console.error('Failed to confirm insured slot:', err);
    } finally {
      setInsuredConfirmingSlotId(null);
    }
  };

  // Filter events belonging to this claim
  const claimEvents = events.filter((e) => e.claimId === claim.id);

  // Assigned PA
  const assignedPa = pas.find((p) => p.id === claim.publicAdjusterId) || claim.publicAdjuster;

  // Initialize event location and participant selections when opening form
  const handleOpenAddEvent = () => {
    setEditingEvent(null);
    setLocation(`${claim.propertyAddress}, ${claim.city || 'Miami'}, ${claim.state || 'FL'} ${claim.zipCode || ''}`.trim());
    setGateCode('');
    setLockboxCode('');
    setAccessInstructions('');
    setEventNotes('');
    setEventError(null);
    setEventType('');
    setCustomEventType('');
    setCoordinationStage('1_awaiting_carrier_slots');

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

  const handleOpenEditEvent = (evt: CoordinationEvent) => {
    setEditingEvent(evt);
    setEventError(null);

    // Event Type
    const isStandard = DEFAULT_EVENT_TYPES.includes(evt.eventType);
    if (isStandard) {
      setEventType(evt.eventType);
      setCustomEventType('');
    } else {
      setEventType('Other');
      setCustomEventType(evt.eventType);
    }

    setCoordinationStage(evt.coordinationStage);
    setLocation(evt.location || '');
    setGateCode(evt.gateCode || '');
    setLockboxCode(evt.lockboxCode || '');
    setAccessInstructions(evt.accessInstructions || '');
    setEventNotes(evt.notes || '');

    // Attendees & Notify Parties
    const participants = evt.participants || [];

    // In-person attendees (role_type === 'actor' or undefined)
    const actors = participants.filter((p) => !p.roleType || p.roleType === 'actor');
    setAttendInsured(actors.some((p) => p.participantType === 'insured'));
    setAttendAssignedPa(actors.some((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId === claim.publicAdjusterId));
    setAttendRepIds(actors.filter((p) => p.participantType === 'carrier_representative' && p.carrierRepId).map((p) => p.carrierRepId!) );
    setAttendExtActorIds(actors.filter((p) => p.participantType === 'external_actor' && p.externalActorId && (claim.externalActors || []).some(a => a.id === p.externalActorId)).map((p) => p.externalActorId!) );
    setSupportPaIds(actors.filter((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId && p.publicAdjusterId !== claim.publicAdjusterId).map((p) => p.publicAdjusterId!) );
    setAdditionalExtIds(actors.filter((p) => p.participantType === 'external_actor' && p.externalActorId && !(claim.externalActors || []).some(a => a.id === p.externalActorId)).map((p) => p.externalActorId!) );

    // Informed / Notify recipients (role_type === 'informed')
    const informed = participants.filter((p) => p.roleType === 'informed');
    setNotifyPaIds(informed.filter((p) => p.participantType === 'public_adjuster' && p.publicAdjusterId).map((p) => p.publicAdjusterId!) );
    setNotifyExtIds(informed.filter((p) => p.participantType === 'external_actor' && p.externalActorId).map((p) => p.externalActorId!) );
    
    const customInformed = informed.filter((p) => p.participantType === 'office' && p.customName).map((p) => ({
      id: p.id || Math.random().toString(),
      name: p.customName || '',
      email: p.customEmail || undefined,
      phone: p.customPhone || undefined,
    }));
    setCustomNotifyList(customInformed);
    setShowAddCustomNotify(false);

    setShowAddEvent(true);
  };

  const handleSaveQuickPa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPaForm.name.trim()) {
      setQuickActorError('PA full name is required');
      return;
    }
    if (quickPaForm.phone?.trim() && !isValidPhone(quickPaForm.phone)) {
      setQuickActorError('Please enter a valid 10-digit phone number (e.g. (305) 555-0199)');
      return;
    }
    if (quickPaForm.email?.trim() && !isValidEmail(quickPaForm.email)) {
      setQuickActorError('Please enter a valid email address');
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
    if (quickExtForm.phone?.trim() && !isValidPhone(quickExtForm.phone)) {
      setQuickActorError('Please enter a valid 10-digit phone number (e.g. (305) 555-0144)');
      return;
    }
    if (quickExtForm.email?.trim() && !isValidEmail(quickExtForm.email)) {
      setQuickActorError('Please enter a valid email address');
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

    if (!eventType) {
      setEventError('Please select an event type (e.g. Initial Inspection, Re-Inspection, Mediation, etc.)');
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
      // Persist in Supabase database and local cache
      appSettingsService.addCustomEventType(finalEventType).catch(console.warn);
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

      if (editingEvent) {
        await schedulingService.updateEvent(editingEvent.id, {
          eventType: finalEventType,
          coordinationStage,
          location: location.trim(),
          gateCode: gateCode.trim() || undefined,
          lockboxCode: lockboxCode.trim() || undefined,
          accessInstructions: accessInstructions.trim() || undefined,
          notes: eventNotes.trim() || undefined,
          participants,
        });
      } else {
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
      }

      setShowAddEvent(false);
      setEditingEvent(null);
      onEventCreated();
    } catch (err: any) {
      console.error(editingEvent ? 'Error updating event:' : 'Error creating event:', err);
      setEventError(err.message || (editingEvent ? 'Failed to update event' : 'Failed to create event'));
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
    if (actorForm.phone?.trim() && !isValidPhone(actorForm.phone)) {
      setActorError('Please enter a valid 10-digit phone number (e.g. (305) 555-0199)');
      return;
    }
    if (actorForm.email?.trim() && !isValidEmail(actorForm.email)) {
      setActorError('Please enter a valid email address');
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

          <button
            type="button"
            onClick={onClaimUpdated}
            title="Refresh claim details"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 hover:border-[#1187aa] rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#1187aa]" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteClaimModal(true)}
            title="Delete this claim"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 hover:border-rose-300 rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Delete</span>
          </button>

          {claimEvents.length > 0 && (
            <button
              type="button"
              onClick={() => onViewInFunnel(claim.claimNumber)}
              className="p-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
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
                    <a href={`mailto:${claim.insured.email}?subject=${encodeURIComponent(`${claim.insured.name || 'Insured'} - Claim #${claim.claimNumber}`)}`} className="hover:underline">{claim.insured.email}</a>
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
                        <a href={`mailto:${rep.email}?subject=${encodeURIComponent(`${claim.insured?.name || 'Insured'} - Claim #${claim.claimNumber}`)}`} className="flex items-center gap-1 hover:underline">
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
                        <a href={`mailto:${ext.email}?subject=${encodeURIComponent(`${claim.insured?.name || 'Insured'} - Claim #${claim.claimNumber}`)}`} className="flex items-center gap-1 hover:underline">
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
                  <span>Schedule Event</span>
                </button>
              )}
            </div>

            {/* INLINE FORM: SCHEDULE NEW EVENT */}
            {showAddEvent && (
              <div className="mt-4 bg-slate-50 border border-maroon-800/30 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold text-maroon-800 uppercase tracking-wide flex items-center gap-1.5">
                    {editingEvent ? <Pencil className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    {editingEvent ? `Edit Event: ${editingEvent.eventType}` : 'Create New Inspection Event'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => { setShowAddEvent(false); setEditingEvent(null); }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
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
                        <option value="">-- Select Event Type * --</option>
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
                              onChange={(e) => setCustomNotifyEmail(e.target.value.toLowerCase().trim())}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="(305) 555-0100"
                              value={customNotifyPhone}
                              onChange={(e) => setCustomNotifyPhone(formatPhoneAsYouType(e.target.value))}
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
                                if (customNotifyPhone.trim() && !isValidPhone(customNotifyPhone)) {
                                  alert('Please enter a valid 10-digit phone number (e.g. (305) 555-0100)');
                                  return;
                                }
                                if (customNotifyEmail.trim() && !isValidEmail(customNotifyEmail)) {
                                  alert('Please enter a valid email address');
                                  return;
                                }
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
                      onClick={() => { setShowAddEvent(false); setEditingEvent(null); }}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingEvent}
                      className="px-4 py-2 text-xs font-bold text-white bg-maroon-800 hover:bg-maroon-900 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                    >
                      {submittingEvent 
                        ? (editingEvent ? 'Updating Event...' : 'Creating Event...') 
                        : (editingEvent ? 'Save Changes' : 'Confirm & Create Event')}
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
                claimEvents.map((evt) => {
                  const paParticipant = evt.participants?.find(p => p.participantType === 'public_adjuster');
                  const carrierParticipant = evt.participants?.find(p => p.participantType === 'carrier_representative');
                  const adjusterPhone = carrierParticipant?.carrierRep?.phone || (claim.carrierReps && claim.carrierReps[0]?.phone);
                  const paPhone = paParticipant?.publicAdjuster?.phone || claim.publicAdjuster?.phone;
                  const insuredPhone = claim.insured?.phone;
                  const sla = getEventSlaStatus(evt, slaConfig);

                  return (
                    <div
                      key={evt.id}
                      className={`bg-slate-50/70 border rounded-xl p-4 space-y-3 transition-colors ${
                        sla.alertLevel === 'critical'
                          ? 'border-red-300 border-l-4 border-l-red-600 bg-red-50/15'
                          : sla.alertLevel === 'warning'
                          ? 'border-amber-300 border-l-4 border-l-amber-500 bg-amber-50/15'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
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

                          {/* SLA Aging Pill */}
                          {sla.alertLevel === 'critical' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1 shadow-2xs">
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              <span>STALLED: {sla.timeLabel}</span>
                            </span>
                          ) : sla.alertLevel === 'warning' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>OVERDUE: {sla.timeLabel}</span>
                            </span>
                          ) : evt.coordinationStage !== '4_confirmed' ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>⏱️ Active: {sla.timeLabel}</span>
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{evt.location}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryEventTarget(evt)}
                          title="View complete event history and audit logs"
                          className="text-xs font-semibold text-slate-700 hover:text-tealBrand-800 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <History className="w-3 h-3 text-tealBrand-600" />
                          <span>History ({evt.logs?.length || 0})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEventToReset(evt)}
                          title="Reset or cancel coordination flow back to Stage 1"
                          className="text-xs font-semibold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <RotateCcw className="w-3 h-3 text-rose-600" />
                          <span>Reset Flow</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onViewInFunnel(claim.claimNumber)}
                          className="text-xs font-bold text-tealBrand-700 hover:text-tealBrand-900 bg-white border border-tealBrand-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <span>View Funnel</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditEvent(evt)}
                          title="Edit event details & participants"
                          className="text-xs font-semibold text-slate-700 hover:text-maroon-900 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 text-slate-600" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingEventTarget(evt)}
                          title="Delete Event"
                          className="text-xs font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-red-200 px-2 py-1 rounded-md transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* COORDINATION FUNNEL FLOW */}
                    <div className="pt-2 border-t border-slate-200 space-y-3">
                      {/* Step Indicator Bar */}
                      <div className="flex items-center justify-between text-[11px] font-semibold bg-slate-100 p-2 rounded-lg border border-slate-200">
                        <span className={`flex items-center gap-1 ${evt.coordinationStage === '1_awaiting_carrier_slots' ? 'text-maroon-800 font-bold' : 'text-slate-500'}`}>
                          <span>1. Carrier Dates</span>
                        </span>
                        <span className="text-slate-300">➔</span>
                        <span className={`flex items-center gap-1 ${evt.coordinationStage === '2_pa_review' ? 'text-tealBrand-800 font-bold' : 'text-slate-500'}`}>
                          <span>2. PA Picks 2</span>
                        </span>
                        <span className="text-slate-300">➔</span>
                        <span className={`flex items-center gap-1 ${evt.coordinationStage === '3_insured_selection' ? 'text-tealBrand-800 font-bold' : 'text-slate-500'}`}>
                          <span>3. Client Picks 1</span>
                        </span>
                        <span className="text-slate-300">➔</span>
                        <span className={`flex items-center gap-1 ${evt.coordinationStage === '4_confirmed' ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                          <span>4. Confirmed</span>
                        </span>
                      </div>

                      {/* Bottleneck Alert Banner if Stalled or Warning */}
                      {sla.isStalled && (
                        <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          sla.alertLevel === 'critical'
                            ? 'bg-red-50 border-red-200 text-red-950'
                            : 'bg-amber-50 border-amber-200 text-amber-950'
                        }`}>
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${sla.alertLevel === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                            <div>
                              <span className="text-xs font-bold block">{sla.alertMessage}</span>
                              <p className="text-[11px] opacity-90">{sla.actionRecommendation}</p>
                            </div>
                          </div>

                          {/* Quick Dial Button for the bottleneck actor via Nextiva */}
                          {sla.targetActorType === 'carrier' && adjusterPhone && (
                            <a
                              href={getNextivaTelUri(adjusterPhone) || `tel:${adjusterPhone}`}
                              className="px-3 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
                              title={`Call adjuster ${formatPhoneNumber(adjusterPhone)} via Nextiva`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call Adjuster (Nextiva)</span>
                            </a>
                          )}
                          {sla.targetActorType === 'pa' && paPhone && (
                            <a
                              href={getNextivaTelUri(paPhone) || `tel:${paPhone}`}
                              className="px-3 py-1.5 bg-tealBrand-800 hover:bg-tealBrand-900 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
                              title={`Call PA ${formatPhoneNumber(paPhone)} via Nextiva`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call PA (Nextiva)</span>
                            </a>
                          )}
                          {sla.targetActorType === 'insured' && insuredPhone && (
                            <a
                              href={getNextivaTelUri(insuredPhone) || `tel:${insuredPhone}`}
                              className="px-3 py-1.5 bg-tealBrand-800 hover:bg-tealBrand-900 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
                              title={`Call Insured ${formatPhoneNumber(insuredPhone)} via Nextiva`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call Client (Nextiva)</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* STEP 1: CARRIER DATES NOT YET RECORDED */}
                      {evt.coordinationStage === '1_awaiting_carrier_slots' && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                              <span>⏳ Step 1: Record Carrier Offered Dates</span>
                            </span>
                            <p className="text-[11px] text-amber-800">
                              Awaiting the 3 inspection date/time options from {claim.carrier} (or external adjuster).
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {adjusterPhone && (
                              <a
                                href={getNextivaTelUri(adjusterPhone) || `tel:${adjusterPhone}`}
                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
                                title={`Call adjuster ${formatPhoneNumber(adjusterPhone)} via Nextiva`}
                              >
                                <Phone className="w-3.5 h-3.5 text-maroon-800" />
                                <span>Call Adjuster (Nextiva)</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setRecordingSlotsEvent(evt)}
                              className="px-3 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-xs flex items-center gap-1.5"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>+ Record 3 Dates Offered</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 1 (COMPLETED): CARRIER DATES RECORDED & PASSED TO PA */}
                      {evt.coordinationStage !== '1_awaiting_carrier_slots' && evt.slots && evt.slots.length > 0 && (
                        <div className="p-3 bg-tealBrand-50/40 border border-tealBrand-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900">Carrier Proposed Dates ({evt.slots.length})</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tealBrand-100 text-tealBrand-800 border border-tealBrand-200">
                                ✓ Passed to PA
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setRecordingSlotsEvent(evt)}
                              className="text-xs font-bold text-tealBrand-800 hover:text-tealBrand-900 bg-white hover:bg-slate-50 border border-tealBrand-300 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                              title="Modify or edit the dates provided by the carrier"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Modify Dates</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {evt.slots.map((s, idx) => (
                              <div key={s.id || idx} className="bg-white border border-slate-200 rounded-lg p-2 text-xs">
                                <span className="font-semibold text-slate-800 block">Option #{idx + 1}: 📅 {s.slotDate}</span>
                                <span className="text-[11px] text-slate-500 font-mono">{s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* STEP 2: PA REVIEW (PICK 2 OF 3) */}
                      {evt.coordinationStage === '2_pa_review' && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-tealBrand-600 inline-block" />
                                Step 2: Public Adjuster Review
                              </h5>
                              <p className="text-[11px] text-slate-500">
                                Select <strong>2 of the 3</strong> dates proposed by the carrier to offer the client.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                (paSelectedSlotIds[evt.id] || []).length === 2
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {(paSelectedSlotIds[evt.id] || []).length} of 2 Selected
                              </span>
                              <button
                                type="button"
                                onClick={() => setRecordingSlotsEvent(evt)}
                                className="text-[11px] text-slate-500 hover:underline"
                              >
                                Edit Carrier Dates
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {(evt.slots || []).map((s) => {
                              const isSelected = (paSelectedSlotIds[evt.id] || []).includes(s.id);
                              return (
                                <button
                                  type="button"
                                  key={s.id}
                                  onClick={() => handleTogglePaSlot(evt.id, s.id)}
                                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                                    isSelected
                                      ? 'bg-tealBrand-50 border-tealBrand-600 text-tealBrand-950 shadow-xs ring-1 ring-tealBrand-600'
                                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full mb-1">
                                    <span className="text-xs font-bold">📅 {s.slotDate}</span>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                                      isSelected
                                        ? 'bg-tealBrand-800 border-tealBrand-800 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}>
                                      {isSelected ? '✓' : ''}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                            {paPhone && (
                              <a
                                href={getNextivaTelUri(paPhone) || `tel:${paPhone}`}
                                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
                                title={`Call PA ${formatPhoneNumber(paPhone)} via Nextiva`}
                              >
                                <Phone className="w-3.5 h-3.5 text-tealBrand-700" />
                                <span>Call PA (Nextiva)</span>
                              </a>
                            )}
                            <button
                              type="button"
                              disabled={(paSelectedSlotIds[evt.id] || []).length !== 2 || paConfirmingEventId === evt.id}
                              onClick={() => handlePaConfirmSlots(evt)}
                              className="px-4 py-2 bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                            >
                              <span>{paConfirmingEventId === evt.id ? 'Saving...' : 'Confirm 2 Options & Send to Insured ➔'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 3: INSURED SELECTION (CLIENT PICKS 1 OF 2) */}
                      {evt.coordinationStage === '3_insured_selection' && (
                        <div className="p-3 bg-tealBrand-50/70 border border-tealBrand-200 rounded-xl space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h5 className="text-xs font-bold text-tealBrand-950 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-tealBrand-600 inline-block" />
                                Step 3: Insured Choice (Pick 1 of the 2 options)
                              </h5>
                              <p className="text-[11px] text-tealBrand-800 mt-0.5">
                                Offer these 2 pre-approved options to the client. Click on the option they choose to lock the date.
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                              {insuredPhone && (
                                <a
                                  href={getNextivaTelUri(insuredPhone) || `tel:${insuredPhone}`}
                                  className="px-2.5 py-1.5 bg-white border border-tealBrand-300 text-tealBrand-900 hover:bg-tealBrand-100 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                  title={`Call insured ${formatPhoneNumber(insuredPhone)} via Nextiva`}
                                >
                                  <Phone className="w-3.5 h-3.5 text-tealBrand-700" />
                                  <span>Call Insured (Nextiva)</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => copyInsuredMessage(evt)}
                                className="px-2.5 py-1.5 bg-white border border-tealBrand-300 text-tealBrand-900 hover:bg-tealBrand-100 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                              >
                                {copiedSlotId === evt.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copiedSlotId === evt.id ? 'Copied!' : 'Copy for WhatsApp/SMS'}</span>
                              </button>
                              {claim.insured?.phone && (
                                <a
                                  href={`https://wa.me/1${claim.insured.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                    `Hello ${claim.insured.name || 'Insured'}, this is IP Adjusters coordinating the inspection for your claim with ${claim.carrier} (${evt.location}).\n\nWe have 2 options available:\n` +
                                    (evt.slots || []).filter(s => s.status === 'pa_accepted').map((s, idx) => `Option ${idx + 1}: ${s.slotDate} from ${s.startTime.slice(0, 5)} to ${s.endTime.slice(0, 5)}`).join('\n') +
                                    `\n\nPlease let us know which option works best for you. Thank you!`
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-white border border-tealBrand-300 text-tealBrand-800 hover:bg-tealBrand-100 rounded-md flex items-center justify-center transition-colors shadow-xs"
                                  title="Open in WhatsApp"
                                >
                                  <Send className="w-3.5 h-3.5 text-tealBrand-700" />
                                </a>
                              )}
                              {claim.insured?.email && (
                                <button
                                  type="button"
                                  onClick={() => handleSendInsuredEmail(evt.id)}
                                  disabled={sendingEmailEventId === evt.id}
                                  className="px-2.5 py-1.5 bg-white border border-tealBrand-300 text-tealBrand-900 hover:bg-tealBrand-100 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                  title="Send or resend 1-click email invitation to Insured"
                                >
                                  <Mail className="w-3.5 h-3.5 text-tealBrand-700" />
                                  <span>{sendingEmailEventId === evt.id ? 'Sending...' : 'Email Client'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(evt.slots || [])
                              .filter((s) => s.status === 'pa_accepted' || s.status === 'proposed')
                              .map((s) => (
                                <div
                                  key={s.id}
                                  className="p-3 bg-white border-2 border-tealBrand-300 rounded-lg flex items-center justify-between gap-2 shadow-xs"
                                >
                                  <div>
                                    <span className="font-bold text-slate-900 text-xs block">📅 {s.slotDate}</span>
                                    <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                      <Clock className="w-3 h-3" />
                                      <span>{s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}</span>
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={insuredConfirmingSlotId === s.id}
                                    onClick={() => handleInsuredConfirmSlot(evt, s)}
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0 flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{insuredConfirmingSlotId === s.id ? 'Locking...' : 'Client Picked This ➔'}</span>
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* STEP 4: CONFIRMED / LOCKED */}
                      {evt.coordinationStage === '4_confirmed' && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                                ✓
                              </div>
                              <span className="text-xs font-bold text-emerald-950">
                                Inspection Confirmed & Locked!
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 uppercase tracking-wide">
                              Step 4: Confirmed
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span>📅 Date: <strong>{evt.finalDate}</strong></span>
                              <span>⏰ Time: <strong>{evt.finalStartTime?.slice(0, 5)} - {evt.finalEndTime?.slice(0, 5)}</strong></span>
                            </div>
                            <span className="text-[11px] text-emerald-700 font-semibold">Locked on Calendar</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Access Codes Info if available */}
                    {(evt.gateCode || evt.lockboxCode || evt.accessInstructions) && (
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex flex-wrap gap-4">
                        {evt.gateCode && <span>Gate: <strong>{evt.gateCode}</strong></span>}
                        {evt.lockboxCode && <span>Lockbox: <strong>{evt.lockboxCode}</strong></span>}
                        {evt.accessInstructions && <span>Notes: <em>{evt.accessInstructions}</em></span>}
                      </div>
                    )}

                    {/* Activity & Cancellation / Reset History Logs */}
                    {evt.logs && evt.logs.length > 0 && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                        <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                          <span>📋 Activity & Cancellation Logs</span>
                          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono text-[10px]">
                            {evt.logs.length}
                          </span>
                        </span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {evt.logs.map((log) => (
                            <div key={log.id} className="text-xs bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 flex items-start justify-between gap-3 shadow-2xs">
                              <div className="space-y-0.5">
                                <p className="font-semibold text-slate-900 leading-snug">{log.notes}</p>
                                {log.contactTargetName && (
                                  <span className="text-[10px] text-slate-500 block">Party / Actor: <strong>{log.contactTargetName}</strong></span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0 whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
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
                      value={actorForm.typeOfRepresentative || carrierRepRoles[0] || 'Field Adjuster'}
                      onChange={(e) => setActorForm({ ...actorForm, typeOfRepresentative: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                    >
                      {carrierRepRoles.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      {actorForm.typeOfRepresentative && !carrierRepRoles.includes(actorForm.typeOfRepresentative) && (
                        <option value={actorForm.typeOfRepresentative}>{actorForm.typeOfRepresentative}</option>
                      )}
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
                      value={actorForm.typeOfActor || actorRoles[0] || 'Appraiser'}
                      onChange={(e) => setActorForm({ ...actorForm, typeOfActor: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                    >
                      {actorRoles.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      {actorForm.typeOfActor && !actorRoles.includes(actorForm.typeOfActor) && (
                        <option value={actorForm.typeOfActor}>{actorForm.typeOfActor}</option>
                      )}
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
                      value={actorForm.role || paRoles[0] || 'Public Adjuster'}
                      onChange={(e) => setActorForm({ ...actorForm, role: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-maroon-800"
                    >
                      {paRoles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      {actorForm.role && !paRoles.includes(actorForm.role) && (
                        <option value={actorForm.role}>{actorForm.role}</option>
                      )}
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
                    onChange={(e) => setActorForm({ ...actorForm, phone: formatPhoneAsYouType(e.target.value) })}
                    placeholder="(305) 555-0199"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={actorForm.email || ''}
                    onChange={(e) => setActorForm({ ...actorForm, email: e.target.value.toLowerCase().trim() })}
                    placeholder="email@example.com"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
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
                    onChange={(e) => setClaimForm({ ...claimForm, claimNumber: formatClaimNumber(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA] font-mono font-bold"
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
                    onChange={(e) => setClaimForm({ ...claimForm, zipCode: formatZipCode(e.target.value) })}
                    placeholder="33130"
                    maxLength={10}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
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
                    onChange={(e) => setQuickPaForm({ ...quickPaForm, phone: formatPhoneAsYouType(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role / Title</label>
                  <select
                    value={quickPaForm.role}
                    onChange={(e) => setQuickPaForm({ ...quickPaForm, role: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
                  >
                    {paRoles.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    {quickPaForm.role && !paRoles.includes(quickPaForm.role) && (
                      <option value={quickPaForm.role}>{quickPaForm.role}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="john@ipadjusters.com"
                  value={quickPaForm.email}
                  onChange={(e) => setQuickPaForm({ ...quickPaForm, email: e.target.value.toLowerCase().trim() })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
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
                    {actorRoles.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    {quickExtForm.typeOfActor && !actorRoles.includes(quickExtForm.typeOfActor) && (
                      <option value={quickExtForm.typeOfActor}>{quickExtForm.typeOfActor}</option>
                    )}
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
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, phone: formatPhoneAsYouType(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="mike@apexflorida.com"
                    value={quickExtForm.email}
                    onChange={(e) => setQuickExtForm({ ...quickExtForm, email: e.target.value.toLowerCase().trim() })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#1187AA]"
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

      {/* DELETE EVENT CONFIRMATION MODAL */}
      {deletingEventTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Inspection Event</h3>
                <p className="text-xs text-slate-500">Are you sure you want to delete this event?</p>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-800">{deletingEventTarget.eventType}</p>
              <p className="text-slate-500">{deletingEventTarget.location}</p>
              <p className="text-[11px] text-amber-700 font-medium">⚠️ All proposed time slots and coordination notes linked to this event will also be removed.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingEventTarget(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingEventLoading}
                onClick={handleConfirmDeleteEvent}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingEventLoading ? 'Deleting...' : 'Yes, Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD CARRIER SLOTS MODAL (STEP 1) */}
      {recordingSlotsEvent && (
        <RecordCarrierSlotsModal
          isOpen={Boolean(recordingSlotsEvent)}
          onClose={() => setRecordingSlotsEvent(null)}
          event={recordingSlotsEvent}
          claim={claim}
          onSaved={onEventCreated}
        />
      )}

      {/* RESET COORDINATION FLOW MODAL */}
      {eventToReset && (
        <ResetCoordinationModal
          event={eventToReset}
          isOpen={Boolean(eventToReset)}
          onClose={() => setEventToReset(null)}
          onConfirm={handleConfirmReset}
        />
      )}

      {/* EVENT HISTORY & AUDIT LOG MODAL */}
      {historyEventTarget && (
        <EventHistoryModal
          event={historyEventTarget}
          isOpen={Boolean(historyEventTarget)}
          onClose={() => setHistoryEventTarget(null)}
          onLogAdded={async () => {
            await onClaimUpdated();
            onEventCreated();
          }}
        />
      )}

      {/* DELETE CLAIM CONFIRMATION MODAL */}
      {showDeleteClaimModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Claim</h3>
                <p className="text-xs text-slate-500">Are you sure you want to delete this claim?</p>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-800 font-mono">Claim #{claim.claimNumber}</p>
              <p className="text-slate-600 font-semibold">{claim.carrier} · {claim.insured?.name || 'No client name'}</p>
              <p className="text-slate-500">{claim.propertyAddress}</p>
              <p className="text-[11px] text-amber-700 font-medium pt-1">⚠️ This will permanently delete this claim and all associated events, time slots, and coordination logs.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeleteClaimModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingClaimLoading}
                onClick={handleConfirmDeleteClaim}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deletingClaimLoading ? 'Deleting...' : 'Yes, Delete Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

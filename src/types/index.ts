export type CoordinationStage = 
  | '1_awaiting_carrier_slots' 
  | '2_pa_review' 
  | '3_insured_selection' 
  | '4_confirmed';

export type EventStatus = 
  | 'coordinating' 
  | 'scheduled' 
  | 'completed' 
  | 'cancelled' 
  | 'rescheduled';

export type SlotStatus = 
  | 'proposed' 
  | 'pa_accepted' 
  | 'pa_rejected' 
  | 'insured_chosen' 
  | 'discarded';

export type ParticipantRole = 'actor' | 'informed';

export type ContactChannel = 
  | 'call_unanswered' 
  | 'call_answered' 
  | 'voicemail' 
  | 'whatsapp' 
  | 'sms' 
  | 'email';

export interface PublicAdjuster {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: 'adjuster' | 'senior_adjuster' | 'director' | string;
  generalAvailability?: string;
  colorCode: string;
  isActive: boolean;
}

export interface CarrierRepresentative {
  id: string;
  carrierName: string;
  name: string;
  typeOfRepresentative: string; // 'Field Adjuster', 'Desk Adjuster', etc.
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
}

export interface ExternalActor {
  id: string;
  name: string;
  typeOfActor: string; // 'Appraiser', 'Umpire', 'Structural Engineer', etc.
  company?: string;
  phone?: string;
  email?: string;
  generalAvailability?: string;
  notes?: string;
}

export interface Insured {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  generalAvailability?: string;
  notes?: string;
}

export interface Claim {
  id: string;
  insuredId?: string;
  carrier: string;
  claimNumber: string;
  policyNumber?: string;
  typeOfLoss: string;
  propertyAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfLoss?: string;
  status: 'Open' | 'Under Review' | 'Appraisal' | 'Settled' | 'Closed';
  notes?: string;
  publicAdjusterId?: string;
  insured?: Insured;
  publicAdjuster?: PublicAdjuster;
  carrierReps?: CarrierRepresentative[];
  externalActors?: ExternalActor[];
}

export interface EventSlot {
  id: string;
  eventId: string;
  slotDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string;   // HH:mm:ss
  status: SlotStatus;
  rejectionReason?: string;
  deadlineAt?: string;
}

export interface EventParticipant {
  id: string;
  eventId: string;
  participantType: 'insured' | 'public_adjuster' | 'carrier_representative' | 'external_actor' | 'office';
  roleType: ParticipantRole; // 'actor' | 'informed'
  publicAdjusterId?: string;
  carrierRepId?: string;
  externalActorId?: string;
  insuredId?: string;
  customName?: string;
  customEmail?: string;
  customPhone?: string;
  // Joins
  publicAdjuster?: PublicAdjuster;
  carrierRep?: CarrierRepresentative;
  externalActor?: ExternalActor;
  insured?: Insured;
}

export interface CoordinationLog {
  id: string;
  eventId: string;
  contactTarget: 'insured' | 'carrier_rep' | 'pa' | 'external_actor';
  contactTargetName?: string;
  channel: ContactChannel;
  notes?: string;
  createdAt: string;
}

export interface CoordinationEvent {
  id: string;
  claimId: string;
  eventType: string; // 'Initial Inspection', 'Carrier Re-Inspection', 'Appraisal Meeting', etc.
  status: EventStatus;
  coordinationStage: CoordinationStage;
  carrierSlotsDeadline?: string;
  finalDate?: string;
  finalStartTime?: string;
  finalEndTime?: string;
  location: string;
  lockboxCode?: string;
  gateCode?: string;
  accessInstructions?: string;
  noticeSentAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Joins
  claim?: Claim;
  slots?: EventSlot[];
  participants?: EventParticipant[];
  logs?: CoordinationLog[];
}

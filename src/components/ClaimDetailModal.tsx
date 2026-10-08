import { useState } from 'react';
import { 
  X, 
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
  Edit3
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import type { Claim, PublicAdjuster, CoordinationEvent, CoordinationStage } from '../types';

interface ClaimDetailModalProps {
  claim: Claim | null;
  isOpen: boolean;
  onClose: () => void;
  pas: PublicAdjuster[];
  events: CoordinationEvent[];
  onEventCreated: () => void;
  onViewInFunnel: (claimNumber: string) => void;
  onEditClaim: (claim: Claim) => void;
}

const EVENT_TYPES = [
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

export function ClaimDetailModal({
  claim,
  isOpen,
  onClose,
  pas,
  events,
  onEventCreated,
  onViewInFunnel,
  onEditClaim,
}: ClaimDetailModalProps) {
  // Add Event Form State
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventType, setEventType] = useState('Initial Inspection');
  const [coordinationStage, setCoordinationStage] = useState<CoordinationStage>('1_awaiting_carrier_slots');
  const [location, setLocation] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [lockboxCode, setLockboxCode] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [includeInsured, setIncludeInsured] = useState(true);
  const [includePa, setIncludePa] = useState(true);
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  if (!isOpen || !claim) return null;

  // Filter events belonging to this claim
  const claimEvents = events.filter((e) => e.claimId === claim.id);

  // Assigned PA
  const assignedPa = pas.find((p) => p.id === claim.publicAdjusterId);

  // Initialize event location with claim address when opening form
  const handleOpenAddEvent = () => {
    setLocation(`${claim.propertyAddress}, ${claim.city || 'Miami'}, ${claim.state || 'FL'} ${claim.zipCode || ''}`.trim());
    setGateCode('');
    setLockboxCode('');
    setAccessInstructions('');
    setEventNotes('');
    setEventError(null);
    setShowAddEvent(true);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setEventError('Inspection location is required');
      return;
    }

    setSubmittingEvent(true);
    setEventError(null);

    try {
      const participants: any[] = [];
      if (includeInsured && claim.insuredId) {
        participants.push({
          participantType: 'insured',
          roleType: 'actor',
          insuredId: claim.insuredId,
        });
      }
      if (includePa && claim.publicAdjusterId) {
        participants.push({
          participantType: 'public_adjuster',
          roleType: 'actor',
          publicAdjusterId: claim.publicAdjusterId,
        });
      }
      if (claim.carrierReps && claim.carrierReps.length > 0) {
        participants.push({
          participantType: 'carrier_representative',
          roleType: 'actor',
          carrierRepId: claim.carrierReps[0].id,
        });
      }
      if (claim.externalActors && claim.externalActors.length > 0) {
        participants.push({
          participantType: 'external_actor',
          roleType: 'actor',
          externalActorId: claim.externalActors[0].id,
        });
      }

      await schedulingService.createEvent({
        claimId: claim.id,
        eventType,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 overflow-hidden">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon-800 text-white flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5 text-tealBrand-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight font-mono">{claim.claimNumber}</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  claim.status === 'Open' ? 'bg-emerald-100 text-emerald-800' :
                  claim.status === 'Appraisal' ? 'bg-amber-100 text-amber-800' :
                  claim.status === 'Settled' ? 'bg-tealBrand-100 text-tealBrand-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {claim.status || 'Open'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {claim.carrier} {claim.policyNumber ? `· Policy: ${claim.policyNumber}` : ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEditClaim(claim)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-maroon-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-maroon-800" />
              <span>Edit Claim</span>
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: 2 Columns */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: CLAIM DETAILS & ACTORS (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Claim & Property Overview */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Claim Record Overview
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500">Carrier:</span>
                    <strong className="text-slate-900 font-semibold">{claim.carrier}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500">Type of Loss:</span>
                    <strong className="text-slate-900 font-semibold">{claim.typeOfLoss}</strong>
                  </div>
                  {claim.dateOfLoss && (
                    <div className="flex justify-between py-1 border-b border-slate-200">
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
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 block mb-0.5">Remarks / Instructions:</span>
                      <p className="text-slate-700 bg-white p-2 rounded border border-slate-200 text-[11px] whitespace-pre-wrap">
                        {claim.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Insured Client */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Insured Policyholder
                </h3>

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
                      <div className="mt-2 p-2 bg-tealBrand-50 border border-tealBrand-200 rounded text-[11px] text-tealBrand-900">
                        📅 <strong>General Availability:</strong> {claim.insured.generalAvailability}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No insured details attached.</p>
                )}
              </div>

              {/* Assigned Public Adjuster */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  Assigned Public Adjuster (PA)
                </h3>

                {assignedPa ? (
                  <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200">
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
                      <a href={`tel:${assignedPa.phone}`} className="text-tealBrand-700 hover:text-tealBrand-900 font-mono text-[11px]">
                        {assignedPa.phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No public adjuster assigned yet.</p>
                )}
              </div>

              {/* Carrier Representative */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Carrier Representative (Field / Desk Adjuster)
                </h3>

                {claim.carrierReps && claim.carrierReps.length > 0 ? (
                  <div className="space-y-2">
                    {claim.carrierReps.map((rep) => (
                      <div key={rep.id} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <strong className="text-slate-900">{rep.name}</strong>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-200">
                            {rep.typeOfRepresentative || 'Field Adjuster'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">Company: {rep.company || rep.carrierName}</p>
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600">
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

              {/* External Actor */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" />
                  External Actor (Contractor / Appraiser / Umpire)
                </h3>

                {claim.externalActors && claim.externalActors.length > 0 ? (
                  <div className="space-y-2">
                    {claim.externalActors.map((ext) => (
                      <div key={ext.id} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <strong className="text-slate-900">{ext.name}</strong>
                          <span className="text-[10px] bg-tealBrand-50 text-tealBrand-800 px-2 py-0.5 rounded font-semibold border border-tealBrand-200">
                            {ext.typeOfActor}
                          </span>
                        </div>
                        {ext.company && <p className="text-[11px] text-slate-500 font-medium">{ext.company}</p>}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600">
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

            {/* RIGHT COLUMN: INSPECTION EVENTS & SCHEDULING (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-maroon-800" />
                    Inspection & Coordination Events
                  </h3>
                  <p className="text-xs text-slate-500">Manage all scheduling appointments for this claim</p>
                </div>

                {!showAddEvent && (
                  <button
                    type="button"
                    onClick={handleOpenAddEvent}
                    className="inline-flex items-center gap-1.5 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add Inspection Event</span>
                  </button>
                )}
              </div>

              {/* INLINE FORM: ADD EVENT */}
              {showAddEvent && (
                <div className="bg-slate-50 border-2 border-maroon-800/30 rounded-xl p-4 space-y-4 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <h4 className="text-xs font-bold text-maroon-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      Schedule New Event
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
                          Event / Inspection Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={eventType}
                          onChange={(e) => setEventType(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                        >
                          {EVENT_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Starting Coordination Stage <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={coordinationStage}
                          onChange={(e) => setCoordinationStage(e.target.value as CoordinationStage)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800 font-medium"
                        >
                          <option value="1_awaiting_carrier_slots">1. Awaiting Carrier Dates</option>
                          <option value="2_pa_review">2. PA Review (Dates ready)</option>
                          <option value="3_insured_selection">3. Insured Choice</option>
                          <option value="4_confirmed">4. Confirmed / Scheduled</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Inspection Location Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Property address for inspection"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gate Code</label>
                        <input
                          type="text"
                          placeholder="#1234"
                          value={gateCode}
                          onChange={(e) => setGateCode(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Lockbox Code</label>
                        <input
                          type="text"
                          placeholder="5678"
                          value={lockboxCode}
                          onChange={(e) => setLockboxCode(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Access Notes</label>
                        <input
                          type="text"
                          placeholder="e.g. Side gate open"
                          value={accessInstructions}
                          onChange={(e) => setAccessInstructions(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Participants to Link:
                      </label>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeInsured}
                            onChange={(e) => setIncludeInsured(e.target.checked)}
                            className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                          />
                          <span>Insured ({claim.insured?.name || 'Client'})</span>
                        </label>
                        {assignedPa && (
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includePa}
                              onChange={(e) => setIncludePa(e.target.checked)}
                              className="rounded border-slate-300 text-maroon-800 focus:ring-maroon-800"
                            />
                            <span>PA ({assignedPa.name})</span>
                          </label>
                        )}
                        {claim.carrierReps && claim.carrierReps.length > 0 && (
                          <span className="text-slate-500 font-medium">
                            · Rep: {claim.carrierReps[0].name}
                          </span>
                        )}
                        {claim.externalActors && claim.externalActors.length > 0 && (
                          <span className="text-slate-500 font-medium">
                            · Ext: {claim.externalActors[0].name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Event Notes</label>
                      <textarea
                        rows={2}
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                        placeholder="Coordinator notes or requirements for this inspection..."
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAddEvent(false)}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingEvent}
                        className="px-4 py-1.5 text-xs font-bold bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {submittingEvent ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Adding Event...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Add Event to Funnel</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* LIST OF EVENTS */}
              <div className="space-y-3">
                {claimEvents.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3">
                    <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">No events scheduled for this claim</h4>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-0.5">
                        You can add the first inspection event (Initial Inspection, Re-Inspection, Appraisal, etc.) whenever you are ready to coordinate.
                      </p>
                    </div>
                    {!showAddEvent && (
                      <button
                        type="button"
                        onClick={handleOpenAddEvent}
                        className="inline-flex items-center gap-1.5 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-xs transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add First Inspection Event</span>
                      </button>
                    )}
                  </div>
                ) : (
                  claimEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="bg-white border border-slate-200 hover:border-maroon-800 rounded-xl p-4 space-y-3 shadow-xs transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                            Inspection Event
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 mt-0.5">{evt.eventType}</h4>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          evt.coordinationStage === '1_awaiting_carrier_slots' ? 'bg-amber-100 text-amber-800' :
                          evt.coordinationStage === '2_pa_review' ? 'bg-tealBrand-100 text-tealBrand-800' :
                          evt.coordinationStage === '3_insured_selection' ? 'bg-maroon-100 text-maroon-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {evt.coordinationStage.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="text-xs space-y-1 text-slate-600">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>{evt.location}</span>
                        </div>
                        {evt.finalDate && (
                          <div className="flex items-center gap-1.5 text-emerald-800 font-semibold pt-1">
                            <Clock className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Confirmed: {evt.finalDate} ({evt.finalStartTime?.slice(0, 5)} - {evt.finalEndTime?.slice(0, 5)})</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          {evt.slots && evt.slots.length > 0 ? `${evt.slots.length} dates proposed` : 'Awaiting dates'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onViewInFunnel(claim.claimNumber);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-tealBrand-700 hover:text-tealBrand-900 bg-tealBrand-50 hover:bg-tealBrand-100 px-3 py-1 rounded-lg border border-tealBrand-200 transition-colors"
                        >
                          <span>Open in Funnel</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 rounded-b-2xl">
          <span className="text-xs text-slate-500 font-mono">ID: {claim.id}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition-colors"
          >
            Close View
          </button>
        </div>

      </div>
    </div>
  );
}

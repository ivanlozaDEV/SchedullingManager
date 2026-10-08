import { useState, useEffect } from 'react';
import { 
  Search, 
  ShieldCheck, 
  Phone, 
  RefreshCw, 
  Copy, 
  Check, 
  Send, 
  Plus,
  Kanban,
  FolderOpen,
  MapPin,
  User,
  ArrowRight
} from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';
import { schedulingService } from './lib/schedulingService';
import { NewClaimModal } from './components/NewClaimModal';
import { ClaimDetailView } from './components/ClaimDetailView';
import type { 
  CoordinationEvent, 
  PublicAdjuster, 
  CarrierRepresentative, 
  ExternalActor,
  CoordinationStage,
  Claim
} from './types';

export function App() {
  const [events, setEvents] = useState<CoordinationEvent[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pas, setPas] = useState<PublicAdjuster[]>([]);
  const [, setCarrierReps] = useState<CarrierRepresentative[]>([]);
  const [, setExternalActors] = useState<ExternalActor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isNewClaimOpen, setIsNewClaimOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'funnel' | 'claims'>('funnel');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [claimToEdit, setClaimToEdit] = useState<Claim | null>(null);

  // Load live data from Supabase
  const loadData = async () => {
    if (!isSupabaseConfigured) return [];
    setLoading(true);
    try {
      const [dbPas, dbReps, dbExternals, dbEvents, dbClaims] = await Promise.all([
        schedulingService.getPublicAdjusters(),
        schedulingService.getCarrierReps(),
        schedulingService.getExternalActors(),
        schedulingService.getEvents(),
        schedulingService.getClaims(),
      ]);

      if (dbPas.length > 0) setPas(dbPas);
      if (dbReps.length > 0) setCarrierReps(dbReps);
      if (dbExternals.length > 0) setExternalActors(dbExternals);
      setEvents(dbEvents);
      setClaims(dbClaims);
      return dbClaims;
    } catch (err) {
      console.error('Error fetching live data:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick message generator for WhatsApp / SMS in English
  const generateInsuredMessage = (evt: CoordinationEvent) => {
    const insuredName = evt.claim?.insured?.name || 'Insured';
    const carrier = evt.claim?.carrier || 'the insurance carrier';
    const address = evt.location;
    const acceptedSlots = (evt.slots || []).filter(s => s.status === 'pa_accepted' || s.status === 'proposed');

    let text = `Hello ${insuredName}, this is IP Adjusters coordinating the inspection for your claim with ${carrier} (${address}).\n\n`;
    text += `We have the following date and time options available:\n`;
    acceptedSlots.forEach((s, idx) => {
      text += `📍 Option ${idx + 1}: ${s.slotDate} from ${s.startTime.slice(0, 5)} to ${s.endTime.slice(0, 5)}\n`;
    });
    text += `\nPlease let us know which option works best for you. Thank you!`;
    return text;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Pipeline Stages in English with solid colors
  const stages: { key: CoordinationStage; title: string; desc: string; badgeBg: string; badgeText: string; headerBorder: string }[] = [
    { 
      key: '1_awaiting_carrier_slots', 
      title: '1. Awaiting Dates', 
      desc: 'Carrier has not proposed slots yet', 
      badgeBg: 'bg-amber-100', 
      badgeText: 'text-amber-800',
      headerBorder: 'border-amber-400'
    },
    { 
      key: '2_pa_review', 
      title: '2. PA Review', 
      desc: 'Carrier offered dates, PA must filter', 
      badgeBg: 'bg-tealBrand-100', 
      badgeText: 'text-tealBrand-800',
      headerBorder: 'border-tealBrand-500'
    },
    { 
      key: '3_insured_selection', 
      title: '3. Insured Choice', 
      desc: 'PA filtered, insured chooses 1 option', 
      badgeBg: 'bg-maroon-100', 
      badgeText: 'text-maroon-800',
      headerBorder: 'border-maroon-700'
    },
    { 
      key: '4_confirmed', 
      title: '4. Confirmed', 
      desc: 'Event locked with final date & time', 
      badgeBg: 'bg-emerald-100', 
      badgeText: 'text-emerald-800',
      headerBorder: 'border-emerald-500'
    },
  ];

  const filteredEvents = events.filter(e => {
    const q = searchQuery.toLowerCase();
    return (
      e.eventType.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      (e.claim?.claimNumber.toLowerCase().includes(q) ?? false) ||
      (e.claim?.insured?.name.toLowerCase().includes(q) ?? false) ||
      (e.claim?.carrier.toLowerCase().includes(q) ?? false)
    );
  });

  const filteredClaims = claims.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.claimNumber.toLowerCase().includes(q) ||
      c.carrier.toLowerCase().includes(q) ||
      c.propertyAddress.toLowerCase().includes(q) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.insured?.name && c.insured.name.toLowerCase().includes(q)) ||
      (c.insured?.phone && c.insured.phone.includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Clean Light Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-maroon-800 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-6 h-6 text-tealBrand-300" />
            </div>
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-maroon-800">
                <span className="italic">IP</span> <span className="text-slate-900 font-bold">Adjusters</span>
              </span>
              <p className="text-xs text-slate-500 font-medium">Inspection Scheduling & Coordination</p>
            </div>
          </div>

          {/* Action buttons & View Switcher */}
          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh data"
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-maroon-800' : ''}`} />
            </button>

            <button 
              onClick={() => {
                setClaimToEdit(null);
                setIsNewClaimOpen(true);
              }}
              className="flex items-center gap-2 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Claim</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-5">
        
        {selectedClaim ? (
          <ClaimDetailView
            claim={selectedClaim}
            onBack={() => setSelectedClaim(null)}
            pas={pas}
            events={events}
            onEventCreated={loadData}
            onClaimUpdated={async () => {
              const freshList = await loadData();
              if (selectedClaim?.id && freshList) {
                const refreshed = freshList.find(c => c.id === selectedClaim.id);
                if (refreshed) setSelectedClaim(refreshed);
              }
            }}
            onViewInFunnel={(claimNumber) => {
              setViewMode('funnel');
              setSearchQuery(claimNumber);
              setSelectedClaim(null);
            }}
          />
        ) : (
          <>
            {/* Navigation Tabs & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          
          {/* Tab Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('funnel')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === 'funnel'
                  ? 'bg-white text-maroon-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Inspection Funnel ({events.length})</span>
            </button>
            <button
              onClick={() => setViewMode('claims')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === 'claims'
                  ? 'bg-white text-maroon-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>All Claims ({claims.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search claim #, insured, address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-maroon-800 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* ======================================================== */}
        {/* VIEW 1: INSPECTION COORDINATION FUNNEL (KANBAN) */}
        {/* ======================================================== */}
        {viewMode === 'funnel' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stages.map((stage) => {
              const stageEvents = filteredEvents.filter(e => e.coordinationStage === stage.key);
              return (
                <div 
                  key={stage.key} 
                  className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col space-y-3 shadow-xs"
                >
                  {/* Column Header */}
                  <div className={`flex items-center justify-between border-b pb-2.5 border-slate-200 border-t-2 ${stage.headerBorder} pt-2`}>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{stage.title}</h3>
                      <p className="text-[11px] text-slate-500 truncate max-w-[170px]">{stage.desc}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${stage.badgeBg} ${stage.badgeText}`}>
                      {stageEvents.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {stageEvents.length === 0 ? (
                      <div className="p-6 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50">
                        No events in this stage
                      </div>
                    ) : (
                      stageEvents.map((evt) => {
                        const paParticipant = evt.participants?.find(p => p.participantType === 'public_adjuster');
                        const carrierParticipant = evt.participants?.find(p => p.participantType === 'carrier_representative');
                        const externalParticipant = evt.participants?.find(p => p.participantType === 'external_actor');
                        const messageText = generateInsuredMessage(evt);

                        return (
                          <div 
                            key={evt.id} 
                            className="bg-white border border-slate-300 hover:border-maroon-700 rounded-xl p-3.5 space-y-3 shadow-xs transition-colors"
                          >
                            {/* Top: Claim # & Carrier */}
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (evt.claim) {
                                      const full = claims.find(c => c.id === evt.claimId) || evt.claim;
                                      setSelectedClaim(full);
                                    }
                                  }}
                                  className="text-[11px] font-mono text-maroon-800 font-bold hover:underline cursor-pointer text-left"
                                  title="Click to view full claim details & all events"
                                >
                                  {evt.claim?.claimNumber}
                                </button>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-tealBrand-50 text-tealBrand-800 font-semibold border border-tealBrand-200 truncate max-w-[130px]">
                                  {evt.claim?.carrier}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-900 mt-1.5 leading-snug">{evt.eventType}</h4>
                            </div>

                            {/* Insured Info & General Availability */}
                            {evt.claim?.insured && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs space-y-1">
                                <div className="flex items-center justify-between text-slate-800">
                                  <span className="font-semibold">{evt.claim.insured.name}</span>
                                  {evt.claim.insured.phone && (
                                    <a href={`tel:${evt.claim.insured.phone}`} className="text-tealBrand-600 hover:text-tealBrand-800 flex items-center gap-1 font-mono text-[11px]">
                                      <Phone className="w-3 h-3" />
                                      <span>{evt.claim.insured.phone}</span>
                                    </a>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-600 leading-tight">
                                  📅 <strong>Availability:</strong> {evt.claim.insured.generalAvailability || 'Not recorded'}
                                </p>
                              </div>
                            )}

                            {/* Location */}
                            <div className="text-[11px] text-slate-500 flex items-start space-x-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
                              <span className="line-clamp-2 leading-relaxed">{evt.location}</span>
                            </div>

                            {/* Actors Badges */}
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                              {paParticipant?.publicAdjuster ? (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 border border-slate-200">
                                  <span 
                                    className="w-2 h-2 rounded-full shrink-0" 
                                    style={{ backgroundColor: paParticipant.publicAdjuster.colorCode }}
                                  />
                                  <span>PA: {paParticipant.publicAdjuster.name}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                                  No PA assigned
                                </span>
                              )}

                              {carrierParticipant?.carrierRep && (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                                  Rep: {carrierParticipant.carrierRep.name}
                                </span>
                              )}

                              {externalParticipant?.externalActor && (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                                  Ext: {externalParticipant.externalActor.name}
                                </span>
                              )}
                            </div>

                            {/* Message Generator & Actions */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                              <button
                                onClick={() => copyToClipboard(messageText, evt.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 py-1.5 px-2 rounded-lg transition-colors"
                              >
                                {copiedId === evt.id ? <Check className="w-3.5 h-3.5 text-tealBrand-700" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copiedId === evt.id ? 'Copied!' : 'Copy Message'}</span>
                              </button>

                              <button
                                onClick={() => {
                                  const phone = evt.claim?.insured?.phone?.replace(/\D/g, '');
                                  if (phone) window.open(`https://wa.me/1${phone}?text=${encodeURIComponent(messageText)}`, '_blank');
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition-colors"
                                title="Open WhatsApp directly"
                              >
                                <Send className="w-3.5 h-3.5 text-tealBrand-700" />
                              </button>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: CLAIMS DIRECTORY (ALL CLAIMS) */}
        {/* ======================================================== */}
        {viewMode === 'claims' && (
          <div className="space-y-4">
            {filteredClaims.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                <FolderOpen className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">No claims found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery ? `No claims matching "${searchQuery}"` : 'No claims have been entered into the system yet.'}
                </p>
                <button
                  onClick={() => {
                    setClaimToEdit(null);
                    setIsNewClaimOpen(true);
                  }}
                  className="inline-flex items-center gap-2 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Enter First Claim</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClaims.map((claim) => {
                  const assignedPa = pas.find(p => p.id === claim.publicAdjusterId);
                  const relatedEvent = events.find(e => e.claimId === claim.id);

                  return (
                    <div 
                      key={claim.id}
                      className="bg-white border border-slate-200 hover:border-maroon-700 rounded-xl p-4 space-y-3.5 shadow-xs transition-colors flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        {/* Header: Claim Number & Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-mono font-bold text-maroon-800">{claim.claimNumber}</span>
                            <h4 className="text-xs font-bold text-slate-900 mt-0.5">{claim.carrier}</h4>
                            {claim.policyNumber && (
                              <p className="text-[11px] text-slate-500">Policy: {claim.policyNumber}</p>
                            )}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            claim.status === 'Open' ? 'bg-emerald-100 text-emerald-800' :
                            claim.status === 'Appraisal' ? 'bg-amber-100 text-amber-800' :
                            claim.status === 'Settled' ? 'bg-tealBrand-100 text-tealBrand-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {claim.status || 'Open'}
                          </span>
                        </div>

                        {/* Insured Client Box */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <User className="w-3.5 h-3.5 text-maroon-800" />
                            <span>{claim.insured?.name || 'Insured Client'}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            📞 {claim.insured?.phone || 'No phone'} · ✉️ {claim.insured?.email || 'No email'}
                          </p>
                          {claim.insured?.generalAvailability && (
                            <p className="text-[10px] text-tealBrand-800 font-medium">
                              📅 Availability: {claim.insured.generalAvailability}
                            </p>
                          )}
                        </div>

                        {/* Property & Loss Details */}
                        <div className="text-xs space-y-1 text-slate-600">
                          <div className="flex items-start gap-1.5 text-[11px]">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>{claim.propertyAddress}, {claim.city}, {claim.state} {claim.zipCode}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
                            <span className="font-semibold text-slate-700">{claim.typeOfLoss}</span>
                            {claim.dateOfLoss && (
                              <>
                                <span>·</span>
                                <span>Loss: {claim.dateOfLoss}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Public Adjuster */}
                        {assignedPa && (
                          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs">
                            <span 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: assignedPa.colorCode }}
                            />
                            <span className="text-[11px] text-slate-700 font-medium">
                              PA: <strong>{assignedPa.name}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedClaim(claim)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 hover:text-maroon-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 py-2 rounded-lg transition-colors"
                        >
                          <span>Claim View & Events</span>
                        </button>
                        {relatedEvent && (
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('funnel');
                              setSearchQuery(claim.claimNumber);
                            }}
                            className="p-2 text-xs font-bold text-tealBrand-700 hover:text-tealBrand-900 bg-tealBrand-50 hover:bg-tealBrand-100 border border-tealBrand-200 rounded-lg transition-colors"
                            title="View in Funnel"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </>
        )}

      </main>

      {/* New Claim / Edit Claim Entry Modal */}
      <NewClaimModal
        isOpen={isNewClaimOpen}
        claimToEdit={claimToEdit}
        onClose={() => {
          setIsNewClaimOpen(false);
          setClaimToEdit(null);
        }}
        onClaimCreated={async (savedClaim) => {
          const freshList = await loadData();
          if (savedClaim?.id && freshList) {
            const updated = freshList.find(c => c.id === savedClaim.id);
            if (updated) {
              setSelectedClaim(updated);
            }
          }
        }}
      />
    </div>
  );
}

export default App;

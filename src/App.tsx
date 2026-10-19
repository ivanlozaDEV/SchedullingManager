import { useState, useEffect } from 'react';
import { 
  Search, 
  Phone, 
  RefreshCw, 
  Copy, 
  Check, 
  CheckCircle2,
  Send, 
  Plus,
  Kanban,
  FolderOpen,
  MapPin,
  User,
  ArrowRight,
  Calendar,
  AlertTriangle,
  Clock,
  Settings,
  Pencil,
  RotateCcw,
  History,
  LayoutList,
  LayoutGrid,
  Filter,
  Mail,
  LogOut,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { schedulingService } from './lib/schedulingService';
import { LoginGate } from './components/LoginGate';
import { HomeHub } from './components/HomeHub';
import { ConfirmationPortal } from './components/ConfirmationPortal';
import { NewClaimModal } from './components/NewClaimModal';
import { ClaimDetailView } from './components/ClaimDetailView';
import { RecordCarrierSlotsModal } from './components/RecordCarrierSlotsModal';
import { DirectConfirmModal } from './components/DirectConfirmModal';
import { SlaSettingsModal } from './components/SlaSettingsModal';
import { ResetCoordinationModal } from './components/ResetCoordinationModal';
import { EventHistoryModal } from './components/EventHistoryModal';
import { MasterCatalogsView } from './components/MasterCatalogsView';
import { getEventSlaStatus, getNextivaTelUri, formatPhoneNumber, getSlaConfig, type SlaConfig } from './lib/slaUtils';
import { appSettingsService } from './lib/appSettingsService';
import { formatTimeRangeWithDualTimezone, getLiveOperatingTimes, type FloridaTimezone } from './lib/timezoneUtils';
import type { 
  CoordinationEvent, 
  PublicAdjuster, 
  CarrierRepresentative, 
  ExternalActor,
  CoordinationStage,
  Claim
} from './types';

export function App() {
  const [authRole, setAuthRole] = useState<'admin' | 'viewer' | null>(() => {
    return (
      (localStorage.getItem('ip_scheduling_auth_role') as 'admin' | 'viewer' | null) ||
      (sessionStorage.getItem('ip_scheduling_auth_role') as 'admin' | 'viewer' | null) ||
      null
    );
  });

  const [currentView, setCurrentView] = useState<'hub' | 'login' | 'scheduling'>(() => {
    const saved = sessionStorage.getItem('ip_scheduling_current_view') as 'hub' | 'login' | 'scheduling' | null;
    const hasAuth = (localStorage.getItem('ip_scheduling_auth_role') as 'admin' | 'viewer' | null) ||
                    (sessionStorage.getItem('ip_scheduling_auth_role') as 'admin' | 'viewer' | null);
    if (saved === 'scheduling' && hasAuth) return 'scheduling';
    if (saved === 'hub') return 'hub';
    if (saved === 'login' && !hasAuth) return 'login';
    return hasAuth ? 'scheduling' : 'hub';
  });

  const navigateToView = (view: 'hub' | 'login' | 'scheduling') => {
    sessionStorage.setItem('ip_scheduling_current_view', view);
    setCurrentView(view);
  };

  const handleLogout = () => {
    localStorage.removeItem('ip_scheduling_auth_role');
    sessionStorage.removeItem('ip_scheduling_auth_role');
    sessionStorage.removeItem('ip_scheduling_current_view');
    setAuthRole(null);
    setCurrentView('hub');
  };

  const [events, setEvents] = useState<CoordinationEvent[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pas, setPas] = useState<PublicAdjuster[]>([]);
  const [, setCarrierReps] = useState<CarrierRepresentative[]>([]);
  const [, setExternalActors] = useState<ExternalActor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isNewClaimOpen, setIsNewClaimOpen] = useState(false);
  const [isSlaSettingsOpen, setIsSlaSettingsOpen] = useState(false);
  const [slaConfig, setSlaConfig] = useState<SlaConfig>(getSlaConfig());
  const [viewMode, setViewMode] = useState<'funnel' | 'claims' | 'catalogs'>('funnel');
  const [claimsEventFilter, setClaimsEventFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [claimsLayoutMode, setClaimsLayoutMode] = useState<'list' | 'grid'>('list');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [claimToEdit, setClaimToEdit] = useState<Claim | null>(null);
  const [filterStalledOnly, setFilterStalledOnly] = useState(false);
  const [liveTimes, setLiveTimes] = useState(getLiveOperatingTimes());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTimes(getLiveOperatingTimes());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Sync SLA config changes from settings modal and Supabase database across all devices
  useEffect(() => {
    // 1. Fetch latest database settings on load
    appSettingsService.getSlaConfig().then((fresh) => {
      setSlaConfig(fresh);
    });

    // 2. Real-time subscription across all connected computers
    const unsubRealtime = appSettingsService.subscribeToChanges((key, val) => {
      if (key === 'sla_config') {
        setSlaConfig(val);
      }
    });

    // 3. Local window updates
    const handleConfigChange = (e: any) => {
      if (e.detail) setSlaConfig(e.detail);
      else setSlaConfig(getSlaConfig());
    };
    window.addEventListener('sla_config_updated', handleConfigChange);

    return () => {
      window.removeEventListener('sla_config_updated', handleConfigChange);
      unsubRealtime();
    };
  }, []);

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

    if (!isSupabaseConfigured) return;

    // Escucha en tiempo real para que la app se actualice sola si el PA escoge desde el email
    const liveChannel = supabase
      .channel('events-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_slots' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(liveChannel);
    };
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

  // Funnel Flow States for Kanban View
  const [directConfirmingEvent, setDirectConfirmingEvent] = useState<CoordinationEvent | null>(null);
  const [recordingSlotsEvent, setRecordingSlotsEvent] = useState<CoordinationEvent | null>(null);
  const [paSelectedSlotIds, setPaSelectedSlotIds] = useState<Record<string, string[]>>({});
  const [paConfirmingEventId, setPaConfirmingEventId] = useState<string | null>(null);
  const [insuredConfirmingSlotId, setInsuredConfirmingSlotId] = useState<string | null>(null);
  const [sendingEmailEventId, setSendingEmailEventId] = useState<string | null>(null);

  const handleSendInsuredEmail = async (eventId: string) => {
    const evt = events.find((e) => e.id === eventId);
    const insuredEmail = evt?.claim?.insured?.email;
    const insuredName = evt?.claim?.insured?.name || 'Asegurado';

    if (!insuredEmail || !insuredEmail.trim()) {
      alert(`⚠️ El cliente asegurado (${insuredName}) no tiene un correo electrónico registrado.\n\nPor favor, ingresa su correo en la ficha del reclamo o catálogo de asegurados antes de enviar.`);
      return;
    }

    setSendingEmailEventId(eventId);
    try {
      const res = await schedulingService.notifyInsuredSlots(eventId);
      if (res && res.success === false) {
        alert('⚠️ No se pudo enviar el correo: ' + (res.message || 'Error desconocido'));
      } else {
        alert(`✓ ¡Correo enviado con éxito a ${insuredName} (${insuredEmail})!`);
      }
    } catch (err: any) {
      alert('Error enviando correo: ' + (err.message || err));
    } finally {
      setSendingEmailEventId(null);
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
      if (current.length >= 2) return;
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
      await loadData();
    } catch (err) {
      console.error('Failed to confirm PA slots:', err);
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
      await loadData();
    } catch (err) {
      console.error('Failed to lock insured slot:', err);
    } finally {
      setInsuredConfirmingSlotId(null);
    }
  };

  const [eventToReset, setEventToReset] = useState<CoordinationEvent | null>(null);
  const [historyEventTarget, setHistoryEventTarget] = useState<CoordinationEvent | null>(null);

  const handleConfirmReset = async (options: { cancelledBy?: string; cancellationReason?: string }) => {
    if (!eventToReset) return;
    try {
      await schedulingService.resetCoordinationEvent(eventToReset.id, options);
      await loadData();
      setEventToReset(null);
    } catch (err: any) {
      console.error('Failed to reset event:', err);
      alert('Failed to reset event: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSetSlotsOriginator = async (eventId: string, originator: 'carrier' | 'pa' | 'insured') => {
    try {
      await schedulingService.setEventSlotsOriginator(eventId, originator, authRole || 'Coordinator');
      await loadData();
    } catch (err: any) {
      console.error('Failed to update slots originator:', err);
      alert('Error updating date options proposer: ' + (err.message || 'Unknown error'));
    }
  };

  const handleToggleEventTimezone = async (eventId: string, newTz: FloridaTimezone) => {
    try {
      await schedulingService.setEventTimezone(eventId, newTz, authRole || 'Coordinator');
      await loadData();
    } catch (err: any) {
      console.error('Failed to update event timezone:', err);
      alert('Error changing timezone: ' + (err.message || 'Unknown error'));
    }
  };

  // Delete Claim State & Handler
  const [claimToDelete, setClaimToDelete] = useState<Claim | null>(null);
  const [isDeletingClaim, setIsDeletingClaim] = useState(false);

  const handleDeleteClaim = async () => {
    if (!claimToDelete) return;
    try {
      setIsDeletingClaim(true);
      await schedulingService.deleteClaim(claimToDelete.id);
      await loadData();
      if (selectedClaim?.id === claimToDelete.id) {
        setSelectedClaim(null);
      }
      setClaimToDelete(null);
    } catch (err: any) {
      console.error('Error deleting claim:', err);
      alert('Error deleting claim: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingClaim(false);
    }
  };

  // Pipeline Stages (Flexible Model)
  const stages: { key: CoordinationStage; title: string; desc: string; badgeBg: string; badgeText: string; headerBorder: string }[] = [
    { 
      key: '1_awaiting_carrier_slots', 
      title: '1. Awaiting Dates', 
      desc: 'Carrier, Client, or PA offer date options', 
      badgeBg: 'bg-amber-100', 
      badgeText: 'text-amber-800',
      headerBorder: 'border-amber-400'
    },
    { 
      key: '2_pa_review', 
      title: '2. PA Review', 
      desc: 'PA validates inspection windows', 
      badgeBg: 'bg-tealBrand-100', 
      badgeText: 'text-tealBrand-800',
      headerBorder: 'border-tealBrand-500'
    },
    { 
      key: '3_insured_selection', 
      title: '3. Selection / Approval', 
      desc: 'Client or Carrier chooses/validates', 
      badgeBg: 'bg-maroon-100', 
      badgeText: 'text-maroon-800',
      headerBorder: 'border-maroon-700'
    },
    { 
      key: '4_confirmed', 
      title: '4. Confirmed', 
      desc: 'Appointment locked on calendar', 
      badgeBg: 'bg-emerald-100', 
      badgeText: 'text-emerald-800',
      headerBorder: 'border-emerald-500'
    },
  ];

  const isEventPastAndConfirmed = (e: CoordinationEvent) => {
    if (e.coordinationStage !== '4_confirmed') return false;
    if (!e.finalDate) return false;
    
    // Parse finalDate
    const [year, month, day] = e.finalDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    // Parse finalEndTime if available
    if (e.finalEndTime) {
      const [hours, minutes] = e.finalEndTime.split(':').map(Number);
      dateObj.setHours(hours, minutes, 0, 0);
    } else {
      dateObj.setHours(23, 59, 59, 999);
    }
    
    // Compare with current time
    return dateObj.getTime() < new Date().getTime();
  };

  const filteredEvents = events.filter(e => {
    if (isEventPastAndConfirmed(e)) return false;

    const q = searchQuery.toLowerCase();
    const matchesQuery = (
      e.eventType.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      (e.claim?.claimNumber.toLowerCase().includes(q) ?? false) ||
      (e.claim?.insured?.name.toLowerCase().includes(q) ?? false) ||
      (e.claim?.carrier.toLowerCase().includes(q) ?? false)
    );
    if (!matchesQuery) return false;
    if (filterStalledOnly) {
      const sla = getEventSlaStatus(e, slaConfig);
      return sla.isStalled;
    }
    return true;
  });

  const totalStalledEvents = events.filter(e => getEventSlaStatus(e, slaConfig).isStalled).length;
  const criticalEventsCount = events.filter(e => getEventSlaStatus(e, slaConfig).alertLevel === 'critical').length;
  const warningEventsCount = events.filter(e => getEventSlaStatus(e, slaConfig).alertLevel === 'warning').length;

  const unassignedClaimsCount = claims.filter(c => !events.some(e => e.claimId === c.id)).length;

  const filteredClaims = claims.filter(c => {
    // 1. Filter by event assignment status
    const hasEvent = events.some(e => e.claimId === c.id);
    if (claimsEventFilter === 'unassigned' && hasEvent) return false;
    if (claimsEventFilter === 'assigned' && !hasEvent) return false;

    // 2. Filter by search query text
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

  // 0. Email 1-Click Confirmation Landing Portal (Public, no login required)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'confirmation') {
    return (
      <ConfirmationPortal
        role={urlParams.get('role')}
        status={urlParams.get('status')}
        claim={urlParams.get('claim')}
        insured={urlParams.get('insured')}
        carrier={urlParams.get('carrier')}
        address={urlParams.get('address')}
        date={urlParams.get('date')}
        time={urlParams.get('time')}
        title={urlParams.get('title')}
        message={urlParams.get('message')}
        eventType={urlParams.get('eventType')}
      />
    );
  }

  // 1. Initial / Default view: Home Operations Hub with the 2 Cards (Cover / Portada)
  if (currentView === 'hub') {
    return (
      <HomeHub
        onOpenScheduling={() => {
          if (authRole) {
            navigateToView('scheduling');
          } else {
            navigateToView('login');
          }
        }}
        onLogout={handleLogout}
        authRole={authRole}
      />
    );
  }

  // 2. Protected Login Gate specifically for Scheduling Manager
  if (currentView === 'login' || !authRole) {
    return (
      <LoginGate
        onLogin={(role) => {
          setAuthRole(role);
          navigateToView('scheduling');
        }}
        onBack={() => navigateToView('hub')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Clean Light Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12 h-18 flex items-center justify-between">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3.5">
            <img 
              src="/ip-adjusting-logo.svg" 
              alt="IP Adjusting Group Logo" 
              className="h-10 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f3f7] text-[#1187aa] border border-[#419fbb]/30 uppercase tracking-wider font-['Montserrat',sans-serif]">
                Scheduling System
              </span>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Inspection Coordination</p>
            </div>
          </div>

          {/* Live Florida & Ecuador Operating Clocks for Coordinators & VAs */}
          <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] shadow-2xs font-mono">
            <div className="flex items-center gap-1.5" title="Current time in Ecuador (Coordinators / VAs in Guayaquil and Quito)">
              <span className="text-xs">🇪🇨</span>
              <span className="text-slate-500 font-sans font-semibold text-[10px]">Ecuador:</span>
              <strong className="text-slate-800 font-bold">{liveTimes.ecuador}</strong>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5" title="Current time in Miami / South FL (Eastern Time - PAs and Office)">
              <span className="text-xs">🌴</span>
              <span className="text-slate-500 font-sans font-semibold text-[10px]">Miami (ET):</span>
              <strong className="text-tealBrand-800 font-bold">{liveTimes.miami}</strong>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5" title="Current time in Pensacola / Panhandle (Central Time - Northern Claims)">
              <span className="text-xs">🏖️</span>
              <span className="text-slate-500 font-sans font-semibold text-[10px]">Pensacola (CT):</span>
              <strong className="text-amber-800 font-bold">{liveTimes.pensacola}</strong>
            </div>
          </div>

          {/* Action buttons & View Switcher */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => navigateToView('hub')}
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Return to IP Operations Hub"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-700" />
              <span>Operations Hub</span>
            </button>

            {/* Prominent Dashboard Refresh Button */}
            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh pipeline and claims data from database"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#F5F9FA] border border-slate-300 hover:border-[#1187aa] text-slate-700 hover:text-[#1187aa] text-xs font-bold transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#1187aa] ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              onClick={() => setIsSlaSettingsOpen(true)}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shadow-2xs"
              title="Configure SLA warning and critical bottleneck hours"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span>SLA Settings</span>
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

            {/* Role Badge & Logout */}
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                {authRole}
              </span>
              <button
                onClick={handleLogout}
                title="Log out of Scheduling Manager"
                className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-600 hover:text-rose-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 flex-1 space-y-5">
        
        {selectedClaim ? (
          <ClaimDetailView
            claim={selectedClaim}
            onBack={() => setSelectedClaim(null)}
            pas={pas}
            events={events}
            onEventCreated={loadData}
            onClaimDeleted={async () => {
              await loadData();
              setSelectedClaim(null);
            }}
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
              {unassignedClaimsCount > 0 && (
                <span 
                  className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-amber-300"
                  title={`${unassignedClaimsCount} claims without assigned event`}
                >
                  {unassignedClaimsCount} unassigned
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('catalogs')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === 'catalogs'
                  ? 'bg-white text-maroon-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Catalogs & Actors</span>
            </button>
          </div>

          {/* Search Box (For Funnel and Claims views) */}
          {viewMode !== 'catalogs' && (
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
          )}
        </div>

        {/* ======================================================== */}
        {/* VIEW 1: INSPECTION COORDINATION FUNNEL (KANBAN) */}
        {/* ======================================================== */}
        {viewMode === 'funnel' && (
          <div className="space-y-4">
            {/* SLA Aging & Reminder Notification Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  criticalEventsCount > 0
                    ? 'bg-red-100 text-red-700'
                    : warningEventsCount > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {criticalEventsCount > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : warningEventsCount > 0 ? (
                    <Clock className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Funnel SLA & Aging Reminder System
                    </span>
                    {criticalEventsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                        🚨 {criticalEventsCount} Stalled Bottlenecks
                      </span>
                    )}
                    {warningEventsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        ⚠️ {warningEventsCount} Follow-up Needed
                      </span>
                    )}
                    {totalStalledEvents === 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ✓ All Active Funnels on Track
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Timers run continuously upon claim intake. When actors do not respond, call directly via Nextiva or select manual options.
                  </p>
                </div>
              </div>

              {/* Filter & Configure SLA Buttons */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsSlaSettingsOpen(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Adjust SLA warning and bottleneck thresholds"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Configure SLA</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterStalledOnly(!filterStalledOnly)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 shadow-xs ${
                    filterStalledOnly
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{filterStalledOnly ? 'Showing Stalled Only' : `Filter Bottlenecks (${totalStalledEvents})`}</span>
                </button>
              </div>
            </div>

            {/* Grid of 4 Stages */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stages.map((stage) => {
                const stageEvents = filteredEvents
                  .filter(e => e.coordinationStage === stage.key)
                  .sort((a, b) => (a.claim?.claimNumber || '').localeCompare(b.claim?.claimNumber || ''));

                const activeCount = stageEvents.length;

                // Overdue alert count only considers events actively pending in this stage
                const stageStalledCount = stageEvents.filter(e => getEventSlaStatus(e, slaConfig).isStalled).length;

                return (
                  <div 
                    key={stage.key} 
                    className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col space-y-3 shadow-xs"
                  >
                    {/* Column Header */}
                    <div className={`flex items-center justify-between border-b pb-2.5 border-slate-200 border-t-2 ${stage.headerBorder} pt-2`}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{stage.title}</h3>
                          {stageStalledCount > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 border border-red-200" title={`${stageStalledCount} overdue in this stage`}>
                              ⚠️ {stageStalledCount}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{stage.desc}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span 
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${stage.badgeBg} ${stage.badgeText}`}
                          title={`${activeCount} active tasks in this stage`}
                        >
                          {activeCount}
                        </span>
                      </div>
                    </div>

                    {/* Cards List */}
                    <div className="space-y-4 flex-1 overflow-y-auto pr-1 pb-4">
                      {stageEvents.length === 0 ? (
                        <div className="p-6 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50">
                          No events in this stage
                        </div>
                      ) : (
                        stageEvents.map((evt) => {
                          const paParticipant = evt.participants?.find(p => p.participantType === 'public_adjuster');
                          const carrierParticipant = evt.participants?.find(p => p.participantType === 'carrier_representative');
                          const externalParticipant = evt.participants?.find(p => p.participantType === 'external_actor');
                          const adjusterPhone = carrierParticipant?.carrierRep?.phone;
                          const paPhone = paParticipant?.publicAdjuster?.phone;
                          const insuredPhone = evt.claim?.insured?.phone;
                          const sla = getEventSlaStatus(evt, slaConfig);
                          const messageText = generateInsuredMessage(evt);
                          const isHistorical = evt.coordinationStage !== stage.key;

                          return (
                            <div 
                              key={`${stage.key}-${evt.id}`} 
                              className={`rounded-2xl p-3.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all relative overflow-hidden bg-white ${
                                isHistorical
                                  ? 'bg-slate-50/75 border border-slate-200 hover:bg-white hover:border-slate-300'
                                  : sla.alertLevel === 'critical'
                                  ? 'bg-white border border-red-300 border-l-4 border-l-red-600 hover:border-red-400'
                                  : sla.alertLevel === 'warning'
                                  ? 'bg-white border border-amber-300 border-l-4 border-l-amber-500 hover:border-amber-400'
                                  : 'bg-white border border-slate-300 hover:border-maroon-700'
                              }`}
                            >
                              {/* 1. TOP METADATA BLOCK (Aligned across columns) */}
                              <div className="space-y-2.5">
                                {/* Claim #, Carrier & SLA / Historical Badge */}
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

                                    <div className="flex items-center gap-1">
                                      {/* Status Badge: Muted/off badge for historical completed stages, SLA timer for active */}
                                      {isHistorical ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-200/80 text-slate-700 border border-slate-300 flex items-center gap-1" title="Completed step in history">
                                          ✓ {stage.key === '1_awaiting_carrier_slots' ? 'Dates Offered' : stage.key === '2_pa_review' ? 'PA Approved' : 'Client Chosen'}
                                        </span>
                                      ) : sla.alertLevel === 'critical' ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1 shadow-2xs">
                                          <AlertTriangle className="w-3 h-3 text-red-600" />
                                          <span>STALLED: {sla.timeLabel}</span>
                                        </span>
                                      ) : sla.alertLevel === 'warning' ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-amber-600" />
                                          <span>OVERDUE: {sla.timeLabel}</span>
                                        </span>
                                      ) : evt.coordinationStage !== '4_confirmed' ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1" title="Time elapsed in this stage">
                                          <Clock className="w-3 h-3 text-slate-400" />
                                          <span>⏱️ {sla.timeLabel}</span>
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                          ✓ Confirmed
                                        </span>
                                      )}

                                      {/* View Event History & Audit Log */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setHistoryEventTarget(evt);
                                        }}
                                        className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-tealBrand-700 hover:bg-tealBrand-50 border border-transparent hover:border-tealBrand-200 transition-colors"
                                        title={`View event history & audit logs (${evt.logs?.length || 0} entries)`}
                                      >
                                        <History className="w-3 h-3" />
                                      </button>

                                      {/* Reset / Cancel Flow button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEventToReset(evt);
                                        }}
                                        className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                                        title="Reset flow / Cancel (returns to Stage 1)"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between mt-1">
                                    <h4 className="text-xs font-bold text-slate-900 leading-snug">{evt.eventType}</h4>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] px-2 py-0.5 rounded bg-tealBrand-50 text-tealBrand-800 font-semibold border border-tealBrand-200 truncate max-w-[150px]" title={evt.claim?.carrier}>
                                        {evt.claim?.carrier}
                                      </span>
                                      {/* Timezone Badge & Quick 1-Click Toggle */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const nextTz = (evt.timezone || 'ET') === 'CT' ? 'ET' : 'CT';
                                          handleToggleEventTimezone(evt.id, nextTz);
                                        }}
                                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border transition-all flex items-center gap-0.5 cursor-pointer shadow-2xs ${
                                          evt.timezone === 'CT'
                                            ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                            : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                        }`}
                                        title={`Timezone: ${evt.timezone === 'CT' ? 'Central Time (Pensacola)' : 'Eastern Time (Miami)'}. Click to toggle.`}
                                      >
                                        <span>{evt.timezone === 'CT' ? '🏖️ CT' : '🌴 ET'}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {evt.openAvailabilityActor && (
                                    <div className="mt-1">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                        <span>{evt.openAvailabilityActor === 'insured' ? 'Client' : evt.openAvailabilityActor === 'pa' ? 'PA' : 'Carrier'}: Any Day</span>
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Visual Bottleneck Alert Box if Stalled or Warning (Only when actively in this stage) */}
                                {!isHistorical && sla.isStalled && (
                                  <div className={`p-2 rounded-lg border text-xs space-y-1 ${
                                    sla.alertLevel === 'critical'
                                      ? 'bg-red-50 border-red-200 text-red-950'
                                      : 'bg-amber-50 border-amber-200 text-amber-950'
                                  }`}>
                                    <div className="flex items-center gap-1.5 font-bold">
                                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${sla.alertLevel === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                                      <span className="line-clamp-1">{sla.alertMessage}</span>
                                    </div>
                                    <p className="text-[11px] opacity-90 leading-tight">
                                      💡 {sla.actionRecommendation}
                                    </p>
                                  </div>
                                )}

                                {/* Insured Info & General Availability */}
                                {evt.claim?.insured && (
                                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs space-y-1 min-h-[58px]">
                                    <div className="flex items-center justify-between text-slate-800">
                                      <span className="font-semibold">{evt.claim.insured.name}</span>
                                      {evt.claim.insured.phone && (
                                        <a 
                                          href={getNextivaTelUri(evt.claim.insured.phone) || `tel:${evt.claim.insured.phone}`} 
                                          className="text-tealBrand-600 hover:text-tealBrand-800 flex items-center gap-1 font-mono text-[11px]"
                                          title="Click to call via Nextiva"
                                        >
                                          <Phone className="w-3 h-3" />
                                          <span>{formatPhoneNumber(evt.claim.insured.phone)}</span>
                                        </a>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-600 leading-tight line-clamp-1">
                                      📅 <strong>Availability:</strong> {evt.claim.insured.generalAvailability || 'Not recorded'}
                                    </p>
                                  </div>
                                )}

                                {/* Location */}
                                <div className="text-[11px] text-slate-500 flex items-start space-x-1.5 h-7">
                                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
                                  <span className="line-clamp-2 leading-relaxed">{evt.location}</span>
                                </div>

                                {/* Actors Badges */}
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 min-h-[26px]">
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
                              </div>

                              {/* 2. WORKFLOW & ACTIONS BLOCK (Equally Sized Across Columns) */}
                              <div className="pt-2.5 border-t border-slate-100 flex flex-col justify-between flex-1 mt-2">
                                {/* Stage 1: Awaiting Carrier Slots OR Historical Dates */}
                                {stage.key === '1_awaiting_carrier_slots' && (
                                  <div className="flex flex-col justify-between flex-1">
                                    {/* Quick Selector: Who Proposes the Dates? */}
                                    {!isHistorical && (
                                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 mb-2.5 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-bold text-slate-700 flex items-center gap-1">
                                            <User className="w-3 h-3 text-maroon-800" />
                                            <span>Who offers dates?</span>
                                          </span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-300 text-tealBrand-800 uppercase">
                                            {evt.slotsOriginator === 'pa' ? '⚖️ PA' : evt.slotsOriginator === 'insured' ? '👤 Client' : '🏢 Carrier'}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleSetSlotsOriginator(evt.id, 'carrier')}
                                            className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all text-center border cursor-pointer ${
                                              (evt.slotsOriginator || 'carrier') === 'carrier'
                                                ? 'bg-maroon-800 text-white border-maroon-900 shadow-2xs'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                            }`}
                                            title="Insurance Carrier / Adjuster proposes the dates"
                                          >
                                            🏢 Carrier
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSetSlotsOriginator(evt.id, 'pa')}
                                            className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all text-center border cursor-pointer ${
                                              evt.slotsOriginator === 'pa'
                                                ? 'bg-tealBrand-700 text-white border-tealBrand-800 shadow-2xs'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                            }`}
                                            title="Public Adjuster proposes available dates first"
                                          >
                                            ⚖️ PA
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSetSlotsOriginator(evt.id, 'insured')}
                                            className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all text-center border cursor-pointer ${
                                              evt.slotsOriginator === 'insured'
                                                ? 'bg-tealBrand-700 text-white border-tealBrand-800 shadow-2xs'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                            }`}
                                            title="Client / Insured proposes available dates first"
                                          >
                                            👤 Client
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {isHistorical || (evt.slots && evt.slots.length > 0) ? (
                                      <>
                                        <div className="space-y-2">
                                          {/* Slot Header */}
                                          <div className="flex items-center justify-between text-[11px] min-h-[22px]">
                                            <span className="font-bold text-slate-700">
                                              {evt.slotsOriginator === 'pa'
                                                ? 'Dates Offered by PA:'
                                                : evt.slotsOriginator === 'insured'
                                                ? 'Dates Offered by Client:'
                                                : 'Carrier Offered Options:'}
                                            </span>
                                            <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] ${
                                              isHistorical 
                                                ? 'text-slate-600 bg-slate-100 border-slate-300' 
                                                : 'text-tealBrand-800 bg-tealBrand-50 border-tealBrand-200'
                                            }`}>
                                              {isHistorical ? '✓ Passed' : `${evt.slots?.length || 0} Dates`}
                                            </span>
                                          </div>

                                          {/* Slots */}
                                          <div className="space-y-1.5">
                                            {(evt.slots || []).map((s, idx) => (
                                              <div 
                                                key={s.id || idx} 
                                                className={`p-2 rounded-lg border text-xs flex items-center justify-between min-h-[44px] ${
                                                  isHistorical ? 'border-slate-200 bg-white/70 text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-800'
                                                }`}
                                              >
                                                <div>
                                                  <span className="font-semibold block">📅 {s.slotDate}</span>
                                                  <span className="text-slate-500 font-mono text-[10px] block">
                                                    {formatTimeRangeWithDualTimezone(s.startTime, s.endTime, evt.timezone || 'ET').displayFull}
                                                  </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-tealBrand-700 bg-tealBrand-50 px-2 py-0.5 rounded border border-tealBrand-200">
                                                  Option #{idx + 1}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Action Buttons in Delimited Card Footer */}
                                        <div className="mt-3 pt-2.5 border-t border-slate-200 bg-slate-50/90 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl space-y-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setRecordingSlotsEvent(evt)}
                                            className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 h-8.5 cursor-pointer ${
                                              isHistorical
                                                ? 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 shadow-2xs font-semibold'
                                                : 'bg-tealBrand-800 hover:bg-tealBrand-900 text-white shadow-xs'
                                            }`}
                                            title="Modify offered dates"
                                          >
                                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                            <span>Modify Date Options</span>
                                          </button>

                                          {/* Dynamic Contact Calling Button */}
                                          {(() => {
                                            const originator = evt.slotsOriginator || 'carrier';
                                            const targetPhone = originator === 'pa' ? paPhone : originator === 'insured' ? insuredPhone : adjusterPhone;
                                            const targetLabel = originator === 'pa'
                                              ? `Call PA (${paParticipant?.publicAdjuster?.name?.split(' ')[0] || 'PA'})`
                                              : originator === 'insured'
                                              ? `Call Client (${evt.claim?.insured?.name?.split(' ')[0] || 'Client'})`
                                              : 'Call Adjuster';

                                            if (!targetPhone) return null;

                                            return (
                                              <a
                                                href={getNextivaTelUri(targetPhone) || '#'}
                                                className="w-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs h-8"
                                                title={`Call via Nextiva: ${formatPhoneNumber(targetPhone)}`}
                                              >
                                                <Phone className="w-3.5 h-3.5 text-tealBrand-800 shrink-0" />
                                                <span className="truncate">{targetLabel}: <strong className="font-mono text-slate-900">{formatPhoneNumber(targetPhone)}</strong></span>
                                              </a>
                                            );
                                          })()}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="space-y-2">
                                          {/* Slot Header */}
                                          <div className="flex items-center justify-between text-[11px] min-h-[22px]">
                                            <span className="font-bold text-amber-800">
                                              {evt.slotsOriginator === 'pa'
                                                ? 'Awaiting Dates from PA'
                                                : evt.slotsOriginator === 'insured'
                                                ? 'Awaiting Dates from Client'
                                                : 'Awaiting Carrier Dates'}
                                            </span>
                                            <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                              0 / 3
                                            </span>
                                          </div>

                                          {/* 3 Placeholder slots */}
                                          <div className="space-y-1.5">
                                            {[1, 2, 3].map((optNum) => (
                                              <div 
                                                key={optNum} 
                                                className="p-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/30 text-xs flex items-center justify-between min-h-[44px]"
                                              >
                                                <div>
                                                  <span className="font-medium text-amber-900 block">Option #{optNum}</span>
                                                  <span className="text-[10px] text-amber-600 block">Pending date</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                                                  Pending
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Action Buttons in Delimited Card Footer */}
                                        <div className="mt-3 pt-2.5 border-t border-slate-200 bg-slate-50/90 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl space-y-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setRecordingSlotsEvent(evt)}
                                            className="w-full bg-maroon-800 hover:bg-maroon-900 text-white py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                                            title="Propose date options or register availability"
                                          >
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>+ Propose Dates / Availability</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => setDirectConfirmingEvent(evt)}
                                            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                                            title="Directly confirm appointment without funnel"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>⚡ Direct Confirm Appointment</span>
                                          </button>

                                          {/* Dynamic Contact Calling Button */}
                                          {(() => {
                                            const originator = evt.slotsOriginator || 'carrier';
                                            const targetPhone = originator === 'pa' ? paPhone : originator === 'insured' ? insuredPhone : adjusterPhone;
                                            const targetLabel = originator === 'pa'
                                              ? `Call PA (${paParticipant?.publicAdjuster?.name?.split(' ')[0] || 'PA'})`
                                              : originator === 'insured'
                                              ? `Call Client (${evt.claim?.insured?.name?.split(' ')[0] || 'Client'})`
                                              : 'Call Adjuster';

                                            if (!targetPhone) {
                                              return (
                                                <div className="text-[11px] text-slate-400 text-center italic py-0.5">
                                                  No phone registered for {originator === 'pa' ? 'PA' : originator === 'insured' ? 'Client' : 'Adjuster'}
                                                </div>
                                              );
                                            }

                                            return (
                                              <a
                                                href={getNextivaTelUri(targetPhone) || '#'}
                                                className="w-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs group"
                                                title={`Call via Nextiva: ${formatPhoneNumber(targetPhone)}`}
                                              >
                                                <Phone className="w-3.5 h-3.5 text-tealBrand-700 group-hover:scale-110 transition-transform shrink-0" />
                                                <span className="truncate">{targetLabel}: <strong className="font-mono text-slate-900">{formatPhoneNumber(targetPhone)}</strong></span>
                                              </a>
                                            );
                                          })()}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Stage 2: PA Review (Pick 2 of 3) */}
                                {stage.key === '2_pa_review' && (
                                  <div className="flex flex-col justify-between flex-1">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-[11px] min-h-[22px]">
                                        <span className="font-bold text-slate-700">
                                          {isHistorical ? 'PA Selected 2 Options:' : 'PA: Select 2 options'}
                                        </span>
                                        <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] ${
                                          isHistorical 
                                            ? 'text-slate-600 bg-slate-100 border-slate-300' 
                                            : 'text-tealBrand-800 bg-tealBrand-50 border-tealBrand-200'
                                        }`}>
                                          {isHistorical ? '✓ 2 / 2' : `${(paSelectedSlotIds[evt.id] || []).length} / 2`}
                                        </span>
                                      </div>

                                      <div className="space-y-1.5">
                                        {isHistorical ? (
                                          (evt.slots || []).map((s) => {
                                            const isApproved = s.status === 'pa_accepted' || s.status === 'insured_chosen';
                                            return (
                                              <div
                                                key={s.id}
                                                className={`w-full p-2 rounded-lg border text-left text-xs flex items-center justify-between min-h-[44px] ${
                                                  isApproved
                                                    ? 'bg-tealBrand-50/40 border-tealBrand-300 text-tealBrand-950 font-semibold'
                                                    : 'bg-white/50 border-slate-200 text-slate-400 opacity-60'
                                                }`}
                                              >
                                                <div>
                                                  <span className="block font-semibold">📅 {s.slotDate}</span>
                                                  <span className="text-[10px] font-mono block opacity-80">
                                                    {formatTimeRangeWithDualTimezone(s.startTime, s.endTime, evt.timezone || 'ET').displayFull}
                                                  </span>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                                  isApproved ? 'bg-white text-tealBrand-800 border-tealBrand-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                                                }`}>
                                                  {isApproved ? '✓ PA Picked' : 'Excluded'}
                                                </span>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          (evt.slots || []).map((s) => {
                                            const isSelected = (paSelectedSlotIds[evt.id] || []).includes(s.id);
                                            return (
                                              <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => handleTogglePaSlot(evt.id, s.id)}
                                                className={`w-full p-2 rounded-lg border text-left text-xs flex items-center justify-between transition-all min-h-[44px] ${
                                                  isSelected
                                                    ? 'bg-tealBrand-50 border-tealBrand-600 text-tealBrand-950 font-bold'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                                }`}
                                              >
                                                <div>
                                                  <span className="block font-semibold">📅 {s.slotDate}</span>
                                                  <span className="text-[10px] text-slate-500 block font-mono">
                                                    {formatTimeRangeWithDualTimezone(s.startTime, s.endTime, evt.timezone || 'ET').displayFull}
                                                  </span>
                                                </div>
                                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                                                  isSelected ? 'bg-tealBrand-800 border-tealBrand-800 text-white' : 'border-slate-300 bg-white'
                                                }`}>
                                                  {isSelected ? '✓' : ''}
                                                </span>
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Buttons in Delimited Card Footer */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-200 bg-slate-50/90 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl space-y-1.5">
                                      {isHistorical ? (
                                        <div className="h-8.5 w-full bg-slate-100 border border-slate-300 text-slate-700 rounded-lg flex items-center justify-center text-xs font-semibold gap-1.5 shadow-2xs">
                                          <Check className="w-3.5 h-3.5 text-tealBrand-700" />
                                          <span>Forwarded to Client ✓</span>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={(paSelectedSlotIds[evt.id] || []).length !== 2 || paConfirmingEventId === evt.id}
                                          onClick={() => handlePaConfirmSlots(evt)}
                                          className="w-full bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-40 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition-colors shadow-xs h-8.5 flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                          <span>{paConfirmingEventId === evt.id ? 'Saving...' : 'Confirm 2 & Send to Client ➔'}</span>
                                        </button>
                                      )}

                                      <div className="flex items-center gap-1.5 h-8">
                                        <button
                                          type="button"
                                          onClick={() => setRecordingSlotsEvent(evt)}
                                          className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-2xs h-8"
                                          title="Modify or update the dates offered"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                          <span>Modify Dates</span>
                                        </button>

                                        {paPhone ? (
                                          <a
                                            href={getNextivaTelUri(paPhone) || '#'}
                                            className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-2xs h-8"
                                            title={`Call PA ${formatPhoneNumber(paPhone)} via Nextiva`}
                                          >
                                            <Phone className="w-3.5 h-3.5 text-tealBrand-700" />
                                            <span>Call PA</span>
                                          </a>
                                        ) : (
                                          <div className="flex-1 h-8 flex items-center justify-center text-[10px] text-slate-400 italic bg-white border border-slate-200 rounded-lg">
                                            No PA phone
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Stage 3: Insured Selection (Pick 1 of 2) */}
                                {stage.key === '3_insured_selection' && (
                                  <div className="flex flex-col justify-between flex-1">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-[11px] min-h-[22px]">
                                        <span className="font-bold text-slate-700">
                                          {isHistorical ? 'Selected Option:' : 'Client must choose 1 option:'}
                                        </span>
                                        <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] ${
                                          isHistorical 
                                            ? 'text-emerald-800 bg-emerald-50 border-emerald-200' 
                                            : 'text-purple-800 bg-purple-50 border-purple-200'
                                        }`}>
                                          {isHistorical ? '✓ Confirmed' : '1 of 2'}
                                        </span>
                                      </div>

                                      <div className="space-y-1.5">
                                        {isHistorical ? (
                                          (evt.slots || []).map((s) => {
                                            const isChosen = s.slotDate === evt.finalDate || s.status === 'insured_chosen';
                                            return (
                                              <div
                                                key={s.id}
                                                className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-1 min-h-[44px] ${
                                                  isChosen
                                                    ? 'border-emerald-400 bg-emerald-50/70 text-emerald-950 font-bold'
                                                    : 'border-slate-200 bg-white/50 text-slate-400 opacity-60'
                                                }`}
                                              >
                                                <div>
                                                  <span className="block font-semibold">📅 {s.slotDate}</span>
                                                  <span className="text-[10px] font-mono block opacity-80">
                                                    {formatTimeRangeWithDualTimezone(s.startTime, s.endTime, evt.timezone || 'ET').displayFull}
                                                  </span>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                                  isChosen ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-100 text-slate-400 border-slate-200'
                                                }`}>
                                                  {isChosen ? '✓ Selected' : 'Not selected'}
                                                </span>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <>
                                            {(evt.slots || [])
                                              .filter((s) => s.status === 'pa_accepted' || s.status === 'proposed')
                                              .map((s) => (
                                                <div
                                                  key={s.id}
                                                  className="p-2 rounded-lg border border-tealBrand-300 bg-tealBrand-50/70 text-xs flex items-center justify-between gap-1 min-h-[44px]"
                                                >
                                                  <div>
                                                    <span className="font-bold text-slate-900 block">📅 {s.slotDate}</span>
                                                    <span className="text-[10px] text-slate-600 font-mono block">
                                                      {formatTimeRangeWithDualTimezone(s.startTime, s.endTime, evt.timezone || 'ET').displayFull}
                                                    </span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    disabled={insuredConfirmingSlotId === s.id}
                                                    onClick={() => handleInsuredConfirmSlot(evt, s)}
                                                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-bold transition-colors shadow-xs shrink-0 cursor-pointer"
                                                  >
                                                    {insuredConfirmingSlotId === s.id ? '...' : 'Client Picked ➔'}
                                                  </button>
                                                </div>
                                              ))}

                                            {(evt.slots || [])
                                              .filter((s) => s.status === 'pa_rejected' || s.status === 'discarded')
                                              .map((s) => (
                                                <div
                                                  key={s.id}
                                                  className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs flex items-center justify-between gap-1 min-h-[44px] opacity-60"
                                                  title="Option not selected by PA"
                                                >
                                                  <div>
                                                    <span className="font-medium text-slate-500 block">📅 {s.slotDate}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono block">{s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}</span>
                                                  </div>
                                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                    Not picked by PA
                                                  </span>
                                                </div>
                                              ))}
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Buttons in Delimited Card Footer */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-200 bg-slate-50/90 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl space-y-1.5">
                                      {isHistorical ? (
                                        <div className="h-8.5 w-full bg-slate-100 border border-slate-300 text-slate-700 rounded-lg flex items-center justify-center text-xs font-semibold gap-1.5 shadow-2xs">
                                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                                          <span>Client Confirmed & Scheduled ✓</span>
                                        </div>
                                      ) : (
                                        insuredPhone ? (
                                          <a
                                            href={getNextivaTelUri(insuredPhone) || '#'}
                                            className="w-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                                            title={`Call client via Nextiva: ${formatPhoneNumber(insuredPhone)}`}
                                          >
                                            <Phone className="w-3.5 h-3.5 text-tealBrand-700 shrink-0" />
                                            <span className="truncate">Call Client: <strong className="font-mono text-slate-900">{formatPhoneNumber(insuredPhone)}</strong></span>
                                          </a>
                                        ) : (
                                          <div className="h-8 flex items-center justify-center text-[10px] text-slate-400 italic bg-white border border-slate-200 rounded-lg">
                                            No client phone registered
                                          </div>
                                        )
                                      )}

                                      {/* Message Generator & Actions */}
                                      <div className="flex items-center gap-1.5 h-8">
                                        {isHistorical && insuredPhone ? (
                                          <a
                                            href={getNextivaTelUri(insuredPhone) || '#'}
                                            className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs h-8"
                                            title={`Call client via Nextiva: ${formatPhoneNumber(insuredPhone)}`}
                                          >
                                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="truncate">Call Client ({formatPhoneNumber(insuredPhone)})</span>
                                          </a>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => copyToClipboard(messageText, evt.id)}
                                              className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 py-1 px-2 rounded-lg transition-colors h-8"
                                            >
                                              {copiedId === evt.id ? <Check className="w-3.5 h-3.5 text-tealBrand-700" /> : <Copy className="w-3.5 h-3.5" />}
                                              <span>{copiedId === evt.id ? 'Copied!' : 'Copy'}</span>
                                            </button>

                                            <button
                                              onClick={() => {
                                                const phone = evt.claim?.insured?.phone?.replace(/\D/g, '');
                                                if (phone) window.open(`https://wa.me/1${phone}?text=${encodeURIComponent(messageText)}`, '_blank');
                                              }}
                                              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition-colors flex items-center justify-center"
                                              title="Open WhatsApp directly"
                                            >
                                              <Send className="w-3.5 h-3.5 text-tealBrand-700" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => handleSendInsuredEmail(evt.id)}
                                              disabled={sendingEmailEventId === evt.id}
                                              className={`h-8 px-2.5 rounded-lg border transition-colors flex items-center justify-center gap-1 text-[11px] font-semibold ${
                                                !evt.claim?.insured?.email
                                                  ? 'bg-slate-100 hover:bg-amber-50 border-amber-300 text-amber-800'
                                                  : 'bg-tealBrand-50 hover:bg-tealBrand-100 border-tealBrand-300 text-tealBrand-800'
                                              }`}
                                              title={
                                                !evt.claim?.insured?.email
                                                  ? 'Sin correo registrado para el asegurado. Clic para ver detalles.'
                                                  : `Enviar invitación por correo a ${evt.claim.insured.email}`
                                              }
                                            >
                                              <Mail className={`w-3.5 h-3.5 ${!evt.claim?.insured?.email ? 'text-amber-600' : 'text-tealBrand-700'}`} />
                                              <span>
                                                {sendingEmailEventId === evt.id
                                                  ? '...'
                                                  : !evt.claim?.insured?.email
                                                  ? 'Sin Email'
                                                  : 'Email'}
                                              </span>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Stage 4: Confirmed */}
                                {stage.key === '4_confirmed' && (
                                  <div className="flex flex-col justify-between flex-1">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-[11px] min-h-[22px]">
                                        <span className="font-bold text-emerald-800">Inspection Scheduled</span>
                                        <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                          ✓ Scheduled
                                        </span>
                                      </div>

                                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 min-h-[120px] flex flex-col justify-center">
                                        <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs">
                                          <Check className="w-4 h-4 text-emerald-600" />
                                          <span>Appointment Confirmed</span>
                                        </div>
                                        <p className="text-[12px] text-emerald-800 font-bold pl-5.5">
                                          📅 {evt.finalDate}
                                        </p>
                                        <p className="text-[11px] text-slate-600 font-mono pl-5.5">
                                          ⏰ {formatTimeRangeWithDualTimezone(evt.finalStartTime || '09:00', evt.finalEndTime || '11:00', evt.timezone || 'ET').displayFull}
                                        </p>
                                        <p className="text-[10px] text-emerald-700 pl-5.5 pt-1 font-medium">
                                          All parties confirmed
                                        </p>
                                      </div>
                                    </div>

                                    {/* Action Buttons in Delimited Card Footer */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-200 bg-slate-50/90 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl space-y-1.5">
                                      <div className="h-8.5 w-full bg-emerald-700 text-white rounded-lg flex items-center justify-center text-xs font-bold gap-1.5 shadow-xs">
                                        <Check className="w-4 h-4" />
                                        <span>Inspection Scheduled ✓</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setEventToReset(evt)}
                                        className="w-full h-8 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-600 hover:text-rose-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                                        title="Cancel appointment and return event to first stage"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                                        <span>Cancel / Reset Flow</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
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
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: CLAIMS DIRECTORY (ALL CLAIMS) */}
        {/* ======================================================== */}
        {viewMode === 'claims' && (
          <div className="space-y-4">
            {/* Claims Toolbar: Event filters and List/Grid layout switch */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              {/* Event assignment filters */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setClaimsEventFilter('all')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                    claimsEventFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All ({claims.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClaimsEventFilter('unassigned')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all ${
                    claimsEventFilter === 'unassigned'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : unassignedClaimsCount > 0
                        ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${claimsEventFilter === 'unassigned' ? 'text-white' : 'text-amber-600'}`} />
                  <span>Unassigned ({unassignedClaimsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClaimsEventFilter('assigned')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                    claimsEventFilter === 'assigned'
                      ? 'bg-tealBrand-700 text-white border-tealBrand-700 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Active Event ({claims.length - unassignedClaimsCount})
                </button>
              </div>

              {/* View Buttons: List vs Grid */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => setClaimsLayoutMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    claimsLayoutMode === 'list'
                      ? 'bg-white text-maroon-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Compact List View"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClaimsLayoutMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    claimsLayoutMode === 'grid'
                      ? 'bg-white text-maroon-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
              </div>
            </div>

            {filteredClaims.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                <FolderOpen className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">
                  {claimsEventFilter === 'unassigned' ? 'Great! All claims have an assigned event' : 'No claims found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery 
                    ? `No claims matching "${searchQuery}"` 
                    : claimsEventFilter === 'unassigned'
                      ? 'No claims pending to be scheduled or inspected.'
                      : 'No claims have been entered into the system yet.'}
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  {claimsEventFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setClaimsEventFilter('all')}
                      className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-lg transition-colors border border-slate-300"
                    >
                      Show All Claims
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setClaimToEdit(null);
                      setIsNewClaimOpen(true);
                    }}
                    className="inline-flex items-center gap-2 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Enter New Claim</span>
                  </button>
                </div>
              </div>
            ) : claimsLayoutMode === 'list' ? (
              /* ======================================================== */
              /* CLAIMS TABLE / LIST */
              /* ======================================================== */
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Claim / Carrier</th>
                        <th className="py-3 px-4">Insured (Client)</th>
                        <th className="py-3 px-4">Property & Loss</th>
                        <th className="py-3 px-4">Public Adjuster</th>
                        <th className="py-3 px-4">Event Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredClaims.map((claim) => {
                        const assignedPa = pas.find(p => p.id === claim.publicAdjusterId);
                        const relatedEvents = events.filter(e => e.claimId === claim.id);
                        const hasEvents = relatedEvents.length > 0;

                        return (
                          <tr 
                            key={claim.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              !hasEvents ? 'bg-amber-50/20' : ''
                            }`}
                          >
                            {/* Claim & Carrier */}
                            <td className="py-3 px-4 align-top">
                              <span className="font-mono font-bold text-maroon-800 text-xs">
                                {claim.claimNumber}
                              </span>
                              <div className="font-semibold text-slate-900 mt-0.5">
                                {claim.carrier}
                              </div>
                              {claim.policyNumber && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Pol: {claim.policyNumber}
                                </div>
                              )}
                            </td>

                            {/* Insured Client */}
                            <td className="py-3 px-4 align-top">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-maroon-800 shrink-0" />
                                <span>{claim.insured?.name || 'Unnamed Client'}</span>
                              </div>
                              <div className="text-[11px] text-slate-600 mt-1">
                                📞 {claim.insured?.phone || 'No phone'}
                              </div>
                              {claim.insured?.email && (
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-md" title={claim.insured.email}>
                                  ✉️ {claim.insured.email}
                                </div>
                              )}
                            </td>

                            {/* Property & Loss */}
                            <td className="py-3 px-4 align-top">
                              <div className="flex items-start gap-1 text-[11px] text-slate-700 max-w-lg">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">
                                  {claim.propertyAddress}{claim.city ? `, ${claim.city}` : ''}{claim.state ? `, ${claim.state}` : ''}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                <span className="text-slate-700 font-semibold">{claim.typeOfLoss}</span>
                                {claim.dateOfLoss && ` · Loss: ${claim.dateOfLoss}`}
                              </div>
                            </td>

                            {/* Public Adjuster */}
                            <td className="py-3 px-4 align-top">
                              {assignedPa ? (
                                <div className="flex items-center gap-1.5">
                                  <span 
                                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                                    style={{ backgroundColor: assignedPa.colorCode }}
                                  />
                                  <span className="font-semibold text-slate-800 text-[11px]">
                                    {assignedPa.name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                              )}
                            </td>

                            {/* Event Status */}
                            <td className="py-3 px-4 align-top">
                              {hasEvents ? (
                                <div className="space-y-1.5">
                                  {relatedEvents.map(ev => (
                                    <div key={ev.id} className="flex items-center gap-1.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        {ev.eventType}
                                      </span>
                                      <span className="text-[10px] text-slate-500 capitalize">
                                        ({ev.coordinationStage.replace(/^[0-9]+_/, '').replace(/_/g, ' ')})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-2xs">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>No event assigned</span>
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 align-top text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!hasEvents ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedClaim(claim)}
                                    className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors"
                                    title="Open claim to create inspection / event"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Assign Event</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setViewMode('funnel');
                                      setSearchQuery(claim.claimNumber);
                                    }}
                                    className="p-1.5 text-tealBrand-700 hover:text-tealBrand-900 bg-tealBrand-50 hover:bg-tealBrand-100 border border-tealBrand-200 rounded-lg transition-colors"
                                    title="View event in Funnel"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedClaim(claim)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-maroon-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <span>View Claim</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setClaimToDelete(claim)}
                                  className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                  title="Delete claim"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ======================================================== */
              /* CARD GRID VIEW */
              /* ======================================================== */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClaims.map((claim) => {
                  const assignedPa = pas.find(p => p.id === claim.publicAdjusterId);
                  const relatedEvents = events.filter(e => e.claimId === claim.id);
                  const hasEvents = relatedEvents.length > 0;
                  const firstEvent = relatedEvents[0];

                  return (
                    <div 
                      key={claim.id}
                      className={`bg-white border rounded-xl p-4 space-y-3.5 shadow-xs transition-colors flex flex-col justify-between ${
                        !hasEvents 
                          ? 'border-amber-300 hover:border-amber-500 bg-amber-50/10' 
                          : 'border-slate-200 hover:border-maroon-700'
                      }`}
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

                        {/* Event status indicator */}
                        {!hasEvents ? (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              No event assigned
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 bg-emerald-50/60 border border-emerald-200 rounded-lg flex items-center justify-between text-[11px] text-emerald-800">
                            <span className="flex items-center gap-1 font-semibold">
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              {firstEvent.eventType}
                            </span>
                            <span className="text-[10px] text-slate-500 capitalize">
                              {firstEvent.coordinationStage.replace(/^[0-9]+_/, '').replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}

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
                        {!hasEvents ? (
                          <button
                            type="button"
                            onClick={() => setSelectedClaim(claim)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 py-2 rounded-lg transition-colors shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Assign Event</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedClaim(claim)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 hover:text-maroon-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 py-2 rounded-lg transition-colors"
                          >
                            <span>Claim View & Events</span>
                          </button>
                        )}
                        {hasEvents && (
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('funnel');
                              setSearchQuery(claim.claimNumber);
                            }}
                            className="p-2 text-xs font-bold text-tealBrand-700 hover:text-tealBrand-900 bg-tealBrand-50 hover:bg-tealBrand-100 border border-tealBrand-200 rounded-lg transition-colors cursor-pointer"
                            title="View in Funnel"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setClaimToDelete(claim)}
                          className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          title="Delete claim"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: MASTER CATALOGS & ACTORS (CRUD) */}
        {/* ======================================================== */}
        {viewMode === 'catalogs' && (
          <MasterCatalogsView
            claims={claims}
            events={events}
            onDataRefresh={loadData}
          />
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

      {/* Record Carrier Proposed Dates Modal (Funnel Step 1) */}
      {recordingSlotsEvent && (
        <RecordCarrierSlotsModal
          isOpen={Boolean(recordingSlotsEvent)}
          onClose={() => setRecordingSlotsEvent(null)}
          event={recordingSlotsEvent}
          claim={
            claims.find((c) => c.id === recordingSlotsEvent.claimId) ||
            recordingSlotsEvent.claim ||
            ({ claimNumber: 'Unknown', carrier: 'Carrier' } as any)
          }
          onSaved={loadData}
        />
      )}

      {/* Direct Confirm Modal (Fast-Track) */}
      {directConfirmingEvent && (
        <DirectConfirmModal
          isOpen={Boolean(directConfirmingEvent)}
          onClose={() => setDirectConfirmingEvent(null)}
          event={directConfirmingEvent}
          claim={
            claims.find((c) => c.id === directConfirmingEvent.claimId) ||
            directConfirmingEvent.claim ||
            ({ claimNumber: 'Unknown', carrier: 'Carrier' } as any)
          }
          onConfirmed={loadData}
        />
      )}

      {/* SLA Thresholds Settings Modal */}
      <SlaSettingsModal
        isOpen={isSlaSettingsOpen}
        onClose={() => setIsSlaSettingsOpen(false)}
        onSaved={(newCfg) => setSlaConfig(newCfg)}
      />

      {/* Reset Coordination Flow Modal */}
      {eventToReset && (
        <ResetCoordinationModal
          event={eventToReset}
          isOpen={Boolean(eventToReset)}
          onClose={() => setEventToReset(null)}
          onConfirm={handleConfirmReset}
        />
      )}

      {/* Event History & Audit Log Modal */}
      {historyEventTarget && (
        <EventHistoryModal
          event={historyEventTarget}
          isOpen={Boolean(historyEventTarget)}
          onClose={() => setHistoryEventTarget(null)}
          onLogAdded={loadData}
        />
      )}

      {/* Delete Claim Confirmation Modal */}
      {claimToDelete && (
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
              <p className="font-bold text-slate-800 font-mono">Claim #{claimToDelete.claimNumber}</p>
              <p className="text-slate-600 font-semibold">{claimToDelete.carrier} · {claimToDelete.insured?.name || 'Unnamed Client'}</p>
              <p className="text-slate-500">{claimToDelete.propertyAddress}</p>
              <p className="text-[11px] text-amber-700 font-medium pt-1">⚠️ This claim, its events, dates, and coordination history will be permanently deleted.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setClaimToDelete(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingClaim}
                onClick={handleDeleteClaim}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeletingClaim ? 'Deleting...' : 'Yes, Delete Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

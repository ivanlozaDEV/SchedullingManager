import { useState, useMemo, useEffect } from 'react';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths, 
  subMonths, 
  addWeeks, 
  subWeeks, 
  isToday
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Phone, 
  ExternalLink, 
  Search, 
  X, 
  CheckCircle2, 
  CalendarPlus, 
  Pencil, 
  FolderOpen,
  Filter,
  Layers,
  Trash2,
  Car,
  Save,
  Loader2,
  Kanban
} from 'lucide-react';
import type { CoordinationEvent, Claim, PublicAdjuster } from '../types';
import { 
  format12Hour, 
  formatTimeRangeWithDualTimezone, 
  cleanAddress, 
  formatUsDate,
  detectPropertyTimezone,
  type FloridaTimezone 
} from '../lib/timezoneUtils';
import { getNextivaTelUri, formatPhoneNumber, getGoogleCalendarUrl } from '../lib/slaUtils';
import { parseTimeToMinutes, formatMinutesToHours } from '../lib/scheduleConflictUtils';
import { ScheduleInFreeSlotModal } from './ScheduleInFreeSlotModal';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { 
  type TransitLegInfo, 
  calculateLegTransit 
} from '../lib/transitTravelUtils';
import { isPublicAdjusterRole, formatPaRole } from '../lib/appSettingsService';
import { schedulingService } from '../lib/schedulingService';

interface FreeTimeWindow {
  type: 'free';
  id: string;
  startMinutes: number;
  endMinutes: number;
  startTimeStr: string;
  endTimeStr: string;
  durationMinutes: number;
  durationLabel: string;
  fromEvent?: CalendarEventItem;
  toEvent?: CalendarEventItem;
}

type WeekScheduleItem = 
  | { type: 'event'; item: CalendarEventItem }
  | FreeTimeWindow;

function minutesToTime12(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${h12}:${mStr} ${period}`;
}

function minutesToTime24(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${hStr}:${mStr}`;
}

function getDayScheduleWithGaps(dayItems: CalendarEventItem[], showGaps: boolean): WeekScheduleItem[] {
  if (!showGaps) {
    return dayItems.map(item => ({ type: 'event', item }));
  }

  // Business operating window: 8:00 AM (480 mins) to 6:00 PM (1080 mins)
  const DAY_START = 8 * 60;  // 8:00 AM
  const DAY_END = 18 * 60;   // 6:00 PM

  if (dayItems.length === 0) {
    return [
      {
        type: 'free',
        id: 'free-all-day',
        startMinutes: DAY_START,
        endMinutes: DAY_END,
        startTimeStr: '8:00 AM',
        endTimeStr: '6:00 PM',
        durationMinutes: DAY_END - DAY_START,
        durationLabel: 'All Day Open (10h)'
      }
    ];
  }

  const result: WeekScheduleItem[] = [];
  const sorted = [...dayItems].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 1. Morning free window before first appointment
  const firstItem = sorted[0];
  const firstStartM = parseTimeToMinutes(firstItem.startTime) ?? DAY_START;
  if (firstStartM - DAY_START >= 30) {
    result.push({
      type: 'free',
      id: `free-morning-${firstItem.id}`,
      startMinutes: DAY_START,
      endMinutes: firstStartM,
      startTimeStr: minutesToTime12(DAY_START),
      endTimeStr: minutesToTime12(firstStartM),
      durationMinutes: firstStartM - DAY_START,
      durationLabel: `${formatMinutesToHours(firstStartM - DAY_START)} free`
    });
  }

  // 2. Iterate items and calculate gaps between them
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    result.push({ type: 'event', item: current });

    const startM = parseTimeToMinutes(current.startTime) ?? DAY_START;
    let endM = parseTimeToMinutes(current.endTime);
    if (!endM || endM <= startM) {
      endM = startM + 60; // fallback 1 hour
    }

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const nextStartM = parseTimeToMinutes(next.startTime) ?? (endM + 60);
      const gap = nextStartM - endM;

      // Include free window if gap >= 30 OR if both appointments have location (to show travel logistics)
      if (gap >= 30 || (current.location && next.location)) {
        result.push({
          type: 'free',
          id: `free-between-${current.id}-${next.id}`,
          startMinutes: endM,
          endMinutes: nextStartM,
          startTimeStr: minutesToTime12(endM),
          endTimeStr: minutesToTime12(nextStartM),
          durationMinutes: Math.max(0, gap),
          durationLabel: gap > 0 ? `${formatMinutesToHours(gap)} free` : '0m gap',
          fromEvent: current,
          toEvent: next
        });
      }
    } else {
      // 3. Evening free window after last appointment
      if (DAY_END - endM >= 30) {
        result.push({
          type: 'free',
          id: `free-evening-${current.id}`,
          startMinutes: endM,
          endMinutes: DAY_END,
          startTimeStr: minutesToTime12(endM),
          endTimeStr: minutesToTime12(DAY_END),
          durationMinutes: DAY_END - endM,
          durationLabel: `${formatMinutesToHours(DAY_END - endM)} free`
        });
      }
    }
  }

  return result;
}

interface CalendarViewProps {
  events: CoordinationEvent[];
  claims: Claim[];
  pas: PublicAdjuster[];
  onSelectClaim: (claim: Claim) => void;
  onEditEvent: (event: CoordinationEvent) => void;
  onDataRefresh?: () => void;
  onViewInFunnel?: (claimNumber: string, eventId?: string) => void;
  initialDate?: Date | null;
}

export interface CalendarEventItem {
  id: string; // unique item id
  eventId: string;
  claimId: string;
  claim?: Claim;
  event: CoordinationEvent;
  dateStr: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string;   // HH:mm:ss
  isConfirmed: boolean;
  isTentativeSlot: boolean;
  eventType: string;
  title: string;
  location: string;
  pa?: PublicAdjuster | null;
  timezone: FloridaTimezone;
  slotId?: string;
}

export function CalendarView({
  events,
  claims,
  pas,
  onSelectClaim,
  onEditEvent,
  onDataRefresh,
  onViewInFunnel,
  initialDate,
}: CalendarViewProps) {
  // Navigation & View Mode
  const [currentDate, setCurrentDate] = useState<Date>(() => initialDate || new Date());
  const [viewType, setViewType] = useState<'month' | 'week' | 'agenda'>('week');

  useEffect(() => {
    if (initialDate) {
      setCurrentDate(initialDate);
    }
  }, [initialDate]);

  // Filters
  const [selectedPaId, setSelectedPaId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeTentativeSlots, setIncludeTentativeSlots] = useState(true);
  const [showFreeWindows, setShowFreeWindows] = useState(true);

  // Target free slot for booking modal
  const [bookingSlotTarget, setBookingSlotTarget] = useState<{
    slotDate: string;
    startTime: string;
    endTime: string;
    paId?: string;
  } | null>(null);

  // Selected item for popover / modal detail
  const [activeItem, setActiveItem] = useState<CalendarEventItem | null>(null);
  const [isDeletingSlot, setIsDeletingSlot] = useState(false);
  const [isChangingPa, setIsChangingPa] = useState(false);
  const [isSavingPa, setIsSavingPa] = useState(false);
  const { success, error } = useToast();

  // Filtrar exclusivamente los PAs que tienen rol de Public Adjuster en la tabla de actores
  const eligiblePas = useMemo(() => {
    return pas.filter(p => p.isActive !== false && isPublicAdjusterRole(p.role));
  }, [pas]);

  useEffect(() => {
    setIsChangingPa(false);
  }, [activeItem]);

  const handleQuickUpdatePa = async (newPa: PublicAdjuster) => {
    if (!activeItem) return;
    setIsSavingPa(true);
    try {
      await schedulingService.updateEventPa(activeItem.eventId, newPa.id);
      success('PA de la Cita Actualizado', `${newPa.name} asignado a esta inspección.`);
      setActiveItem(prev => {
        if (!prev) return null;
        return {
          ...prev,
          pa: newPa,
          event: {
            ...prev.event,
            publicAdjusterId: newPa.id,
            publicAdjuster: newPa,
          }
        };
      });
      setIsChangingPa(false);
      if (onDataRefresh) onDataRefresh();
    } catch (err: any) {
      console.error('Error actualizando PA asignado:', err);
      error('Error al actualizar', err.message || 'No se pudo actualizar el PA del evento');
    } finally {
      setIsSavingPa(false);
    }
  };

  const handleDeleteTentativeSlot = async (item: CalendarEventItem) => {
    if (!item.isTentativeSlot) return;

    const confirmMsg = `¿Deseas eliminar la opción tentativa para ${item.claim?.insured?.name || 'este reclamo'} del ${formatUsDate(item.dateStr)} (${format12Hour(item.startTime)})?`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeletingSlot(true);
    try {
      if (item.slotId) {
        const { error: delErr } = await supabase.from('event_slots').delete().eq('id', item.slotId);
        if (delErr) throw delErr;
      }

      // Check remaining slots on this event
      const remainingSlots = (item.event.slots || []).filter(s => s.id !== item.slotId);
      if (remainingSlots.length === 0 && item.event.coordinationStage !== '4_confirmed') {
        await supabase.from('event_participants').delete().eq('event_id', item.eventId);
        await supabase.from('coordination_logs').delete().eq('event_id', item.eventId);
        await supabase.from('events').delete().eq('id', item.eventId);
      }

      success('Opción Eliminada', 'El slot tentativo ha sido eliminado del calendario y del funnel.');
      setActiveItem(null);
      if (onDataRefresh) onDataRefresh();
    } catch (err: any) {
      console.error('Error deleting tentative slot:', err);
      error('Error al eliminar', err.message || 'No se pudo eliminar el slot tentativo');
    } finally {
      setIsDeletingSlot(false);
    }
  };

  // Day expansion modal for Month view when a day has many items
  const [expandedDay, setExpandedDay] = useState<{ date: Date; items: CalendarEventItem[] } | null>(null);

  // Map of claims for fast lookup
  const claimsMap = useMemo(() => {
    const map = new Map<string, Claim>();
    for (const c of claims) {
      map.set(c.id, c);
    }
    return map;
  }, [claims]);

  // Extract all calendar event items (Confirmed inspections + tentative slots)
  const allCalendarItems = useMemo(() => {
    const items: CalendarEventItem[] = [];

    for (const evt of events) {
      const claim = evt.claim || claimsMap.get(evt.claimId);
      
      // Resolve PA: first from event direct PA / publicAdjusterId, then participants, then claim
      const paParticipant = evt.participants?.find(p => p.participantType === 'public_adjuster' && (!p.roleType || p.roleType === 'actor'))?.publicAdjuster;
      const pa = evt.publicAdjuster 
        || (evt.publicAdjusterId ? pas.find(p => p.id === evt.publicAdjusterId) : null)
        || paParticipant 
        || claim?.publicAdjuster 
        || null;

      const propTz: FloridaTimezone = evt.timezone 
        || (claim ? detectPropertyTimezone(claim.propertyAddress, claim.timezone) : 'ET');

      // 1. Confirmed Event (finalDate)
      if (evt.finalDate && evt.finalStartTime && evt.finalEndTime) {
        items.push({
          id: `confirmed-${evt.id}`,
          eventId: evt.id,
          claimId: evt.claimId,
          claim,
          event: evt,
          dateStr: evt.finalDate,
          startTime: evt.finalStartTime,
          endTime: evt.finalEndTime,
          isConfirmed: true,
          isTentativeSlot: false,
          eventType: evt.eventType || 'Inspection',
          title: `${claim?.claimNumber ? `#${claim.claimNumber}` : 'Claim'} - ${claim?.insured?.name || 'Insured'}`,
          location: evt.location || claim?.propertyAddress || '',
          pa,
          timezone: propTz
        });
      }

      // 2. Tentative Slots in coordination (if event is not confirmed or has active proposed slots)
      if (evt.coordinationStage !== '4_confirmed' && evt.slots && evt.slots.length > 0) {
        for (const slot of evt.slots) {
          if (slot.slotDate && slot.startTime && slot.endTime) {
            // Include proposed or pa_accepted slots
            if (slot.status === 'proposed' || slot.status === 'pa_accepted' || slot.status === 'insured_chosen') {
              items.push({
                id: `slot-${slot.id}`,
                eventId: evt.id,
                claimId: evt.claimId,
                claim,
                event: evt,
                dateStr: slot.slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                isConfirmed: false,
                isTentativeSlot: true,
                eventType: `${evt.eventType || 'Inspection'} (Option)`,
                title: `${claim?.claimNumber ? `#${claim.claimNumber}` : 'Claim'} - ${claim?.insured?.name || 'Insured'} [Tentative]`,
                location: evt.location || claim?.propertyAddress || '',
                pa,
                timezone: propTz,
                slotId: slot.id
              });
            }
          }
        }
      }
    }

    return items;
  }, [events, claimsMap]);

  // Filtered items based on PA, Search query, and Tentative toggle
  const filteredItems = useMemo(() => {
    return allCalendarItems.filter(item => {
      // 1. Filter tentative
      if (!includeTentativeSlots && item.isTentativeSlot) {
        return false;
      }

      // 2. Filter by PA
      if (selectedPaId !== 'all') {
        if (selectedPaId === 'unassigned') {
          if (item.pa) return false;
        } else {
          if (!item.pa || item.pa.id !== selectedPaId) return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const claimNum = item.claim?.claimNumber?.toLowerCase() || '';
        const insuredName = item.claim?.insured?.name?.toLowerCase() || '';
        const carrier = item.claim?.carrier?.toLowerCase() || '';
        const loc = item.location.toLowerCase();
        const paName = item.pa?.name?.toLowerCase() || '';
        const evType = item.eventType.toLowerCase();

        const match = claimNum.includes(q) 
          || insuredName.includes(q) 
          || carrier.includes(q) 
          || loc.includes(q) 
          || paName.includes(q) 
          || evType.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [allCalendarItems, includeTentativeSlots, selectedPaId, searchQuery]);

  // Count items per PA for legend badges
  const paItemCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allCalendarItems.length, unassigned: 0 };
    for (const pa of pas) {
      counts[pa.id] = 0;
    }
    for (const item of allCalendarItems) {
      if (!includeTentativeSlots && item.isTentativeSlot) continue;
      if (item.pa) {
        counts[item.pa.id] = (counts[item.pa.id] || 0) + 1;
      } else {
        counts.unassigned = (counts.unassigned || 0) + 1;
      }
    }
    return counts;
  }, [allCalendarItems, pas, includeTentativeSlots]);

  // Navigation handlers
  const handlePrev = () => {
    if (viewType === 'month') {
      setCurrentDate(prev => subMonths(prev, 1));
    } else if (viewType === 'week') {
      setCurrentDate(prev => subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => subWeeks(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewType === 'month') {
      setCurrentDate(prev => addMonths(prev, 1));
    } else if (viewType === 'week') {
      setCurrentDate(prev => addWeeks(prev, 1));
    } else {
      setCurrentDate(prev => addWeeks(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Month grid days calculation
  const monthDays = useMemo(() => {
    const startMonth = startOfMonth(currentDate);
    const endMonth = endOfMonth(currentDate);
    const startDate = startOfWeek(startMonth, { weekStartsOn: 0 }); // Sunday
    const endDate = endOfWeek(endMonth, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  // Week days calculation
  const weekDays = useMemo(() => {
    const startDate = startOfWeek(currentDate, { weekStartsOn: 0 });
    const endDate = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  // Items grouped by date string (YYYY-MM-DD)
  const itemsByDateStr = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const item of filteredItems) {
      const arr = map.get(item.dateStr) || [];
      arr.push(item);
      map.set(item.dateStr, arr);
    }
    // Sort each day chronologically by start time
    for (const [, list] of map.entries()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [filteredItems]);

  // Is filtering by a specific individual PA
  const isSpecificPa = selectedPaId !== 'all' && selectedPaId !== 'unassigned';

  // Transit legs map: key -> TransitLegInfo (Calculated ONLY for individual PA agenda)
  const [transitLegs, setTransitLegs] = useState<Record<string, TransitLegInfo>>({});

  useEffect(() => {
    if (!isSpecificPa) {
      setTransitLegs({});
      return;
    }

    let isMounted = true;
    const computeWeekTransit = async () => {
      const newLegs: Record<string, TransitLegInfo> = {};

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayItems = itemsByDateStr.get(dateStr) || [];

        for (let i = 0; i < dayItems.length - 1; i++) {
          const from = dayItems[i];
          const to = dayItems[i + 1];
          if (from.location && to.location) {
            const startM = parseTimeToMinutes(from.startTime) ?? 0;
            let endM = parseTimeToMinutes(from.endTime);
            if (!endM || endM <= startM) endM = startM + 60;
            const nextStartM = parseTimeToMinutes(to.startTime) ?? endM;
            const gap = Math.max(0, nextStartM - endM);

            const legKey = `${from.id}->${to.id}`;
            const leg = await calculateLegTransit(
              from.location,
              to.location,
              gap,
              from.id,
              to.id
            );
            if (leg) {
              newLegs[legKey] = leg;
            }
          }
        }
      }

      if (isMounted) {
        setTransitLegs(newLegs);
      }
    };

    computeWeekTransit();
    return () => {
      isMounted = false;
    };
  }, [weekDays, itemsByDateStr, selectedPaId, isSpecificPa]);

  // Reschedule state for editing tentative or confirmed slots
  const [editSlotDate, setEditSlotDate] = useState('');
  const [editSlotStartTime, setEditSlotStartTime] = useState('');
  const [editSlotEndTime, setEditSlotEndTime] = useState('');
  const [isSavingSlotSchedule, setIsSavingSlotSchedule] = useState(false);

  useEffect(() => {
    if (activeItem) {
      setEditSlotDate(activeItem.dateStr);
      setEditSlotStartTime(activeItem.startTime.slice(0, 5));
      setEditSlotEndTime(activeItem.endTime.slice(0, 5));
    }
  }, [activeItem]);

  const handleSaveSlotSchedule = async () => {
    if (!activeItem) return;
    if (!editSlotDate || !editSlotStartTime || !editSlotEndTime) {
      error('Campos incompletos', 'Ingresa fecha, hora de inicio y hora de fin.');
      return;
    }

    setIsSavingSlotSchedule(true);
    try {
      // 1. If slotId exists (tentative slot in event_slots)
      if (activeItem.slotId) {
        const { error: slotErr } = await supabase
          .from('event_slots')
          .update({
            slot_date: editSlotDate,
            start_time: `${editSlotStartTime}:00`,
            end_time: `${editSlotEndTime}:00`
          })
          .eq('id', activeItem.slotId);

        if (slotErr) throw slotErr;
      }

      // 2. If event has final_date (confirmed)
      if (activeItem.isConfirmed || activeItem.event.finalDate) {
        const { error: evtErr } = await supabase
          .from('events')
          .update({
            final_date: editSlotDate,
            final_start_time: `${editSlotStartTime}:00`,
            final_end_time: `${editSlotEndTime}:00`
          })
          .eq('id', activeItem.eventId);

        if (evtErr) throw evtErr;
      }

      success(
        'Horario Actualizado',
        `✓ Se reprogramó para el ${formatUsDate(editSlotDate)} (${format12Hour(editSlotStartTime)} – ${format12Hour(editSlotEndTime)}). Sin emails automáticos.`
      );
      setActiveItem(null);
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (err: any) {
      console.error('Error updating slot schedule:', err);
      error('Error al actualizar horario', err.message || 'No se pudo guardar el horario');
    } finally {
      setIsSavingSlotSchedule(false);
    }
  };

  // Drag and drop reschedule
  const handleDropOnFreeSlot = async (
    targetDate: string,
    targetStartMinutes: number,
    _targetEndMinutes: number,
    e: React.DragEvent
  ) => {
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      const targetStart = minutesToTime24(targetStartMinutes);
      const origStartM = parseTimeToMinutes(data.startTime) ?? 0;
      const origEndM = parseTimeToMinutes(data.endTime) ?? (origStartM + 90);
      const durationM = Math.max(30, origEndM - origStartM);
      const targetEnd = minutesToTime24(targetStartMinutes + durationM);

      if (data.isTentative && data.slotId) {
        const { error: slotErr } = await supabase
          .from('event_slots')
          .update({
            slot_date: targetDate,
            start_time: `${targetStart}:00`,
            end_time: `${targetEnd}:00`
          })
          .eq('id', data.slotId);

        if (slotErr) throw slotErr;
      } else if (data.eventId) {
        const { error: evtErr } = await supabase
          .from('events')
          .update({
            final_date: targetDate,
            final_start_time: `${targetStart}:00`,
            final_end_time: `${targetEnd}:00`
          })
          .eq('id', data.eventId);

        if (evtErr) throw evtErr;
      }

      success(
        'Cita Reprogramada',
        `✓ Se movió la cita al ${formatUsDate(targetDate)} a las ${format12Hour(targetStart)}.`
      );
      if (onDataRefresh) onDataRefresh();
    } catch (err: any) {
      console.error('Error on drop reschedule:', err);
      error('Error al mover cita', err.message || 'No se pudo mover la cita');
    }
  };

  // Helper for PA styling
  const getPaColor = (pa?: PublicAdjuster | null) => {
    return pa?.colorCode || '#64748b'; // default slate-500
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Card: Title, Month Navigation, View Switcher & Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Month / Week Title & Navigation Buttons */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:text-maroon-800 transition-colors cursor-pointer"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-1 rounded-md text-xs font-bold hover:bg-white text-slate-700 hover:text-maroon-800 transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:text-maroon-800 transition-colors cursor-pointer"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 font-['Montserrat',sans-serif]">
                {viewType === 'week' ? (
                  <>
                    {format(weekDays[0], 'MMM d')} – {format(weekDays[6], 'MMM d, yyyy')}
                  </>
                ) : (
                  format(currentDate, 'MMMM yyyy')
                )}
              </h2>
              {isToday(currentDate) && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full">
                  Current
                </span>
              )}
            </div>
          </div>

          {/* Right Toolbar: View Mode Selector & Search */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewType('month')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewType === 'month'
                    ? 'bg-white text-maroon-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Month</span>
              </button>
              <button
                type="button"
                onClick={() => setViewType('week')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewType === 'week'
                    ? 'bg-white text-maroon-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Week</span>
              </button>
              <button
                type="button"
                onClick={() => setViewType('agenda')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewType === 'agenda'
                    ? 'bg-white text-maroon-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Agenda</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter calendar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-tealBrand-600 focus:bg-white transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Toggle Tentative Slots */}
            <label 
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
              title="Show tentative slot proposals currently in coordination"
            >
              <input
                type="checkbox"
                checked={includeTentativeSlots}
                onChange={(e) => setIncludeTentativeSlots(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-tealBrand-600 focus:ring-tealBrand-500 border-slate-300"
              />
              <span>Include Tentative Slots</span>
            </label>

            {/* Toggle Free Time Windows (Active only when filtering by a specific PA) */}
            {selectedPaId !== 'all' && selectedPaId !== 'unassigned' ? (
              <label 
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                title="Mostrar espacios libres y tiempos de traslado entre citas de este PA"
              >
                <input
                  type="checkbox"
                  checked={showFreeWindows}
                  onChange={(e) => setShowFreeWindows(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Espacios Libres del PA</span>
                </span>
              </label>
            ) : (
              <div className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-dashed border-slate-200 px-2.5 py-1.5 rounded-lg hidden sm:flex items-center gap-1.5">
                <span>💡</span>
                <span>Filtra por un PA para ver sus espacios libres y calcular rutas</span>
              </div>
            )}
          </div>
        </div>

        {/* Public Adjuster Filter Pills with their unique Color Badges */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" />
            <span>PA Filter:</span>
          </span>

          {/* All PAs */}
          <button
            type="button"
            onClick={() => setSelectedPaId('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
              selectedPaId === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>All PAs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              selectedPaId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {filteredItems.length}
            </span>
          </button>

          {/* Individual PAs */}
          {pas.filter(p => p.isActive !== false).map((pa) => {
            const isSelected = selectedPaId === pa.id;
            const count = paItemCounts[pa.id] || 0;
            const color = pa.colorCode || '#0284c7';

            return (
              <button
                key={pa.id}
                type="button"
                onClick={() => setSelectedPaId(isSelected ? 'all' : pa.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-offset-1 shadow-2xs font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                style={{
                  borderColor: isSelected ? color : undefined,
                  backgroundColor: isSelected ? `${color}15` : undefined,
                  color: isSelected ? '#0f172a' : undefined
                }}
              >
                <span 
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" 
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[140px]">{pa.name}</span>
                <span 
                  className="text-[10px] px-1.5 py-0.2 rounded-full font-bold"
                  style={{
                    backgroundColor: isSelected ? color : '#f1f5f9',
                    color: isSelected ? '#ffffff' : '#64748b'
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Unassigned Option (if any) */}
          {(paItemCounts.unassigned || 0) > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPaId(selectedPaId === 'unassigned' ? 'all' : 'unassigned')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                selectedPaId === 'unassigned'
                  ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                  : 'bg-white text-slate-600 border-dashed border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span>Unassigned</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                {paItemCounts.unassigned}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MONTH VIEW */}
      {/* ========================================================================= */}
      {viewType === 'month' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-[11px] font-bold text-slate-600 uppercase tracking-wider py-2.5">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100">
            {monthDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isCurrentDay = isToday(day);
              const dayItems = itemsByDateStr.get(dateStr) || [];
              const maxDisplay = 3;
              const hasOverflow = dayItems.length > maxDisplay;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[125px] p-1.5 flex flex-col transition-colors ${
                    isCurrentMonth ? 'bg-white' : 'bg-slate-50/60'
                  } ${isCurrentDay ? 'bg-tealBrand-50/30 ring-1 ring-inset ring-tealBrand-300' : ''}`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-1 px-1">
                    <span
                      className={`text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full ${
                        isCurrentDay
                          ? 'bg-maroon-800 text-white font-extrabold shadow-2xs'
                          : isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400 font-normal'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>

                    {dayItems.length > 0 && (
                      <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                        {dayItems.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events Stack */}
                  <div className="space-y-1 flex-1 overflow-hidden">
                    {dayItems.slice(0, maxDisplay).map((item) => {
                      const paColor = getPaColor(item.pa);

                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveItem(item)}
                          className={`group text-[11px] rounded-md p-1.5 cursor-pointer transition-all border shadow-2xs hover:shadow-xs hover:scale-[1.01] ${
                            item.isTentativeSlot
                              ? 'bg-amber-50/80 border-amber-200 border-dashed text-slate-800'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                          style={{
                            borderLeftWidth: '4px',
                            borderLeftColor: paColor
                          }}
                        >
                          <div className="flex items-center justify-between gap-1 leading-tight">
                            <span className="font-extrabold text-slate-900 truncate">
                              {format12Hour(item.startTime)} – {format12Hour(item.endTime)}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span 
                                className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                                  item.timezone === 'CT' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                                }`}
                              >
                                {item.timezone}
                              </span>
                              {item.isTentativeSlot && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTentativeSlot(item);
                                  }}
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded transition-colors"
                                  title="Eliminar opción tentativa"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Claim # and Insured Name - 2 distinct lines */}
                          {item.claim?.claimNumber && (
                            <div className="text-[9px] font-mono font-bold text-slate-500 truncate leading-tight mt-0.5">
                              #{item.claim.claimNumber}
                            </div>
                          )}
                          <div className="font-extrabold text-slate-900 line-clamp-2 leading-snug mt-0.5 text-[11px]" title={item.claim?.insured?.name || 'Insured'}>
                            {item.claim?.insured?.name || 'Insured'}
                          </div>

                          {/* PA Badge with exact Color */}
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-600 truncate">
                            <span
                              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: paColor }}
                            />
                            <span className="font-medium truncate">
                              {item.pa?.name || 'Sin PA'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Overflow Button */}
                    {hasOverflow && (
                      <button
                        type="button"
                        onClick={() => setExpandedDay({ date: day, items: dayItems })}
                        className="w-full text-center text-[10px] font-bold text-tealBrand-800 bg-tealBrand-50 hover:bg-tealBrand-100 border border-tealBrand-200 rounded py-0.5 transition-colors cursor-pointer"
                      >
                        +{dayItems.length - maxDisplay} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. WEEK VIEW */}
      {/* ========================================================================= */}
      {viewType === 'week' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Weekday headers with dates */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 divide-x divide-slate-200">
            {weekDays.map((day) => {
              const isCurrentDay = isToday(day);
              const dateStr = format(day, 'yyyy-MM-dd');
              const count = itemsByDateStr.get(dateStr)?.length || 0;

              return (
                <div 
                  key={dateStr}
                  className={`py-3 px-2 text-center transition-colors ${
                    isCurrentDay ? 'bg-tealBrand-50/50' : ''
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {format(day, 'EEE')}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span 
                      className={`text-sm font-extrabold w-7 h-7 flex items-center justify-center rounded-full ${
                        isCurrentDay 
                          ? 'bg-maroon-800 text-white shadow-2xs' 
                          : 'text-slate-900'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {count > 0 && (
                      <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full">
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 7 Days Columns Content */}
          <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[450px]">
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayItems = itemsByDateStr.get(dateStr) || [];
              const isCurrentDay = isToday(day);
              const isSpecificPa = selectedPaId !== 'all' && selectedPaId !== 'unassigned';
              const scheduleItems = getDayScheduleWithGaps(dayItems, showFreeWindows && isSpecificPa);

              return (
                <div 
                  key={dateStr} 
                  className={`p-2 space-y-2 flex flex-col ${
                    isCurrentDay ? 'bg-tealBrand-50/20' : 'bg-white'
                  }`}
                >
                  {scheduleItems.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-300 text-xs italic py-10">
                      No events
                    </div>
                  )}

                  {scheduleItems.map((entry) => {
                    if (entry.type === 'free') {
                      const legKey = entry.fromEvent && entry.toEvent ? `${entry.fromEvent.id}->${entry.toEvent.id}` : null;
                      const transit = legKey ? transitLegs[legKey] : null;

                      return (
                        <div
                          key={entry.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            await handleDropOnFreeSlot(dateStr, entry.startMinutes, entry.endMinutes, e);
                          }}
                          className={`rounded-lg p-2.5 border transition-all text-left shadow-2xs group relative ${
                            transit 
                              ? transit.status === 'conflict'
                                ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300'
                                : transit.status === 'tight'
                                ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
                                : 'bg-sky-50/70 border-sky-200 hover:border-sky-300'
                              : 'border-dashed border-emerald-300/90 bg-emerald-50/50 hover:bg-emerald-100/70 hover:border-emerald-400 text-emerald-950 text-center cursor-pointer'
                          }`}
                        >
                          {transit ? (
                            <div className="space-y-1.5">
                              {/* Header: Gap hours & duration */}
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 pb-1 border-b border-slate-200/60">
                                <span className="flex items-center gap-1 text-slate-800">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {entry.startTimeStr} – {entry.endTimeStr}
                                </span>
                                <span className="bg-white border border-slate-200 px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-600">
                                  {entry.durationMinutes}m gap
                                </span>
                              </div>

                              {/* Transit Info */}
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-black text-[11px] text-slate-900">
                                  <Car className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span>🚗 ~{transit.durationMinutes} min ({transit.distanceMiles} mi)</span>
                                </span>
                                <a
                                  href={transit.googleMapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] font-bold text-tealBrand-700 hover:text-tealBrand-900 underline flex items-center gap-0.5"
                                  title="Ver ruta en Google Maps"
                                >
                                  Ruta <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>

                              <div className="text-[10px] text-slate-600 font-semibold truncate">
                                {transit.fromCity} ➔ {transit.toCity}
                              </div>

                              {/* Feasibility Alert Badge */}
                              {transit.status === 'conflict' ? (
                                <div className="text-[9px] font-extrabold text-rose-800 bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-300">
                                  🔴 Conflicto: Faltan {Math.abs(transit.bufferMinutes)} min de traslado
                                </div>
                              ) : transit.status === 'tight' ? (
                                <div className="text-[9px] font-extrabold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300">
                                  ⚠️ Traslado justo: {transit.bufferMinutes} min margen restante
                                </div>
                              ) : (
                                <div className="text-[9px] font-extrabold text-emerald-900 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-300">
                                  🟢 Traslado viable: {transit.bufferMinutes} min margen libre
                                </div>
                              )}

                              {/* Button to Book in this free space */}
                              <button
                                type="button"
                                onClick={() => {
                                  setBookingSlotTarget({
                                    slotDate: dateStr,
                                    startTime: minutesToTime24(entry.startMinutes),
                                    endTime: minutesToTime24(Math.min(entry.endMinutes, entry.startMinutes + 120)),
                                    paId: selectedPaId !== 'all' && selectedPaId !== 'unassigned' ? selectedPaId : undefined
                                  });
                                }}
                                className="w-full mt-1 py-1 text-[9px] font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded border border-slate-200 text-center transition-colors cursor-pointer"
                              >
                                + Agendar en este horario libre
                              </button>
                            </div>
                          ) : (
                            /* Standard open slot (morning, evening, or full day) */
                            <div
                              onClick={() => {
                                setBookingSlotTarget({
                                  slotDate: dateStr,
                                  startTime: minutesToTime24(entry.startMinutes),
                                  endTime: minutesToTime24(Math.min(entry.endMinutes, entry.startMinutes + 120)),
                                  paId: selectedPaId !== 'all' && selectedPaId !== 'unassigned' ? selectedPaId : undefined
                                });
                              }}
                              className="py-1 cursor-pointer"
                            >
                              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-emerald-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                                <span>{entry.startTimeStr} – {entry.endTimeStr}</span>
                              </div>
                              <div className="text-[10px] font-bold text-emerald-700 mt-0.5 flex items-center justify-center gap-1">
                                <span>🟢</span>
                                <span>{entry.durationLabel}</span>
                              </div>
                              <div className="text-[9px] font-extrabold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity mt-1 bg-white/90 py-0.5 rounded border border-emerald-200 shadow-2xs">
                                + Click para agendar
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const item = entry.item;
                    const paColor = getPaColor(item.pa);
                    const nextLeg = Object.values(transitLegs).find(leg => leg.fromEventId === item.id);

                    return (
                      <div
                        key={item.id}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({
                            itemId: item.id,
                            slotId: item.slotId,
                            eventId: item.eventId,
                            isTentative: item.isTentativeSlot,
                            isConfirmed: item.isConfirmed,
                            startTime: item.startTime,
                            endTime: item.endTime,
                            title: item.title
                          }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => setActiveItem(item)}
                        className={`rounded-lg p-2.5 cursor-grab active:cursor-grabbing border shadow-2xs hover:shadow-md transition-all text-xs flex flex-col justify-between ${
                          item.isTentativeSlot
                            ? 'bg-amber-50/60 border-amber-200 border-dashed text-slate-800'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                        style={{
                          borderLeftWidth: '5px',
                          borderLeftColor: paColor
                        }}
                        title="Haz clic para ver detalles o arrastra para reprogramar horario"
                      >
                        <div>
                          {/* Time & TZ */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-extrabold text-slate-900 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{format12Hour(item.startTime)} – {format12Hour(item.endTime)}</span>
                            </span>
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                item.timezone === 'CT' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                              }`}>
                                {item.timezone}
                              </span>
                              {item.isTentativeSlot && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTentativeSlot(item);
                                  }}
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors"
                                  title="Eliminar opción tentativa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Line 1: Claim Number & Carrier */}
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono font-bold text-slate-500">
                            <span className="truncate flex items-center gap-1">
                              <span>{item.claim?.claimNumber ? `#${item.claim.claimNumber}` : 'Claim'}</span>
                              {item.claim?.hasTarp && (
                                <span 
                                  title={item.event?.tarpRemovalCoordinated ? '⛺ Tarp Removal Coordinated' : '⛺ Has Tarp (Removal Pending)'}
                                  className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                    item.event?.tarpRemovalCoordinated ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'
                                  }`}
                                >
                                  {item.event?.tarpRemovalCoordinated ? '✓ ⛺' : '⛺'}
                                </span>
                              )}
                            </span>
                            {item.claim?.carrier && (
                              <span className="text-[9px] font-sans font-semibold text-slate-400 truncate max-w-[80px]" title={item.claim.carrier}>
                                {item.claim.carrier}
                              </span>
                            )}
                          </div>

                          {/* Line 2: Insured Name (2 full lines, prominent, bold!) */}
                          <div 
                            className="font-extrabold text-slate-900 text-xs line-clamp-2 leading-snug mt-0.5"
                            title={item.claim?.insured?.name || 'Insured'}
                          >
                            👤 {item.claim?.insured?.name || 'Insured not recorded'}
                          </div>

                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                            {item.eventType}
                          </div>

                          {/* Location */}
                          {item.location && (
                            <div className="text-[10px] text-slate-500 flex items-start gap-1 mt-1 line-clamp-1">
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" />
                              <span>{cleanAddress(item.location)}</span>
                            </div>
                          )}
                        </div>

                        {/* Next leg transit pill if calculated */}
                        {nextLeg && (
                          <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] font-semibold text-slate-500">
                            <span className="flex items-center gap-1 truncate text-slate-700">
                              <Car className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                              <span>🚗 ~{nextLeg.durationMinutes}m a {nextLeg.toCity}</span>
                            </span>
                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded ${
                              nextLeg.status === 'conflict' ? 'bg-rose-100 text-rose-800' :
                              nextLeg.status === 'tight' ? 'bg-amber-100 text-amber-800' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {nextLeg.status === 'conflict' ? 'Conflicto' : `${nextLeg.bufferMinutes}m libre`}
                            </span>
                          </div>
                        )}

                        {/* PA Badge with customized color */}
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" 
                              style={{ backgroundColor: paColor }}
                            />
                            <span className="font-semibold text-slate-800 truncate">
                              {item.pa?.name || 'Sin PA'}
                            </span>
                          </div>
                          {item.isConfirmed ? (
                            <span className="text-[10px] text-emerald-700 font-bold">✓</span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-bold">⏱️</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AGENDA / LIST VIEW */}
      {/* ========================================================================= */}
      {viewType === 'agenda' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CalendarIcon className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-semibold">No scheduled events or inspections match the filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try selecting "All PAs" or including tentative slots.</p>
            </div>
          ) : (
            Array.from(itemsByDateStr.entries())
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([dateStr, items]) => {
                const dayDate = new Date(`${dateStr}T12:00:00`);
                const isCurrentDay = isToday(dayDate);

                return (
                  <div key={dateStr} className="space-y-2">
                    {/* Date Section Header */}
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                      <span className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        isCurrentDay ? 'bg-maroon-800 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {format(dayDate, 'EEEE, MMMM d, yyyy')}
                      </span>
                      {isCurrentDay && (
                        <span className="text-[11px] font-bold text-tealBrand-700">Today</span>
                      )}
                      <span className="text-xs text-slate-400 font-medium ml-auto">
                        {items.length} {items.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>

                    {/* Cards List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.map((item) => {
                        const paColor = getPaColor(item.pa);

                        return (
                          <div
                            key={item.id}
                            onClick={() => setActiveItem(item)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between ${
                              item.isTentativeSlot
                                ? 'bg-amber-50/40 border-amber-200 border-dashed hover:bg-amber-50/70'
                                : 'bg-white hover:bg-slate-50 border-slate-200'
                            }`}
                            style={{
                              borderLeftWidth: '5px',
                              borderLeftColor: paColor
                            }}
                          >
                            <div className="space-y-1.5">
                              {/* Header: Time, Timezone & Status Badge */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-xs font-extrabold text-slate-900">
                                    {format12Hour(item.startTime)} – {format12Hour(item.endTime)}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    item.timezone === 'CT' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                                  }`}>
                                    {item.timezone}
                                  </span>
                                </div>

                                {item.isConfirmed ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Confirmed
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Tentative
                                  </span>
                                )}
                              </div>

                              {/* Claim Info */}
                              <h3 className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif]">
                                {item.claim?.claimNumber ? `Claim #${item.claim.claimNumber}` : 'Claim'}
                                <span className="text-slate-500 font-normal ml-1">· {item.claim?.carrier}</span>
                              </h3>

                              <div className="text-xs font-semibold text-slate-700">
                                👤 {item.claim?.insured?.name || 'Insured'}
                              </div>

                              {item.location && (
                                <div className="text-xs text-slate-500 flex items-start gap-1">
                                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
                                  <span className="line-clamp-2">{cleanAddress(item.location)}</span>
                                </div>
                              )}
                            </div>

                            {/* Footer: PA Badge */}
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span 
                                  className="w-3 h-3 rounded-full shrink-0 shadow-2xs" 
                                  style={{ backgroundColor: paColor }}
                                />
                                <span className="text-xs font-bold text-slate-800">
                                  PA: {item.pa?.name || 'Sin asignar'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.claim) onSelectClaim(item.claim);
                                }}
                                className="text-[11px] font-bold text-maroon-800 hover:text-maroon-900 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                View Claim <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DAY OVERFLOW MODAL (For Month View "+X more") */}
      {/* ========================================================================= */}
      {expandedDay && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 font-['Montserrat',sans-serif]">
                  {format(expandedDay.date, 'EEEE, MMMM d, yyyy')}
                </h3>
                <p className="text-xs text-slate-500">
                  {expandedDay.items.length} inspections & appointments
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedDay(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content List */}
            <div className="p-4 overflow-y-auto space-y-2">
              {expandedDay.items.map((item) => {
                const paColor = getPaColor(item.pa);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setExpandedDay(null);
                      setActiveItem(item);
                    }}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all cursor-pointer shadow-2xs space-y-1"
                    style={{
                      borderLeftWidth: '5px',
                      borderLeftColor: paColor
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-extrabold text-slate-900 text-xs">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{format12Hour(item.startTime)} – {format12Hour(item.endTime)}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                          {item.timezone}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.isConfirmed ? 'Confirmed' : 'Tentative'}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-800">
                      {item.claim?.claimNumber ? `#${item.claim.claimNumber}` : ''} {item.claim?.insured?.name || 'Insured'}
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: paColor }}
                        />
                        <span className="font-semibold text-slate-700">PA: {item.pa?.name || 'Sin PA'}</span>
                      </div>
                      <span className="text-slate-400">{item.eventType}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. QUICK EVENT DETAIL MODAL */}
      {/* ========================================================================= */}
      {activeItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Top Accent Stripe in PA Color */}
            <div 
              className="h-2.5 w-full" 
              style={{ backgroundColor: getPaColor(activeItem.pa) }}
            />

            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                    activeItem.isConfirmed 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {activeItem.isConfirmed ? '✓ Confirmed Inspection' : '⏱️ Tentative Option'}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">
                    {activeItem.eventType}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 font-['Montserrat',sans-serif]">
                  {activeItem.claim?.claimNumber ? `Claim #${activeItem.claim.claimNumber}` : 'Inspection'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {activeItem.claim?.carrier} · Policy: {activeItem.claim?.policyNumber || 'N/A'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Date & Dual Timezone Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-maroon-800" />
                    <span>{formatUsDate(activeItem.dateStr)}</span>
                  </div>
                  <span className="text-tealBrand-800">
                    {format12Hour(activeItem.startTime)} – {format12Hour(activeItem.endTime)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80">
                  🌐 <strong>Florida Timezone:</strong> {formatTimeRangeWithDualTimezone(activeItem.startTime, activeItem.endTime, activeItem.timezone).displayFull}
                </div>
              </div>

              {/* Form to Modify Date & Start/End Times */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>Modificar Horario {activeItem.isTentativeSlot ? 'Tentativo' : 'de la Cita'}</span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                    {activeItem.isTentativeSlot ? 'Opción Tentativa' : 'Confirmada'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Fecha</label>
                    <input
                      type="date"
                      value={editSlotDate}
                      onChange={(e) => setEditSlotDate(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Hora Inicio</label>
                    <input
                      type="time"
                      value={editSlotStartTime}
                      onChange={(e) => setEditSlotStartTime(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Hora Fin</label>
                    <input
                      type="time"
                      value={editSlotEndTime}
                      onChange={(e) => setEditSlotEndTime(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-amber-800 font-medium">
                    🔒 Actualiza de inmediato sin enviar correos automáticos.
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveSlotSchedule}
                    disabled={isSavingSlotSchedule}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingSlotSchedule ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Guardar Nuevo Horario</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Transit Logistics for this Appointment */}
              {activeItem.pa && (
                (() => {
                  const dayItems = (itemsByDateStr.get(activeItem.dateStr) || []).filter(i => i.pa?.id === activeItem.pa?.id);
                  const idx = dayItems.findIndex(i => i.id === activeItem.id);
                  const prevItem = idx > 0 ? dayItems[idx - 1] : null;
                  const nextItem = idx >= 0 && idx < dayItems.length - 1 ? dayItems[idx + 1] : null;
                  const prevLeg = prevItem ? transitLegs[`${prevItem.id}->${activeItem.id}`] : null;
                  const nextLeg = nextItem ? transitLegs[`${activeItem.id}->${nextItem.id}`] : null;

                  if (!prevLeg && !nextLeg && !prevItem && !nextItem) return null;

                  return (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                        <span className="flex items-center gap-1.5">
                          <Car className="w-4 h-4 text-blue-700" />
                          <span>Logística de Transporte del PA</span>
                        </span>
                        <span className="text-[10px] font-semibold text-blue-700">OpenStreetMap / OSRM</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Leg from previous appointment */}
                        <div className="p-2 bg-white rounded-lg border border-blue-100 space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            ⬅️ Desde cita anterior
                          </div>
                          {prevItem ? (
                            <div>
                              <div className="font-bold text-slate-800 truncate">{prevItem.claim?.insured?.name || prevItem.title}</div>
                              <div className="text-[10px] text-slate-500 truncate">{cleanAddress(prevItem.location)}</div>
                              {prevLeg ? (
                                <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-blue-900">
                                  <span>🚗 ~{prevLeg.durationMinutes} min ({prevLeg.distanceMiles} mi)</span>
                                  <a href={prevLeg.googleMapsUrl} target="_blank" rel="noreferrer" className="text-tealBrand-700 hover:underline text-[10px]">
                                    Ruta ↗
                                  </a>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 mt-1">Calculando trayecto...</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic">Primera cita del día</div>
                          )}
                        </div>

                        {/* Leg to next appointment */}
                        <div className="p-2 bg-white rounded-lg border border-blue-100 space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            ➡️ Hacia siguiente cita
                          </div>
                          {nextItem ? (
                            <div>
                              <div className="font-bold text-slate-800 truncate">{nextItem.claim?.insured?.name || nextItem.title}</div>
                              <div className="text-[10px] text-slate-500 truncate">{cleanAddress(nextItem.location)}</div>
                              {nextLeg ? (
                                <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-blue-900">
                                  <span>🚗 ~{nextLeg.durationMinutes} min ({nextLeg.distanceMiles} mi)</span>
                                  <a href={nextLeg.googleMapsUrl} target="_blank" rel="noreferrer" className="text-tealBrand-700 hover:underline text-[10px]">
                                    Ruta ↗
                                  </a>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 mt-1">Calculando trayecto...</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic">Última cita del día</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Assigned PA Card with Color Accent & Quick Reassign */}
              <div 
                className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5 transition-all shadow-xs"
                style={{
                  borderLeftWidth: '5px',
                  borderLeftColor: getPaColor(activeItem.pa)
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Assigned Public Adjuster (PA)</span>
                    {activeItem.claim?.publicAdjuster && activeItem.pa?.id && activeItem.pa.id !== activeItem.claim.publicAdjuster.id && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        Solo este Evento
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChangingPa(prev => !prev)}
                    className="text-[11px] font-bold text-maroon-800 hover:text-maroon-900 underline flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{isChangingPa ? 'Cancelar' : 'Cambiar PA'}</span>
                  </button>
                </div>

                {isChangingPa ? (
                  <div className="pt-2 space-y-2">
                    <p className="text-[11px] text-slate-600 font-medium">
                      Selecciona el PA libre para atender esta inspección:
                    </p>
                    <div className="space-y-1 max-h-52 overflow-y-auto divide-y divide-slate-100 bg-slate-50 rounded-lg p-1.5 border border-slate-200">
                      {eligiblePas.map((pa) => {
                        const isCurrent = activeItem.pa?.id === pa.id;
                        const isClaimGeneralPa = activeItem.claim?.publicAdjusterId === pa.id;
                        return (
                          <button
                            key={pa.id}
                            type="button"
                            disabled={isSavingPa}
                            onClick={() => handleQuickUpdatePa(pa)}
                            className={`w-full text-left p-2 rounded-md text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isCurrent
                                ? 'bg-white shadow-xs font-bold text-maroon-900 border border-maroon-300 ring-1 ring-maroon-200'
                                : 'hover:bg-white text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span 
                                className="w-3 h-3 rounded-full shrink-0 shadow-2xs" 
                                style={{ backgroundColor: pa.colorCode || '#0284c7' }} 
                              />
                              <div className="truncate">
                                <span className="font-semibold block truncate">{pa.name}</span>
                                <span className="text-[10px] text-slate-500 font-normal block">
                                  {formatPaRole(pa.role)} {isClaimGeneralPa ? '· (PA General del Claim)' : ''}
                                </span>
                              </div>
                            </div>
                            {isCurrent && (
                              <span className="text-[10px] text-maroon-800 font-bold shrink-0 ml-2">
                                ✓ Asignado
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {isSavingPa && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                        <Loader2 className="w-3 h-3 animate-spin text-maroon-800" />
                        <span>Guardando nuevo PA en la cita...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {activeItem.pa ? (
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-3.5 h-3.5 rounded-full shadow-2xs shrink-0" 
                            style={{ backgroundColor: activeItem.pa.colorCode || '#0284c7' }}
                          />
                          <div className="truncate">
                            <span className="text-sm font-bold text-slate-900 block truncate">{activeItem.pa.name}</span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              {formatPaRole(activeItem.pa.role)}
                              {activeItem.claim?.publicAdjuster && activeItem.pa.id !== activeItem.claim.publicAdjuster.id && (
                                <span className="text-amber-700 font-semibold ml-1.5">
                                  · PA General del Claim: {activeItem.claim.publicAdjuster.name}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        {activeItem.pa.phone && (
                          <a 
                            href={getNextivaTelUri(activeItem.pa.phone) || `tel:${activeItem.pa.phone}`}
                            className="text-xs font-semibold text-tealBrand-700 hover:text-tealBrand-900 flex items-center gap-1 font-mono shrink-0 ml-2"
                          >
                            <Phone className="w-3 h-3" />
                            {formatPhoneNumber(activeItem.pa.phone)}
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic py-1 flex items-center justify-between">
                        <span>Sin PA asignado a esta inspección.</span>
                        <button
                          type="button"
                          onClick={() => setIsChangingPa(true)}
                          className="text-tealBrand-700 font-bold text-xs underline cursor-pointer"
                        >
                          Asignar ahora
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Insured & Contact */}
              {activeItem.claim?.insured && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Insured Contact
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{activeItem.claim.insured.name}</span>
                    {activeItem.claim.insured.phone && (
                      <a 
                        href={getNextivaTelUri(activeItem.claim.insured.phone) || `tel:${activeItem.claim.insured.phone}`}
                        className="text-xs font-semibold text-tealBrand-700 hover:text-tealBrand-900 flex items-center gap-1 font-mono"
                      >
                        <Phone className="w-3 h-3" />
                        {formatPhoneNumber(activeItem.claim.insured.phone)}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Location & Access Notes */}
              {activeItem.location && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Property Address</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeItem.location)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-tealBrand-600 hover:underline flex items-center gap-1 normal-case text-[11px]"
                    >
                      Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-slate-700 flex items-start gap-1.5 pt-0.5">
                    <MapPin className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                    <span>{cleanAddress(activeItem.location)}</span>
                  </div>

                  {/* Lockbox / Gate */}
                  {(activeItem.event.lockboxCode || activeItem.event.gateCode || activeItem.event.accessInstructions) && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] space-y-0.5 text-slate-600">
                      {activeItem.event.lockboxCode && (
                        <div>🔑 <strong>Lockbox:</strong> {activeItem.event.lockboxCode}</div>
                      )}
                      {activeItem.event.gateCode && (
                        <div>🚪 <strong>Gate Code:</strong> {activeItem.event.gateCode}</div>
                      )}
                      {activeItem.event.accessInstructions && (
                        <div>📝 <strong>Access:</strong> {activeItem.event.accessInstructions}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {activeItem.claim && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClaim(activeItem.claim!);
                      setActiveItem(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-maroon-800 hover:bg-maroon-900 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Claim Detail</span>
                  </button>
                )}

                {onViewInFunnel && (
                  <button
                    type="button"
                    onClick={() => {
                      const claimNum = activeItem.claim?.claimNumber || '';
                      onViewInFunnel(claimNum, activeItem.eventId);
                      setActiveItem(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-tealBrand-700 hover:bg-tealBrand-800 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Ir a gestionar y completar esta cita en el Embudo de Coordinación"
                  >
                    <Kanban className="w-3.5 h-3.5" />
                    <span>Gestionar en Embudo</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onEditEvent(activeItem.event);
                    setActiveItem(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit Event</span>
                </button>

                {/* Botón de Borrar exclusivo para eventos/slots tentativos */}
                {activeItem.isTentativeSlot && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTentativeSlot(activeItem)}
                    disabled={isDeletingSlot}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Eliminar slot u opción tentativa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeletingSlot ? 'Eliminando...' : 'Eliminar Opción Tentativa'}</span>
                  </button>
                )}
              </div>

              {/* Add to Google Calendar Button */}
              {activeItem.isConfirmed && getGoogleCalendarUrl(activeItem.event) && (
                <a
                  href={getGoogleCalendarUrl(activeItem.event) || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-tealBrand-800 bg-tealBrand-50 hover:bg-tealBrand-100 border border-tealBrand-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Add to Google Calendar"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>Google Calendar</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* 6. MODAL PARA AGENDAR EN ESPACIO LIBRE CON ANÁLISIS DE TRANSPORTE */}
      {/* ========================================================================= */}
      {bookingSlotTarget && (
        <ScheduleInFreeSlotModal
          isOpen={Boolean(bookingSlotTarget)}
          onClose={() => setBookingSlotTarget(null)}
          slotDate={bookingSlotTarget.slotDate}
          startTime={bookingSlotTarget.startTime}
          endTime={bookingSlotTarget.endTime}
          preselectedPaId={bookingSlotTarget.paId}
          claims={claims}
          events={events}
          pas={pas}
          onEventCreated={() => {
            setBookingSlotTarget(null);
            if (onDataRefresh) onDataRefresh();
          }}
        />
      )}
    </div>
  );
}

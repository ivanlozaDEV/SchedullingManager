import type { CoordinationEvent, Claim } from '../types';

export type ConflictLevel = 'identical' | 'close' | 'none';

export interface ConflictMatch {
  level: ConflictLevel;
  matchedEventId: string;
  matchedSlotId?: string;
  claimNumber?: string;
  insuredName?: string;
  eventType: string;
  isConfirmed: boolean;
  date: string;
  startTime: string;
  endTime: string;
  gapMinutes?: number;
  stage: string;
  isSameEvent?: boolean;
}

export interface ConflictInfo {
  level: ConflictLevel;
  matches: ConflictMatch[];
  primaryMatch?: ConflictMatch;
  badgeText?: string;
  tooltipText?: string;
}

/**
 * Convierte un string de hora (HH:mm:ss o HH:mm) a minutos desde la medianoche.
 */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().slice(0, 5);
  const parts = clean.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Formatea minutos en formato legible (ej: "30m", "1h", "1h 30m").
 */
export function formatMinutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Obtiene el ID del Public Adjuster asignado a un evento/claim.
 */
export function getEventPaId(event: CoordinationEvent, fallbackClaim?: Claim): string | undefined {
  if (event.claim?.publicAdjusterId) return event.claim.publicAdjusterId;
  if (event.claim?.publicAdjuster?.id) return event.claim.publicAdjuster.id;
  if (fallbackClaim?.publicAdjusterId) return fallbackClaim.publicAdjusterId;
  if (fallbackClaim?.publicAdjuster?.id) return fallbackClaim.publicAdjuster.id;
  const paPart = event.participants?.find(
    (p) => p.participantType === 'public_adjuster' && p.roleType === 'actor' && p.publicAdjusterId
  ) || event.participants?.find(
    (p) => p.participantType === 'public_adjuster' && p.publicAdjusterId
  );
  return paPart?.publicAdjusterId;
}

/**
 * Evalúa si un slot o fecha específica tiene conflicto horario idéntico/solapado (naranja)
 * o de proximidad <= 2 horas (amarillo) con otras citas u opciones del MISMO Public Adjuster.
 */
export function getSlotConflict(
  slot: { slotDate?: string; startTime?: string; endTime?: string; id?: string },
  currentEvent: CoordinationEvent,
  allEvents: CoordinationEvent[],
  fallbackClaim?: Claim
): ConflictInfo {
  const targetDate = slot.slotDate?.trim();
  const targetStart = parseTimeToMinutes(slot.startTime);
  const targetEnd = parseTimeToMinutes(slot.endTime) ?? (targetStart !== null ? targetStart + 120 : null);

  if (!targetDate || targetStart === null || targetEnd === null) {
    return { level: 'none', matches: [] };
  }

  const paId = getEventPaId(currentEvent, fallbackClaim);
  if (!paId) {
    // Si no tiene PA asignado, no se puede cruzar con la agenda de un PA
    return { level: 'none', matches: [] };
  }

  const matches: ConflictMatch[] = [];

  for (const otherEvt of allEvents) {
    const otherPaId = getEventPaId(otherEvt);
    if (!otherPaId || otherPaId !== paId) {
      continue; // No es el mismo PA
    }

    const claimNum = otherEvt.claim?.claimNumber;
    const insName = otherEvt.claim?.insured?.name;
    const evtType = otherEvt.eventType || 'Inspección';

    if (otherEvt.id !== currentEvent.id) {
      // 1. Revisar si otherEvt tiene cita confirmada
      const isConfirmed = otherEvt.coordinationStage === '4_confirmed' || Boolean(otherEvt.finalDate && otherEvt.finalStartTime);
      if (isConfirmed && otherEvt.finalDate && otherEvt.finalStartTime) {
        const cDate = otherEvt.finalDate.trim();
        const cStart = parseTimeToMinutes(otherEvt.finalStartTime);
        const cEnd = parseTimeToMinutes(otherEvt.finalEndTime) ?? (cStart !== null ? cStart + 120 : null);

        if (cDate === targetDate && cStart !== null && cEnd !== null) {
          const isOverlap = targetStart === cStart || (targetStart < cEnd && cStart < targetEnd);
          if (isOverlap) {
            matches.push({
              level: 'identical',
              matchedEventId: otherEvt.id,
              claimNumber: claimNum,
              insuredName: insName,
              eventType: evtType,
              isConfirmed: true,
              date: cDate,
              startTime: otherEvt.finalStartTime,
              endTime: otherEvt.finalEndTime || '',
              stage: otherEvt.coordinationStage,
            });
          } else {
            const gap = Math.max(0, Math.max(targetStart - cEnd, cStart - targetEnd));
            if (gap <= 120) {
              matches.push({
                level: 'close',
                matchedEventId: otherEvt.id,
                claimNumber: claimNum,
                insuredName: insName,
                eventType: evtType,
                isConfirmed: true,
                date: cDate,
                startTime: otherEvt.finalStartTime,
                endTime: otherEvt.finalEndTime || '',
                gapMinutes: gap,
                stage: otherEvt.coordinationStage,
              });
            }
          }
        }
      }

      // 2. Revisar slots activos de otherEvt (si no está confirmado aún)
      if (otherEvt.coordinationStage !== '4_confirmed' && otherEvt.slots && otherEvt.slots.length > 0) {
        for (const s of otherEvt.slots) {
          if (s.status === 'discarded' || s.status === 'pa_rejected') continue;
          const sDate = s.slotDate?.trim();
          const sStart = parseTimeToMinutes(s.startTime);
          const sEnd = parseTimeToMinutes(s.endTime) ?? (sStart !== null ? sStart + 120 : null);

          if (sDate === targetDate && sStart !== null && sEnd !== null) {
            const isOverlap = targetStart === sStart || (targetStart < sEnd && sStart < targetEnd);
            if (isOverlap) {
              matches.push({
                level: 'identical',
                matchedEventId: otherEvt.id,
                matchedSlotId: s.id,
                claimNumber: claimNum,
                insuredName: insName,
                eventType: evtType,
                isConfirmed: false,
                date: sDate,
                startTime: s.startTime,
                endTime: s.endTime,
                stage: otherEvt.coordinationStage,
              });
            } else {
              const gap = Math.max(0, Math.max(targetStart - sEnd, sStart - targetEnd));
              if (gap <= 120) {
                matches.push({
                  level: 'close',
                  matchedEventId: otherEvt.id,
                  matchedSlotId: s.id,
                  claimNumber: claimNum,
                  insuredName: insName,
                  eventType: evtType,
                  isConfirmed: false,
                  date: sDate,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  gapMinutes: gap,
                  stage: otherEvt.coordinationStage,
                });
              }
            }
          }
        }
      }
    } else {
      // Mismo evento: verificar solo si existe un slot idéntico duplicado
      if (slot.id && currentEvent.slots) {
        for (const s of currentEvent.slots) {
          if (s.id === slot.id) continue;
          if (s.status === 'discarded' || s.status === 'pa_rejected') continue;
          const sDate = s.slotDate?.trim();
          const sStart = parseTimeToMinutes(s.startTime);
          const sEnd = parseTimeToMinutes(s.endTime) ?? (sStart !== null ? sStart + 120 : null);

          if (sDate === targetDate && sStart !== null && sEnd !== null) {
            if (targetStart === sStart || (targetStart < sEnd && sStart < targetEnd)) {
              matches.push({
                level: 'identical',
                matchedEventId: currentEvent.id,
                matchedSlotId: s.id,
                claimNumber: claimNum,
                insuredName: insName,
                eventType: evtType,
                isConfirmed: false,
                date: sDate,
                startTime: s.startTime,
                endTime: s.endTime,
                stage: currentEvent.coordinationStage,
                isSameEvent: true,
              });
            }
          }
        }
      }
    }
  }

  if (matches.length === 0) {
    return { level: 'none', matches: [] };
  }

  // Ordenar: primero 'identical' (confirmadas primero), luego 'close' (menor brecha primero)
  matches.sort((a, b) => {
    if (a.level !== b.level) {
      return a.level === 'identical' ? -1 : 1;
    }
    if (a.isConfirmed !== b.isConfirmed) {
      return a.isConfirmed ? -1 : 1;
    }
    return (a.gapMinutes || 0) - (b.gapMinutes || 0);
  });

  const primaryMatch = matches[0];
  const level: ConflictLevel = matches.some((m) => m.level === 'identical') ? 'identical' : 'close';

  let badgeText = '';
  let tooltipText = '';

  const claimLabel = primaryMatch.claimNumber ? `#${primaryMatch.claimNumber}` : 'otro claim';
  const timeLabel = `${primaryMatch.startTime.slice(0, 5)} - ${primaryMatch.endTime.slice(0, 5)}`;

  if (level === 'identical') {
    if (primaryMatch.isSameEvent) {
      badgeText = '⚠️ Horario duplicado en este claim';
      tooltipText = 'Existe otra opción con el mismo horario en este mismo evento.';
    } else {
      const typeDesc = primaryMatch.isConfirmed ? 'Cita confirmada' : 'Opción activa';
      badgeText = `⚠️ Horario ocupado: ${claimLabel}`;
      tooltipText = `${typeDesc} en ${claimLabel} (${timeLabel}) para este mismo PA.`;
    }
  } else {
    const gapStr = formatMinutesToHours(primaryMatch.gapMinutes || 0);
    const typeDesc = primaryMatch.isConfirmed ? 'Cita confirmada' : 'Opción';
    badgeText = `⏱️ Cita cercana (${gapStr}): ${claimLabel}`;
    tooltipText = `${typeDesc} en ${claimLabel} a ${gapStr} de diferencia (${timeLabel}) para este mismo PA.`;
  }

  return {
    level,
    matches,
    primaryMatch,
    badgeText,
    tooltipText,
  };
}

/**
 * Evalúa si la cita confirmada de un evento tiene conflicto con otras citas u opciones del MISMO Public Adjuster.
 */
export function getConfirmedConflict(
  currentEvent: CoordinationEvent,
  allEvents: CoordinationEvent[],
  fallbackClaim?: Claim
): ConflictInfo {
  if (!currentEvent.finalDate || !currentEvent.finalStartTime) {
    return { level: 'none', matches: [] };
  }

  return getSlotConflict(
    {
      slotDate: currentEvent.finalDate,
      startTime: currentEvent.finalStartTime,
      endTime: currentEvent.finalEndTime,
    },
    currentEvent,
    allEvents,
    fallbackClaim
  );
}

/**
 * Devuelve las clases Tailwind para estilizar la caja de fecha según el nivel de conflicto.
 */
export function getConflictBoxStyles(level: ConflictLevel, isSelected = false): {
  containerClass: string;
  badgeClass: string;
} {
  if (level === 'identical') {
    return {
      containerClass: isSelected
        ? 'bg-orange-100/90 border-2 border-orange-500 text-orange-950 ring-2 ring-orange-400'
        : 'bg-orange-50/90 border-2 border-orange-400 text-orange-950',
      badgeClass: 'bg-orange-100 text-orange-900 border border-orange-300 font-bold',
    };
  }

  if (level === 'close') {
    return {
      containerClass: isSelected
        ? 'bg-amber-100/90 border-2 border-amber-500 text-amber-950 ring-2 ring-amber-400'
        : 'bg-amber-50/90 border-2 border-amber-400 text-amber-950',
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
    };
  }

  return {
    containerClass: '',
    badgeClass: '',
  };
}

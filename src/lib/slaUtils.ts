import type { CoordinationEvent } from '../types';

export interface SlaConfig {
  stage1WarningHours: number; // default: 24h
  stage1CriticalHours: number; // default: 48h
  stage2WarningHours: number; // default: 12h
  stage2CriticalHours: number; // default: 24h
  stage3WarningHours: number; // default: 24h
  stage3CriticalHours: number; // default: 48h
}

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  stage1WarningHours: 24,
  stage1CriticalHours: 48,
  stage2WarningHours: 12,
  stage2CriticalHours: 24,
  stage3WarningHours: 24,
  stage3CriticalHours: 48,
};

import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY_SLA_CONFIG = 'ip_scheduling_sla_config';

/**
 * Retrieves the currently saved SLA configuration or default if not set
 */
export function getSlaConfig(): SlaConfig {
  try {
    const raw = localStorage.getItem('ip_cache_sla_config') || localStorage.getItem(STORAGE_KEY_SLA_CONFIG);
    if (!raw) return DEFAULT_SLA_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      stage1WarningHours: Math.max(1, Number(parsed.stage1WarningHours) || DEFAULT_SLA_CONFIG.stage1WarningHours),
      stage1CriticalHours: Math.max(1, Number(parsed.stage1CriticalHours) || DEFAULT_SLA_CONFIG.stage1CriticalHours),
      stage2WarningHours: Math.max(1, Number(parsed.stage2WarningHours) || DEFAULT_SLA_CONFIG.stage2WarningHours),
      stage2CriticalHours: Math.max(1, Number(parsed.stage2CriticalHours) || DEFAULT_SLA_CONFIG.stage2CriticalHours),
      stage3WarningHours: Math.max(1, Number(parsed.stage3WarningHours) || DEFAULT_SLA_CONFIG.stage3WarningHours),
      stage3CriticalHours: Math.max(1, Number(parsed.stage3CriticalHours) || DEFAULT_SLA_CONFIG.stage3CriticalHours),
    };
  } catch {
    return DEFAULT_SLA_CONFIG;
  }
}

/**
 * Persists the SLA configuration to Supabase and cache, and fires a custom event for live reactivity
 */
export async function saveSlaConfig(config: SlaConfig): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_SLA_CONFIG, JSON.stringify(config));
    localStorage.setItem('ip_cache_sla_config', JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('sla_config_updated', { detail: config }));
  } catch (err) {
    console.warn('Failed to save SLA config to localStorage cache:', err);
  }

  if (isSupabaseConfigured) {
    try {
      await supabase.from('app_settings').upsert({
        key: 'sla_config',
        value: config,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    } catch (err) {
      console.warn('Failed to persist SLA config to Supabase app_settings:', err);
    }
  }
}

export interface EventSlaStatus {
  minutesElapsed: number;
  hoursElapsed: number;
  daysElapsed: number;
  timeLabel: string;
  isStalled: boolean;
  alertLevel: 'normal' | 'warning' | 'critical';
  alertMessage: string;
  actionRecommendation: string;
  targetActorType: 'carrier' | 'pa' | 'insured' | 'none';
}

/**
 * Formats a phone number for Nextiva One dialing (E.164 tel: scheme)
 */
export function getNextivaTelUri(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  // If 10 digits without country code, add US +1
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    return `tel:+1${cleaned}`;
  }
  return cleaned.startsWith('+') ? `tel:${cleaned}` : `tel:+${cleaned}`;
}

/**
 * Formats a raw phone string into (XXX) XXX-XXXX for clean display
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Calculates time elapsed in the current coordination stage and determines if it is stalled
 * according to configurable SLA thresholds:
 * - Stage 1 (Waiting for Carrier): Warning at config.stage1WarningHours, Critical at config.stage1CriticalHours
 * - Stage 2 (PA Review): Warning at config.stage2WarningHours, Critical at config.stage2CriticalHours
 * - Stage 3 (Insured Choice): Warning at config.stage3WarningHours, Critical at config.stage3CriticalHours
 */
export function getEventSlaStatus(event: CoordinationEvent, customConfig?: SlaConfig): EventSlaStatus {
  // If event is already confirmed, no stall warnings
  if (event.coordinationStage === '4_confirmed') {
    return {
      minutesElapsed: 0,
      hoursElapsed: 0,
      daysElapsed: 0,
      timeLabel: 'Confirmed',
      isStalled: false,
      alertLevel: 'normal',
      alertMessage: 'Inspection date successfully confirmed',
      actionRecommendation: 'Inspection locked in calendar',
      targetActorType: 'none',
    };
  }

  const config = customConfig || getSlaConfig();

  // Base timestamp is when this stage started (updatedAt or createdAt)
  const stageStartTime = new Date(event.updatedAt || event.createdAt).getTime();
  const now = Date.now();
  const msElapsed = Math.max(0, now - stageStartTime);
  const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
  const hoursElapsed = Math.floor(minutesElapsed / 60);
  const daysElapsed = Math.floor(hoursElapsed / 24);

  let timeLabel = `${minutesElapsed}m`;
  if (hoursElapsed > 0) {
    const remMinutes = minutesElapsed % 60;
    if (daysElapsed > 0) {
      const remHours = hoursElapsed % 24;
      timeLabel = `${daysElapsed}d ${remHours}h`;
    } else {
      timeLabel = remMinutes > 0 ? `${hoursElapsed}h ${remMinutes}m` : `${hoursElapsed}h`;
    }
  }

  // 1. Awaiting Carrier Slots
  if (event.coordinationStage === '1_awaiting_carrier_slots') {
    if (hoursElapsed >= config.stage1CriticalHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'critical',
        alertMessage: `Carrier bottleneck (${timeLabel} waiting for dates). Overdue (Limit: ${config.stage1CriticalHours}h)!`,
        actionRecommendation: 'Call insurance adjuster via Nextiva to demand 3 inspection dates.',
        targetActorType: 'carrier',
      };
    } else if (hoursElapsed >= config.stage1WarningHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'warning',
        alertMessage: `Follow-up needed (${timeLabel} waiting for carrier dates, SLA: ${config.stage1WarningHours}h)`,
        actionRecommendation: 'Send reminder or call adjuster via Nextiva.',
        targetActorType: 'carrier',
      };
    } else {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: false,
        alertLevel: 'normal',
        alertMessage: `Clock running: ${timeLabel} waiting for carrier dates (SLA: ${config.stage1WarningHours}h)`,
        actionRecommendation: `Waiting for carrier dates (SLA: ${config.stage1WarningHours}h-${config.stage1CriticalHours}h).`,
        targetActorType: 'carrier',
      };
    }
  }

  // 2. PA Review (Pick 2 of 3)
  if (event.coordinationStage === '2_pa_review') {
    if (hoursElapsed >= config.stage2CriticalHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'critical',
        alertMessage: `PA review delayed (${timeLabel} pending). Overdue (Limit: ${config.stage2CriticalHours}h)!`,
        actionRecommendation: 'Call Public Adjuster via Nextiva to select 2 available dates.',
        targetActorType: 'pa',
      };
    } else if (hoursElapsed >= config.stage2WarningHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'warning',
        alertMessage: `Awaiting PA selection (${timeLabel}, SLA: ${config.stage2WarningHours}h)`,
        actionRecommendation: 'PA needs to pick 2 of 3 proposed dates.',
        targetActorType: 'pa',
      };
    } else {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: false,
        alertLevel: 'normal',
        alertMessage: `Clock running: ${timeLabel} in PA review (SLA: ${config.stage2WarningHours}h)`,
        actionRecommendation: 'PA reviewing 3 dates offered by carrier.',
        targetActorType: 'pa',
      };
    }
  }

  // 3. Insured Choice (Pick 1 of 2)
  if (event.coordinationStage === '3_insured_selection') {
    if (hoursElapsed >= config.stage3CriticalHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'critical',
        alertMessage: `Client unresponsive (${timeLabel} waiting for choice). Overdue (Limit: ${config.stage3CriticalHours}h)!`,
        actionRecommendation: 'Call Insured client via Nextiva to lock final inspection date.',
        targetActorType: 'insured',
      };
    } else if (hoursElapsed >= config.stage3WarningHours) {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: true,
        alertLevel: 'warning',
        alertMessage: `Pending client choice (${timeLabel}, SLA: ${config.stage3WarningHours}h)`,
        actionRecommendation: 'Send reminder SMS/WhatsApp or call client via Nextiva.',
        targetActorType: 'insured',
      };
    } else {
      return {
        minutesElapsed,
        hoursElapsed,
        daysElapsed,
        timeLabel,
        isStalled: false,
        alertLevel: 'normal',
        alertMessage: `Clock running: ${timeLabel} waiting for client choice (SLA: ${config.stage3WarningHours}h)`,
        actionRecommendation: 'Client has 2 dates to pick from.',
        targetActorType: 'insured',
      };
    }
  }

  return {
    minutesElapsed,
    hoursElapsed,
    daysElapsed,
    timeLabel,
    isStalled: false,
    alertLevel: 'normal',
    alertMessage: `In this stage: ${timeLabel}`,
    actionRecommendation: 'Coordinate next step in funnel.',
    targetActorType: 'none',
  };
}

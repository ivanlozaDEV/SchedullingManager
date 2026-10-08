import { supabase, isSupabaseConfigured } from './supabase';
import { DEFAULT_SLA_CONFIG, type SlaConfig } from './slaUtils';

export const APP_SETTING_KEYS = {
  SLA_CONFIG: 'sla_config',
  CUSTOM_CARRIERS: 'custom_carriers',
  CUSTOM_EVENT_TYPES: 'custom_event_types',
} as const;

export const DEFAULT_CARRIERS = [
  'Citizens Property Insurance',
  'State Farm Florida',
  'Heritage Property & Casualty',
  'Universal Property & Casualty',
  'Tower Hill Insurance',
  'Slide Insurance',
  'Florida Peninsula',
  "People's Trust Insurance",
  'American Integrity',
  'TypTap Insurance',
  'Security First Insurance',
  'Olympus Insurance',
  'Edison Insurance',
  'FedNat Insurance',
];

export const DEFAULT_EVENT_TYPES = [
  'Initial Inspection',
  'Re-Inspection',
  'Appraisal Meeting',
  'Engineer Inspection',
  'Umpire Inspection',
  'EUO (Examination Under Oath)',
  'Mediation',
];

export const appSettingsService = {
  /**
   * Generic fetch of a setting from Supabase with fallback to local storage and default value
   */
  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    // 1. Check Supabase
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();

        if (!error && data?.value !== undefined && data?.value !== null) {
          // Sync to localStorage as offline cache
          try {
            localStorage.setItem(`ip_cache_${key}`, JSON.stringify(data.value));
          } catch {}
          return data.value as T;
        }
      } catch (err) {
        console.warn(`[appSettingsService] Error loading setting ${key} from Supabase:`, err);
      }
    }

    // 2. Check local storage cache
    try {
      const cached = localStorage.getItem(`ip_cache_${key}`) || localStorage.getItem(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch {}

    return defaultValue;
  },

  /**
   * Generic save of a setting to Supabase (upsert) and localStorage cache
   */
  async saveSetting<T>(key: string, value: T): Promise<boolean> {
    // 1. Immediately cache locally
    try {
      localStorage.setItem(`ip_cache_${key}`, JSON.stringify(value));
    } catch {}

    // 2. Persist to Supabase
    if (!isSupabaseConfigured) return false;

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key,
            value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        console.warn(`[appSettingsService] Failed to upsert ${key} to Supabase:`, error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[appSettingsService] Network error saving ${key} to Supabase:`, err);
      return false;
    }
  },

  /**
   * SLA Configuration
   */
  async getSlaConfig(): Promise<SlaConfig> {
    const raw = await this.getSetting<SlaConfig>(APP_SETTING_KEYS.SLA_CONFIG, DEFAULT_SLA_CONFIG);
    return {
      stage1WarningHours: Math.max(1, Number(raw.stage1WarningHours) || DEFAULT_SLA_CONFIG.stage1WarningHours),
      stage1CriticalHours: Math.max(1, Number(raw.stage1CriticalHours) || DEFAULT_SLA_CONFIG.stage1CriticalHours),
      stage2WarningHours: Math.max(1, Number(raw.stage2WarningHours) || DEFAULT_SLA_CONFIG.stage2WarningHours),
      stage2CriticalHours: Math.max(1, Number(raw.stage2CriticalHours) || DEFAULT_SLA_CONFIG.stage2CriticalHours),
      stage3WarningHours: Math.max(1, Number(raw.stage3WarningHours) || DEFAULT_SLA_CONFIG.stage3WarningHours),
      stage3CriticalHours: Math.max(1, Number(raw.stage3CriticalHours) || DEFAULT_SLA_CONFIG.stage3CriticalHours),
    };
  },

  async saveSlaConfig(config: SlaConfig): Promise<boolean> {
    const success = await this.saveSetting(APP_SETTING_KEYS.SLA_CONFIG, config);
    // Broadcast locally for instant reactivity in current window
    window.dispatchEvent(new CustomEvent('sla_config_updated', { detail: config }));
    return success;
  },

  /**
   * Custom Carriers Catalog
   */
  async getCustomCarriers(): Promise<string[]> {
    const carriers = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_CARRIERS, DEFAULT_CARRIERS);
    return Array.from(new Set([...DEFAULT_CARRIERS, ...carriers])).sort();
  },

  async addCustomCarrier(carrierName: string): Promise<string[]> {
    const trimmed = carrierName.trim();
    if (!trimmed) return await this.getCustomCarriers();

    const current = await this.getCustomCarriers();
    if (!current.includes(trimmed)) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIERS, updated);
      window.dispatchEvent(new CustomEvent('custom_carriers_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  /**
   * Custom Event Types Catalog
   */
  async getCustomEventTypes(): Promise<string[]> {
    const types = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, DEFAULT_EVENT_TYPES);
    return Array.from(new Set([...DEFAULT_EVENT_TYPES, ...types])).sort();
  },

  async addCustomEventType(typeName: string): Promise<string[]> {
    const trimmed = typeName.trim();
    if (!trimmed) return await this.getCustomEventTypes();

    const current = await this.getCustomEventTypes();
    if (!current.includes(trimmed)) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, updated);
      window.dispatchEvent(new CustomEvent('custom_event_types_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  /**
   * Realtime subscription for cross-device live sync
   */
  subscribeToChanges(onUpdate: (key: string, value: any) => void) {
    if (!isSupabaseConfigured) return () => {};

    try {
      const channel = supabase
        .channel('app_settings_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings' },
          (payload) => {
            const newRecord = payload.new as { key: string; value: any } | undefined;
            if (newRecord?.key) {
              // Update local cache
              try {
                localStorage.setItem(`ip_cache_${newRecord.key}`, JSON.stringify(newRecord.value));
              } catch {}

              // Fire custom events for components
              if (newRecord.key === APP_SETTING_KEYS.SLA_CONFIG) {
                window.dispatchEvent(new CustomEvent('sla_config_updated', { detail: newRecord.value }));
              } else if (newRecord.key === APP_SETTING_KEYS.CUSTOM_CARRIERS) {
                window.dispatchEvent(new CustomEvent('custom_carriers_updated', { detail: newRecord.value }));
              } else if (newRecord.key === APP_SETTING_KEYS.CUSTOM_EVENT_TYPES) {
                window.dispatchEvent(new CustomEvent('custom_event_types_updated', { detail: newRecord.value }));
              }

              onUpdate(newRecord.key, newRecord.value);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  },
};

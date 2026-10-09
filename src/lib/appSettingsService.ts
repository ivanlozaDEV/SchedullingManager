import { supabase, isSupabaseConfigured } from './supabase';
import { DEFAULT_SLA_CONFIG, type SlaConfig } from './slaUtils';

export const APP_SETTING_KEYS = {
  SLA_CONFIG: 'sla_config',
  CUSTOM_CARRIERS: 'custom_carriers',
  CUSTOM_EVENT_TYPES: 'custom_event_types',
  CUSTOM_PA_ROLES: 'custom_pa_roles',
  CUSTOM_CARRIER_REP_ROLES: 'custom_carrier_rep_roles',
  CUSTOM_ACTOR_ROLES: 'custom_actor_roles',
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

export const DEFAULT_PA_ROLES = [
  'Public Adjuster',
  'Senior Public Adjuster',
  'Managing Director',
  'Assistant / Apprentice',
  'Case Manager',
  'Office Coordinator',
];

export const DEFAULT_CARRIER_REP_ROLES = [
  'Field Adjuster',
  'Desk Adjuster',
  'Independent Adjuster (IA)',
  'Staff Adjuster',
  'Supervisor / Manager',
  'Engineer / Expert',
  'Team Lead',
];

export const DEFAULT_ACTOR_ROLES = [
  'Appraiser',
  'Umpire',
  'Structural Engineer',
  'General Contractor',
  'Leak Detection Specialist',
  'Roof Consultant',
  'Plumbing Expert',
  'Other Specialist',
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
    return Array.from(new Set(carriers.map(c => c.trim()).filter(Boolean))).sort();
  },

  async addCustomCarrier(carrierName: string): Promise<string[]> {
    const trimmed = carrierName.trim();
    if (!trimmed) return await this.getCustomCarriers();

    const current = await this.getCustomCarriers();
    if (!current.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIERS, updated);
      window.dispatchEvent(new CustomEvent('custom_carriers_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  async updateCarrier(oldName: string, newName: string, updateClaims = true): Promise<string[]> {
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error("Carrier name cannot be empty");
    const current = await this.getCustomCarriers();
    const updated = current.map(c => c.toLowerCase() === oldName.toLowerCase() ? trimmedNew : c);
    const cleaned = Array.from(new Set(updated.map(c => c.trim()).filter(Boolean))).sort();
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIERS, cleaned);
    window.dispatchEvent(new CustomEvent('custom_carriers_updated', { detail: cleaned }));

    if (updateClaims && isSupabaseConfigured && oldName !== trimmedNew) {
      try {
        await supabase.from('claims').update({ carrier: trimmedNew }).eq('carrier', oldName);
        await supabase.from('carrier_representatives').update({ carrier_name: trimmedNew }).eq('carrier_name', oldName);
      } catch (err) {
        console.warn('Error updating claims/reps with renamed carrier:', err);
      }
    }
    return cleaned;
  },

  async deleteCarrier(carrierName: string): Promise<string[]> {
    const current = await this.getCustomCarriers();
    const updated = current.filter(c => c.toLowerCase() !== carrierName.trim().toLowerCase());
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIERS, updated);
    window.dispatchEvent(new CustomEvent('custom_carriers_updated', { detail: updated }));
    return updated;
  },

  /**
   * Custom Event Types Catalog
   */
  async getCustomEventTypes(): Promise<string[]> {
    const types = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, DEFAULT_EVENT_TYPES);
    return Array.from(new Set(types.map(t => t.trim()).filter(Boolean))).sort();
  },

  async addCustomEventType(typeName: string): Promise<string[]> {
    const trimmed = typeName.trim();
    if (!trimmed) return await this.getCustomEventTypes();

    const current = await this.getCustomEventTypes();
    if (!current.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, updated);
      window.dispatchEvent(new CustomEvent('custom_event_types_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  async updateEventType(oldName: string, newName: string, updateEvents = true): Promise<string[]> {
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error("Event type cannot be empty");
    const current = await this.getCustomEventTypes();
    const updated = current.map(t => t.toLowerCase() === oldName.toLowerCase() ? trimmedNew : t);
    const cleaned = Array.from(new Set(updated.map(t => t.trim()).filter(Boolean))).sort();
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, cleaned);
    window.dispatchEvent(new CustomEvent('custom_event_types_updated', { detail: cleaned }));

    if (updateEvents && isSupabaseConfigured && oldName !== trimmedNew) {
      try {
        await supabase.from('events').update({ event_type: trimmedNew }).eq('event_type', oldName);
      } catch (err) {
        console.warn('Error updating events with renamed event type:', err);
      }
    }
    return cleaned;
  },

  async deleteEventType(typeName: string): Promise<string[]> {
    const current = await this.getCustomEventTypes();
    const updated = current.filter(t => t.toLowerCase() !== typeName.trim().toLowerCase());
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_EVENT_TYPES, updated);
    window.dispatchEvent(new CustomEvent('custom_event_types_updated', { detail: updated }));
    return updated;
  },

  /**
   * Custom PA Roles Catalog
   */
  async getCustomPaRoles(): Promise<string[]> {
    const roles = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_PA_ROLES, DEFAULT_PA_ROLES);
    return Array.from(new Set(roles.map(r => r.trim()).filter(Boolean))).sort();
  },

  async addCustomPaRole(roleName: string): Promise<string[]> {
    const trimmed = roleName.trim();
    if (!trimmed) return await this.getCustomPaRoles();

    const current = await this.getCustomPaRoles();
    if (!current.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_PA_ROLES, updated);
      window.dispatchEvent(new CustomEvent('custom_pa_roles_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  async updatePaRole(oldName: string, newName: string, updatePas = true): Promise<string[]> {
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error("Role name cannot be empty");
    const current = await this.getCustomPaRoles();
    const updated = current.map(r => r.toLowerCase() === oldName.toLowerCase() ? trimmedNew : r);
    const cleaned = Array.from(new Set(updated.map(r => r.trim()).filter(Boolean))).sort();
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_PA_ROLES, cleaned);
    window.dispatchEvent(new CustomEvent('custom_pa_roles_updated', { detail: cleaned }));

    if (updatePas && isSupabaseConfigured && oldName !== trimmedNew) {
      try {
        await supabase.from('public_adjusters').update({ role: trimmedNew }).eq('role', oldName);
      } catch (err) {
        console.warn('Error updating public adjusters with renamed role:', err);
      }
    }
    return cleaned;
  },

  async deletePaRole(roleName: string): Promise<string[]> {
    const current = await this.getCustomPaRoles();
    const updated = current.filter(r => r.toLowerCase() !== roleName.trim().toLowerCase());
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_PA_ROLES, updated);
    window.dispatchEvent(new CustomEvent('custom_pa_roles_updated', { detail: updated }));
    return updated;
  },

  /**
   * Custom Carrier Rep Roles / Types Catalog
   */
  async getCustomCarrierRepRoles(): Promise<string[]> {
    const roles = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_CARRIER_REP_ROLES, DEFAULT_CARRIER_REP_ROLES);
    return Array.from(new Set(roles.map(r => r.trim()).filter(Boolean))).sort();
  },

  async addCustomCarrierRepRole(roleName: string): Promise<string[]> {
    const trimmed = roleName.trim();
    if (!trimmed) return await this.getCustomCarrierRepRoles();

    const current = await this.getCustomCarrierRepRoles();
    if (!current.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIER_REP_ROLES, updated);
      window.dispatchEvent(new CustomEvent('custom_carrier_rep_roles_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  async updateCarrierRepRole(oldName: string, newName: string, updateReps = true): Promise<string[]> {
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error("Role name cannot be empty");
    const current = await this.getCustomCarrierRepRoles();
    const updated = current.map(r => r.toLowerCase() === oldName.toLowerCase() ? trimmedNew : r);
    const cleaned = Array.from(new Set(updated.map(r => r.trim()).filter(Boolean))).sort();
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIER_REP_ROLES, cleaned);
    window.dispatchEvent(new CustomEvent('custom_carrier_rep_roles_updated', { detail: cleaned }));

    if (updateReps && isSupabaseConfigured && oldName !== trimmedNew) {
      try {
        await supabase.from('carrier_representatives').update({ type_of_representative: trimmedNew }).eq('type_of_representative', oldName);
      } catch (err) {
        console.warn('Error updating carrier representatives with renamed role:', err);
      }
    }
    return cleaned;
  },

  async deleteCarrierRepRole(roleName: string): Promise<string[]> {
    const current = await this.getCustomCarrierRepRoles();
    const updated = current.filter(r => r.toLowerCase() !== roleName.trim().toLowerCase());
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_CARRIER_REP_ROLES, updated);
    window.dispatchEvent(new CustomEvent('custom_carrier_rep_roles_updated', { detail: updated }));
    return updated;
  },

  /**
   * Custom External Actor Roles / Types Catalog
   */
  async getCustomActorRoles(): Promise<string[]> {
    const roles = await this.getSetting<string[]>(APP_SETTING_KEYS.CUSTOM_ACTOR_ROLES, DEFAULT_ACTOR_ROLES);
    return Array.from(new Set(roles.map(r => r.trim()).filter(Boolean))).sort();
  },

  async addCustomActorRole(roleName: string): Promise<string[]> {
    const trimmed = roleName.trim();
    if (!trimmed) return await this.getCustomActorRoles();

    const current = await this.getCustomActorRoles();
    if (!current.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      const updated = Array.from(new Set([...current, trimmed])).sort();
      await this.saveSetting(APP_SETTING_KEYS.CUSTOM_ACTOR_ROLES, updated);
      window.dispatchEvent(new CustomEvent('custom_actor_roles_updated', { detail: updated }));
      return updated;
    }
    return current;
  },

  async updateActorRole(oldName: string, newName: string, updateActors = true): Promise<string[]> {
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error("Role name cannot be empty");
    const current = await this.getCustomActorRoles();
    const updated = current.map(r => r.toLowerCase() === oldName.toLowerCase() ? trimmedNew : r);
    const cleaned = Array.from(new Set(updated.map(r => r.trim()).filter(Boolean))).sort();
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_ACTOR_ROLES, cleaned);
    window.dispatchEvent(new CustomEvent('custom_actor_roles_updated', { detail: cleaned }));

    if (updateActors && isSupabaseConfigured && oldName !== trimmedNew) {
      try {
        await supabase.from('external_actors').update({ type_of_actor: trimmedNew }).eq('type_of_actor', oldName);
      } catch (err) {
        console.warn('Error updating external actors with renamed specialty/role:', err);
      }
    }
    return cleaned;
  },

  async deleteActorRole(roleName: string): Promise<string[]> {
    const current = await this.getCustomActorRoles();
    const updated = current.filter(r => r.toLowerCase() !== roleName.trim().toLowerCase());
    await this.saveSetting(APP_SETTING_KEYS.CUSTOM_ACTOR_ROLES, updated);
    window.dispatchEvent(new CustomEvent('custom_actor_roles_updated', { detail: updated }));
    return updated;
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
              } else if (newRecord.key === APP_SETTING_KEYS.CUSTOM_PA_ROLES) {
                window.dispatchEvent(new CustomEvent('custom_pa_roles_updated', { detail: newRecord.value }));
              } else if (newRecord.key === APP_SETTING_KEYS.CUSTOM_CARRIER_REP_ROLES) {
                window.dispatchEvent(new CustomEvent('custom_carrier_rep_roles_updated', { detail: newRecord.value }));
              } else if (newRecord.key === APP_SETTING_KEYS.CUSTOM_ACTOR_ROLES) {
                window.dispatchEvent(new CustomEvent('custom_actor_roles_updated', { detail: newRecord.value }));
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

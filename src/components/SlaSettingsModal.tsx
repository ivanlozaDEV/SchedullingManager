import { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  RotateCcw, 
  Check, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  UserCheck, 
  Users 
} from 'lucide-react';
import { 
  getSlaConfig, 
  saveSlaConfig, 
  DEFAULT_SLA_CONFIG, 
  type SlaConfig 
} from '../lib/slaUtils';
import { appSettingsService } from '../lib/appSettingsService';

interface SlaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newConfig: SlaConfig) => void;
}

export function SlaSettingsModal({ isOpen, onClose, onSaved }: SlaSettingsModalProps) {
  const [config, setConfig] = useState<SlaConfig>(DEFAULT_SLA_CONFIG);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 1. Initial immediate state from cache
      setConfig(getSlaConfig());
      setErrorMsg(null);
      setSavedSuccess(false);

      // 2. Fetch fresh config from Supabase database
      appSettingsService.getSlaConfig().then((fresh) => {
        setConfig(fresh);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setConfig(DEFAULT_SLA_CONFIG);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (config.stage1WarningHours >= config.stage1CriticalHours) {
      setErrorMsg('Stage 1 (Carrier): Warning hours must be strictly less than Critical/Stalled hours.');
      return;
    }
    if (config.stage2WarningHours >= config.stage2CriticalHours) {
      setErrorMsg('Stage 2 (PA Review): Warning hours must be strictly less than Critical/Stalled hours.');
      return;
    }
    if (config.stage3WarningHours >= config.stage3CriticalHours) {
      setErrorMsg('Stage 3 (Client Choice): Warning hours must be strictly less than Critical/Stalled hours.');
      return;
    }

    setIsSaving(true);
    try {
      await saveSlaConfig(config);
      setSavedSuccess(true);
      onSaved?.(config);
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error saving settings to database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 overflow-hidden">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon-800 text-white flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5 text-tealBrand-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Funnel SLA & Reminder Settings
              </h2>
              <p className="text-xs text-slate-500">
                Configure global warning and bottleneck aging thresholds for each stage of the funnel.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>SLA configuration saved successfully! Funnel updating...</span>
            </div>
          )}

          {/* STAGE 1: CARRIER DATES INTAKE */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Stage 1: Awaiting Carrier Dates
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                Default: 24h / 48h
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Time elapsed since inspection coordination started waiting for the insurance carrier adjuster to offer 3 dates.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Warning Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage1WarningHours}
                    onChange={(e) => setConfig({ ...config, stage1WarningHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers ⚠️ Follow-up reminder</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Critical / Stalled Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage1CriticalHours}
                    onChange={(e) => setConfig({ ...config, stage1CriticalHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers 🚨 Red bottleneck alert & Nextiva CTA</span>
              </div>
            </div>
          </div>

          {/* STAGE 2: PA REVIEW */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-tealBrand-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Stage 2: Public Adjuster Review (Pick 2 of 3)
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                Default: 12h / 24h
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Time elapsed since carrier dates were entered, waiting for the assigned Public Adjuster to approve 2 dates for the client.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Warning Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage2WarningHours}
                    onChange={(e) => setConfig({ ...config, stage2WarningHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers ⚠️ Awaiting PA warning</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Critical / Stalled Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage2CriticalHours}
                    onChange={(e) => setConfig({ ...config, stage2CriticalHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers 🚨 Red bottleneck alert & Nextiva CTA</span>
              </div>
            </div>
          </div>

          {/* STAGE 3: CLIENT CHOICE */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-maroon-800" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Stage 3: Insured Client Selection (Pick 1 of 2)
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                Default: 24h / 48h
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Time elapsed since 2 pre-approved dates were sent to the policyholder, waiting for their final confirmation.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Warning Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage3WarningHours}
                    onChange={(e) => setConfig({ ...config, stage3WarningHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers ⚠️ Pending client choice warning</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Critical / Stalled Threshold (Hours)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="336"
                    value={config.stage3CriticalHours}
                    onChange={(e) => setConfig({ ...config, stage3CriticalHours: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-maroon-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">hrs</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Triggers 🚨 Red bottleneck alert & Nextiva CTA</span>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Defaults (24h/48h/12h)</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-maroon-800 hover:bg-maroon-900 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-tealBrand-300" />
                <span>{isSaving ? 'Saving to Database...' : 'Save SLA Configuration'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

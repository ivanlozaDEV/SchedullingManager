-- ==============================================================================
-- MIGRATION: Global App Settings (Multi-Device Shared Configuration)
-- Stores SLA thresholds, custom carrier catalogs, and custom event types in Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read and write policy
DROP POLICY IF EXISTS "Allow public all app_settings" ON public.app_settings;
CREATE POLICY "Allow public all app_settings" ON public.app_settings FOR ALL USING (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE TRIGGER set_updated_at_app_settings 
BEFORE UPDATE ON public.app_settings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default initial configurations
INSERT INTO public.app_settings (key, value)
VALUES 
  (
    'sla_config', 
    '{"stage1WarningHours": 24, "stage1CriticalHours": 48, "stage2WarningHours": 12, "stage2CriticalHours": 24, "stage3WarningHours": 24, "stage3CriticalHours": 48}'::jsonb
  ),
  (
    'custom_carriers', 
    '["Citizens Property Insurance", "State Farm Florida", "Heritage Property & Casualty", "Universal Property & Casualty", "Tower Hill Insurance", "Slide Insurance", "Florida Peninsula", "People''s Trust Insurance", "American Integrity", "TypTap Insurance", "Security First Insurance", "Olympus Insurance", "Edison Insurance", "FedNat Insurance"]'::jsonb
  ),
  (
    'custom_event_types', 
    '["Initial Inspection", "Re-Inspection", "Appraisal Meeting", "Engineer Inspection", "Umpire Inspection", "EUO (Examination Under Oath)", "Mediation"]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

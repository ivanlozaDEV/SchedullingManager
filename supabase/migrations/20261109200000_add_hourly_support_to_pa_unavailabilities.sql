-- ==============================================================================
-- MIGRATION: 20261109200000_add_hourly_support_to_pa_unavailabilities.sql
-- Description: Adds is_all_day, start_time, and end_time to pa_unavailabilities to support hourly / partial day absences.
-- ==============================================================================

ALTER TABLE public.pa_unavailabilities
  ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS end_time TIME WITHOUT TIME ZONE;

-- Create index for PA date and time lookups
CREATE INDEX IF NOT EXISTS idx_pa_unavailabilities_pa_times 
ON public.pa_unavailabilities(public_adjuster_id, start_date, is_all_day);

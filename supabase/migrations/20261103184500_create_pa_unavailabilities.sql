-- ==============================================================================
-- MIGRATION: 20261103184500_create_pa_unavailabilities.sql
-- Description: Adds pa_unavailabilities table to record time off / absence / blocked dates for Public Adjusters
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.pa_unavailabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_adjuster_id UUID NOT NULL REFERENCES public.public_adjusters(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL DEFAULT 'Vacaciones',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by PA and date range
CREATE INDEX IF NOT EXISTS idx_pa_unavailabilities_pa_dates 
ON public.pa_unavailabilities(public_adjuster_id, start_date, end_date);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at_pa_unavailabilities ON public.pa_unavailabilities;
CREATE TRIGGER set_updated_at_pa_unavailabilities 
BEFORE UPDATE ON public.pa_unavailabilities 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.pa_unavailabilities ENABLE ROW LEVEL SECURITY;

-- Allow public access policy consistent with existing tables
DROP POLICY IF EXISTS "Allow public all pa_unavailabilities" ON public.pa_unavailabilities;
CREATE POLICY "Allow public all pa_unavailabilities" 
ON public.pa_unavailabilities FOR ALL USING (true);

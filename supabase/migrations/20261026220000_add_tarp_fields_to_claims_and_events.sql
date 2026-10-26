-- ==============================================================================
-- MIGRATION: 20261026220000_add_tarp_fields_to_claims_and_events.sql
-- Description: Adds tarp tracking fields to claims and inspection coordination
-- ==============================================================================

-- 1. Add has_tarp to claims
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS has_tarp BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sched_claims_has_tarp ON public.claims(has_tarp);

-- 2. Add tarp removal coordination fields to events (inspections)
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS tarp_removal_coordinated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tarp_removal_coordinated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tarp_removal_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_events_tarp_removal_coord ON public.events(tarp_removal_coordinated);

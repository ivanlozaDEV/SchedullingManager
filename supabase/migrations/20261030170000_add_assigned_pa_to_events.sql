-- ==============================================================================
-- MIGRATION: 20261030170000_add_assigned_pa_to_events.sql
-- Description: Adds public_adjuster_id to events table to allow event-level PA assignment
-- ==============================================================================

-- 1. Add public_adjuster_id to events
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS public_adjuster_id UUID REFERENCES public.public_adjusters(id) ON DELETE SET NULL;

-- 2. Index for performance
CREATE INDEX IF NOT EXISTS idx_events_public_adjuster_id ON public.events(public_adjuster_id);

-- 3. Backfill existing events with claim's public_adjuster_id if currently null
UPDATE public.events e
SET public_adjuster_id = c.public_adjuster_id
FROM public.claims c
WHERE e.claim_id = c.id
  AND e.public_adjuster_id IS NULL
  AND c.public_adjuster_id IS NOT NULL;

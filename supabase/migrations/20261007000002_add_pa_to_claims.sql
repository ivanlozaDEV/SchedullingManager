-- ==============================================================================
-- MIGRATION: 20261007000002_add_pa_to_claims.sql
-- Add assigned Public Adjuster to claims table
-- ==============================================================================

ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS public_adjuster_id UUID REFERENCES public.public_adjusters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claims_public_adjuster_id ON public.claims(public_adjuster_id);

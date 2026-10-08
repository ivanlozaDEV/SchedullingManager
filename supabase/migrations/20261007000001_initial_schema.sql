-- ==============================================================================
-- MIGRATION: 20261007000001_initial_schema.sql
-- Base schema definition for IP Scheduling Manager
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Recyclable Global Directories
CREATE TABLE IF NOT EXISTS public.public_adjusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'adjuster',
    general_availability TEXT,
    color_code TEXT DEFAULT '#0284c7',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.carrier_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_name TEXT NOT NULL,
    name TEXT NOT NULL,
    type_of_representative TEXT NOT NULL DEFAULT 'Field Adjuster',
    phone TEXT,
    email TEXT,
    company TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.external_actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type_of_actor TEXT NOT NULL DEFAULT 'Appraiser',
    company TEXT,
    phone TEXT,
    email TEXT,
    general_availability TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.insureds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    general_availability TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Claims & Junction Tables
CREATE TABLE IF NOT EXISTS public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insured_id UUID REFERENCES public.insureds(id) ON DELETE SET NULL,
    carrier TEXT NOT NULL,
    claim_number TEXT NOT NULL UNIQUE,
    policy_number TEXT,
    type_of_loss TEXT NOT NULL DEFAULT 'Water Damage',
    property_address TEXT NOT NULL,
    city TEXT DEFAULT 'Miami',
    state TEXT DEFAULT 'FL',
    zip_code TEXT,
    date_of_loss DATE,
    status TEXT NOT NULL DEFAULT 'Open',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.claim_carrier_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    carrier_rep_id UUID NOT NULL REFERENCES public.carrier_representatives(id) ON DELETE CASCADE,
    role_in_claim TEXT DEFAULT 'Field Adjuster',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(claim_id, carrier_rep_id)
);

CREATE TABLE IF NOT EXISTS public.claim_external_actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    external_actor_id UUID NOT NULL REFERENCES public.external_actors(id) ON DELETE CASCADE,
    role_in_claim TEXT DEFAULT 'Our Appraiser',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(claim_id, external_actor_id)
);

-- 4. Events & Coordination Funnel
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'Initial Inspection',
    status TEXT NOT NULL DEFAULT 'coordinating',
    coordination_stage TEXT NOT NULL DEFAULT '1_awaiting_carrier_slots',
    carrier_slots_deadline TIMESTAMPTZ,
    final_date DATE,
    final_start_time TIME,
    final_end_time TIME,
    location TEXT NOT NULL,
    lockbox_code TEXT,
    gate_code TEXT,
    access_instructions TEXT,
    notice_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.event_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    rejection_reason TEXT,
    deadline_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    participant_type TEXT NOT NULL,
    role_type TEXT NOT NULL DEFAULT 'actor',
    public_adjuster_id UUID REFERENCES public.public_adjusters(id) ON DELETE SET NULL,
    carrier_rep_id UUID REFERENCES public.carrier_representatives(id) ON DELETE SET NULL,
    external_actor_id UUID REFERENCES public.external_actors(id) ON DELETE SET NULL,
    insured_id UUID REFERENCES public.insureds(id) ON DELETE SET NULL,
    custom_name TEXT,
    custom_email TEXT,
    custom_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Coordination Logs
CREATE TABLE IF NOT EXISTS public.coordination_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    contact_target TEXT NOT NULL,
    contact_target_name TEXT,
    channel TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_events_claim_id ON public.events(claim_id);
CREATE INDEX IF NOT EXISTS idx_events_stage ON public.events(coordination_stage);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_final_schedule ON public.events(final_date, final_start_time);
CREATE INDEX IF NOT EXISTS idx_event_slots_event_id ON public.event_slots(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON public.event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_coordination_logs_event_id ON public.coordination_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_claims_claim_number ON public.claims(claim_number);

-- 7. Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers idempotentes
DROP TRIGGER IF EXISTS set_updated_at_pa ON public.public_adjusters;
CREATE TRIGGER set_updated_at_pa BEFORE UPDATE ON public.public_adjusters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_carrier_rep ON public.carrier_representatives;
CREATE TRIGGER set_updated_at_carrier_rep BEFORE UPDATE ON public.carrier_representatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_external_actor ON public.external_actors;
CREATE TRIGGER set_updated_at_external_actor BEFORE UPDATE ON public.external_actors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_insureds ON public.insureds;
CREATE TRIGGER set_updated_at_insureds BEFORE UPDATE ON public.insureds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_claims ON public.claims;
CREATE TRIGGER set_updated_at_claims BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_events ON public.events;
CREATE TRIGGER set_updated_at_events BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Row Level Security (RLS)
ALTER TABLE public.public_adjusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insureds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_carrier_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_external_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_logs ENABLE ROW LEVEL SECURITY;

-- Políticas idempotentes (DROP IF EXISTS + CREATE)
DROP POLICY IF EXISTS "Allow public all public_adjusters" ON public.public_adjusters;
CREATE POLICY "Allow public all public_adjusters" ON public.public_adjusters FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all carrier_representatives" ON public.carrier_representatives;
CREATE POLICY "Allow public all carrier_representatives" ON public.carrier_representatives FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all external_actors" ON public.external_actors;
CREATE POLICY "Allow public all external_actors" ON public.external_actors FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all insureds" ON public.insureds;
CREATE POLICY "Allow public all insureds" ON public.insureds FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all claims" ON public.claims;
CREATE POLICY "Allow public all claims" ON public.claims FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all claim_carrier_representatives" ON public.claim_carrier_representatives;
CREATE POLICY "Allow public all claim_carrier_representatives" ON public.claim_carrier_representatives FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all claim_external_actors" ON public.claim_external_actors;
CREATE POLICY "Allow public all claim_external_actors" ON public.claim_external_actors FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all events" ON public.events;
CREATE POLICY "Allow public all events" ON public.events FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all event_slots" ON public.event_slots;
CREATE POLICY "Allow public all event_slots" ON public.event_slots FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all event_participants" ON public.event_participants;
CREATE POLICY "Allow public all event_participants" ON public.event_participants FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all coordination_logs" ON public.coordination_logs;
CREATE POLICY "Allow public all coordination_logs" ON public.coordination_logs FOR ALL USING (true);

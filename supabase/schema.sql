-- ==============================================================================
-- IP SCHEDULING MANAGER: DEFINITIVE DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Specialized for Public Insurance Adjusters
-- Features: Recyclable Actors, Coordination Funnel (Kanban), Logs & Deadlines
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clean previous versions if needed
DROP TABLE IF EXISTS public.coordination_logs CASCADE;
DROP TABLE IF EXISTS public.event_participants CASCADE;
DROP TABLE IF EXISTS public.event_slots CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.claim_external_actors CASCADE;
DROP TABLE IF EXISTS public.claim_carrier_representatives CASCADE;
DROP TABLE IF EXISTS public.claims CASCADE;
DROP TABLE IF EXISTS public.insureds CASCADE;
DROP TABLE IF EXISTS public.external_actors CASCADE;
DROP TABLE IF EXISTS public.carrier_representatives CASCADE;
DROP TABLE IF EXISTS public.public_adjusters CASCADE;

-- ==============================================================================
-- 2. RECYCLABLE GLOBAL DIRECTORIES (CATÁLOGOS REUTILIZABLES)
-- ==============================================================================

-- A. Public Adjusters (Equipo interno de ajustadores)
CREATE TABLE public.public_adjusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'adjuster', -- 'adjuster', 'senior_adjuster', 'director'
    general_availability TEXT, -- Ej: 'Lunes a Viernes mañanas', 'Zona Miami-Dade'
    color_code TEXT DEFAULT '#0284c7',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. Carrier Representatives (Ajustadores y peritos de las compañías de seguros)
CREATE TABLE public.carrier_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_name TEXT NOT NULL, -- 'Citizens', 'State Farm', 'Heritage', 'Universal', etc.
    name TEXT NOT NULL,
    type_of_representative TEXT NOT NULL DEFAULT 'Field Adjuster', -- 'Field Adjuster', 'Desk Adjuster', 'Independent Adjuster', 'Engineer'
    phone TEXT,
    email TEXT,
    company TEXT, -- Si trabaja para una firma independiente (ej: Sedgwick, Crawford)
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. External Actors (Terceros contratados: Appraisers, Umpires, Ingenieros, etc.)
CREATE TABLE public.external_actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type_of_actor TEXT NOT NULL DEFAULT 'Appraiser', -- 'Appraiser', 'Umpire', 'Structural Engineer', 'Contractor', 'Leak Detection'
    company TEXT,
    phone TEXT,
    email TEXT,
    general_availability TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- D. Insureds (Clientes / Asegurados)
CREATE TABLE public.insureds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    general_availability TEXT, -- Ej: 'Solo sábados o tardes después de las 3pm'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. CLAIMS & JUNCTION TABLES (RECLAMOS Y ASIGNACIONES)
-- ==============================================================================

-- Reclamos (Expediente principal)
CREATE TABLE public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insured_id UUID REFERENCES public.insureds(id) ON DELETE SET NULL,
    carrier TEXT NOT NULL,
    claim_number TEXT NOT NULL UNIQUE,
    policy_number TEXT,
    type_of_loss TEXT NOT NULL DEFAULT 'Water Damage', -- 'Water Damage', 'Fire & Smoke', 'Hurricane / Wind', 'Hail / Roof', etc.
    property_address TEXT NOT NULL,
    city TEXT DEFAULT 'Miami',
    state TEXT DEFAULT 'FL',
    zip_code TEXT,
    date_of_loss DATE,
    status TEXT NOT NULL DEFAULT 'Open', -- 'Open', 'Under Review', 'Appraisal', 'Settled', 'Closed'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Representantes de Carrier vinculados a este reclamo
CREATE TABLE public.claim_carrier_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    carrier_rep_id UUID NOT NULL REFERENCES public.carrier_representatives(id) ON DELETE CASCADE,
    role_in_claim TEXT DEFAULT 'Field Adjuster',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(claim_id, carrier_rep_id)
);

-- Actores externos vinculados a este reclamo (ej: Nuestro Appraiser, Umpire)
CREATE TABLE public.claim_external_actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    external_actor_id UUID NOT NULL REFERENCES public.external_actors(id) ON DELETE CASCADE,
    role_in_claim TEXT DEFAULT 'Our Appraiser', -- 'Our Appraiser', 'Opposing Appraiser', 'Umpire', 'Engineer'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(claim_id, external_actor_id)
);

-- ==============================================================================
-- 4. EVENTS & THE COORDINATION FUNNEL (EVENTOS Y EMBUDO)
-- ==============================================================================

-- Eventos / Inspecciones (Motor del Kanban)
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'Initial Inspection', 
    -- 'Initial Inspection', 'Carrier Re-Inspection', 'Appraisal Meeting', 'Umpire Inspection', 'Contractor Walkthrough'
    status TEXT NOT NULL DEFAULT 'coordinating', -- 'coordinating', 'scheduled', 'completed', 'cancelled', 'rescheduled'
    coordination_stage TEXT NOT NULL DEFAULT '1_awaiting_carrier_slots',
    -- '1_awaiting_carrier_slots': Esperando que carrier proponga fechas
    -- '2_pa_review': Carrier dio opciones, esperando que PA filtre
    -- '3_insured_selection': PA filtró, esperando que cliente escoja 1
    -- '4_confirmed': Cita confirmada y agendada
    carrier_slots_deadline TIMESTAMPTZ, -- Fecha límite del Carrier para responder (SLA #6)
    final_date DATE,
    final_start_time TIME,
    final_end_time TIME,
    location TEXT NOT NULL,
    lockbox_code TEXT,
    gate_code TEXT,
    access_instructions TEXT, -- Instrucciones especiales de acceso a propiedad
    notice_sent_at TIMESTAMPTZ, -- Cuándo se envió el Notice of Inspection (#7)
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slots de Fechas y Tiempos para el Embudo
CREATE TABLE public.event_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    -- 'proposed': Propuesto por el Carrier
    -- 'pa_accepted': Pre-aprobado por el Public Adjuster
    -- 'pa_rejected': Rechazado por el PA
    -- 'insured_chosen': Seleccionado por el Asegurado (ganador)
    -- 'discarded': Descartado
    rejection_reason TEXT,
    deadline_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participantes del Evento: Actores vs Informados
CREATE TABLE public.event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    participant_type TEXT NOT NULL, -- 'insured', 'public_adjuster', 'carrier_representative', 'external_actor', 'office'
    role_type TEXT NOT NULL DEFAULT 'actor', -- 'actor' (presencial obligatorio), 'informed' (solo se le notifica)
    public_adjuster_id UUID REFERENCES public.public_adjusters(id) ON DELETE SET NULL,
    carrier_rep_id UUID REFERENCES public.carrier_representatives(id) ON DELETE SET NULL,
    external_actor_id UUID REFERENCES public.external_actors(id) ON DELETE SET NULL,
    insured_id UUID REFERENCES public.insureds(id) ON DELETE SET NULL,
    custom_name TEXT,
    custom_email TEXT,
    custom_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. COORDINATION LOGS (BITÁCORA DE INTENTOS DE CONTACTO #3)
-- ==============================================================================

CREATE TABLE public.coordination_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    contact_target TEXT NOT NULL, -- 'insured', 'carrier_rep', 'pa', 'external_actor'
    contact_target_name TEXT,
    channel TEXT NOT NULL, -- 'call_unanswered', 'call_answered', 'voicemail', 'whatsapp', 'sms', 'email'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. INDEXES FOR HIGH PERFORMANCE & CONFLICT DETECTION (#4)
-- ==============================================================================

CREATE INDEX idx_events_claim_id ON public.events(claim_id);
CREATE INDEX idx_events_stage ON public.events(coordination_stage);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_final_schedule ON public.events(final_date, final_start_time);
CREATE INDEX idx_event_slots_event_id ON public.event_slots(event_id);
CREATE INDEX idx_event_participants_event_id ON public.event_participants(event_id);
CREATE INDEX idx_coordination_logs_event_id ON public.coordination_logs(event_id);
CREATE INDEX idx_claims_claim_number ON public.claims(claim_number);

-- ==============================================================================
-- 7. TRIGGER: AUTO-UPDATE updated_at
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_pa BEFORE UPDATE ON public.public_adjusters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_updated_at_carrier_rep BEFORE UPDATE ON public.carrier_representatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_updated_at_external_actor BEFORE UPDATE ON public.external_actors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_updated_at_insureds BEFORE UPDATE ON public.insureds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_updated_at_claims BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_updated_at_events BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

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

-- Políticas de lectura y escritura completas para el cliente Supabase
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

-- ==============================================================================
-- 9. GLOBAL APP SETTINGS (CONFIGURACIONES GLOBALES MULTI-DISPOSITIVO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all app_settings" ON public.app_settings;
CREATE POLICY "Allow public all app_settings" ON public.app_settings FOR ALL USING (true);

CREATE OR REPLACE TRIGGER set_updated_at_app_settings 
BEFORE UPDATE ON public.app_settings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


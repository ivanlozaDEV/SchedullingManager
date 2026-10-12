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

-- ==============================================================
-- DATA BACKUP EXPORTED FROM PREVIOUS SUPABASE PROJECT
-- Run this AFTER running schema.sql
-- ==============================================================

-- Table: public.public_adjusters (5 rows)
INSERT INTO public.public_adjusters (id, name, phone, email, role, general_availability, color_code, is_active, created_at, updated_at) VALUES ('1fe92ae5-4292-46eb-9b3b-e2f94d8a7dc2', 'Ivan Hernandez', '(305) 877-8126', 'ivan@ipadjustinggroup.com', 'adjuster', NULL, '#0284c7', true, '2026-10-09T17:41:19.84128+00:00', '2026-10-09T17:42:59.830989+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.public_adjusters (id, name, phone, email, role, general_availability, color_code, is_active, created_at, updated_at) VALUES ('09e38a23-c351-4689-a348-d714e458b31f', 'Peter Ramos', '(305) 484-5829', 'peter@ipadjustinggroup.com', 'adjuster', NULL, '#0891b2', true, '2026-10-08T18:02:38.11125+00:00', '2026-10-09T18:21:12.82782+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.public_adjusters (id, name, phone, email, role, general_availability, color_code, is_active, created_at, updated_at) VALUES ('06fb1ddb-a599-45b2-a2cd-3fbe0d084e48', 'Joshua Cabral', '7862018896', 'joshua@ipadjustinggroup.com', 'adjuster', NULL, '#0284c7', true, '2026-10-09T18:23:02.838251+00:00', '2026-10-09T18:23:02.838251+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.public_adjusters (id, name, phone, email, role, general_availability, color_code, is_active, created_at, updated_at) VALUES ('2eec7893-21b1-44b2-a7bb-029a72d34fea', 'Juan Gutierrez', '5613794256', 'juan.ipadjusting@gmail.com', 'adjuster', NULL, '#0284c7', true, '2026-10-09T18:24:08.270176+00:00', '2026-10-09T18:24:08.270176+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.public_adjusters (id, name, phone, email, role, general_availability, color_code, is_active, created_at, updated_at) VALUES ('b856e9f7-ff92-4759-b9a1-cd950a36cab0', 'IP admin', '(772) 282-0862', 'admin@ipadjustinggroup.com', 'Assistant', NULL, '#475569', true, '2026-10-09T17:35:26.22262+00:00', '2026-10-09T19:08:08.381877+00:00') ON CONFLICT DO NOTHING;

-- Table: public.carrier_representatives (1 rows)
INSERT INTO public.carrier_representatives (id, carrier_name, name, type_of_representative, phone, email, company, notes, created_at, updated_at) VALUES ('b8d01256-4ab9-4f17-87d5-0782db63f58f', 'Slide', 'Miracle Meggs', 'Desk Adjuster', '(727) 614-0357', 'mmiggs@slideinsurance.com', '', '', '2026-10-09T17:33:05.219149+00:00', '2026-10-09T17:33:05.219149+00:00') ON CONFLICT DO NOTHING;

-- Table: public.insureds (2 rows)
INSERT INTO public.insureds (id, name, phone, email, general_availability, notes, created_at, updated_at) VALUES ('48b23ec9-ab7b-4a79-b3c9-14d9cafcfef9', 'Christian Aguirre', '305-720-0931', 'aguirre.christian07@gmail.com', NULL, NULL, '2026-10-09T17:31:09.548689+00:00', '2026-10-09T17:31:09.548689+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.insureds (id, name, phone, email, general_availability, notes, created_at, updated_at) VALUES ('07e3179f-7edc-4814-9bf6-9edbd85ffb42', 'Tommy & Bettye Kuhn', '561-792-1737', 'BETTYEKUHN16@gmail.com', NULL, NULL, '2026-10-09T17:41:19.723273+00:00', '2026-10-09T17:41:19.723273+00:00') ON CONFLICT DO NOTHING;

-- Table: public.claims (2 rows)
INSERT INTO public.claims (id, insured_id, carrier, claim_number, policy_number, type_of_loss, property_address, city, state, zip_code, date_of_loss, status, notes, created_at, updated_at, public_adjuster_id) VALUES ('69bf16b4-afa9-41c8-9be7-5d9b5dddeb16', '48b23ec9-ab7b-4a79-b3c9-14d9cafcfef9', 'Slide', '202608048936', 'SIC3418650', 'AWD', '5201 SW 31ST AVE APT 245 Fort Lauderdale, FL 33312', 'Miami', 'FL', NULL, '2026-08-29', 'Open', 'Imported via Google Sheets sync on 2026-10-09T17:31:09.630Z', '2026-10-09T17:31:09.684352+00:00', '2026-10-09T17:31:09.684352+00:00', '09e38a23-c351-4689-a348-d714e458b31f') ON CONFLICT DO NOTHING;
INSERT INTO public.claims (id, insured_id, carrier, claim_number, policy_number, type_of_loss, property_address, city, state, zip_code, date_of_loss, status, notes, created_at, updated_at, public_adjuster_id) VALUES ('e0772e1d-25c3-4c7e-b48f-4972e0a20cb7', '07e3179f-7edc-4814-9bf6-9edbd85ffb42', 'State Farm', '59-0N7J-316', '79-E5-2457-6', 'Wind/Hail', '17562 68th St N Loxahatchee, FL 33470', 'Miami', 'FL', NULL, '2026-08-20', 'Open', 'Imported via Google Sheets sync on 2026-10-09T17:41:19.848Z', '2026-10-09T17:41:19.910051+00:00', '2026-10-09T17:41:19.910051+00:00', '1fe92ae5-4292-46eb-9b3b-e2f94d8a7dc2') ON CONFLICT DO NOTHING;

-- Table: public.claim_carrier_representatives (1 rows)
INSERT INTO public.claim_carrier_representatives (id, claim_id, carrier_rep_id, role_in_claim, is_primary, created_at) VALUES ('cf3f5f5f-cf49-47d6-a430-397b38a258f6', '69bf16b4-afa9-41c8-9be7-5d9b5dddeb16', 'b8d01256-4ab9-4f17-87d5-0782db63f58f', 'Desk Adjuster', true, '2026-10-09T17:33:05.472354+00:00') ON CONFLICT DO NOTHING;

-- Table: public.events (2 rows)
INSERT INTO public.events (id, claim_id, event_type, status, coordination_stage, carrier_slots_deadline, final_date, final_start_time, final_end_time, location, lockbox_code, gate_code, access_instructions, notice_sent_at, notes, created_at, updated_at) VALUES ('a26d3e29-052f-4942-8e0d-f4dd42e300f1', 'e0772e1d-25c3-4c7e-b48f-4972e0a20cb7', 'Mediation', 'coordinating', '1_awaiting_carrier_slots', NULL, NULL, NULL, NULL, '17562 68th St N Loxahatchee, FL 33470, Miami, FL', NULL, NULL, NULL, NULL, '', '2026-10-09T17:44:02.424753+00:00', '2026-10-09T17:44:02.424753+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.events (id, claim_id, event_type, status, coordination_stage, carrier_slots_deadline, final_date, final_start_time, final_end_time, location, lockbox_code, gate_code, access_instructions, notice_sent_at, notes, created_at, updated_at) VALUES ('b68ebee4-0652-43bb-9c3c-45eaad097c05', '69bf16b4-afa9-41c8-9be7-5d9b5dddeb16', 'Recorded Statement', 'coordinating', '1_awaiting_carrier_slots', NULL, NULL, NULL, NULL, '5201 SW 31ST AVE APT 245 Fort Lauderdale, FL 33312, Miami, FL', NULL, NULL, NULL, NULL, '', '2026-10-09T17:35:35.085287+00:00', '2026-10-09T19:08:30.010399+00:00') ON CONFLICT DO NOTHING;

-- Table: public.event_participants (8 rows)
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('8949cb5d-2baa-40bd-add5-14541dd387d4', 'a26d3e29-052f-4942-8e0d-f4dd42e300f1', 'insured', 'actor', NULL, NULL, NULL, '07e3179f-7edc-4814-9bf6-9edbd85ffb42', NULL, NULL, NULL, '2026-10-09T17:44:02.572534+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('d762e6dd-453a-4574-b073-d740a1ea846b', 'a26d3e29-052f-4942-8e0d-f4dd42e300f1', 'public_adjuster', 'actor', '1fe92ae5-4292-46eb-9b3b-e2f94d8a7dc2', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-09T17:44:02.572534+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('563849ca-68dc-457a-84b1-a8ab2953ac33', 'a26d3e29-052f-4942-8e0d-f4dd42e300f1', 'public_adjuster', 'informed', 'b856e9f7-ff92-4759-b9a1-cd950a36cab0', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-09T17:44:02.572534+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('9c5925d7-2bba-4200-a3fa-03923863298f', 'b68ebee4-0652-43bb-9c3c-45eaad097c05', 'insured', 'actor', NULL, NULL, NULL, '48b23ec9-ab7b-4a79-b3c9-14d9cafcfef9', NULL, NULL, NULL, '2026-10-09T19:08:30.255773+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('9dc6e51c-72f4-4863-9002-c98adb03de0c', 'b68ebee4-0652-43bb-9c3c-45eaad097c05', 'public_adjuster', 'actor', '09e38a23-c351-4689-a348-d714e458b31f', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-09T19:08:30.255773+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('64065103-d10b-41d7-aa41-2665a1effb08', 'b68ebee4-0652-43bb-9c3c-45eaad097c05', 'carrier_representative', 'actor', NULL, 'b8d01256-4ab9-4f17-87d5-0782db63f58f', NULL, NULL, NULL, NULL, NULL, '2026-10-09T19:08:30.255773+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('504b33df-5b05-4d19-91a1-ae446849b6a1', 'b68ebee4-0652-43bb-9c3c-45eaad097c05', 'public_adjuster', 'informed', '1fe92ae5-4292-46eb-9b3b-e2f94d8a7dc2', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-09T19:08:30.255773+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.event_participants (id, event_id, participant_type, role_type, public_adjuster_id, carrier_rep_id, external_actor_id, insured_id, custom_name, custom_email, custom_phone, created_at) VALUES ('700cf1c2-d547-4aea-884b-f78c142db7bd', 'b68ebee4-0652-43bb-9c3c-45eaad097c05', 'public_adjuster', 'informed', 'b856e9f7-ff92-4759-b9a1-cd950a36cab0', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-09T19:08:30.255773+00:00') ON CONFLICT DO NOTHING;

-- Table: public.app_settings (4 rows)
INSERT INTO public.app_settings (key, value, created_at, updated_at) VALUES ('custom_carriers', '["Citizens Property Insurance","State Farm Florida","Heritage Property & Casualty","Universal Property & Casualty","Tower Hill Insurance","Slide Insurance","Florida Peninsula","People''s Trust Insurance","American Integrity","TypTap Insurance","Security First Insurance","Olympus Insurance","Edison Insurance","FedNat Insurance"]'::jsonb, '2026-10-08T15:05:21.377268+00:00', '2026-10-08T15:05:21.377268+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings (key, value, created_at, updated_at) VALUES ('custom_event_types', '["Initial Inspection","Re-Inspection","Appraisal Meeting","Engineer Inspection","Umpire Inspection","EUO (Examination Under Oath)","Mediation"]'::jsonb, '2026-10-08T15:05:21.377268+00:00', '2026-10-08T15:05:21.377268+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings (key, value, created_at, updated_at) VALUES ('sla_config', '{"stage1WarningHours":24,"stage2WarningHours":12,"stage3WarningHours":12,"stage1CriticalHours":48,"stage2CriticalHours":24,"stage3CriticalHours":24}'::jsonb, '2026-10-08T15:05:21.377268+00:00', '2026-10-09T17:36:47.44227+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings (key, value, created_at, updated_at) VALUES ('custom_pa_roles', '["Assistant","Case Manager","Managing Director","Office Coordinator","Public Adjuster","Senior Public Adjuster"]'::jsonb, '2026-10-09T19:07:06.346999+00:00', '2026-10-09T19:07:12.673568+00:00') ON CONFLICT DO NOTHING;


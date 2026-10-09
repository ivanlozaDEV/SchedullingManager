import { supabase, isSupabaseConfigured } from './supabase';
import type { 
  PublicAdjuster, 
  CarrierRepresentative, 
  ExternalActor, 
  Insured,
  Claim, 
  CoordinationEvent, 
  CoordinationLog,
  SlotStatus,
  CoordinationStage,
  EventStatus,
  ParticipantRole
} from '../types';

export const schedulingService = {
  // 1. Obtener Public Adjusters
  async getPublicAdjusters(): Promise<PublicAdjuster[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('public_adjusters')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching public_adjusters:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      role: row.role,
      generalAvailability: row.general_availability || '',
      colorCode: row.color_code || '#0284c7',
      isActive: row.is_active,
    }));
  },

  // 2. Obtener Carrier Representatives
  async getCarrierReps(): Promise<CarrierRepresentative[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('carrier_representatives')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching carrier_representatives:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      carrierName: row.carrier_name,
      name: row.name,
      typeOfRepresentative: row.type_of_representative,
      phone: row.phone || '',
      email: row.email || '',
      company: row.company || '',
      notes: row.notes || '',
    }));
  },

  // 3. Obtener External Actors
  async getExternalActors(): Promise<ExternalActor[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('external_actors')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching external_actors:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      typeOfActor: row.type_of_actor,
      company: row.company || '',
      phone: row.phone || '',
      email: row.email || '',
      generalAvailability: row.general_availability || '',
      notes: row.notes || '',
    }));
  },

  // 3.1. Obtener Insureds (Clientes)
  async getInsureds(): Promise<Insured[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('insureds')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching insureds:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      generalAvailability: row.general_availability || '',
      notes: row.notes || '',
    }));
  },

  // 4. Obtener Claims con Insured, Carrier Reps y External Actors
  async getClaims(): Promise<Claim[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('claims')
      .select(`
        *,
        insured:insureds (*),
        public_adjuster:public_adjusters (*),
        carrier_reps:claim_carrier_representatives (
          *,
          carrier_rep:carrier_representatives (*)
        ),
        external_actors:claim_external_actors (
          *,
          external_actor:external_actors (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching claims:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      insuredId: row.insured_id,
      publicAdjusterId: row.public_adjuster_id,
      carrier: row.carrier,
      claimNumber: row.claim_number,
      policyNumber: row.policy_number || '',
      typeOfLoss: row.type_of_loss,
      propertyAddress: row.property_address,
      city: row.city || '',
      state: row.state || 'FL',
      zipCode: row.zip_code || '',
      dateOfLoss: row.date_of_loss,
      status: row.status,
      notes: row.notes || '',
      insured: row.insured ? {
        id: row.insured.id,
        name: row.insured.name,
        phone: row.insured.phone || '',
        email: row.insured.email || '',
        generalAvailability: row.insured.general_availability || '',
        notes: row.insured.notes || '',
      } : undefined,
      publicAdjuster: row.public_adjuster ? {
        id: row.public_adjuster.id,
        name: row.public_adjuster.name,
        phone: row.public_adjuster.phone || '',
        email: row.public_adjuster.email || '',
        role: row.public_adjuster.role || 'adjuster',
        generalAvailability: row.public_adjuster.general_availability || '',
        colorCode: row.public_adjuster.color_code || '#0284c7',
        isActive: row.public_adjuster.is_active ?? true,
      } : undefined,
      carrierReps: (row.carrier_reps || [])
        .map((cr: any) => cr.carrier_rep)
        .filter(Boolean)
        .map((r: any) => ({
          id: r.id,
          carrierName: r.carrier_name,
          name: r.name,
          typeOfRepresentative: r.type_of_representative,
          phone: r.phone,
          email: r.email,
          company: r.company,
          notes: r.notes,
        })),
      externalActors: (row.external_actors || [])
        .map((ea: any) => ea.external_actor)
        .filter(Boolean)
        .map((a: any) => ({
          id: a.id,
          name: a.name,
          typeOfActor: a.type_of_actor,
          company: a.company,
          phone: a.phone,
          email: a.email,
          generalAvailability: a.general_availability,
          notes: a.notes,
        })),
    }));
  },

  // 5. Obtener Eventos con Slots, Participantes, Reclamo y Bitácora
  async getEvents(): Promise<CoordinationEvent[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        claim:claims (
          *,
          insured:insureds (*)
        ),
        slots:event_slots (*),
        participants:event_participants (
          *,
          public_adjuster:public_adjusters (*),
          carrier_rep:carrier_representatives (*),
          external_actor:external_actors (*),
          insured:insureds (*)
        ),
        logs:coordination_logs (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching events:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      eventType: row.event_type,
      status: row.status,
      coordinationStage: row.coordination_stage,
      carrierSlotsDeadline: row.carrier_slots_deadline,
      finalDate: row.final_date,
      finalStartTime: row.final_start_time,
      finalEndTime: row.final_end_time,
      location: row.location,
      lockboxCode: row.lockbox_code,
      gateCode: row.gate_code,
      accessInstructions: row.access_instructions,
      noticeSentAt: row.notice_sent_at,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      claim: row.claim ? {
        id: row.claim.id,
        carrier: row.claim.carrier,
        claimNumber: row.claim.claim_number,
        policyNumber: row.claim.policy_number,
        typeOfLoss: row.claim.type_of_loss,
        propertyAddress: row.claim.property_address,
        city: row.claim.city,
        state: row.claim.state,
        zipCode: row.claim.zip_code,
        status: row.claim.status,
        insured: row.claim.insured ? {
          id: row.claim.insured.id,
          name: row.claim.insured.name,
          phone: row.claim.insured.phone,
          email: row.claim.insured.email,
          generalAvailability: row.claim.insured.general_availability,
          notes: row.claim.insured.notes,
        } : undefined,
      } : undefined,
      slots: (row.slots || []).map((s: any) => ({
        id: s.id,
        eventId: s.event_id,
        slotDate: s.slot_date,
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        rejectionReason: s.rejection_reason,
        deadlineAt: s.deadline_at,
      })),
      participants: (row.participants || []).map((p: any) => ({
        id: p.id,
        eventId: p.event_id,
        participantType: p.participant_type,
        roleType: p.role_type,
        publicAdjusterId: p.public_adjuster_id,
        carrierRepId: p.carrier_rep_id,
        externalActorId: p.external_actor_id,
        insuredId: p.insured_id,
        customName: p.custom_name,
        customEmail: p.custom_email,
        customPhone: p.custom_phone,
        publicAdjuster: p.public_adjuster ? {
          id: p.public_adjuster.id,
          name: p.public_adjuster.name,
          phone: p.public_adjuster.phone,
          email: p.public_adjuster.email,
          role: p.public_adjuster.role,
          generalAvailability: p.public_adjuster.general_availability,
          colorCode: p.public_adjuster.color_code,
          isActive: p.public_adjuster.is_active,
        } : undefined,
        carrierRep: p.carrier_rep ? {
          id: p.carrier_rep.id,
          carrierName: p.carrier_rep.carrier_name,
          name: p.carrier_rep.name,
          typeOfRepresentative: p.carrier_rep.type_of_representative,
          phone: p.carrier_rep.phone,
          email: p.carrier_rep.email,
          company: p.carrier_rep.company,
        } : undefined,
        externalActor: p.external_actor ? {
          id: p.external_actor.id,
          name: p.external_actor.name,
          typeOfActor: p.external_actor.type_of_actor,
          company: p.external_actor.company,
          phone: p.external_actor.phone,
          email: p.external_actor.email,
        } : undefined,
        insured: p.insured ? {
          id: p.insured.id,
          name: p.insured.name,
          phone: p.insured.phone,
          email: p.insured.email,
          generalAvailability: p.insured.general_availability,
        } : undefined,
      })),
      logs: (row.logs || []).map((l: any) => ({
        id: l.id,
        eventId: l.event_id,
        contactTarget: l.contact_target,
        contactTargetName: l.contact_target_name,
        channel: l.channel,
        notes: l.notes,
        createdAt: l.created_at,
      })),
    }));
  },

  // 6. Actualizar Estado de Slot en el Embudo
  async updateSlotStatus(slotId: string, status: SlotStatus, rejectionReason?: string) {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from('event_slots')
      .update({ status, rejection_reason: rejectionReason || null })
      .eq('id', slotId);
    if (error) throw error;
  },

  // 6.1 Registrar fechas propuestas por el carrier (habitualmente 3) y avanzar a Etapa 2: PA Review
  async recordCarrierSlots(
    eventId: string, 
    slots: Array<{ slotDate: string; startTime: string; endTime: string }>
  ) {
    if (!isSupabaseConfigured) return;
    // 1. Eliminar slots previos si existieran
    await supabase.from('event_slots').delete().eq('event_id', eventId);
    
    // 2. Insertar los nuevos slots propuestos
    const insertData = slots.map((s) => ({
      event_id: eventId,
      slot_date: s.slotDate,
      start_time: s.startTime,
      end_time: s.endTime,
      status: 'proposed' as const,
    }));
    const { error: insertErr } = await supabase.from('event_slots').insert(insertData);
    if (insertErr) throw insertErr;

    // 3. Avanzar evento a Etapa 2: PA Review
    const { error: stageErr } = await supabase
      .from('events')
      .update({ 
        coordination_stage: '2_pa_review',
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);
    if (stageErr) throw stageErr;

    // 4. Registrar en la bitácora de auditoría
    const dateSummary = slots.map((s, idx) => `Opt #${idx + 1}: ${s.slotDate} (${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)})`).join(', ');
    await supabase.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'carrier_rep',
      contact_target_name: 'Carrier Representative',
      channel: 'email',
      notes: `📅 Carrier offered ${slots.length} proposed dates: ${dateSummary}. Forwarded to PA for review.`
    });

    // 5. Enviar automáticamente notificación por correo al PA con el diseño corporativo
    supabase.functions.invoke('notify-pa-slots', {
      body: { eventId }
    }).then((res) => {
      console.log("Notificación por correo enviada al PA con éxito:", res);
    }).catch(err => {
      console.error("Error al disparar notificación al PA:", err);
    });
  },

  // 6.2 PA escoge 2 de las fechas propuestas y avanza a Etapa 3: Insured Selection
  async paSelectSlots(
    eventId: string,
    acceptedSlotIds: string[],
    allSlotIds: string[]
  ) {
    if (!isSupabaseConfigured) return;
    // Marcar aceptados
    const { error: acceptErr } = await supabase
      .from('event_slots')
      .update({ status: 'pa_accepted' })
      .in('id', acceptedSlotIds);
    if (acceptErr) throw acceptErr;

    // Marcar rechazados los que no se escogieron
    const rejectedSlotIds = allSlotIds.filter((id) => !acceptedSlotIds.includes(id));
    if (rejectedSlotIds.length > 0) {
      const { error: rejectErr } = await supabase
        .from('event_slots')
        .update({ status: 'pa_rejected' })
        .in('id', rejectedSlotIds);
      if (rejectErr) throw rejectErr;
    }

    // Avanzar evento a Etapa 3: Insured Selection
    const { error: stageErr } = await supabase
      .from('events')
      .update({ 
        coordination_stage: '3_insured_selection',
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);
    if (stageErr) throw stageErr;

    // Registrar en la bitácora de auditoría
    await supabase.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'pa',
      contact_target_name: 'Public Adjuster',
      channel: 'call_answered',
      notes: `⚖️ PA reviewed and approved 2 options for the client. Advanced to Stage 3 (Client Choice).`
    });

    // Enviar correo automáticamente al cliente asegurado con las 2 opciones en 1-clic
    supabase.functions.invoke('notify-insured-slots', {
      body: { eventId }
    }).catch(err => console.error("Error triggering notify-insured-slots edge function:", err));
  },

  // Enviar / Reenviar correo con las opciones al cliente asegurado
  async notifyInsuredSlots(eventId: string) {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.functions.invoke('notify-insured-slots', {
      body: { eventId }
    });
    if (error) throw error;
    return data;
  },

  // 6.3 Insured escoge 1 fecha y se bloquea la cita definitiva en Etapa 4: Confirmed
  async insuredConfirmSlot(
    eventId: string,
    chosenSlotId: string,
    finalDetails: { date: string; startTime: string; endTime: string }
  ) {
    if (!isSupabaseConfigured) return;
    // Marcar el slot ganador
    const { error: chooseErr } = await supabase
      .from('event_slots')
      .update({ status: 'insured_chosen' })
      .eq('id', chosenSlotId);
    if (chooseErr) throw chooseErr;

    // Marcar los demás como discarded
    await supabase
      .from('event_slots')
      .update({ status: 'discarded' })
      .eq('event_id', eventId)
      .neq('id', chosenSlotId);

    // Confirmar y fijar la cita definitiva en el evento
    const { error: stageErr } = await supabase
      .from('events')
      .update({
        coordination_stage: '4_confirmed',
        status: 'scheduled',
        final_date: finalDetails.date,
        final_start_time: finalDetails.startTime,
        final_end_time: finalDetails.endTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);
    if (stageErr) throw stageErr;

    // Registrar en la bitácora de auditoría
    await supabase.from('coordination_logs').insert({
      event_id: eventId,
      contact_target: 'insured',
      contact_target_name: 'Insured / Client',
      channel: 'whatsapp',
      notes: `✓ Client selected appointment date: ${finalDetails.date} (${finalDetails.startTime.slice(0, 5)} - ${finalDetails.endTime.slice(0, 5)}). Inspection locked & scheduled.`
    });

    // Enviar invitaciones de calendario automáticamente de forma asíncrona (sin bloquear el flujo)
    supabase.functions.invoke('send-calendar-invite', {
      body: { eventId }
    }).catch(err => console.error("Error triggering calendar invite edge function:", err));
  },

  // 6.4 Resetear / Cancelar el Flujo de Coordinación y regresar a Etapa 1
  async resetCoordinationEvent(
    eventId: string,
    options?: {
      cancelledBy?: string;
      cancellationReason?: string;
      sendCancellationNotice?: boolean;
    }
  ) {
    if (!isSupabaseConfigured) return;

    // 0. Obtener detalles previos del evento para la notificación (fecha anterior, etc.)
    const { data: previousEvent } = await supabase
      .from('events')
      .select('final_date, final_start_time, final_end_time, coordination_stage')
      .eq('id', eventId)
      .single();

    const previousDate = previousEvent?.final_date;
    const previousStartTime = previousEvent?.final_start_time;
    const previousEndTime = previousEvent?.final_end_time;

    // 1. Resetear el evento a la etapa 1 y estado 'in_coordination'
    const { error: eventErr } = await supabase
      .from('events')
      .update({
        coordination_stage: '1_awaiting_carrier_slots',
        status: 'in_coordination',
        final_date: null,
        final_start_time: null,
        final_end_time: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);
    if (eventErr) throw eventErr;

    // 2. Eliminar slots previos para permitir registrar 3 nuevas fechas
    const { error: slotsErr } = await supabase
      .from('event_slots')
      .delete()
      .eq('event_id', eventId);
    if (slotsErr) throw slotsErr;

    // 3. Registrar en la bitácora la cancelación y motivo (si se especificó)
    const cancelledBy = options?.cancelledBy || 'General';
    const reason = options?.cancellationReason?.trim();
    const logNotes = [
      '🔄 Coordination flow reset back to Stage 1 (Awaiting Carrier Dates).',
      options?.cancelledBy ? `Cancelled by: ${options.cancelledBy}.` : '',
      reason ? `Reason: ${reason}` : 'No reason provided.'
    ].filter(Boolean).join(' ');

    await supabase
      .from('coordination_logs')
      .insert({
        event_id: eventId,
        contact_target: 'internal',
        contact_target_name: cancelledBy,
        channel: 'system_reset',
        notes: logNotes
      });

    // 4. Enviar correo de notificación de cancelación a todas las partes involucradas
    if (options?.sendCancellationNotice !== false) {
      supabase.functions.invoke('send-cancellation-notice', {
        body: {
          eventId,
          cancelledBy,
          cancellationReason: reason,
          previousDate,
          previousStartTime,
          previousEndTime
        }
      }).catch(err => console.error("Error triggering send-cancellation-notice edge function:", err));
    }
  },

  // 7. Avanzar Etapa del Evento o Confirmar
  async updateEventStage(
    eventId: string, 
    stage: CoordinationStage, 
    finalDetails?: { date: string; startTime: string; endTime: string }
  ) {
    if (!isSupabaseConfigured) return;
    const updatePayload: any = {
      coordination_stage: stage,
    };
    if (stage === '4_confirmed' && finalDetails) {
      updatePayload.status = 'scheduled';
      updatePayload.final_date = finalDetails.date;
      updatePayload.final_start_time = finalDetails.startTime;
      updatePayload.final_end_time = finalDetails.endTime;
    }
    const { error } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', eventId);
    if (error) throw error;
  },

  // 8. Agregar Registro a la Bitácora de Contacto
  async addCoordinationLog(log: Omit<CoordinationLog, 'id' | 'createdAt'>) {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('coordination_logs')
      .insert({
        event_id: log.eventId,
        contact_target: log.contactTarget,
        contact_target_name: log.contactTargetName,
        channel: log.channel,
        notes: log.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 9. Crear Insured (Cliente Asegurado)
  async createInsured(insured: { name: string; phone?: string; email?: string; generalAvailability?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('insureds')
      .insert({
        name: insured.name,
        phone: insured.phone,
        email: insured.email,
        general_availability: insured.generalAvailability,
        notes: insured.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 10. Crear Public Adjuster
  async createPublicAdjuster(pa: { name: string; phone?: string; email?: string; role?: string; generalAvailability?: string; colorCode?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('public_adjusters')
      .insert({
        name: pa.name,
        phone: pa.phone,
        email: pa.email,
        role: pa.role || 'adjuster',
        general_availability: pa.generalAvailability,
        color_code: pa.colorCode || '#0284c7',
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 11. Crear Carrier Representative
  async createCarrierRep(rep: { carrierName: string; name: string; typeOfRepresentative?: string; phone?: string; email?: string; company?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('carrier_representatives')
      .insert({
        carrier_name: rep.carrierName,
        name: rep.name,
        type_of_representative: rep.typeOfRepresentative || 'Field Adjuster',
        phone: rep.phone,
        email: rep.email,
        company: rep.company,
        notes: rep.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 12. Crear External Actor
  async createExternalActor(actor: { name: string; typeOfActor?: string; company?: string; phone?: string; email?: string; generalAvailability?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('external_actors')
      .insert({
        name: actor.name,
        type_of_actor: actor.typeOfActor || 'Appraiser',
        company: actor.company,
        phone: actor.phone,
        email: actor.email,
        general_availability: actor.generalAvailability,
        notes: actor.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 12.1 Actualizar Insured
  async updateInsured(id: string, data: { name: string; phone?: string; email?: string; generalAvailability?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data: updated, error } = await supabase
      .from('insureds')
      .update({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        general_availability: data.generalAvailability || null,
        notes: data.notes || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  },

  // 12.2 Eliminar Insured
  async deleteInsured(id: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('insureds').delete().eq('id', id);
    if (error) throw error;
  },

  // 12.3 Actualizar Public Adjuster
  async updatePublicAdjuster(id: string, data: { name: string; phone?: string; email?: string; role?: string; generalAvailability?: string; colorCode?: string; isActive?: boolean }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data: updated, error } = await supabase
      .from('public_adjusters')
      .update({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        role: data.role || 'adjuster',
        general_availability: data.generalAvailability || null,
        color_code: data.colorCode || '#0284c7',
        is_active: data.isActive ?? true,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  },

  // 12.4 Eliminar Public Adjuster
  async deletePublicAdjuster(id: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    // First unlink from any claims
    await supabase.from('claims').update({ public_adjuster_id: null }).eq('public_adjuster_id', id);
    const { error } = await supabase.from('public_adjusters').delete().eq('id', id);
    if (error) throw error;
  },

  // 12.5 Desvincular PA de un Claim
  async unlinkPaFromClaim(claimId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('claims').update({ public_adjuster_id: null }).eq('id', claimId);
    if (error) throw error;
  },

  // 12.6 Actualizar Carrier Representative
  async updateCarrierRep(id: string, data: { name: string; carrierName?: string; typeOfRepresentative?: string; phone?: string; email?: string; company?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data: updated, error } = await supabase
      .from('carrier_representatives')
      .update({
        name: data.name,
        carrier_name: data.carrierName,
        type_of_representative: data.typeOfRepresentative || 'Field Adjuster',
        phone: data.phone || null,
        email: data.email || null,
        company: data.company || null,
        notes: data.notes || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  },

  // 12.7 Eliminar Carrier Representative
  async deleteCarrierRep(id: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    await supabase.from('claim_carrier_representatives').delete().eq('carrier_rep_id', id);
    const { error } = await supabase.from('carrier_representatives').delete().eq('id', id);
    if (error) throw error;
  },

  // 12.8 Desvincular Carrier Representative de un Claim
  async unlinkCarrierRepFromClaim(claimId: string, carrierRepId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase
      .from('claim_carrier_representatives')
      .delete()
      .match({ claim_id: claimId, carrier_rep_id: carrierRepId });
    if (error) throw error;
  },

  // 12.9 Actualizar External Actor
  async updateExternalActor(id: string, data: { name: string; typeOfActor?: string; company?: string; phone?: string; email?: string; generalAvailability?: string; notes?: string }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data: updated, error } = await supabase
      .from('external_actors')
      .update({
        name: data.name,
        type_of_actor: data.typeOfActor || 'Appraiser',
        company: data.company || null,
        phone: data.phone || null,
        email: data.email || null,
        general_availability: data.generalAvailability || null,
        notes: data.notes || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  },

  // 12.10 Eliminar External Actor
  async deleteExternalActor(id: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    await supabase.from('claim_external_actors').delete().eq('external_actor_id', id);
    const { error } = await supabase.from('external_actors').delete().eq('id', id);
    if (error) throw error;
  },

  // 12.11 Desvincular External Actor de un Claim
  async unlinkExternalActorFromClaim(claimId: string, externalActorId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase
      .from('claim_external_actors')
      .delete()
      .match({ claim_id: claimId, external_actor_id: externalActorId });
    if (error) throw error;
  },

  // 12.12 Vincular Carrier Rep a un Claim
  async linkCarrierRepToClaim(claimId: string, carrierRepId: string, role = 'Field Adjuster') {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('claim_carrier_representatives').insert({
      claim_id: claimId,
      carrier_rep_id: carrierRepId,
      role_in_claim: role,
      is_primary: true,
    });
    if (error) throw error;
  },

  // 12.13 Vincular External Actor a un Claim
  async linkExternalActorToClaim(claimId: string, externalActorId: string, role = 'Appraiser') {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('claim_external_actors').insert({
      claim_id: claimId,
      external_actor_id: externalActorId,
      role_in_claim: role,
    });
    if (error) throw error;
  },

  // 12.14 Vincular PA a un Claim
  async linkPaToClaim(claimId: string, paId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('claims').update({ public_adjuster_id: paId }).eq('id', claimId);
    if (error) throw error;
  },

  // 12.15 Vincular Insured a un Claim
  async linkInsuredToClaim(claimId: string, insuredId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('claims').update({ insured_id: insuredId }).eq('id', claimId);
    if (error) throw error;
  },

  // 13. Crear Claim Completo con sus Actores Vinculados
  async createClaim(claimData: {
    insuredId: string;
    carrier: string;
    claimNumber: string;
    policyNumber?: string;
    typeOfLoss: string;
    propertyAddress: string;
    city?: string;
    state?: string;
    zipCode?: string;
    dateOfLoss?: string;
    status?: 'Open' | 'Under Review' | 'Appraisal' | 'Settled' | 'Closed' | string;
    notes?: string;
    publicAdjusterId?: string;
    carrierRepId?: string;
    externalActorId?: string;
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    
    // Insert claim payload
    const insertPayload: any = {
      insured_id: claimData.insuredId,
      carrier: claimData.carrier,
      claim_number: claimData.claimNumber,
      policy_number: claimData.policyNumber,
      type_of_loss: claimData.typeOfLoss,
      property_address: claimData.propertyAddress,
      city: claimData.city || 'Miami',
      state: claimData.state || 'FL',
      zip_code: claimData.zipCode,
      date_of_loss: claimData.dateOfLoss,
      status: claimData.status || 'Open',
      notes: claimData.notes,
    };

    if (claimData.publicAdjusterId) {
      insertPayload.public_adjuster_id = claimData.publicAdjusterId;
    }

    const { data: claim, error: claimErr } = await supabase
      .from('claims')
      .insert(insertPayload)
      .select()
      .single();

    if (claimErr) throw claimErr;

    // Link Carrier Rep if provided
    if (claimData.carrierRepId) {
      await supabase.from('claim_carrier_representatives').insert({
        claim_id: claim.id,
        carrier_rep_id: claimData.carrierRepId,
        role_in_claim: 'Field Adjuster',
        is_primary: true,
      });
    }

    // Link External Actor if provided
    if (claimData.externalActorId) {
      await supabase.from('claim_external_actors').insert({
        claim_id: claim.id,
        external_actor_id: claimData.externalActorId,
        role_in_claim: 'Appraiser',
      });
    }

    return claim;
  },

  // 13.5 Actualizar Claim Existente
  async updateClaim(claimId: string, claimData: {
    insuredId: string;
    carrier: string;
    claimNumber: string;
    policyNumber?: string;
    typeOfLoss: string;
    propertyAddress: string;
    city?: string;
    state?: string;
    zipCode?: string;
    dateOfLoss?: string;
    status?: string;
    notes?: string;
    publicAdjusterId?: string;
    carrierRepId?: string;
    externalActorId?: string;
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

    const updatePayload: any = {
      insured_id: claimData.insuredId,
      carrier: claimData.carrier,
      claim_number: claimData.claimNumber,
      policy_number: claimData.policyNumber || null,
      type_of_loss: claimData.typeOfLoss,
      property_address: claimData.propertyAddress,
      city: claimData.city || 'Miami',
      state: claimData.state || 'FL',
      zip_code: claimData.zipCode || null,
      date_of_loss: claimData.dateOfLoss || null,
      status: claimData.status || 'Open',
      notes: claimData.notes || null,
      public_adjuster_id: claimData.publicAdjusterId || null,
    };

    const { data: updated, error: claimErr } = await supabase
      .from('claims')
      .update(updatePayload)
      .eq('id', claimId)
      .select()
      .single();

    if (claimErr) throw claimErr;

    // Update Carrier Rep junction if provided
    if (claimData.carrierRepId) {
      await supabase.from('claim_carrier_representatives').delete().eq('claim_id', claimId);
      await supabase.from('claim_carrier_representatives').insert({
        claim_id: claimId,
        carrier_rep_id: claimData.carrierRepId,
        role_in_claim: 'Field Adjuster',
        is_primary: true,
      });
    }

    // Update External Actor junction if provided
    if (claimData.externalActorId) {
      await supabase.from('claim_external_actors').delete().eq('claim_id', claimId);
      await supabase.from('claim_external_actors').insert({
        claim_id: claimId,
        external_actor_id: claimData.externalActorId,
        role_in_claim: 'Appraiser',
      });
    }

    return updated;
  },

  // 14. Crear Evento / Inspección para un Claim
  async createEvent(eventData: {
    claimId: string;
    eventType: string;
    status?: EventStatus;
    coordinationStage?: CoordinationStage;
    location: string;
    notes?: string;
    lockboxCode?: string;
    gateCode?: string;
    accessInstructions?: string;
    participants?: {
      participantType: 'insured' | 'public_adjuster' | 'carrier_representative' | 'external_actor' | 'office';
      roleType?: ParticipantRole;
      publicAdjusterId?: string;
      carrierRepId?: string;
      externalActorId?: string;
      insuredId?: string;
      customName?: string;
      customEmail?: string;
      customPhone?: string;
    }[];
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

    const { data: newEvent, error: eventErr } = await supabase
      .from('events')
      .insert({
        claim_id: eventData.claimId,
        event_type: eventData.eventType || 'Initial Inspection',
        status: eventData.status || 'coordinating',
        coordination_stage: eventData.coordinationStage || '1_awaiting_carrier_slots',
        location: eventData.location,
        lockbox_code: eventData.lockboxCode || null,
        gate_code: eventData.gateCode || null,
        access_instructions: eventData.accessInstructions || null,
        notes: eventData.notes || '',
      })
      .select()
      .single();

    if (eventErr) throw eventErr;

    if (eventData.participants && eventData.participants.length > 0) {
      const payload = eventData.participants.map(p => ({
        event_id: newEvent.id,
        participant_type: p.participantType,
        role_type: p.roleType || 'actor',
        public_adjuster_id: p.publicAdjusterId || null,
        carrier_rep_id: p.carrierRepId || null,
        external_actor_id: p.externalActorId || null,
        insured_id: p.insuredId || null,
        custom_name: p.customName || null,
        custom_email: p.customEmail || null,
        custom_phone: p.customPhone || null,
      }));

      const { error: partErr } = await supabase.from('event_participants').insert(payload);
      if (partErr) console.warn('Error inserting participants:', partErr);
    }

    return newEvent;
  },

  // 13.9 Eliminar Evento de Coordinación
  async deleteEvent(eventId: string) {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw error;
  },

  // 14. Get Unique Carriers from existing database records
  async getUniqueCarriers(): Promise<string[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const [claimsRes, repsRes] = await Promise.all([
        supabase.from('claims').select('carrier'),
        supabase.from('carrier_representatives').select('carrier_name'),
      ]);
      const set = new Set<string>();
      (claimsRes.data || []).forEach((c: any) => { if (c.carrier) set.add(c.carrier.trim()); });
      (repsRes.data || []).forEach((r: any) => { if (r.carrier_name) set.add(r.carrier_name.trim()); });
      return Array.from(set);
    } catch (e) {
      console.warn('Error fetching unique carriers:', e);
      return [];
    }
  },

  // 15. Get Unique Event Types from existing database events
  async getUniqueEventTypes(): Promise<string[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data } = await supabase.from('events').select('event_type');
      const set = new Set<string>();
      (data || []).forEach((e: any) => {
        if (e.event_type && typeof e.event_type === 'string') {
          set.add(e.event_type.trim());
        }
      });
      return Array.from(set);
    } catch (e) {
      console.warn('Error fetching unique event types:', e);
      return [];
    }
  }
};

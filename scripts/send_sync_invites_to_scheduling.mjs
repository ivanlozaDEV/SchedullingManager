// Script para sincronizar las 15 confirmaciones de eventos directamente hacia scheduling@ipadjustinggroup.com
// Ejecución manual por parte del usuario: node scripts/send_sync_invites_to_scheduling.mjs

const SUPABASE_URL = 'https://nazzlfkfwdzrgzspvixm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5henpsZmtmd2R6cmd6c3B2aXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDEyMjksImV4cCI6MjEwNzQxNzIyOX0.T0HxMCVn7FbOtKWOdlM6niRq34UqRh-Q0IfBRF48wRc';

const TARGET_EMAIL = process.argv[2] || 'scheduling@ipadjustinggroup.com';

const EVENTS_TO_SYNC = [
  {
    name: 'Kayla & Timothy Trent',
    address: '5815 Michael Dr Milton, FL 32583',
    date: '2026-11-05',
    time: '10:00:00 - 11:00:00',
    claimNumber: '00300166481',
    eventId: '0b661765-1213-4bfa-9d65-906ed4b84f80'
  },
  {
    name: 'Shawn Collins',
    address: '3602 Hazel Godwin Rd Jay, FL 32565',
    date: '2026-11-09',
    time: '11:00:00 - 13:00:00',
    claimNumber: '019891218-800',
    eventId: '1ea0ddb8-40de-404c-a8c2-df6a40fbaff3'
  },
  {
    name: 'Tina Johnson',
    address: '5755 MILL STREAM WAY MILTON, FL 32571',
    date: '2026-11-09',
    time: '14:00:00 - 16:00:00',
    claimNumber: '26CFL200297487',
    eventId: '904e47e0-739d-43e0-9c6a-04a69d494bad'
  },
  {
    name: 'Rosa Kelly',
    address: '3251 Fresno Ave, Pensacola, FL 32526',
    date: '2026-11-04',
    time: '14:00:00 - 15:00:00',
    claimNumber: '3300595701',
    eventId: 'e2b70b6c-d1e4-4001-a82f-4211b7bcbe3e'
  },
  {
    name: 'Quality Properties Home Cash Buyer LLC',
    address: '7110 Ben Sasser Dr. Pensacola, FL 32526',
    date: '2026-11-10',
    time: '08:00:00 - 10:00:00',
    claimNumber: '5630136914',
    eventId: '01374ad3-a04e-4ee4-bb1d-73d196409710'
  },
  {
    name: 'Pham Peoples',
    address: '1115 N Q St, Pensacola, FL 32505',
    date: '2026-11-05',
    time: '14:00:00 - 16:00:00',
    claimNumber: '59-0T2X-514',
    eventId: 'e47d8e40-6a32-4fb4-9c76-43aa990d0ae2'
  },
  {
    name: 'John & Rebecca Ates',
    address: '5616 Elizabeth Way Milton, FL 32570',
    date: '2026-11-11',
    time: '08:30:00 - 10:30:00',
    claimNumber: '59-0T6C-014',
    eventId: '7ac42da6-05a7-4460-993c-69e080bcf12f'
  },
  {
    name: 'Boris & Chelsea Lindao',
    address: '10549 Willderness Ln Pensacola FL 32534',
    date: '2026-11-11',
    time: '10:00:00 - 12:00:00',
    claimNumber: '590S8S329',
    eventId: 'b04d0c0c-ce41-43b8-a6be-e3f3e2650cdf'
  },
  {
    name: 'Mary Trivigno & Margie Lvczak',
    address: '4805 Kitty Hawk Cir, Gulf Breeze, FL 32563',
    date: '2026-11-12',
    time: '10:00:00 - 12:00:00',
    claimNumber: '963835',
    eventId: '4caa8a46-ca38-4d72-87ec-616c161d9aed'
  },
  {
    name: 'Jay Drinkard & William Croley (1101 Hwy 196)',
    address: '1101 Highway 196 Molino, FL 32577',
    date: '2026-11-10',
    time: '11:00:00 - 13:00:00',
    claimNumber: 'CLM-00007614',
    eventId: 'f58f3fc0-bdf1-45c5-8143-5ec2aaa2ec90'
  },
  {
    name: 'Pham Peoples (3933 Erress Blvd)',
    address: '3933 Erress Blvd, Pensacola, FL 32505',
    date: '2026-11-05',
    time: '12:00:00 - 14:00:00',
    claimNumber: 'FL26-0121247-P126',
    eventId: '6bd6f539-0b82-4376-8b54-aed180745913'
  },
  {
    name: 'Darwin Franklin',
    address: '4472 Oakforest dr Milton, FL 32583',
    date: '2026-11-05',
    time: '09:00:00 - 11:00:00',
    claimNumber: 'HO0526444910',
    eventId: '04e63f23-ec41-4b42-b508-adb2e1bce28f'
  },
  {
    name: 'Jay Drinkard & William Croley (1156 Hwy 196)',
    address: '1156 highway 196 Molino FL, 32577',
    date: '2026-11-10',
    time: '13:00:00 - 15:00:00',
    claimNumber: 'MDT3FL15677821C1',
    eventId: 'fd5c5533-8283-43da-871a-b43d50ad2ee2'
  },
  {
    name: 'Harrington Abreu',
    address: '1844 Nestle Dr. Pensacola Fl 32534',
    date: '2026-11-07',
    time: '14:00:00 - 16:00:00',
    claimNumber: 'N010061479',
    eventId: '6c567eeb-8ae9-41fb-a5eb-58955e765f43'
  },
  {
    name: 'Tyawna McWilliams',
    address: '8181 Durand Ave Pensacola, FL 32534',
    date: '2026-11-16',
    time: '12:00:00 - 14:00:00',
    claimNumber: 'TH001237',
    eventId: '4411b6ef-03e1-4f04-941a-0df6b95b7c2b'
  }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log(`\n======================================================`);
  console.log(` Iniciando envío de invitaciones (.ics) hacia: ${TARGET_EMAIL}`);
  console.log(` Total eventos a sincronizar: ${EVENTS_TO_SYNC.length}`);
  console.log(`======================================================\n`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < EVENTS_TO_SYNC.length; i++) {
    const item = EVENTS_TO_SYNC[i];
    const indexStr = `[${i + 1}/${EVENTS_TO_SYNC.length}]`;
    console.log(`${indexStr} Procesando: ${item.name} (Claim #${item.claimNumber}) - ${item.date}...`);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-calendar-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          eventId: item.eventId,
          onlyRecipients: [TARGET_EMAIL]
        })
      });

      const data = await res.json();

      if (res.ok && data.success !== false) {
        console.log(`   ✅ Enviado exitosamente a: ${Array.isArray(data.sentTo) ? data.sentTo.join(', ') : TARGET_EMAIL}`);
        successCount++;
      } else {
        console.error(`   ❌ Error al enviar:`, data.warning || data.error || data.message || res.statusText);
        failureCount++;
      }
    } catch (err) {
      console.error(`   ❌ Excepción:`, err.message);
      failureCount++;
    }

    // Pausa de seguridad de 1 segundo entre envíos para respetar cuota SMTP de Gmail
    if (i < EVENTS_TO_SYNC.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`\n======================================================`);
  console.log(` Resumen de sincronización:`);
  console.log(` • Éxitos: ${successCount}`);
  console.log(` • Fallidos: ${failureCount}`);
  console.log(`======================================================\n`);
}

run();

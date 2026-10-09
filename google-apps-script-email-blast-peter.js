/**
 * GOOGLE APPS SCRIPT: Envío Masivo de Correos con Intervalo Anti-Spam
 * Hoja objetivo: "Peter list" (o "Peter List") en "Master List IP Adjusting"
 * Remitente: Peter Ramos (Owner | Public Adjuster - IP Adjusting Group LLC)
 * 
 * ⚠️ NOTA DE COMPATIBILIDAD CON GOOGLE APPS SCRIPT:
 * Todos los identificadores y funciones llevan el sufijo "Peter" o "PETER"
 * para evitar colisiones con otros scripts en el mismo proyecto (ej. "Ivan List").
 */

// ============================================================================
// CONFIGURACIÓN (ESPACIO DE NOMBRES PETER RAMOS)
// ============================================================================
const CONFIG_PETER = {
  // Posibles nombres de la hoja (maneja variaciones de mayúsculas y espacios)
  POSSIBLE_SHEET_NAMES: ['Peter list', 'Peter List', 'Peter list ', 'Peter List ', 'Peter'],

  // Asunto del correo
  EMAIL_SUBJECT: 'Hurricane Isaias: Important Property Reminder | Peter Ramos (IP Adjusting Group)',

  // Nombre público que aparece como remitente en la bandeja de entrada
  SENDER_NAME: 'Peter Ramos | IP Adjusting Group',

  // Intervalo en milisegundos entre cada envío (3000 ms = 3 segundos anti-spam)
  DELAY_BETWEEN_EMAILS_MS: 3000,

  // Límite máximo de correos por tanda para no exceder los 6 min de Apps Script
  MAX_EMAILS_PER_BATCH: 75,

  // Columna para registrar el estado de envío (Columna G = 7)
  STATUS_COLUMN_INDEX: 7,
  STATUS_HEADER_NAME: 'EMAIL STATUS (ISAIAS)',

  // Correo de prueba predeterminado
  TEST_EMAIL_ADDRESS: 'ivanloza88@gmail.com',

  // 🔒 MODO PRUEBA DE SEGURIDAD (true / false):
  // Si está en true: Ningún cliente recibirá correos. Todos los envíos se redirigen a ivanloza88@gmail.com.
  // Si está en false: Se envían a los clientes reales de la hoja "Peter list".
  IS_TEST_MODE: false,

  // Índices de columnas en la hoja
  COL_CLIENT: 1, // Columna A: CLIENT / NOMBRE
  COL_EMAIL: 4,  // Columna D: EMAIL

  // Assets corporativos de IP Adjusting Group (Google Drive IDs públicos)
  ASSETS: {
    LOGO_URL: 'https://drive.google.com/uc?export=view&id=15sfb2FC7bIfoVUfzJYJ9snM7WToqYb2l',
    INSTAGRAM_ICON: 'https://drive.google.com/uc?export=view&id=1eVdlspnkXxuauln84a3TvwX7CkoPzUtN',
    WHATSAPP_ICON: 'https://drive.google.com/uc?export=view&id=1sNAL_a5ISR1Xa3SFz5DFxsdf5v6Ka7O0',
    WEBSITE_ICON: 'https://drive.google.com/uc?export=view&id=1OBMR1DYrpf7DEVIGoUGMGSTz9FAlOtsJ'
  }
};

// ============================================================================
// MENÚ SUPERIOR EN GOOGLE SHEETS
// ============================================================================
function createPeterMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Campaña Peter Ramos')
    .addItem('1. Enviar Email de Prueba a ivanloza88@gmail.com', 'sendTestEmailPeter')
    .addSeparator()
    .addItem('2. Iniciar Envío Masivo (Peter list)', 'sendMassEmailsPeter')
    .addSeparator()
    .addItem('Configurar Cabecera de Estado (Col G)', 'setupEmailStatusColumnPeter')
    .addToUi();
}

/**
 * Trigger automático al abrir la hoja de cálculo
 */
function onOpen() {
  createPeterMenu();
}

// ============================================================================
// UTILIDADES: OBTENER HOJA Y VALIDAR CORREO
// ============================================================================
function getTargetSheetPeter() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const name of CONFIG_PETER.POSSIBLE_SHEET_NAMES) {
    const sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }
  // Búsqueda insensible a mayúsculas si no se encontró coincidencia exacta
  const sheets = ss.getSheets();
  for (const s of sheets) {
    const clean = s.getName().toLowerCase().trim();
    if (clean.includes('peter') && clean.includes('list')) {
      return s;
    }
  }
  return null;
}

function isValidEmailPeter(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (clean === 'no email' || clean === 'none' || clean === 'n/a' || clean === '-') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(clean);
}

// ============================================================================
// CONFIGURAR COLUMNA DE ESTADO
// ============================================================================
function setupEmailStatusColumnPeter() {
  const sheet = getTargetSheetPeter();
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error: No se encontró la hoja "Peter list".');
    return;
  }
  const headerCell = sheet.getRange(1, CONFIG_PETER.STATUS_COLUMN_INDEX);
  headerCell.setValue(CONFIG_PETER.STATUS_HEADER_NAME);
  headerCell.setFontWeight('bold');
  headerCell.setBackground('#d6d9e0');
  SpreadsheetApp.getUi().alert(`Columna "${CONFIG_PETER.STATUS_HEADER_NAME}" configurada correctamente en la Columna G.`);
}

// ============================================================================
// CONTENIDO DEL MENSAJE (TEXTO PLANO Y HTML CORPORATIVO)
// ============================================================================
function getEmailContentPeter(clientName) {
  const displayName = clientName ? clientName.trim() : '';
  const greeting = displayName ? `Hello ${displayName},` : 'Hello,';

  // 1. Versión Texto Plano (para máxima entregabilidad y clientes sin HTML)
  const plainText = 
`${greeting}

This is Peter Ramos, your public adjuster from your Hurricane Sally claim. I hope you and your family are staying safe as Hurricane Isaias approaches the Florida Panhandle.

I wanted to reach out personally with one important reminder before the hurricane makes landfall: document your property as it is today.

Even if you have already completed your preparations, take a few extra minutes to walk through your home with your phone and record:

- Your home's interior: ceilings, walls, floors, furniture, and belongings.
- Your property's exterior: roof, windows, doors, fences, and other visible areas.
- Your vehicles and valuables: take photos or videos showing their current condition.
- Important records: keep your insurance information and other essential documents somewhere safe, preferably with a digital backup.

Save your photos and videos somewhere secure. If your property sustains damage, this documentation may help establish its condition before the hurricane.

Please prioritize your family's safety, follow local emergency guidance, and never go outside or put yourself at risk to take photos during hazardous conditions.

Since Hurricane Sally, I've started my own public adjusting company, IP Adjusting Group LLC. If your property is affected by Hurricane Isaias, my team and I are here to help you understand your options and navigate the insurance claim process.

I sincerely hope you and your home make it through safely. If you need assistance, don't hesitate to reach out.

Stay safe,

Peter Ramos
Owner | Public Adjuster
IP Adjusting Group LLC
Advocating for what’s yours

1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
`;

  // 2. Versión HTML Oficial de IP Adjusting Group LLC
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hurricane Isaias Property Reminder | Peter Ramos</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; display:block; border:0; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; height:100% !important; }

    /* Override para evitar que Gmail y Apple Mail pongan enlaces en azul oscuro */
    .footer a, .footer a span {
      color: #ffffff !important;
      text-decoration: none !important;
    }
    a[x-apple-data-detectors] {
      color: #ffffff !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    u + #body a {
      color: #ffffff !important;
      text-decoration: none !important;
    }
    #MessageViewBody a {
      color: #ffffff !important;
      text-decoration: none !important;
    }

    @media screen and (max-width:600px){
      .container { width:100% !important; }
      .content, .footer { width:100% !important; }
      img { max-width:100% !important; height:auto !important; }
      .padding { padding:15px !important; }
    }
  </style>
</head>
<body id="body" style="margin:0; padding:0; background-color:#d6d9e0; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#d6d9e0">
    <tr>
      <td align="center" style="padding: 22px 0;">

        <!-- Container (600px) -->
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">

          <!-- BRAND HEADER -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:24px 20px 20px 20px; border-bottom:3px solid #0071bc;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${CONFIG_PETER.ASSETS.LOGO_URL}" alt="IP Adjusting Group" width="180" style="display:block; max-width:220px; height:auto; border:0; margin:0 auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td class="content" style="padding:32px 42px 18px 42px; font-size:15px; color:#1e293b; line-height:1.65; font-family:Arial, Helvetica, sans-serif; background-color:#F0F0F0;">
              
              <p style="margin:0 0 16px 0; font-size:16px; color:#004E91;">${greeting}</p>
              
              <p style="margin:0 0 16px 0;">
                This is <strong>Peter Ramos</strong>, your public adjuster from your <strong>Hurricane Sally</strong> claim. I hope you and your family are staying safe as <strong>Hurricane Isaias</strong> approaches the Florida Panhandle.
              </p>
              
              <p style="margin:0 0 18px 0;">
                I wanted to reach out personally with one important reminder before the hurricane makes landfall: <strong>document your property as it is today</strong>.
              </p>
              
              <!-- CALLOUT BOX: PHONE WALKTHROUGH -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0; background-color:#ffffff; border-left:4px solid #0071bc; border-radius:6px; padding:16px 18px;">
                <tr>
                  <td>
                    <div style="font-size:14px; font-weight:bold; color:#004E91; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">
                      Quick Property Documentation Reminder
                    </div>
                    <div style="font-size:14px; color:#334155; line-height:1.6;">
                      Even if you have already completed your preparations, take a few extra minutes to walk through your home with your phone and record:
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CHECKLIST ITEMS -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                
                <!-- Item 1: Interior -->
                <tr>
                  <td width="30" valign="top" style="padding:7px 0;">
                    <span style="display:inline-block; width:22px; height:22px; background-color:#e0f2fe; color:#0284c7; border-radius:50%; text-align:center; line-height:22px; font-size:12px; font-weight:bold;">&#10003;</span>
                  </td>
                  <td valign="top" style="padding:7px 0 7px 10px; font-size:14px; color:#1e293b;">
                    <strong>Your home's interior:</strong> ceilings, walls, floors, furniture, and belongings.
                  </td>
                </tr>

                <!-- Item 2: Exterior -->
                <tr>
                  <td width="30" valign="top" style="padding:7px 0;">
                    <span style="display:inline-block; width:22px; height:22px; background-color:#e0f2fe; color:#0284c7; border-radius:50%; text-align:center; line-height:22px; font-size:12px; font-weight:bold;">&#10003;</span>
                  </td>
                  <td valign="top" style="padding:7px 0 7px 10px; font-size:14px; color:#1e293b;">
                    <strong>Your property's exterior:</strong> roof, windows, doors, fences, and other visible areas.
                  </td>
                </tr>

                <!-- Item 3: Vehicles & Valuables -->
                <tr>
                  <td width="30" valign="top" style="padding:7px 0;">
                    <span style="display:inline-block; width:22px; height:22px; background-color:#e0f2fe; color:#0284c7; border-radius:50%; text-align:center; line-height:22px; font-size:12px; font-weight:bold;">&#10003;</span>
                  </td>
                  <td valign="top" style="padding:7px 0 7px 10px; font-size:14px; color:#1e293b;">
                    <strong>Your vehicles and valuables:</strong> take photos or videos showing their current condition.
                  </td>
                </tr>

                <!-- Item 4: Important records -->
                <tr>
                  <td width="30" valign="top" style="padding:7px 0;">
                    <span style="display:inline-block; width:22px; height:22px; background-color:#e0f2fe; color:#0284c7; border-radius:50%; text-align:center; line-height:22px; font-size:12px; font-weight:bold;">&#10003;</span>
                  </td>
                  <td valign="top" style="padding:7px 0 7px 10px; font-size:14px; color:#1e293b;">
                    <strong>Important records:</strong> keep your insurance information and other essential documents somewhere safe, preferably with a digital backup.
                  </td>
                </tr>

              </table>

              <p style="margin:0 0 16px 0;">
                Save your photos and videos somewhere secure. If your property sustains damage, this documentation may help establish its condition before the hurricane.
              </p>

              <!-- SAFETY WARNING BANNER -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; background-color:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:12px 16px;">
                <tr>
                  <td>
                    <div style="font-size:13px; color:#92400e; line-height:1.5;">
                      <strong>Safety First:</strong> Please prioritize your family's safety, follow local emergency guidance, and never go outside or put yourself at risk to take photos during hazardous conditions.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px 0;">
                Since Hurricane Sally, I've started my own public adjusting company, <strong>IP Adjusting Group LLC</strong>. If your property is affected by Hurricane Isaias, my team and I are here to help you understand your options and navigate the insurance claim process.
              </p>

              <p style="margin:0 0 24px 0;">
                I sincerely hope you and your home make it through safely. If you need assistance, don't hesitate to reach out.
              </p>

              <!-- CLOSING & SIGNATURE -->
              <p style="margin:0 0 6px 0; color:#004E91;">Stay safe,</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#004E91; font-size:16px;">Peter Ramos</p>
              <p style="margin:0 0 2px 0; color:#475569; font-size:14px;">Owner | Public Adjuster</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#0071bc; font-size:14px;">IP Adjusting Group LLC</p>
              <p style="margin:0 0 15px 0; color:#64748b; font-style:italic; font-size:13px;">Advocating for what&#8217;s yours</p>

            </td>
          </tr>

          <!-- SIGNATURE / LOGO -->
          <tr>
            <td align="right" class="padding" style="padding:0px 42px 28px 0px; background-color:#F0F0F0;">
              <img src="${CONFIG_PETER.ASSETS.LOGO_URL}" alt="IP Adjusters" width="150" style="display:block; max-width:170px; height:auto; border:0;">
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer" bgcolor="#0071bc" align="center" style="padding:24px 20px; color:#ffffff; font-size:13px; font-family:Arial, Helvetica, sans-serif; line-height:1.5;">
              
              <!-- Redes Sociales / Links -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px auto;">
                <tr>
                  <td align="center">
                    <a href="https://www.instagram.com/ip_adjusting_group/" target="_blank" style="margin:0 12px; text-decoration:none !important; color:#ffffff !important; font-weight:bold; font-size:13px; display:inline-block; vertical-align:middle;">
                      <img src="${CONFIG_PETER.ASSETS.INSTAGRAM_ICON}" alt="Instagram" width="22" style="vertical-align:middle; border:0; display:inline-block; margin-right:6px;"><span style="color:#ffffff !important; text-decoration:none !important; vertical-align:middle;">Instagram</span>
                    </a>

                    <a href="https://wa.me/17722820862" target="_blank" style="margin:0 12px; text-decoration:none !important; color:#ffffff !important; font-weight:bold; font-size:13px; display:inline-block; vertical-align:middle;">
                      <img src="${CONFIG_PETER.ASSETS.WHATSAPP_ICON}" alt="WhatsApp" width="22" style="vertical-align:middle; border:0; display:inline-block; margin-right:6px;"><span style="color:#ffffff !important; text-decoration:none !important; vertical-align:middle;">WhatsApp</span>
                    </a>

                    <a href="https://www.ipadjustinggroup.com" target="_blank" style="margin:0 12px; text-decoration:none !important; color:#ffffff !important; font-weight:bold; font-size:13px; display:inline-block; vertical-align:middle;">
                      <img src="${CONFIG_PETER.ASSETS.WEBSITE_ICON}" alt="Website" width="22" style="vertical-align:middle; border:0; display:inline-block; margin-right:6px;"><span style="color:#ffffff !important; text-decoration:none !important; vertical-align:middle;">Website</span>
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Dirección y contacto (Forzado en blanco puro para evitar azul oscuro de Gmail) -->
              <p style="margin:16px 0 10px 0; font-size:13px; color:#ffffff; line-height:1.6;">
                <a href="https://maps.google.com/?q=1729+NW+Saint+Lucie+West+Blvd.+%231269,+Port+Saint+Lucie+FL,+34986" target="_blank" style="color:#ffffff !important; text-decoration:none !important;"><span style="color:#ffffff !important; text-decoration:none !important;">1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986</span></a><br>
                <a href="mailto:admin@ipadjustinggroup.com" style="color:#ffffff !important; text-decoration:underline !important; font-weight:bold;"><span style="color:#ffffff !important;">admin@ipadjustinggroup.com</span></a>
                <span style="color:#ffffff;"> | </span>
                <a href="tel:7722820862" style="color:#ffffff !important; text-decoration:none !important; font-weight:bold;"><span style="color:#ffffff !important; text-decoration:none !important;">(772) 282-0862</span></a>
              </p>

              <!-- Texto legal -->
              <p style="margin:16px 20px 0px 20px; font-size:9px; color:#e0f2fe; line-height:1.35;">
                IP Adjusting Group is a licensed public adjusting firm proudly serving homeowners and business owners across Florida. The information in this email is meant to be general in nature and should not be taken as legal or insurance advice. For specific guidance about your policy or claim, please reach out to your licensed insurance professional or attorney.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  return { plainText, htmlBody };
}

// ============================================================================
// HELPER DE ENVÍO CON NOMBRE CORPORATIVO
// ============================================================================
function sendSingleEmailPeter(recipient, subject, plainText, htmlBody) {
  const options = {
    htmlBody: htmlBody,
    name: CONFIG_PETER.SENDER_NAME
  };
  try {
    GmailApp.sendEmail(recipient, subject, plainText, options);
  } catch (e) {
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: plainText,
      htmlBody: htmlBody,
      name: CONFIG_PETER.SENDER_NAME
    });
  }
}

// ============================================================================
// ENVIAR EMAIL DE PRUEBA
// ============================================================================
function sendTestEmailPeter() {
  const targetEmail = CONFIG_PETER.TEST_EMAIL_ADDRESS || Session.getActiveUser().getEmail();
  const content = getEmailContentPeter('Peter');
  
  Logger.log(`>>> Enviando email de prueba a: ${targetEmail}`);
  sendSingleEmailPeter(
    targetEmail,
    `[PRUEBA] ${CONFIG_PETER.EMAIL_SUBJECT}`,
    content.plainText,
    content.htmlBody
  );
  Logger.log(`>>> ✅ ¡Email de prueba enviado exitosamente a ${targetEmail}! Revisa tu bandeja de entrada.`);
}

// ============================================================================
// ENVÍO MASIVO (DIRECTO, SIN BLOQUEOS NI POPUPS QUE CUELGUEN LA EJECUCIÓN)
// ============================================================================
function sendMassEmailsPeter() {
  Logger.log('========================================================');
  Logger.log('>>> INICIANDO PROCESO DE ENVÍO (PETER LIST)...');
  
  const sheet = getTargetSheetPeter();
  if (!sheet) {
    Logger.log('Error: No se encontró la hoja "Peter list" en este libro.');
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log(`>>> Hoja encontrada: "${sheet.getName()}" con ${lastRow} filas registradas.`);
  
  if (lastRow < 2) {
    Logger.log('La hoja no tiene filas de datos para procesar.');
    return;
  }

  // Asegurar cabecera en la columna de estado (Col G)
  const headerValue = sheet.getRange(1, CONFIG_PETER.STATUS_COLUMN_INDEX).getValue();
  if (!headerValue) {
    sheet.getRange(1, CONFIG_PETER.STATUS_COLUMN_INDEX).setValue(CONFIG_PETER.STATUS_HEADER_NAME).setFontWeight('bold');
    SpreadsheetApp.flush();
  }

  Logger.log(`>>> Modo de prueba (IS_TEST_MODE): ${CONFIG_PETER.IS_TEST_MODE}`);
  Logger.log(`>>> Leyendo datos de la hoja...`);

  const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.max(CONFIG_PETER.STATUS_COLUMN_INDEX, sheet.getLastColumn()));
  const rows = dataRange.getValues();

  const startTime = new Date().getTime();
  const maxExecutionTimeMs = 5 * 60 * 1000; // 5 minutos máximo para Apps Script

  let sentCount = 0;
  let skippedCount = 0;
  let invalidEmailCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    // Corte por límite de tanda
    if (sentCount >= CONFIG_PETER.MAX_EMAILS_PER_BATCH) {
      Logger.log(`[INFO] Se alcanzó el límite de ${CONFIG_PETER.MAX_EMAILS_PER_BATCH} correos por tanda. Proceso en pausa.`);
      break;
    }

    // Corte por tiempo de seguridad (5 minutos)
    if (new Date().getTime() - startTime > maxExecutionTimeMs) {
      Logger.log('[INFO] Límite de tiempo de seguridad (5 min) alcanzado. Pausando para no exceder límite de Google.');
      break;
    }

    const rowNumber = i + 2;
    const row = rows[i];
    const clientName = String(row[CONFIG_PETER.COL_CLIENT - 1] || '').trim();
    const rawEmail = String(row[CONFIG_PETER.COL_EMAIL - 1] || '').trim();
    const currentStatus = String(row[CONFIG_PETER.STATUS_COLUMN_INDEX - 1] || '').trim();

    // 1. Si ya fue enviado previamente, omitir
    if (currentStatus.toUpperCase().startsWith('SENT')) {
      skippedCount++;
      continue;
    }

    // 2. Si no tiene correo o formato inválido
    if (!isValidEmailPeter(rawEmail)) {
      if (rawEmail && !currentStatus) {
        sheet.getRange(rowNumber, CONFIG_PETER.STATUS_COLUMN_INDEX).setValue('SKIPPED: Invalid/No email');
      }
      invalidEmailCount++;
      continue;
    }

    // 3. Preparar destinatario y asunto
    const content = getEmailContentPeter(clientName);
    const recipient = CONFIG_PETER.IS_TEST_MODE ? CONFIG_PETER.TEST_EMAIL_ADDRESS : rawEmail;
    const testSubjectPrefix = CONFIG_PETER.IS_TEST_MODE ? `[PRUEBA -> ${clientName}] ` : '';
    const subject = testSubjectPrefix + CONFIG_PETER.EMAIL_SUBJECT;

    try {
      Logger.log(`[Fila ${rowNumber}] Enviando a ${clientName || 'Cliente'} (${recipient})...`);
      
      sendSingleEmailPeter(recipient, subject, content.plainText, content.htmlBody);

      const nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd HH:mm');
      const statusText = CONFIG_PETER.IS_TEST_MODE 
        ? `TEST SENT to ${recipient} (${nowFormatted})` 
        : `SENT (${nowFormatted})`;

      sheet.getRange(rowNumber, CONFIG_PETER.STATUS_COLUMN_INDEX).setValue(statusText);
      // Forzar que Google Sheets pinte la celda inmediatamente en pantalla
      SpreadsheetApp.flush();
      
      sentCount++;
      Logger.log(`[Fila ${rowNumber}] ✅ Enviado con éxito. (Total enviados: ${sentCount})`);

      // En modo prueba, detenerse tras 2 correos
      if (CONFIG_PETER.IS_TEST_MODE && sentCount >= 2) {
        Logger.log('[MODO PRUEBA] Se completaron 2 envíos de verificación. Deteniendo prueba.');
        break;
      }

      // Pausa anti-spam
      Utilities.sleep(CONFIG_PETER.DELAY_BETWEEN_EMAILS_MS);

    } catch (err) {
      Logger.log(`[Fila ${rowNumber}] ❌ ERROR al enviar a ${rawEmail}: ${err.toString()}`);
      sheet.getRange(rowNumber, CONFIG_PETER.STATUS_COLUMN_INDEX).setValue(`ERROR: ${err.message}`);
      SpreadsheetApp.flush();
      errorCount++;

      if (err.message && err.message.toLowerCase().includes('limit')) {
        Logger.log('Límite de envíos de Google alcanzado.');
        break;
      }
    }
  }

  Logger.log('========================================================');
  Logger.log('RESUMEN FINAL (PETER LIST):');
  Logger.log(`✅ Enviados con éxito: ${sentCount}`);
  Logger.log(`⏭️ Omitidos (ya enviados): ${skippedCount}`);
  Logger.log(`⚠️ Correos vacíos o no válidos: ${invalidEmailCount}`);
  Logger.log(`❌ Errores: ${errorCount}`);
  Logger.log('========================================================');
}

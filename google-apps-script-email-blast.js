/**
 * GOOGLE APPS SCRIPT: Envío Masivo de Correos con Intervalo Anti-Spam
 * Hoja objetivo: "Ivan List" (o "Iván list") en "Master List IP Adjusting"
 * 
 * CARACTERÍSTICAS:
 * - Plantilla HTML con los estilos, colores corporativos y pie de página de IP Adjusting Group.
 * - Intervalo configurable entre envíos (evita bloqueos y detección de spam).
 * - Control de duplicados: Registra la fecha de envío en la Columna G ("EMAIL STATUS").
 * - Verificación de cuota diaria de Gmail antes de comenzar.
 * - Validación de direcciones de correo (ignora vacíos, "No email", etc.).
 * - Envío de correo de prueba a tu propia dirección antes del envío masivo.
 * - Versión dual: HTML profesional responsive + Texto plano.
 * - Protección contra tiempo límite de Apps Script (corte seguro antes de los 6 minutos).
 */

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
  // Posibles nombres de la hoja (maneja con o sin tilde y mayúsculas)
  POSSIBLE_SHEET_NAMES: ['Ivan List', 'Iván list', 'Iván List', 'Ivan list'],

  // Asunto del correo
  EMAIL_SUBJECT: 'Hurricane Preparation Checklist | Iván Hernández (IP Adjusting Group)',

  // Intervalo en milisegundos entre cada envío (3000 ms = 3 segundos anti-spam)
  DELAY_BETWEEN_EMAILS_MS: 3000,

  // Límite máximo de correos por tanda para no exceder los 6 min de Apps Script
  MAX_EMAILS_PER_BATCH: 75,

  // Columna para registrar el estado de envío (Columna G = 7)
  STATUS_COLUMN_INDEX: 7,
  STATUS_HEADER_NAME: 'EMAIL STATUS (HURRICANE)',

  // Correo de prueba predeterminado
  TEST_EMAIL_ADDRESS: 'ivanloza88@gmail.com',

  // 🔒 MODO PRUEBA DE SEGURIDAD (true / false):
  // Si está en true: Ningún cliente recibirá correos. Todos los envíos se redirigen a ivanloza88@gmail.com.
  // Si está en false: Se envían a los clientes reales de la hoja.
  IS_TEST_MODE: false,

  // Índices de columnas en "Iván list"
  COL_CLIENT: 1, // Columna A: CLIENT
  COL_EMAIL: 4,  // Columna D: EMAIL

  // Assets corporativos de IP Adjusting Group (Google Drive IDs)
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
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Campaña Huracán')
    .addItem('1. Enviar Email de Prueba a ivanloza88@gmail.com', 'sendTestEmail')
    .addSeparator()
    .addItem('2. Iniciar Envío Masivo (Ivan List)', 'sendMassHurricaneEmails')
    .addSeparator()
    .addItem('Configurar Cabecera de Estado (Col G)', 'setupEmailStatusColumn')
    .addToUi();
}

// ============================================================================
// UTILIDADES: OBTENER HOJA Y VALIDAR CORREO
// ============================================================================
function getTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const name of CONFIG.POSSIBLE_SHEET_NAMES) {
    const sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }
  // Búsqueda insensible a mayúsculas si no se encontró coincidencia exacta
  const sheets = ss.getSheets();
  for (const s of sheets) {
    const clean = s.getName().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (clean.includes('ivan') && clean.includes('list')) {
      return s;
    }
  }
  return null;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (clean === 'no email' || clean === 'none' || clean === 'n/a') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(clean);
}

// ============================================================================
// CONFIGURAR COLUMNA DE ESTADO
// ============================================================================
function setupEmailStatusColumn() {
  const sheet = getTargetSheet();
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error: No se encontró la hoja "Ivan List".');
    return;
  }
  const headerCell = sheet.getRange(1, CONFIG.STATUS_COLUMN_INDEX);
  headerCell.setValue(CONFIG.STATUS_HEADER_NAME);
  headerCell.setFontWeight('bold');
  headerCell.setBackground('#d6d9e0');
  SpreadsheetApp.getUi().alert(`Columna "${CONFIG.STATUS_HEADER_NAME}" configurada en la columna G.`);
}

// ============================================================================
// CONTENIDO DEL MENSAJE (TEXTO PLANO Y HTML CORPORATIVO)
// ============================================================================
function getEmailContent(clientName) {
  const displayName = clientName ? clientName.trim() : '';
  const greeting = displayName ? `Hello ${displayName},` : 'Hello,';

  // 1. Versión Texto Plano (para clientes sin soporte HTML o máxima entregabilidad)
  const plainText = 
`${greeting}

This is Iván Hernández, your previous public adjuster for Hurricane Sally.

I wanted to personally reach out because another hurricane is approaching the Florida Panhandle, and I know you have been through hurricanes before. Still, it never hurts to have a quick checklist and make sure you’re prepared before the conditions deteriorate.

Since I helped you with your previous claim, I know firsthand how important preparation and documentation can be when dealing with hurricane damage.

Before the Hurricane Arrives - Quick Checklist

- Document your property
Take photos and a video walkthrough of your home, roof, exterior, vehicles, and valuable belongings. This creates a record of your property’s condition before the hurricane.

- Secure outdoor items
Bring in patio furniture, decorations, grills, trash cans, plants, and anything else that could become airborne.

- Clear gutters and drains
Remove leaves and debris so rainwater has somewhere to go and can drain properly.

- Protect important documents
Keep your insurance policy, identification, passports, financial documents, and other important records somewhere safe. Consider backing them up digitally.

- Charge everything
Charge your phones, laptops, flashlights, and especially your portable power banks before the power goes out.

- Have essentials ready
Make sure you have enough water, food, medications, batteries, flashlights, and other necessities for several days.

- Prepare for your pets
Have enough food, water, medications, and supplies for them as well.

- Know where you will shelter
Identify the safest area of your home, away from windows, and make sure everyone in the household knows the plan.

- Know your surroundings
Think about potential risks around your property trees, loose structures, flooding, storm surge, or anything that could cause damage.

One thing I especially recommend:

Walk through your home with your phone camera today.

Open closets, record your furniture and electronics, show the condition of your ceilings, walls, floors, and exterior, and save the video somewhere safe.

Hopefully, you’ll never need those photos.

But if your property is damaged by the hurricane, having a record of what your home looked like before the hurricane can be extremely valuable when documenting a claim.

I now own IP Adjusting Group LLC, and if you need help after the hurricane, my team and I are here to help you navigate the process.

For now, stay safe, follow local emergency guidance, and take care of yourself and your family.

If you have any questions or need assistance after the hurricane, don’t hesitate to reach out.

Stay safe,

Iván Hernández
Owner | Public Adjuster
IP Adjusting Group LLC
Advocating for what’s yours

1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986
admin@ipadjustinggroup.com | (772) 282-0862
`;

  // 2. Versión HTML con los estilos y colores corporativos de IP Adjusting Group
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hurricane Preparation Checklist</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; display:block; border:0; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; height:100% !important; }
    @media screen and (max-width:600px){
      .container { width:100% !important; }
      .hero, .content, .footer { width:100% !important; }
      img { max-width:100% !important; height:auto !important; }
      .padding { padding:15px !important; }
      .align-center { text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#d6d9e0; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#d6d9e0">
    <tr>
      <td align="center" style="padding: 20px 0;">

        <!-- Container (600px) -->
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden;">

          <!-- BRAND HEADER -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:24px 20px 20px 20px; border-bottom:3px solid #0071bc;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${CONFIG.ASSETS.LOGO_URL}" alt="IP Adjusting Group" width="180" style="display:block; max-width:220px; height:auto; border:0; margin:0 auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td class="content" style="padding:30px 45px 15px 45px; font-size:15px; color:#004E91; line-height:1.6; font-family:Arial, Helvetica, sans-serif; background-color:#F0F0F0;">
              
              <p style="margin:0 0 16px 0; font-size:16px;">${greeting}</p>
              
              <p style="margin:0 0 16px 0;">
                This is <strong>Iván Hernández</strong>, your previous public adjuster for Hurricane Sally.
              </p>
              
              <p style="margin:0 0 16px 0;">
                I wanted to personally reach out because another hurricane is approaching the Florida Panhandle, and I know you have been through hurricanes before. Still, it never hurts to have a quick checklist and make sure you’re prepared before the conditions deteriorate.
              </p>
              
              <p style="margin:0 0 24px 0;">
                Since I helped you with your previous claim, I know firsthand how important preparation and documentation can be when dealing with hurricane damage.
              </p>

              <!-- CHECKLIST TITLE -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td style="border-bottom:2px solid #0071bc; padding-bottom:6px;">
                    <span style="font-size:18px; font-weight:bold; color:#004E91;">
                      Before the Hurricane Arrives - Quick Checklist
                    </span>
                  </td>
                </tr>
              </table>

              <!-- CHECKLIST ITEMS -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Document your property</strong><br>
                    <span style="color:#333333; font-size:14px;">Take photos and a video walkthrough of your home, roof, exterior, vehicles, and valuable belongings. This creates a record of your property’s condition before the hurricane.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Secure outdoor items</strong><br>
                    <span style="color:#333333; font-size:14px;">Bring in patio furniture, decorations, grills, trash cans, plants, and anything else that could become airborne.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Clear gutters and drains</strong><br>
                    <span style="color:#333333; font-size:14px;">Remove leaves and debris so rainwater has somewhere to go and can drain properly.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Protect important documents</strong><br>
                    <span style="color:#333333; font-size:14px;">Keep your insurance policy, identification, passports, financial documents, and other important records somewhere safe. Consider backing them up digitally.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Charge everything</strong><br>
                    <span style="color:#333333; font-size:14px;">Charge your phones, laptops, flashlights, and especially your portable power banks before the power goes out.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Have essentials ready</strong><br>
                    <span style="color:#333333; font-size:14px;">Make sure you have enough water, food, medications, batteries, flashlights, and other necessities for several days.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Prepare for your pets</strong><br>
                    <span style="color:#333333; font-size:14px;">Have enough food, water, medications, and supplies for them as well.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Know where you will shelter</strong><br>
                    <span style="color:#333333; font-size:14px;">Identify the safest area of your home, away from windows, and make sure everyone in the household knows the plan.</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
                <tr>
                  <td valign="top" width="18" style="font-size:18px; color:#0071bc; line-height:1.2;">&bull;</td>
                  <td style="font-size:15px; color:#004E91; line-height:1.5;">
                    <strong>Know your surroundings</strong><br>
                    <span style="color:#333333; font-size:14px;">Think about potential risks around your property trees, loose structures, flooding, storm surge, or anything that could cause damage.</span>
                  </td>
                </tr>
              </table>

              <!-- HIGHLIGHT BOX -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; background-color:#ffffff; border-left:4px solid #0071bc; border-radius:4px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px 0; font-weight:bold; color:#004E91; font-size:15px;">One thing I especially recommend:</p>
                    <p style="margin:0 0 8px 0; font-weight:bold; color:#0071bc; font-size:15px;">Walk through your home with your phone camera today.</p>
                    <p style="margin:0; font-size:14px; color:#333333; line-height:1.5;">
                      Open closets, record your furniture and electronics, show the condition of your ceilings, walls, floors, and exterior, and save the video somewhere safe.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0;">Hopefully, you’ll never need those photos.</p>
              
              <p style="margin:0 0 16px 0;">
                But if your property is damaged by the hurricane, having a record of what your home looked like before the hurricane can be extremely valuable when documenting a claim.
              </p>
              
              <p style="margin:0 0 16px 0;">
                I now own <strong>IP Adjusting Group LLC</strong>, and if you need help after the hurricane, my team and I are here to help you navigate the process.
              </p>
              
              <p style="margin:0 0 16px 0;">
                For now, stay safe, follow local emergency guidance, and take care of yourself and your family.
              </p>
              
              <p style="margin:0 0 24px 0;">
                If you have any questions or need assistance after the hurricane, don’t hesitate to reach out.
              </p>

              <!-- CLOSING -->
              <p style="margin:0 0 4px 0; color:#004E91;">Stay safe,</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#004E91; font-size:16px;">Iván Hernández</p>
              <p style="margin:0 0 2px 0; color:#555555; font-size:14px;">Owner | Public Adjuster</p>
              <p style="margin:0 0 2px 0; font-weight:bold; color:#0071bc; font-size:14px;">IP Adjusting Group LLC</p>
              <p style="margin:0 0 15px 0; color:#666666; font-style:italic; font-size:13px;">Advocating for what’s yours</p>

            </td>
          </tr>

          <!-- SIGNATURE / LOGO -->
          <tr>
            <td align="right" class="padding" style="padding:0px 45px 30px 0px; background-color:#F0F0F0;">
              <img src="${CONFIG.ASSETS.LOGO_URL}" alt="IP Adjusters" width="150" style="display:block; max-width:180px; height:auto; border:0;">
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer" bgcolor="#0071bc" align="center" style="padding:22px; color:#ffffff; font-size:13px; font-family:Arial, Helvetica, sans-serif; line-height:1.4;">
              
              <!-- Social icons con texto -->
              <p style="margin:0 0 12px 0;">
                <a href="https://www.instagram.com/ip_adjusting_group/" style="margin:0 10px; text-decoration:underline; color:#ffffff; font-weight:normal;">
                  <img src="${CONFIG.ASSETS.INSTAGRAM_ICON}" alt="Instagram" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">Instagram
                </a>

                <a href="https://wa.me/17722820862" style="margin:0 10px; text-decoration:none; color:#ffffff; font-weight:normal;">
                  <img src="${CONFIG.ASSETS.WHATSAPP_ICON}" alt="WhatsApp" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">WhatsApp
                </a>

                <a href="https://www.ipadjustinggroup.com" style="margin:0 10px; text-decoration:underline; color:#ffffff; font-weight:normal;">
                  <img src="${CONFIG.ASSETS.WEBSITE_ICON}" alt="Website" width="24" style="vertical-align:middle; border:0; display:inline-block; margin-right:5px;">Website
                </a>
              </p>

              <!-- Dirección y contacto -->
              <p style="margin:25px 0 10px 0; font-size:13px;">
                1729 NW Saint Lucie West Blvd. #1269, Port Saint Lucie FL, 34986<br>
                admin@ipadjustinggroup.com | (772) 282-0862
              </p>

              <!-- Texto legal -->
              <p style="margin:20px 25px 0px 25px; font-size:9px; color:#ffffff; line-height:1.3;">
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
function sendSingleEmail(recipient, subject, plainText, htmlBody) {
  const options = {
    htmlBody: htmlBody,
    name: 'Iván Hernández | IP Adjusting Group'
  };
  try {
    GmailApp.sendEmail(recipient, subject, plainText, options);
  } catch (e) {
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: plainText,
      htmlBody: htmlBody,
      name: 'Iván Hernández | IP Adjusting Group'
    });
  }
}

// ============================================================================
// ENVIAR EMAIL DE PRUEBA
// ============================================================================
function sendTestEmail() {
  const targetEmail = CONFIG.TEST_EMAIL_ADDRESS || Session.getActiveUser().getEmail();
  const content = getEmailContent('Iván');
  
  Logger.log(`Enviando email de prueba a: ${targetEmail}`);
  sendSingleEmail(
    targetEmail,
    `[PRUEBA] ${CONFIG.EMAIL_SUBJECT}`,
    content.plainText,
    content.htmlBody
  );
  Logger.log('¡Email de prueba enviado exitosamente!');
  
  try {
    SpreadsheetApp.getUi().alert(`¡Correo de prueba enviado con éxito a ${targetEmail}!\nRevisa tu bandeja de entrada.`);
  } catch (e) {
    // Si se ejecuta desde el editor y no hay UI activa
  }
}

/**
 * Función directa para ejecutar desde el editor de Apps Script:
 * Selecciona "sendDirectTestToIvanLoza" en el menú superior del editor y pulsa "Ejecutar".
 */
function sendDirectTestToIvanLoza() {
  const targetEmail = 'ivanloza88@gmail.com';
  const content = getEmailContent('Iván');
  Logger.log(`>>> Iniciando envío directo de prueba a ${targetEmail}...`);
  sendSingleEmail(
    targetEmail,
    `[PRUEBA] ${CONFIG.EMAIL_SUBJECT}`,
    content.plainText,
    content.htmlBody
  );
  Logger.log(`>>> ✅ Email de prueba enviado exitosamente a ${targetEmail}. Revisa tu bandeja de entrada en Gmail.`);
}

/**
 * ⚡ FUNCIÓN RECOMENDADA PARA EL EDITOR DE APPS SCRIPT:
 * Ejecuta el envío DIRECTAMENTE sin popups ni bloqueos.
 * Muestra el progreso en tiempo real en la consola de ejecución (Logs).
 */
function runMassEmailsFromEditor() {
  executeMassEmails(false);
}

/**
 * Función que se ejecuta al pulsar en el menú de la hoja de Google Sheets.
 */
function sendMassHurricaneEmails() {
  executeMassEmails(true);
}

// ============================================================================
// MOTOR DE ENVÍO MASIVO (CON LOGS EN VIVO Y ACTUALIZACIÓN EN TIEMPO REAL)
// ============================================================================
function executeMassEmails(isFromSheetMenu) {
  Logger.log('========================================================');
  Logger.log('>>> INICIANDO PROCESO DE ENVÍO...');
  
  const sheet = getTargetSheet();
  if (!sheet) {
    const errMsg = 'Error: No se encontró la hoja "Ivan List" (o "Iván list") en este libro.';
    Logger.log(errMsg);
    if (isFromSheetMenu) SpreadsheetApp.getUi().alert(errMsg);
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log(`>>> Hoja encontrada: "${sheet.getName()}" con ${lastRow} filas registradas.`);
  
  if (lastRow < 2) {
    const emptyMsg = 'La hoja no tiene filas de datos para procesar.';
    Logger.log(emptyMsg);
    if (isFromSheetMenu) SpreadsheetApp.getUi().alert(emptyMsg);
    return;
  }

  // Asegurar cabecera en la columna de estado (Col G)
  const headerValue = sheet.getRange(1, CONFIG.STATUS_COLUMN_INDEX).getValue();
  if (!headerValue) {
    sheet.getRange(1, CONFIG.STATUS_COLUMN_INDEX).setValue(CONFIG.STATUS_HEADER_NAME).setFontWeight('bold');
    SpreadsheetApp.flush();
  }

  // Si se ejecuta desde el menú visual de Google Sheets, pedir confirmación
  if (isFromSheetMenu) {
    const ui = SpreadsheetApp.getUi();
    const modeText = CONFIG.IS_TEST_MODE 
      ? '⚠️ [MODO DE PRUEBA ACTIVO]\nLos correos NO se enviarán a los clientes. Se redirigirán a: ' + CONFIG.TEST_EMAIL_ADDRESS + ' (máximo 2 correos para verificación).\n\n' 
      : '🚀 [MODO DE PRODUCCIÓN REAL]\nLos correos se enviarán a los clientes reales de la hoja.\n\n';

    const confirm = ui.alert(
      CONFIG.IS_TEST_MODE ? 'Confirmar Prueba de Envío' : 'Confirmar Envío Masivo Real',
      modeText +
      `Hoja: "${sheet.getName()}"\n` +
      `• Intervalo anti-spam: ${CONFIG.DELAY_BETWEEN_EMAILS_MS / 1000} seg entre envíos.\n` +
      `• Límite por tanda: ${CONFIG.MAX_EMAILS_PER_BATCH} correos.\n` +
      `• Solo procesará filas sin estado "SENT" en Col G.\n\n` +
      `¿Deseas iniciar ahora?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) {
      Logger.log('Envío cancelado por el usuario en la ventana emergente.');
      return;
    }
  }

  Logger.log(`>>> Modo de prueba (IS_TEST_MODE): ${CONFIG.IS_TEST_MODE}`);
  Logger.log(`>>> Leyendo datos de la hoja...`);

  const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.max(CONFIG.STATUS_COLUMN_INDEX, sheet.getLastColumn()));
  const rows = dataRange.getValues();

  const startTime = new Date().getTime();
  const maxExecutionTimeMs = 5 * 60 * 1000; // 5 minutos máximo para Apps Script

  let sentCount = 0;
  let skippedCount = 0;
  let invalidEmailCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    // Corte por límite de tanda
    if (sentCount >= CONFIG.MAX_EMAILS_PER_BATCH) {
      Logger.log(`[INFO] Se alcanzó el límite de ${CONFIG.MAX_EMAILS_PER_BATCH} correos por tanda. Proceso en pausa.`);
      break;
    }

    // Corte por tiempo de seguridad (5 minutos)
    if (new Date().getTime() - startTime > maxExecutionTimeMs) {
      Logger.log('[INFO] Límite de tiempo de seguridad (5 min) alcanzado. Pausando para no exceder límite de Google.');
      break;
    }

    const rowNumber = i + 2;
    const row = rows[i];
    const clientName = String(row[CONFIG.COL_CLIENT - 1] || '').trim();
    const rawEmail = String(row[CONFIG.COL_EMAIL - 1] || '').trim();
    const currentStatus = String(row[CONFIG.STATUS_COLUMN_INDEX - 1] || '').trim();

    // 1. Si ya fue enviado previamente, omitir
    if (currentStatus.toUpperCase().startsWith('SENT')) {
      skippedCount++;
      continue;
    }

    // 2. Si no tiene correo o formato inválido
    if (!isValidEmail(rawEmail)) {
      if (rawEmail && !currentStatus) {
        sheet.getRange(rowNumber, CONFIG.STATUS_COLUMN_INDEX).setValue('SKIPPED: Invalid/No email');
      }
      invalidEmailCount++;
      continue;
    }

    // 3. Preparar destinatario y asunto
    const content = getEmailContent(clientName);
    const recipient = CONFIG.IS_TEST_MODE ? CONFIG.TEST_EMAIL_ADDRESS : rawEmail;
    const testSubjectPrefix = CONFIG.IS_TEST_MODE ? `[PRUEBA -> ${clientName}] ` : '';
    const subject = testSubjectPrefix + CONFIG.EMAIL_SUBJECT;

    try {
      Logger.log(`[Fila ${rowNumber}] Enviando a ${clientName || 'Cliente'} (${recipient})...`);
      
      sendSingleEmail(recipient, subject, content.plainText, content.htmlBody);

      const nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd HH:mm');
      const statusText = CONFIG.IS_TEST_MODE 
        ? `TEST SENT to ${recipient} (${nowFormatted})` 
        : `SENT (${nowFormatted})`;

      sheet.getRange(rowNumber, CONFIG.STATUS_COLUMN_INDEX).setValue(statusText);
      // Forzar que Google Sheets pinte la celda inmediatamente en pantalla
      SpreadsheetApp.flush();
      
      sentCount++;
      Logger.log(`[Fila ${rowNumber}] ✅ Enviado con éxito. (Total enviados: ${sentCount})`);

      // En modo prueba, detenerse tras 2 correos
      if (CONFIG.IS_TEST_MODE && sentCount >= 2) {
        Logger.log('[MODO PRUEBA] Se completaron 2 envíos de verificación. Deteniendo prueba.');
        break;
      }

      // Pausa anti-spam
      Utilities.sleep(CONFIG.DELAY_BETWEEN_EMAILS_MS);

    } catch (err) {
      Logger.log(`[Fila ${rowNumber}] ❌ ERROR al enviar a ${rawEmail}: ${err.toString()}`);
      sheet.getRange(rowNumber, CONFIG.STATUS_COLUMN_INDEX).setValue(`ERROR: ${err.message}`);
      SpreadsheetApp.flush();
      errorCount++;

      if (err.message && err.message.toLowerCase().includes('limit')) {
        Logger.log('Límite de envíos de Google alcanzado.');
        break;
      }
    }
  }

  Logger.log('========================================================');
  Logger.log(`RESUMEN FINAL:`);
  Logger.log(`✅ Enviados con éxito: ${sentCount}`);
  Logger.log(`⏭️ Omitidos (ya enviados): ${skippedCount}`);
  Logger.log(`⚠️ Correos vacíos o no válidos: ${invalidEmailCount}`);
  Logger.log(`❌ Errores: ${errorCount}`);
  Logger.log('========================================================');

  const summaryMsg = 
    `Resumen del proceso:\n\n` +
    `✅ Correos enviados con éxito: ${sentCount}\n` +
    `⏭️ Omitidos (ya enviados): ${skippedCount}\n` +
    `⚠️ Correos inválidos o vacíos: ${invalidEmailCount}\n` +
    `❌ Errores: ${errorCount}\n\n` +
    (sentCount >= CONFIG.MAX_EMAILS_PER_BATCH 
      ? `Nota: Se alcanzó el límite de ${CONFIG.MAX_EMAILS_PER_BATCH} correos por tanda. Si aún quedan clientes pendientes, simplemente vuelve a pulsar "Iniciar Envío Masivo".` 
      : `El proceso ha finalizado para todos los registros pendientes.`);

  if (isFromSheetMenu) {
    SpreadsheetApp.getUi().alert('Envío Masivo Completado', summaryMsg, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

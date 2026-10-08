/**
 * GOOGLE APPS SCRIPT: Sincronización de Nuevos Claims hacia IP Scheduling Manager
 * 
 * Instrucciones de instalación:
 * 1. En tu Google Sheet ("Master List IP Adjusting"), ve al menú superior: Extensiones > Apps Script.
 * 2. Borra cualquier código existente y pega este archivo completo.
 * 3. Guarda el proyecto (icono de disco o Ctrl+S / Cmd+S).
 * 4. Recarga tu Google Sheet. Verás un nuevo menú llamado "⚡ Scheduling Manager".
 */

// URL del Endpoint en Supabase Edge Function
const WEBHOOK_URL = 'https://edbfyjhbctbxhnqfvrgt.supabase.co/functions/v1/sync-sheet-claim';
const TARGET_SHEET_NAME = 'New ClientList';

// Nombres o índices de las columnas clave
const COL_INDEX = {
  ADJUSTER: 2,          // Col B
  CLIENT: 4,            // Col D
  PHONE: 5,             // Col E
  EMAIL: 6,             // Col F
  INSURANCE_COMPANY: 7, // Col G
  ADDRESS: 8,           // Col H
  POLICY_NO: 9,         // Col I
  CLAIM_NO: 10,         // Col J
  TYPE_OF_LOSS: 11,     // Col K
  DATE_OF_LOSS: 12,     // Col L
  SYNC_STATUS: 25       // Col Y (o la columna donde se marcará el estado de sincronización)
};

/**
 * Agrega un menú personalizado en Google Sheets al abrir el archivo
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Scheduling Manager')
    .addItem('Sincronizar Nuevos Claims', 'syncNewClaims')
    .addItem('Configurar columna de sincronización', 'setupSyncColumn')
    .addToUi();
}

/**
 * Prepara la cabecera de la columna de sincronización (Columna Y)
 */
function setupSyncColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`No se encontró la hoja "${TARGET_SHEET_NAME}".`);
    return;
  }
  sheet.getRange(1, COL_INDEX.SYNC_STATUS).setValue('SYNCED TO APP');
  sheet.getRange(1, COL_INDEX.SYNC_STATUS).setFontWeight('bold');
  SpreadsheetApp.getUi().alert('Columna "SYNCED TO APP" configurada en la columna Y.');
}

/**
 * Sincroniza únicamente las filas que no tengan el estado "SYNCED"
 */
function syncNewClaims() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`No se encontró la hoja "${TARGET_SHEET_NAME}".`);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No hay filas de datos para procesar.');
    return;
  }

  // Asegurar encabezado en la columna de sincronización
  if (!sheet.getRange(1, COL_INDEX.SYNC_STATUS).getValue()) {
    sheet.getRange(1, COL_INDEX.SYNC_STATUS).setValue('SYNCED TO APP');
    sheet.getRange(1, COL_INDEX.SYNC_STATUS).setFontWeight('bold');
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.max(COL_INDEX.SYNC_STATUS, sheet.getLastColumn()));
  const rows = dataRange.getValues();

  let countSent = 0;
  let countSkipped = 0;
  let countErrors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const claimNo = String(row[COL_INDEX.CLAIM_NO - 1] || '').trim();
    const syncStatus = String(row[COL_INDEX.SYNC_STATUS - 1] || '').trim();

    // Si no tiene número de claim, saltar fila
    if (!claimNo) continue;

    // Si ya está sincronizado, ignorar para no reprocesar históricos
    if (syncStatus.toUpperCase().indexOf('SYNCED') !== -1) {
      countSkipped++;
      continue;
    }

    const payload = {
      adjuster: String(row[COL_INDEX.ADJUSTER - 1] || '').trim(),
      client: String(row[COL_INDEX.CLIENT - 1] || '').trim(),
      phone: String(row[COL_INDEX.PHONE - 1] || '').trim(),
      email: String(row[COL_INDEX.EMAIL - 1] || '').trim(),
      carrier: String(row[COL_INDEX.INSURANCE_COMPANY - 1] || '').trim(),
      address: String(row[COL_INDEX.ADDRESS - 1] || '').trim(),
      policyNumber: String(row[COL_INDEX.POLICY_NO - 1] || '').trim(),
      claimNumber: claimNo,
      typeOfLoss: String(row[COL_INDEX.TYPE_OF_LOSS - 1] || '').trim(),
      dateOfLoss: row[COL_INDEX.DATE_OF_LOSS - 1],
      createInitialEvent: false // Solo crea el Claim en el sistema, sin evento inicial automático
    };

    try {
      const response = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      const json = JSON.parse(responseText);

      if (responseCode === 200 || responseCode === 201) {
        if (json.status === 'created') {
          sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(`SYNCED (${new Date().toLocaleDateString()})`);
          countSent++;
        } else if (json.status === 'already_exists') {
          sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue('SYNCED (Already existed)');
          countSkipped++;
        }
      } else {
        sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(`ERROR: ${json.error || responseCode}`);
        countErrors++;
      }
    } catch (err) {
      Logger.log(`Error al enviar fila ${rowNumber}: ${err.toString()}`);
      sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(`ERROR: ${err.message}`);
      countErrors++;
    }
  }

  const summary = `Sincronización finalizada:\n- Nuevos claims enviados: ${countSent}\n- Omitidos (ya sincronizados): ${countSkipped}\n- Errores: ${countErrors}`;
  SpreadsheetApp.getUi().alert(summary);
}

/**
 * Trigger automático opcional (On Edit):
 * Si se desea que al escribir en la columna CLAIM# se envíe de inmediato sin presionar el botón.
 */
function onEditTrigger(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TARGET_SHEET_NAME) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Si editaron la columna de CLAIM# o la fila está completa
  if (row > 1 && col === COL_INDEX.CLAIM_NO) {
    const syncCell = sheet.getRange(row, COL_INDEX.SYNC_STATUS);
    if (!syncCell.getValue()) {
      // Opcional: invocar syncNewClaims() o procesar solo esta fila
      syncNewClaims();
    }
  }
}

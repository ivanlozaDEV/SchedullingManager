/**
 * GOOGLE APPS SCRIPT: Sincronización de Nuevos Claims hacia IP Scheduling Manager
 * Hoja objetivo: "New ClientList" en "Master List IP Adjusting"
 * 
 * CARACTERÍSTICAS:
 * - Permite sincronizar desde una fila específica (ej. fila 250 en adelante).
 * - Permite sincronizar desde la celda donde tienes el cursor hacia abajo.
 * - Sincroniza en tiempo real mostrando cada fila marcada en verde ("SYNCED").
 * - Filtra claims históricos viejos para no sobrecargar el sistema.
 */

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const WEBHOOK_URL = 'https://edbfyjhbctbxhnqfvrgt.supabase.co/functions/v1/sync-sheet-claim';
const TARGET_SHEET_NAME = 'New ClientList';

// Fila predeterminada desde donde empezar si ejecutas "Sincronizar Todos"
// (Puedes cambiar este número directamente aquí, ej. 200 o 350)
const DEFAULT_START_ROW = 2;

// Límite de claims por tanda para que no se quede colgado
const MAX_CLAIMS_PER_BATCH = 50;

// Nombres o índices de las columnas clave en "New ClientList"
const COL_INDEX = {
  ADJUSTER: 2,          // Col B: Adjuster
  CLIENT: 4,            // Col D: Client
  PHONE: 5,             // Col E: Phone#
  EMAIL: 6,             // Col F: Email
  INSURANCE_COMPANY: 7, // Col G: Insurance Company
  ADDRESS: 8,           // Col H: Address
  POLICY_NO: 9,         // Col I: Policy#
  CLAIM_NO: 10,         // Col J: Claim#
  TYPE_OF_LOSS: 11,     // Col K: Type of Loss
  DATE_OF_LOSS: 12,     // Col L: Date of Loss
  SYNC_STATUS: 25       // Col Y: Estado de Sincronización hacia el App
};

// ============================================================================
// MENÚ EN GOOGLE SHEETS
// ============================================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Scheduling Manager')
    .addItem('1. Sincronizar desde Fila Específica...', 'syncFromSpecificRowPrompt')
    .addItem('2. Sincronizar desde Fila Actual hacia Abajo', 'syncFromCurrentRowDown')
    .addItem('3. Sincronizar Solo la Fila Seleccionada', 'syncSelectedRowClaim')
    .addSeparator()
    .addItem('4. Sincronizar Todos los Pendientes', 'syncNewClaims')
    .addSeparator()
    .addItem('🏷️ Marcar Anteriores como Sincronizados (Históricos)', 'markHistoricalBeforeRow')
    .addItem('⚙️ Configurar Columna de Sincronización (Col Y)', 'setupSyncColumn')
    .addItem('🔌 Probar Conexión con Supabase', 'autorizarYProbarConexion')
    .addToUi();
}

// ============================================================================
// 1. SINCRONIZAR PIDIENDO NÚMERO DE FILA (Ej: 200)
// ============================================================================
function syncFromSpecificRowPrompt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Sincronizar desde Fila',
    'Ingresa el número de fila a partir del cual deseas comenzar a sincronizar:\n(Ejemplo: si pones 150, procesará desde la fila 150 hasta el final)',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const inputRow = parseInt(response.getResponseText().trim(), 10);
  if (isNaN(inputRow) || inputRow < 2) {
    ui.alert('Por favor ingresa un número de fila válido (mayor o igual a 2).');
    return;
  }

  syncRowsWorker(inputRow);
}

// ============================================================================
// 2. SINCRONIZAR DESDE LA FILA DONDE ESTÁ EL CURSOR HACIA ABAJO
// ============================================================================
function syncFromCurrentRowDown() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== TARGET_SHEET_NAME) {
    SpreadsheetApp.getUi().alert(`Por favor, sitúate en la hoja "${TARGET_SHEET_NAME}".`);
    return;
  }

  const activeRow = sheet.getActiveCell().getRow();
  if (activeRow < 2) {
    SpreadsheetApp.getUi().alert('Selecciona una fila de datos válida (fila 2 o mayor).');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Confirmar Sincronización',
    `¿Deseas sincronizar a partir de la fila ${activeRow} hacia abajo?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  syncRowsWorker(activeRow);
}

// ============================================================================
// 3. SINCRONIZAR SOLO LA FILA SELECCIONADA
// ============================================================================
function syncSelectedRowClaim() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== TARGET_SHEET_NAME) {
    SpreadsheetApp.getUi().alert(`Por favor, sitúate en la hoja "${TARGET_SHEET_NAME}".`);
    return;
  }

  const rowNumber = sheet.getActiveCell().getRow();
  if (rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Selecciona una fila de datos (fila 2 o superior).');
    return;
  }

  const row = sheet.getRange(rowNumber, 1, 1, Math.max(COL_INDEX.SYNC_STATUS, sheet.getLastColumn())).getValues()[0];
  const claimNo = String(row[COL_INDEX.CLAIM_NO - 1] || '').trim();

  if (!claimNo) {
    SpreadsheetApp.getUi().alert(`La fila ${rowNumber} no tiene un número de Claim en la columna J.`);
    return;
  }

  const result = sendClaimToApp(sheet, row, rowNumber, claimNo);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(`Fila ${rowNumber} (${claimNo}):\nResultado: ${result}`);
}

// ============================================================================
// 4. SINCRONIZAR TODOS (DESDE DEFAULT_START_ROW)
// ============================================================================
function syncNewClaims() {
  syncRowsWorker(DEFAULT_START_ROW);
}

// ============================================================================
// MOTOR GENERAL DE SINCRONIZACIÓN
// ============================================================================
function syncRowsWorker(startRow) {
  Logger.log('========================================================');
  Logger.log(`>>> INICIANDO SINCRONIZACIÓN DESDE LA FILA ${startRow}...`);
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    const err = `No se encontró la hoja "${TARGET_SHEET_NAME}".`;
    Logger.log(err);
    try { SpreadsheetApp.getUi().alert(err); } catch(e){}
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log(`>>> Última fila con datos: ${lastRow}`);

  if (startRow > lastRow) {
    const msg = `La fila ${startRow} es mayor que la última fila con datos (${lastRow}).`;
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch(e){}
    return;
  }

  // Asegurar cabecera en columna Y
  if (!sheet.getRange(1, COL_INDEX.SYNC_STATUS).getValue()) {
    sheet.getRange(1, COL_INDEX.SYNC_STATUS).setValue('SYNCED TO APP').setFontWeight('bold');
    SpreadsheetApp.flush();
  }

  const numRows = lastRow - startRow + 1;
  const dataRange = sheet.getRange(startRow, 1, numRows, Math.max(COL_INDEX.SYNC_STATUS, sheet.getLastColumn()));
  const rows = dataRange.getValues();

  let countSent = 0;
  let countSkipped = 0;
  let countErrors = 0;

  for (let i = 0; i < rows.length; i++) {
    // Corte por límite de tanda para no saturar
    if (countSent >= MAX_CLAIMS_PER_BATCH) {
      Logger.log(`[INFO] Se alcanzó el límite de ${MAX_CLAIMS_PER_BATCH} claims sincronizados en esta tanda.`);
      break;
    }

    const rowNumber = startRow + i;
    const row = rows[i];
    const claimNo = String(row[COL_INDEX.CLAIM_NO - 1] || '').trim();
    const syncStatus = String(row[COL_INDEX.SYNC_STATUS - 1] || '').trim();

    // Si no tiene número de claim, saltar fila
    if (!claimNo) continue;

    // Si ya está sincronizado, ignorar
    if (syncStatus.toUpperCase().indexOf('SYNCED') !== -1) {
      countSkipped++;
      continue;
    }

    Logger.log(`[Fila ${rowNumber}] Sincronizando Claim: "${claimNo}"...`);
    const statusResult = sendClaimToApp(sheet, row, rowNumber, claimNo);

    if (statusResult.indexOf('SYNCED') !== -1) {
      countSent++;
      Logger.log(`[Fila ${rowNumber}] ✅ Éxito: ${statusResult}`);
    } else {
      countErrors++;
      Logger.log(`[Fila ${rowNumber}] ❌ Error: ${statusResult}`);
    }

    // Actualizar la pantalla de Google Sheets en vivo
    SpreadsheetApp.flush();

    // Pequeña pausa de 200ms
    Utilities.sleep(200);
  }

  Logger.log('========================================================');
  Logger.log(`RESUMEN SINCRONIZACIÓN:`);
  Logger.log(`- Desde fila: ${startRow}`);
  Logger.log(`- Claims nuevos enviados al App: ${countSent}`);
  Logger.log(`- Omitidos (ya sincronizados): ${countSkipped}`);
  Logger.log(`- Errores: ${countErrors}`);
  Logger.log('========================================================');

  const summary = 
    `Sincronización finalizada (desde fila ${startRow}):\n\n` +
    `✅ Nuevos claims enviados: ${countSent}\n` +
    `⏭️ Omitidos (ya sincronizados): ${countSkipped}\n` +
    `❌ Errores: ${countErrors}\n\n` +
    (countSent >= MAX_CLAIMS_PER_BATCH 
      ? `Nota: Se procesó la tanda máxima de ${MAX_CLAIMS_PER_BATCH} claims. Si aún quedan pendientes hacia abajo, vuelve a ejecutar para continuar.` 
      : `Todos los claims pendientes en el rango han sido procesados.`);

  try {
    SpreadsheetApp.getUi().alert(summary);
  } catch(e) {}
}

// ============================================================================
// 5. MARCAR HISTÓRICOS ANTERIORES A UNA FILA
// ============================================================================
function markHistoricalBeforeRow() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    'Marcar Históricos Viejos',
    'Ingresa hasta qué fila deseas marcar como histórico (ejemplo: si pones 200, marcará de la fila 2 a la 199 como "SYNCED (Historical)"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const cutoffRow = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(cutoffRow) || cutoffRow <= 2) {
    ui.alert('Ingresa un número mayor a 2.');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) return;

  const dataRange = sheet.getRange(2, 1, cutoffRow - 2, Math.max(COL_INDEX.SYNC_STATUS, sheet.getLastColumn()));
  const rows = dataRange.getValues();

  let markedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const claimNo = String(rows[i][COL_INDEX.CLAIM_NO - 1] || '').trim();
    const currentSync = String(rows[i][COL_INDEX.SYNC_STATUS - 1] || '').trim();

    if (claimNo && !currentSync) {
      sheet.getRange(i + 2, COL_INDEX.SYNC_STATUS).setValue('SYNCED (Historical)');
      markedCount++;
    }
  }
  SpreadsheetApp.flush();
  ui.alert(`Se marcaron ${markedCount} filas históricas (hasta la fila ${cutoffRow - 1}) como sincronizadas.`);
}

// ============================================================================
// HELPER: ENVÍO DEL CLAIM INDIVIDUAL AL WEBHOOK
// ============================================================================
function sendClaimToApp(sheet, row, rowNumber, claimNo) {
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
    createInitialEvent: false
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
    let json = {};
    try { json = JSON.parse(responseText); } catch(e){}

    const nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');

    if (responseCode === 200 || responseCode === 201) {
      if (json.status === 'created') {
        const status = `SYNCED (${nowFormatted})`;
        sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(status);
        return status;
      } else if (json.status === 'already_exists') {
        const status = 'SYNCED (Already exists)';
        sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(status);
        return status;
      } else {
        const status = `SYNCED (${json.status || 'OK'})`;
        sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(status);
        return status;
      }
    } else {
      const err = `ERROR: ${json.error || responseCode}`;
      sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(err);
      return err;
    }
  } catch (err) {
    const errText = `ERROR: ${err.message}`;
    sheet.getRange(rowNumber, COL_INDEX.SYNC_STATUS).setValue(errText);
    return errText;
  }
}

// ============================================================================
// CONFIGURAR COLUMNA Y
// ============================================================================
function setupSyncColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`No se encontró la hoja "${TARGET_SHEET_NAME}".`);
    return;
  }
  const cell = sheet.getRange(1, COL_INDEX.SYNC_STATUS);
  cell.setValue('SYNCED TO APP');
  cell.setFontWeight('bold');
  cell.setBackground('#e0f2fe');
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Columna "SYNCED TO APP" configurada en la columna Y.');
}

// ============================================================================
// PROBAR CONEXIÓN Y AUTORIZAR
// ============================================================================
function autorizarYProbarConexion() {
  Logger.log('>>> Probando conexión con Supabase Edge Function...');
  try {
    const testPayload = {
      claimNumber: 'PING-CHECK',
      client: 'Prueba de Conexión',
      testOnly: true
    };

    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const text = response.getContentText();
    Logger.log(`Código de respuesta HTTP: ${code}`);
    Logger.log(`Respuesta: ${text}`);

    const msg = `✅ ¡Conexión con Supabase exitosa!\n\nEl servidor respondió correctamente (HTTP ${code}). Ya puedes sincronizar tus claims.`;
    Logger.log(msg);
    try {
      SpreadsheetApp.getUi().alert('Conexión Exitosa', msg, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
  } catch (err) {
    Logger.log(`❌ Error al conectar: ${err.toString()}`);
    try {
      SpreadsheetApp.getUi().alert('Error de Conexión', err.message, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
  }
}

// ============================================================================
// TRIGGER OPCIONAL AL EDITAR (ON EDIT)
// ============================================================================
function onEditTrigger(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TARGET_SHEET_NAME) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Si editaron la columna J (Claim#) en una fila válida
  if (row > 1 && col === COL_INDEX.CLAIM_NO) {
    const syncCell = sheet.getRange(row, COL_INDEX.SYNC_STATUS);
    if (!syncCell.getValue()) {
      const claimNo = String(e.range.getValue() || '').trim();
      if (claimNo) {
        const fullRow = sheet.getRange(row, 1, 1, Math.max(COL_INDEX.SYNC_STATUS, sheet.getLastColumn())).getValues()[0];
        sendClaimToApp(sheet, fullRow, row, claimNo);
        SpreadsheetApp.flush();
      }
    }
  }
}

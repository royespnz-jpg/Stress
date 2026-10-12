/* ── Stress Lab · parte 8 de 8 ── */

function ensureMatrix_(ss) {
  const sheet = ss.getSheetByName(MATRIX) || ss.insertSheet(MATRIX);
  sheet
    .getRange('A1')
    .setFormula(
      '=IFERROR(QUERY(Resultados!A:J,"select B, max(H) where G is not null group by B pivot D",1),' +
        '"Acá aparece la mejor nota de cada alumno en cada hoja de trabajo.")'
    );
  sheet.getRange('A1:Z1').setFontWeight('bold').setWrap(true);
  sheet.getRange('B2:Z').setNumberFormat('0%');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 180);
  if (!sheet.getConditionalFormatRules().length) {
    sheet.setConditionalFormatRules([percentScale_(sheet.getRange('B2:Z'))]);
  }
  return sheet;
}

function removeEmptyDefaultSheets_(ss) {
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (/^(Sheet|Hoja|Página|Folha)\s?1$/i.test(name) && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

function percentScale_(range) {
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#f4c7c3', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#fce8b2', SpreadsheetApp.InterpolationType.NUMBER, '0.6')
    .setGradientMaxpointWithValue('#b7e1cd', SpreadsheetApp.InterpolationType.NUMBER, '1')
    .setRanges([range])
    .build();
}

/* ─── Utilidades ─── */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Texto seguro para una celda: recortado y sin fórmulas (=, +, -, @ al principio). */
function clean_(value, max) {
  const s = String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max || MAX_TEXT);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function cleanId_(value) {
  const id = String(value || '').replace(/[^\w-]/g, '').slice(0, 64);
  if (!id) throw new Error('Falta el ID.');
  return id;
}

function num_(value) {
  const n = Number(value);
  return isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

function date_(value) {
  const d = value ? new Date(value) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Última fila con «ID intento» (columna J); las casillas vacías no cuentan. */
function lastRowWithId_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return 1;
  const ids = sheet.getRange(1, 10, last, 1).getValues();
  for (let r = ids.length - 1; r >= 1; r--) if (String(ids[r][0]).trim() !== '') return r + 1;
  return 1;
}

function exists_(sheet, column, id) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  return Boolean(sheet.getRange(2, column, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext());
}

/* ── fin de la parte 8 de 8 ── */

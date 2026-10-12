/* ── Stress Lab · parte 7 de 8 ── */

/* ─── Hojas ─── */

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create(APP_NAME + ' — Resultados');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function sheet_(ss, def) {
  return ss.getSheetByName(def.name) || ensureSheet_(ss, def);
}

function ensureSheet_(ss, def) {
  const sheet = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
  sheet
    .getRange(1, 1, 1, def.headers.length)
    .setValues([def.headers])
    .setFontWeight('bold')
    .setBackground(HEADER_BG)
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  def.widths.forEach(function (w, i) {
    sheet.setColumnWidth(i + 1, w);
  });
  if (def === SHEETS.book) return sheet;
  sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm');

  if (def === SHEETS.results) {
    sheet.getRange('H2:H').setNumberFormat('0%');
    sheet.getRange('I2:I').setNumberFormat('[m]:ss');
    if (!sheet.getConditionalFormatRules().length) {
      sheet.setConditionalFormatRules([percentScale_(sheet.getRange('H2:H'))]);
    }
  }
  if (def === SHEETS.answers) {
    /* Las casillas se agregan fila por fila al guardar: las filas vacías no llevan casilla. */
    const used = lastRowWithId_(sheet);
    const extra = sheet.getMaxRows() - used;
    if (extra > 0) sheet.getRange(used + 1, 9, extra, 1).clearDataValidations().clearContent();
    if (!sheet.getConditionalFormatRules().length) {
      sheet.setConditionalFormatRules([
        SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=AND($J2<>"",$I2=FALSE)')
          .setBackground('#fde2e1')
          .setRanges([sheet.getRange('A2:J')])
          .build(),
      ]);
    }
  }
  return sheet;
}

function ensureSummary_(ss) {
  const sheet = ss.getSheetByName(SUMMARY) || ss.insertSheet(SUMMARY, 0);
  sheet.getRange('A1').setValue('Promedio por alumno').setFontWeight('bold').setFontSize(13);
  sheet
    .getRange('A2')
    .setFormula(
      '=IFERROR(QUERY(Resultados!A:J,"select B, C, count(J), avg(H), max(H), max(A) where G is not null ' +
        "group by B, C order by B label count(J) 'Intentos', avg(H) 'Promedio', max(H) 'Mejor', max(A) 'Último' " +
        "format avg(H) '0%', max(H) '0%', max(A) 'dd/MM/yyyy'\",1),\"Todavía no hay resultados.\")"
    );
  sheet.getRange('I1').setValue('Promedio por hoja de trabajo').setFontWeight('bold').setFontSize(13);
  sheet
    .getRange('I2')
    .setFormula(
      '=IFERROR(QUERY(Resultados!A:J,"select E, count(J), avg(H), min(H), max(H) where G is not null ' +
        "group by E order by E label count(J) 'Intentos', avg(H) 'Promedio', min(H) 'Peor', max(H) 'Mejor' " +
        "format avg(H) '0%', min(H) '0%', max(H) '0%'\",1),\"\")"
    );
  sheet.getRange('A2:N2').setFontWeight('bold');
  sheet.setFrozenRows(2);
  [180, 90, 75, 85, 75, 95, 30, 30, 300, 75, 85, 75, 75].forEach(function (w, i) {
    sheet.setColumnWidth(i + 1, w);
  });
  if (!sheet.getConditionalFormatRules().length) {
    sheet.setConditionalFormatRules([percentScale_(sheet.getRange('D3:E')), percentScale_(sheet.getRange('K3:M'))]);
  }
  return sheet;
}

/* ── fin de la parte 7 de 8 ── */

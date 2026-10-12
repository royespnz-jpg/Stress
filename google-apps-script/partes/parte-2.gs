/* ── Stress Lab · parte 2 de 8 ── */

/* ─── Instalación y menú ─── */

/** Crea (o repara) todas las hojas. Se puede ejecutar las veces que quieras: no borra datos. */
function setup() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.results);
  ensureSheet_(ss, SHEETS.answers);
  ensureSheet_(ss, SHEETS.recordings);
  ensureMatrix_(ss);
  ensureSummary_(ss);
  removeEmptyDefaultSheets_(ss);
  Logger.log('Planilla lista: ' + ss.getUrl());
  return ss.getUrl();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Stress Lab')
    .addItem('Preparar / reparar hojas', 'setup')
    .addItem('Cómo conectar la página', 'showHelp')
    .addSeparator()
    .addItem('Guardar API key de ElevenLabs', 'setElevenLabsKey')
    .addItem('Estado de ElevenLabs', 'showElevenLabsStatus')
    .addSeparator()
    .addItem('Listar los audios del libro', 'listarAudios')
    .addToUi();
}

function setElevenLabsKey() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt(
    'API key de ElevenLabs',
    'Pegá tu API key (empieza con sk_). Queda guardada solo en este script: los alumnos no la ven.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const key = answer.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty('ELEVENLABS_API_KEY', key);
  CacheService.getScriptCache().remove('voices_v1');
  try {
    const list = voices_().voices;
    ui.alert('✓ Conectado a ElevenLabs: ' + list.length + ' voces disponibles.');
  } catch (err) {
    ui.alert('La key se guardó, pero ElevenLabs respondió: ' + err.message);
  }
}

function showElevenLabsStatus() {
  const ui = SpreadsheetApp.getUi();
  const u = usage_();
  let msg = 'Hoy se generaron ' + u.today + ' de ' + u.limit + ' caracteres nuevos (el audio repetido no cuenta).';
  try {
    const res = UrlFetchApp.fetch(TTS.api + '/user/subscription', {
      headers: { 'xi-api-key': elevenKey_() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const sub = JSON.parse(res.getContentText());
      msg += '\n\nPlan ' + sub.tier + ': ' + sub.character_count + ' de ' + sub.character_limit + ' créditos usados este mes.';
    } else {
      msg += '\n\n' + elevenError_(res);
    }
  } catch (err) {
    msg += '\n\n' + err.message;
  }
  ui.alert('ElevenLabs', msg, ui.ButtonSet.OK);
}

function showHelp() {
  const url = ScriptApp.getService().getUrl();
  const body = url
    ? '<p>URL de la aplicación web (pegala en la página: <b>Settings → Google Script URL</b>):</p>' +
      '<input style="width:100%;padding:6px" readonly onclick="this.select()" value="' + url + '">'
    : '<p>Todavía no implementaste la aplicación web.</p><p>Implementar → Nueva implementación → Aplicación web<br>' +
      'Ejecutar como: <b>Yo</b> · Quién tiene acceso: <b>Cualquier persona</b>.</p>';
  const html = HtmlService.createHtmlOutput('<div style="font:14px/1.5 sans-serif">' + body + '</div>')
    .setWidth(480)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, APP_NAME);
}

/** Escribe en la hoja «Audios del libro» todos los audios de las carpetas, para revisarlos. */
function listarAudios() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.book.name) || ss.insertSheet(SHEETS.book.name);
  sheet.clear();
  ensureSheet_(ss, SHEETS.book);
  const files = bookFiles_(true);
  if (files.length) {
    const rows = files.map(function (f) {
      return [f.folder, f.name, f.mime, Math.round(f.size / 1024), f.id];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  Logger.log(files.length + ' audios.');
  try {
    SpreadsheetApp.getUi().alert(files.length + ' audios en las carpetas del libro. Están en la hoja «' + SHEETS.book.name + '».');
  } catch (err) {
    /* ejecutado desde el editor: sin interfaz */
  }
  return files.length;
}

/* ── fin de la parte 2 de 8 ── */

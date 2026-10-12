/*
 * ── Stress Lab · Google Apps Script ──
 *
 * El “servidor” de la página Stress Lab (word stress):
 *   • Guarda los resultados en esta planilla: Resultados (una fila por hoja de
 *     trabajo terminada), Respuestas (una fila por respuesta), Grabaciones
 *     (los audios que mandan los alumnos quedan en tu Drive), Resumen y
 *     Alumno × Ejercicio (se actualizan solos).
 *   • Es el motor de voz: genera el audio con ElevenLabs sin que tu API key
 *     quede a la vista. Cada frase se guarda en tu Drive y no se vuelve a pagar.
 *   • Entrega los audios del libro que están en tus carpetas de Drive
 *     (Chapter 6–7 y Word Stress Practices); nunca otros archivos.
 *
 * Instalación (una vez, unos 5 minutos):
 *   1. Creá una planilla nueva (sheets.new) → Extensiones → Apps Script.
 *   2. Borrá lo que haya, pegá todo este archivo (o las partes, en orden) y guardá.
 *   3. Elegí la función «setup» → ▶ Ejecutar → aceptá los permisos.
 *      (Si dice «Google no verificó esta app»: Configuración avanzada → Ir a … —
 *      es tu propio script.)
 *   4. Volvé a la planilla y recargala: aparece el menú «Stress Lab».
 *      Stress Lab → Guardar API key de ElevenLabs → pegá tu key NUEVA (sk_…).
 *      La key queda solo en este script: no la pegues en ningún otro lado.
 *   5. Implementar → Nueva implementación → ⚙ Aplicación web ·
 *      Ejecutar como: Yo · Quién tiene acceso: Cualquier persona →
 *      Implementar → copiá la URL (termina en /exec).
 *   6. En la página: Settings → pegá la URL → Test connection → Save.
 *      Ahí mismo: «Check the recordings» muestra qué audio usa cada actividad.
 *
 * Si cambiás este código: Implementar → Administrar implementaciones → ✏ →
 * Versión: Nueva versión → Implementar. La URL sigue siendo la misma.
 */

const APP_NAME = 'Stress Lab';
const VERSION = 1;
/* Vacío = la planilla que contiene el script. */
const SPREADSHEET_ID = '';
/* Las carpetas de Drive con los audios de los libros (y sus subcarpetas). */
const BOOK_FOLDERS = [
  '1cXgDywfAPi7-SQblFlSuQC2KphK33eUt', /* Chapter 6 Stress and Chapter 7 Stress (Advanced) */
  '1SmSKUtgjUDvmMc6gW1h8Yh_qwjmABo_C', /* Word Stress Practices */
];
const HEADER_BG = '#3346d3';
const MAX_TEXT = 1000;
const MAX_ITEMS = 400;
const MAX_AUDIO_BASE64 = 14 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|wma|mpeg|mp4)$/i;

const SHEETS = {
  results: {
    name: 'Resultados',
    headers: ['Fecha', 'Alumno', 'Curso', 'Hoja', 'Título', 'Correctas', 'Total', '%', 'Duración', 'ID intento'],
    widths: [135, 180, 90, 90, 300, 80, 60, 70, 80, 110],
  },
  answers: {
    name: 'Respuestas',
    headers: ['Fecha', 'Alumno', 'Curso', 'Hoja', 'N°', 'Pregunta', 'Respuesta del alumno', 'Respuesta correcta', '¿Correcta?', 'ID intento'],
    widths: [135, 180, 90, 90, 45, 380, 230, 230, 85, 110],
  },
  recordings: {
    name: 'Grabaciones',
    headers: ['Fecha', 'Alumno', 'Curso', 'Frase', 'Audio', 'Duración (s)', 'ID'],
    widths: [135, 180, 90, 340, 110, 95, 110],
  },
  book: {
    name: 'Audios del libro',
    headers: ['Carpeta', 'Archivo', 'Tipo', 'Tamaño (KB)', 'ID'],
    widths: [300, 380, 110, 95, 300],
  },
};
/* Tiene que coincidir con js/audio-core.js (los tests lo verifican). */
const TTS = {
  api: 'https://api.elevenlabs.io/v1',
  outputFormat: 'mp3_44100_64',
  defaultModel: 'eleven_multilingual_v2',
  models: ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3'],
  speeds: { natural: 1, slow: 0.8, words: 0.95 },
  maxChars: 400,
  dailyLimit: 20000,
  cacheSeconds: 21600,
};
const SUMMARY = 'Resumen';
const MATRIX = 'Alumno × Ejercicio';
const AUDIO_TYPES = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

/* ✂ */

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

/* ✂ */

/* ─── Aplicación web ─── */

/** La página usa esto para «Test connection». */
function doGet() {
  const ss = getSpreadsheet_();
  return json_({ ok: true, app: APP_NAME, sheet: ss.getName(), tts: Boolean(elevenKeyOrNull_()), book: true, version: VERSION });
}

/** La página envía acá los resultados, las grabaciones y los pedidos de voz y de audios. */
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.type === 'tts') return json_(tts_(data));
    if (data.type === 'voices') return json_(voices_());
    if (data.type === 'book-list') return json_({ ok: true, files: bookFiles_(false) });
    if (data.type === 'book-audio') return json_(bookAudio_(data));
    if (data.type === 'result') return json_(withLock_(function () { return saveResult_(data); }));
    if (data.type === 'recording') return json_(withLock_(function () { return saveRecording_(data); }));
    if (data.type === 'ping') return json_({ ok: true });
    return json_({ ok: false, error: 'Pedido desconocido: ' + String(data.type) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('La planilla está ocupada, probá de nuevo.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ─── Audios del libro ─── */

function bookFolderIds_() {
  const custom = PropertiesService.getScriptProperties().getProperty('BOOK_FOLDER_IDS');
  if (custom) return custom.split(/[\s,]+/).filter(Boolean);
  return BOOK_FOLDERS;
}

/** Todos los audios de las carpetas y subcarpetas: { id, name, folder, mime, size }. */
function bookFiles_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = cache.get('book_v1');
    if (hit) return JSON.parse(hit);
  }
  const out = [];
  bookFolderIds_().forEach(function (id) {
    let folder;
    try {
      folder = DriveApp.getFolderById(id);
    } catch (err) {
      return;
    }
    walk_(folder, folder.getName(), 0, out);
  });
  out.sort(function (a, b) {
    return a.folder === b.folder ? (a.name < b.name ? -1 : 1) : a.folder < b.folder ? -1 : 1;
  });
  const json = JSON.stringify(out);
  if (json.length < 90000) cache.put('book_v1', json, 600);
  return out;
}

function walk_(folder, path, depth, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    if (/^audio\//.test(mime) || AUDIO_EXT.test(f.getName())) {
      out.push({ id: f.getId(), name: f.getName(), folder: path, mime: mime, size: f.getSize() });
    }
  }
  if (depth >= 4) return;
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    walk_(sub, path + ' / ' + sub.getName(), depth + 1, out);
  }
}

function bookAudio_(data) {
  const id = String(data.id || '');
  if (!/^[\w-]{20,}$/.test(id)) throw new Error('ID de archivo inválido.');
  const file = DriveApp.getFileById(id);
  if (!inBookFolder_(file.getParents(), 0)) throw new Error('Ese archivo no es un audio de las carpetas del libro.');
  const blob = file.getBlob();
  const mime = blob.getContentType();
  if (!/^audio\//.test(mime) && !AUDIO_EXT.test(file.getName())) throw new Error('Ese archivo no es un audio.');
  return { ok: true, audio: Utilities.base64Encode(blob.getBytes()), mime: /^audio\//.test(mime) ? mime : 'audio/mpeg' };
}

/** En alguna de las carpetas, o en una subcarpeta suya. */
function inBookFolder_(folders, depth) {
  const ids = bookFolderIds_();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (ids.indexOf(folder.getId()) >= 0) return true;
    if (depth < 5 && inBookFolder_(folder.getParents(), depth + 1)) return true;
  }
  return false;
}

/* ✂ */

/* ─── Motor de voz (ElevenLabs) ─── */

/** Texto que se envía a ElevenLabs para cada modo (igual que ttsTextFor en la página). */
function ttsText_(text, mode, model) {
  if (mode !== 'words') return text;
  const joiner = model.indexOf('eleven_v3') === 0 ? ' ... ' : ' <break time="0.35s"/> ';
  return text.split(/\s+/).filter(Boolean).join(joiner);
}

function ttsBody_(text, mode, model) {
  return {
    text: ttsText_(text, mode, model),
    model_id: model,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      speed: TTS.speeds[mode],
    },
  };
}

function tts_(d) {
  const key = elevenKey_();
  const text = String(d.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Falta el texto.');
  if (text.length > TTS.maxChars) throw new Error('El texto es demasiado largo (máx. ' + TTS.maxChars + ' caracteres).');
  const mode = Object.prototype.hasOwnProperty.call(TTS.speeds, d.mode) ? d.mode : 'natural';
  const model = TTS.models.indexOf(d.model) >= 0 ? d.model : TTS.defaultModel;
  const voiceId = String(d.voiceId || '');
  if (!/^[A-Za-z0-9]{8,40}$/.test(voiceId)) throw new Error('Voz inválida.');

  const name = 'tts_' + digest_([voiceId, model, mode, text].join('|'));
  const cache = CacheService.getScriptCache();
  const hit = cache.get(name);
  if (hit) return { ok: true, audio: hit, mime: 'audio/mpeg', cached: true };

  const folder = audioFolder_();
  const files = folder.getFilesByName(name + '.mp3');
  if (files.hasNext()) {
    const saved = Utilities.base64Encode(files.next().getBlob().getBytes());
    putCache_(cache, name, saved);
    return { ok: true, audio: saved, mime: 'audio/mpeg', cached: true };
  }

  reserveChars_(text.length);
  const res = UrlFetchApp.fetch(
    TTS.api + '/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=' + TTS.outputFormat,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'xi-api-key': key, Accept: 'audio/mpeg' },
      payload: JSON.stringify(ttsBody_(text, mode, model)),
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() !== 200) throw new Error(elevenError_(res));
  const blob = res.getBlob().setName(name + '.mp3');
  folder.createFile(blob);
  const audio = Utilities.base64Encode(blob.getBytes());
  putCache_(cache, name, audio);
  return { ok: true, audio: audio, mime: 'audio/mpeg', cached: false };
}

function voices_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('voices_v1');
  let voices = hit ? JSON.parse(hit) : null;
  if (!voices) {
    const key = elevenKey_();
    let res = UrlFetchApp.fetch(TTS.api + '/voices', { headers: { 'xi-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() === 404 || res.getResponseCode() === 410) {
      res = UrlFetchApp.fetch(TTS.api.replace('/v1', '/v2') + '/voices?page_size=100', {
        headers: { 'xi-api-key': key },
        muteHttpExceptions: true,
      });
    }
    if (res.getResponseCode() !== 200) throw new Error(elevenError_(res));
    voices = (JSON.parse(res.getContentText()).voices || []).map(function (v) {
      const labels = v.labels || {};
      return {
        id: v.voice_id,
        name: v.name,
        accent: labels.accent || '',
        gender: labels.gender || '',
        age: labels.age || '',
        description: labels.description || labels.descriptive || '',
        category: v.category || '',
        preview: v.preview_url || '',
      };
    });
    const json = JSON.stringify(voices);
    if (json.length < 100000) cache.put('voices_v1', json, TTS.cacheSeconds);
  }
  return { ok: true, voices: voices, usage: usage_() };
}

/* ✂ */

function elevenKeyOrNull_() {
  return PropertiesService.getScriptProperties().getProperty('ELEVENLABS_API_KEY');
}

function elevenKey_() {
  const key = elevenKeyOrNull_();
  if (!key) throw new Error('El motor de voz no tiene API key de ElevenLabs (menú Stress Lab → Guardar API key de ElevenLabs).');
  return key;
}

function elevenError_(res) {
  let detail = '';
  try {
    const body = JSON.parse(res.getContentText());
    detail = (body.detail && (body.detail.message || body.detail.status)) || (typeof body.detail === 'string' ? body.detail : '');
  } catch (err) {
    detail = res.getContentText().slice(0, 200);
  }
  return 'ElevenLabs ' + res.getResponseCode() + (detail ? ': ' + detail : '');
}

function dailyLimit_() {
  const n = Number(PropertiesService.getScriptProperties().getProperty('ELEVENLABS_DAILY_LIMIT'));
  return n > 0 ? n : TTS.dailyLimit;
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function usage_() {
  const raw = PropertiesService.getScriptProperties().getProperty('TTS_USAGE');
  const u = raw ? JSON.parse(raw) : {};
  return { today: u.day === today_() ? u.chars : 0, limit: dailyLimit_() };
}

/** Suma los caracteres de hoy; corta si se pasa del límite diario. */
function reserveChars_(n) {
  withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const used = usage_().today;
    if (used + n > dailyLimit_()) throw new Error('Se alcanzó el límite diario de voz. Probá mañana.');
    props.setProperty('TTS_USAGE', JSON.stringify({ day: today_(), chars: used + n }));
  });
}

function putCache_(cache, name, base64) {
  if (base64.length < 100000) cache.put(name, base64, TTS.cacheSeconds);
}

function digest_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) {
      return ('0' + (b & 255).toString(16)).slice(-2);
    })
    .join('');
}

function audioFolder_() {
  return folder_('AUDIO_FOLDER_ID', APP_NAME + ' — Audio de ElevenLabs');
}

function recordingsFolder_() {
  return folder_('FOLDER_ID', APP_NAME + ' — Grabaciones');
}

function folder_(property, name) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(property);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      /* la carpeta se borró: se crea otra */
    }
  }
  const folder = DriveApp.createFolder(name);
  props.setProperty(property, folder.getId());
  return folder;
}

/* ✂ */

/* ─── Resultados y grabaciones ─── */

function saveResult_(d) {
  const ss = getSpreadsheet_();
  const results = sheet_(ss, SHEETS.results);
  const id = cleanId_(d.id);
  if (exists_(results, 10, id)) return { ok: true, duplicate: true };

  const when = date_(d.finishedAt);
  const student = clean_(d.student, 80) || '(sin nombre)';
  const group = clean_(d.group, 40);
  const setId = clean_(d.setId, 60);
  const total = num_(d.total);
  const correct = num_(d.correct);

  results.appendRow([
    when,
    student,
    group,
    setId,
    clean_(d.setTitle, 160),
    correct,
    total,
    total ? correct / total : 0,
    num_(d.durationSec) / 86400,
    id,
  ]);

  const items = Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS) : [];
  if (items.length) {
    const answers = sheet_(ss, SHEETS.answers);
    const rows = items.map(function (it, i) {
      it = it || {};
      return [when, student, group, setId, num_(it.n) || i + 1, clean_(it.prompt), clean_(it.answer), clean_(it.expected), it.correct === true, id];
    });
    const start = lastRowWithId_(answers) + 1;
    answers.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
    answers.getRange(start, 9, rows.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
  return { ok: true, saved: items.length };
}

function saveRecording_(d) {
  const ss = getSpreadsheet_();
  const sheet = sheet_(ss, SHEETS.recordings);
  const id = cleanId_(d.id);
  if (exists_(sheet, 7, id)) return { ok: true, duplicate: true };

  const mime = String(d.mimeType || '').split(';')[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[mime];
  if (!ext) throw new Error('Formato de audio no admitido: ' + mime);
  const audio = String(d.audio || '');
  if (!audio) throw new Error('Falta el audio.');
  if (audio.length > MAX_AUDIO_BASE64) throw new Error('La grabación es demasiado larga.');

  const when = date_(d.recordedAt);
  const student = clean_(d.student, 80) || '(sin nombre)';
  const group = clean_(d.group, 40);
  const phrase = clean_(d.text, 300);
  const stamp = Utilities.formatDate(when, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH.mm');
  const fileName = stamp + ' · ' + student.replace(/^'/, '') + ' · ' + phrase.replace(/^'/, '').slice(0, 40) + '.' + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(audio), mime, fileName);
  const file = recordingsFolder_().createFile(blob);

  sheet.appendRow([when, student, group, phrase, '=HYPERLINK("' + file.getUrl() + '","▶ Escuchar")', num_(d.durationSec), id]);
  return { ok: true };
}

/* ✂ */

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

/* ✂ */

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

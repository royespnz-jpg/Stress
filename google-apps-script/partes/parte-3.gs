/* ── Stress Lab · parte 3 de 8 ── */

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

/* ── fin de la parte 3 de 8 ── */

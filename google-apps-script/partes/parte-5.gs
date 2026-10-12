/* ── Stress Lab · parte 5 de 8 ── */

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

/* ── fin de la parte 5 de 8 ── */

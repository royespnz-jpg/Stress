/* ── Stress Lab · parte 4 de 8 ── */

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

/* ── fin de la parte 4 de 8 ── */

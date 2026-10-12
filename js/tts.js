// Voice engine. For each clip it tries, in order:
//   1. a pre-generated clip of the chosen voice (audio/manifest.json)
//   2. live ElevenLabs — with a personal key if one is saved in this browser,
//      otherwise through the Google Apps Script (the key stays in the script)
//   3. the browser's own speech synthesis
// Live clips are cached in the browser, and the script also keeps them in Drive.
import {
  API_BASE,
  DEFAULT_MODEL,
  DEFAULT_VOICES,
  MODES,
  PRESET_VOICES,
  audioKey,
  cyrb53,
  ttsRequestBody,
  ttsUrl,
  words,
} from './audio-core.js?v=202610122032';
import { DEFAULT_SCRIPT_URL, OLD_SCRIPT_URLS } from './config.js?v=202610122032';
import { isScriptUrl, scriptGet, scriptPost } from './script-api.js?v=202610122032';

// Stress Lab and Connected Speech Lab share the github.io origin: own keys.
const SETTINGS_KEY = 'st.settings.v1';
const VOICES_KEY = 'st.voices.v1';
export const CACHE_NAME = 'st-tts-v1';

const state = {
  manifest: { items: {} },
  memory: new Map(), // cache key → object URL
  audio: null,
  token: 0,
  listeners: new Set(),
  script: { status: 'unknown' }, // unknown | checking | ok | no-tts | offline
  voices: null,
  voicesSource: 'preset', // preset | account
  usage: null,
};

// ─── settings ───────────────────────────────────────────────────────────────

export function getSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    /* storage unavailable */
  }
  const s = {
    engine: 'eleven', // eleven | browser
    apiKey: '',
    model: DEFAULT_MODEL,
    voiceA: DEFAULT_VOICES.A,
    voiceB: DEFAULT_VOICES.B,
    student: '',
    group: '',
    ...saved,
  };
  s.sheetUrl = saved.sheetUrl && !OLD_SCRIPT_URLS.includes(saved.sheetUrl) ? saved.sheetUrl : DEFAULT_SCRIPT_URL;
  return s;
}

export function saveSettings(patch) {
  const before = getSettings();
  const next = { ...before, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  if (next.sheetUrl !== before.sheetUrl || next.apiKey !== before.apiKey) {
    state.voices = null;
    clearVoiceCache();
    if (next.sheetUrl !== before.sheetUrl) checkScript();
  }
  emit({ type: 'settings' });
  return next;
}

// ─── events ─────────────────────────────────────────────────────────────────

export function onAudioEvent(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function emit(event) {
  for (const fn of state.listeners) fn(event);
}

// ─── pre-generated clips ────────────────────────────────────────────────────

export async function loadManifest() {
  try {
    const res = await fetch('audio/manifest.json', { cache: 'no-cache' });
    if (res.ok) state.manifest = await res.json();
  } catch {
    /* no pre-generated audio */
  }
  state.manifest.items ||= {};
  return state.manifest;
}

export function manifestInfo() {
  return {
    count: Object.keys(state.manifest.items || {}).length,
    model: state.manifest.model,
    voices: Object.keys(state.manifest.voiceSets || {}),
    generatedAt: state.manifest.generatedAt,
  };
}

// ─── the Google Script voice engine ─────────────────────────────────────────

let scriptChecking = null;

export function checkScript() {
  scriptChecking = runScriptCheck().finally(() => (scriptChecking = null));
  return scriptChecking;
}

async function runScriptCheck() {
  const { sheetUrl } = getSettings();
  if (!isScriptUrl(sheetUrl)) {
    state.script = { status: 'offline', error: 'No Google Script URL.' };
    emit({ type: 'engine' });
    return state.script;
  }
  state.script = { status: 'checking' };
  emit({ type: 'engine' });
  try {
    const info = await scriptGet(sheetUrl);
    const status = info.app !== 'Stress Lab' ? 'other' : info.tts ? 'ok' : 'no-tts';
    state.script = { status, sheet: info.sheet, version: info.version || 1, book: Boolean(info.book) };
  } catch (err) {
    state.script = { status: 'offline', error: err.message };
  }
  emit({ type: 'engine' });
  return state.script;
}

export function scriptStatus() {
  return state.script;
}

function liveSource(s) {
  if (s.apiKey) return 'key';
  if (isScriptUrl(s.sheetUrl) && !['no-tts', 'other', 'offline'].includes(state.script.status)) return 'script';
  return null;
}

// ─── voices ─────────────────────────────────────────────────────────────────

function clearVoiceCache() {
  try {
    sessionStorage.removeItem(VOICES_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function loadVoices({ force = false } = {}) {
  if (state.voices && !force) return state.voices;
  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(VOICES_KEY) || 'null');
      if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
        Object.assign(state, { voices: cached.voices, voicesSource: 'account', usage: cached.usage });
        return state.voices;
      }
    } catch {
      /* storage unavailable */
    }
  }
  const s = getSettings();
  let list = null;
  try {
    if (s.apiKey) list = await fetchVoices(s.apiKey);
    else if (isScriptUrl(s.sheetUrl)) {
      const res = await scriptPost(s.sheetUrl, { type: 'voices' });
      list = res.voices;
      state.usage = res.usage || null;
    }
  } catch (err) {
    state.voicesError = err.message;
  }
  if (list?.length) {
    state.voices = list;
    state.voicesSource = 'account';
    state.voicesError = null;
    try {
      sessionStorage.setItem(VOICES_KEY, JSON.stringify({ at: Date.now(), voices: list, usage: state.usage }));
    } catch {
      /* storage unavailable */
    }
  } else {
    state.voices = PRESET_VOICES;
    state.voicesSource = 'preset';
  }
  emit({ type: 'voices' });
  return state.voices;
}

export function currentVoices() {
  return state.voices;
}

export function voicesInfo() {
  return { source: state.voicesSource, error: state.voicesError, usage: state.usage };
}

export function voiceById(id) {
  return (state.voices || []).find((v) => v.id === id) || PRESET_VOICES.find((v) => v.id === id) || null;
}

export function voiceName(slot = 'A') {
  const s = getSettings();
  const id = slot === 'B' ? s.voiceB : s.voiceA;
  return voiceById(id)?.name || (slot === 'B' ? s.voiceBName : s.voiceAName) || 'Custom voice';
}

// Why ElevenLabs isn't available right now (null when it is).
export function engineProblem() {
  const s = getSettings();
  if (s.engine === 'browser' || s.apiKey) return null;
  switch (state.script.status) {
    case 'other':
      return 'That Google Script is not the Stress Lab script. Paste the Stress Lab code (google-apps-script/) in a new sheet and use its URL.';
    case 'no-tts':
      return 'The Google Script has no ElevenLabs key yet. In the sheet: Stress Lab → Guardar API key de ElevenLabs.';
    case 'offline':
      return `Can't reach the Google Script: ${state.script.error || 'no answer'}`;
    default:
      return null;
  }
}

// ─── status line for the header ─────────────────────────────────────────────

export function engineSummary() {
  const s = getSettings();
  if (s.engine === 'browser') return { label: 'Browser voice', short: 'Browser', level: 'browser' };
  const source = liveSource(s);
  if (source || manifestInfo().count) return { label: `ElevenLabs · ${voiceName('A')}`, short: voiceName('A'), level: 'eleven' };
  if (state.script.status === 'no-tts') return { label: 'Browser voice · ElevenLabs not set up', short: 'Set up', level: 'warn' };
  if (state.script.status === 'other') return { label: 'Browser voice · not the Stress Lab script', short: 'Check', level: 'warn' };
  return { label: 'Browser voice · voice engine offline', short: 'Offline', level: 'warn' };
}

// ─── playback ───────────────────────────────────────────────────────────────

// Other players (the book recordings) stop when the app speaks, and vice versa.
const stoppers = new Set();
export function onHalt(fn) {
  stoppers.add(fn);
}

function halt() {
  state.token++;
  for (const fn of stoppers) fn();
  if (state.audio) {
    state.audio.pause();
    state.audio = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function stop() {
  halt();
  emit({ type: 'stop' });
}

// Resolves when playback finishes (or is stopped).
export async function play(text, { mode = 'natural', voice = 'A', voiceId } = {}) {
  halt();
  const token = state.token;
  const s = getSettings();
  const id = voiceId || (voice === 'B' ? s.voiceB : s.voiceA);

  if (s.engine !== 'browser') {
    const pre = state.manifest.items?.[audioKey(text, mode, id)];
    if (pre) return playUrl(pre, token, 'ElevenLabs (pre-generated)');
    const source = liveSource(s);
    if (source) {
      try {
        emit({ type: 'loading', text, mode });
        const url = await liveUrl(text, mode, id, s, source);
        if (token !== state.token) return;
        return playUrl(url, token, source === 'key' ? 'ElevenLabs (your key)' : 'ElevenLabs');
      } catch (err) {
        if (token !== state.token) return;
        emit({ type: 'error', message: err.message });
      }
    }
  }
  if (token !== state.token) return;
  const problem = engineProblem();
  if (problem && !state.warnedFallback) {
    state.warnedFallback = true;
    emit({ type: 'error', message: `Browser voice, not ElevenLabs — ${problem}` });
  }
  return speakFallback(text, mode, voice, token);
}

export function playPreview(url) {
  stop();
  return playUrl(url, state.token, 'ElevenLabs preview');
}

function playUrl(url, token, source) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    state.audio = audio;
    const done = () => {
      if (state.audio === audio) state.audio = null;
      emit({ type: 'end' });
      resolve();
    };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', () => {
      emit({ type: 'error', message: 'Could not play the audio.' });
      done();
    });
    audio
      .play()
      .then(() => token === state.token && emit({ type: 'play', source }))
      .catch(done);
  });
}

async function liveUrl(text, mode, voiceId, s, source) {
  const cacheKey = cyrb53(`${voiceId}|${s.model}|${mode}|${text}`).toString(16);
  if (state.memory.has(cacheKey)) return state.memory.get(cacheKey);

  const cacheReq = new Request(`https://tts-cache.invalid/${cacheKey}`);
  let blob = null;
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(cacheReq);
    if (hit) blob = await hit.blob();
  } catch {
    /* Cache API unavailable */
  }

  if (!blob) {
    blob = source === 'key' ? await directTts(text, mode, voiceId, s) : await scriptTts(text, mode, voiceId, s);
    try {
      await (await caches.open(CACHE_NAME)).put(cacheReq, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }));
    } catch {
      /* Cache API unavailable */
    }
  }
  const url = URL.createObjectURL(blob);
  state.memory.set(cacheKey, url);
  return url;
}

async function scriptTts(text, mode, voiceId, s) {
  const res = await scriptPost(s.sheetUrl, { type: 'tts', text, mode, voiceId, model: s.model });
  if (!res.audio) throw new Error('The Google Script returned no audio. Is it the new Code.gs?');
  const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: res.mime || 'audio/mpeg' });
}

async function directTts(text, mode, voiceId, s) {
  const res = await fetch(ttsUrl(voiceId), {
    method: 'POST',
    headers: { 'xi-api-key': s.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(ttsRequestBody(text, mode, s.model)),
  });
  if (!res.ok) throw new Error(await describeError(res));
  return res.blob();
}

async function describeError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.detail?.message || body?.detail?.status || (typeof body?.detail === 'string' ? body.detail : '');
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return `ElevenLabs rejected the API key. ${detail}`.trim();
  if (res.status === 429) return `ElevenLabs rate limit or quota reached. ${detail}`.trim();
  return `ElevenLabs error ${res.status}. ${detail}`.trim();
}

// ─── browser speech fallback ────────────────────────────────────────────────

let browserVoices = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const load = () => (browserVoices = speechSynthesis.getVoices());
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

function pickBrowserVoice(voice) {
  const us = browserVoices.filter((v) => /en[-_]US/i.test(v.lang));
  const pool = us.length ? us : browserVoices.filter((v) => /^en/i.test(v.lang));
  if (!pool.length) return null;
  return pool[voice === 'B' && pool.length > 1 ? 1 : 0];
}

function speakFallback(text, mode, voice, token) {
  if (!('speechSynthesis' in window)) {
    emit({ type: 'error', message: 'No voice available in this browser.' });
    return Promise.resolve();
  }
  const chunks = mode === 'words' ? words(text) : [text];
  const rate = mode === 'slow' ? 0.7 : mode === 'words' ? 0.85 : 1;
  const v = pickBrowserVoice(voice);
  emit({ type: 'play', source: 'browser voice' });
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (token !== state.token || i >= chunks.length) {
        emit({ type: 'end' });
        return resolve();
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = 'en-US';
      u.rate = rate;
      if (v) u.voice = v;
      u.onend = () => setTimeout(next, mode === 'words' ? 250 : 0);
      u.onerror = () => next();
      speechSynthesis.speak(u);
    };
    next();
  });
}

// ─── personal key helpers (Settings) ────────────────────────────────────────

async function api(path, apiKey) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}

export async function fetchVoices(apiKey) {
  const data = await api('/voices', apiKey);
  return (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    accent: v.labels?.accent || '',
    gender: v.labels?.gender || '',
    age: v.labels?.age || '',
    description: v.labels?.description || v.labels?.descriptive || '',
    category: v.category || '',
    preview: v.preview_url || '',
  }));
}

export async function fetchSubscription(apiKey) {
  return api('/user/subscription', apiKey);
}

export async function clearAudioCache() {
  for (const url of state.memory.values()) URL.revokeObjectURL(url);
  state.memory.clear();
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* Cache API unavailable */
  }
}

export { MODES };

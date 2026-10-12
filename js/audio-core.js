// Shared by the browser app and scripts/generate-audio.mjs, so both agree on
// which text/mode/voice maps to which pre-generated audio file.

export const API_BASE = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';

// Premade American English voices (see `npm run voices` to list yours).
export const DEFAULT_VOICES = {
  A: 'EXAVITQu4vr4xnSDxMaL', // Sarah – female, American
  B: 'nPczCjzI2devNBz1zQrb', // Brian – male, American
};

// Shown in the voice picker until the real list of voices can be loaded
// (from the teacher's Google Script or a personal key).
export const PRESET_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', accent: 'american', gender: 'female' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', accent: 'american', gender: 'female' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', accent: 'american', gender: 'female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', accent: 'american', gender: 'female' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', accent: 'american', gender: 'male' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', accent: 'american', gender: 'male' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', accent: 'american', gender: 'male' },
  { id: 'TX3LPaxmHKxFdv7VPQ9H', name: 'Liam', accent: 'american', gender: 'male' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', accent: 'american', gender: 'male' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', accent: 'american', gender: 'male' },
];

export const MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 — best quality (1 credit/char)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 — fast, half the credits' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 — fast, half the credits' },
  { id: 'eleven_v3', label: 'Eleven v3 — most expressive' },
];

// natural = connected speech at normal speed
// slow    = same text, slower
// words   = each word said separately, with a pause (the "choppy" version)
export const MODES = {
  natural: { label: 'Play', speed: 1.0 },
  slow: { label: 'Slow', speed: 0.8 },
  words: { label: 'Word by word', speed: 0.95 },
};

export const OUTPUT_FORMAT = 'mp3_44100_64';

// cyrb53: small, fast, 53-bit string hash. Good enough to name audio files.
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// voiceId is the ElevenLabs voice ID, so clips of different voices can coexist.
export function audioKey(text, mode = 'natural', voiceId = DEFAULT_VOICES.A) {
  return cyrb53(`${voiceId}|${mode}|${text}`).toString(16).padStart(14, '0');
}

export function words(text) {
  return text.split(/\s+/).filter(Boolean);
}

// Word-by-word audio only makes sense for short phrases.
export function wordsModeAllowed(text) {
  const n = words(text).length;
  return n >= 2 && n <= 8;
}

export function ttsTextFor(text, mode, model = DEFAULT_MODEL) {
  if (mode !== 'words') return text;
  // v3 does not support <break>; an ellipsis gives a similar pause.
  const joiner = model.startsWith('eleven_v3') ? ' ... ' : ' <break time="0.35s"/> ';
  return words(text).join(joiner);
}

export function voiceSettings(mode) {
  return {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    use_speaker_boost: true,
    speed: (MODES[mode] || MODES.natural).speed,
  };
}

export function ttsRequestBody(text, mode, model = DEFAULT_MODEL) {
  return {
    text: ttsTextFor(text, mode, model),
    model_id: model,
    voice_settings: voiceSettings(mode),
  };
}

export function ttsUrl(voiceId) {
  return `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
}

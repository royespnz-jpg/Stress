// Sends exercise results and recordings to the teacher's Google Sheet through
// the Apps Script web app in google-apps-script/Code.gs.
import { getSettings, saveSettings } from './tts.js?v=202610122032';
import { isScriptUrl, scriptGet, scriptPost } from './script-api.js?v=202610122032';

const QUEUE_KEY = 'st.sheet.queue.v1';

export const isSheetUrl = isScriptUrl;

export function sheetConfigured() {
  return isSheetUrl(getSettings().sheetUrl);
}

export function studentName() {
  return (getSettings().student || '').trim();
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// A link that configures a student's browser to send results to this sheet.
export function studentLink(url = getSettings().sheetUrl, group = '') {
  const base = `${location.origin}${location.pathname}`;
  const params = new URLSearchParams({ sheet: url });
  if (group) params.set('group', group);
  return `${base}?${params}#/`;
}

// Reads ?sheet=…&group=… from a student link, saves it, and cleans the URL.
export function applyLinkParams() {
  const params = new URLSearchParams(location.search);
  const url = params.get('sheet');
  if (!url) return false;
  const ok = isSheetUrl(url);
  if (ok) {
    const patch = { sheetUrl: url.trim() };
    if (params.get('group')) patch.group = params.get('group').slice(0, 40);
    saveSettings(patch);
  }
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
  return ok;
}

const post = scriptPost;

export async function testConnection(url) {
  if (!isSheetUrl(url)) throw new Error('That is not an Apps Script web app URL (it should end in /exec).');
  return scriptGet(url);
}

// ─── offline queue (results only; the sheet ignores duplicates by id) ───────

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
  } catch {
    /* storage unavailable */
  }
}

export function pendingCount() {
  return readQueue().length;
}

export async function flushQueue() {
  const { sheetUrl } = getSettings();
  if (!isSheetUrl(sheetUrl)) return 0;
  let queue = readQueue();
  for (const payload of [...queue]) {
    try {
      await post(sheetUrl, payload);
      queue = queue.filter((p) => p.id !== payload.id);
      writeQueue(queue);
    } catch {
      break;
    }
  }
  return queue.length;
}

export async function sendResult(result) {
  const s = getSettings();
  const payload = { type: 'result', student: s.student, group: s.group, ...result };
  try {
    await post(s.sheetUrl, payload);
  } catch (err) {
    writeQueue([...readQueue().filter((p) => p.id !== payload.id), payload]);
    throw err;
  }
  flushQueue();
}

export async function sendRecording({ blob, text, durationSec }) {
  const s = getSettings();
  const audio = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
  return post(s.sheetUrl, {
    type: 'recording',
    id: newId(),
    student: s.student,
    group: s.group,
    text,
    mimeType: blob.type || 'audio/webm',
    audio,
    durationSec,
    recordedAt: new Date().toISOString(),
  });
}

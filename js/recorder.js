// Record yourself, then compare with the model (shadowing).
import { play, stop, saveSettings } from './tts.js';
import { icons, toast } from './ui.js';
import { sheetConfigured, studentName, sendRecording } from './sheets.js';

const MAX_MS = 12000;
let active = null; // { button, recorder, stream, timer }
const recordings = new WeakMap(); // container element → { url, blob, seconds }

export async function toggleRecording(button) {
  if (active && active.button === button) return finish();
  if (active) finish();
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('Recording is not supported in this browser.');
    return;
  }
  stop();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast('Microphone permission was denied.');
    return;
  }
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  const startedAt = Date.now();
  recorder.addEventListener('dataavailable', (e) => e.data.size && chunks.push(e.data));
  recorder.addEventListener('stop', () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    showResult(button, blob, (Date.now() - startedAt) / 1000);
  });
  recorder.start();
  button.classList.add('is-recording');
  button.querySelector('span')?.replaceChildren('Stop');
  active = { button, recorder, stream, timer: setTimeout(finish, Number(button.dataset.max) || MAX_MS) };
}

function finish() {
  if (!active) return;
  const { button, recorder, timer } = active;
  clearTimeout(timer);
  active = null;
  button.classList.remove('is-recording');
  button.querySelector('span')?.replaceChildren('Record');
  if (recorder.state !== 'inactive') recorder.stop();
}

function showResult(button, blob, seconds) {
  const host = button.closest('.ex, .rec-host');
  const out = host?.querySelector('.rec-out');
  if (!out) return;
  const old = recordings.get(host);
  if (old) URL.revokeObjectURL(old.url);
  recordings.set(host, { url: URL.createObjectURL(blob), blob, seconds });
  out.hidden = false;
  out.innerHTML = `<span>Your recording:</span>
    <button type="button" class="pbtn" data-play-mine>${icons.play}<span>You</span></button>
    ${'free' in button.dataset ? '' : `<button type="button" class="pbtn" data-compare>${icons.play}<span>Model → You</span></button>`}
    ${sheetConfigured() ? '<button type="button" class="pbtn" data-send-rec>Send to my teacher</button>' : ''}`;
}

async function sendToTeacher(host, button) {
  const rec = recordings.get(host);
  const text = host.querySelector('[data-rec]')?.dataset.text;
  if (!rec || !text) return;
  if (!studentName()) {
    const name = window.prompt('Your name (so your teacher knows who sent it):')?.trim();
    if (!name) return;
    saveSettings({ student: name.slice(0, 80) });
  }
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    await sendRecording({ blob: rec.blob, text, durationSec: Math.round(rec.seconds * 10) / 10 });
    button.textContent = 'Sent ✓';
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Send to my teacher';
    toast(`Couldn't send the recording: ${err.message}`);
  }
}

function playMine(host) {
  const url = recordings.get(host)?.url;
  if (!url) return Promise.resolve();
  stop();
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.addEventListener('ended', resolve);
    a.addEventListener('error', resolve);
    a.play().catch(resolve);
  });
}

export function handleRecorderClick(target) {
  const host = target.closest('.ex, .rec-host');
  if (target.closest('[data-play-mine]')) {
    playMine(host);
    return true;
  }
  const send = target.closest('[data-send-rec]');
  if (send) {
    sendToTeacher(host, send);
    return true;
  }
  if (target.closest('[data-compare]')) {
    const text = host.querySelector('[data-rec]')?.dataset.text;
    if (text) play(text).then(() => playMine(host));
    return true;
  }
  const rec = target.closest('[data-rec]');
  if (rec) {
    toggleRecording(rec);
    return true;
  }
  return false;
}

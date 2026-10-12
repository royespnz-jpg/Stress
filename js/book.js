// The book recordings. They stay in the teacher's Google Drive (the folder of
// the session: "Chapter 6 Stress and Chapter 7 Stress (Advanced)" and "Word
// Stress Practices"); Google doesn't let other pages play Drive's own links,
// so the teacher's Google Script lists those folders and sends each file.
//
// Each step with a recording says where it is in the book: `{ page, label }`
// (Accurate English: "table 6-1", "exercise h", "practice 3") or
// `{ page, code }` (English Pronunciation in Use: the track B5…B54). The files
// are named after the page and the activity ("15_chapter 6_Stress_table
// 6-1_page 63.mp3"), so a step finds its file by the page and the words of its
// label; when a page has two recordings and the names don't tell them apart,
// they are taken in track order.
import { WORKSHEETS, stepsOf } from './worksheets.js';
import { CACHE_NAME, getSettings, onHalt, scriptStatus, checkScript, stop as stopVoice } from './tts.js';
import { isScriptUrl, scriptPost } from './script-api.js';
import { esc, icons } from './ui.js';

// ─── which file is which ────────────────────────────────────────────────────

// Underscores and dots count as spaces: "15_chapter 6_Stress_table 6-1_page 63.mp3".
const norm = (s) => String(s).toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ');
const pageOf = (name) => {
  const m = /\b(?:page|pg|pp|p)\s*-?\s*0*(\d{2,3})\b/.exec(norm(name));
  return m ? Number(m[1]) : null;
};
const trackNo = (name) => Number((/^\s*0*(\d+)/.exec(name) || [])[1] ?? Infinity);

// Which book a file belongs to: its folder, or the words in its name.
function bookOf(file) {
  const where = norm(`${file.folder || ''} ${file.name}`);
  if (/word stress|pronunciation in use|\bunit\b|\bb\d{1,2}\b/.test(where)) return 'epu';
  if (/chapter|accurate|table|practice|exercise|stress \(advanced\)/.test(where)) return 'ae';
  return null;
}

const re = (src) => new RegExp(src, 'i');

// How well a file name fits an activity (0 = not at all): the page, the
// activity's name in the book ("table 6-1", "exercise h", "22.4", "A"), the
// unit, the track code (B5).
function fit(slot, file) {
  const name = norm(file.name);
  const page = pageOf(file.name);
  if (page != null && page !== slot.audio.page) return 0;
  let score = page === slot.audio.page ? 2 : 0;
  const { code, label } = slot.audio;
  if (code && re(`\\b${code.replace(/^([a-z])0*/i, '$1\\s*0*')}\\b`).test(name)) score += 4;
  if (label) {
    const [kind, id] = label.toLowerCase().split(' ');
    const kinds = { table: 'table', exercise: '(?:exercise|ex)', practice: '(?:practice|pr)' };
    if (re(`\\b${kinds[kind] || kind}\\b[\\s-]*${id.replace('-', '[\\s.-]*')}\\b`).test(name)) score += 3;
  }
  if (slot.book === 'epu') {
    const unit = slot.unit;
    if (unit && re(`\\b(?:unit|u)\\s*${unit}\\b`).test(name)) score += 2;
    const key = String(slot.step).toLowerCase();
    if (/^\d+\.\d+$/.test(key)) {
      const [u, n] = key.split('.');
      if (re(`(?:^|\\s)${u}\\s*[.-]?\\s*${n}(?=\\s|$)`).test(name)) score += 4;
    } else if (/^[a-z]$/.test(key) && re(`(?:^|\\s)(?:section\\s*|part\\s*|activity\\s*|exercise\\s*|ex\\s*)?${key}(?=\\s|$)`).test(name)) {
      score += 3;
    }
  }
  return score;
}

// Every recording a worksheet needs, in book order, with its rank on its page.
export function audioSlots() {
  const slots = [];
  const seen = new Set();
  for (const sheet of WORKSHEETS) {
    for (const step of stepsOf(sheet)) {
      if (!step.audio) continue;
      const key = slotKey(sheet.book, step.audio);
      if (seen.has(key)) continue;
      seen.add(key);
      const unit = (/\d+/.exec(sheet.short) || [])[0];
      slots.push({ key, book: sheet.book, audio: step.audio, sheet: sheet.id, step: step.key, n: step.n, unit: sheet.book === 'epu' ? unit : null });
    }
  }
  for (const s of slots) {
    const same = slots.filter((o) => o.book === s.book && o.audio.page === s.audio.page);
    s.rank = same.indexOf(s);
    s.ofPage = same.length;
  }
  return slots;
}

export const slotKey = (book, audio) => `${book}:${audio.page}:${audio.code || audio.label}`;

const isAudio = (f) => !f.mime || /^audio\//.test(f.mime) || /\.(mp3|m4a|wav|ogg|mpeg|aac|wma)$/i.test(f.name);
const byTrack = (a, b) => trackNo(a.name) - trackNo(b.name) || a.name.localeCompare(b.name);

// slot key → file, for all the slots at once (so two recordings of one page
// don't end up with the same file).
export function matchFiles(files, slots = audioSlots()) {
  const out = new Map();
  const used = new Set();
  const audioFiles = files.filter(isAudio);
  const pool = (slot) => {
    const known = audioFiles.filter((f) => bookOf(f) === slot.book);
    return known.length ? known : audioFiles;
  };
  // 1. Names that say which activity they are: the best fits first.
  const pairs = [];
  for (const slot of slots) for (const f of pool(slot)) {
    const score = fit(slot, f);
    if (score >= 4) pairs.push({ slot, f, score });
  }
  pairs.sort((a, b) => b.score - a.score || byTrack(a.f, b.f));
  for (const { slot, f } of pairs) {
    if (out.has(slot.key) || used.has(f.id)) continue;
    out.set(slot.key, f);
    used.add(f.id);
  }
  // 2. The rest of each page, in track order.
  for (const slot of slots) {
    if (out.has(slot.key)) continue;
    const pagePool = pool(slot).filter((f) => !used.has(f.id) && pageOf(f.name) === slot.audio.page).sort(byTrack);
    const left = slots.filter((o) => o.book === slot.book && o.audio.page === slot.audio.page && !out.has(o.key));
    const i = left.indexOf(slot);
    const hit = pagePool.length === left.length ? pagePool[i] : null;
    if (hit) {
      out.set(slot.key, hit);
      used.add(hit.id);
    }
  }
  return out;
}

// ─── the list from the Google Script ────────────────────────────────────────

let listing = null;

export function bookFiles({ force = false } = {}) {
  if (!listing || force) {
    listing = (async () => {
      const s = getSettings();
      if (!isScriptUrl(s.sheetUrl)) throw new Error('no Google Script is connected (Settings)');
      if (scriptStatus().status === 'unknown' || scriptStatus().status === 'checking') await checkScript();
      const res = await scriptPost(s.sheetUrl, { type: 'book-list' });
      return res.files || [];
    })();
    listing.catch(() => (listing = null));
  }
  return listing;
}

export async function bookMatches(opts) {
  return matchFiles(await bookFiles(opts));
}

// ─── playing a recording ────────────────────────────────────────────────────

const urls = new Map(); // file id → object URL

async function fileUrl(file) {
  if (urls.has(file.id)) return urls.get(file.id);
  const cacheReq = new Request(`https://book-audio.invalid/${file.id}`);
  let blob = null;
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(cacheReq);
    if (hit) blob = await hit.blob();
  } catch {
    /* Cache API unavailable */
  }
  if (!blob) {
    const res = await scriptPost(getSettings().sheetUrl, { type: 'book-audio', id: file.id });
    if (!res.audio) throw new Error('the Google Script sent no audio');
    blob = new Blob([Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0))], { type: res.mime || 'audio/mpeg' });
    try {
      await (await caches.open(CACHE_NAME)).put(cacheReq, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    } catch {
      /* Cache API unavailable */
    }
  }
  const url = URL.createObjectURL(blob);
  urls.set(file.id, url);
  return url;
}

let current = null; // { audio, el }
onHalt(() => pauseCurrent());

function pauseCurrent() {
  if (current) {
    current.audio.pause();
    setState(current.el, 'paused');
  }
}

const fmt = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––');

function setState(el, state, message) {
  el.dataset.state = state;
  const btn = el.querySelector('[data-book-toggle]');
  if (btn) {
    btn.innerHTML = state === 'playing' ? icons.pause : icons.play;
    btn.setAttribute('aria-label', state === 'playing' ? 'Pause the book recording' : 'Play the book recording');
  }
  const msg = el.querySelector('[data-book-msg]');
  if (msg && message !== undefined) msg.textContent = message;
}

function draw(el, audio) {
  const bar = el.querySelector('[data-book-bar] span');
  const time = el.querySelector('[data-book-time]');
  if (bar) bar.style.width = `${audio.duration ? (100 * audio.currentTime) / audio.duration : 0}%`;
  if (time) time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
}

export function bookPlayerHtml(book, audio) {
  const label = audio.label && audio.label.replace(/^\w/, (c) => c.toUpperCase()).replace(/ ([a-z])$/, (m, c) => ` ${c.toUpperCase()}`);
  const where = audio.code ? `Track ${audio.code} · p. ${audio.page}` : `p. ${audio.page} · ${label}`;
  return `<div class="book-player" data-book-player="${esc(slotKey(book, audio))}" data-state="idle">
    <button type="button" class="bp-toggle" data-book-toggle aria-label="Play the book recording">${icons.play}</button>
    <div class="bp-body">
      <div class="bp-top"><span class="bp-label">${icons.headphones}Book recording</span><span class="bp-where">${esc(where)}</span><span class="bp-time" data-book-time></span></div>
      <div class="bp-bar" data-book-bar role="slider" tabindex="0" aria-label="Position in the recording" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      <div class="bp-msg" data-book-msg aria-live="polite"></div>
    </div>
  </div>`;
}

export async function handleBookClick(target) {
  const el = target.closest('[data-book-player]');
  if (!el) return false;
  const bar = target.closest('[data-book-bar]');
  if (bar) {
    if (current?.el === el && current.audio.duration) {
      const r = bar.getBoundingClientRect();
      const x = (window.event?.clientX ?? r.left) - r.left;
      current.audio.currentTime = Math.max(0, Math.min(1, x / r.width)) * current.audio.duration;
      draw(el, current.audio);
    }
    return true;
  }
  if (!target.closest('[data-book-toggle]')) return true;
  if (current?.el === el && el.dataset.state === 'playing') {
    pauseCurrent();
    return true;
  }
  if (current?.el === el && current.audio.src) {
    stopVoice();
    current = { ...current };
    current.audio.play().then(() => setState(el, 'playing', '')).catch(() => setState(el, 'error', 'Could not play the recording.'));
    return true;
  }
  stopVoice();
  pauseCurrent();
  setState(el, 'loading', 'Loading the recording from the teacher’s Drive…');
  try {
    const matches = await bookMatches();
    const file = matches.get(el.dataset.bookPlayer);
    if (!file) throw new Error('its file isn’t in the teacher’s folder (or its name doesn’t say the page)');
    const url = await fileUrl(file);
    const audio = new Audio(url);
    audio.addEventListener('timeupdate', () => draw(el, audio));
    audio.addEventListener('loadedmetadata', () => draw(el, audio));
    audio.addEventListener('ended', () => setState(el, 'idle', ''));
    current = { audio, el };
    el.title = file.name;
    await audio.play();
    setState(el, 'playing', '');
  } catch (err) {
    setState(el, 'error', `The book recording isn’t available: ${err.message}.`);
  }
  return true;
}

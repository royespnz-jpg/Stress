// The voice-engine popover in the top bar: choose ElevenLabs or the browser
// voice, see the connection status, and pick the two voices (main + second
// speaker) with free previews.
import {
  getSettings,
  saveSettings,
  loadVoices,
  voicesInfo,
  voiceById,
  currentVoices,
  voiceName,
  scriptStatus,
  play,
  playPreview,
  stop,
  onAudioEvent,
} from './tts.js';
import { cyrb53 } from './audio-core.js';
import { esc, icons, toast } from './ui.js';

const SAMPLE = 'Did you eat your lunch yet? Let me see what you have.';
const ui = { slot: 'A', query: '', american: true, loading: false };
let trigger;
let panel;

export function initVoicePanel() {
  trigger = document.getElementById('engine');
  panel = document.getElementById('engine-panel');
  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      close();
      trigger.focus();
    }
  });
  panel.addEventListener('click', onClick);
  panel.addEventListener('input', (e) => {
    if (e.target.matches('.vp-search')) {
      ui.query = e.target.value;
      renderList();
    }
    if (e.target.matches('[data-american]')) {
      ui.american = e.target.checked;
      renderList();
    }
  });
  panel.addEventListener('keydown', onListKeys);
  onAudioEvent((e) => {
    if (!panel.hidden && ['engine', 'voices', 'settings'].includes(e.type)) render();
  });
}

export async function open(slot) {
  if (slot) ui.slot = slot;
  panel.hidden = false;
  panel.classList.remove('closing');
  trigger.setAttribute('aria-expanded', 'true');
  render();
  panel.querySelector('.seg [aria-checked="true"]')?.focus({ preventScroll: true });
  ui.loading = true;
  await loadVoices();
  ui.loading = false;
  if (!panel.hidden) render();
}

export function close() {
  if (panel.hidden) return;
  trigger.setAttribute('aria-expanded', 'false');
  panel.classList.add('closing');
  setTimeout(() => {
    panel.hidden = true;
    panel.classList.remove('closing');
  }, 150);
}

// ─── rendering ──────────────────────────────────────────────────────────────

function statusHtml(s) {
  if (s.engine === 'browser') {
    return { cls: '', text: 'Using the voice built into this browser. Switch to ElevenLabs for natural voices.' };
  }
  if (s.apiKey) return { cls: 'ok', text: 'Connected with your personal ElevenLabs key.' };
  const st = scriptStatus();
  if (st.status === 'checking' || st.status === 'unknown') return { cls: 'busy', text: 'Connecting to the Google Script voice engine…' };
  if (st.status === 'ok') {
    return {
      cls: 'ok',
      text: `ElevenLabs through the Google Script${st.sheet ? ` of <b>${esc(st.sheet)}</b>` : ''}. The API key stays private.`,
    };
  }
  if (st.status === 'other') {
    return {
      cls: 'warn',
      text: 'The Google Script at this URL is <b>not the Stress Lab script</b> (maybe the Connected Speech one). Make a new sheet, paste the Stress Lab <b>Code.gs</b>, run <b>setup</b>, deploy it and use its URL. Meanwhile the browser voice is used.',
    };
  }
  if (st.status === 'no-tts') {
    return {
      cls: 'warn',
      text: 'The Google Script has no ElevenLabs key yet. In the sheet: <b>Stress Lab → Guardar API key de ElevenLabs</b>, then redeploy. Meanwhile the browser voice is used.',
    };
  }
  return { cls: 'warn', text: `Can't reach the Google Script (${esc(st.error || 'offline')}). The browser voice is used meanwhile.` };
}

function usageHtml() {
  const { usage } = voicesInfo();
  if (!usage?.limit) return '';
  const pct = Math.min(100, Math.round((100 * usage.today) / usage.limit));
  return `<div class="vp-usage"><div class="bar"><span style="width:${pct}%"></span></div>
    <small>${usage.today.toLocaleString()} / ${usage.limit.toLocaleString()} new characters today · repeats are free</small></div>`;
}

function render() {
  const s = getSettings();
  const st = statusHtml(s);
  panel.classList.toggle('vp-disabled', s.engine === 'browser');
  panel.innerHTML = `
    <div class="vp-head">
      <div><div class="eyebrow">Voice engine</div><h2>Choose a voice</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icons.close}</button>
    </div>
    <div class="vp-body">
      <div class="seg" role="radiogroup" aria-label="Engine" data-value="${s.engine}">
        <button type="button" role="radio" aria-checked="${s.engine !== 'browser'}" data-engine="eleven">ElevenLabs</button>
        <button type="button" role="radio" aria-checked="${s.engine === 'browser'}" data-engine="browser">Browser voice</button>
      </div>
      <div class="vp-status ${st.cls}" role="status"><span class="dot" aria-hidden="true"></span>
        <div>${st.text}${s.engine !== 'browser' ? usageHtml() : ''}</div></div>
      <div class="vp-tabs" role="tablist" aria-label="Which voice">
        ${tab('A', 'Main voice', s)}
        ${tab('B', 'Second speaker', s)}
      </div>
      <div class="vp-tools">
        <input class="vp-search" type="search" placeholder="Search voices" aria-label="Search voices" value="${esc(ui.query)}">
        <label class="vp-filter"><input type="checkbox" data-american ${ui.american ? 'checked' : ''}> American</label>
      </div>
      <ul class="vp-list" role="listbox" aria-label="Voices" id="vp-list"></ul>
    </div>
    <div class="vp-foot">
      <button type="button" class="pbtn main" data-sample>${icons.play}<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Try the voice</span></button>
      <a href="#/settings" data-close>All settings</a>
    </div>`;
  renderList();
}

function tab(slot, label, s) {
  const id = slot === 'B' ? s.voiceB : s.voiceA;
  const name = voiceById(id)?.name || voiceName(slot);
  return `<button type="button" class="vp-tab" role="tab" aria-selected="${ui.slot === slot}" data-slot="${slot}">
    <small>${label}</small><span>${esc(name)}</span></button>`;
}

function hue(id) {
  return cyrb53(id) % 360;
}

function filteredVoices() {
  const { source } = voicesInfo();
  const all = voiceListOrPreset();
  const q = ui.query.trim().toLowerCase();
  let list = all.filter((v) => !q || `${v.name} ${v.accent} ${v.gender} ${v.description}`.toLowerCase().includes(q));
  if (ui.american && source === 'account') {
    const us = list.filter((v) => /americ|us\b|u\.s\./i.test(v.accent));
    if (us.length) list = us;
  }
  return list;
}

function voiceListOrPreset() {
  // loadVoices() fills the list; before that, show the current choices.
  const s = getSettings();
  const known = [voiceById(s.voiceA), voiceById(s.voiceB)].filter(Boolean);
  return currentVoices() || known;
}

function renderList() {
  const listEl = panel.querySelector('#vp-list');
  if (!listEl) return;
  const s = getSettings();
  const selected = ui.slot === 'B' ? s.voiceB : s.voiceA;
  const voices = filteredVoices();
  if (ui.loading && voices.length < 3) {
    listEl.innerHTML = '<li class="vp-empty">Loading voices…</li>';
    return;
  }
  if (!voices.length) {
    listEl.innerHTML = '<li class="vp-empty">No voices match.</li>';
    return;
  }
  listEl.innerHTML = voices
    .map((v, i) => {
      const meta = [v.accent, v.gender, v.age].filter(Boolean).join(' · ') || v.category || 'voice';
      return `<li class="vp-item" style="--i:${Math.min(i, 12)}">
        <button type="button" class="vp-pick" role="option" aria-selected="${v.id === selected}" data-voice="${esc(v.id)}"
          data-name="${esc(v.name)}" tabindex="${v.id === selected ? 0 : -1}">
          <span class="vp-avatar" style="--h:${hue(v.id)}" aria-hidden="true">${esc(v.name.slice(0, 1))}</span>
          <span><span class="vp-name">${esc(v.name)}</span><span class="vp-meta">${esc(meta)}</span></span>
          <span class="vp-check" aria-hidden="true"></span>
        </button>
        <button type="button" class="pbtn vp-preview" data-preview="${esc(v.id)}" aria-label="Preview ${esc(v.name)}" title="Preview">${icons.play}<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>
      </li>`;
    })
    .join('');
  if (!listEl.querySelector('[tabindex="0"]')) listEl.querySelector('.vp-pick')?.setAttribute('tabindex', '0');
}

// ─── interaction ────────────────────────────────────────────────────────────

function markPlaying(btn) {
  panel.querySelectorAll('.is-playing').forEach((b) => b.classList.remove('is-playing'));
  btn?.classList.add('is-playing');
}

async function onClick(e) {
  const t = e.target;
  if (t.closest('[data-close]')) {
    close();
    return;
  }
  const eng = t.closest('[data-engine]');
  if (eng) {
    stop();
    saveSettings({ engine: eng.dataset.engine });
    return;
  }
  const tabBtn = t.closest('[data-slot]');
  if (tabBtn) {
    ui.slot = tabBtn.dataset.slot;
    render();
    return;
  }
  const pick = t.closest('[data-voice]');
  if (pick) {
    const patch = ui.slot === 'B' ? { voiceB: pick.dataset.voice, voiceBName: pick.dataset.name } : { voiceA: pick.dataset.voice, voiceAName: pick.dataset.name };
    stop();
    saveSettings(patch);
    toast(`${ui.slot === 'B' ? 'Second speaker' : 'Main voice'}: ${pick.dataset.name}`);
    return;
  }
  const prev = t.closest('[data-preview]');
  if (prev) {
    const v = voiceById(prev.dataset.preview);
    stop();
    markPlaying(prev);
    if (v?.preview) await playPreview(v.preview);
    else await play(SAMPLE, { voiceId: prev.dataset.preview });
    prev.classList.remove('is-playing');
    return;
  }
  const sample = t.closest('[data-sample]');
  if (sample) {
    stop();
    markPlaying(sample);
    await play(SAMPLE, { voice: ui.slot });
    sample.classList.remove('is-playing');
  }
}

// Arrow keys move through the listbox (roving tabindex).
function onListKeys(e) {
  const current = e.target.closest?.('.vp-pick');
  if (!current || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const all = [...panel.querySelectorAll('.vp-pick')];
  const i = all.indexOf(current);
  const next =
    e.key === 'Home' ? all[0] : e.key === 'End' ? all.at(-1) : all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  all.forEach((b) => b.setAttribute('tabindex', '-1'));
  next.setAttribute('tabindex', '0');
  next.focus();
}

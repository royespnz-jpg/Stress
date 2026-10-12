import { BOOKS, GROUPS, WORKSHEETS, sheetById } from './worksheets.js?v=202610121954';
import {
  play,
  stop,
  loadManifest,
  onAudioEvent,
  engineSummary,
  getSettings,
  saveSettings,
  fetchSubscription,
  clearAudioCache,
  checkScript,
  loadVoices,
} from './tts.js?v=202610121954';
import { handleRecorderClick } from './recorder.js?v=202610121954';
import { handleBookClick, bookFiles } from './book.js?v=202610121954';
import { esc, toast } from './ui.js?v=202610121954';
import { initVoicePanel, open as openVoicePanel } from './voice-panel.js?v=202610121954';
import { renderHome } from './views/home.js?v=202610121954';
import { renderSheet, handleSheetClick, handleSheetKey, handleNameForm, resetSheet } from './views/sheet.js?v=202610121954';
import { renderLab, renderLabResult, handleDrillClick } from './views/lab.js?v=202610121954';
import { renderSettings, renderCredits, bookTableHtml } from './views/settings.js?v=202610121954';
import { applyLinkParams, flushQueue, isSheetUrl, testConnection } from './sheets.js?v=202610121954';

const root = document.documentElement;
const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
const menuBtn = document.getElementById('menu-btn');
const engineEl = document.getElementById('engine');
const engineLabel = document.getElementById('engine-label');
const stopBtn = document.getElementById('stop-btn');
const themeBtn = document.getElementById('theme-btn');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ─── theme ──────────────────────────────────────────────────────────────────

function currentTheme() {
  return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const apply = () => {
    root.dataset.theme = next;
    try {
      localStorage.setItem('st.theme', next);
    } catch {
      /* storage unavailable */
    }
  };
  if (document.startViewTransition && !reducedMotion.matches) document.startViewTransition(apply);
  else apply();
});

// ─── navigation ─────────────────────────────────────────────────────────────

function renderSidebar(active) {
  let n = 0;
  const link = (href, label, num = '', extra = '') =>
    `<a class="nav-link" href="${href}"${active === href ? ' aria-current="page"' : ''}>${num ? `<span class="nav-num">${num}</span>` : ''}<span>${label}</span>${extra}</a>`;
  sidebar.innerHTML = `
    <div class="nav-group">${link('#/', 'Overview')}</div>
    ${GROUPS.map(
      (g) => `<div class="nav-group">
        <div class="nav-title">${esc(g.title.split(' · ')[1] || g.title)}<small>${esc(BOOKS[g.book].short)}</small></div>
        ${g.ids
          .map((id) => {
            const s = sheetById(id);
            return link(`#/sheet/${id}`, `<b class="nav-short">${esc(s.short)}</b> ${esc(s.title.split(' — ').pop())}`, String(++n).padStart(2, '0'));
          })
          .join('')}
      </div>`,
    ).join('')}
    <div class="nav-group">
      <div class="nav-title">More practice</div>
      ${link('#/lab', 'Stress Lab · drill')}
    </div>
    <div class="nav-group">${link('#/settings', 'Voice, recordings &amp; results')}</div>`;
}

function setMenu(open) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
scrim.addEventListener('click', () => setMenu(false));

// Staggered reveal as elements scroll into view.
const REVEAL = [
  '.topic-head > *',
  '.part-h',
  '.part-text',
  '.step',
  '.set-card',
  '.how-grid > .card',
  '.home-section > h2',
  '.group-head',
  '.cta-card',
  '.settings-stack > *',
  '.lab-grid > *',
].join(',');

const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          let n = 0;
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.style.setProperty('--i', Math.min(n++, 10));
            e.target.classList.add('in');
            observer.unobserve(e.target);
          }
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.02 },
      )
    : null;

function reveal(scope) {
  if (!observer || reducedMotion.matches) return;
  scope.querySelectorAll(REVEAL).forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}

function view(parts) {
  if (!parts.length) return { html: renderHome(), active: '#/', title: 'Stress Lab · Word stress practice' };
  if (parts[0] === 'sheet') {
    resetSheet();
    const html = renderSheet(parts[1]);
    const s = sheetById(parts[1]);
    return html && { html, active: `#/sheet/${parts[1]}`, title: `${s.short} ${s.title} · Stress Lab` };
  }
  if (parts[0] === 'lab') return { html: renderLab(), active: '#/lab', title: 'Lab · Stress Lab' };
  if (parts[0] === 'settings') return { html: renderSettings(), active: '#/settings', title: 'Settings · Stress Lab' };
  return null;
}

function route() {
  const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
  stop();
  const v = view(parts) || {
    html: '<h1>Page not found</h1><p><a href="#/">Back to the overview</a></p>',
    active: '',
    title: 'Not found · Stress Lab',
  };
  const update = () => {
    main.innerHTML = v.html;
    document.title = v.title;
    renderSidebar(v.active);
    setMenu(false);
    window.scrollTo(0, 0);
    if (parts[0] === 'lab') renderLabResult(document.getElementById('lab-input').value);
    reveal(main);
  };
  if (document.startViewTransition && !reducedMotion.matches && main.childElementCount) {
    document.startViewTransition(update);
  } else {
    update();
  }
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);

// ─── audio state in the UI ──────────────────────────────────────────────────

let activeButton = null;

function refreshEngine() {
  const { label, short, level } = engineSummary();
  engineLabel.innerHTML = `<span class="long">${esc(label)}</span><span class="short">${esc(short)}</span>`;
  engineEl.dataset.level = level;
  engineEl.setAttribute('aria-label', `Voice engine: ${label}. Choose voices`);
}

function clearPlaying() {
  document.querySelectorAll('.is-playing, .is-loading').forEach((el) => {
    if (!el.closest('.engine-panel')) el.classList.remove('is-playing', 'is-loading');
  });
  root.classList.remove('audio-playing');
  stopBtn.hidden = true;
}

function markOnly(btn, cls) {
  document.querySelectorAll('.is-playing, .is-loading').forEach((el) => {
    if (el !== btn && !el.closest('.engine-panel') && !el.contains(btn)) el.classList.remove('is-playing', 'is-loading');
  });
  btn?.classList.add(cls);
}

onAudioEvent((e) => {
  if (e.type === 'loading') markOnly(activeButton, 'is-loading');
  if (e.type === 'play') {
    markOnly(activeButton, 'is-playing');
    activeButton?.classList.remove('is-loading');
    activeButton?.classList.add('is-playing');
    activeButton?.closest('.ex, .dlg-line')?.classList.add('is-playing');
    root.classList.add('audio-playing');
    engineEl.title = `Playing: ${e.source}`;
    stopBtn.hidden = false;
  }
  if (e.type === 'end' || e.type === 'stop') {
    clearPlaying();
    activeButton = null;
  }
  if (e.type === 'error') toast(e.message);
  if (['settings', 'engine', 'voices'].includes(e.type)) refreshEngine();
});

stopBtn.addEventListener('click', () => stop());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    stop();
    setMenu(false);
    return;
  }
  handleSheetKey(e, main);
});

async function playDialogue(container) {
  const buttons = [...container.querySelectorAll('.dlg-actions [data-play]')];
  stop();
  const token = Symbol('dialogue');
  playDialogue.current = token;
  for (const btn of buttons) {
    activeButton = btn;
    await play(btn.dataset.text, { mode: btn.dataset.mode, voice: btn.dataset.voice });
    if (playDialogue.current !== token || !document.body.contains(btn)) return;
    await new Promise((r) => setTimeout(r, 250));
    if (playDialogue.current !== token) return;
  }
}

// ─── delegated events ───────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof Element) || t.closest('.engine-panel')) return;

  if (t.closest('[data-book-player]')) {
    playDialogue.current = null;
    handleBookClick(t);
    return;
  }

  const playBtn = t.closest('[data-play]');
  if (playBtn) {
    playDialogue.current = null;
    if (playBtn.classList.contains('is-playing')) {
      stop();
      return;
    }
    stop();
    activeButton = playBtn;
    play(playBtn.dataset.text, { mode: playBtn.dataset.mode, voice: playBtn.dataset.voice });
    return;
  }

  const dlg = t.closest('[data-play-dialogue]');
  if (dlg) {
    playDialogue(document.getElementById(dlg.dataset.playDialogue));
    return;
  }

  if (handleRecorderClick(t)) return;

  const sample = t.closest('[data-sample]');
  if (sample) {
    const input = document.getElementById('lab-input');
    input.value = sample.dataset.sample;
    renderLabResult(input.value);
    return;
  }
  if (handleDrillClick(t)) return;

  if (main.querySelector('[data-sheet]')) {
    const r = handleSheetClick(t, main);
    if (r === 'rerender') route();
    if (r) return;
  }

  // settings page
  if (t.closest('[data-open-voices]')) {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    openVoicePanel();
    return;
  }
  if (t.closest('[data-toggle-key]')) {
    const input = document.getElementById('api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    t.closest('[data-toggle-key]').textContent = input.type === 'password' ? 'Show' : 'Hide';
    return;
  }
  if (t.closest('[data-check-credits]')) {
    const key = document.getElementById('api-key').value.trim() || getSettings().apiKey;
    if (!key) return toast('Enter your ElevenLabs API key first.');
    try {
      renderCredits(await fetchSubscription(key));
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-clear-cache]')) {
    await clearAudioCache();
    toast('Cached audio cleared.');
    return;
  }
  const bookCheck = t.closest('[data-book-check]');
  if (bookCheck) {
    const out = document.getElementById('book-out');
    bookCheck.disabled = true;
    out.innerHTML = '<p class="muted">Asking the Google Script for the list of recordings…</p>';
    try {
      out.innerHTML = bookTableHtml(await bookFiles({ force: true }));
    } catch (err) {
      out.innerHTML = `<p class="warn-text">Couldn’t get the list: ${esc(err.message)}</p>`;
    }
    bookCheck.disabled = false;
    return;
  }
  if (t.closest('[data-test-sheet]')) {
    const url = document.getElementById('sheet-url').value.trim();
    try {
      const info = await testConnection(url);
      if (info.app !== 'Stress Lab') toast(`That is the script of “${info.sheet}”, but not the Stress Lab script. Use the Stress Lab one.`);
      else toast(`Connected to “${info.sheet}”${info.tts ? ' · voice engine ready' : ' · no ElevenLabs key yet'}${info.book ? ' · book recordings ready' : ''}. Press Save.`);
    } catch (err) {
      toast(`Couldn't connect: ${err.message}`);
    }
    return;
  }
  if (t.closest('[data-copy-link]')) {
    const input = document.getElementById('student-link');
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Student link copied.');
    } catch {
      input.select();
      toast('Select the link and copy it.');
    }
    return;
  }
  if (t.closest('[data-flush-sheet]')) {
    const left = await flushQueue();
    toast(left ? `${left} result(s) still pending.` : 'All pending results were sent.');
    route();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-model]')) {
    saveSettings({ model: e.target.value });
    toast('Model saved.');
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.id === 'settings-form') {
    e.preventDefault();
    const data = new FormData(form);
    saveSettings({ apiKey: String(data.get('apiKey') || '').trim() });
    loadVoices({ force: true });
    toast('Saved.');
    return;
  }
  if (form.id === 'sheet-form') {
    e.preventDefault();
    const data = new FormData(form);
    const sheetUrl = String(data.get('sheetUrl') || '').trim();
    if (sheetUrl && !isSheetUrl(sheetUrl)) {
      toast('That is not an Apps Script web app URL (it should end in /exec).');
      return;
    }
    saveSettings({
      student: String(data.get('student') || '').trim(),
      group: String(data.get('group') || '').trim(),
      sheetUrl,
    });
    toast('Saved.');
    checkScript().then(() => location.hash.startsWith('#/settings') && route());
    return;
  }
  if (form.matches('[data-name-form]')) {
    e.preventDefault();
    handleNameForm(form, main);
  }
});

let labTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'lab-input') {
    clearTimeout(labTimer);
    labTimer = setTimeout(() => renderLabResult(e.target.value), 250);
  }
});

// ─── start ──────────────────────────────────────────────────────────────────

const linked = applyLinkParams();
initVoicePanel();
refreshEngine();
route();
loadManifest().then(refreshEngine);
checkScript().then(() => {
  refreshEngine();
  // The settings page shows what the script can do: show it once it's known.
  if (location.hash.startsWith('#/settings')) route();
  if (getSettings().engine !== 'browser') loadVoices().then(refreshEngine);
});
if (linked) toast("Connected to your teacher's results sheet.");
flushQueue();

// For the console and tests.
window.stressLab = { WORKSHEETS };

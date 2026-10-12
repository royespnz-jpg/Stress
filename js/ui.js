import { escapeHtml as esc } from './text.js?v=202610122032';

export { esc };

export const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  slow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6V4zm-1 3v6l5 3 1-1.7-4-2.3V7h-2z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  arrowL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 6.6 14 5.2 7.2 12l6.8 6.8 1.4-1.4L10 12z"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 17.4 10 18.8l6.8-6.8L10 5.2 8.6 6.6 14 12z"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-9 9v6.5A2.5 2.5 0 0 0 5.5 21H8v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2.5a2.5 2.5 0 0 0 2.5-2.5V12a9 9 0 0 0-9-9z"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H7.5a1.5 1.5 0 0 0 0 3H20v1H7.5A2.5 2.5 0 0 1 5 19.5v-15z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>',
};

const EQ = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

export function playButton(text, { mode = 'natural', voice = 'A', label, main = false, round = false, title } = {}) {
  const lbl = label ?? (mode === 'slow' ? 'Slow' : 'Play');
  const icon = mode === 'slow' ? icons.slow : icons.play;
  return `<button type="button" class="pbtn${main ? ' main' : ''}${round ? ' round' : ''}" data-play data-mode="${mode}" data-voice="${voice}"
    data-text="${esc(text)}" title="${esc(title || (mode === 'slow' ? 'Slower' : 'Listen (app voice)'))}" aria-label="${esc(`${lbl || 'Play'}: ${text}`)}">${icon}${EQ}${lbl ? `<span>${esc(lbl)}</span>` : ''}</button>`;
}

export function audioButtons(text, { voice = 'A', slow = true } = {}) {
  return playButton(text, { voice, main: true, round: true, label: '' }) + (slow ? playButton(text, { mode: 'slow', voice, label: '', round: true }) : '');
}

export function recButton(text, { round = false, free = false, max } = {}) {
  return `<button type="button" class="pbtn rec${round ? ' round' : ''}" data-rec data-text="${esc(text)}"${free ? ' data-free' : ''}${max ? ` data-max="${max * 1000}"` : ''}
    title="${free ? 'Record yourself' : 'Record yourself and compare'}" aria-label="${esc(`Record yourself saying: ${text}`)}">${icons.mic}<span class="lbl-long">Record</span></button>`;
}

let toastTimer;
export function toast(message, ms = 4000) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

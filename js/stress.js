// Syllables and stress of the worksheet words (js/words.js), and the stress
// pattern circles (Oo, oOo…).
import { WORDS } from './words.js?v=202610122032';
import { escapeHtml as esc } from './text.js?v=202610122032';

export function keyOf(word) {
  return String(word)
    .replace(/[’']s$/i, '')
    .replace(/[^A-Za-z-]/g, '')
    .toLowerCase();
}

// { parts: ['Sat', 'ur', 'day'], stress: 0, count: 3 } with the word's own
// letters (and case), or null when the word isn't in the data. force: the
// stressed syllable when the sentence decides it (noun or verb).
export function wordInfo(word, force) {
  const key = keyOf(word);
  const data = WORDS[key];
  if (!data) return null;
  const [spelled, s] = data.split('|');
  const lens = spelled.split('·').map((p) => p.length);
  // The data may carry an apostrophe (o’clock) or be a lower-case form of the word.
  const base = String(word).replace(/[’']s$/i, '');
  const tail = String(word).slice(base.length);
  let text = base;
  if (lens.reduce((a, b) => a + b, 0) !== text.length) text = spelled.replace(/·/g, '');
  const parts = [];
  let at = 0;
  for (const n of lens) {
    parts.push(text.slice(at, at + n));
    at += n;
  }
  parts[parts.length - 1] += tail;
  const stress = force ?? Number(s);
  return { parts, stress, count: parts.length };
}

export function syllableCount(word) {
  return wordInfo(word)?.count ?? null;
}

// The stressed syllable in bold: "Sat·ur·day" → <b>Sat</b>·ur·day
export function stressedHtml(word, force) {
  const info = wordInfo(word, force);
  if (!info || info.count < 2) return esc(word);
  return info.parts.map((p, i) => (i === info.stress ? `<b>${esc(p)}</b>` : esc(p))).join('<span class="dot">·</span>');
}

export function patternOf(word, force) {
  const info = wordInfo(word, force);
  if (!info) return '';
  return info.parts.map((_, i) => (i === info.stress ? 'O' : 'o')).join('');
}

// Big and small circles: "oOo".
export function patternHtml(pattern, { label = true } = {}) {
  if (!pattern) return '';
  const dots = [...pattern].map((c) => `<i class="${c === 'O' ? 'big' : 'small'}"></i>`).join('');
  return `<span class="pattern" role="img" aria-label="Stress pattern ${esc(pattern)}" title="${esc(pattern)}">${dots}${label ? `<span class="sr-only">${esc(pattern)}</span>` : ''}</span>`;
}

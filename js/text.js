// Small helpers for the worksheet text markup (shared by the app and
// scripts/build-words.mjs).
//
//   *word*          a target word in a sentence (to mark, count…)
//   *word:tag*      a target with its answer or label (*graduate:ɪt*, *begin:oO*)
//   [a]  [a]*       underlined letters; with * they are reduced
//   {e}             a vowel that can be omitted (crossed out)
//   (e)             a silent letter
//   ˈ               the book's stress mark before a stressed syllable

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TARGET = /\*([^*:]+)(?::([^*]+))?\*/g;

export function targetsIn(line) {
  return [...String(line).matchAll(TARGET)].map((m) => ({ word: m[1], tag: m[2] || '', index: m.index, raw: m[0] }));
}

// The words of a sentence, without markup or punctuation (contractions count as one word).
export function wordsIn(line) {
  return (plainText(line).match(/[A-Za-z]+(?:[’'][A-Za-z]+)*/g) || []).filter((w) => !/[’']/.test(w));
}

// The text as it is spoken: without markup.
export function plainText(line) {
  return String(line)
    .replace(TARGET, '$1')
    .replace(/[[\]{}()*ˈ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function markupWord(m) {
  return String(m).replace(/[[\]{}()*ˈ.]/g, '');
}

// "veget[a]*ble" → [{ t: 'veget' }, { t: 'a', u: true, r: true }, { t: 'ble' }]
// "int{e}resting" → [{ t: 'int' }, { t: 'e', x: true }, { t: 'resting' }]
export function segments(m) {
  const out = [];
  const re = /\[([^\]]+)\](\*)?|\{([^}]+)\}|\(([^)]+)\)|([^[{(]+)/g;
  for (const g of String(m).matchAll(re)) {
    if (g[1] !== undefined) out.push({ t: g[1], u: true, r: Boolean(g[2]) });
    else if (g[3] !== undefined) out.push({ t: g[3], x: true });
    else if (g[4] !== undefined) out.push({ t: g[4], silent: true });
    else out.push({ t: g[5] });
  }
  return out;
}

// Markup → HTML for display (underlines, crossed-out and silent letters, stress marks).
export function renderMarked(m) {
  return segments(m)
    .map((s) =>
      s.u
        ? `<u>${escapeHtml(s.t)}</u>`
        : s.x
          ? `<s class="omit">${escapeHtml(s.t)}</s>`
          : s.silent
            ? `<span class="silent">${escapeHtml(s.t)}</span>`
            : escapeHtml(s.t).replace(/ˈ/g, '<span class="smark">ˈ</span>'),
    )
    .join('');
}

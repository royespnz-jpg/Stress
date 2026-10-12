// Builds js/words.js (the syllables and stressed syllable of every word the
// worksheets ask about) and lexicon.json (the stress patterns of common words,
// for the Stress Lab and for checking the words students write).
//
//   npm install --no-save cmu-pronouncing-dictionary@3 wordlist-english@1
//   node scripts/build-words.mjs
//
// The number of syllables and the stressed one come from the CMU Pronouncing
// Dictionary (American English); the spelling is split into that many
// syllables below, and scripts/syllables.json fixes the splits that come out
// wrong and the few words the books stress differently. Running it checks that
// every word has data.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { WORKSHEETS, stepsOf } from '../js/worksheets.js';
import { targetsIn, wordsIn, markupWord } from '../js/text.js';

const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
const OVERRIDES = JSON.parse(readFileSync(new URL('scripts/syllables.json', ROOT), 'utf8'));

// ─── the words the worksheets need ──────────────────────────────────────────

export function collectWords() {
  const need = new Set();
  const add = (w) => {
    const word = String(w).replace(/[’']s$/, '').replace(/[^A-Za-z-]/g, '').toLowerCase();
    if (word && /[a-z]/.test(word)) need.add(word);
  };
  for (const sheet of WORKSHEETS) {
    for (const step of stepsOf(sheet)) {
      switch (step.type) {
        case 'count':
          (step.words || []).forEach(add);
          (step.lines || []).forEach((l) => targetsIn(l).forEach((t) => t.word.split(/\s+/).forEach(add)));
          break;
        case 'stress':
          step.rows.flat().forEach((w) => add(w.split(':')[0]));
          break;
        case 'stressText':
          step.lines.forEach((l) => (step.all ? wordsIn(l) : targetsIn(l).map((t) => t.word)).forEach(add));
          break;
        case 'reduce':
          step.rows.flat().forEach((m) => add(markupWord(m)));
          break;
        case 'ate':
          step.lines.forEach(([, l]) => targetsIn(l).forEach((t) => add(t.word)));
          break;
        case 'table':
          (step.rows || []).concat(...(step.groups || []).map((g) => g.rows)).forEach((r) =>
            (r.words || []).forEach((w) => w.split(/\s+[–-]\s+|\s+/).forEach((x) => add(markupWord(x.replace(/\./g, ''))))),
          );
          break;
        case 'pairs':
          step.rows.forEach((r) => [r.a, r.b].forEach((x) => x && x.w.split(/\s+/).forEach(add)));
          break;
        case 'lines':
          (step.words || []).forEach(add);
          break;
        case 'maze':
          step.grid.flat().forEach(add);
          break;
        case 'words':
          step.rows.forEach((r) => (r.given || []).forEach(add));
          break;
        default:
      }
      (step.extra || []).forEach((w) => w.split(/\s+/).forEach(add));
    }
  }
  return [...need].sort();
}

// ─── the dictionary ─────────────────────────────────────────────────────────

const VOWEL = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)(\d)$/;

export function pronunciations(word) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const p = dictionary[i ? `${word}(${i})` : word];
    if (p) out.push(p);
  }
  return out;
}

// [syllable count, index of the primary stress]
export function shape(pron) {
  const vowels = pron.split(' ').map((ph) => ph.match(VOWEL)).filter(Boolean);
  const stress = vowels.findIndex((m) => m[2] === '1');
  return [vowels.length, stress < 0 ? 0 : stress];
}

// ─── splitting the spelling into syllables ──────────────────────────────────
// Vowel letters make the nuclei; the dictionary says how many there are, so
// silent <e>s are dropped and two-vowel letters (di·et, cre·ate) are split
// until the count matches. Consonants between nuclei go to the next syllable
// when there is one (ta·ble), are split when there are two (win·dow, keeping
// digraphs: moth·er), and the next syllable keeps a legal onset (in·stant).

const DIGRAPHS = ['tch', 'ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ck', 'qu'];
// A stop or f/th plus l or r starts a syllable (de·mo·crat, mi·cro·phone).
const CLUSTER2 = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|thr|phr|chr)$/;
const ONSETS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'wr', 'str', 'spr', 'scr', 'spl', 'squ', 'thr', 'shr', 'chr', 'phr']);
const isV = (word, i) => {
  const c = word[i];
  if ('aeiou'.includes(c)) return !(c === 'u' && i > 0 && 'qg'.includes(word[i - 1]) && 'aeiou'.includes(word[i + 1] || ''));
  // y is a vowel after a consonant (very, rhythm) and in ay/ey/oy/uy (player).
  if (c === 'y') return i > 0 && ('aeiou'.includes(word[i - 1]) || !'aeiou'.includes(word[i + 1] || 'x'));
  return false;
};

function nuclei(word) {
  const groups = [];
  for (let i = 0; i < word.length; i++) {
    if (!isV(word, i)) continue;
    if (groups.length && groups.at(-1).end === i) groups.at(-1).end = i + 1;
    else groups.push({ start: i, end: i + 1 });
  }
  return groups;
}

// Ways a written vowel group can stand for two syllables.
const TWO = /^(ia|io|iu|ie|ua|uo|ue|ui|eo|ea|oa|ae|ao|eu|iou|uou|eou|uu|ii|yo|oe|oi|ya|oo|uie|uea|iee)$/;

function syllabify(word, count) {
  if (count <= 1) return [word];
  const all = nuclei(word);
  const text = (x) => word.slice(x.start, x.end);
  const pre = (x) => word.slice(0, x.start);
  // A silent <e>: final e (not -le after a consonant), -es/-ed that add no
  // syllable, and an e between consonants inside compounds (wastepaper).
  const silentFinal = (x, k, g) => {
    if (text(x) !== 'e' || k !== g.length - 1 || k === 0) return false;
    const after = word.slice(x.end);
    if (after === '') return !/[^aeiou]l$/.test(pre(x));
    if (after === 's') return !/(s|z|x|ch|sh|ge|ce|se|ze)$/.test(pre(x) + 'e') || /[^aeiou][^aeiou]$/.test(pre(x)) === false && !/(s|z|x|ch|sh|g|c)$/.test(pre(x));
    if (after === 'd') return !/[td]$/.test(pre(x));
    return false;
  };
  const silentInner = (x, k, g) =>
    text(x) === 'e' && k > 0 && k < g.length - 1 && /[^aeiouy]$/.test(pre(x)) && /^[^aeiouy]{1,2}[aeiouy]/.test(word.slice(x.end)) && /^(ly|ful|less|ness|ment|ty|man|ship|time|hood|paper|writer|house|work|side|line|way|where|day|bod|thing|nite)/.test(word.slice(x.end));
  const silent = new Set();
  let g = all.slice();
  // 1. Silent final e's go first.
  g = g.filter((x, k, arr) => {
    if (silentFinal(x, k, arr)) {
      silent.add(x.start);
      return false;
    }
    return true;
  });
  // 2. Silent e's inside compounds and before suffixes (strangely, wasteful).
  if (g.length > count) {
    g = g.filter((x, k, arr) => {
      if (arr.length > count && silentInner(x, k, arr)) {
        silent.add(x.start);
        return false;
      }
      return true;
    });
  }
  // 3. Too few: split two-syllable vowel letters, syllabic -le, -ism, -thm.
  for (let k = 0; k < g.length && g.length < count; k++) {
    const t = text(g[k]);
    if (t.length >= 2 && TWO.test(t)) {
      g.splice(k, 1, { start: g[k].start, end: g[k].start + 1 }, { start: g[k].start + 1, end: g[k].end });
      k++;
    }
  }
  if (g.length < count && /(sm|thm)$/.test(word)) g.push({ start: word.length - 1, end: word.length });
  if (g.length !== count) return null;
  // Cut between nuclei.
  const cuts = [];
  for (let k = 0; k < g.length - 1; k++) {
    let from = g[k].end;
    // A silent e stays with the syllable before it (strange·ly).
    for (const p of silent) if (p >= from && p < g[k + 1].start) from = p + 1;
    const cons = word.slice(from, g[k + 1].start);
    let cut;
    if (!cons.length) cut = from;
    else {
      const units = [];
      for (let i = 0; i < cons.length; ) {
        const d = DIGRAPHS.find((x) => cons.startsWith(x, i));
        units.push(d || cons[i]);
        i += d ? d.length : 1;
      }
      let keep;
      if (units.length === 1) keep = units[0] === 'x' || units[0] === 'ck' ? 0 : 1;
      else {
        const last3 = units.slice(-3).join('');
        const last2 = units.slice(-2).join('');
        if (units.length >= 3 && ONSETS.has(last3)) keep = 3;
        else if (units.length >= 3 && ONSETS.has(last2)) keep = 2;
        else if (CLUSTER2.test(last2)) keep = 2;
        else keep = 1;
      }
      cut = g[k + 1].start - units.slice(units.length - keep).join('').length;
    }
    cuts.push(cut);
  }
  const parts = [];
  let from = 0;
  for (const c of cuts) {
    parts.push(word.slice(from, c));
    from = c;
  }
  parts.push(word.slice(from));
  // A final -le after a consonant takes that consonant along (ta·ble, peo·ple).
  const last = parts.length - 1;
  if (last > 0 && parts[last] === 'le' && /[^aeiou]$/.test(parts[last - 1]) && parts[last - 1].length > 1) {
    const prev = parts[last - 1];
    const take = /(ck)$/.test(prev) ? 0 : 1;
    if (take && /[aeiouy]/.test(prev.slice(0, -1))) {
      parts[last - 1] = prev.slice(0, -1);
      parts[last] = prev.slice(-1) + 'le';
    }
  }
  return parts.every(Boolean) ? parts : null;
}

function splitSpelling(word, count) {
  return syllabify(word, count);
}

// ─── build ──────────────────────────────────────────────────────────────────

function build() {
  const words = {};
  const missing = [];
  for (const word of collectWords()) {
    const fixed = OVERRIDES[word];
    if (fixed) {
      words[word] = fixed;
      continue;
    }
    if (word.includes('-')) {
      // twenty-one, check-in: each part on its own; the stress of a compound is in the data.
      missing.push(`${word} (hyphenated: add it to scripts/syllables.json)`);
      continue;
    }
    const prons = pronunciations(word);
    if (!prons.length) {
      missing.push(`${word} (not in the dictionary)`);
      continue;
    }
    const [count, stress] = shape(prons[0]);
    const parts = splitSpelling(word, count);
    if (!parts) {
      missing.push(`${word} (${count} syllables)`);
      continue;
    }
    words[word] = `${parts.join('·')}|${stress}`;
  }
  return { words, missing };
}

function buildLexicon() {
  const listDir = require.resolve('wordlist-english/package.json').replace(/package\.json$/, '');
  const vocab = new Set();
  for (const size of [10, 20, 35, 40, 50]) {
    for (const variant of ['english', 'american']) {
      for (const w of JSON.parse(readFileSync(`${listDir}${variant}-words-${size}.json`, 'utf8'))) {
        if (/^[a-z]+$/.test(w)) vocab.add(w);
      }
    }
  }
  const lex = {};
  for (const w of [...vocab].sort()) {
    const prons = pronunciations(w);
    if (!prons.length) continue;
    // Every pattern the dictionary gives, the usual one first: 'Oo|oO' (record).
    const pats = new Set();
    for (const pron of prons) {
      const [count, stress] = shape(pron);
      if (count >= 1) pats.add(Array.from({ length: count }, (_, i) => (i === stress ? 'O' : 'o')).join(''));
    }
    if (pats.size) lex[w] = [...pats].join('|');
  }
  return lex;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { words, missing } = build();
  if (process.argv.includes('--check') || missing.length) {
    console.log(missing.length ? `${missing.length} words need data:\n  ${missing.join('\n  ')}` : 'All words have data.');
  }
  if (!missing.length || process.argv.includes('--write')) {
    const lines = Object.entries(words).map(([w, v]) => `  ${/^[a-z]+$/.test(w) ? w : JSON.stringify(w)}: '${v}',`);
    writeFileSync(
      new URL('js/words.js', ROOT),
      `// Generated by scripts/build-words.mjs — do not edit (fix scripts/syllables.json).\n` +
        `// word: 'syl·la·bles|index of the stressed syllable' (American English, CMU Pronouncing Dictionary).\n` +
        `export const WORDS = {\n${lines.join('\n')}\n};\n`,
    );
    const lex = buildLexicon();
    writeFileSync(new URL('lexicon.json', ROOT), JSON.stringify(lex));
    console.log(`js/words.js: ${Object.keys(words).length} words · lexicon.json: ${Object.keys(lex).length} words`);
  }
}

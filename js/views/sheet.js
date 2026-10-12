// A worksheet: the book's sections and their activities, in the book's order.
// Every activity the book asks to mark, count, circle, write or sort is
// interactive: the student answers, presses Check, and sees what was right.
// The finished worksheet goes to the teacher's Google Sheet.
import { BOOKS, WORKSHEETS, sheetById, stepsOf } from '../worksheets.js';
import { targetsIn, wordsIn, plainText, markupWord, segments, renderMarked } from '../text.js';
import { wordInfo, stressedHtml, patternOf, patternHtml } from '../stress.js';
import { bookPlayerHtml } from '../book.js';
import { esc, icons, playButton, audioButtons, recButton } from '../ui.js';
import { getSettings, saveSettings } from '../tts.js';
import { sheetConfigured, studentName, newId, sendResult } from '../sheets.js';

const PROGRESS_KEY = 'st.progress.v1';

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveBest(sheetId, correct, total) {
  const all = loadProgress();
  const prev = all[sheetId];
  if (!prev || correct / total > prev.correct / prev.total) all[sheetId] = { correct, total };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

// ─── small pieces ───────────────────────────────────────────────────────────

const PATTERN_RE = /\(([Oo]{2,})\)|\b([Oo]{2,})\b/g;
const isPattern = (s) => /^[Oo]+$/.test(s) && /O/.test(s);

// Text with stress patterns (Ooo) drawn as circles.
function withPatterns(html) {
  return html.replace(PATTERN_RE, (m, a, b) => (isPattern(a || b) ? patternHtml(a || b) : m));
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());

// The words of a text through fn (→ HTML); everything else escaped.
const WORD_RE = /([A-Za-z{}]+(?:[’'][A-Za-z]+)*)/;
function mapWords(text, fn) {
  return String(text)
    .split(WORD_RE)
    .map((part, i) => (i % 2 ? fn(part) : esc(part)))
    .join('');
}

// A word as a button that says it.
function wordChip(text, html = esc(text), { voice = 'A' } = {}) {
  const say = markupWord(text).replace(/\s+[–-]\s+/g, ', ');
  return `<button type="button" class="wchip" data-play data-mode="natural" data-voice="${voice}" data-text="${esc(say)}"
    aria-label="${esc(`Listen: ${say}`)}"><span class="wchip-t">${html}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>`;
}

// A word with its stressed syllable in bold (one word), or as written.
function shownWord(w, { stress = true } = {}) {
  if (/[[{(]/.test(w)) return renderMarked(w.replace(/\./g, '·'));
  if (/\./.test(w)) return esc(w.replace(/\./g, '·'));
  if (/\s+[–-]\s+/.test(w)) return w.split(/\s+([–-])\s+/).map((x, i) => (i % 2 ? ` ${esc(x)} ` : stress ? stressedHtml(x) : esc(x))).join('');
  if (/\s/.test(w) || !stress) return esc(w);
  return stressedHtml(w);
}

// The stressed syllable from an IPA transcription: the vowels before ˈ.
function stressFromIpa(ipa) {
  const at = String(ipa || '').split('→')[0].indexOf('ˈ');
  if (at < 0) return null;
  const before = ipa.slice(0, at).replace(/^\//, '');
  return (before.match(/(eɪ|aɪ|oʊ|aʊ|ɔɪ|[iɪeɛæaɑɔoʊuʌəɚɝ])/g) || []).length;
}

function answerWord(info) {
  if (!info) return '';
  return `<span class="aw">${info.parts.map((p, i) => (i === info.stress ? `<b>${esc(p)}</b>` : esc(p))).join('<span class="dot">·</span>')}</span>`;
}

function sylPicker(info, label) {
  return `<span class="syl-word" role="group" aria-label="${esc(`${label}: tap the stressed syllable`)}">${info.parts
    .map((p, i) => `<button type="button" class="syl" data-syl="${i}" aria-pressed="false">${esc(p)}</button>`)
    .join('<span class="dot" aria-hidden="true">·</span>')}</span>`;
}

function choiceButtons(name, options, { cls = 'chip-opt', html = (o) => esc(o) } = {}) {
  return `<span class="opt-row" data-group="${name}" role="group">${options
    .map((o, i) => `<button type="button" class="${cls}" data-val="${esc(o)}" data-i="${i}" aria-pressed="false">${html(o)}</button>`)
    .join('')}</span>`;
}

const patternChoices = (cols) => choiceButtons('col', cols, { cls: 'chip-opt pat-opt', html: (p) => patternHtml(p) });

// The stressed syllable that a sentence decides (noun or verb): force[word@line] or force[word].
function forced(step, word, lineNo) {
  const f = step.force || {};
  for (const k of [`${word}@${lineNo}`, word, word.toLowerCase()]) if (k in f) return f[k];
  return undefined;
}

// ─── the units of each activity (the things that score a point) ─────────────

function unitsOf(step) {
  switch (step.type) {
    case 'choice':
      return step.items.map((item, i) => ({ i, item }));
    case 'count': {
      if (step.words) return step.words.map((w) => ({ word: w, info: wordInfo(w) }));
      return step.lines.flatMap((l, li) =>
        targetsIn(l).map((t) => ({
          word: t.word,
          line: li,
          info: t.word.includes(' ') ? null : wordInfo(t.word),
          count: t.word.split(/\s+/).reduce((n, w) => n + (wordInfo(w)?.count || 0), 0),
        })),
      );
    }
    case 'stress':
      return step.rows.flatMap((row, r) =>
        row.map((x) => {
          const [word, pos] = x.split(':');
          return { word, pos, row: r, info: wordInfo(word) };
        }),
      );
    case 'stressText':
      return step.lines.flatMap((l, li) => lineTargets(step, l, li));
    case 'reduce':
      return step.rows.flatMap((row, r) => row.map((m) => ({ m, row: r, word: markupWord(m), info: wordInfo(markupWord(m)) })));
    case 'ate':
      return step.lines.flatMap(([, l], li) =>
        targetsIn(l).map((t) => ({ word: t.word, tag: t.tag, line: li, info: wordInfo(t.word, forced(step, t.word, li + 1)) })),
      );
    case 'sort':
      return step.items.filter((it) => !it.example).map((item) => ({ item }));
    case 'gaps':
      return step.items.flatMap((s, i) => gapsIn(s).filter((g) => !isExampleGap(step, g)).map((g) => ({ ...g, item: i })));
    case 'words':
      return step.rows.flatMap((row, r) => Array.from({ length: step.need }, (_, j) => ({ row: r, j })));
    case 'derive':
      return step.items.map((item) => ({ item }));
    case 'maze':
      return [{ maze: true }];
    case 'omit':
      return step.lines.flatMap(([, l], li) => omitTokens(l).filter((t) => t.target).map((t) => ({ ...t, line: li })));
    default:
      return [];
  }
}

const isScored = (step) => unitsOf(step).length > 0;
const pointsOf = (step) => unitsOf(step).length;

// stressText: the words to mark in a sentence.
function lineTargets(step, line, li) {
  const words = step.all ? wordsIn(line) : targetsIn(line).map((t) => t.word);
  return words
    .map((word) => ({ word, line: li, info: wordInfo(word, forced(step, word, li + 1)) }))
    .filter((u) => u.info && u.info.count >= 2);
}

// gaps: "{answer|other}" in a sentence.
function gapsIn(s) {
  return [...String(s).matchAll(/\{([^}]+)\}/g)].map((m, k) => ({ k, answers: m[1].split('|') }));
}
const isExampleGap = (step, g) => step.example && !/\s/.test(step.example) && g.answers[0] === step.example;

// omit: the words of a line, the ones with a {vowel} that can disappear marked.
function omitTokens(line) {
  return String(line)
    .split(WORD_RE)
    .filter((_, i) => i % 2)
    .map((raw, n) => ({ n, raw, target: raw.includes('{') }));
}

// ─── rendering ──────────────────────────────────────────────────────────────

export function renderSheet(id) {
  const sheet = sheetById(id);
  if (!sheet) return null;
  const idx = WORKSHEETS.indexOf(sheet);
  const prev = WORKSHEETS[idx - 1];
  const next = WORKSHEETS[idx + 1];
  const steps = stepsOf(sheet);
  const total = steps.reduce((n, s) => n + pointsOf(s), 0);
  const parts = [];
  let part = null;
  steps.forEach((step, k) => {
    if (step.part !== part) {
      if (part) parts.push('</section>');
      part = step.part;
      parts.push(`<section class="book-part">
        <h2 class="part-h"><span class="part-letter">${esc(part.label)}</span><span>${esc(part.title)}</span></h2>
        ${part.text ? `<div class="part-text">${part.text}</div>` : ''}`);
    }
    parts.push(stepSection(sheet, step, k));
  });
  parts.push('</section>');

  return `<span hidden data-sheet="${sheet.id}"></span>
    <header class="topic-head sheet-head">
      <div class="eyebrow"><a href="#/">${esc(BOOKS[sheet.book].short)}</a> · pp. ${esc(sheet.pages)}</div>
      <h1><span class="sheet-short">${esc(sheet.short)}</span> ${esc(sheet.title)}</h1>
      <p class="lede">${esc(sheet.intro)}</p>
      <div class="row"><span class="badge book">${esc(BOOKS[sheet.book].short)}</span><span class="badge">${steps.length} activities · ${total} points</span></div>
    </header>
    <div class="scorebar" data-scorebar data-total="${total}" data-attempt="${newId()}" data-started="${Date.now()}">
      <span class="score" data-score>0 / ${total}</span>
      <div class="progress"><span data-bar style="width:0%"></span></div>
      <button type="button" class="btn" data-reset>Start over</button>
    </div>
    ${parts.join('')}
    <div class="card done-panel" data-done hidden aria-live="polite"></div>
    <nav class="pager">
      ${prev ? `<a class="btn back" href="#/sheet/${prev.id}">${icons.arrowL}${esc(prev.short)}</a>` : `<a class="btn back" href="#/">${icons.arrowL}All worksheets</a>`}
      ${next ? `<a class="btn primary" href="#/sheet/${next.id}">${esc(next.short)} · ${esc(next.title)}${icons.arrowR}</a>` : '<a class="btn primary" href="#/lab">Stress Lab' + icons.arrowR + '</a>'}
    </nav>
    <p class="muted source-line">Source: ${esc(BOOKS[sheet.book].long)}.</p>`;
}

function stepSection(sheet, step, k) {
  const scored = isScored(step);
  const check = scored && step.type !== 'choice';
  return `<section class="step" data-step="${k}" data-type="${step.type}" id="s-${esc(step.key)}-${k}">
    <div class="step-head">
      <span class="step-n">${esc(step.n)}</span>
      <div class="step-meta"><span>p. ${step.page}</span>${step.level ? `<span class="lvl">${esc(step.level)}</span>` : ''}${
        scored ? `<span class="pts">${pointsOf(step)} pt${pointsOf(step) > 1 ? 's' : ''}</span>` : '<span class="pts free">Listen · repeat</span>'
      }</div>
    </div>
    <p class="step-task">${withPatterns(step.task)}</p>
    ${step.audio ? bookPlayerHtml(sheet.book, step.audio) : ''}
    <div class="step-body" data-body>${stepBody(step)}</div>
    ${step.note ? `<p class="step-note">${withPatterns(esc(step.note))}</p>` : ''}
    ${step.extra ? `<div class="chips extra">${step.extra.map((w) => wordChip(w, shownWord(w))).join('')}</div>` : ''}
    ${
      check
        ? `<div class="check-row" data-check-row><button type="button" class="btn primary" data-check>${icons.check}Check</button>
          <span class="check-msg" data-check-msg aria-live="polite"></span></div>`
        : ''
    }
  </section>`;
}

export function stepBody(step) {
  switch (step.type) {
    case 'table':
      return tableBody(step);
    case 'pairs':
      return pairsBody(step);
    case 'lines':
      return linesBody(step);
    case 'record':
      return recordBody(step);
    case 'choice':
      return choiceBody(step);
    case 'count':
      return countBody(step);
    case 'stress':
      return stressBody(step);
    case 'stressText':
      return stressTextBody(step);
    case 'reduce':
      return reduceBody(step);
    case 'ate':
      return ateBody(step);
    case 'sort':
      return sortBody(step);
    case 'gaps':
      return gapsBody(step);
    case 'words':
      return wordsBody(step);
    case 'derive':
      return deriveBody(step);
    case 'maze':
      return mazeBody(step);
    case 'omit':
      return omitBody(step);
    default:
      return '';
  }
}

// ── listen and repeat ──

function tableRow(step, row) {
  const meta = [
    row.label ? `<span class="wt-label">${esc(row.label)}</span>` : '',
    row.pattern ? patternHtml(row.pattern) : '',
    row.ipa ? `<span class="ipa">${esc(row.ipa)}</span>` : '',
  ].join('');
  const words = row.words || [];
  const chips = words
    .map((w, i) =>
      row.ipas
        ? `<span class="wcell">${wordChip(w, shownWord(w))}<span class="ipa">${esc(row.ipas[i] || '')}</span></span>`
        : wordChip(w, shownWord(w, { stress: !step.marked || !/[[{]/.test(w) })),
    )
    .join('');
  const all = words.length > 1 ? playButton(words.map((w) => markupWord(w).replace(/\s+[–-]\s+/g, ', ')).join(', '), { label: '', round: true, title: 'Listen to the whole row' }) : '';
  return `<div class="wrow">
    ${meta ? `<div class="wmeta">${meta}</div>` : ''}
    <div class="wwords">${chips}${all}</div>
    ${row.note ? (/^[a-z]+(\.[a-z]+)+$/.test(row.note) ? `<div class="wwords alt">${wordChip(row.note, shownWord(row.note))}</div>` : `<div class="wnote">${withPatterns(esc(row.note))}</div>`) : ''}
  </div>`;
}

function tableBody(step) {
  if (step.twoCols) {
    return `<div class="two-cols">${[0, 1]
      .map(
        (c) => `<div class="col"><div class="col-h">${withPatterns(esc(step.heads[c]))}</div>
        <div class="chips">${step.rows.map((r) => wordChip(r.words[c], shownWord(r.words[c]))).join('')}</div></div>`,
      )
      .join('')}</div>`;
  }
  const heads = (step.heads || []).filter(Boolean);
  const caption = heads.length ? `<div class="wt-heads">${heads.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : '';
  if (step.groups) {
    return `${caption}${step.groups
      .map((g) => `<h3 class="wt-group">${esc(g.title)}</h3><div class="wtable">${g.rows.map((r) => tableRow(step, r)).join('')}</div>`)
      .join('')}`;
  }
  return `${caption}<div class="wtable">${step.rows.map((r) => tableRow(step, r)).join('')}</div>`;
}

function pairSide(x) {
  if (!x) return '<div class="pside empty"></div>';
  const s = x.pattern ? x.pattern.indexOf('O') : stressFromIpa(x.ipa);
  const info = /\s/.test(x.w) ? null : wordInfo(x.w, s ?? undefined);
  const word = info && info.count > 1 && (s == null || s < info.count) ? answerWord(info) : esc(x.w);
  const say = x.say || x.w;
  return `<div class="pside ex">
    <div class="ex-body">
      <span class="pw-word">${word}</span>
      ${x.pattern ? patternHtml(x.pattern) : ''}
      ${x.ipa ? `<span class="ipa">${esc(x.ipa)}</span>` : ''}
      ${x.label ? `<span class="ex-note">${esc(x.label)}</span>` : ''}
    </div>
    <div class="ex-actions">${audioButtons(say)}${recButton(say)}</div>
    <div class="rec-out" hidden></div>
  </div>`;
}

function pairsBody(step) {
  const heads = step.heads ? `<div class="pair-heads"><span>${withPatterns(esc(step.heads[0]))}</span><span>${withPatterns(esc(step.heads[1]))}</span></div>` : '';
  return `${heads}<ol class="pairs">${step.rows
    .map(
      (r) => `<li class="pair">
        <div class="pair-sides">${pairSide(r.a)}${pairSide(r.b)}</div>
        ${r.note ? `<p class="pair-note">${esc(r.note)}</p>` : ''}
      </li>`,
    )
    .join('')}</ol>`;
}

// A sentence with its *targets*: italic, or bold with circles (*word:Oo*).
function lineHtml(line) {
  let out = '';
  let at = 0;
  for (const t of targetsIn(line)) {
    out += renderMarked(line.slice(at, t.index));
    out += t.tag && isPattern(t.tag)
      ? `<span class="tw-pat"><b>${esc(t.word)}</b>${patternHtml(t.tag)}</span>`
      : `<em class="tw">${esc(t.word)}</em>`;
    at = t.index + t.raw.length;
  }
  return out + renderMarked(line.slice(at));
}

function exLine(html, say, { voice = 'A', rec = true, slow = true } = {}) {
  return `<li class="ex">
    <div class="ex-body"><span class="ex-mark">${html}</span></div>
    <div class="ex-actions">${audioButtons(say, { voice, slow })}${rec ? recButton(say) : ''}</div>
    ${rec ? '<div class="rec-out" hidden></div>' : ''}
  </li>`;
}

let dlgSeq = 0;
function dialogueHtml(lines, { html = lineHtml, rec = true, groups } = {}) {
  const id = `dlg-${++dlgSeq}`;
  const breaks = new Set();
  if (groups) groups.reduce((n, g) => (breaks.add(n + g), n + g), 0);
  return `<div class="dialogue" id="${id}">
    <div class="dlg-head"><button type="button" class="pbtn main" data-play-dialogue="${id}">${icons.play}<span>Play the conversation</span></button></div>
    <ol class="dlg-lines">${lines
      .map(([who, text], i) => {
        const voice = who === 'B' ? 'B' : 'A';
        const say = plainText(text);
        return `<li class="dlg-line voice-${voice} rec-host${breaks.has(i) ? ' gap-before' : ''}">
          <span class="who"><span aria-hidden="true">${esc(who)}</span><span class="sr-only">${esc(who)}:</span></span>
          <span class="said">${html(text, i)}</span>
          <span class="dlg-actions">${playButton(say, { voice, label: '', round: true })}${rec ? recButton(say, { round: true }) : ''}</span>
          ${rec ? '<div class="rec-out" hidden></div>' : ''}
        </li>`;
      })
      .join('')}</ol>
  </div>`;
}

function linesBody(step) {
  if (step.words) return `<div class="chips big">${step.words.map((w) => wordChip(w, shownWord(w))).join('')}</div>`;
  if (step.dialogue) return dialogueHtml(step.lines);
  if (step.pairs) {
    return `<ol class="pairs">${step.lines
      .map((pair) => `<li class="pair"><div class="pair-sides">${pair.map((l) => `<ul class="examples">${exLine(lineHtml(l), plainText(l))}</ul>`).join('')}</div></li>`)
      .join('')}</ol>`;
  }
  return `<ul class="examples">${step.lines.map((l) => exLine(lineHtml(l), plainText(l))).join('')}</ul>`;
}

function recordBody(step) {
  const text = plainText(step.text);
  return `<div class="card read-aloud rec-host">
    <p class="passage">${esc(step.text)}</p>
    <div class="row">${playButton(text, { main: true, label: 'Listen' })}${playButton(text, { mode: 'slow' })}${recButton(text, { free: true, max: 90 })}</div>
    <div class="rec-out" hidden></div>
  </div>`;
}

// ── multiple choice (answered one by one) ──

function itemSay(step, item) {
  if (step.bookOnly) return '';
  if (step.words) return item.options.join(', ');
  if (item.say) return item.say;
  if (item.q && item.q.includes('___')) return plainText(item.q.replace('___', item.options[item.answer]).replace(/<[^>]+>/g, ''));
  return item.q ? item.q.replace(/<[^>]+>/g, '') : '';
}

function choiceBody(step) {
  const first = step.listenOnly || step.words;
  return `<ol class="items">${step.items
    .map((item, i) => {
      const say = itemSay(step, item);
      const q = step.words ? `<span class="muted">Group ${i + 1}</span>` : withPatterns(item.q.replace('___', '<span class="blank">&nbsp;</span>'));
      const listen = say && first ? playButton(say, { label: 'Listen' }) : '';
      const after = say && !first ? playButton(say, { label: 'Hear it' }) : '';
      const optHtml = step.patterns ? (o) => patternHtml(o) : (o) => esc(o);
      return `<li class="card item" data-item="${i}" data-answer="${item.answer}">
        <div class="item-q"><div class="q">${q}</div><div class="row">${listen}</div></div>
        <div class="options">${item.options
          .map((o, k) => `<button type="button" class="opt${step.patterns ? ' pat-opt' : ''}" data-opt="${k}" aria-label="${esc(o)}">${optHtml(o)}</button>`)
          .join('')}</div>
        <div class="feedback" data-feedback hidden><span class="verdict"></span><span class="why">${esc(item.explain || '')}</span>${after}</div>
      </li>`;
    })
    .join('')}</ol>${step.answerAloud ? '<p class="step-note">Then say your answer aloud: <i>Yes, I have</i> or <i>No, I haven’t</i>.</p>' : ''}`;
}

// ── count the syllables ──

// The same number of choices for every word, so the buttons don't give the answer away.
function countUnit(u, i, step, max) {
  return `<div class="unit cnt-unit" data-u="${i}">
    <span class="u-word">${esc(u.word)}</span>
    <span class="u-ask">Syllables</span>
    ${choiceButtons('count', Array.from({ length: max }, (_, n) => String(n + 1)), { cls: 'chip-opt num' })}
    ${step.stress ? '<span class="cnt-stress" data-cnt-stress hidden><span class="u-ask">Stressed</span><span class="circles" data-circles></span></span>' : ''}
    <span class="u-fb" data-fb></span>
  </div>`;
}

function countBody(step) {
  const units = unitsOf(step);
  const max = Math.max(6, ...units.map((u) => (u.count ?? u.info?.count ?? 0) + 1));
  if (step.words) return `<div class="units">${units.map((u, i) => countUnit(u, i, step, max)).join('')}</div>`;
  return `<ol class="tlines">${step.lines
    .map((l, li) => {
      const mine = units.map((u, i) => [u, i]).filter(([u]) => u.line === li);
      return `<li class="tline">
        <div class="tline-text">${lineHtml(l)} ${playButton(plainText(l), { label: '', round: true })}</div>
        <div class="units">${mine.map(([u, i]) => countUnit(u, i, step, max)).join('')}</div>
      </li>`;
    })
    .join('')}</ol>`;
}

// ── tap the stressed syllable ──

function stressBody(step) {
  const units = unitsOf(step);
  return step.rows
    .map((row, r) => {
      const mine = units.map((u, i) => [u, i]).filter(([u]) => u.row === r);
      return `<div class="units stress-row">${step.numbered ? `<span class="row-n">${r + 1}</span>` : ''}${mine
        .map(
          ([u, i]) => `<div class="unit syl-unit" data-u="${i}">
            ${sylPicker(u.info, u.word)}
            ${step.pos ? choiceButtons('pos', step.pos, { cls: 'chip-opt small' }) : ''}
            <span class="u-fb" data-fb></span>
          </div>`,
        )
        .join('')}</div>`;
    })
    .join('');
}

// Sentences where the words to mark are tappable syllables.
function stressTextBody(step) {
  const units = unitsOf(step);
  let n = 0;
  const lines = step.lines.map((l, li) => {
    const mine = units.filter((u) => u.line === li);
    let html;
    if (step.all) {
      let m = 0;
      html = mapWords(plainText(l), (w) => {
        const u = mine[m];
        if (!u || u.word !== w) return esc(w);
        m++;
        return `<span class="unit inline" data-u="${n++}">${sylPicker(u.info, w)}</span>`;
      });
    } else {
      html = '';
      let at = 0;
      let m = 0;
      for (const t of targetsIn(l)) {
        html += esc(l.slice(at, t.index));
        const u = mine[m];
        html += u && u.word === t.word ? `<span class="unit inline" data-u="${n++}">${sylPicker(u.info, t.word)}</span>` : `<em>${esc(t.word)}</em>`;
        if (u && u.word === t.word) m++;
        at = t.index + t.raw.length;
      }
      html += esc(l.slice(at));
    }
    const say = plainText(l);
    return { html, say };
  });
  if (step.paragraph) {
    const all = lines.map((x) => x.say).join(' ');
    return `<div class="card st-text rec-host">
      <p class="passage marking">${lines.map((x) => x.html).join(' ')}</p>
      <div class="row">${playButton(all, { main: true, label: 'Listen' })}${step.record ? recButton(all, { free: true, max: 90 }) : ''}</div>
      ${step.record ? '<div class="rec-out" hidden></div>' : ''}
    </div>`;
  }
  return `<ol class="tlines marking">${lines
    .map(
      (x) => `<li class="tline rec-host"><div class="tline-text">${x.html}</div>
        <div class="tline-actions">${playButton(x.say, { label: '', round: true })}${step.record ? recButton(x.say, { round: true }) : ''}</div>
        ${step.record ? '<div class="rec-out" hidden></div>' : ''}</li>`,
    )
    .join('')}</ol>`;
}

// ── circle the reduced vowels ──

function reduceBody(step) {
  const units = unitsOf(step);
  return step.rows
    .map((row, r) => {
      const mine = units.map((u, i) => [u, i]).filter(([u]) => u.row === r);
      return `<div class="units reduce-row">${mine
        .map(([u, i]) => {
          let v = 0;
          const word = segments(u.m)
            .map((s) => (s.u ? `<button type="button" class="uv" data-v="${v++}" aria-pressed="false" aria-label="${esc(`${s.t} in ${u.word}: reduced?`)}">${esc(s.t)}</button>` : esc(s.t)))
            .join('');
          return `<div class="unit red-unit" data-u="${i}">
            <span class="red-word">${word}</span>
            ${step.stress && u.info.count > 1 ? `<span class="red-stress"><span class="u-ask">Stress</span>${sylPicker(u.info, u.word)}</span>` : ''}
            <button type="button" class="mini-play" data-play data-mode="natural" data-voice="A" data-text="${esc(u.word)}" aria-label="${esc(`Listen: ${u.word}`)}">${icons.play}</button>
            <span class="u-fb" data-fb></span>
          </div>`;
        })
        .join('')}</div>`;
    })
    .join('');
}

// ── <ate>: /eɪt/ or /ɪt/ ──

function ateBody(step) {
  const units = unitsOf(step);
  let n = 0;
  const html = (text, li) => {
    let out = '';
    let at = 0;
    for (const t of targetsIn(text)) {
      out += esc(text.slice(at, t.index));
      out += `<span class="unit ate-unit" data-u="${n}">
        <u class="ate-w">${esc(t.word)}</u>
        <span class="ate-ask">${choiceButtons('ate', ['eɪt', 'ɪt'], { cls: 'chip-opt small ipa-opt', html: (o) => `/${esc(o)}/` })}
        ${sylPicker(units[n].info, t.word)}</span>
        <span class="u-fb" data-fb></span>
      </span>`;
      n++;
      at = t.index + t.raw.length;
    }
    return out + esc(text.slice(at));
  };
  return dialogueHtml(step.lines, { html, groups: step.groups });
}

// ── sort the words by stress pattern ──

function sortBody(step) {
  const units = unitsOf(step);
  const examples = step.items.filter((it) => it.example);
  return `${step.text ? `<div class="card passage-card"><p class="passage">${step.text}</p>
      <div class="row">${playButton(plainText(step.text.replace(/<[^>]+>/g, '')), { label: 'Listen to the text' })}</div></div>` : ''}
    ${examples.length ? `<p class="muted ex-line">Example: ${examples.map((it) => `<b>${esc(it.word)}</b> ${patternHtml(it.col)}`).join(' · ')}</p>` : ''}
    <div class="units sort-units">${units
      .map(({ item }, i) => {
        const write = step.write && item.show !== item.word;
        return `<div class="unit sort-unit" data-u="${i}">
          <span class="u-word">${write ? `<span class="show">${esc(item.show)}</span><input class="mini-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(`Write ${item.show} in full`)}" placeholder="full word">` : esc(item.word)}</span>
          ${patternChoices(step.columns)}
          <span class="u-fb" data-fb></span>
        </div>`;
      })
      .join('')}</div>
    <div class="sort-table" data-sort-table hidden></div>`;
}

function sortTable(step) {
  return `<div class="cols">${step.columns
    .map(
      (c) => `<div class="col"><div class="col-h">${patternHtml(c)}</div>${step.items
        .filter((it) => it.col === c)
        .map((it) => wordChip(it.word))
        .join('')}</div>`,
    )
    .join('')}</div>`;
}

// ── fill the gaps ──

function gapSentence(step, s) {
  const gaps = gapsIn(s);
  const html = withPatterns(esc(String(s).replace(/\{[^}]+\}/g, '\u0000')));
  let k = 0;
  return html.replace(/\u0000/g, () => {
    const g = gaps[k++];
    if (isExampleGap(step, g)) return `<span class="gap-ex">${esc(g.answers[0])}</span>`;
    return `<input class="gap-in" type="text" data-gap="${g.k}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Missing word" size="${Math.max(6, g.answers[0].length + 1)}">`;
  });
}

const gapSay = (s) =>
  plainText(
    s
      .replace(/^\([^)]*\)\s*/, '')
      .replace(/\{([^}|]+)(?:\|[^}]*)?\}/g, '$1')
      .replace(PATTERN_RE, (m, a, b) => (isPattern(a || b) ? '' : m)),
  ).replace(/\s+([,.?!])/g, '$1');

function gapsBody(step) {
  return `${step.example && /\s/.test(step.example) ? `<p class="muted ex-line">Example: ${step.example}</p>` : ''}
    ${step.bank ? `<div class="bank"><span class="u-ask">Box</span>${step.bank.map((w) => wordChip(w)).join('')}</div>` : ''}
    <ol class="${step.paragraph ? 'gap-para' : 'gap-items'}">${step.items
      .map(
        (s, i) => `<li class="gap-item" data-item="${i}"><span class="gap-s">${gapSentence(step, s)}</span>
        <span class="gap-after" data-after hidden>${playButton(gapSay(s), { label: '', round: true, title: 'Hear the sentence' })}</span></li>`,
      )
      .join('')}</ol>`;
}

// ── write words of your own ──

function wordsBody(step) {
  return `<div class="wr-rows">${step.rows
    .map(
      (row, r) => `<div class="wr-row" data-row="${r}">
        <div class="wr-label"><b>${esc(row.label)}</b>${row.ipa ? ` <span class="ipa">${esc(row.ipa)}</span>` : ''}</div>
        <div class="wr-given">${(row.given || []).map((w) => wordChip(w, givenWord(step, row, w))).join('')}</div>
        <div class="wr-ins">${Array.from(
          { length: step.need },
          (_, j) => `<span class="wr-cell" data-u="${unitsOf(step).findIndex((u) => u.row === r && u.j === j)}">
            <input class="mini-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(`Your word ${j + 1} for ${row.label}`)}" placeholder="your word">
            <span class="u-fb" data-fb></span></span>`,
        ).join('')}</div>
      </div>`,
    )
    .join('')}</div>`;
}

// The book's verbs are stressed on the root, after the prefix (ob'ject, per'mit).
function givenWord(step, row, w) {
  if (step.check !== 'prefixVerb') return shownWord(w);
  const prefix = row.prefix.filter((p) => w.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  return prefix ? stressedHtml(w, vowelGroups(prefix)) : shownWord(w);
}

// ── make the longer word and give its pattern ──

function deriveBody(step) {
  return `<div class="units derive-units">${step.items
    .map(
      (item, i) => `<div class="unit der-unit" data-u="${i}">
        <span class="der-base">${wordChip(item.base)}<span class="arrow" aria-hidden="true">→</span></span>
        <input class="mini-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(`New word from ${item.base}`)}" placeholder="new word">
        ${patternChoices(step.patterns)}
        <span class="u-fb" data-fb></span>
      </div>`,
    )
    .join('')}</div>`;
}

// ── the maze ──

function mazeBody(step) {
  const all = step.grid.flat().join(', ');
  return `<div class="maze-wrap">
    <div class="row">${playButton(all, { label: 'Listen to all the words' })}<span class="muted">Tap the squares of your way, from Start to Finish.</span></div>
    <div class="maze" data-maze style="--cols:${step.grid[0].length}">${step.grid
      .map((row, r) =>
        row
          .map((w, c) => {
            const start = step.start[0] === r && step.start[1] === c;
            const finish = step.finish[0] === r && step.finish[1] === c;
            return `<button type="button" class="mz${start ? ' start' : ''}${finish ? ' finish' : ''}" data-r="${r}" data-c="${c}" aria-pressed="false">
              ${start ? '<small>Start</small>' : ''}${finish ? '<small>Finish</small>' : ''}<span>${esc(w)}</span><span class="mz-pat" data-pat></span></button>`;
          })
          .join(''),
      )
      .join('')}</div>
    <div class="unit" data-u="0"><span class="u-fb" data-fb></span></div>
  </div>`;
}

// ── cross out the vowels that disappear ──

function omitBody(step) {
  let n = 0;
  const html = (text) =>
    mapWords(text, (w) => {
      const target = w.includes('{');
      const shown = w.replace(/[{}]/g, '');
      return `<button type="button" class="ow" ${target ? `data-u="${n++}" data-m="${esc(w)}"` : ''} aria-pressed="false">${esc(shown)}</button>`;
    });
  return dialogueHtml(step.lines, { html, rec: Boolean(step.record) });
}

// ─── interaction ────────────────────────────────────────────────────────────

const results = new Map(); // step index → [{ prompt, answer, expected, correct }]

function currentSheet(root) {
  return sheetById(root.querySelector('[data-sheet]')?.dataset.sheet);
}

function stepAt(root, target) {
  const sheet = currentSheet(root);
  const el = target.closest('[data-step]');
  if (!sheet || !el) return {};
  const k = Number(el.dataset.step);
  return { sheet, el, k, step: stepsOf(sheet)[k] };
}

function press(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
}

// One choice in a group of buttons.
function pickInGroup(btn) {
  const group = btn.closest('[data-group]');
  group.querySelectorAll('button').forEach((b) => press(b, b === btn && !b.classList.contains('on')));
  return group.querySelector('button.on')?.dataset.val ?? null;
}

const chosen = (unit, group) => unit.querySelector(`[data-group="${group}"] button.on`)?.dataset.val ?? null;
const chosenSyl = (unit) => {
  const b = unit.querySelector('.syl.on');
  return b ? Number(b.dataset.syl) : null;
};

export function handleSheetClick(target, root) {
  const { el, k, step } = stepAt(root, target);

  if (target.closest('[data-reset]')) return 'rerender';
  if (target.closest('[data-send-results]')) {
    submitResult(root);
    return true;
  }
  if (!step) return false;

  // multiple choice: checked at once
  const opt = target.closest('.opt[data-opt]');
  if (opt && !opt.disabled) {
    const item = opt.closest('.item');
    const answer = Number(item.dataset.answer);
    const pick = Number(opt.dataset.opt);
    item.dataset.chosen = String(pick);
    item.dataset.result = pick === answer ? 'ok' : 'bad';
    item.querySelectorAll('.opt').forEach((b, i) => {
      b.disabled = true;
      if (i === answer) b.classList.add('correct');
    });
    if (pick !== answer) opt.classList.add('wrong');
    const fb = item.querySelector('[data-feedback]');
    fb.hidden = false;
    const v = fb.querySelector('.verdict');
    v.textContent = pick === answer ? 'Correct' : 'Not quite';
    v.className = `verdict ${pick === answer ? 'ok' : 'bad'}`;
    if (!el.querySelector('.item:not([data-result])')) {
      results.set(k, choiceRows(step, el));
      el.dataset.checked = '1';
    }
    updateScore(root);
    return true;
  }

  if (el.dataset.checked && !target.closest('[data-retry]')) {
    // A checked step only listens now (words, sentences, the book player).
    return false;
  }

  if (target.closest('[data-check]')) {
    checkStep(root, el, k, step);
    return true;
  }
  if (target.closest('[data-retry]')) {
    el.outerHTML = stepSection(currentSheet(root), step, k);
    results.delete(k);
    updateScore(root);
    return true;
  }

  const syl = target.closest('.syl');
  if (syl) {
    const word = syl.closest('.syl-word');
    const on = !syl.classList.contains('on');
    word.querySelectorAll('.syl').forEach((b) => press(b, b === syl && on));
    return true;
  }
  const choice = target.closest('[data-group] button');
  if (choice) {
    const val = pickInGroup(choice);
    const unit = choice.closest('.unit');
    if (choice.closest('[data-group="count"]') && step.stress) {
      const box = unit.querySelector('[data-cnt-stress]');
      const circles = unit.querySelector('[data-circles]');
      box.hidden = !val;
      circles.innerHTML = val
        ? Array.from({ length: Number(val) }, (_, i) => `<button type="button" class="circ syl" data-syl="${i}" aria-pressed="false" aria-label="Syllable ${i + 1}"><i></i></button>`).join(
            '',
          )
        : '';
      circles.classList.add('syl-word');
    }
    return true;
  }
  const uv = target.closest('.uv');
  if (uv) {
    press(uv, !uv.classList.contains('on'));
    return true;
  }
  const mz = target.closest('.mz');
  if (mz) {
    press(mz, !mz.classList.contains('on'));
    return true;
  }
  const ow = target.closest('.ow');
  if (ow) {
    press(ow, !ow.classList.contains('on'));
    return true;
  }
  return false;
}

// Enter in a text box checks the step.
export function handleSheetKey(e, root) {
  if (e.key !== 'Enter' || !e.target.matches('.mini-in, .gap-in')) return false;
  const { el, k, step } = stepAt(root, e.target);
  if (!step || el.dataset.checked) return false;
  e.preventDefault();
  const inputs = [...el.querySelectorAll('.mini-in, .gap-in')];
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else checkStep(root, el, k, step);
  return true;
}

async function checkStep(root, el, k, step) {
  const btn = el.querySelector('[data-check]');
  if (btn) btn.disabled = true;
  let rows;
  try {
    rows = await CHECKERS[step.type](step, el);
  } catch (err) {
    if (btn) btn.disabled = false;
    el.querySelector('[data-check-msg]').textContent = `Couldn’t check: ${err.message}`;
    return;
  }
  results.set(k, rows);
  el.dataset.checked = '1';
  const right = rows.filter((r) => r.correct).length;
  const row = el.querySelector('[data-check-row]');
  row.innerHTML = `<span class="check-score ${right === rows.length ? 'ok' : right ? 'mid' : 'bad'}">${right} / ${rows.length}</span>
    <span class="check-msg">${right === rows.length ? 'All correct!' : 'The right answers are shown in green.'}</span>
    <button type="button" class="btn" data-retry>${icons.redo}Try again</button>`;
  updateScore(root);
}

function verdict(unit, ok, html = '') {
  unit.classList.add(ok ? 'ok' : 'bad');
  const fb = unit.querySelector('[data-fb]');
  if (fb) fb.innerHTML = `<span class="mark" aria-label="${ok ? 'correct' : 'wrong'}">${ok ? '✓' : '✗'}</span>${html}`;
}

function showStress(unit, info) {
  unit.querySelectorAll('.syl-word:not([data-circles]) .syl').forEach((b) => b.classList.toggle('answer', Number(b.dataset.syl) === info.stress));
}

const patternWords = (info) => (info ? `${answerWord(info)} ${patternHtml(info.parts.map((_, i) => (i === info.stress ? 'O' : 'o')).join(''))}` : '');

const CHECKERS = {
  count(step, el) {
    return unitsOf(step).map((u, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const count = u.count ?? u.info.count;
      const said = Number(chosen(unit, 'count')) || null;
      let ok = said === count;
      let answer = said ? `${said} syllables` : '—';
      let expected = `${count} syllables`;
      if (step.stress && u.info) {
        const s = chosenSyl(unit);
        ok = ok && s === u.info.stress;
        answer += s != null ? `, stress on ${s + 1}` : ', stress not marked';
        expected += `, stress on ${u.info.stress + 1}`;
      }
      unit.querySelectorAll('[data-group="count"] button').forEach((b) => b.classList.toggle('answer', Number(b.dataset.val) === count));
      if (step.stress && u.info) unit.querySelectorAll('[data-circles] .syl').forEach((b) => b.classList.toggle('answer', Number(b.dataset.syl) === u.info.stress));
      verdict(unit, ok, u.info ? patternWords(u.info) : `<span class="aw">${count}</span>`);
      return { prompt: u.word, answer, expected, correct: ok };
    });
  },

  stress(step, el) {
    return unitsOf(step).map((u, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const s = chosenSyl(unit);
      const pos = step.pos ? chosen(unit, 'pos') : null;
      const ok = s === u.info.stress && (!step.pos || pos === u.pos);
      showStress(unit, u.info);
      if (step.pos) unit.querySelectorAll('[data-group="pos"] button').forEach((b) => b.classList.toggle('answer', b.dataset.val === u.pos));
      verdict(unit, ok, step.pos ? `<span class="muted">${esc(u.pos)}</span>` : '');
      return {
        prompt: u.word,
        answer: `${s != null ? u.info.parts[s] : '—'}${step.pos ? ` (${pos || '—'})` : ''}`,
        expected: `${u.info.parts[u.info.stress]}${step.pos ? ` (${u.pos})` : ''}`,
        correct: ok,
      };
    });
  },

  stressText(step, el) {
    return unitsOf(step).map((u, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const s = chosenSyl(unit);
      const ok = s === u.info.stress;
      showStress(unit, u.info);
      unit.classList.add(ok ? 'ok' : 'bad');
      return { prompt: `${u.line + 1}. ${u.word}`, answer: s != null ? u.info.parts[s] : '—', expected: u.info.parts[u.info.stress], correct: ok };
    });
  },

  reduce(step, el) {
    return unitsOf(step).map((u, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const segs = segments(u.m).filter((s) => s.u);
      let ok = true;
      unit.querySelectorAll('.uv').forEach((b, v) => {
        const want = segs[v].r;
        b.classList.toggle('answer', want);
        if (b.classList.contains('on') !== want) ok = false;
      });
      const circled = [...unit.querySelectorAll('.uv.on')].map((b) => b.textContent).join(', ') || 'none';
      const reduced = segs.filter((s) => s.r).map((s) => s.t).join(', ') || 'none';
      let answer = `circled: ${circled}`;
      let expected = `reduced: ${reduced}`;
      // One-syllable words have no stress to mark.
      if (step.stress && u.info.count > 1) {
        const s = chosenSyl(unit);
        ok = ok && s === u.info.stress;
        showStress(unit, u.info);
        answer += `; stress: ${s != null ? u.info.parts[s] : '—'}`;
        expected += `; stress: ${u.info.parts[u.info.stress]}`;
      }
      verdict(unit, ok);
      return { prompt: u.word, answer, expected, correct: ok };
    });
  },

  ate(step, el) {
    return unitsOf(step).map((u, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const end = chosen(unit, 'ate');
      const s = chosenSyl(unit);
      const ok = end === u.tag && s === u.info.stress;
      unit.querySelectorAll('[data-group="ate"] button').forEach((b) => b.classList.toggle('answer', b.dataset.val === u.tag));
      showStress(unit, u.info);
      verdict(unit, ok);
      return {
        prompt: u.word,
        answer: `/${end || '—'}/, stress: ${s != null ? u.info.parts[s] : '—'}`,
        expected: `/${u.tag}/, stress: ${u.info.parts[u.info.stress]}`,
        correct: ok,
      };
    });
  },

  sort(step, el) {
    const rows = unitsOf(step).map(({ item }, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const col = chosen(unit, 'col');
      const input = unit.querySelector('.mini-in');
      const written = input ? input.value.trim() : item.word;
      const spelled = !input || norm(written) === norm(item.word);
      const ok = col === item.col && spelled;
      unit.querySelectorAll('[data-group="col"] button').forEach((b) => b.classList.toggle('answer', b.dataset.val === item.col));
      verdict(unit, ok, `${input ? `<b>${esc(item.word)}</b> ` : ''}${item.note ? `<span class="ipa">${esc(item.note)}</span>` : ''}`);
      return { prompt: item.show || item.word, answer: `${input ? `${written || '—'} ` : ''}${col || '—'}`, expected: `${input ? `${item.word} ` : ''}${item.col}`, correct: ok };
    });
    const table = el.querySelector('[data-sort-table]');
    table.hidden = false;
    table.innerHTML = sortTable(step);
    return rows;
  },

  gaps(step, el) {
    const rows = [];
    step.items.forEach((s, i) => {
      const li = el.querySelector(`[data-item="${i}"]`);
      gapsIn(s)
        .filter((g) => !isExampleGap(step, g))
        .forEach((g) => {
          const input = li.querySelector(`[data-gap="${g.k}"]`);
          const typed = input.value.trim();
          const ok = g.answers.some((a) => norm(a) === norm(typed));
          input.classList.add(ok ? 'ok' : 'bad');
          input.readOnly = true;
          if (!ok) input.insertAdjacentHTML('afterend', `<span class="gap-fix">${esc(g.answers[0])}</span>`);
          rows.push({ prompt: gapSay(s), answer: typed, expected: g.answers.join(' / '), correct: ok });
        });
      li.querySelector('[data-after]').hidden = false;
    });
    return rows;
  },

  async words(step, el) {
    const lex = await lexicon();
    return unitsOf(step).map((u, i) => {
      const cell = el.querySelector(`[data-u="${i}"]`);
      const row = step.rows[u.row];
      const input = cell.querySelector('input');
      const w = norm(input.value).replace(/[^a-z-]/g, '');
      input.readOnly = true;
      const others = [...el.querySelectorAll(`[data-row="${u.row}"] input`)].slice(0, u.j).map((x) => norm(x.value).replace(/[^a-z-]/g, ''));
      const why = wordProblem(step, row, w, lex, others);
      const pats = (lex[w] || '').split('|').filter(Boolean);
      verdict(cell, !why, why ? `<span class="why">${esc(why)}</span>` : pats.length ? patternHtml(pats[0]) : '');
      input.classList.add(why ? 'bad' : 'ok');
      return { prompt: `${row.label} (word ${u.j + 1})`, answer: w || '—', expected: why ? `a word: ${why}` : 'a valid word', correct: !why };
    });
  },

  derive(step, el) {
    return step.items.map((item, i) => {
      const unit = el.querySelector(`[data-u="${i}"]`);
      const input = unit.querySelector('input');
      const typed = input.value.trim();
      const col = chosen(unit, 'col');
      const wordOk = norm(typed) === norm(item.word) || norm(typed).replace(/is/g, 'iz') === norm(item.word).replace(/is/g, 'iz');
      const ok = wordOk && col === item.pattern;
      input.readOnly = true;
      input.classList.add(wordOk ? 'ok' : 'bad');
      unit.querySelectorAll('[data-group="col"] button').forEach((b) => b.classList.toggle('answer', b.dataset.val === item.pattern));
      verdict(unit, ok, `<b>${esc(item.word)}</b> ${patternHtml(item.pattern)}`);
      return { prompt: item.base, answer: `${typed || '—'} ${col || '—'}`, expected: `${item.word} ${item.pattern}`, correct: ok };
    });
  },

  maze(step, el) {
    const onPath = new Set(step.path.map(([r, c]) => `${r},${c}`));
    let ok = true;
    const picked = [];
    el.querySelectorAll('.mz').forEach((b) => {
      const key = `${b.dataset.r},${b.dataset.c}`;
      const word = step.grid[b.dataset.r][b.dataset.c];
      const pat = patternOf(word) || '';
      b.querySelector('[data-pat]').innerHTML = patternHtml(pat, { label: false });
      b.classList.toggle('answer', onPath.has(key));
      if (b.classList.contains('on')) picked.push(word);
      if (b.classList.contains('on') !== onPath.has(key)) {
        ok = false;
        b.classList.add(b.classList.contains('on') ? 'wrong' : 'missed');
      }
    });
    verdict(el.querySelector('[data-u="0"]'), ok, ok ? 'You got through!' : 'The way through is shown in green.');
    return [{ prompt: 'The maze (Ooo)', answer: picked.join(' → ') || '—', expected: step.path.map(([r, c]) => step.grid[r][c]).join(' → '), correct: ok }];
  },

  omit(step, el) {
    const wrong = el.querySelectorAll('.ow.on:not([data-u])');
    wrong.forEach((b) => b.classList.add('wrong'));
    let falseHits = wrong.length;
    return unitsOf(step).map((u, i) => {
      const b = el.querySelector(`.ow[data-u="${i}"]`);
      const hit = b.classList.contains('on');
      b.innerHTML = renderMarked(b.dataset.m);
      b.classList.add(hit ? 'hit' : 'missed');
      // A wrongly tapped word cancels a right one.
      let ok = hit;
      if (ok && falseHits > 0) {
        ok = false;
        falseHits--;
      }
      return { prompt: `${u.line + 1}. ${markupWord(u.raw)}`, answer: hit ? 'crossed out' : 'not marked', expected: `crossed out: ${segments(u.raw).filter((s) => s.x).map((s) => s.t).join('')}`, correct: ok };
    });
  },
};

function choiceRows(step, el) {
  return step.items.map((item, i) => {
    const it = el.querySelector(`[data-item="${i}"]`);
    const prompt = step.words ? item.options.join(' · ') : item.label || item.q.replace(/<[^>]+>/g, '');
    return { prompt, answer: item.options[Number(it.dataset.chosen)] ?? '', expected: item.options[item.answer], correct: it.dataset.result === 'ok' };
  });
}

// ─── checking the words students write ──────────────────────────────────────

let lexiconPromise = null;
export function lexicon() {
  lexiconPromise ||= fetch('lexicon.json')
    .then((r) => {
      if (!r.ok) throw new Error('the word list didn’t load');
      return r.json();
    })
    .catch((err) => {
      lexiconPromise = null;
      throw err;
    });
  return lexiconPromise;
}

const vowelGroups = (s) => (s.match(/[aeiouy]+/g) || []).length;

// The beginnings and endings of Unit 30 A that keep the stress.
const BEGINNINGS = ['', 'un', 'dis', 'in', 'im', 'under', 'mis', 're'];
const ENDINGS = ['e', 'able', 'ably', 'al', 'ally', 'er', 'ers', 'ful', 'fully', 'hood', 'ing', 'ingly', 'ise', 'ize', 'ish', 'less', 'ly', 'ment', 'ments', 'ness', 'ship', 'ed', 'es', 's', 'r', 'd'];
const endings = (rest) => rest === '' || ENDINGS.some((e) => rest.startsWith(e) && endings(rest.slice(e.length)));
function isFamily(w, root) {
  return BEGINNINGS.some((b) => w.startsWith(b + root) && w !== b + root && endings(w.slice(b.length + root.length)));
}

// Why a written word doesn't fit (null when it does).
export function wordProblem(step, row, w, lex, others = []) {
  if (!w) return 'write a word';
  const given = (row.given || []).map(norm);
  if (given.includes(w) || norm(row.label) === w) return 'that one is in the book: think of another';
  if (others.includes(w)) return 'you wrote it already';
  const pats = (lex[w] || '').split('|').filter(Boolean);
  const known = pats.length > 0 || (row.accept || []).includes(w);
  if (step.check === 'family') {
    if (!known) return 'not in the dictionary — check the spelling';
    if (!(row.accept || []).includes(w) && !isFamily(w, row.root)) return `it isn’t made from “${row.label}” with the beginnings and endings in A`;
    return null;
  }
  if (!known) return 'not in the dictionary — check the spelling';
  if (step.check === 'suffix') {
    if (!row.suffix.some((s) => w.endsWith(s) && w.length > s.length + 1)) return `it doesn’t end in ${row.label}`;
    return null;
  }
  // prefixVerb: the prefix, then a stressed root
  const prefix = row.prefix.filter((p) => w.startsWith(p) && w.length > p.length + 1).sort((a, b) => b.length - a.length)[0];
  if (!prefix) return `it doesn’t start with ${row.label}`;
  const fits = pats.filter((p) => (!step.syllables || p.length === step.syllables) && p.indexOf('O') >= vowelGroups(prefix));
  if (fits.length) return null;
  if (step.syllables && !pats.some((p) => p.length === step.syllables)) return `it has ${pats[0].length} syllable${pats[0].length > 1 ? 's' : ''}, not ${step.syllables}`;
  return `the stress is on the prefix (${pats[0]}), not on the root`;
}

// ─── score and results ──────────────────────────────────────────────────────

function updateScore(root) {
  const sheet = currentSheet(root);
  if (!sheet) return;
  let total = 0;
  let answered = 0;
  let correct = 0;
  stepsOf(sheet).forEach((step, k) => {
    const pts = pointsOf(step);
    if (!pts) return;
    total += pts;
    const rows = results.get(k);
    if (rows) {
      answered += pts;
      correct += rows.filter((r) => r.correct).length;
    } else if (step.type === 'choice') {
      const el = root.querySelector(`[data-step="${k}"]`);
      answered += el.querySelectorAll('.item[data-result]').length;
      correct += el.querySelectorAll('.item[data-result="ok"]').length;
    }
  });
  const bar = root.querySelector('[data-scorebar]');
  if (!bar || !total) return;
  bar.querySelector('[data-score]').textContent = `${correct} / ${total}`;
  bar.querySelector('[data-bar]').style.width = `${(100 * answered) / total}%`;
  if (answered === total) {
    saveBest(sheet.id, correct, total);
    finish(root, sheet, correct, total);
  }
}

export function resetSheet() {
  results.clear();
}

function collectAnswers(sheet) {
  const rows = [];
  stepsOf(sheet).forEach((step, k) => {
    for (const r of results.get(k) || []) rows.push({ ...r, prompt: `${step.n} (p. ${step.page}) · ${r.prompt}` });
  });
  return rows.map((r, i) => ({ n: i + 1, ...r }));
}

function finish(root, sheet, correct, total) {
  const bar = root.querySelector('[data-scorebar]');
  if (bar.dataset.finished) return;
  bar.dataset.finished = '1';
  const started = Number(bar.dataset.started);
  root.stResult = {
    id: bar.dataset.attempt,
    setId: sheet.id,
    setTitle: `${BOOKS[sheet.book].short} ${sheet.short} · ${sheet.title}`,
    correct,
    total,
    durationSec: Math.round((Date.now() - started) / 1000),
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    items: collectAnswers(sheet),
  };
  const panel = root.querySelector('[data-done]');
  panel.hidden = false;
  panel.innerHTML = `<h2>Finished: ${correct} / ${total} <span class="muted">(${Math.round((100 * correct) / total)}%)</span></h2>
    <div data-sheet-status></div>`;
  if (!sheetConfigured()) {
    panel.querySelector('[data-sheet-status]').innerHTML = '<p class="muted">Your best score is saved in this browser. (No teacher’s sheet is connected.)</p>';
    return;
  }
  if (studentName()) submitResult(root);
  else showNameForm(root);
}

function showNameForm(root) {
  const s = getSettings();
  root.querySelector('[data-sheet-status]').innerHTML = `<form class="row" data-name-form>
      <input class="dict-input" style="flex:1 1 180px;margin:0" name="student" required maxlength="80" placeholder="Your name" aria-label="Your name" value="${esc(s.student)}">
      <input class="dict-input" style="flex:0 1 140px;margin:0" name="group" maxlength="40" placeholder="Class / group" aria-label="Class or group" value="${esc(s.group)}">
      <button class="btn primary" type="submit">Send to my teacher</button>
    </form>`;
}

async function submitResult(root) {
  const status = root.querySelector('[data-sheet-status]');
  if (!status || !root.stResult) return;
  status.innerHTML = '<p class="muted">Sending your results to your teacher…</p>';
  try {
    await sendResult(root.stResult);
    const s = getSettings();
    status.innerHTML = `<p class="sent">✓ Sent to your teacher's sheet as <b>${esc(s.student)}</b>${s.group ? ` (${esc(s.group)})` : ''}.</p>`;
  } catch (err) {
    status.innerHTML = `<p class="muted">Couldn't send (${esc(err.message)}). It's saved and will be sent again automatically.</p>
      <button type="button" class="btn" data-send-results>Try again</button>`;
  }
}

export function handleNameForm(form, root) {
  const data = new FormData(form);
  const student = String(data.get('student') || '').trim();
  if (!student) return;
  saveSettings({ student, group: String(data.get('group') || '').trim() });
  submitResult(root);
}

// For tests and the home page.
export { unitsOf, pointsOf, isScored, gapSay, stressFromIpa, cap };

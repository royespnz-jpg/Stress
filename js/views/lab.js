// The Stress Lab: any word or sentence with its stress pattern, and a quick
// drill with the worksheet words.
import { WORDS } from '../words.js';
import { wordInfo, patternHtml, keyOf } from '../stress.js';
import { esc, icons, playButton, recButton } from '../ui.js';
import { lexicon } from './sheet.js';

const SAMPLES = ['photograph photography photographic', 'I need a record of what you record.', 'economy economic economics', 'Saturday the thirteenth of September', 'They will present a present.', 'refrigerator refrigeration'];

export function renderLab() {
  return `<header class="topic-head">
      <div class="eyebrow">Stress Lab</div>
      <h1>See the <em>stress</em></h1>
      <p class="lede">Type a word or a sentence: each word shows its syllables and its stress pattern. The big circle is the stressed syllable.</p>
    </header>
    <div class="lab-grid">
      <section class="card lab-card">
        <label class="sr-only" for="lab-input">Word or sentence</label>
        <textarea id="lab-input" class="lab-input" rows="2" spellcheck="false" placeholder="Type a word or a sentence…">photograph photography photographic</textarea>
        <div class="chips samples">${SAMPLES.map((s) => `<button type="button" class="chip" data-sample="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div id="lab-out" class="lab-out" aria-live="polite"></div>
      </section>
      <section class="card drill" id="drill">
        <p class="kicker">Quick drill</p>
        <h2>Where is the stress?</h2>
        <p class="muted">Ten words from the worksheets. Tap the stressed syllable.</p>
        <div data-drill>${drillStart()}</div>
      </section>
    </div>`;
}

// American English from the CMU Pronouncing Dictionary; for words of two or
// more syllables that are nouns and verbs, both patterns.
export async function renderLabResult(text) {
  const out = document.getElementById('lab-out');
  if (!out) return;
  const words = String(text).match(/[A-Za-z]+(?:[-’'][A-Za-z]+)*/g) || [];
  if (!words.length) {
    out.innerHTML = '<p class="muted">Type a word above.</p>';
    return;
  }
  let lex = {};
  try {
    lex = await lexicon();
  } catch {
    /* the worksheet words still work */
  }
  const cards = words.slice(0, 40).map((w) => {
    const info = wordInfo(w);
    const pats = (lex[keyOf(w)] || '').split('|').filter(Boolean);
    const main = info ? info.parts.map((_, i) => (i === info.stress ? 'O' : 'o')).join('') : pats[0];
    if (!main) return `<li class="lab-w unknown"><span class="lw-word">${esc(w)}</span><span class="muted">not in the dictionary</span></li>`;
    const word = info && info.count > 1 ? info.parts.map((p, i) => (i === info.stress ? `<b>${esc(p)}</b>` : esc(p))).join('<span class="dot">·</span>') : esc(w);
    const other = pats.filter((p) => p !== main && p.length === main.length);
    return `<li class="lab-w${main.length === 1 ? ' one' : ''}">
      <button type="button" class="lw-play" data-play data-mode="natural" data-voice="A" data-text="${esc(w)}" aria-label="Listen: ${esc(w)}">${icons.play}</button>
      <span class="lw-word">${word}</span>
      ${patternHtml(main)}
      <span class="lw-n muted">${main.length} syllable${main.length > 1 ? 's' : ''}</span>
      ${other.length ? `<span class="lw-alt muted">also ${other.map((p) => patternHtml(p)).join(' ')}</span>` : ''}
    </li>`;
  });
  out.innerHTML = `<div class="row lab-actions rec-host">${playButton(String(text).trim(), { main: true, label: 'Listen' })}${playButton(String(text).trim(), { mode: 'slow' })}${recButton(String(text).trim())}
      <div class="rec-out" hidden></div></div>
    <ul class="lab-words">${cards.join('')}</ul>
    ${words.length > 40 ? '<p class="muted">Only the first 40 words are shown.</p>' : ''}
    <p class="muted lab-src">Each word as it is said on its own, in American English. When a word can be a noun or a verb (record), both patterns are shown.</p>`;
}

// ─── drill ──────────────────────────────────────────────────────────────────

const POOL = Object.keys(WORDS).filter((w) => /^[a-z]+$/.test(w) && WORDS[w].split('|')[0].split('·').length >= 2);
const drill = { words: [], at: 0, right: 0 };

function drillStart() {
  return `<button type="button" class="btn primary" data-drill-start>Start the drill</button>`;
}

function drillWord() {
  const w = drill.words[drill.at];
  const info = wordInfo(w);
  return `<div class="drill-q" data-word="${esc(w)}">
    <div class="drill-top"><span class="muted">${drill.at + 1} / ${drill.words.length}</span><span class="muted">${drill.right} right</span></div>
    <div class="drill-word">${info.parts
      .map((p, i) => `<button type="button" class="syl big" data-drill-syl="${i}">${esc(p)}</button>`)
      .join('<span class="dot" aria-hidden="true">·</span>')}</div>
    <div class="row">${playButton(w, { label: 'Hear it' })}</div>
    <div class="drill-fb" data-drill-fb aria-live="polite"></div>
  </div>`;
}

export function handleDrillClick(target) {
  const box = document.querySelector('[data-drill]');
  if (!box) return false;
  if (target.closest('[data-drill-start]')) {
    const pool = [...POOL];
    drill.words = Array.from({ length: 10 }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    drill.at = 0;
    drill.right = 0;
    box.innerHTML = drillWord();
    return true;
  }
  const syl = target.closest('[data-drill-syl]');
  if (syl && !syl.closest('.answered')) {
    const q = syl.closest('.drill-q');
    const info = wordInfo(q.dataset.word);
    const ok = Number(syl.dataset.drillSyl) === info.stress;
    if (ok) drill.right++;
    q.classList.add('answered');
    q.querySelectorAll('[data-drill-syl]').forEach((b) => b.classList.toggle('answer', Number(b.dataset.drillSyl) === info.stress));
    if (!ok) syl.classList.add('wrong');
    const last = drill.at === drill.words.length - 1;
    q.querySelector('[data-drill-fb]').innerHTML = `<span class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Correct' : 'Not quite'}</span>
      ${patternHtml(info.parts.map((_, i) => (i === info.stress ? 'O' : 'o')).join(''))}
      <button type="button" class="btn${last ? ' primary' : ''}" data-drill-next>${last ? 'See my score' : 'Next'}${icons.arrowR}</button>`;
    return true;
  }
  if (target.closest('[data-drill-next]')) {
    drill.at++;
    box.innerHTML =
      drill.at < drill.words.length
        ? drillWord()
        : `<div class="drill-end"><p class="drill-score">${drill.right} / ${drill.words.length}</p>
          <p class="muted">${drill.right >= 8 ? 'Excellent!' : drill.right >= 5 ? 'Good — try again to beat it.' : 'Keep practicing: listen to each word and try again.'}</p>
          <button type="button" class="btn primary" data-drill-start>${icons.redo}Another ten words</button></div>`;
    return true;
  }
  return false;
}

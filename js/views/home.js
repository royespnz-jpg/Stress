import { BOOKS, GROUPS, sheetById, stepsOf } from '../worksheets.js';
import { wordInfo, patternOf, patternHtml } from '../stress.js';
import { esc, icons, playButton } from '../ui.js';
import { loadProgress, pointsOf } from './sheet.js';

// The stress moves: photograph → photography → photographic (Accurate English p. 79).
const FAMILY = ['photograph', 'photography', 'photographic'];

function stage() {
  const words = FAMILY.map((w, i) => {
    const info = wordInfo(w);
    const sylls = info.parts
      .map((p, k) => `<span class="sy${k === info.stress ? ' st' : ''}" style="--k:${k}">${esc(p)}</span>`)
      .join('<span class="sy-dot" aria-hidden="true">·</span>');
    return `<button type="button" class="fam-word" data-play data-mode="natural" data-voice="A" data-text="${w}" style="--w:${i}"
      aria-label="Listen: ${w}, ${patternOf(w)}">
      <span class="fam-sylls">${sylls}</span>${patternHtml(patternOf(w))}
    </button>`;
  }).join('');
  return `<div class="stage stress-stage">
    <div class="eyebrow">The stress moves</div>
    <div class="fam">${words}</div>
    <p class="muted stage-note">Tap a word to hear it. The big circle is the stressed syllable: longer, louder and higher.</p>
    <div class="row">${playButton(FAMILY.join(', '), { main: true, label: 'Listen to all three' })}${playButton(FAMILY.join(', '), { mode: 'slow' })}</div>
  </div>`;
}

function sheetCard(sheet, progress, n) {
  const p = progress[sheet.id];
  const total = stepsOf(sheet).reduce((t, s) => t + pointsOf(s), 0);
  const pct = p ? Math.round((100 * p.correct) / p.total) : 0;
  const audio = stepsOf(sheet).filter((s) => s.audio).length;
  return `<a class="card set-card sheet-card" href="#/sheet/${sheet.id}">
    <div class="row"><span class="sheet-no">${String(n).padStart(2, '0')}</span><span class="badge">${esc(sheet.short)}</span><span class="badge">pp. ${esc(sheet.pages)}</span></div>
    <h3>${esc(sheet.title)}</h3>
    <p>${esc(sheet.intro)}</p>
    <div class="sheet-meta muted"><span>${stepsOf(sheet).length} activities</span><span>${total} points</span>${audio ? `<span>${icons.headphones}${audio} book recording${audio > 1 ? "s" : ""}</span>` : ''}</div>
    <div class="progress" title="Best score: ${pct}%"><span style="width:${pct}%"></span></div>
    <small class="muted">${p ? `Best: ${p.correct}/${p.total} (${pct}%)` : 'Not tried yet'}</small>
  </a>`;
}

export function renderHome() {
  const progress = loadProgress();
  let n = 0;
  const groups = GROUPS.map(
    (g) => `<section class="home-section practice-group">
      <div class="group-head"><p class="kicker">${esc(BOOKS[g.book].short)}</p><h2>${esc(g.title.split(' · ')[1] || g.title)}</h2></div>
      <div class="grid">${g.ids.map((id) => sheetCard(sheetById(id), progress, ++n)).join('')}</div>
    </section>`,
  ).join('');
  return `
  <section class="hero">
    <div>
      <p class="kicker">Word stress · American English</p>
      <h1>
        <span class="line"><span style="--l:0">One syllable</span></span>
        <span class="line"><span style="--l:1">is always</span></span>
        <span class="line"><span style="--l:2"><em>stronger.</em></span></span>
      </h1>
      <p class="lede">Every activity of Chapters 6–7 of <em>Accurate English</em> and Units 22 and 28–31 of
        <em>English Pronunciation in Use</em>, with the books’ recordings, natural ElevenLabs voices and a recorder.
        Mark the stress, check your answers, and your results go to your teacher.</p>
      <div class="row hero-cta">
        <a class="btn primary" href="#/sheet/ae-6-1">Start with Chapter 6 ${icons.arrowR}</a>
        <a class="btn" href="#/lab">Open the Stress Lab</a>
      </div>
    </div>
    ${stage()}
  </section>

  <section class="home-section how">
    <div class="how-grid">
      <div class="card"><span class="how-n">1</span><h3>Listen</h3><p>The ${icons.headphones} activities play the book’s own recording. Every word and sentence also has the app’s voice: tap it.</p></div>
      <div class="card"><span class="how-n">2</span><h3>Mark</h3><p>Tap the stressed syllable, count syllables, circle reduced vowels, sort words by their pattern <span class="pat">${patternHtml('Ooo')}</span>, and write words of your own.</p></div>
      <div class="card"><span class="how-n">3</span><h3>Check &amp; record</h3><p>Press <b>Check</b> in each activity. Record yourself and compare. When a worksheet is finished, your score goes to your teacher’s sheet.</p></div>
    </div>
  </section>

  ${groups}

  <section class="home-section cta-card card lab-cta">
    <div>
      <p class="kicker">More practice</p>
      <h2>The Stress Lab</h2>
      <p class="muted">Type any word or sentence to see and hear its stress pattern, or take a quick drill with the words of the worksheets.</p>
    </div>
    <a class="btn primary" href="#/lab">Open the Lab ${icons.arrowR}</a>
  </section>`;
}

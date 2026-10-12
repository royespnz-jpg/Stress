import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSHEETS, GROUPS, stepsOf } from '../js/worksheets.js';
import { WORDS } from '../js/words.js';
import { wordInfo, patternOf } from '../js/stress.js';
import { unitsOf, pointsOf, gapSay, stressFromIpa, wordProblem, stepBody } from '../js/views/sheet.js';

const TYPES = ['table', 'pairs', 'lines', 'record', 'choice', 'count', 'stress', 'stressText', 'reduce', 'ate', 'sort', 'gaps', 'words', 'derive', 'maze', 'omit'];

test('every worksheet is in a group, once', () => {
  const ids = GROUPS.flatMap((g) => g.ids);
  assert.deepEqual([...ids].sort(), WORKSHEETS.map((w) => w.id).sort());
});

test('every step has a known type, a page and a task', () => {
  for (const sheet of WORKSHEETS) {
    for (const step of stepsOf(sheet)) {
      const where = `${sheet.id} ${step.key}`;
      assert.ok(TYPES.includes(step.type), `${where}: type ${step.type}`);
      assert.ok(step.page >= 52 && step.page <= 82, `${where}: page`);
      assert.ok(step.task, `${where}: task`);
      assert.ok(stepBody(step).length > 20, `${where}: renders`);
      if (step.audio) assert.equal(step.audio.page, step.page, `${where}: the recording is on the step's page`);
    }
  }
});

test('the PDFs’ activities are all there', () => {
  const count = (id) => stepsOf(WORKSHEETS.find((w) => w.id === id)).length;
  assert.equal(WORKSHEETS.length, 10);
  assert.ok(count('ae-6-4') >= 16);
  const epu = WORKSHEETS.filter((w) => w.book === 'epu').flatMap(stepsOf).map((s) => s.key);
  for (const k of ['22.1', '22.2', '22.3', '22.4', '28.1', '28.2', '28.3', '29.1', '29.2', '29.3', '30.1', '30.2', '30.3', '31.1', '31.2', '31.3', '31.4']) {
    assert.ok(epu.includes(k), `EPU exercise ${k}`);
  }
});

test('every word that is scored has syllables and a stress', () => {
  for (const sheet of WORKSHEETS) {
    for (const step of stepsOf(sheet)) {
      for (const u of unitsOf(step)) {
        if ('info' in u && step.type !== 'count') assert.ok(u.info, `${sheet.id} ${step.key}: ${u.word}`);
        if (u.info) assert.ok(u.info.stress < u.info.count, `${sheet.id} ${step.key}: ${u.word}`);
        if (step.type === 'count') assert.ok((u.count ?? u.info?.count) > 0, `${sheet.id} ${step.key}: ${u.word}`);
      }
    }
  }
});

test('the syllables spell the word', () => {
  for (const [w, v] of Object.entries(WORDS)) {
    const [spelled, s] = v.split('|');
    assert.equal(spelled.replace(/[·’]/g, '').toLowerCase(), w.replace(/[’']/g, ''), w);
    assert.ok(Number(s) < spelled.split('·').length, w);
  }
});

test('the stress the books give', () => {
  const p = (w, f) => patternOf(w, f);
  assert.equal(p('photograph'), 'Ooo');
  assert.equal(p('photography'), 'oOoo');
  assert.equal(p('photographic'), 'ooOo');
  assert.equal(p('thirteen'), 'oO');
  assert.equal(p('thirty'), 'Oo');
  assert.equal(p('refugee'), 'ooO');
  assert.equal(p('employee'), 'ooO');
  assert.equal(p('Saturday'), 'Ooo');
  assert.equal(p('September'), 'oOo');
  assert.equal(p('afternoon'), 'ooO');
  assert.equal(p('record'), 'Oo');
  assert.equal(p('record', 1), 'oO');
  assert.equal(wordInfo('Washington').parts.join('·'), 'Wash·ing·ton');
});

test('the sort, derive and maze answers agree with the stress data (or the book’s note)', () => {
  for (const sheet of WORKSHEETS) {
    for (const step of stepsOf(sheet)) {
      if (step.type === 'sort') for (const it of step.items) if (!it.note && patternOf(it.word)) assert.equal(patternOf(it.word), it.col, it.word);
      if (step.type === 'derive') for (const it of step.items) if (patternOf(it.word)) assert.equal(patternOf(it.word), it.pattern, it.word);
      if (step.type === 'maze') {
        const on = new Set(step.path.map(([r, c]) => `${r},${c}`));
        step.grid.forEach((row, r) => row.forEach((w, c) => assert.equal(patternOf(w) === step.pattern, on.has(`${r},${c}`), w)));
        step.path.slice(1).forEach(([r, c], i) => {
          const [r0, c0] = step.path[i];
          assert.equal(Math.abs(r - r0) + Math.abs(c - c0), 1, 'the way moves one square at a time');
        });
      }
    }
  }
});

test('points', () => {
  const total = WORKSHEETS.flatMap(stepsOf).reduce((n, s) => n + pointsOf(s), 0);
  assert.ok(total > 600, `total ${total}`);
  for (const sheet of WORKSHEETS) assert.ok(stepsOf(sheet).some((s) => pointsOf(s) > 0), sheet.id);
});

test('helpers', () => {
  assert.equal(stressFromIpa('/rɪˈkɔrd/'), 1);
  assert.equal(stressFromIpa('/ˈrɛkɚd/'), 0);
  assert.equal(stressFromIpa('/əˈprɑksɪmeɪt/'), 1);
  assert.equal(stressFromIpa('/feɪˈtælɪti/'), 1);
  assert.equal(gapSay('(act) How did you {react} when you saw the {actor} coming in?'), 'How did you react when you saw the actor coming in?');
  assert.equal(gapSay('I’m going to have a party on {Saturday} (Ooo).'), 'I’m going to have a party on Saturday.');
  assert.equal(gapSay('civil, civilise, {civilisation|civilization} (oooOo)'), 'civil, civilise, civilisation');
});

test('checking the words students write', () => {
  const lex = JSON.parse(readFileSync(new URL('../lexicon.json', import.meta.url)));
  const step = (id, key) => stepsOf(WORKSHEETS.find((w) => w.id === id)).find((s) => s.key === key);
  const A = step('ae-6-4', 'A');
  const row = (st, label) => st.rows.find((r) => r.label === label);
  assert.equal(wordProblem(A, row(A, 'be-'), 'become', lex), null);
  assert.equal(wordProblem(A, row(A, 'ex-'), 'explain', lex), null);
  assert.match(wordProblem(A, row(A, 'be-'), 'believe', lex), /in the book/);
  assert.match(wordProblem(A, row(A, 'ex-'), 'exit', lex), /stress is on the prefix/);
  assert.match(wordProblem(A, row(A, 'a-'), 'abandon', lex), /3 syllables/);
  assert.match(wordProblem(A, row(A, 're-'), 'rxqz', lex), /dictionary/);
  assert.match(wordProblem(A, row(A, 'de-'), 'react', lex), /doesn’t start/);
  assert.equal(wordProblem(A, row(A, 'pro-'), 'protest', lex), null, 'noun and verb: the verb counts');
  const B = step('ae-6-4', 'B');
  assert.equal(wordProblem(B, row(B, 'under-'), 'undergo', lex), null);
  assert.match(wordProblem(B, row(B, 'inter-'), 'interview', lex), /prefix/);
  const E = step('ae-6-4', 'E');
  assert.equal(wordProblem(E, row(E, '-ee'), 'referee', lex), null);
  assert.match(wordProblem(E, row(E, '-ee'), 'table', lex), /doesn’t end/);
  const F = step('epu-30', '30.1');
  assert.equal(wordProblem(F, F.rows[2], 'careless', lex), null);
  assert.equal(wordProblem(F, F.rows[1], 'enjoyment', lex), null);
  assert.match(wordProblem(F, F.rows[2], 'carpet', lex), /isn’t made from/);
  assert.match(wordProblem(F, F.rows[2], 'careless', lex, ['careless']), /already/);
});

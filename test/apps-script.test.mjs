import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { API_BASE, DEFAULT_MODEL, MODELS, MODES, OUTPUT_FORMAT } from '../js/audio-core.js';
import { splitCode, stripMarkers } from '../scripts/split-gs.mjs';

const DIR = new URL('../google-apps-script/', import.meta.url);
const code = readFileSync(new URL('Code.gs', DIR), 'utf8');

// A pretend Google: one spreadsheet, two book folders in Drive.
function google() {
  const props = {};
  const sheets = {};
  const iter = (a) => {
    let i = 0;
    return { hasNext: () => i < a.length, next: () => a[i++] };
  };
  const folder = (id, name, files = [], subs = []) => ({ getId: () => id, getName: () => name, getFiles: () => iter(files), getFolders: () => iter(subs), getParents: () => iter([]) });
  const file = (id, name, parent, mime = 'audio/mpeg') => ({
    getId: () => id,
    getName: () => name,
    getMimeType: () => mime,
    getSize: () => 2048,
    getParents: () => iter([parent()]),
    getBlob: () => ({ getContentType: () => mime, getBytes: () => [104, 105] }),
  });
  const files = [];
  const sub = folder('sub0000000000000000000', 'Unit 22', files);
  const ae = folder('1cXgDywfAPi7-SQblFlSuQC2KphK33eUt', 'Chapter 6 Stress and Chapter 7 Stress (Advanced)');
  const epu = folder('1SmSKUtgjUDvmMc6gW1h8Yh_qwjmABo_C', 'Word Stress Practices', [], [sub]);
  sub.getParents = () => iter([epu]);
  const t61 = file('1kaFnZrEW2rCYkBpmR_NyqES2sw1j10g6', '15_chapter 6_Stress_table 6-1_page 63.mp3', () => ae);
  const b5 = file('b5000000000000000000000', 'B5.mp3', () => sub);
  const pdf = file('pdf0000000000000000000', 'notes.pdf', () => sub, 'application/pdf');
  const other = file('other00000000000000000', 'private.mp3', () => folder('elsewhere000000000000', 'Mine'));
  ae.getFiles = () => iter([t61]);
  files.push(b5, pdf);
  const all = [t61, b5, pdf, other];
  // Formatting calls (setFontWeight, setColumnWidth…) do nothing and chain.
  const chain = (obj) => new Proxy(obj, { get: (o, k) => (k in o ? o[k] : () => chain(o)) });
  const sheet = (name) => {
    const rows = [];
    return chain({
      rows,
      name,
      appendRow: (r) => rows.push(r),
      getLastRow: () => rows.length + 1,
      getMaxRows: () => 1000,
      getConditionalFormatRules: () => [],
      getRange: (r) =>
        chain({
          setValues: (v) => {
            if (typeof r === 'number' && r >= 2) v.forEach((row, i) => (rows[r - 2 + i] = row));
            return chain({});
          },
          getValues: () => [['ID intento'], ...rows.map((row) => [row[9]])],
          createTextFinder: (t) => ({ matchEntireCell: () => ({ findNext: () => rows.some((row) => row.includes(t)) || null }) }),
        }),
    });
  };
  const ss = { getName: () => 'Stress Lab results', getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = sheet(n)), getSpreadsheetTimeZone: () => 'America/Costa_Rica' };
  const ctx = {
    sheets,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    DriveApp: {
      getFolderById: (id) => [ae, epu, sub].find((f) => f.getId() === id) || (() => { throw new Error('No folder'); })(),
      getFileById: (id) => all.find((f) => f.getId() === id) || (() => { throw new Error('No file'); })(),
    },
    SpreadsheetApp: chain({ getActiveSpreadsheet: () => ss, InterpolationType: { NUMBER: 'n' } }),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (body) => ({ body, setMimeType() { return this; } }) },
    Utilities: { base64Encode: (b) => Buffer.from(b).toString('base64') },
    Logger: { log() {} },
    props,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}
const post = (g, data) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(data) } }).body);

test('the code still works if the editor joins its lines (only block comments)', () => {
  assert.doesNotThrow(() => new vm.Script(code.replace(/\n/g, ' ')));
});

test('the parts are the whole Code.gs, in order', () => {
  const names = readdirSync(new URL('partes/', DIR)).filter((f) => f.endsWith('.gs')).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  const parts = names.map((n) => stripMarkers(readFileSync(new URL(`partes/${n}`, DIR), 'utf8')));
  assert.deepEqual(parts, splitCode(code), 'run: node scripts/split-gs.mjs');
  for (const p of parts) assert.doesNotThrow(() => new vm.Script(p), 'each part is complete code');
});

test('the voice engine settings match the page', () => {
  const g = google();
  const TTS = vm.runInContext('TTS', g);
  assert.equal(TTS.api, API_BASE);
  assert.equal(TTS.defaultModel, DEFAULT_MODEL);
  assert.equal(TTS.outputFormat, OUTPUT_FORMAT);
  assert.deepEqual([...TTS.models], MODELS.map((m) => m.id));
  for (const [mode, { speed }] of Object.entries(MODES)) assert.equal(TTS.speeds[mode], speed);
});

test('doGet says it is the Stress Lab script', () => {
  const g = google();
  const info = JSON.parse(g.doGet().body);
  assert.equal(info.app, 'Stress Lab');
  assert.equal(info.book, true);
  assert.equal(info.tts, false);
  g.props.ELEVENLABS_API_KEY = 'sk_test';
  assert.equal(JSON.parse(g.doGet().body).tts, true);
});

test('the book recordings: listed from both folders, sent only from them', () => {
  const g = google();
  const list = post(g, { type: 'book-list' });
  assert.equal(list.ok, true);
  assert.deepEqual(
    list.files.map((f) => [f.folder, f.name]),
    [
      ['Chapter 6 Stress and Chapter 7 Stress (Advanced)', '15_chapter 6_Stress_table 6-1_page 63.mp3'],
      ['Word Stress Practices / Unit 22', 'B5.mp3'],
    ],
  );
  const audio = post(g, { type: 'book-audio', id: 'b5000000000000000000000' });
  assert.equal(audio.ok, true);
  assert.equal(audio.audio, 'aGk=');
  assert.match(post(g, { type: 'book-audio', id: 'other00000000000000000' }).error, /no es un audio de las carpetas/);
  assert.match(post(g, { type: 'book-audio', id: 'pdf0000000000000000000' }).error, /no es un audio/);
  assert.match(post(g, { type: 'book-audio', id: '../x' }).error, /inválido/);
});

test('voices need the key; unknown requests are refused', () => {
  const g = google();
  assert.match(post(g, { type: 'tts', text: 'record', voiceId: 'EXAVITQu4vr4xnSDxMaL' }).error, /Guardar API key/);
  assert.match(post(g, { type: 'nope' }).error, /desconocido/);
});

test('results: one row per worksheet, one per answer, no duplicates', () => {
  const g = google();
  const result = {
    type: 'result',
    id: 'attempt-1',
    student: 'Ana',
    group: '10-1',
    setId: 'epu-22',
    setTitle: 'Pronunciation in Use Unit 22',
    correct: 2,
    total: 3,
    durationSec: 90,
    finishedAt: '2026-10-12T15:00:00Z',
    items: [
      { n: 1, prompt: 'Saturday', answer: 'Ooo', expected: 'Ooo', correct: true },
      { n: 2, prompt: '=HYPERLINK("x")', answer: 'oO', expected: 'Oo', correct: false },
    ],
  };
  assert.deepEqual(post(g, result), { ok: true, saved: 2 });
  assert.deepEqual(post(g, result), { ok: true, duplicate: true });
  const res = g.sheets.Resultados.rows;
  assert.equal(res.length, 1);
  assert.equal(res[0][1], 'Ana');
  assert.equal(res[0][7], 2 / 3);
  const ans = g.sheets.Respuestas.rows;
  assert.equal(ans.length, 2);
  assert.equal(ans[1][5], '\'=HYPERLINK("x")', 'no formulas from students');
});

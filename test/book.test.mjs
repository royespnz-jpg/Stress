import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSlots, matchFiles } from '../js/book.js';

const AE = 'Chapter 6 Stress and Chapter 7 Stress (Advanced)';
const EPU = 'Word Stress Practices';
let n = 0;
const file = (name, folder) => ({ id: `id${String(++n).padStart(22, '0')}`, name, folder, mime: 'audio/mpeg' });

test('every recording a worksheet needs has a slot', () => {
  const slots = audioSlots();
  assert.equal(slots.filter((s) => s.book === 'ae').length, 13);
  assert.equal(slots.filter((s) => s.book === 'epu').length, 23);
  assert.equal(new Set(slots.map((s) => s.key)).size, slots.length);
});

test('the teacher’s file names find their activity', () => {
  const files = [
    file('15_chapter 6_Stress_table 6-1_page 63.mp3', AE),
    file('16_chapter 6_Stress_table 6-2_page 69.mp3', AE),
    file('17_chapter 6_Stress_exercise H_page 72.mp3', AE),
    file('18_chapter 6_Stress_exercise I_page 72.mp3', AE),
    file('19_chapter 7_Stress_practice 1_page 74.mp3', AE),
    file('20_chapter 7_Stress_practice 3_page 76.mp3', AE),
    file('21_chapter 7_Stress_exercise A_page 77.mp3', AE),
    file('22_chapter 7_Stress_exercise B_page 78.mp3', AE),
    file('23_chapter 7_Stress_exercise C_page 78.mp3', AE),
    file('24_chapter 7_Stress_practice 5_page 79.mp3', AE),
    file('25_chapter 7_Stress_exercise A_page 80.mp3', AE),
    file('26_chapter 7_Stress_practice 6_page 81.mp3', AE),
    file('27_chapter 7_Stress_exercise A_page 82.mp3', AE),
    ...['B5', 'B6', 'B7', 'B8', 'B36', 'B37', 'B38', 'B39', 'B40', 'B41', 'B42', 'B43', 'B44', 'B45', 'B46', 'B47', 'B48', 'B49', 'B50', 'B51', 'B52', 'B53', 'B54'].map((c) =>
      file(`Track ${c}.mp3`, EPU),
    ),
  ];
  const slots = audioSlots();
  const m = matchFiles(files, slots);
  assert.equal(m.size, slots.length);
  assert.equal(m.get('ae:63:table 6-1').name, '15_chapter 6_Stress_table 6-1_page 63.mp3');
  assert.equal(m.get('ae:72:exercise i').name, '18_chapter 6_Stress_exercise I_page 72.mp3');
  assert.equal(m.get('ae:80:exercise a').name, '25_chapter 7_Stress_exercise A_page 80.mp3');
  assert.equal(m.get('epu:52:B5').name, 'Track B5.mp3');
  assert.equal(m.get('epu:64:B36').name, 'Track B36.mp3');
});

test('names with only the page are taken in track order', () => {
  const files = [file('31 page 72.mp3', AE), file('30 page 72.mp3', AE), file('track 09_p52.mp3', EPU)];
  const m = matchFiles(files);
  assert.equal(m.get('ae:72:exercise h').name, '30 page 72.mp3');
  assert.equal(m.get('ae:72:exercise i').name, '31 page 72.mp3');
  assert.equal(m.has('ae:63:table 6-1'), false);
});

test('a code does not match a longer code', () => {
  const m = matchFiles([file('B50.mp3', EPU), file('B5.mp3', EPU)]);
  assert.equal(m.get('epu:52:B5').name, 'B5.mp3');
  assert.equal(m.get('epu:70:B50').name, 'B50.mp3');
});

test('Pronunciation in Use names that say the unit and the activity', () => {
  const names = [
    'Unit 22_A_page 52.mp3', 'Unit 22_B_page 52.mp3', 'Unit 22_C_page 52.mp3', 'Unit 22_22.4_page 53.mp3',
    'Unit 28_B_page 64.mp3', 'Unit 28_C_page 64.mp3', 'Unit 28_D_page 64.mp3', 'Unit 28_28.1_page 65.mp3', 'Unit 28_28.2_page 65.mp3', 'Unit 28_28.3_page 65.mp3',
    'Unit 29_A_page 66.mp3', 'Unit 29_B_page 66.mp3', 'Unit 29_29.1_page 67.mp3', 'Unit 29_29.2_page 67.mp3', 'Unit 29_29.3_page 67.mp3',
    'Unit 30_B_page 68.mp3', 'Unit 30_C_page 68.mp3', 'Unit 30_30.1_page 69.mp3',
    'Unit 31_A_page 70.mp3', 'Unit 31_B_page 70.mp3', 'Unit 31_C_page 70.mp3', 'Unit 31_31.3_page 71.mp3', 'Unit 31_31.4_page 71.mp3',
  ];
  // shuffled, so only the names can tell them apart
  const files = [...names].reverse().map((n) => file(n, EPU));
  const m = matchFiles(files);
  const slots = audioSlots().filter((s) => s.book === 'epu');
  assert.equal(slots.filter((s) => m.has(s.key)).length, 23);
  assert.equal(m.get('epu:52:B5').name, 'Unit 22_A_page 52.mp3');
  assert.equal(m.get('epu:52:B7').name, 'Unit 22_C_page 52.mp3');
  assert.equal(m.get('epu:53:B8').name, 'Unit 22_22.4_page 53.mp3');
  assert.equal(m.get('epu:64:B38').name, 'Unit 28_D_page 64.mp3');
  assert.equal(m.get('epu:65:B40').name, 'Unit 28_28.2_page 65.mp3');
  assert.equal(m.get('epu:67:B46').name, 'Unit 29_29.3_page 67.mp3');
  assert.equal(m.get('epu:71:B54').name, 'Unit 31_31.4_page 71.mp3');
});

test('an activity split in two parts uses one recording', () => {
  const slots = audioSlots();
  assert.equal(slots.filter((s) => s.key === 'ae:80:exercise a').length, 1);
  assert.equal(slots.filter((s) => s.key === 'ae:81:practice 6').length, 1);
});

test('“Track No05” is the track of B5', () => {
  const files = ['Track No05.mp3', 'Track No06.mp3', 'Track No07.mp3', 'Track No08.mp3', 'Track No36.mp3', 'Track No54.mp3'].map((n) => file(n, EPU));
  const m = matchFiles(files);
  assert.equal(m.get('epu:52:B5').name, 'Track No05.mp3');
  assert.equal(m.get('epu:53:B8').name, 'Track No08.mp3');
  assert.equal(m.get('epu:64:B36').name, 'Track No36.mp3');
  assert.equal(m.get('epu:71:B54').name, 'Track No54.mp3');
  assert.equal(m.has('epu:64:B37'), false);
});

// The names in the teacher's folders (from the script's book-list, October 2026).
const TEACHER = [
  ...['15_chapter 6_Stress_table 6-1_page 63', '16_chapter 6_Stress_table 6-2_page 69', '17_chapter 6_exercise H_page 72', '18_chapter 6_exercise I_page 72', '19_chapter 7_practice 1', '20_chapter 7_practice 3', '21_chapter 7_practice A_page 77', '22_chapter 7_practice B_page 78', '23_chapter 7_practice C_page 78', '24_chapter 7_practice 5_page 79', '25_chapter 7_exercise_page 80', '26_chapter 7_practice 6_page 81', '27_chapter 7_exercise_page 82'].map((n) => [`${n}.mp3`, AE]),
  ...[5, 6, 7, 8, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54].map((t) => [`TrackNo${String(t).padStart(2, '0')}.mp3`, EPU]),
];

test('the teacher’s 36 recordings, each with its activity', () => {
  const files = [...TEACHER].reverse().map(([n, f]) => file(n, f));
  const m = matchFiles(files);
  const name = (k) => m.get(k)?.name;
  assert.equal(m.size, 36);
  assert.equal(name('ae:63:table 6-1'), '15_chapter 6_Stress_table 6-1_page 63.mp3');
  assert.equal(name('ae:69:table 6-2'), '16_chapter 6_Stress_table 6-2_page 69.mp3');
  assert.equal(name('ae:72:exercise h'), '17_chapter 6_exercise H_page 72.mp3');
  assert.equal(name('ae:72:exercise i'), '18_chapter 6_exercise I_page 72.mp3');
  assert.equal(name('ae:74:practice 1'), '19_chapter 7_practice 1.mp3');
  assert.equal(name('ae:76:practice 3'), '20_chapter 7_practice 3.mp3');
  assert.equal(name('ae:77:exercise a'), '21_chapter 7_practice A_page 77.mp3');
  assert.equal(name('ae:78:exercise b'), '22_chapter 7_practice B_page 78.mp3');
  assert.equal(name('ae:78:exercise c'), '23_chapter 7_practice C_page 78.mp3');
  assert.equal(name('ae:79:practice 5'), '24_chapter 7_practice 5_page 79.mp3');
  assert.equal(name('ae:80:exercise a'), '25_chapter 7_exercise_page 80.mp3');
  assert.equal(name('ae:81:practice 6'), '26_chapter 7_practice 6_page 81.mp3');
  assert.equal(name('ae:82:exercise a'), '27_chapter 7_exercise_page 82.mp3');
  for (const s of audioSlots().filter((x) => x.book === 'epu')) {
    assert.equal(name(s.key), `TrackNo${s.audio.code.slice(1).padStart(2, '0')}.mp3`, s.key);
  }
});

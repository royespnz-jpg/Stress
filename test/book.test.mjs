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

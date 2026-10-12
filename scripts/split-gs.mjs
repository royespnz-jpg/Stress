#!/usr/bin/env node
// Splits google-apps-script/Code.gs into short files (google-apps-script/partes/)
// for editors that don't let you paste the whole script at once. Apps Script
// shares one global scope across the files of a project, so the parts work
// exactly like Code.gs.
//
//   node scripts/split-gs.mjs      (run after editing Code.gs; npm test checks it)

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'google-apps-script', 'Code.gs');
const OUT = join(ROOT, 'google-apps-script', 'partes');
export const MAX_LINES = 80;
export const CUT = '/* ✂ */';

// Code.gs marks where each part starts with a line "/* ✂ */", so the parts
// stay the same when code is added elsewhere (only the changed part has to be
// pasted again). Every part is complete code on its own.
export function splitCode(code) {
  return code
    .replace(/\n+$/, '')
    .split(`\n${CUT}\n`)
    .map((p) => p.replace(/^\n+|\n+$/g, ''));
}

// The first and last lines let you check that nothing was cut off when pasting.
export function withMarkers(part, n, total) {
  return `/* ── Stress Lab · parte ${n} de ${total} ── */\n\n${part}\n\n/* ── fin de la parte ${n} de ${total} ── */\n`;
}

export function stripMarkers(text) {
  return text
    .replace(/^\/\* ── Stress Lab · parte \d+ de \d+ ── \*\/\n\n/, '')
    .replace(/\n\n\/\* ── fin de la parte \d+ de \d+ ── \*\/\n$/, '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parts = splitCode(readFileSync(SRC, 'utf8'));
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.gs')) rmSync(join(OUT, f));
  parts.forEach((p, i) => {
    const name = `parte-${i + 1}.gs`;
    writeFileSync(join(OUT, name), withMarkers(p, i + 1, parts.length));
    console.log(`${name}: ${p.split('\n').length} lines, ${Buffer.byteLength(p)} bytes`);
  });
}

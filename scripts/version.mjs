#!/usr/bin/env node
// Stamps one version on every file the page loads (the JS modules, the CSS
// and the word list), so a normal reload gets a new release instead of the
// copies the browser keeps for 10 minutes (GitHub Pages' cache).
//
//   node scripts/version.mjs          (before publishing a change; npm test checks it)

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const IMPORT = /(from\s+'\.{1,2}\/[^'?]+\.js)(?:\?v=[\w.-]+)?'/g;

export function jsFiles(dir = join(ROOT, 'js')) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

// Every version stamp in the page's files: [file, version].
export function stamps() {
  const out = [];
  for (const f of jsFiles()) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'\.{1,2}\/[^']+\.js(?:\?v=([\w.-]+))?'/g)) out.push([relative(ROOT, f), m[1] || null]);
    for (const m of src.matchAll(/fetch\('lexicon\.json(?:\?v=([\w.-]+))?'\)/g)) out.push([relative(ROOT, f), m[1] || null]);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:js\/app\.js|css\/styles\.css)(?:\?v=([\w.-]+))?"/g)) out.push(['index.html', m[1] || null]);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = process.argv[2] || new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  for (const f of jsFiles()) {
    const src = readFileSync(f, 'utf8');
    const next = src.replace(IMPORT, `$1?v=${v}'`).replace(/fetch\('lexicon\.json(?:\?v=[\w.-]+)?'\)/g, `fetch('lexicon.json?v=${v}')`);
    if (next !== src) writeFileSync(f, next);
  }
  const p = join(ROOT, 'index.html');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(js\/app\.js|css\/styles\.css)(?:\?v=[\w.-]+)?"/g, `$1?v=${v}"`));
  console.log(`version ${v}: ${stamps().length} references`);
}

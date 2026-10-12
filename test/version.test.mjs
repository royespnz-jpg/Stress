import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stamps } from '../scripts/version.mjs';

test('every file the page loads carries the same version (run: node scripts/version.mjs)', () => {
  const all = stamps();
  assert.ok(all.length > 40);
  const missing = all.filter(([, v]) => !v).map(([f]) => f);
  assert.deepEqual(missing, [], 'references without ?v=');
  assert.equal(new Set(all.map(([, v]) => v)).size, 1, 'one version everywhere');
});

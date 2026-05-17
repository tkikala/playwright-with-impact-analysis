import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCoveredFiles, hasCoverageHits, normalizeRepoPath } from '../src/core/coverage.mjs';

test('normalizes repo-relative coverage paths', () => {
  const root = '/repo/app';
  assert.equal(normalizeRepoPath('/repo/app/src/App.tsx', root), 'src/App.tsx');
  assert.equal(normalizeRepoPath('webpack://src/pages/Home.tsx', root), 'src/pages/Home.tsx');
  assert.equal(normalizeRepoPath('/outside/src/App.tsx', root), null);
});

test('detects Istanbul coverage hits', () => {
  assert.equal(hasCoverageHits({ s: { 0: 0 }, f: {}, b: {} }), false);
  assert.equal(hasCoverageHits({ s: { 0: 1 }, f: {}, b: {} }), true);
  assert.equal(hasCoverageHits({ s: {}, f: {}, b: { 0: [0, 2] } }), true);
});

test('extracts only hit files from coverage', () => {
  const files = extractCoveredFiles({
    '/repo/app/src/App.tsx': { path: '/repo/app/src/App.tsx', s: { 0: 1 } },
    '/repo/app/src/Unused.tsx': { path: '/repo/app/src/Unused.tsx', s: { 0: 0 } },
    '/repo/app/node_modules/lib/index.js': { path: '/repo/app/node_modules/lib/index.js', s: { 0: 1 } }
  }, { repoRoot: '/repo/app' });

  assert.deepEqual(files, ['src/App.tsx']);
});

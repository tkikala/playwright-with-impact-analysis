import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('builds a Pages catalog from a generated matrix', async () => {
  const matrixPath = path.join(repoRoot, 'fixtures/demo-app/.playwright-impact/matrix.json');
  await fs.mkdir(path.dirname(matrixPath), { recursive: true });
  await fs.writeFile(matrixPath, JSON.stringify({
    version: 1,
    generatedAt: '2026-05-17T12:00:00.000Z',
    sourceFiles: ['src/App.tsx'],
    files: { 'src/App.tsx': ['tests/app.spec.ts::chromium::renders app'] },
    tests: {
      'tests/app.spec.ts::chromium::renders app': {
        spec: 'tests/app.spec.ts',
        title: 'renders app',
        project: 'chromium',
        files: ['src/App.tsx']
      }
    }
  }));

  await execFileAsync(process.execPath, [
    path.join(repoRoot, 'scripts/build-pages-catalog.mjs'),
    'fixtures/demo-app/.playwright-impact/matrix.json'
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'tkikala/playwright-with-impact-analysis',
      GITHUB_SHA: '1234567890abcdef',
      GITHUB_RUN_ID: '42',
      GITHUB_RUN_NUMBER: '7',
      GITHUB_REF_NAME: 'main',
      MATRIX_REPOSITORY: 'mxschmitt/playwright-test-coverage',
      MATRIX_SOURCE_URL: 'https://github.com/mxschmitt/playwright-test-coverage',
      MATRIX_BRANCH: 'main',
      MATRIX_SHA: 'abcdef1234567890',
      PAGES_BASE_URL: 'http://127.0.0.1:9/'
    }
  });

  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, '_site/data/manifest.json'), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].label, 'mxschmitt/playwright-test-coverage @ abcdef1');
  assert.equal(manifest.latest, manifest.entries[0].path);

  const snapshot = JSON.parse(await fs.readFile(path.join(repoRoot, '_site', manifest.latest), 'utf8'));
  assert.equal(snapshot.catalog.runId, '42');
  assert.equal(snapshot.catalog.repository, 'mxschmitt/playwright-test-coverage');
  assert.deepEqual(snapshot.sourceFiles, ['src/App.tsx']);
});

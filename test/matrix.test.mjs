import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildMatrixFromCoverageDir } from '../src/core/matrix.mjs';

test('builds a dependency matrix from per-test coverage records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-'));
  const coverageDir = path.join(root, '.playwright-impact/coverage');
  await fs.mkdir(coverageDir, { recursive: true });
  await fs.writeFile(path.join(coverageDir, 'dashboard.json'), JSON.stringify({
    spec: 'tests/dashboard.spec.ts',
    title: 'loads',
    project: 'chromium',
    status: 'passed',
    files: ['src/pages/Dashboard.tsx', 'src/components/UserMenu.tsx']
  }));

  const matrix = await buildMatrixFromCoverageDir({
    repoRoot: root,
    coverageDir: '.playwright-impact/coverage',
    baseCommit: 'abc123'
  });

  assert.equal(matrix.version, 1);
  assert.equal(matrix.baseCommit, 'abc123');
  assert.equal(matrix.testCount, 1);
  assert.deepEqual(matrix.files['src/pages/Dashboard.tsx'], [
    'tests/dashboard.spec.ts::chromium::loads'
  ]);
});

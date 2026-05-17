import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectImpactCoverage } from '../src/playwright/coverage-collector.mjs';

test('collects a Playwright test coverage record from window coverage', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-fixture-'));
  const previousCoverageDir = process.env.PW_IMPACT_COVERAGE_DIR;
  process.env.PW_IMPACT_COVERAGE_DIR = '.impact-test/coverage';

  try {
    const page = {
      isClosed: () => false,
      evaluate: async () => ({
        [`${repoRoot}/src/App.tsx`]: {
          path: `${repoRoot}/src/App.tsx`,
          s: { 0: 1 },
          f: {},
          b: {}
        },
        [`${repoRoot}/src/Unused.tsx`]: {
          path: `${repoRoot}/src/Unused.tsx`,
          s: { 0: 0 },
          f: {},
          b: {}
        }
      })
    };
    const testInfo = {
      file: `${repoRoot}/tests/app.spec.ts`,
      title: 'loads app',
      titlePath: () => ['app suite', 'loads app'],
      project: { name: 'chromium' },
      status: 'passed',
      retry: 0
    };

    const record = await collectImpactCoverage({ page, testInfo, repoRoot });
    assert.deepEqual(record, {
      spec: 'tests/app.spec.ts',
      title: 'loads app',
      titlePath: ['app suite', 'loads app'],
      project: 'chromium',
      status: 'passed',
      retry: 0,
      files: ['src/App.tsx']
    });

    const outputDir = path.join(repoRoot, '.impact-test/coverage');
    const files = await fs.readdir(outputDir);
    assert.equal(files.length, 1);

    const persisted = JSON.parse(await fs.readFile(path.join(outputDir, files[0]), 'utf8'));
    assert.deepEqual(persisted, record);
  } finally {
    if (previousCoverageDir === undefined) {
      delete process.env.PW_IMPACT_COVERAGE_DIR;
    } else {
      process.env.PW_IMPACT_COVERAGE_DIR = previousCoverageDir;
    }
  }
});

test('skips collection when coverage is missing', async () => {
  const page = {
    isClosed: () => false,
    evaluate: async () => null
  };

  const record = await collectImpactCoverage({
    page,
    testInfo: { file: 'tests/app.spec.ts', title: 'loads app' }
  });

  assert.equal(record, null);
});

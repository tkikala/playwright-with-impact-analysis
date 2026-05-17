import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addTestsFromPlaywrightJsonReport } from '../src/core/playwright-report.mjs';

test('adds executed Playwright JSON report tests to a matrix', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-report-'));
  const reportPath = path.join(repoRoot, 'test-results.json');
  await fs.writeFile(reportPath, JSON.stringify({
    suites: [{
      title: 'tests/cart.spec.ts',
      file: path.join(repoRoot, 'tests/cart.spec.ts'),
      specs: [{
        title: 'adds product to cart',
        file: path.join(repoRoot, 'tests/cart.spec.ts'),
        tests: [{
          projectName: 'chromium',
          status: 'expected',
          results: [{ status: 'passed', retry: 0 }]
        }]
      }, {
        title: 'skipped checkout path',
        file: path.join(repoRoot, 'tests/cart.spec.ts'),
        tests: [{
          projectName: 'chromium',
          status: 'skipped',
          results: []
        }]
      }]
    }]
  }));

  const matrix = {
    tests: {},
    files: {},
    testCount: 0
  };

  await addTestsFromPlaywrightJsonReport(matrix, 'test-results.json', repoRoot);

  assert.deepEqual(Object.keys(matrix.tests), [
    'tests/cart.spec.ts::chromium::adds product to cart'
  ]);
  assert.equal(matrix.testCount, 1);
});

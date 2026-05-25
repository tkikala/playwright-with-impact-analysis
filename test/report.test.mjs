import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createImpactReport, shouldFailDiagnostics, writeReport } from '../src/core/report.mjs';

const matrix = {
  version: 1,
  generatedAt: '2026-05-22T10:00:00.000Z',
  baseCommit: 'abc123',
  sourceFiles: ['src/App.tsx', 'src/Button.tsx', 'src/Uncovered.tsx'],
  files: {
    'src/App.tsx': ['tests/app.spec.ts::chromium::renders app'],
    'src/Button.tsx': ['tests/button.spec.ts::chromium::renders button']
  },
  tests: {
    'tests/app.spec.ts::chromium::renders app': {
      spec: 'tests/app.spec.ts',
      title: 'renders app',
      project: 'chromium',
      files: ['src/App.tsx']
    },
    'tests/button.spec.ts::chromium::renders button': {
      spec: 'tests/button.spec.ts',
      title: 'renders button',
      project: 'chromium',
      files: ['src/Button.tsx']
    },
    'tests/no-link.spec.ts::chromium::runs without links': {
      spec: 'tests/no-link.spec.ts',
      title: 'runs without links',
      project: 'chromium',
      files: []
    }
  },
  testCount: 3,
  fileCount: 2,
  sourceFileCount: 3,
  uncoveredFileCount: 1
};

test('builds a selected impact report with matrix health', () => {
  const report = createImpactReport({
    command: 'select',
    matrix,
    matrixPath: '.playwright-impact/matrix.json',
    matrixSource: 'file',
    selection: {
      decision: 'selected',
      reason: '1 impacted Playwright spec file found.',
      changedFiles: ['src/Button.tsx'],
      specs: ['tests/button.spec.ts']
    }
  });

  assert.equal(report.decision, 'selected');
  assert.equal(report.selectedCount, 1);
  assert.equal(report.estimates.totalSpecs, 3);
  assert.equal(report.estimates.skippedSpecs, 2);
  assert.equal(report.matrix.coveredFiles, 2);
  assert.equal(report.matrix.uncoveredFiles, 1);
  assert.equal(report.matrix.zeroLinkTests, 1);
  assert.equal(report.matrix.coverageRate, 67);
  assert.equal(report.warnings.some((warning) => warning.code === 'zero-link-tests'), true);
});

test('reports critical diagnostics for missing matrix', () => {
  const report = createImpactReport({
    command: 'select',
    selection: {
      decision: 'full',
      reason: 'No dependency matrix is available.',
      changedFiles: ['src/App.tsx'],
      specs: []
    }
  });

  assert.equal(report.matrix.source, 'missing');
  assert.equal(report.warnings[0].code, 'matrix-missing');
  assert.equal(shouldFailDiagnostics(report), true);
});

test('surfaces unknown source and global-change warnings', () => {
  const unknown = createImpactReport({
    matrix,
    selection: {
      decision: 'full',
      reason: 'Changed source file is not in the matrix: src/New.tsx',
      changedFiles: ['src/New.tsx'],
      unknownRelevantFiles: ['src/New.tsx'],
      specs: []
    }
  });
  const global = createImpactReport({
    matrix,
    selection: {
      decision: 'full',
      reason: 'package.json is configured as a global-change file.',
      changedFiles: ['package.json'],
      specs: []
    }
  });

  assert.equal(unknown.warnings.some((warning) => warning.code === 'unknown-source-file'), true);
  assert.equal(global.warnings.some((warning) => warning.code === 'global-change-file'), true);
});

test('writes report JSON to disk', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-report-'));
  const report = createImpactReport({ command: 'diagnose', matrix });
  const written = await writeReport(report, '.playwright-impact/report.json', root);
  const parsed = JSON.parse(await fs.readFile(path.join(root, written), 'utf8'));

  assert.equal(written, '.playwright-impact/report.json');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.matrix.testCount, 3);
});

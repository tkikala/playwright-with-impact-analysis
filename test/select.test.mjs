import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectImpactedSpecs } from '../src/core/select.mjs';

const matrix = {
  version: 1,
  files: {
    'src/pages/Dashboard.tsx': ['tests/dashboard.spec.ts::chromium::loads'],
    'src/components/UserMenu.tsx': [
      'tests/dashboard.spec.ts::chromium::loads',
      'tests/settings.spec.ts::chromium::updates'
    ]
  },
  tests: {
    'tests/dashboard.spec.ts::chromium::loads': {
      spec: 'tests/dashboard.spec.ts',
      title: 'loads',
      project: 'chromium',
      files: ['src/pages/Dashboard.tsx']
    },
    'tests/settings.spec.ts::chromium::updates': {
      spec: 'tests/settings.spec.ts',
      title: 'updates',
      project: 'chromium',
      files: ['src/components/UserMenu.tsx']
    }
  }
};

test('selects impacted spec files from changed files', () => {
  const result = selectImpactedSpecs({
    matrix,
    changedFiles: ['src/components/UserMenu.tsx']
  });

  assert.equal(result.decision, 'selected');
  assert.deepEqual(result.specs, ['tests/dashboard.spec.ts', 'tests/settings.spec.ts']);
});

test('returns none for irrelevant documentation changes', () => {
  const result = selectImpactedSpecs({
    matrix,
    changedFiles: ['README.md']
  });

  assert.equal(result.decision, 'none');
});

test('falls back to full for unknown source files', () => {
  const result = selectImpactedSpecs({
    matrix,
    changedFiles: ['src/newFeature.tsx']
  });

  assert.equal(result.decision, 'full');
});

test('forces full run for global changes', () => {
  const result = selectImpactedSpecs({
    matrix,
    changedFiles: ['package.json']
  });

  assert.equal(result.decision, 'full');
});

test('supports custom global glob patterns', () => {
  const result = selectImpactedSpecs({
    matrix,
    changedFiles: ['config/test/runtime.json'],
    globalChangePatterns: 'config/**/*.json'
  });

  assert.equal(result.decision, 'full');
});

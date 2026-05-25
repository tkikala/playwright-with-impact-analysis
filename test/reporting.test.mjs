import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  REPORT_COMMENT_MARKER,
  renderImpactMarkdown,
  resolveReportMode,
  upsertPullRequestComment,
  writeStepSummary
} from '../src/core/reporting.mjs';

const report = {
  decision: 'selected',
  reason: '1 impacted Playwright spec file found.',
  selectedCount: 1,
  specs: ['tests/button.spec.ts'],
  estimates: { skippedSpecs: 3 },
  matrix: {
    coveredFiles: 12,
    uncoveredFiles: 2,
    coverageRate: 86,
    zeroLinkTests: 0
  },
  warnings: [],
  dashboardUrl: 'https://example.test/impact'
};

test('resolves default report mode from GitHub event', () => {
  assert.equal(resolveReportMode('', 'pull_request'), 'comment');
  assert.equal(resolveReportMode('auto', 'push'), 'summary');
  assert.equal(resolveReportMode('none', 'pull_request'), 'none');
});

test('renders sticky PR report markdown', () => {
  const markdown = renderImpactMarkdown(report);

  assert.match(markdown, new RegExp(REPORT_COMMENT_MARKER));
  assert.match(markdown, /Decision:\*\* `selected`/);
  assert.match(markdown, /tests\/button\.spec\.ts/);
  assert.match(markdown, /Open impact dashboard/);
});

test('writes GitHub step summary markdown', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-summary-'));
  const summaryPath = path.join(root, 'summary.md');

  await writeStepSummary('hello impact', summaryPath);

  assert.equal(await fs.readFile(summaryPath, 'utf8'), 'hello impact\n');
});

test('upserts an existing sticky PR comment', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method) {
      return response([{
        url: 'https://api.github.test/comment/1',
        body: `${REPORT_COMMENT_MARKER}\nold`
      }]);
    }
    return response({ ok: true });
  };

  try {
    const result = await upsertPullRequestComment({
      markdown: `${REPORT_COMMENT_MARKER}\nnew`,
      issueNumber: 7,
      token: 'token',
      repository: 'owner/repo',
      apiUrl: 'https://api.github.test'
    });

    assert.equal(result, 'updated');
    assert.equal(calls[1].url, 'https://api.github.test/comment/1');
    assert.equal(calls[1].options.method, 'PATCH');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body
  };
}

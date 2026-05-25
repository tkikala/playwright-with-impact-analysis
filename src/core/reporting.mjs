import fs from 'node:fs';
import { getInput } from './action-io.mjs';

export const REPORT_COMMENT_MARKER = '<!-- playwright-impact-analysis-report -->';

export function resolveReportMode(mode, eventName = process.env.GITHUB_EVENT_NAME) {
  if (mode && mode !== 'auto') return mode;
  return eventName === 'pull_request' || eventName === 'pull_request_target'
    ? 'comment'
    : 'summary';
}

export function renderImpactMarkdown(report) {
  const matrix = report.matrix;
  const warnings = report.warnings.length
    ? report.warnings.map((warning) => `- ${warning.message}`).join('\n')
    : '- None';
  const specs = report.specs.length
    ? report.specs.map((spec) => `- \`${spec}\``).join('\n')
    : '- None';
  const dashboard = report.dashboardUrl
    ? `\n[Open impact dashboard](${report.dashboardUrl})\n`
    : '';

  return `${REPORT_COMMENT_MARKER}
## Playwright Impact Analysis

**Decision:** \`${report.decision}\`  
**Reason:** ${report.reason}

| Metric | Value |
| --- | ---: |
| Selected specs | ${report.selectedCount} |
| Estimated skipped specs | ${report.estimates.skippedSpecs} |
| Covered SUT files | ${matrix.coveredFiles} |
| Uncovered SUT files | ${matrix.uncoveredFiles} |
| Source file coverage | ${matrix.coverageRate}% |
| Tests without links | ${matrix.zeroLinkTests} |

${dashboard}
### Selected specs
${specs}

### Safety diagnostics
${warnings}
`;
}

export async function publishImpactReport(report, options = {}) {
  const mode = resolveReportMode(options.mode);
  if (mode === 'none') return 'none';

  const markdown = renderImpactMarkdown(report);
  if (mode === 'summary') {
    await writeStepSummary(markdown);
    return 'summary';
  }

  const issueNumber = options.issueNumber ?? getPullRequestNumber();
  if (!issueNumber) {
    await writeStepSummary(markdown);
    return 'summary';
  }

  try {
    await upsertPullRequestComment({
      markdown,
      issueNumber,
      token: options.githubToken ?? getInput('github-token', process.env.GITHUB_TOKEN ?? ''),
      repository: options.repository ?? process.env.GITHUB_REPOSITORY,
      apiUrl: options.apiUrl ?? process.env.GITHUB_API_URL ?? 'https://api.github.com'
    });
    return 'comment';
  } catch (error) {
    console.warn(`Could not publish PR comment, writing step summary instead: ${error.message}`);
    await writeStepSummary(markdown);
    return 'summary';
  }
}

export async function writeStepSummary(markdown, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) {
    console.log(markdown);
    return;
  }
  const fs = await import('node:fs/promises');
  await fs.appendFile(summaryPath, `${markdown}\n`);
}

export async function upsertPullRequestComment(options = {}) {
  const { markdown, issueNumber, token, repository, apiUrl } = options;
  if (!token || !repository || !issueNumber) {
    throw new Error('Cannot publish PR comment without token, repository, and issue number.');
  }

  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28'
  };
  const commentsUrl = `${apiUrl}/repos/${repository}/issues/${issueNumber}/comments`;
  const comments = await fetchJson(commentsUrl, { headers });
  const existing = comments.find((comment) => comment.body?.includes(REPORT_COMMENT_MARKER));

  if (existing) {
    await fetchJson(existing.url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: markdown })
    });
    return 'updated';
  }

  await fetchJson(commentsUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: markdown })
  });
  return 'created';
}

function getPullRequestNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return event.pull_request?.number ?? event.number ?? null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${url}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

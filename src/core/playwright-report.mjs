import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRepoPath } from './coverage.mjs';
import { makeTestId } from './matrix.mjs';

export async function addTestsFromPlaywrightJsonReport(matrix, reportPath, repoRoot = process.cwd(), options = {}) {
  if (!reportPath) return matrix;

  const resolvedReportPath = path.resolve(repoRoot, reportPath);
  const report = JSON.parse(await fs.readFile(resolvedReportPath, 'utf8'));
  const records = extractTestsFromSuites(report.suites ?? [], [], repoRoot, options);

  for (const record of records) {
    const testId = makeTestId(record);
    matrix.tests[testId] ??= {
      spec: record.spec,
      title: record.title,
      project: record.project,
      files: []
    };
  }

  matrix.testCount = Object.keys(matrix.tests).length;
  return matrix;
}

function extractTestsFromSuites(suites, parents, repoRoot, options) {
  const records = [];
  for (const suite of suites) {
    const nextParents = suite.title ? [...parents, suite.title] : parents;
    const suiteFile = normalizeReportSpecPath(suite.file, repoRoot, options);

    for (const spec of suite.specs ?? []) {
      const specFile = normalizeReportSpecPath(spec.file ?? suite.file, repoRoot, options) ?? suiteFile;
      if (!specFile) continue;

      for (const test of spec.tests ?? []) {
        if (!isExecuted(test)) continue;

        records.push({
          spec: specFile,
          title: spec.title ?? 'unknown test',
          titlePath: [...nextParents, spec.title ?? 'unknown test'],
          project: test.projectName ?? null,
          status: 'passed',
          retry: lastResult(test)?.retry ?? 0,
          files: []
        });
      }
    }

    records.push(...extractTestsFromSuites(suite.suites ?? [], nextParents, repoRoot, options));
  }
  return records;
}

function normalizeReportSpecPath(filePath, repoRoot, options) {
  const normalized = normalizeRepoPath(filePath, repoRoot);
  if (!normalized) return null;
  if (options.testDir && !normalized.includes('/')) {
    return normalizeRepoPath(path.posix.join(options.testDir, normalized), repoRoot);
  }
  return normalized;
}

function isExecuted(test) {
  if (test.status === 'skipped') return false;
  return (test.results ?? []).some((result) => result.status === 'passed');
}

function lastResult(test) {
  return (test.results ?? []).at(-1) ?? null;
}

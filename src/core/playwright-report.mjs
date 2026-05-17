import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRepoPath } from './coverage.mjs';
import { makeTestId } from './matrix.mjs';

export async function addTestsFromPlaywrightJsonReport(matrix, reportPath, repoRoot = process.cwd()) {
  if (!reportPath) return matrix;

  const resolvedReportPath = path.resolve(repoRoot, reportPath);
  const report = JSON.parse(await fs.readFile(resolvedReportPath, 'utf8'));
  const records = extractTestsFromSuites(report.suites ?? [], [], repoRoot);

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

function extractTestsFromSuites(suites, parents, repoRoot) {
  const records = [];
  for (const suite of suites) {
    const nextParents = suite.title ? [...parents, suite.title] : parents;
    const suiteFile = suite.file ? normalizeRepoPath(suite.file, repoRoot) : null;

    for (const spec of suite.specs ?? []) {
      const specFile = normalizeRepoPath(spec.file ?? suite.file, repoRoot) ?? suiteFile;
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

    records.push(...extractTestsFromSuites(suite.suites ?? [], nextParents, repoRoot));
  }
  return records;
}

function isExecuted(test) {
  if (test.status === 'skipped') return false;
  return (test.results ?? []).some((result) => result.status === 'passed');
}

function lastResult(test) {
  return (test.results ?? []).at(-1) ?? null;
}

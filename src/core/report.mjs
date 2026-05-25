import fs from 'node:fs/promises';
import path from 'node:path';
import { toPosixPath } from './coverage.mjs';

export const REPORT_VERSION = 1;
export const DEFAULT_REPORT_PATH = '.playwright-impact/report.json';

export function createImpactReport(input = {}) {
  const matrix = input.matrix ?? null;
  const selection = input.selection ?? {};
  const health = matrixHealth(matrix, {
    changedFiles: selection.changedFiles ?? input.changedFiles,
    unknownRelevantFiles: selection.unknownRelevantFiles,
    reason: selection.reason
  });
  const selectedCount = selection.specs?.length ?? 0;
  const totalSpecCount = matrix ? uniqueSpecCount(matrix) : 0;
  const decision = input.decision ?? selection.decision ?? 'diagnose';

  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    command: input.command ?? null,
    decision,
    reason: input.reason ?? selection.reason ?? health.summary,
    changedFiles: selection.changedFiles ?? input.changedFiles ?? [],
    specs: selection.specs ?? [],
    selectedCount,
    estimates: {
      totalSpecs: totalSpecCount,
      skippedSpecs: decision === 'selected' ? Math.max(totalSpecCount - selectedCount, 0) : 0
    },
    matrix: {
      source: input.matrixSource ?? (matrix ? 'file' : 'missing'),
      path: input.matrixPath ?? null,
      baseCommit: matrix?.baseCommit ?? null,
      generatedAt: matrix?.generatedAt ?? null,
      testCount: health.testCount,
      coveredFiles: health.coveredFiles,
      sourceFiles: health.sourceFiles,
      uncoveredFiles: health.uncoveredFiles,
      zeroLinkTests: health.zeroLinkTests,
      coverageRate: health.coverageRate
    },
    timing: {
      durationMs: input.durationMs ?? null,
      fullSuiteDurationMs: input.fullSuiteDurationMs ?? null,
      selectedSuiteDurationMs: input.selectedSuiteDurationMs ?? null
    },
    dashboardUrl: input.dashboardUrl ?? null,
    warnings: health.warnings
  };
}

export function matrixHealth(matrix, context = {}) {
  if (!matrix) {
    return {
      summary: 'No dependency matrix is available.',
      testCount: 0,
      coveredFiles: 0,
      sourceFiles: 0,
      uncoveredFiles: 0,
      zeroLinkTests: 0,
      coverageRate: 0,
      warnings: [{
        code: 'matrix-missing',
        message: 'No dependency matrix is available, so impact cannot be proven.'
      }]
    };
  }

  const tests = Object.values(matrix.tests ?? {});
  const testCount = matrix.testCount ?? tests.length;
  const coveredFiles = matrix.fileCount ?? Object.keys(matrix.files ?? {}).length;
  const sourceFiles = matrix.sourceFileCount ?? matrix.sourceFiles?.length ?? coveredFiles;
  const uncoveredFiles = matrix.uncoveredFileCount ?? Math.max(sourceFiles - coveredFiles, 0);
  const zeroLinkTests = tests.filter((test) => !test.files?.length).length;
  const coverageRate = sourceFiles ? Math.round((coveredFiles / sourceFiles) * 100) : 0;
  const warnings = [];

  if (!matrix.files || !matrix.tests) {
    warnings.push({
      code: 'matrix-malformed',
      message: 'The matrix is missing required files or tests sections.'
    });
  }
  if (testCount === 0) {
    warnings.push({
      code: 'no-coverage-records',
      message: 'No passed Playwright coverage records were found in the matrix.'
    });
  }
  if (zeroLinkTests > 0) {
    warnings.push({
      code: 'zero-link-tests',
      message: `${zeroLinkTests} test${zeroLinkTests === 1 ? '' : 's'} ran without linked SUT files.`
    });
  }
  if (!matrix.baseCommit) {
    warnings.push({
      code: 'matrix-commit-missing',
      message: 'The matrix does not record the commit it was generated from.'
    });
  }
  for (const file of context.unknownRelevantFiles ?? []) {
    warnings.push({
      code: 'unknown-source-file',
      message: `Changed source file is not in the matrix: ${file}`
    });
  }
  if (context.reason?.includes('global-change file')) {
    warnings.push({
      code: 'global-change-file',
      message: context.reason
    });
  }

  return {
    summary: `Matrix contains ${testCount} tests across ${coveredFiles} covered files.`,
    testCount,
    coveredFiles,
    sourceFiles,
    uncoveredFiles,
    zeroLinkTests,
    coverageRate,
    warnings
  };
}

export async function writeReport(report, reportPath = DEFAULT_REPORT_PATH, repoRoot = process.cwd()) {
  const outputPath = path.resolve(repoRoot, reportPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return toPosixPath(path.relative(repoRoot, outputPath));
}

export function printReportSummary(report) {
  const matrix = report.matrix;
  console.log(`Playwright impact decision: ${report.decision}`);
  console.log(report.reason);
  console.log(`Specs selected: ${report.selectedCount}`);
  console.log(`Matrix health: ${matrix.coveredFiles}/${matrix.sourceFiles} files covered (${matrix.coverageRate}%), ${matrix.zeroLinkTests} zero-link tests.`);
  if (report.estimates.skippedSpecs > 0) {
    console.log(`Estimated skipped specs: ${report.estimates.skippedSpecs}`);
  }
  if (report.warnings.length) {
    console.log(`Warnings: ${report.warnings.map((warning) => warning.code).join(', ')}`);
  }
}

export function shouldFailDiagnostics(report) {
  return report.warnings.some((warning) => [
    'matrix-missing',
    'matrix-malformed',
    'no-coverage-records'
  ].includes(warning.code));
}

function uniqueSpecCount(matrix) {
  return new Set(Object.values(matrix.tests ?? {})
    .map((test) => test.spec)
    .filter(Boolean)).size;
}

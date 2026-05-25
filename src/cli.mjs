#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { buildMatrixFromCoverageDir, readMatrix, writeMatrix } from './core/matrix.mjs';
import { appendSpecsToCommand, selectImpactedSpecs } from './core/select.mjs';
import { getChangedFiles, getHeadCommit } from './core/git.mjs';
import { run } from './core/exec.mjs';
import { addTestsFromPlaywrightJsonReport } from './core/playwright-report.mjs';
import { createImpactReport, DEFAULT_REPORT_PATH, printReportSummary, shouldFailDiagnostics, writeReport } from './core/report.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Playwright Impact Analysis

Commands:
  pw-impact record --test-command "npx playwright test"
  pw-impact select --changed-files "src/App.tsx"
  pw-impact run --base-ref origin/main --test-command "npx playwright test"
  pw-impact diagnose --matrix-path .playwright-impact/matrix.json

Options:
  --matrix-path       Default: .playwright-impact/matrix.json
  --report-path       Default: .playwright-impact/report.json
  --coverage-dir      Default: .playwright-impact/coverage
  --base-ref          Default: origin/main
  --changed-files     Comma or newline separated changed files
  --source-roots      Comma or newline separated source roots. Default: src
  --playwright-json-report
                      Optional Playwright JSON report to include all executed tests
  --playwright-test-dir
                      Optional directory for basename-only JSON report spec paths
  --fallback          full or none. Default: full
  --fail-on-diagnostics
                      Exit non-zero when the report contains critical diagnostics
  --json              Print the generated report JSON to stdout
  --test-command      Default: npx playwright test
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(args.cwd ?? process.cwd());
  const matrixPath = args['matrix-path'] ?? '.playwright-impact/matrix.json';
  const reportPath = args['report-path'] ?? DEFAULT_REPORT_PATH;
  const coverageDir = args['coverage-dir'] ?? '.playwright-impact/coverage';
  const testCommand = args['test-command'] ?? 'npx playwright test';
  const fallback = args.fallback ?? 'full';
  const sourceRoots = args['source-roots'] ?? 'src';
  const failOnDiagnostics = args['fail-on-diagnostics'] === true;

  if (command === 'record') {
    const startedAt = Date.now();
    process.env.PW_IMPACT_COVERAGE_DIR = coverageDir;
    let fullSuiteDurationMs = null;
    if (args['skip-tests'] !== true) {
      await fs.rm(path.resolve(repoRoot, coverageDir), { recursive: true, force: true });
      const runStartedAt = Date.now();
      await run(testCommand, { cwd: repoRoot });
      fullSuiteDurationMs = Date.now() - runStartedAt;
    }
    const matrix = await buildMatrixFromCoverageDir({
      repoRoot,
      coverageDir,
      baseCommit: await getHeadCommit(repoRoot),
      sourceRoots
    });
    await addTestsFromPlaywrightJsonReport(matrix, args['playwright-json-report'], repoRoot, {
      testDir: args['playwright-test-dir']
    });
    await writeMatrix(matrix, matrixPath, repoRoot);
    const report = createImpactReport({
      command,
      decision: 'record',
      reason: `Recorded ${matrix.testCount} tests across ${matrix.fileCount} files.`,
      matrix,
      matrixPath,
      matrixSource: 'generated',
      durationMs: Date.now() - startedAt,
      fullSuiteDurationMs
    });
    await finishCliReport(report, reportPath, repoRoot, args, failOnDiagnostics);
    return;
  }

  if (command === 'diagnose') {
    const matrix = await readMatrix(matrixPath, repoRoot).catch(() => null);
    const report = createImpactReport({
      command,
      matrix,
      matrixPath,
      matrixSource: matrix ? 'file' : 'missing'
    });
    await finishCliReport(report, reportPath, repoRoot, args, failOnDiagnostics);
    return;
  }

  if (command === 'select' || command === 'run') {
    const startedAt = Date.now();
    const matrix = await readMatrix(matrixPath, repoRoot).catch(() => null);
    const changedFiles = args['changed-files']
      ? String(args['changed-files']).split(/[\n,]/).map((file) => file.trim()).filter(Boolean)
      : await getChangedFiles({ cwd: repoRoot, baseRef: args['base-ref'] ?? 'origin/main' });
    const selection = selectImpactedSpecs({ matrix, changedFiles, fallback, repoRoot });
    let selectedSuiteDurationMs = null;
    if (command === 'run' && selection.decision !== 'none') {
      const effectiveCommand = selection.decision === 'selected'
        ? appendSpecsToCommand(testCommand, selection.specs)
        : testCommand;
      const runStartedAt = Date.now();
      await run(effectiveCommand, { cwd: repoRoot });
      selectedSuiteDurationMs = Date.now() - runStartedAt;
    }
    const report = createImpactReport({
      command,
      matrix,
      matrixPath,
      matrixSource: matrix ? 'file' : 'missing',
      selection,
      durationMs: Date.now() - startedAt,
      selectedSuiteDurationMs
    });
    await finishCliReport(report, reportPath, repoRoot, args, failOnDiagnostics);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function finishCliReport(report, reportPath, repoRoot, args, failOnDiagnostics) {
  await writeReport(report, reportPath, repoRoot);
  if (args.json === true) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReportSummary(report);
  }
  if (failOnDiagnostics && shouldFailDiagnostics(report)) {
    throw new Error('Impact diagnostics failed.');
  }
}

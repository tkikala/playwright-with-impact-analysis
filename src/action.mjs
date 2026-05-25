import path from 'node:path';
import fs from 'node:fs/promises';
import { buildMatrixFromCoverageDir } from './core/matrix.mjs';
import { appendSpecsToCommand, selectImpactedSpecs } from './core/select.mjs';
import { getInput, isMainLikePush, isPullRequestEvent, setOutput } from './core/action-io.mjs';
import { getChangedFiles, getHeadCommit } from './core/git.mjs';
import { run } from './core/exec.mjs';
import { loadMatrixWithSource, saveMatrix } from './core/storage.mjs';
import { createImpactReport, DEFAULT_REPORT_PATH, printReportSummary, shouldFailDiagnostics, writeReport } from './core/report.mjs';
import { publishImpactReport } from './core/reporting.mjs';

async function main() {
  const workingDirectory = getInput('working-directory', '.');
  const repoRoot = path.resolve(process.cwd(), workingDirectory);
  const matrixPath = getInput('matrix-path', '.playwright-impact/matrix.json');
  const coverageDir = getInput('coverage-dir', '.playwright-impact/coverage');
  const reportPath = getInput('report-path', DEFAULT_REPORT_PATH);
  const testCommand = getInput('test-command', 'npx playwright test');
  const fallback = getInput('fallback', 'full');
  const storage = getInput('matrix-storage', 'branch');
  const dataBranch = getInput('data-branch', 'playwright-impact-data');
  const githubToken = getInput('github-token', process.env.GITHUB_TOKEN ?? '');
  const globalChangePatterns = getInput('global-change-patterns', '');
  const sourceRoots = getInput('source-roots', 'src');
  const baseRef = getInput('base-ref', process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
  const explicitChangedFiles = getInput('changed-files', '');
  const reportMode = getInput('report-mode', '');
  const dashboardUrl = getInput('dashboard-url', '');
  const failOnDiagnostics = getInput('fail-on-diagnostics', 'false') === 'true';

  let mode = getInput('mode', 'auto');
  if (mode === 'auto') {
    mode = isPullRequestEvent() ? 'run' : (isMainLikePush() ? 'record' : 'select');
  }

  if (mode === 'record') {
    const startedAt = Date.now();
    process.env.PW_IMPACT_COVERAGE_DIR = coverageDir;
    await fs.rm(path.resolve(repoRoot, coverageDir), { recursive: true, force: true });
    const testStartedAt = Date.now();
    await run(testCommand, { cwd: repoRoot });
    const fullSuiteDurationMs = Date.now() - testStartedAt;
    const matrix = await buildMatrixFromCoverageDir({
      repoRoot,
      coverageDir,
      baseCommit: await getHeadCommit(repoRoot),
      sourceRoots
    });
    await saveMatrix(matrix, { repoRoot, matrixPath, storage, dataBranch, githubToken });
    const report = createImpactReport({
      command: 'record',
      decision: 'record',
      reason: `Recorded ${matrix.testCount} tests across ${matrix.fileCount} files.`,
      matrix,
      matrixPath,
      matrixSource: 'generated',
      dashboardUrl,
      durationMs: Date.now() - startedAt,
      fullSuiteDurationMs
    });
    const writtenReportPath = await writeReport(report, reportPath, repoRoot);
    setReportOutputs(report, writtenReportPath);
    printReportSummary(report);
    await publishImpactReport(report, { mode: reportMode, githubToken });
    if (failOnDiagnostics && shouldFailDiagnostics(report)) {
      throw new Error('Impact diagnostics failed.');
    }
    return;
  }

  if (mode !== 'select' && mode !== 'run') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const startedAt = Date.now();
  const { matrix, source: matrixSource } = await loadMatrixWithSource({ repoRoot, matrixPath, storage, dataBranch });
  const changedFiles = explicitChangedFiles
    ? explicitChangedFiles.split(/[\n,]/).map((file) => file.trim()).filter(Boolean)
    : await getChangedFiles({ cwd: repoRoot, baseRef });

  const selection = selectImpactedSpecs({
    matrix,
    changedFiles,
    fallback,
    repoRoot,
    globalChangePatterns
  });

  let selectedSuiteDurationMs = null;

  if (mode === 'run') {
    if (selection.decision !== 'none') {
      const command = selection.decision === 'selected'
        ? appendSpecsToCommand(testCommand, selection.specs)
        : testCommand;
      const runStartedAt = Date.now();
      await run(command, { cwd: repoRoot });
      selectedSuiteDurationMs = Date.now() - runStartedAt;
    }
  }

  const report = createImpactReport({
    command: mode,
    matrix,
    matrixPath,
    matrixSource,
    selection,
    dashboardUrl,
    durationMs: Date.now() - startedAt,
    selectedSuiteDurationMs
  });
  const writtenReportPath = await writeReport(report, reportPath, repoRoot);
  setReportOutputs(report, writtenReportPath);
  printReportSummary(report);
  await publishImpactReport(report, { mode: reportMode, githubToken });
  if (failOnDiagnostics && shouldFailDiagnostics(report)) {
    throw new Error('Impact diagnostics failed.');
  }
}

function setReportOutputs(report, reportPath) {
  setOutput('decision', report.decision);
  setOutput('specs', report.specs);
  setOutput('reason', report.reason);
  setOutput('report-path', reportPath);
  setOutput('selected-count', report.selectedCount);
  setOutput('covered-files', report.matrix.coveredFiles);
  setOutput('uncovered-files', report.matrix.uncoveredFiles);
  setOutput('zero-link-tests', report.matrix.zeroLinkTests);
  setOutput('coverage-rate', report.matrix.coverageRate);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

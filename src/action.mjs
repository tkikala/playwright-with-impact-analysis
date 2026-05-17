import path from 'node:path';
import fs from 'node:fs/promises';
import { buildMatrixFromCoverageDir } from './core/matrix.mjs';
import { appendSpecsToCommand, selectImpactedSpecs } from './core/select.mjs';
import { getInput, isMainLikePush, isPullRequestEvent, setOutput } from './core/action-io.mjs';
import { getChangedFiles, getHeadCommit } from './core/git.mjs';
import { run } from './core/exec.mjs';
import { loadMatrix, saveMatrix } from './core/storage.mjs';

async function main() {
  const workingDirectory = getInput('working-directory', '.');
  const repoRoot = path.resolve(process.cwd(), workingDirectory);
  const matrixPath = getInput('matrix-path', '.playwright-impact/matrix.json');
  const coverageDir = getInput('coverage-dir', '.playwright-impact/coverage');
  const testCommand = getInput('test-command', 'npx playwright test');
  const fallback = getInput('fallback', 'full');
  const storage = getInput('matrix-storage', 'branch');
  const dataBranch = getInput('data-branch', 'playwright-impact-data');
  const githubToken = getInput('github-token', process.env.GITHUB_TOKEN ?? '');
  const globalChangePatterns = getInput('global-change-patterns', '');
  const baseRef = getInput('base-ref', process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
  const explicitChangedFiles = getInput('changed-files', '');

  let mode = getInput('mode', 'auto');
  if (mode === 'auto') {
    mode = isPullRequestEvent() ? 'run' : (isMainLikePush() ? 'record' : 'select');
  }

  if (mode === 'record') {
    process.env.PW_IMPACT_COVERAGE_DIR = coverageDir;
    await fs.rm(path.resolve(repoRoot, coverageDir), { recursive: true, force: true });
    await run(testCommand, { cwd: repoRoot });
    const matrix = await buildMatrixFromCoverageDir({
      repoRoot,
      coverageDir,
      baseCommit: await getHeadCommit(repoRoot)
    });
    await saveMatrix(matrix, { repoRoot, matrixPath, storage, dataBranch, githubToken });
    setOutput('decision', 'record');
    setOutput('specs', []);
    setOutput('reason', `Recorded ${matrix.testCount} tests across ${matrix.fileCount} files.`);
    return;
  }

  if (mode !== 'select' && mode !== 'run') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const matrix = await loadMatrix({ repoRoot, matrixPath, storage, dataBranch });
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

  setOutput('decision', selection.decision);
  setOutput('specs', selection.specs);
  setOutput('reason', selection.reason);

  console.log(`Playwright impact decision: ${selection.decision}`);
  console.log(selection.reason);
  if (selection.specs.length) console.log(selection.specs.join('\n'));

  if (mode === 'run') {
    if (selection.decision === 'none') return;
    const command = selection.decision === 'selected'
      ? appendSpecsToCommand(testCommand, selection.specs)
      : testCommand;
    await run(command, { cwd: repoRoot });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

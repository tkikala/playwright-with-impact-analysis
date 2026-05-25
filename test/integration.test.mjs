import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'fixtures/demo-app');
const cliPath = path.join(repoRoot, 'src/cli.mjs');

test('CLI record and select exercise the impact-analysis product loop', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-demo-'));
  await fs.cp(fixtureRoot, workspace, { recursive: true });
  await fs.mkdir(path.join(workspace, '.playwright-impact/coverage'), { recursive: true });
  await fs.cp(
    path.join(workspace, 'coverage-records'),
    path.join(workspace, '.playwright-impact/coverage'),
    { recursive: true }
  );

  await execFileAsync('git', ['init', '-b', 'main'], { cwd: workspace });
  await execFileAsync('git', ['config', 'user.name', 'Playwright Impact Test'], { cwd: workspace });
  await execFileAsync('git', ['config', 'user.email', 'playwright-impact-test@example.com'], { cwd: workspace });
  await execFileAsync('git', ['add', '.'], { cwd: workspace });
  await execFileAsync('git', ['commit', '-m', 'Initial fixture'], { cwd: workspace });

  await execFileAsync(process.execPath, [
    cliPath,
    'record',
    '--skip-tests',
    '--matrix-path',
    '.playwright-impact/matrix.json',
    '--coverage-dir',
    '.playwright-impact/coverage'
  ], { cwd: workspace });

  const matrix = JSON.parse(await fs.readFile(path.join(workspace, '.playwright-impact/matrix.json'), 'utf8'));
  const recordReport = JSON.parse(await fs.readFile(path.join(workspace, '.playwright-impact/report.json'), 'utf8'));
  assert.equal(matrix.testCount, 2);
  assert.equal(recordReport.decision, 'record');
  assert.equal(recordReport.matrix.coveredFiles, 2);
  assert.deepEqual(matrix.files['src/Button.tsx'], [
    'tests/button.spec.ts::chromium::renders button'
  ]);

  assert.deepEqual(await selectChanged(workspace, ['src/Button.tsx']), {
    decision: 'selected',
    specs: ['tests/button.spec.ts']
  });
  assert.deepEqual(await selectChanged(workspace, ['README.md']), {
    decision: 'none',
    specs: []
  });
  assert.deepEqual(await selectChanged(workspace, ['vite.config.ts']), {
    decision: 'full',
    specs: []
  });
  assert.deepEqual(await selectChanged(workspace, ['src/NewFile.tsx']), {
    decision: 'full',
    specs: []
  });

  const { stdout: diagnoseStdout } = await execFileAsync(process.execPath, [
    cliPath,
    'diagnose',
    '--matrix-path',
    '.playwright-impact/matrix.json',
    '--json'
  ], { cwd: workspace });
  const diagnose = JSON.parse(diagnoseStdout);
  assert.equal(diagnose.command, 'diagnose');
  assert.equal(diagnose.matrix.coverageRate, 100);
});

async function selectChanged(cwd, changedFiles) {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    'select',
    '--matrix-path',
    '.playwright-impact/matrix.json',
    '--changed-files',
    changedFiles.join(','),
    '--json'
  ], { cwd });
  const result = JSON.parse(stdout);
  return {
    decision: result.decision,
    specs: result.specs
  };
}

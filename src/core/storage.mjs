import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { capture, run } from './exec.mjs';
import { fetchBranch } from './git.mjs';
import { readMatrix, writeMatrix } from './matrix.mjs';
import { shellQuote } from './select.mjs';

export async function loadMatrix(options = {}) {
  const result = await loadMatrixWithSource(options);
  return result.matrix;
}

export async function loadMatrixWithSource(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const matrixPath = options.matrixPath ?? '.playwright-impact/matrix.json';
  const storage = options.storage ?? 'branch';
  if (storage === 'none') return { matrix: null, source: 'none' };

  const local = await readMatrix(matrixPath, repoRoot).catch(() => null);
  if (local) return { matrix: local, source: 'file' };

  if (storage !== 'branch') return { matrix: null, source: 'missing' };

  const dataBranch = options.dataBranch ?? 'playwright-impact-data';
  await fetchBranch(dataBranch, repoRoot);
  const raw = await capture(`git show origin/${dataBranch}:${shellQuote(matrixPath)}`, { cwd: repoRoot })
    .catch(() => null);
  return raw
    ? { matrix: JSON.parse(raw), source: `branch:${dataBranch}` }
    : { matrix: null, source: 'missing' };
}

export async function saveMatrix(matrix, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const matrixPath = options.matrixPath ?? '.playwright-impact/matrix.json';
  const storage = options.storage ?? 'branch';
  await writeMatrix(matrix, matrixPath, repoRoot);

  if (storage !== 'branch') return;
  await pushMatrixToDataBranch(matrix, options);
}

async function pushMatrixToDataBranch(matrix, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const matrixPath = options.matrixPath ?? '.playwright-impact/matrix.json';
  const dataBranch = options.dataBranch ?? 'playwright-impact-data';
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';

  if (!token || !repository) {
    console.log('Skipping data-branch push because GITHUB_TOKEN or GITHUB_REPOSITORY is unavailable.');
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-impact-data-'));
  const outputPath = path.join(tempDir, matrixPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(matrix, null, 2)}\n`);

  const remote = `${serverUrl.replace(/^http:/, 'https:')}/${repository}.git`;
  const authenticatedRemote = remote.replace('https://', `https://x-access-token:${token}@`);
  await run('git init', { cwd: tempDir });
  await run('git checkout --orphan data', { cwd: tempDir });
  await run('git config user.name "playwright-impact-analysis"', { cwd: tempDir });
  await run('git config user.email "playwright-impact-analysis@users.noreply.github.com"', { cwd: tempDir });
  await run(`git add ${shellQuote(matrixPath)}`, { cwd: tempDir });
  await run('git commit -m "Update Playwright impact matrix [skip ci]"', { cwd: tempDir });
  await run(`git remote add origin ${shellQuote(authenticatedRemote)}`, {
    cwd: tempDir,
    displayCommand: `git remote add origin ${shellQuote(remote)}`
  });
  await run(`git push origin HEAD:${shellQuote(dataBranch)} --force`, { cwd: tempDir });
}

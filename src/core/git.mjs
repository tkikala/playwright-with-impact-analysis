import { capture } from './exec.mjs';
import { shellQuote } from './select.mjs';

export async function getHeadCommit(cwd = process.cwd()) {
  return capture('git rev-parse HEAD', { cwd }).catch(() => null);
}

export async function getChangedFiles(options = {}) {
  if (options.changedFiles?.length) return options.changedFiles;

  const cwd = options.cwd ?? process.cwd();
  const baseRef = options.baseRef ?? 'origin/main';
  const diffCommand = `git diff --name-only ${baseRef}...HEAD`;
  const output = await capture(diffCommand, { cwd });
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function fetchBranch(branch, cwd = process.cwd()) {
  const refspec = `${shellQuote(branch)}:${shellQuote(`refs/remotes/origin/${branch}`)}`;
  return capture(`git fetch origin ${refspec} --depth=1`, { cwd }).catch(() => '');
}

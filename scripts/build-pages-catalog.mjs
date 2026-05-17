#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(repoRoot, 'docs');
const siteDir = path.join(repoRoot, '_site');
const matrixPath = path.resolve(repoRoot, process.argv[2] ?? 'fixtures/demo-app/.playwright-impact/matrix.json');
const repository = process.env.GITHUB_REPOSITORY ?? 'tkikala/playwright-with-impact-analysis';
const [owner, repoName] = repository.split('/');
const pagesBaseUrl = (process.env.PAGES_BASE_URL ?? `https://${owner}.github.io/${repoName}/`).replace(/\/?$/, '/');
const sha = process.env.GITHUB_SHA ?? await readGitSha();
const shortSha = sha.slice(0, 7);
const runId = process.env.GITHUB_RUN_ID ?? 'local';
const runNumber = process.env.GITHUB_RUN_NUMBER ?? 'local';
const branch = process.env.GITHUB_REF_NAME ?? await readGitBranch();
const generatedAt = new Date().toISOString();

await fs.rm(siteDir, { recursive: true, force: true });
await fs.cp(docsDir, siteDir, { recursive: true });

const dataDir = path.join(siteDir, 'data');
const matrixDir = path.join(dataDir, 'matrices');
await fs.mkdir(matrixDir, { recursive: true });

const previousManifest = await readPreviousManifest();
await preservePreviousMatrices(previousManifest);

const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
matrix.catalog = {
  generatedAt,
  source: 'github-actions',
  repository,
  branch,
  sha,
  runId,
  runNumber
};

const snapshotName = `${generatedAt.replace(/[:.]/g, '-')}-${shortSha}.json`;
await fs.writeFile(path.join(matrixDir, snapshotName), `${JSON.stringify(matrix, null, 2)}\n`);

const entry = {
  id: `${runId}-${shortSha}`,
  label: `${branch} @ ${shortSha}`,
  path: `data/matrices/${snapshotName}`,
  generatedAt,
  repository,
  branch,
  sha,
  runId,
  runNumber,
  coveredFiles: Object.keys(matrix.files ?? {}).length,
  sourceFiles: matrix.sourceFiles?.length ?? Object.keys(matrix.files ?? {}).length,
  tests: Object.keys(matrix.tests ?? {}).length
};

const entries = dedupeEntries([entry, ...(previousManifest.entries ?? [])]).slice(0, 30);
const manifest = {
  version: 1,
  generatedAt,
  latest: entry.path,
  entries
};

await fs.writeFile(path.join(dataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared Pages catalog with ${entries.length} matrix snapshot${entries.length === 1 ? '' : 's'}.`);

async function readPreviousManifest() {
  const manifestUrl = new URL('data/manifest.json', pagesBaseUrl);
  const manifest = await fetchJson(manifestUrl).catch(() => null);
  return manifest?.entries ? manifest : { version: 1, entries: [] };
}

async function preservePreviousMatrices(manifest) {
  for (const entry of manifest.entries ?? []) {
    if (!entry.path?.startsWith('data/matrices/')) continue;
    const target = path.join(siteDir, entry.path);
    const body = await fetchText(new URL(entry.path, pagesBaseUrl)).catch(() => null);
    if (!body) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body.endsWith('\n') ? body : `${body}\n`);
  }
}

function dedupeEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = entry.path;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${url}`);
  return response.text();
}

async function readGitSha() {
  const head = await fs.readFile(path.join(repoRoot, '.git/HEAD'), 'utf8').catch(() => '');
  if (head.startsWith('ref:')) {
    const ref = head.slice(5).trim();
    return fs.readFile(path.join(repoRoot, '.git', ref), 'utf8').then((value) => value.trim()).catch(() => 'local');
  }
  return head.trim() || 'local';
}

async function readGitBranch() {
  const head = await fs.readFile(path.join(repoRoot, '.git/HEAD'), 'utf8').catch(() => '');
  if (!head.startsWith('ref:')) return 'local';
  return head.trim().split('/').at(-1) || 'local';
}

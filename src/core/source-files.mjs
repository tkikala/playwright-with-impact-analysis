import fs from 'node:fs/promises';
import path from 'node:path';
import { isRelevantSourceFile, normalizeRepoPath } from './coverage.mjs';

const DEFAULT_SOURCE_ROOTS = ['src'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.github',
  '.next',
  '.nuxt',
  '.playwright-impact',
  'coverage',
  'dist',
  'build',
  'node_modules',
  'playwright-report',
  'test-results'
]);
const TEST_FILE_PATTERN = /(?:^|\/)(?:test|tests|__tests__|e2e|specs?)\/|(?:\.|-)spec\.|(?:\.|-)test\./;

export function splitSourceRoots(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return DEFAULT_SOURCE_ROOTS;
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function listSourceFiles(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const sourceRoots = splitSourceRoots(options.sourceRoots);
  const files = new Set();

  for (const sourceRoot of sourceRoots) {
    const normalizedRoot = normalizeRepoPath(sourceRoot, repoRoot) ?? sourceRoot;
    const absoluteRoot = path.resolve(repoRoot, normalizedRoot);
    await walk(absoluteRoot, repoRoot, files);
  }

  return [...files].sort();
}

async function walk(directory, repoRoot, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, repoRoot, files);
      continue;
    }

    if (!entry.isFile()) continue;
    const repoPath = normalizeRepoPath(fullPath, repoRoot);
    if (!repoPath || TEST_FILE_PATTERN.test(repoPath)) continue;
    if (isRelevantSourceFile(repoPath)) files.add(repoPath);
  }
}

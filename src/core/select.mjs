import path from 'node:path';
import { isRelevantSourceFile, normalizeRepoPath } from './coverage.mjs';

const DEFAULT_GLOBAL_CHANGE_PATTERNS = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'playwright.config.ts',
  'playwright.config.js',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'tsconfig.json'
];

function splitList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesPattern(file, pattern) {
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -3));
  if (pattern.includes('*')) {
    return globToRegExp(pattern).test(file);
  }
  return file === pattern;
}

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function specFromTestId(testId, matrix) {
  return matrix.tests?.[testId]?.spec ?? testId.split('::')[0];
}

export function selectImpactedSpecs(input = {}) {
  const matrix = input.matrix;
  const fallback = input.fallback ?? 'full';
  const repoRoot = input.repoRoot ?? process.cwd();
  const globalPatterns = splitList(input.globalChangePatterns);
  const patterns = globalPatterns.length > 0 ? globalPatterns : DEFAULT_GLOBAL_CHANGE_PATTERNS;
  const changedFiles = splitList(input.changedFiles)
    .map((file) => normalizeRepoPath(file, repoRoot))
    .filter(Boolean)
    .sort();

  if (!matrix || !matrix.files || !matrix.tests) {
    return {
      decision: fallback === 'none' ? 'none' : 'full',
      specs: [],
      changedFiles,
      reason: 'No dependency matrix is available.'
    };
  }

  const impactedTestIds = new Set();
  const unknownRelevantFiles = [];

  for (const file of changedFiles) {
    if (patterns.some((pattern) => matchesPattern(file, pattern))) {
      return {
        decision: 'full',
        specs: [],
        changedFiles,
        reason: `${file} is configured as a global-change file.`
      };
    }

    const testIds = matrix.files[file];
    if (testIds?.length) {
      for (const testId of testIds) impactedTestIds.add(testId);
      continue;
    }

    if (isRelevantSourceFile(file)) {
      unknownRelevantFiles.push(file);
    }
  }

  if (unknownRelevantFiles.length > 0 && fallback !== 'none') {
    return {
      decision: 'full',
      specs: [],
      changedFiles,
      unknownRelevantFiles,
      reason: `Changed source file is not in the matrix: ${unknownRelevantFiles[0]}`
    };
  }

  const specs = [...new Set([...impactedTestIds].map((testId) => specFromTestId(testId, matrix)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (specs.length === 0) {
    return {
      decision: 'none',
      specs: [],
      changedFiles,
      reason: changedFiles.length === 0
        ? 'No changed files were detected.'
        : 'No impacted Playwright specs were found.'
    };
  }

  return {
    decision: 'selected',
    specs,
    changedFiles,
    reason: `${specs.length} impacted Playwright spec file${specs.length === 1 ? '' : 's'} found.`
  };
}

export function appendSpecsToCommand(command, specs) {
  if (!specs?.length) return command;
  const quotedSpecs = specs.map((spec) => shellQuote(path.posix.normalize(spec))).join(' ');
  return `${command} ${quotedSpecs}`;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

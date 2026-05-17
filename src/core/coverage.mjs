import path from 'node:path';

const DEFAULT_RELEVANT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html'
]);

export function toPosixPath(value) {
  return value.replaceAll('\\', '/');
}

export function normalizeRepoPath(filePath, repoRoot = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') return null;

  let clean = filePath.trim();
  clean = clean.replace(/^file:\/\//, '');
  clean = clean.split('?')[0].split('#')[0];
  clean = clean.replace(/^webpack:\/\//, '');
  clean = clean.replace(/^\/?@fs\//, '/');
  clean = clean.replace(/^\/?src\//, 'src/');
  clean = clean.replace(/^\.\//, '');
  clean = toPosixPath(clean);

  const root = toPosixPath(path.resolve(repoRoot));
  if (path.isAbsolute(clean)) {
    const absolute = toPosixPath(path.resolve(clean));
    if (absolute === root) return null;
    if (absolute.startsWith(`${root}/`)) {
      clean = absolute.slice(root.length + 1);
    } else {
      return null;
    }
  }

  clean = path.posix.normalize(clean);
  if (clean === '.' || clean.startsWith('../')) return null;
  if (clean.includes('/node_modules/')) return null;
  if (clean.startsWith('node_modules/')) return null;
  return clean;
}

export function hasCoverageHits(istanbulFileCoverage) {
  if (!istanbulFileCoverage || typeof istanbulFileCoverage !== 'object') return false;

  const statementHits = Object.values(istanbulFileCoverage.s ?? {});
  if (statementHits.some((count) => Number(count) > 0)) return true;

  const functionHits = Object.values(istanbulFileCoverage.f ?? {});
  if (functionHits.some((count) => Number(count) > 0)) return true;

  const branchHits = Object.values(istanbulFileCoverage.b ?? {}).flat();
  return branchHits.some((count) => Number(count) > 0);
}

export function extractCoveredFiles(coverage, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const includeUnhitFiles = options.includeUnhitFiles ?? false;
  if (!coverage || typeof coverage !== 'object') return [];

  const files = new Set();
  for (const [rawPath, fileCoverage] of Object.entries(coverage)) {
    if (!includeUnhitFiles && !hasCoverageHits(fileCoverage)) continue;
    const coveragePath = fileCoverage?.path ?? rawPath;
    const normalized = normalizeRepoPath(coveragePath, repoRoot);
    if (normalized) files.add(normalized);
  }

  return [...files].sort();
}

export function isRelevantSourceFile(filePath, extensions = DEFAULT_RELEVANT_EXTENSIONS) {
  const normalized = normalizeRepoPath(filePath) ?? toPosixPath(filePath);
  if (!normalized || normalized.startsWith('.github/')) return false;
  if (normalized.endsWith('.md') || normalized.endsWith('.txt')) return false;
  return extensions.has(path.posix.extname(normalized));
}

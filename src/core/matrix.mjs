import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRepoPath, toPosixPath } from './coverage.mjs';
import { listSourceFiles } from './source-files.mjs';

export const MATRIX_VERSION = 1;

export function makeTestId(record) {
  const spec = record.spec ?? record.file;
  const project = record.project ? `::${record.project}` : '';
  const title = record.title ?? record.name ?? 'unknown test';
  return `${spec}${project}::${title}`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function listJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export async function buildMatrixFromCoverageDir(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const coverageDir = options.coverageDir ?? '.playwright-impact/coverage';
  const resolvedCoverageDir = path.resolve(repoRoot, coverageDir);
  const coverageFiles = await listJsonFiles(resolvedCoverageDir);

  const matrix = {
    version: MATRIX_VERSION,
    generatedAt: new Date().toISOString(),
    baseCommit: options.baseCommit ?? null,
    sourceFiles: await listSourceFiles({
      repoRoot,
      sourceRoots: options.sourceRoots
    }),
    files: {},
    tests: {}
  };

  for (const coverageFile of coverageFiles) {
    const record = await readJson(coverageFile);
    if (record.status && record.status !== 'passed') continue;

    const spec = normalizeRepoPath(record.spec, repoRoot);
    if (!spec) continue;

    const files = uniqueSorted((record.files ?? [])
      .map((file) => normalizeRepoPath(file, repoRoot))
      .filter(Boolean));

    const testId = makeTestId({ ...record, spec });
    matrix.tests[testId] = {
      spec,
      title: record.title ?? 'unknown test',
      project: record.project ?? null,
      files
    };

    for (const file of files) {
      matrix.files[file] ??= [];
      matrix.files[file].push(testId);
    }
  }

  for (const file of Object.keys(matrix.files)) {
    matrix.files[file] = uniqueSorted(matrix.files[file]);
  }

  matrix.testCount = Object.keys(matrix.tests).length;
  matrix.fileCount = Object.keys(matrix.files).length;
  matrix.sourceFileCount = matrix.sourceFiles.length;
  matrix.uncoveredFileCount = matrix.sourceFiles
    .filter((file) => !matrix.files[file]?.length)
    .length;
  return matrix;
}

export async function writeMatrix(matrix, matrixPath, repoRoot = process.cwd()) {
  const outputPath = path.resolve(repoRoot, matrixPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(matrix, null, 2)}\n`);
  return toPosixPath(path.relative(repoRoot, outputPath));
}

export async function readMatrix(matrixPath, repoRoot = process.cwd()) {
  const outputPath = path.resolve(repoRoot, matrixPath);
  return readJson(outputPath);
}

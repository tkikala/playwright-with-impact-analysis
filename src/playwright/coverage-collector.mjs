import fs from 'node:fs/promises';
import path from 'node:path';
import { extractCoveredFiles, normalizeRepoPath } from '../core/coverage.mjs';

export async function collectImpactCoverage({ page, testInfo, repoRoot = process.cwd() }) {
  if (!page || page.isClosed()) return null;

  const coverage = await page.evaluate(() => globalThis.__coverage__ ?? null).catch(() => null);
  if (!coverage) return null;

  const files = extractCoveredFiles(coverage, { repoRoot });
  if (files.length === 0) return null;

  const coverageDir = process.env.PW_IMPACT_COVERAGE_DIR ?? '.playwright-impact/coverage';
  const outputDir = path.resolve(repoRoot, coverageDir);
  await fs.mkdir(outputDir, { recursive: true });

  const spec = normalizeRepoPath(testInfo.file, repoRoot) ?? testInfo.file;
  const titlePath = typeof testInfo.titlePath === 'function'
    ? testInfo.titlePath()
    : [testInfo.title];
  const title = titlePath.at(-1) ?? testInfo.title;
  const project = testInfo.project?.name ?? null;
  const status = testInfo.status ?? null;

  const record = {
    spec,
    title,
    titlePath,
    project,
    status,
    retry: testInfo.retry ?? 0,
    files
  };

  const fileName = `${sanitize(spec)}-${sanitize(project ?? 'default')}-${sanitize(title)}-${Date.now()}-${process.pid}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function sanitize(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

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

test('patches a Sourcegraph ecommerce SUT checkout for impact recording', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcegraph-sut-'));
  await fs.mkdir(path.join(root, 'frontend/e2e/tests'), { recursive: true });
  await fs.writeFile(path.join(root, 'frontend/e2e/tests/browse.spec.ts'), "import { test, expect } from '@playwright/test'\n\ntest('works', async ({ page }) => {})\n");
  await fs.writeFile(path.join(root, 'frontend/vite.config.ts'), "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n");

  await execFileAsync(process.execPath, [
    path.join(repoRoot, 'scripts/prepare-sourcegraph-ecommerce-sut.mjs'),
    root
  ]);

  const spec = await fs.readFile(path.join(root, 'frontend/e2e/tests/browse.spec.ts'), 'utf8');
  const fixture = await fs.readFile(path.join(root, 'frontend/e2e/tests/impactFixture.ts'), 'utf8');
  const viteConfig = await fs.readFile(path.join(root, 'frontend/vite.config.ts'), 'utf8');

  assert.match(spec, /from '\.\/impactFixture'/);
  assert.match(fixture, /collectImpactCoverage/);
  assert.match(viteConfig, /vite-plugin-istanbul/);
  assert.match(viteConfig, /requireEnv: true/);
});

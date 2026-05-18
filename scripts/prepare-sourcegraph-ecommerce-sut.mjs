#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const sutRoot = path.resolve(process.argv[2] ?? '_sut/ecommerce-app');
const frontendRoot = path.join(sutRoot, 'frontend');
const testsDir = path.join(frontendRoot, 'e2e/tests');
const fixturePath = path.join(testsDir, 'impactFixture.ts');
const viteConfigPath = path.join(frontendRoot, 'vite.config.ts');

await fs.writeFile(fixturePath, `import { test as base, expect } from '@playwright/test'
import { collectImpactCoverage } from 'playwright-impact-analysis/playwright/collector'

export const test = base.extend({
  impactCoverage: [async ({ page }, use, testInfo) => {
    await use()
    await collectImpactCoverage({ page, testInfo, repoRoot: process.cwd() })
  }, { auto: true }],
})

export { expect }
`);

const entries = await fs.readdir(testsDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) continue;
  const specPath = path.join(testsDir, entry.name);
  const source = await fs.readFile(specPath, 'utf8');
  await fs.writeFile(
    specPath,
    source.replace(/from ['"]@playwright\/test['"]/g, "from './impactFixture'")
  );
}

let viteConfig = await fs.readFile(viteConfigPath, 'utf8');
if (!viteConfig.includes('vite-plugin-istanbul')) {
  viteConfig = viteConfig.replace(
    "import react from '@vitejs/plugin-react'\n",
    "import react from '@vitejs/plugin-react'\nimport IstanbulPlugin from 'vite-plugin-istanbul'\n"
  );
}

viteConfig = viteConfig.replace(
  'plugins: [react()],',
  `plugins: [
    react(),
    IstanbulPlugin({
      include: 'src/**/*',
      exclude: ['node_modules', 'e2e'],
      extension: ['.js', '.jsx', '.ts', '.tsx'],
      requireEnv: true,
    }),
  ],`
);

await fs.writeFile(viteConfigPath, viteConfig);
console.log(`Prepared Sourcegraph ecommerce SUT at ${sutRoot}`);

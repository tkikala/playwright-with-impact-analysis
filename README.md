# Playwright Impact Analysis

Deterministic test impact analysis for Playwright UI suites.

This tool records which frontend source files each Playwright test actually executes through Istanbul browser coverage. On pull requests, it compares the changed files to that dependency matrix and runs only the impacted spec files.

The first MVP is intentionally frontend-only. Backend and cross-repo impact can be added later without changing the core product shape.

Visualize a matrix with the GitHub Pages app: https://tkikala.github.io/playwright-with-impact-analysis/

The Pages deployment publishes a matrix catalog. Each Pages pipeline run generates a fresh matrix snapshot, preserves previously published snapshots, and writes `data/manifest.json` so the UI can open the latest matrix or choose an older run from the selector.

## What It Does

- Records per-test frontend runtime coverage from `window.__coverage__`.
- Builds a lightweight `.playwright-impact/matrix.json`.
- Selects impacted Playwright specs from `git diff`.
- Falls back to the full suite when safety cannot be proven.
- Runs as a Node 20 GitHub Action, with no Docker startup cost.
- Can persist the matrix to a hidden branch named `playwright-impact-data`.

## Install In A Test Repo

Instrument your frontend app for Istanbul only during Playwright runs. For Vite, that usually means `vite-plugin-istanbul`; for Webpack/Next, use `babel-plugin-istanbul`.

For Vite:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import istanbul from 'vite-plugin-istanbul';

export default defineConfig({
  plugins: [
    react(),
    istanbul({
      include: 'src/*',
      exclude: ['node_modules', 'tests'],
      extension: ['.js', '.jsx', '.ts', '.tsx'],
      requireEnv: true,
      env: 'PW_IMPACT_COVERAGE'
    })
  ]
});
```

Then run the app with `PW_IMPACT_COVERAGE=true` in CI so `window.__coverage__` exists during Playwright execution.

Then import the fixture in your Playwright tests:

```js
import { test, expect } from 'playwright-impact-analysis/playwright';

test('dashboard loads', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

If you already have a custom fixture:

```js
import { test as base, expect } from '@playwright/test';
import { attachImpactCoverage } from 'playwright-impact-analysis/playwright';

export const test = attachImpactCoverage(base.extend({}));
export { expect };
```

## GitHub Action

```yaml
name: Playwright Impact

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install --with-deps

      - uses: tkikala/playwright-with-impact-analysis@v0.1.0
        with:
          mode: auto
          test-command: npx playwright test
```

`mode: auto` does this:

- On `push` to `main`: runs the full Playwright suite, collects coverage, builds the matrix, and pushes it to `playwright-impact-data`.
- On `pull_request`: loads the matrix, calculates impacted specs, and runs either selected specs, no specs, or the full suite.

## CLI

```bash
pw-impact record --test-command "npx playwright test"
pw-impact select --changed-files "src/pages/Dashboard.tsx"
pw-impact run --base-ref origin/main --test-command "npx playwright test"
```

`record` also scans source files under `src` by default and stores them in `sourceFiles`, so the visualization can show files with no Playwright coverage. For apps with multiple source roots:

```bash
pw-impact record --source-roots "app,components,lib" --test-command "npx playwright test"
```

## Testing This Package

Run the deterministic unit and integration suite:

```bash
npm test
```

The integration test uses `fixtures/demo-app` with pre-seeded coverage records to exercise the product loop without external services:

1. build a matrix from per-test coverage records
2. select impacted specs for changed files
3. verify safe fallbacks for global and unknown source changes

## Matrix Format

```json
{
  "version": 1,
  "generatedAt": "2026-05-16T12:00:00.000Z",
  "baseCommit": "abc123",
  "sourceFiles": [
    "src/pages/Dashboard.tsx",
    "src/pages/Uncovered.tsx"
  ],
  "files": {
    "src/pages/Dashboard.tsx": [
      "tests/dashboard.spec.ts::chromium::dashboard loads"
    ]
  },
  "tests": {
    "tests/dashboard.spec.ts::chromium::dashboard loads": {
      "spec": "tests/dashboard.spec.ts",
      "title": "dashboard loads",
      "project": "chromium",
      "files": ["src/pages/Dashboard.tsx"]
    }
  }
}
```

## Safety Policy

This tool is conservative by default. If a changed source file is not present in the matrix, it runs the full suite. That prevents false skips while the matrix is young or incomplete.

Global files such as `package.json`, lockfiles, `playwright.config.*`, `vite.config.*`, and `tsconfig.json` also force the full suite.

## Current Limits

- Frontend-only runtime coverage.
- File-level impact, not line-level impact.
- Requires instrumented test builds that expose `window.__coverage__`.
- Selected execution runs spec files, not individual Playwright test titles yet.

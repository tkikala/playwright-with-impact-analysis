import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GitHub Pages app has the assets required to render a matrix', async () => {
  const html = await fs.readFile(path.join(repoRoot, 'docs/index.html'), 'utf8');
  const app = await fs.readFile(path.join(repoRoot, 'docs/app.js'), 'utf8');
  const css = await fs.readFile(path.join(repoRoot, 'docs/styles.css'), 'utf8');
  const matrix = JSON.parse(await fs.readFile(path.join(repoRoot, 'docs/sample-matrix.json'), 'utf8'));

  assert.match(html, /styles\.css/);
  assert.match(html, /app\.js/);
  assert.match(app, /sample-matrix\.json/);
  assert.match(css, /\.edge/);
  assert.ok(Object.keys(matrix.files).length > 0);
  assert.ok(Object.keys(matrix.tests).length > 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importApp } from './import-app.mjs';

test('tests, main and PDF processing share the same selectedFiles array', async () => {
  const { selectedFiles } = await importApp('file-handling.js');
  for (const file of ['main.js', 'pdf-processing.js']) {
    const url = new URL(`../js/${file}`, import.meta.url);
    const source = readFileSync(url, 'utf8');
    const [, specifier] = source.match(/from ['"]([^'"]*\/file-handling\.js[^'"]*)['"]/);
    const dependency = await import(new URL(specifier, url));
    assert.strictEqual(dependency.selectedFiles, selectedFiles, file);
  }
});

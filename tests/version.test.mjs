import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('package version is X.Y.Z and matches the single footer version', () => {
  assert.equal(typeof packageJson.version, 'string');
  assert.match(packageJson.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const matches = [...html.matchAll(/<span id="app-version">([^<]*)<\/span>/g)];
  assert.equal(matches.length, 1);
  assert.equal(matches[0][1], packageJson.version);
});

test('lockfile versions match package.json when present', () => {
  const lockfile = new URL('../package-lock.json', import.meta.url);
  if (!existsSync(lockfile)) return;
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  assert.equal(lock.version, packageJson.version);
  assert.equal(lock.packages[''].version, packageJson.version);
});

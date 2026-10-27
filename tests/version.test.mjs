import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function assertVersioned(reference, label) {
  const url = new URL(reference, 'https://local.test/');
  assert.deepEqual(url.searchParams.getAll('v'), [packageJson.version], `${label}: ${reference}`);
}

test('all local HTML assets carry the package version before their fragment', () => {
  const assets = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(reference => /^(?:\.\/)?(?:css\/|js\/|images\/|site\.webmanifest)/.test(reference));
  assert.ok(assets.length > 0);
  for (const asset of assets) assertVersioned(asset, 'index.html');
});

test('relative module and worker URLs and dynamic sprites carry the package version', () => {
  for (const file of readdirSync(new URL('../js/', import.meta.url)).filter(file => file.endsWith('.js'))) {
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    for (const [, reference] of source.matchAll(/["'](\.{1,2}\/[^"']+\.m?js(?:[?#][^"']*)?)["']/g)) {
      assertVersioned(reference, file);
    }
    for (const [, reference] of source.matchAll(/["'`](images\/icons\.svg[^"'`\s]*)["'`]/g)) {
      assertVersioned(reference, file);
    }
  }
});

test('sync replaces old versions, preserves external URLs and fragments, and is idempotent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'version-sync-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'js'));
    copyFileSync(new URL('../scripts/sync-version.mjs', import.meta.url), join(root, 'scripts/sync-version.mjs'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.8.7' }));
    writeFileSync(join(root, 'index.html'), html.replace(/css\/tokens\.css[^"']*/, 'css/tokens.css?mode=fast&v=old&v=older#sheet'));
    for (const file of readdirSync(new URL('../js/', import.meta.url)).filter(file => file.endsWith('.js'))) {
      copyFileSync(new URL(`../js/${file}`, import.meta.url), join(root, 'js', file));
    }
    writeFileSync(join(root, 'js/probe.js'), `
import './side.js';
import { value } from './value.js?v=old';
export { value } from './export.js';
export * from './all.js';
const lazy = import('./lazy.js?v=old');
const worker = new Worker('./worker.js?v=old');
const url = new URL('./vendor/worker.mjs?v=old', import.meta.url);
import 'https://example.com/external.js';
import '../shared.js?mode=fast&v=old#part';
`);
    let run = 0;
    const sync = () => import(`${pathToFileURL(join(root, 'scripts/sync-version.mjs'))}?run=${run++}`);
    await sync();
    const firstHtml = readFileSync(join(root, 'index.html'), 'utf8');
    assert.ok(firstHtml.includes('images/icons.svg?v=9.8.7#moon'));
    assert.ok(firstHtml.includes('css/tokens.css?mode=fast&v=9.8.7#sheet'));
    for (const [, external] of html.matchAll(/(?:href|src)=["'](https:[^"']+)["']/g)) {
      assert.ok(firstHtml.includes(external));
    }
    const probe = readFileSync(join(root, 'js/probe.js'), 'utf8');
    for (const file of ['side.js', 'value.js', 'export.js', 'all.js', 'lazy.js', 'worker.js', 'vendor/worker.mjs']) {
      assert.ok(probe.includes(`'./${file}?v=9.8.7'`), file);
    }
    assert.ok(probe.includes("'https://example.com/external.js'"));
    assert.ok(probe.includes("'../shared.js?mode=fast&v=9.8.7#part'"));
    const files = ['index.html', ...readdirSync(join(root, 'js')).map(file => `js/${file}`)];
    const before = files.map(file => readFileSync(join(root, file), 'utf8'));
    await sync();
    assert.deepEqual(files.map(file => readFileSync(join(root, file), 'utf8')), before);
    writeFileSync(join(root, 'index.html'), firstHtml.replace(/<span id="app-version">[^<]*<\/span>/, ''));
    await assert.rejects(sync, /Expected exactly one/);
    writeFileSync(join(root, 'index.html'), firstHtml.replace('images/brand-mark.svg', 'images/renamed.svg'));
    await assert.rejects(sync, /Expected local asset images\/brand-mark.svg/);
    writeFileSync(join(root, 'index.html'), firstHtml);
    if (existsSync(join(root, 'js/icons.js'))) {
      writeFileSync(join(root, 'js/icons.js'), 'export function createIcon() {}');
      await assert.rejects(sync, /Expected exactly one exported ICON_SPRITE_URL/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

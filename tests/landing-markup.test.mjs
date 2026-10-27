import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../css/workspace.css', import.meta.url), 'utf8');

test('landing shell includes structured hero elements', () => {
  assert.match(html, /class="hero-eyebrow"/);
  assert.match(html, /<h1>/);
  assert.match(html, /class="hero-points"/);
});

test('landing shell keeps wrapper and themed header controls', () => {
  assert.match(html, /class="wrapper"/);
  assert.match(html, /class="header-top"/);
  assert.match(html, /id="theme-switcher"/);
});

test('landing shell keeps the merge workflow mount points', () => {
  assert.match(html, /id="file-input"/);
  assert.match(html, /id="drop-area"/);
  assert.match(html, /id="selected-files-list"/);
  assert.match(html, /id="convert-button"/);
});

test('drop area is not a button, so card controls inside it stay operable', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const dropArea = html.match(/<div id="drop-area"[^>]*>/)[0];
  assert.doesNotMatch(dropArea, /role=|tabindex=/);
  assert.doesNotMatch(main, /dropArea\.(setAttribute\("(role|tabindex)"|addEventListener\("keydown")/);
});

test('page imports JetBrains Mono alongside Roboto', () => {
  assert.match(css, /JetBrains Mono/);
});

test('hero shows only the two benefit pills', () => {
  const points = html.match(/<li class="hero-point">([^<]+)<\/li>/g);
  assert.deepEqual(points, [
    '<li class="hero-point">No uploads</li>',
    '<li class="hero-point">Live preview</li>',
  ]);
});

test('workflow keeps upload and action controls', () => {
  assert.match(html, /id="file-upload-label"/);
  assert.match(html, /id="reset-button"/);
  assert.match(html, /id="blank-page-button"/);
  assert.match(html, /id="output-filename-container"/);
});

test('output filename and merge action share the final action bar', () => {
  assert.match(html, /<div id="output-filename-container"[^>]*>\s*<div class="output-bar">/);
  assert.match(html, /<label for="output-filename">Output filename<\/label>[\s\S]*?<input[^>]*id="output-filename"[^>]*>[\s\S]*?<span class="output-filename-ext">\.pdf<\/span>/);
  assert.match(html, /<div class="tool-actions">[\s\S]*?<button id="convert-button" class="button primary"/);
});

test('file cards use a preview stage and aligned content rows', () => {
  const fileHandling = readFileSync(new URL('../js/file-handling.js', import.meta.url), 'utf8');
  assert.match(workspaceCss, /aspect-ratio: 4 \/ 3/);
  assert.equal(workspaceCss.includes('grid-template-rows: subgrid'), false);
  assert.match(workspaceCss, /grid-template-rows: auto max-content auto auto 1fr/);
  assert.match(workspaceCss, /align-items: stretch/);
  assert.match(fileHandling, /fileInfoContainer\.appendChild\(rotationControls\)/);
  assert.match(fileHandling, /orientationBadge\.hidden = true/);
});

test('page keeps privacy-oriented footer copy', () => {
  assert.match(html, /All processing happens in your browser/i);
});

test('stylesheet exposes mono font and surface tokens', () => {
  assert.match(css, /--font-mono:/);
  assert.match(css, /--surface-color:/);
  assert.match(css, /--surface2-color:/);
});

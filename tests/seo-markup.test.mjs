import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('page keeps canonical url for pdfmerge.me', () => {
  assert.match(html, /rel="canonical" href="https:\/\/pdfmerge\.me\/"/);
});

test('page keeps refreshed social metadata for pdfmerge.me', () => {
  assert.match(html, /property="og:url" content="https:\/\/pdfmerge\.me\/"/);
  assert.match(html, /name="twitter:url" content="https:\/\/pdfmerge\.me\/"/);
});

test('page includes a single product-focused h1', () => {
  const matches = html.match(/<h1>/g) ?? [];
  assert.equal(matches.length, 1);
});

test('footer links to sibling app pdfprotect.me', () => {
  assert.match(html, /https:\/\/pdfprotect\.me/);
});

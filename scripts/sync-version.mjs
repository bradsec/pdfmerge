import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const indexPath = new URL('../index.html', import.meta.url);
const html = readFileSync(indexPath, 'utf8');
const versionSpan = /(<span id="app-version">)[^<]*(<\/span>)/g;

if ([...html.matchAll(versionSpan)].length !== 1) {
  throw new Error('Expected exactly one <span id="app-version"> in index.html');
}

writeFileSync(indexPath, html.replace(versionSpan, (_, open, close) => `${open}${version}${close}`));

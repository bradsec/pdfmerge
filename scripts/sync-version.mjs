import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const indexPath = new URL('../index.html', import.meta.url);
const html = readFileSync(indexPath, 'utf8');
const versionSpan = /(<span id="app-version">)[^<]*(<\/span>)/g;

if ([...html.matchAll(versionSpan)].length !== 1) {
  throw new Error('Expected exactly one <span id="app-version"> in index.html');
}

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Expected package.json version in X.Y.Z format');
}

function versionUrl(reference) {
  const [pathAndQuery, fragment] = reference.split('#');
  const [path, query = ''] = pathAndQuery.split('?');
  const params = new URLSearchParams(query);
  params.set('v', version);
  return `${path}?${params}${fragment === undefined ? '' : `#${fragment}`}`;
}

const assets = new Set();
const updatedHtml = html.replace(versionSpan, (_, open, close) => `${open}${version}${close}`)
  .replace(/\b(href|src)=(["'])([^"']+)\2/g, (match, attribute, quote, reference) => {
    if (!/^(?:\.\/)?(?:css\/[^?#]+\.css|js\/[^?#]+\.m?js|images\/[^?#]+|site\.webmanifest)(?:[?#].*)?$/.test(reference)) {
      return match;
    }
    assets.add(reference.split(/[?#]/)[0].replace(/^\.\//, ''));
    return `${attribute}=${quote}${versionUrl(reference)}${quote}`;
  });

for (const asset of [
  'css/reset.css', 'css/styles.css', 'images/icons.svg', 'images/brand-mark.svg',
  'images/favicon.svg', 'images/favicon-32x32.png', 'images/favicon-16x16.png',
  'images/apple-touch-icon.png', 'site.webmanifest',
]) {
  if (!assets.has(asset)) throw new Error(`Expected local asset ${asset} in index.html`);
}
if (![...assets].some(asset => asset.startsWith('js/'))) {
  throw new Error('Expected local JavaScript entry point in index.html');
}

const updates = [[indexPath, updatedHtml]];
let moduleUrls = 0;
for (const file of readdirSync(new URL('../js/', import.meta.url)).filter(file => file.endsWith('.js'))) {
  const path = new URL(`../js/${file}`, import.meta.url);
  let source = readFileSync(path, 'utf8');
  // Local JS string literals cover imports, re-exports, workers and import.meta.url URLs, including .mjs vendors.
  source = source.replace(/(["'])(\.{1,2}\/[^"']+\.m?js(?:\?[^"'#]*)?(?:#[^"']*)?)\1/g, (_, quote, reference) => {
    moduleUrls++;
    return `${quote}${versionUrl(reference)}${quote}`;
  });
  if (file === 'icons.js') {
    const sprite = /(export const ICON_SPRITE_URL = )(["'])images\/icons\.svg(?:\?[^"']*)?\2/g;
    if ([...source.matchAll(sprite)].length !== 1) {
      throw new Error('Expected exactly one exported ICON_SPRITE_URL in js/icons.js');
    }
    source = source.replace(sprite, (_, prefix, quote) => `${prefix}${quote}images/icons.svg?v=${version}${quote}`);
  }
  updates.push([path, source]);
}
if (moduleUrls === 0) throw new Error('Expected relative JavaScript module URLs in js/*.js');

for (const [path, content] of updates) writeFileSync(path, content);

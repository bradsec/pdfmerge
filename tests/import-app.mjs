import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Match browser module URLs so tests share state with transitive app imports after every version bump.
export function importApp(path) {
  return import(new URL(`../js/${path}?v=${version}`, import.meta.url));
}

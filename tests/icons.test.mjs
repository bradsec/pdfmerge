import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { createIcon } = await importApp('icons.js');

test('dynamic icons use SVG elements and a local sprite reference', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElementNS(namespace, tag) {
            return {
                namespace, tag, attributes: {}, children: [],
                setAttribute(name, value) { this.attributes[name] = value; },
                appendChild(child) { this.children.push(child); }
            };
        }
    };
    try {
        const icon = createIcon('trash-2');
        assert.equal(icon.namespace, 'http://www.w3.org/2000/svg');
        assert.equal(icon.tag, 'svg');
        assert.deepEqual(icon.attributes, { class: 'icon', 'aria-hidden': 'true' });
        assert.equal(icon.children.length, 1);
        assert.equal(icon.children[0].namespace, icon.namespace);
        assert.equal(icon.children[0].tag, 'use');
        assert.equal(icon.children[0].attributes.href, `images/icons.svg?v=${version}#trash-2`);
    } finally {
        globalThis.document = previousDocument;
    }
});

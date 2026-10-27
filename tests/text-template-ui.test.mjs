import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const elements = new Map();
function element(id, value = '') {
    const attributes = new Map();
    const node = {
        id, value, dataset: {}, hidden: true, textContent: '', isConnected: true,
        closest: () => node.section ?? null,
        setAttribute: (name, val) => attributes.set(name, val),
        removeAttribute: name => attributes.delete(name),
        getAttribute: name => attributes.get(name),
        focus() { this.focused = true; }
    };
    elements.set(id, node);
    return node;
}
globalThis.document = { getElementById: id => elements.get(id) };

const { validateTextTemplate } = await importApp('pdf-processing.js');

test('empty template waits for blur or merge, while edited invalid syntax shows live', () => {
    element('add-header-text').checked = true;
    const input = element('header-text-template');
    input.section = { open: false };
    const error = element('header-text-template-error');

    assert.equal(validateTextTemplate('header'), false);
    assert.equal(error.hidden, true);
    assert.equal(input.getAttribute('aria-invalid'), 'false');

    input.dataset.touched = 'true';
    input.value = '{bad}';
    assert.equal(validateTextTemplate('header'), false);
    assert.equal(error.hidden, false);
    assert.equal(input.getAttribute('aria-describedby'), error.id);

    input.value = '';
    assert.equal(validateTextTemplate('header'), false);
    assert.equal(error.hidden, true);
    assert.equal(validateTextTemplate('header', true), false);
    assert.equal(error.hidden, false);
    assert.equal(input.focused, true);
    assert.equal(input.section.open, true);

    input.value = 'CONFIDENTIAL';
    assert.equal(validateTextTemplate('header'), true);
    assert.equal(error.hidden, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const controls = new Map();
function control(id, value = '') {
    const listeners = new Map();
    const node = {
        id, value, checked: false, hidden: false, isConnected: true,
        tagName: id === 'watermark-type' || id === 'watermark-position' ? 'SELECT' : 'INPUT',
        options: [], labels: [], style: {},
        addEventListener(type, listener) { listeners.set(type, [...(listeners.get(type) ?? []), listener]); },
        dispatchEvent(event) { listeners.get(event.type)?.forEach(listener => listener.call(this, event)); },
        after() {}
    };
    controls.set(id, node);
    return node;
}

const type = control('watermark-type', 'image');
const position = control('watermark-position', 'middle-centre');
const tiled = control('watermark-tiled');
const margin = control('watermark-margin', '8.5');
const marginRow = { hidden: true };
margin.closest = () => marginRow;
const imageRows = [marginRow];
const textRows = [{ hidden: false }];
control('add-watermark');
control('watermark-image-width', '30');
control('watermark-image');
control('watermark-image-status');
const group = {
    isConnected: true, style: {},
    querySelectorAll(selector) { return selector === '.watermark-image-only' ? imageRows : textRows; }
};
globalThis.document = {
    getElementById: id => controls.get(id),
    querySelector: selector => selector === '.watermark-group' ? group : null,
    createElement: () => ({ setAttribute() {}, append() {}, querySelector: () => null })
};
globalThis.CSS = { escape: value => value };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { initWatermarkControls } = await importApp('watermark.js');

test('image margin appears only for non-tiled edge positions', () => {
    initWatermarkControls();
    assert.equal(marginRow.hidden, true);

    position.value = 'top-centre';
    position.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, false);

    tiled.checked = true;
    tiled.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, true);

    tiled.checked = false;
    tiled.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, false);

    position.value = 'middle-centre';
    position.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, true);

    position.value = 'middle-right';
    position.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, false);

    type.value = 'text';
    type.dispatchEvent(new Event('change'));
    assert.equal(marginRow.hidden, true);
    assert.equal(textRows[0].hidden, false);
    assert.equal(margin.value, '8.5');
});

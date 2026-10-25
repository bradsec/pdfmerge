import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { getDefaultPaperSizeValue, initializePaperSizeSelect } = await importApp('paper-size.js');

test('paper size defaults to A4', () => {
    assert.equal(getDefaultPaperSizeValue(), 'A4');
});

test('paper size initialization forces A4 and clears persisted selection', () => {
    const selectElement = { value: 'A0' };
    const removed = [];
    const storage = {
        removeItem(key) {
            removed.push(key);
        }
    };

    initializePaperSizeSelect(selectElement, storage, 'paper-size-select');

    assert.equal(selectElement.value, 'A4');
    assert.deepEqual(removed, ['paper-size-select']);
});

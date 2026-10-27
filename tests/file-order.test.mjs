import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const { sortFileEntriesInPlace, getKeyboardMoveTarget } = await importApp('file-handling.js');

test('sorts file cards naturally while blank pages keep their slots', () => {
    const entries = [
        { type: 'file', name: 'file10.pdf', file: { lastModified: 30 } },
        { type: 'blank' },
        { type: 'file', name: 'File2.pdf', file: { lastModified: 10 } },
        { type: 'file', name: 'file1.pdf', file: { lastModified: 20 } },
        { type: 'blank' }
    ];
    const original = entries;
    const blanks = [entries[1], entries[4]];

    sortFileEntriesInPlace(entries, 'name-asc');
    assert.strictEqual(entries, original);
    assert.deepEqual(entries.map((entry) => entry.name ?? 'blank'),
        ['file1.pdf', 'blank', 'File2.pdf', 'file10.pdf', 'blank']);
    assert.strictEqual(entries[1], blanks[0]);
    assert.strictEqual(entries[4], blanks[1]);

    sortFileEntriesInPlace(entries, 'name-desc');
    assert.deepEqual(entries.map((entry) => entry.name ?? 'blank'),
        ['file10.pdf', 'blank', 'File2.pdf', 'file1.pdf', 'blank']);

    sortFileEntriesInPlace(entries, 'oldest');
    assert.deepEqual(entries.map((entry) => entry.name ?? 'blank'),
        ['File2.pdf', 'blank', 'file1.pdf', 'file10.pdf', 'blank']);

    sortFileEntriesInPlace(entries, 'newest');
    assert.deepEqual(entries.map((entry) => entry.name ?? 'blank'),
        ['file10.pdf', 'blank', 'file1.pdf', 'File2.pdf', 'blank']);
});

test('keyboard move targets clamp at list ends', () => {
    assert.equal(getKeyboardMoveTarget('ArrowLeft', 1, 4), 0);
    assert.equal(getKeyboardMoveTarget('ArrowUp', 0, 4), 0);
    assert.equal(getKeyboardMoveTarget('ArrowRight', 1, 4), 2);
    assert.equal(getKeyboardMoveTarget('ArrowDown', 3, 4), 3);
    assert.equal(getKeyboardMoveTarget('Home', 2, 4), 0);
    assert.equal(getKeyboardMoveTarget('End', 1, 4), 3);
    assert.equal(getKeyboardMoveTarget('Enter', 1, 4), undefined);
});

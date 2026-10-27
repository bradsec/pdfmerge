import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { countOutputPages } = await importApp('output-count.js');

test('counts ranges, repeated pages, images, blanks and duplex padding', () => {
    const files = [
        { type: 'file', extension: 'pdf', pageCount: 5, pageRange: '1-2,2' },
        { type: 'blank' },
        { type: 'file', extension: 'jpg', imageLayout: 'cover', rotation: 90 },
        { type: 'file', extension: 'pdf', pageCount: 2, pageRange: '' }
    ];
    assert.deepEqual(countOutputPages(files, { duplexPadding: true }), { count: 10, exact: true });
    assert.deepEqual(countOutputPages(files, { duplexPadding: false }), { count: 7, exact: true });
});

test('unknown PDF size or invalid range cannot give an exact total', () => {
    assert.deepEqual(countOutputPages([{ extension: 'pdf', pageCount: null }], { duplexPadding: false }),
        { count: null, exact: false });
    assert.deepEqual(countOutputPages([{ extension: 'pdf', pageCount: 2, pageRange: '3' }], { duplexPadding: false }),
        { count: null, exact: false });
    assert.deepEqual(countOutputPages([], { duplexPadding: true }), { count: 0, exact: true });
});

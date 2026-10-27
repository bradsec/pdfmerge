import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const { needsDuplexPadding, formatPageNumber, getPageNumberPlacement, parsePageNumberStart } = await importApp('output-pages.js');

test('duplex pads odd non-final cards only', () => {
    assert.equal(needsDuplexPadding(3, false), true);
    assert.equal(needsDuplexPadding(2, false), false);
    assert.equal(needsDuplexPadding(3, true), false);
    const cardCounts = [2, 3, 1];
    const outputCount = cardCounts.reduce((total, count, index) =>
        total + count + Number(needsDuplexPadding(count, index === cardCounts.length - 1)), 0);
    assert.equal(outputCount, 7);
});

test('page number text uses requested start and total', () => {
    assert.equal(formatPageNumber(4, 9, 'plain'), '4');
    assert.equal(formatPageNumber(4, 9, 'page-of-total'), 'Page 4 of 9');
});

test('page number start must be a positive safe integer', () => {
    assert.equal(parsePageNumberStart(' 2 '), 2);
    for (const value of ['', '0', '-1', '1.5', '2x', '9007199254740993']) {
        assert.equal(parsePageNumberStart(value), null);
    }
});

test('page number coordinates stay in visible page across quarter turns', () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    assert.deepEqual(getPageNumberPlacement(box, 0, 'bottom-centre', 20, 10),
        { x: 300, y: 44, rotation: 0 });
    assert.deepEqual(getPageNumberPlacement(box, 90, 'bottom-right', 20, 10),
        { x: 586, y: 776, rotation: 90 });
    assert.deepEqual(getPageNumberPlacement(box, 180, 'top-right', 20, 10),
        { x: 54, y: 54, rotation: 180 });
    assert.deepEqual(getPageNumberPlacement(box, 270, 'bottom-right', 20, 10),
        { x: 34, y: 64, rotation: 270 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const { parseTextColor } = await importApp('utils.js');

test('page text colour converts valid hex to PDF RGB and defaults invalid values', () => {
    assert.deepEqual(parseTextColor('#ff8040'),
        { hex: '#ff8040', r: 1, g: 128 / 255, b: 64 / 255 });
    const fallback = { hex: '#6b7078', r: 107 / 255, g: 112 / 255, b: 120 / 255 };
    for (const value of [null, '', 'red', '#123', '#1234567', '#gg0000']) {
        assert.deepEqual(parseTextColor(value), fallback);
    }
    assert.deepEqual(parseTextColor('invalid', '#ffffff'),
        { hex: '#ffffff', r: 1, g: 1, b: 1 });
});

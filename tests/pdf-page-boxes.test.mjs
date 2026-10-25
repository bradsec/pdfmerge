import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizePageBoxes, resizePdfPageToOutputSize } = await importApp('pdf-processing.js');

test('normalizePageBoxes resets imported PDF page boxes to the final output size', () => {
    const calls = [];
    const page = {
        setMediaBox(x, y, width, height) {
            calls.push(['media', x, y, width, height]);
        },
        setCropBox(x, y, width, height) {
            calls.push(['crop', x, y, width, height]);
        },
        setBleedBox(x, y, width, height) {
            calls.push(['bleed', x, y, width, height]);
        },
        setTrimBox(x, y, width, height) {
            calls.push(['trim', x, y, width, height]);
        },
        setArtBox(x, y, width, height) {
            calls.push(['art', x, y, width, height]);
        }
    };

    normalizePageBoxes(page, 2383.94065, 3370.39885);

    assert.deepEqual(calls, [
        ['media', 0, 0, 2383.94065, 3370.39885],
        ['crop', 0, 0, 2383.94065, 3370.39885],
        ['bleed', 0, 0, 2383.94065, 3370.39885],
        ['trim', 0, 0, 2383.94065, 3370.39885],
        ['art', 0, 0, 2383.94065, 3370.39885]
    ]);
});

test('resizePdfPageToOutputSize rescales imported PDF content without using page.scale', () => {
    const calls = [];
    const page = {
        getSize() {
            return { width: 600, height: 700 };
        },
        getMediaBox() {
            return { x: 100, y: 200, width: 600, height: 700 };
        },
        setSize(width, height) {
            calls.push(['setSize', width, height]);
        },
        scaleContent(x, y) {
            calls.push(['scaleContent', x, y]);
        },
        translateContent(x, y) {
            calls.push(['translateContent', x, y]);
        },
        scale(x, y) {
            calls.push(['scale', x, y]);
        },
        setMediaBox(x, y, width, height) {
            calls.push(['media', x, y, width, height]);
        },
        setCropBox(x, y, width, height) {
            calls.push(['crop', x, y, width, height]);
        },
        setBleedBox(x, y, width, height) {
            calls.push(['bleed', x, y, width, height]);
        },
        setTrimBox(x, y, width, height) {
            calls.push(['trim', x, y, width, height]);
        },
        setArtBox(x, y, width, height) {
            calls.push(['art', x, y, width, height]);
        }
    };

    resizePdfPageToOutputSize(page, 595, 842);

    assert.equal(calls.some(([name]) => name === 'scale'), false);
    assert.deepEqual(calls.slice(0, 3), [
        ['setSize', 595, 842],
        ['scaleContent', 0.9916666666666667, 0.9916666666666667],
        ['translateContent', -99, -124]
    ]);
});

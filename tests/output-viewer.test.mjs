import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const { clampViewerZoom, cappedRenderScale, anchorScroll } = await importApp('output-viewer-math.js');

test('viewer zoom stays between fit and 400%', () => {
    assert.equal(clampViewerZoom(0.2), 1);
    assert.equal(clampViewerZoom(2.5), 2.5);
    assert.equal(clampViewerZoom(8), 4);
});

test('render scale respects device pixel cap without changing requested zoom', () => {
    assert.equal(cappedRenderScale(1, 4, 1000, 1000, 2), 2);
    assert.equal(cappedRenderScale(1, 2, 1000, 1000, 2), 2);
    assert.equal(cappedRenderScale(0.5, 2, 800, 600, 2), 1);
});

test('anchor scroll retains a point under the cursor after zoom', () => {
    assert.equal(anchorScroll(0.25, 2000, 300, 100), 300);
    assert.equal(anchorScroll(0.5, 1000, 250, 0), 250);
});

import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const {
    detectWatermarkImageKind,
    getImageWatermarkCentres,
    getRotatedImageOrigin,
    visibleToUserPoint
} = await importApp('watermark.js');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('detects PNG and JPEG by signature, not file name', () => {
    assert.equal(detectWatermarkImageKind(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])), 'png');
    assert.equal(detectWatermarkImageKind(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])), 'jpg');
    assert.equal(detectWatermarkImageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null);
    assert.equal(detectWatermarkImageKind(new Uint8Array([])), null);
});

test('places the image footprint inside the margin for each of the nine positions', () => {
    const at = position => getImageWatermarkCentres(600, 800, 100, 50, { position, margin: 20 })[0];
    assert.deepEqual(at('top-left'), { x: 70, y: 755 });
    assert.deepEqual(at('middle-centre'), { x: 300, y: 400 });
    assert.deepEqual(at('bottom-right'), { x: 530, y: 45 });
    assert.deepEqual(at('top-centre'), { x: 300, y: 755 });
    assert.deepEqual(at('middle-left'), { x: 70, y: 400 });
});

test('uses the rotated footprint at edge positions', () => {
    const [centre] = getImageWatermarkCentres(600, 800, 100, 50, { position: 'bottom-left', margin: 0, rotation: 90 });
    close(centre.x, 25);
    close(centre.y, 50);
});

test('tiling covers the whole visible page', () => {
    const centres = getImageWatermarkCentres(600, 800, 100, 100, { tiled: true });
    assert.ok(centres.length > 1);
    assert.ok(Math.max(...centres.map(c => c.x)) >= 600 - 140);
    assert.ok(Math.max(...centres.map(c => c.y)) >= 800 - 140);
});

test('maps displayed points to user space for each page rotation', () => {
    const box = { x: 0, y: 0, width: 600, height: 800 };
    assert.deepEqual(visibleToUserPoint(box, 0, 10, 20), { x: 10, y: 20 });
    assert.deepEqual(visibleToUserPoint(box, 90, 10, 20), { x: 580, y: 10 });
    assert.deepEqual(visibleToUserPoint(box, 180, 10, 20), { x: 590, y: 780 });
    assert.deepEqual(visibleToUserPoint(box, 270, 10, 20), { x: 20, y: 790 });
});

test('rotated image origin keeps the image centred on the requested point', () => {
    const origin = getRotatedImageOrigin(100, 100, 40, 20, 90);
    // At 90 degrees the image extends left (height) and up (width) from its origin.
    close(origin.x, 110);
    close(origin.y, 80);
    const flat = getRotatedImageOrigin(100, 100, 40, 20, 0);
    assert.deepEqual(flat, { x: 80, y: 90 });
});

import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { getPdfThumbnailPreviewState } = await importApp('thumbnail-orientation.js');

test('landscape PDF thumbnails keep a landscape shell without rotating content by default', () => {
    assert.deepEqual(getPdfThumbnailPreviewState('landscape', 0), {
        pageOrientation: 'landscape',
        shellRotation: 90,
        contentRotation: -90,
        isSideways: true
    });
});

test('PDF thumbnail rotation uses the explicit page rotation while keeping shell orientation in sync', () => {
    assert.deepEqual(getPdfThumbnailPreviewState('portrait', 90), {
        pageOrientation: 'landscape',
        shellRotation: 90,
        contentRotation: 0,
        isSideways: false
    });
    assert.deepEqual(getPdfThumbnailPreviewState('landscape', 90), {
        pageOrientation: 'portrait',
        shellRotation: 180,
        contentRotation: -90,
        isSideways: true
    });
    assert.deepEqual(getPdfThumbnailPreviewState('landscape', 0, 360), {
        pageOrientation: 'landscape',
        shellRotation: 450,
        contentRotation: -90,
        isSideways: true
    });
    assert.deepEqual(getPdfThumbnailPreviewState('landscape', 270, 270), {
        pageOrientation: 'portrait',
        shellRotation: 360,
        contentRotation: -90,
        isSideways: true
    });
});

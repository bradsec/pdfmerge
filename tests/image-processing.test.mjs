import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const {
    applyPixelBudgetToBounds,
    calculateImageProcessingBounds,
    getImageProcessingPixelBudget,
    getImageProcessingCapabilities
} = await importApp('image-processing.js');

test('worker image processing only enables when all required APIs exist', () => {
    assert.equal(
        getImageProcessingCapabilities({
            Worker: function Worker() {},
            OffscreenCanvas: function OffscreenCanvas() {},
            createImageBitmap: async () => {}
        }).canUseWorkerPipeline,
        true
    );

    assert.equal(
        getImageProcessingCapabilities({
            Worker: function Worker() {},
            OffscreenCanvas: undefined,
            createImageBitmap: async () => {}
        }).canUseWorkerPipeline,
        false
    );
});

test('image processing bounds map paper size points to target pixel dimensions', () => {
    assert.deepEqual(
        calculateImageProcessingBounds({
            pageWidthPoints: 595.2765,
            pageHeightPoints: 841.89105,
            dpi: 300,
            pointsPerMm: 2.83465
        }),
        {
            maxWidthPixels: 2480,
            maxHeightPixels: 3508
        }
    );
});

test('pixel budget preserves aspect ratio while reducing oversized raster bounds', () => {
    assert.deepEqual(
        applyPixelBudgetToBounds({
            maxWidthPixels: 9933,
            maxHeightPixels: 14043,
            maxCanvasPixels: 8_000_000
        }),
        {
            maxWidthPixels: 2379,
            maxHeightPixels: 3363
        }
    );
});

test('mobile-class environments get a more conservative image pixel budget', () => {
    assert.equal(
        getImageProcessingPixelBudget({
            navigator: {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
                deviceMemory: undefined,
                maxTouchPoints: 5
            }
        }),
        8_000_000
    );

    assert.equal(
        getImageProcessingPixelBudget({
            navigator: {
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
                deviceMemory: 16,
                maxTouchPoints: 0
            }
        }),
        16_000_000
    );
});

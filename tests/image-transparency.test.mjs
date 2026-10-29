import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const { resizeImageAndConvertToJPEG } = await importApp('image-processing.js');

test('JPEG conversion fills transparent image layouts with white before drawing', async () => {
    const original = {
        document: globalThis.document,
        Image: globalThis.Image,
        FileReader: globalThis.FileReader,
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL
    };
    const operations = [];
    globalThis.document = { createElement: () => {
        const canvas = { width: 1, height: 1, remove() {}, toBlob: callback => callback(new Blob()) };
        const ctx = { canvas, fillRect: () => operations.push(['fill', ctx.fillStyle]),
            drawImage: () => operations.push(['draw']) };
        canvas.getContext = () => ctx;
        return canvas;
    } };
    globalThis.Image = class { width = 100; height = 100; decode = async () => {}; };
    globalThis.FileReader = class {
        readAsDataURL() { this.result = 'data:image/jpeg;base64,'; this.onload(); }
    };
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    try {
        for (const imageLayout of ['default', 'cover', 'fit']) {
            operations.length = 0;
            await resizeImageAndConvertToJPEG({ file: new Blob(), imageLayout }, {
                config: { DPI: 72, POINTS_PER_MM: 2.83465, IMAGE_QUALITY: 0.9 },
                getSelectedPaperSize: () => [200, 200]
            });
            assert.deepEqual(operations, [['fill', '#ffffff'], ['draw']], imageLayout);
        }
    } finally {
        globalThis.document = original.document;
        globalThis.Image = original.Image;
        globalThis.FileReader = original.FileReader;
        URL.createObjectURL = original.createObjectURL;
        URL.revokeObjectURL = original.revokeObjectURL;
    }
});

test('worker JPEG conversion fills transparent image layouts with white before drawing', async () => {
    const operations = [];
    const responses = [];
    const worker = { postMessage: message => responses.push(message) };
    class OffscreenCanvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() {
            return { canvas: this, fillRect() { operations.push(['fill', this.fillStyle]); },
                drawImage() { operations.push(['draw']); } };
        }
        async convertToBlob() { return new Blob(); }
    }
    class FileReader {
        readAsDataURL() { this.result = 'data:image/jpeg;base64,'; this.onload(); }
    }
    runInNewContext(readFileSync(new URL('../js/image-processing.worker.js', import.meta.url), 'utf8'), {
        self: worker, Blob, OffscreenCanvas, FileReader,
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} })
    });
    for (const layout of ['default', 'cover', 'fit']) {
        operations.length = 0;
        await worker.onmessage({ data: { id: layout, buffer: new ArrayBuffer(0), type: 'image/png',
            payload: { layout, maxWidthPixels: 200, maxHeightPixels: 200, imageQuality: 0.9 } } });
        assert.equal(responses.at(-1).id, layout);
        assert.deepEqual(operations, [['fill', '#ffffff'], ['draw']], layout);
    }
});

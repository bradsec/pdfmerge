import { importApp } from './import-app.mjs';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const vendor = { exports: {} };
const loadVendor = runInThisContext(`(function (exports, module) { ${readFileSync(new URL('../js/vendor/pdf-lib.min.js', import.meta.url), 'utf8')} })`);
loadVendor(vendor.exports, vendor);
globalThis.PDFLib = vendor.exports;
globalThis.fontkit = {};
globalThis.document = { getElementById: id => ({ checked: false, value: id === 'paper-size-select' ? 'A4' : '1' }) };

const { buildOutputDocument } = await importApp('pdf-processing.js');

test('preview stops after two output pages while the full build keeps all pages', async () => {
    const files = Array.from({ length: 3 }, (_, index) => ({ type: 'blank', name: `Blank ${index + 1}` }));
    const preview = await buildOutputDocument({ files, maxPages: 2 });
    const full = await buildOutputDocument({ files });
    assert.equal(preview.pdfDoc.getPageCount(), 2);
    assert.deepEqual(preview.pageFiles, ['', '']);
    assert.equal(full.pdfDoc.getPageCount(), 3);
});

const { previewStatusText } = await importApp('output-preview.js');

test('preview status names the pages shown and the merged total when known', () => {
    assert.equal(previewStatusText(2, 7), 'Pages 1–2 of 7');
    assert.equal(previewStatusText(1, 1), 'Page 1 of 1');
    assert.equal(previewStatusText(2, null), 'Pages 1–2');
    assert.equal(previewStatusText(0, 5), '');
});

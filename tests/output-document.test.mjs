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

const { previewStatusText, clampPreviewPage, previewScale } = await importApp('output-preview.js');

test('preview status names the page shown and the merged total when known', () => {
    assert.equal(previewStatusText(3, 150), 'Page 3 of 150');
    assert.equal(previewStatusText(1, null), 'Page 1');
    assert.equal(previewStatusText(0, 5), '');
});

test('preview page stays within the document', () => {
    assert.equal(clampPreviewPage(0, 10), 1);
    assert.equal(clampPreviewPage(11, 10), 10);
    assert.equal(clampPreviewPage(4.7, 10), 4);
    assert.equal(clampPreviewPage(Number.NaN, 10), 1);
    assert.equal(clampPreviewPage(25, null), 25);
});

test('preview scale fits the paper long side, so orientation does not change scale', () => {
    assert.equal(previewScale(421, [595, 842]), 0.5);
    assert.equal(previewScale(421, [842, 595]), 0.5);
});

async function makePdfEntry(name, sizes) {
    const doc = await vendor.exports.PDFDocument.create();
    sizes.forEach(size => doc.addPage(size));
    const bytes = await doc.save();
    return { type: 'file', name, extension: 'pdf', pageCount: sizes.length,
        file: { arrayBuffer: async () => bytes.slice().buffer } };
}

const isLandscape = page => page.getWidth() > page.getHeight();

test('a page window builds the same pages the full build has at those positions', async () => {
    const portrait = [595, 842];
    const landscape = [842, 595];
    const pdf = await makePdfEntry('long.pdf', [portrait, landscape, portrait, landscape, portrait]);
    const files = [{ type: 'blank', name: 'Blank' }, pdf, { type: 'blank', name: 'Blank' }];
    const full = await buildOutputDocument({ files });
    assert.equal(full.pdfDoc.getPageCount(), 7);
    for (let index = 0; index < 7; index++) {
        const slice = await buildOutputDocument({ files, pageWindow: { from: index, to: index + 1 } });
        assert.equal(slice.pdfDoc.getPageCount(), 1, `page ${index + 1}`);
        assert.equal(slice.firstPageIndex, index);
        assert.equal(isLandscape(slice.pdfDoc.getPage(0)), isLandscape(full.pdfDoc.getPage(index)), `page ${index + 1}`);
        assert.deepEqual(slice.pageFiles, [full.pageFiles[index]]);
    }
});

test('a page window honours page ranges, including reordered and repeated pages', async () => {
    const pdf = await makePdfEntry('ranged.pdf', [[595, 842], [842, 595], [595, 842]]);
    pdf.pageRange = '2,1,2';
    const slice = await buildOutputDocument({ files: [pdf], pageWindow: { from: 2, to: 3 } });
    assert.equal(slice.pdfDoc.getPageCount(), 1);
    assert.ok(isLandscape(slice.pdfDoc.getPage(0)));
});

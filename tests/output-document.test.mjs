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
let removeMetadata = true;
const imageControls = new Map();
for (const side of ['top', 'right', 'bottom', 'left']) {
    imageControls.set(`image-margin-${side}`, { value: '19', setAttribute() {} });
    imageControls.set(`image-margin-${side}-error`, { id: `image-margin-${side}-error`, hidden: true });
}
imageControls.set('image-margin-preset', { value: 'default' });
globalThis.document = { getElementById: id => imageControls.get(id) ??
    ({ checked: id === 'remove-metadata' ? removeMetadata : false,
        value: id === 'paper-size-select' ? 'A4' : '1' }) };

const { buildOutputDocument, validateImageMargins } = await importApp('pdf-processing.js');

test('custom image margin validation shows inline errors and ignores unused custom values', () => {
    const preset = imageControls.get('image-margin-preset');
    const top = imageControls.get('image-margin-top');
    const error = imageControls.get('image-margin-top-error');
    preset.value = 'custom';
    top.value = '8.25';
    assert.equal(validateImageMargins(), false);
    assert.equal(error.hidden, false);
    top.value = '8.5';
    assert.equal(validateImageMargins(), true);
    assert.equal(error.hidden, true);
    top.value = 'invalid';
    preset.value = 'default';
    assert.equal(validateImageMargins(), true);
    assert.equal(error.hidden, true);
    top.value = '19';
});

test('remove metadata clears output Info and catalog Metadata when on, and preserves defaults when off', async () => {
    const keys = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];
    const create = vendor.exports.PDFDocument.create;
    let metadataRef;
    vendor.exports.PDFDocument.create = async (...args) => {
        const doc = await create(...args);
        metadataRef = doc.context.register(doc.context.stream('<xmp/>'));
        doc.catalog.set(vendor.exports.PDFName.of('Metadata'), metadataRef);
        return doc;
    };
    try {
        for (const enabled of [true, false]) {
            removeMetadata = enabled;
            const { pdfDoc } = await buildOutputDocument({ files: [{ type: 'blank', name: 'Blank' }] });
            assert.equal(pdfDoc.context.enumerateIndirectObjects().some(([ref]) => ref === metadataRef), !enabled);
            const bytes = await pdfDoc.save();
            const saved = await vendor.exports.PDFDocument.load(bytes, { updateMetadata: false });
            const info = saved.context.lookup(saved.context.trailerInfo.Info);
            for (const key of keys) {
                assert.equal(info.has(vendor.exports.PDFName.of(key)), !enabled &&
                    ['Creator', 'Producer', 'CreationDate', 'ModDate'].includes(key), `${key}, enabled=${enabled}`);
            }
            assert.equal(saved.catalog.has(vendor.exports.PDFName.of('Metadata')), !enabled);
        }
    } finally {
        vendor.exports.PDFDocument.create = create;
    }
});

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

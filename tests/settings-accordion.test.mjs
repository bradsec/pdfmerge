import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { readSectionOpen, writeSectionOpen, sectionStatus } = await importApp('settings-accordion.js');

test('accordion opens only sections saved as true', () => {
    const saved = new Map();
    const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    writeSectionOpen(storage, 'printing-section', true);
    assert.equal(readSectionOpen(storage, 'printing-section'), true);
    assert.equal(readSectionOpen(storage, 'page-numbers-section'), false);
    writeSectionOpen(storage, 'printing-section', false);
    assert.equal(saved.get('settings-open:printing-section'), 'false');
    assert.equal(readSectionOpen(storage, 'printing-section'), false);
    assert.equal(readSectionOpen({ getItem() { throw Error('unavailable'); } }, 'printing-section'), false);
});

test('section summaries reflect enabled controls', () => {
    const state = { paperSize: 'A4', imageMarginPreset: 'default', watermark: false,
        pageNumbers: true, position: 'Bottom centre', format: 'Page 1 of N',
        header: true, footer: true, duplex: true, removeMetadata: true, start: '3' };
    assert.equal(sectionStatus('paper-size-selection', state), 'A4');
    assert.equal(sectionStatus('margins-section', state), 'Default · 19 mm');
    assert.equal(sectionStatus('margins-section', { ...state, imageMarginPreset: 'custom' }), 'Custom');
    assert.equal(sectionStatus('watermark-details-toggle', state), 'Off');
    assert.equal(sectionStatus('page-numbers-section', state), 'On · Bottom centre · Page 1 of N');
    assert.equal(sectionStatus('header-footer-section', state), 'On · Header, Footer');
    assert.equal(sectionStatus('printing-section', state), 'Duplex on · starts at 3');
    assert.equal(sectionStatus('privacy-section', state), 'On');
    assert.equal(sectionStatus('privacy-section', { ...state, removeMetadata: false }), 'Off');
    assert.equal(sectionStatus('page-numbers-section', { ...state, pageNumbers: false }), 'Off');
});

test('opening a section closes the other open sections', async () => {
    const { sectionsToClose } = await importApp('settings-accordion.js');
    const sections = [
        { id: 'a', open: true },
        { id: 'b', open: false },
        { id: 'c', open: true }
    ];
    assert.deepEqual(sectionsToClose('b', sections), ['a', 'c']);
    assert.deepEqual(sectionsToClose('a', sections), ['c']);
});

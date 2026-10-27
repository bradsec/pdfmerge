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
    const state = { paperSize: 'A4', imageOptions: ['Details', 'Hash'], watermark: false,
        pageNumbers: true, position: 'Bottom centre', format: 'Page 1 of N',
        header: true, footer: true, duplex: true, start: '3' };
    assert.equal(sectionStatus('paper-size-selection', state), 'A4');
    assert.equal(sectionStatus('image-details-toggle', state), 'Details, Hash');
    assert.equal(sectionStatus('watermark-details-toggle', state), 'Off');
    assert.equal(sectionStatus('page-numbers-section', state), 'On · Bottom centre · Page 1 of N');
    assert.equal(sectionStatus('header-footer-section', state), 'On · Header, Footer');
    assert.equal(sectionStatus('printing-section', state), 'Duplex on · starts at 3');
    assert.equal(sectionStatus('page-numbers-section', { ...state, pageNumbers: false }), 'Off');
});

test('opening a section closes other open sections unless they are pinned', async () => {
    const { sectionsToClose } = await importApp('settings-accordion.js');
    const sections = [
        { id: 'a', open: true, pinned: false },
        { id: 'b', open: true, pinned: true },
        { id: 'c', open: true, pinned: false },
        { id: 'd', open: false, pinned: false }
    ];
    assert.deepEqual(sectionsToClose('c', sections), ['a']);
    assert.deepEqual(sectionsToClose('d', sections), ['a', 'c']);
    // A pinned section opening (or being restored on load) closes nothing.
    assert.deepEqual(sectionsToClose('b', sections), []);
});

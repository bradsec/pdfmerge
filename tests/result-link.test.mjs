import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

test('result URL stays live until the result link is cleared', async () => {
    const link = { isConnected: true, dataset: { blobUrl: 'blob:result' }, style: {},
        replaceChildren() { this.children = []; } };
    const oldDocument = globalThis.document;
    const oldRevoke = URL.revokeObjectURL;
    const revoked = [];
    globalThis.document = { getElementById: id => id === 'file-link' ? link : null };
    URL.revokeObjectURL = url => revoked.push(url);
    try {
        const { clearResultLink } = await importApp('file-handling.js');
        assert.equal(link.dataset.blobUrl, 'blob:result');
        assert.deepEqual(revoked, []);
        clearResultLink();
        clearResultLink();
        assert.deepEqual(revoked, ['blob:result']);
        assert.equal(link.style.display, 'none');
    } finally {
        globalThis.document = oldDocument;
        URL.revokeObjectURL = oldRevoke;
    }
});

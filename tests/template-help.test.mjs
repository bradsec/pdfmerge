import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { sampleTemplateOutput, insertAtCaret, TEMPLATE_PLACEHOLDERS, TEMPLATE_EXAMPLES } = await importApp('template-help.js');

const date = new Date(2026, 9, 27, 14, 5);

test('every documented placeholder and example renders', () => {
    for (const { token } of TEMPLATE_PLACEHOLDERS) assert.notEqual(sampleTemplateOutput(token, date), null, token);
    for (const example of TEMPLATE_EXAMPLES) assert.notEqual(sampleTemplateOutput(example, date), null, example);
});

test('samples show realistic output', () => {
    assert.equal(sampleTemplateOutput('Page {n} of {total}', date), 'Page 3 of 12');
    assert.equal(sampleTemplateOutput('{file} - page {n:3}', date), 'Contract - page 003');
    assert.equal(sampleTemplateOutput('{date:D MMM YYYY} {time:hh:mm A}', date), '27 Oct 2026 02:05 PM');
    assert.equal(sampleTemplateOutput('bad {x}', date), null);
});

test('inserts at the caret or replaces the selection', () => {
    assert.deepEqual(insertAtCaret('Page  of', 5, 5, '{n}'), { value: 'Page {n} of', caret: 8 });
    assert.deepEqual(insertAtCaret('Page X', 5, 6, '{n}'), { value: 'Page {n}', caret: 8 });
    assert.deepEqual(insertAtCaret('Page', null, null, ' {n}'), { value: 'Page {n}', caret: 8 });
});

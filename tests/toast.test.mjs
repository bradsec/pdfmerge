import test from 'node:test';
import assert from 'node:assert/strict';
import { toastDuration, isToastExpired } from '../js/toast.js';

test('toast timing gives errors time to read and respects explicit durations', () => {
    assert.equal(toastDuration('Saved.', 'success'), 5000);
    assert.equal(toastDuration('Could not save.', 'error'), 10000);
    assert.equal(toastDuration('x'.repeat(200), 'warning'), 12000);
    assert.equal(toastDuration('Skipped a file.', 'warning', 10000), 10000);
});

test('a returned tab removes a toast at its deadline', () => {
    assert.equal(isToastExpired(10000, 9999), false);
    assert.equal(isToastExpired(10000, 10000), true);
});

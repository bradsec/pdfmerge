import test from 'node:test';
import assert from 'node:assert/strict';
import { toastDuration, isToastExpired, showToast } from '../js/toast.js';

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

test('toast lifecycle: deadline, close, mouse pause, tab return, and visible limit', async () => {
    const listeners = new Map();
    class Element {
        constructor() { this.children = []; this.listeners = new Map(); this.classList = { add() {} }; }
        append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
        appendChild(child) { this.append(child); }
        remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
        setAttribute() {}
        addEventListener(type, fn) { this.listeners.set(type, fn); }
        dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
        matches() { return false; }
        contains(node) { return this.children.includes(node); }
        get firstElementChild() { return this.children[0]; }
    }
    const host = new Element();
    globalThis.document = {
        hidden: false, getElementById: () => host, createElement: () => new Element(),
        createElementNS: () => new Element(), addEventListener(type, fn) { listeners.set(type, fn); },
    };
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    showToast('deadline', { duration: 0 });
    await wait(280);
    assert.equal(host.children.length, 0);

    showToast('close', { duration: 1000 });
    host.firstElementChild.children[2].dispatch('click');
    await wait(280);
    assert.equal(host.children.length, 0);

    showToast('mouse', { duration: 20 });
    host.firstElementChild.dispatch('pointerenter', { pointerType: 'mouse' });
    await wait(50);
    assert.equal(host.children.length, 1);
    host.firstElementChild.dispatch('pointerleave', { pointerType: 'mouse' });
    await wait(280);
    assert.equal(host.children.length, 0);

    showToast('touch', { duration: 20 });
    host.firstElementChild.dispatch('pointerenter', { pointerType: 'touch' });
    await wait(280);
    assert.equal(host.children.length, 0);

    showToast('hidden tab', { duration: 20 });
    globalThis.document.hidden = true;
    await wait(40);
    globalThis.document.hidden = false;
    listeners.get('visibilitychange')();
    assert.equal(host.children.length, 0);

    for (let i = 0; i < 4; i++) showToast(`toast ${i}`, { duration: 1000 });
    assert.equal(host.children.length, 3);
    assert.equal(host.firstElementChild.children[1].textContent, 'toast 1');
    for (const item of [...host.children]) item.children[2].dispatch('click');
});

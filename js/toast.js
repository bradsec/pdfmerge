import { createIcon } from './icons.js?v=1.3.7';

const MAX_TOASTS = 3;
const ICONS = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
const active = new Set();
let listening = false;

export function toastDuration(message, type, duration) {
    if (Number.isFinite(duration) && duration >= 0) return duration;
    return Math.max(type === 'error' ? 10000 : 5000, message.length * 60);
}

export function isToastExpired(deadline, now = Date.now()) {
    return now >= deadline;
}

export function showToast(message, { type = 'info', duration } = {}) {
    if (typeof message !== 'string' || !message) return;
    if (!Object.hasOwn(ICONS, type)) type = 'info';

    const host = document.getElementById('toasts');
    if (!host) return;
    if (!listening) {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            for (const entry of active) {
                if (entry.closing || (!entry.paused && isToastExpired(entry.deadline))) entry.remove();
            }
        });
        listening = true;
    }

    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    const messageNode = document.createElement('p');
    messageNode.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.append(createIcon('x'));
    item.append(createIcon(ICONS[type]), messageNode, close);

    const entry = { item, deadline: 0, remaining: toastDuration(message, type, duration), timer: null,
        removalTimer: null, fallbackTimer: null, paused: false, closing: false, remove: null };
    entry.remove = () => {
        clearTimeout(entry.timer);
        clearTimeout(entry.removalTimer);
        clearTimeout(entry.fallbackTimer);
        active.delete(entry);
        item.remove();
    };
    const dismiss = () => {
        if (entry.closing) return;
        entry.closing = true;
        clearTimeout(entry.timer);
        item.classList.add('toast-exiting');
        entry.removalTimer = setTimeout(entry.remove, 220);
        entry.fallbackTimer = setTimeout(entry.remove, 1200);
    };
    const run = () => {
        entry.deadline = Date.now() + entry.remaining;
        entry.timer = setTimeout(dismiss, entry.remaining);
    };
    const pause = () => {
        if (entry.paused || entry.closing) return;
        entry.paused = true;
        entry.remaining = Math.max(0, entry.deadline - Date.now());
        clearTimeout(entry.timer);
    };
    const resume = () => {
        if (!entry.paused || entry.closing) return;
        entry.paused = false;
        if (entry.remaining === 0) dismiss();
        else run();
    };
    let hovered = false;
    item.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover)').matches) return;
        hovered = true;
        pause();
    });
    item.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse') return;
        hovered = false;
        if (!item.matches(':focus-within')) resume();
    });
    item.addEventListener('focusin', pause);
    item.addEventListener('focusout', event => {
        if (!item.contains(event.relatedTarget) && !hovered) resume();
    });
    close.addEventListener('click', dismiss);

    host.append(item);
    active.add(entry);
    while (host.children.length > MAX_TOASTS) {
        const oldest = [...active].find(toast => toast.item === host.firstElementChild);
        oldest.remove();
    }
    run();
}

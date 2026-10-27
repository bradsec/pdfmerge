import { createIcon } from './icons.js?v=1.3.9';

const STORAGE_PREFIX = 'settings-open:';
const PIN_PREFIX = 'settings-pinned:';

export function readSectionOpen(storage, id) {
    try { return storage.getItem(`${STORAGE_PREFIX}${id}`) === 'true'; }
    catch { return false; }
}

export function writeSectionOpen(storage, id, open) {
    storage.setItem(`${STORAGE_PREFIX}${id}`, String(open));
}

export function sectionStatus(id, state) {
    switch (id) {
    case 'paper-size-selection': return state.paperSize;
    case 'image-details-toggle': return state.imageOptions.length ? state.imageOptions.join(', ') : 'Off';
    case 'watermark-details-toggle': return state.watermark ? `On · ${state.watermarkType}` : 'Off';
    case 'page-numbers-section': return state.pageNumbers ? `On · ${state.position} · ${state.format}` : 'Off';
    case 'header-footer-section': {
        const lines = [state.header && 'Header', state.footer && 'Footer'].filter(Boolean);
        return lines.length ? `On · ${lines.join(', ')}` : 'Off';
    }
    case 'printing-section': return `Duplex ${state.duplex ? 'on' : 'off'} · starts at ${state.start}`;
    default: return '';
    }
}

export function readSectionPinned(storage, id) {
    try { return storage.getItem(`${PIN_PREFIX}${id}`) === 'true'; }
    catch { return false; }
}

/**
 * Sections to collapse when one opens: every other open section that is not
 * pinned. Pinned sections sit outside the one-at-a-time rule, so opening one
 * (including restoring it on load) closes nothing.
 * @param {string} openedId
 * @param {Array<{id: string, open: boolean, pinned: boolean}>} sections
 */
export function sectionsToClose(openedId, sections) {
    if (sections.find(section => section.id === openedId)?.pinned) return [];
    return sections.filter(section => section.id !== openedId && section.open && !section.pinned)
        .map(section => section.id);
}

function addPinButton(section, pinned, storage) {
    const content = section.querySelector(':scope > .settings-content');
    if (!content) return;
    const title = section.querySelector('.settings-title')?.textContent.trim() || 'section';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-pin';
    button.append(createIcon('pin'));
    const label = document.createElement('span');
    label.textContent = 'Keep open';
    button.append(label);
    const sync = () => {
        const isPinned = pinned.has(section.id);
        button.setAttribute('aria-pressed', String(isPinned));
        button.setAttribute('aria-label', `Keep ${title} open when other sections open`);
        button.title = isPinned ? 'Pinned: stays open when other sections open' : 'Pin to keep this section open';
    };
    button.addEventListener('click', () => {
        if (pinned.has(section.id)) pinned.delete(section.id);
        else pinned.add(section.id);
        try { storage.setItem(`${PIN_PREFIX}${section.id}`, String(pinned.has(section.id))); }
        catch (error) { console.warn('Failed to save pinned section:', error); }
        sync();
    });
    sync();
    content.prepend(button);
}

export function openSettingFor(input) {
    const section = input.closest('.settings-section');
    if (section) section.open = true;
}

export function initializeSettingsAccordion(storage = localStorage) {
    const accordion = document.querySelector('.settings-accordion');
    const value = id => document.getElementById(id);
    const update = () => {
        const state = {
            paperSize: value('paper-size-select').value,
            imageOptions: [
                ['print-image-details', 'Details'],
                ['print-image-page-numbers', 'Number'],
                ['print-image-hash', 'Hash']
            ].filter(([id]) => value(id).checked).map(([, label]) => label),
            watermark: value('add-watermark').checked,
            watermarkType: value('watermark-type')?.value === 'image' ? 'Image' : 'Text',
            pageNumbers: value('add-page-numbers').checked,
            position: value('page-number-position').selectedOptions[0].textContent,
            format: value('page-number-format').value === 'custom'
                ? value('page-number-template').value || 'Custom'
                : value('page-number-format').selectedOptions[0].textContent,
            header: value('add-header-text').checked,
            footer: value('add-footer-text').checked,
            duplex: value('duplex-padding').checked,
            start: value('page-number-start').value || '?'
        };
        accordion.querySelectorAll('.settings-section').forEach(section => {
            section.querySelector('.settings-status').textContent = sectionStatus(section.id, state);
        });
    };
    const sections = [...accordion.querySelectorAll('.settings-section')];
    const pinned = new Set(sections.filter(section => readSectionPinned(storage, section.id)).map(section => section.id));
    let restoredUnpinned = false;
    sections.forEach(section => {
        // Restore pinned sections plus at most one other, matching the
        // one-open-at-a-time rule.
        const open = readSectionOpen(storage, section.id) && (pinned.has(section.id) || !restoredUnpinned);
        if (open && !pinned.has(section.id)) restoredUnpinned = true;
        section.open = open;
        addPinButton(section, pinned, storage);
        section.addEventListener('toggle', () => {
            try { writeSectionOpen(storage, section.id, section.open); }
            catch (error) { console.warn('Failed to save settings section state:', error); }
            if (!section.open) return;
            const states = sections.map(other => ({ id: other.id, open: other.open, pinned: pinned.has(other.id) }));
            for (const id of sectionsToClose(section.id, states)) document.getElementById(id).open = false;
        });
    });
    accordion.addEventListener('input', update);
    accordion.addEventListener('change', update);
    update();
}

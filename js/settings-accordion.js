const STORAGE_PREFIX = 'settings-open:';

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

/**
 * Sections to collapse when one opens: every other open section.
 * @param {string} openedId
 * @param {Array<{id: string, open: boolean}>} sections
 */
export function sectionsToClose(openedId, sections) {
    return sections.filter(section => section.id !== openedId && section.open).map(section => section.id);
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
    let restoredOpen = false;
    sections.forEach(section => {
        // One section open at a time, including when restoring from storage.
        const open = !restoredOpen && readSectionOpen(storage, section.id);
        if (open) restoredOpen = true;
        section.open = open;
        section.addEventListener('toggle', () => {
            try { writeSectionOpen(storage, section.id, section.open); }
            catch (error) { console.warn('Failed to save settings section state:', error); }
            if (!section.open) return;
            const states = sections.map(other => ({ id: other.id, open: other.open }));
            for (const id of sectionsToClose(section.id, states)) document.getElementById(id).open = false;
        });
    });
    accordion.addEventListener('input', update);
    accordion.addEventListener('change', update);
    update();
}

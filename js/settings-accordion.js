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
    accordion.querySelectorAll('.settings-section').forEach(section => {
        section.open = readSectionOpen(storage, section.id);
        section.addEventListener('toggle', () => {
            try { writeSectionOpen(storage, section.id, section.open); }
            catch (error) { console.warn('Failed to save settings section state:', error); }
        });
    });
    accordion.addEventListener('input', update);
    accordion.addEventListener('change', update);
    update();
}

/**
 * @fileoverview Flags output settings that differ from their defaults (most
 * often preferences saved on an earlier visit) and restores the defaults.
 * Each control's own input/change listeners update dependent UI, the preview,
 * and the saved preferences, so no listener logic is duplicated here.
 */

import { getDefaultPaperSizeValue } from './paper-size.js?v=1.3.19';

/**
 * Controls built from another control (range number boxes, segmented radios)
 * follow their source control, so only source controls are reset.
 */
function isSourceControl(field) {
    return !field.classList.contains('range-number') && !field.closest('.segmented-control');
}

function restoreDefault(field) {
    if (field.type === 'file') {
        field.value = '';
    } else if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = field.defaultChecked;
    } else if (field.tagName === 'SELECT') {
        for (const option of field.options) option.selected = option.defaultSelected;
    } else {
        field.value = field.defaultValue;
    }
    // Validation shows errors only after the user has typed or left a field.
    delete field.dataset.touched;
    delete field.dataset.blurred;
}

function isDefault(field) {
    if (field.type === 'file') return true; // Watermark images are never saved.
    if (field.type === 'checkbox' || field.type === 'radio') return field.checked === field.defaultChecked;
    if (field.id === 'paper-size-select') return field.value === getDefaultPaperSizeValue();
    if (field.tagName === 'SELECT') {
        const fallback = [...field.options].find(option => option.defaultSelected) ?? field.options[0];
        return field.value === (fallback?.value ?? '');
    }
    // Range inputs normalise "1.0" to "1", so compare numbers as numbers.
    if (field.type === 'range' || field.type === 'number') return Number(field.value) === Number(field.defaultValue);
    return field.value === field.defaultValue;
}

function sourceControls(root) {
    return [...root.querySelectorAll('input, select, textarea')].filter(isSourceControl);
}

/** Section titles, in page order, that hold at least one changed setting. */
export function changedSettingsSections(root) {
    const titles = [];
    for (const section of root.querySelectorAll('details.settings-section')) {
        if (sourceControls(section).some(field => !isDefault(field))) {
            titles.push(section.querySelector('.settings-title')?.textContent.trim() ?? '');
        }
    }
    return titles.filter(Boolean);
}

export function initializeSettingsNotice(root = document.querySelector('.settings-accordion')) {
    const notice = document.getElementById('settings-notice');
    const sections = document.getElementById('settings-notice-sections');
    if (!root || !notice || !sections) return;
    const update = () => {
        const changed = changedSettingsSections(root);
        sections.textContent = changed.join(', ');
        notice.hidden = changed.length === 0;
    };
    root.addEventListener('input', update);
    root.addEventListener('change', update);
    update();
}

export function resetSettings(root = document.querySelector('.settings-accordion')) {
    if (!root) return;
    const fields = sourceControls(root);
    fields.forEach(restoreDefault);
    const paperSize = root.querySelector('#paper-size-select');
    if (paperSize) paperSize.value = getDefaultPaperSizeValue();
    // Fire after every value is restored so cross-field checks see the final state.
    for (const field of fields) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

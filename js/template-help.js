/**
 * @fileoverview Inline guide for page number, header and footer templates.
 * One definition renders beside each template input; entries insert into it.
 */

import { formatPageNumber, parsePageNumberTemplate } from './output-pages.js?v=1.3.15';

const SAMPLE = { number: 3, total: 12, file: 'Contract' };

export const TEMPLATE_PLACEHOLDERS = [
    { token: '{n}', description: 'Page number, counted from "Numbering starts at"' },
    { token: '{n:3}', description: 'Page number padded to 3 digits (widths 1 to 6)' },
    { token: '{total}', description: 'Total pages in the merged PDF' },
    { token: '{file}', description: 'Source file name without its extension' },
    { token: '{date}', description: 'Date the merge started (YYYY-MM-DD)' },
    { token: '{date:D MMM YYYY}', description: 'Date in your own format (tokens below)' },
    { token: '{time}', description: 'Time the merge started (HH:mm)' },
    { token: '{time:hh:mm A}', description: '12-hour time with AM or PM' }
];

export const DATE_TOKENS = [
    ['YYYY / YY', 'year'], ['MMMM / MMM', 'month name'], ['MM / M', 'month number'],
    ['DD / D', 'day'], ['dddd / ddd', 'weekday'], ['HH / H', '24-hour'],
    ['hh / h', '12-hour'], ['mm', 'minutes'], ['ss', 'seconds'], ['A', 'AM or PM']
];

export const TEMPLATE_EXAMPLES = [
    'Page {n} of {total}',
    '{file} - page {n}',
    'CONFIDENTIAL',
    'Revised {date:D MMM YYYY}',
    '{file} {date:DD/MM/YYYY} {time:HH:mm}',
    'Exhibit {n:3}'
];

/**
 * Renders a template with sample values, or null when it is not valid.
 */
export function sampleTemplateOutput(template, date = new Date()) {
    const { tokens } = parsePageNumberTemplate(template, { requireNumber: false });
    return tokens ? formatPageNumber(SAMPLE.number, SAMPLE.total, tokens, SAMPLE.file, date) : null;
}

/**
 * Inserts text at the caret, or replaces the selection, and returns the new
 * value and caret position.
 */
export function insertAtCaret(value, start, end, text) {
    const from = Number.isInteger(start) ? start : value.length;
    const to = Number.isInteger(end) ? end : from;
    return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
}

function setTemplateValue(input, value, caret) {
    input.value = value.slice(0, input.maxLength > 0 ? input.maxLength : value.length);
    const position = Math.min(caret, input.value.length);
    input.setSelectionRange(position, position);
    input.dataset.touched = 'true';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function createButton(className, text, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    return button;
}

let helpDialog = null;
let helpTarget = null;

function buildHelpDialog() {
    const now = new Date();
    const dialog = document.createElement('dialog');
    dialog.className = 'template-help-dialog';
    dialog.setAttribute('aria-labelledby', 'template-help-title');

    const header = document.createElement('div');
    header.className = 'template-help-header';
    const title = document.createElement('h2');
    title.id = 'template-help-title';
    title.textContent = 'Template help';
    const close = createButton('template-help-close', '×', 'Close template help');
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);
    dialog.append(header);

    const body = document.createElement('div');
    body.className = 'template-help-body';
    const intro = document.createElement('p');
    intro.className = 'template-help-intro';
    intro.textContent = 'Type any text and add placeholders in braces. Select one to insert it at the cursor. '
        + `Samples use page ${SAMPLE.number} of ${SAMPLE.total} from "${SAMPLE.file}.pdf".`;
    body.append(intro);

    const placeholders = document.createElement('ul');
    placeholders.className = 'template-help-list';
    for (const { token, description } of TEMPLATE_PLACEHOLDERS) {
        const item = document.createElement('li');
        const button = createButton('template-help-token', token, `Insert ${token}: ${description}`);
        button.addEventListener('click', () => {
            if (!helpTarget) return;
            const next = insertAtCaret(helpTarget.value, helpTarget.selectionStart, helpTarget.selectionEnd, token);
            setTemplateValue(helpTarget, next.value, next.caret);
        });
        const text = document.createElement('span');
        text.textContent = `${description}. Shows "${sampleTemplateOutput(token, now)}"`;
        item.append(button, text);
        placeholders.append(item);
    }
    body.append(placeholders);

    const dateHeading = document.createElement('h3');
    dateHeading.className = 'template-help-heading';
    dateHeading.textContent = 'Date and time formats';
    const dateNote = document.createElement('p');
    dateNote.className = 'template-help-intro';
    dateNote.textContent = 'Put these after the colon, as in {date:DD/MM/YYYY}. Wrap literal letters in [ ], as in {date:[Day] D}.';
    const dateList = document.createElement('ul');
    dateList.className = 'template-help-dates';
    for (const [token, meaning] of DATE_TOKENS) {
        const item = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = token;
        item.append(code, ` ${meaning}`);
        dateList.append(item);
    }
    body.append(dateHeading, dateNote, dateList);

    const examplesHeading = document.createElement('h3');
    examplesHeading.className = 'template-help-heading';
    examplesHeading.textContent = 'Examples';
    const examples = document.createElement('ul');
    examples.className = 'template-help-list';
    for (const example of TEMPLATE_EXAMPLES) {
        const item = document.createElement('li');
        item.dataset.needsNumber = String(Boolean(parsePageNumberTemplate(example).error));
        const button = createButton('template-help-token', example, `Use template ${example}`);
        button.addEventListener('click', () => {
            if (helpTarget) setTemplateValue(helpTarget, example, example.length);
        });
        const text = document.createElement('span');
        text.textContent = `Shows "${sampleTemplateOutput(example, now)}"`;
        item.append(button, text);
        examples.append(item);
    }
    body.append(examplesHeading, examples);

    const braces = document.createElement('p');
    braces.className = 'template-help-intro';
    braces.textContent = 'Type {{ or }} for a literal brace. Page number templates must include {n}.';
    body.append(braces);
    dialog.append(body);

    // Light dismiss: a click on the backdrop lands on the dialog element itself.
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => helpTarget?.focus());
    document.body.append(dialog);
    return dialog;
}

function openHelp(input) {
    helpDialog ??= buildHelpDialog();
    helpTarget = input;
    // Examples without {n} are not valid page number templates.
    const pageNumber = input.id === 'page-number-template';
    helpDialog.querySelectorAll('[data-needs-number]').forEach(item => {
        item.hidden = pageNumber && item.dataset.needsNumber === 'true';
    });
    helpDialog.showModal();
}

function renderHelp(container, input) {
    const button = createButton('template-help-open', 'Template help', `Template help for ${input.labels?.[0]?.textContent || 'this template'}`);
    button.addEventListener('click', () => openHelp(input));
    container.replaceChildren(button);
}

export function initializeTemplateHelp() {
    document.querySelectorAll('.template-help[data-template-for]').forEach(container => {
        const input = document.getElementById(container.dataset.templateFor);
        if (input) renderHelp(container, input);
    });
}

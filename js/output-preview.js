/**
 * @fileoverview Live preview of the first output pages. It builds them with the
 * same buildOutputDocument path as the merge, so the preview cannot drift from
 * the real output.
 */

import { buildOutputDocument, getOutputSettingsProblem, isDuplexPaddingEnabled } from './pdf-processing.js?v=1.3.6';
import { renderOutputPages } from './pdf-thumbnail.js?v=1.3.6';
import { countOutputPages } from './output-count.js?v=1.3.6';
import { selectedFiles } from './file-handling.js?v=1.3.6';

const PREVIEW_PAGES = 2;
const DEBOUNCE_MS = 300;
const DESKTOP_QUERY = '(min-width: 1024px)';

let timer = null;
let controller = null;
let generation = 0;

export function previewStatusText(shown, total) {
    if (!shown) return '';
    const range = shown === 1 ? 'Page 1' : `Pages 1–${shown}`;
    return total ? `${range} of ${total}` : range;
}

export function initializeOutputPreview() {
    const aside = document.getElementById('output-preview');
    const panel = document.getElementById('output-preview-panel');
    const surface = document.getElementById('tool-surface');
    const list = document.getElementById('selected-files-list');
    if (!aside || !panel || !surface || !list) return;

    aside.hidden = false;
    panel.open = window.matchMedia(DESKTOP_QUERY).matches;

    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(renderPreview, DEBOUNCE_MS);
    };
    // Settings, page ranges and image layouts all bubble input/change events;
    // card buttons (rotate, delete) are clicks; add/remove/reorder/sort change
    // the card list itself.
    surface.addEventListener('input', schedule);
    surface.addEventListener('change', schedule);
    list.addEventListener('click', schedule);
    new MutationObserver(schedule).observe(list, { childList: true });
    // A merge holds the surface busy; refresh once it finishes.
    new MutationObserver(schedule).observe(surface, { attributes: true, attributeFilter: ['aria-busy'] });
    panel.addEventListener('toggle', () => { if (panel.open) schedule(); });
    schedule();
}

async function renderPreview() {
    const aside = document.getElementById('output-preview');
    const panel = document.getElementById('output-preview-panel');
    const pages = document.getElementById('output-preview-pages');
    const note = document.getElementById('output-preview-note');
    const status = panel.querySelector('.settings-status');
    const layout = aside.closest('.settings-layout');

    if (!panel.open || layout?.hidden) return;
    if (document.getElementById('tool-surface').getAttribute('aria-busy') === 'true') return;

    const setNote = (text) => {
        note.textContent = text;
        note.hidden = !text;
    };

    const problem = getOutputSettingsProblem();
    if (problem) {
        // Keep the last good render visible but mark it out of date.
        aside.classList.add('is-stale');
        setNote(problem === 'watermark image'
            ? 'Choose a watermark image to update the preview.'
            : 'Fix the highlighted settings to update the preview.');
        return;
    }

    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    const run = ++generation;
    aside.setAttribute('aria-busy', 'true');

    try {
        const counted = countOutputPages(selectedFiles, { duplexPadding: isDuplexPaddingEnabled() });
        const result = await buildOutputDocument({
            maxPages: PREVIEW_PAGES, signal, preview: true,
            totalPages: counted.exact ? counted.count : undefined
        });
        const bytes = await result.pdfDoc.save();
        if (signal.aborted || run !== generation) return;

        const width = Math.max(160, pages.clientWidth || 300);
        const canvases = await renderOutputPages(bytes, width, signal);
        if (run !== generation) return;

        pages.replaceChildren(...canvases.map((canvas, index) => {
            const figure = document.createElement('figure');
            figure.className = 'output-preview-page';
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Preview of output page ${index + 1}`);
            const caption = document.createElement('figcaption');
            caption.textContent = `Page ${index + 1}`;
            figure.append(canvas, caption);
            return figure;
        }));

        status.textContent = previewStatusText(canvases.length, counted.exact ? counted.count : null);
        aside.classList.remove('is-stale');
        if (result.unsupportedTemplate) {
            setNote(`The ${result.unsupportedTemplate} template contains characters Roboto cannot draw.`);
        } else if (!counted.exact) {
            setNote('Total is approximate until every file has loaded.');
        } else {
            setNote('');
        }
    } catch (error) {
        if (error?.name === 'AbortError' || signal.aborted) return;
        console.error('Preview failed:', error);
        aside.classList.add('is-stale');
        setNote('Preview unavailable for the current files.');
    } finally {
        if (run === generation) aside.removeAttribute('aria-busy');
    }
}

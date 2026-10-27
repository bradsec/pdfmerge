/**
 * @fileoverview Live preview of the compiled document, one page at a time.
 * Each page is built with the same buildOutputDocument path as the merge, so
 * the preview is the real output; only the viewed page is built.
 */

import { buildOutputDocument, getOutputSettingsProblem, isDuplexPaddingEnabled } from './pdf-processing.js?v=1.3.9';
import { renderOutputPages } from './pdf-thumbnail.js?v=1.3.9';
import { countOutputPages } from './output-count.js?v=1.3.9';
import { getSelectedPaperSizePoints } from './paper-size.js?v=1.3.9';
import { selectedFiles } from './file-handling.js?v=1.3.9';

const DEBOUNCE_MS = 300;
const DESKTOP_QUERY = '(min-width: 1024px)';

let timer = null;
let controller = null;
let generation = 0;
let currentPage = 1;
let knownTotal = null;

export function previewStatusText(page, total) {
    if (!page) return '';
    return total ? `Page ${page} of ${total}` : `Page ${page}`;
}

/**
 * Keeps the requested page inside the document.
 * @param {number} page - requested 1-based page
 * @param {number|null} total - known page total, or null if not known yet
 */
export function clampPreviewPage(page, total) {
    const whole = Number.isFinite(page) ? Math.trunc(page) : 1;
    return Math.max(1, total ? Math.min(whole, total) : whole);
}

/**
 * One scale for every page: the paper's long side fits the frame, so portrait
 * and landscape pages keep their true relative size as the user pages through.
 */
export function previewScale(frameWidth, paperPoints) {
    return frameWidth / Math.max(...paperPoints);
}

function elements() {
    return {
        aside: document.getElementById('output-preview'),
        panel: document.getElementById('output-preview-panel'),
        frame: document.getElementById('output-preview-pages'),
        note: document.getElementById('output-preview-note'),
        prev: document.getElementById('output-preview-prev'),
        next: document.getElementById('output-preview-next'),
        input: document.getElementById('output-preview-page'),
        total: document.getElementById('output-preview-total')
    };
}

function goToPage(page) {
    const target = clampPreviewPage(page, knownTotal);
    if (target === currentPage) {
        updateNav();
        return;
    }
    currentPage = target;
    updateNav();
    schedule(0);
}

function updateNav() {
    const { prev, next, input, total, panel } = elements();
    input.value = String(currentPage);
    input.max = knownTotal ? String(knownTotal) : '';
    total.textContent = knownTotal ? `of ${knownTotal}` : '';
    prev.disabled = currentPage <= 1;
    next.disabled = knownTotal !== null && currentPage >= knownTotal;
    panel.querySelector('.settings-status').textContent = previewStatusText(currentPage, knownTotal);
}

export function filesSummaryText(fileCount, pageCount) {
    if (!fileCount) return '';
    const files = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
    return pageCount ? `${files}, ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : files;
}

function updateFilesSummary() {
    const summary = document.getElementById('files-summary');
    if (!summary) return;
    const counted = countOutputPages(selectedFiles, { duplexPadding: isDuplexPaddingEnabled() });
    summary.textContent = filesSummaryText(selectedFiles.length, counted.exact ? counted.count : null);
}

function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        updateFilesSummary();
        renderPreview();
    }, delay);
}

export function initializeOutputPreview() {
    const { aside, panel, frame, prev, next, input } = elements();
    const surface = document.getElementById('tool-surface');
    const list = document.getElementById('selected-files-list');
    const layout = aside?.closest('.settings-layout');
    if (!aside || !panel || !surface || !list) return;

    aside.hidden = false;
    panel.open = window.matchMedia(DESKTOP_QUERY).matches;

    const refresh = () => schedule();
    // Settings, page ranges and image layouts bubble input/change events; card
    // buttons are clicks. The subtree observer also catches cards finishing
    // loading (page counts, thumbnails) after they were added.
    surface.addEventListener('input', event => { if (!aside.contains(event.target)) refresh(); });
    surface.addEventListener('change', event => { if (!aside.contains(event.target)) refresh(); });
    list.addEventListener('click', refresh);
    new MutationObserver(refresh).observe(list, { childList: true, subtree: true });
    // The settings area appears once files exist; a merge holds the surface busy.
    if (layout) new MutationObserver(refresh).observe(layout, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(refresh).observe(surface, { attributes: true, attributeFilter: ['aria-busy'] });
    panel.addEventListener('toggle', () => { if (panel.open) schedule(0); });

    prev.addEventListener('click', () => goToPage(currentPage - 1));
    next.addEventListener('click', () => goToPage(currentPage + 1));
    input.addEventListener('change', () => goToPage(Number(input.value)));
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            goToPage(Number(input.value));
        }
    });
    frame.addEventListener('keydown', event => {
        const moves = { ArrowLeft: -1, ArrowUp: -1, PageUp: -1, ArrowRight: 1, ArrowDown: 1, PageDown: 1 };
        if (event.key in moves) {
            event.preventDefault();
            goToPage(currentPage + moves[event.key]);
        } else if (event.key === 'Home') {
            event.preventDefault();
            goToPage(1);
        } else if (event.key === 'End' && knownTotal) {
            event.preventDefault();
            goToPage(knownTotal);
        }
    });

    updateNav();
    schedule();
}

async function renderPreview() {
    const { aside, panel, frame, note } = elements();
    const layout = aside.closest('.settings-layout');

    if (!panel.open || layout?.hidden) return;
    if (document.getElementById('tool-surface').getAttribute('aria-busy') === 'true') return;

    const setNote = text => {
        note.textContent = text;
        note.hidden = !text;
    };

    const counted = countOutputPages(selectedFiles, { duplexPadding: isDuplexPaddingEnabled() });
    knownTotal = counted.exact ? Math.max(counted.count, 1) : null;
    currentPage = clampPreviewPage(currentPage, knownTotal);
    updateNav();

    // An incomplete watermark or text setting must not hide the document:
    // show plain pages and say what is left out.
    const problem = getOutputSettingsProblem();
    const problemNote = {
        '': '',
        'watermark image': 'Watermark not shown: choose a watermark image, or switch the watermark type to Text.',
        'page range': 'A file has an invalid page range. Fix it to preview that file\'s pages.'
    }[problem ?? ''] ?? 'Watermark, page numbers and header or footer text are not shown until the highlighted settings are fixed.';

    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    const run = ++generation;
    const pageIndex = currentPage - 1;
    aside.setAttribute('aria-busy', 'true');

    try {
        const result = await buildOutputDocument({
            signal, preview: true, decorate: !problem || problem === 'page range',
            pageWindow: { from: pageIndex, to: pageIndex + 1 },
            totalPages: counted.exact ? counted.count : undefined
        });
        if (signal.aborted || run !== generation) return;

        // Without an exact plan the build starts at page 1, so keep only the last page.
        const built = result.pdfDoc.getPageCount();
        if (!built) {
            if (currentPage > 1 && !counted.exact) {
                // Paged past the end while the total was still unknown.
                knownTotal = currentPage - 1;
                currentPage = knownTotal;
                updateNav();
                schedule(0);
            }
            return;
        }
        for (let index = built - 2; index >= 0; index--) result.pdfDoc.removePage(index);
        const bytes = await result.pdfDoc.save();
        if (signal.aborted || run !== generation) return;

        const scale = previewScale(Math.max(160, frame.clientWidth || 300), getSelectedPaperSizePoints());
        const [canvas] = await renderOutputPages(bytes, { scale }, signal);
        if (run !== generation) return;

        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label',
            `Preview of output page ${currentPage}${knownTotal ? ` of ${knownTotal}` : ''}`);
        const figure = document.createElement('figure');
        figure.className = 'output-preview-page';
        figure.append(canvas);
        frame.replaceChildren(figure);

        aside.classList.remove('is-stale');
        if (problemNote) {
            setNote(problemNote);
        } else if (result.unsupportedTemplate) {
            setNote(`The ${result.unsupportedTemplate} template contains characters Roboto cannot draw.`);
        } else if (result.failedFiles.length) {
            setNote(`Could not read: ${result.failedFiles.join(', ')}.`);
        } else if (!counted.exact) {
            setNote('Page total appears once every file has loaded.');
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

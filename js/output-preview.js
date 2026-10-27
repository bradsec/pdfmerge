/**
 * @fileoverview Live preview of the compiled document, one page at a time.
 * Each page is built with the same buildOutputDocument path as the merge, so
 * the preview is the real output; only the viewed page is built.
 */

import { buildOutputDocument, getOutputSettingsProblem, isDuplexPaddingEnabled } from './pdf-processing.js?v=1.3.16';
import { renderOutputPages } from './pdf-thumbnail.js?v=1.3.16';
import { countOutputPages } from './output-count.js?v=1.3.16';
import { getSelectedPaperSizePoints } from './paper-size.js?v=1.3.16';
import { selectedFiles } from './file-handling.js?v=1.3.16';
import { clampViewerZoom, cappedRenderScale, anchorScroll } from './output-viewer-math.js?v=1.3.16';

const DEBOUNCE_MS = 300;
const DESKTOP_QUERY = '(min-width: 1024px)';

let timer = null;
let controller = null;
let generation = 0;
let currentPage = 1;
let knownTotal = null;
let viewerController = null;
let viewerGeneration = 0;
let viewerZoom = 1;
let viewerCanvas = null;
let viewerOpener = null;

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

function viewerElements() {
    return {
        dialog: document.getElementById('output-viewer'),
        scroll: document.getElementById('output-viewer-scroll'),
        page: document.getElementById('output-viewer-page'),
        status: document.getElementById('output-viewer-status'),
        readout: document.getElementById('output-viewer-zoom-readout'),
        prev: document.getElementById('output-viewer-prev'),
        next: document.getElementById('output-viewer-next')
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
    if (viewerElements().dialog?.open) renderViewer();
    else schedule(0);
}

function updateNav() {
    const { prev, next, input, total, panel } = elements();
    input.value = String(currentPage);
    input.max = knownTotal ? String(knownTotal) : '';
    total.textContent = knownTotal ? `of ${knownTotal}` : '';
    prev.disabled = currentPage <= 1;
    next.disabled = knownTotal !== null && currentPage >= knownTotal;
    panel.querySelector('.settings-status').textContent = previewStatusText(currentPage, knownTotal);
    const viewer = viewerElements();
    if (viewer.prev) viewer.prev.disabled = currentPage <= 1;
    if (viewer.next) viewer.next.disabled = knownTotal !== null && currentPage >= knownTotal;
    const viewerPageCount = document.getElementById('output-viewer-page-count');
    if (viewerPageCount) {
        viewerPageCount.textContent = knownTotal ? `${currentPage}/${knownTotal}` : String(currentPage);
        viewerPageCount.setAttribute('aria-label', previewStatusText(currentPage, knownTotal));
    }
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

    initializeViewer(frame);

    updateNav();
    schedule();
}

async function buildPreviewPage(page, counted, problem, sizing, signal) {
    const pageIndex = page - 1;
    const result = await buildOutputDocument({
        signal, preview: true, decorate: !problem || problem === 'page range',
        pageWindow: { from: pageIndex, to: pageIndex + 1 },
        totalPages: counted.exact ? counted.count : undefined
    });
    if (signal.aborted) return null;
    const built = result.pdfDoc.getPageCount();
    if (!built) return { result, canvas: null };
    for (let index = built - 2; index >= 0; index--) result.pdfDoc.removePage(index);
    const outputPage = result.pdfDoc.getPage(0);
    const rotated = outputPage.getRotation().angle % 180 !== 0;
    const width = rotated ? outputPage.getHeight() : outputPage.getWidth();
    const height = rotated ? outputPage.getWidth() : outputPage.getHeight();
    const { renderScale, cssScale } = sizing(width, height);
    const bytes = await result.pdfDoc.save();
    if (signal.aborted) return null;
    const [canvas] = await renderOutputPages(bytes, { scale: renderScale }, signal);
    if (signal.aborted) return null;
    if (cssScale !== renderScale) {
        canvas.style.width = `${width * cssScale}px`;
        canvas.style.height = `${height * cssScale}px`;
    }
    return { result, canvas };
}

async function renderPreview() {
    const { aside, panel, frame, note } = elements();
    const layout = aside.closest('.settings-layout');

    if (viewerElements().dialog?.open) return;
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
    aside.setAttribute('aria-busy', 'true');

    try {
        const scale = previewScale(Math.max(160, frame.clientWidth || 300), getSelectedPaperSizePoints());
        const builtPage = await buildPreviewPage(currentPage, counted, problem,
            () => ({ renderScale: scale, cssScale: scale }), signal);
        if (!builtPage || run !== generation) return;
        const { result, canvas } = builtPage;
        if (!canvas) {
            if (currentPage > 1 && !counted.exact) {
                // Paged past the end while the total was still unknown.
                knownTotal = currentPage - 1;
                currentPage = knownTotal;
                updateNav();
                schedule(0);
            }
            return;
        }
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

function viewerAnchor(clientX, clientY) {
    const { scroll } = viewerElements();
    const viewport = scroll.getBoundingClientRect();
    const page = viewerCanvas?.getBoundingClientRect();
    return {
        x: page ? Math.max(0, Math.min(1, (clientX - page.left) / page.width)) : 0.5,
        y: page ? Math.max(0, Math.min(1, (clientY - page.top) / page.height)) : 0.5,
        viewportX: clientX - viewport.left,
        viewportY: clientY - viewport.top
    };
}

function setViewerStatus(status, message) {
    status.textContent = message;
    status.hidden = !message;
}

function setViewerZoom(zoom, clientX, clientY) {
    const target = clampViewerZoom(zoom);
    if (target === viewerZoom) return;
    const { scroll } = viewerElements();
    const rect = scroll.getBoundingClientRect();
    const anchor = viewerAnchor(clientX ?? rect.left + rect.width / 2,
        clientY ?? rect.top + rect.height / 2);
    viewerZoom = target;
    renderViewer(anchor);
}

async function renderViewer(anchor = null) {
    const { dialog, scroll, page, status, readout } = viewerElements();
    if (!dialog.open) return;
    viewerController?.abort();
    viewerController = new AbortController();
    const { signal } = viewerController;
    const run = ++viewerGeneration;
    const counted = countOutputPages(selectedFiles, { duplexPadding: isDuplexPaddingEnabled() });
    knownTotal = counted.exact ? Math.max(counted.count, 1) : null;
    currentPage = clampPreviewPage(currentPage, knownTotal);
    updateNav();
    readout.textContent = `${Math.round(viewerZoom * 100)}%`;
    scroll.classList.toggle('is-zoomed', viewerZoom > 1);
    setViewerStatus(status, '');
    dialog.setAttribute('aria-busy', 'true');

    try {
        const problem = getOutputSettingsProblem();
        const builtPage = await buildPreviewPage(currentPage, counted, problem, (width, height) => {
            const fitScale = Math.min(Math.max(1, scroll.clientWidth - 32) / width,
                Math.max(1, scroll.clientHeight - 32) / height);
            return {
                cssScale: fitScale * viewerZoom,
                renderScale: cappedRenderScale(fitScale, viewerZoom, width, height, window.devicePixelRatio || 1)
            };
        }, signal);
        if (run !== viewerGeneration || !builtPage) return;
        if (!builtPage.canvas) {
            if (currentPage > 1 && !counted.exact) {
                knownTotal = currentPage - 1;
                currentPage = knownTotal;
                updateNav();
                renderViewer();
                return;
            }
            setViewerStatus(status, 'No page available.');
            return;
        }
        const oldCanvas = viewerCanvas;
        viewerCanvas = builtPage.canvas;
        viewerCanvas.setAttribute('role', 'img');
        viewerCanvas.setAttribute('aria-label', previewStatusText(currentPage, knownTotal));
        page.replaceChildren(viewerCanvas);
        if (oldCanvas) oldCanvas.width = oldCanvas.height = 0;
        if (anchor) {
            const canvasRect = viewerCanvas.getBoundingClientRect();
            const scrollRect = scroll.getBoundingClientRect();
            scroll.scrollLeft = anchorScroll(anchor.x, viewerCanvas.offsetWidth,
                anchor.viewportX, scroll.scrollLeft + canvasRect.left - scrollRect.left);
            scroll.scrollTop = anchorScroll(anchor.y, viewerCanvas.offsetHeight,
                anchor.viewportY, scroll.scrollTop + canvasRect.top - scrollRect.top);
        } else {
            scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
            scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
        }
        if (problem) setViewerStatus(status, 'Some output settings are incomplete. This page may omit decorations.');
    } catch (error) {
        if (error?.name === 'AbortError' || signal.aborted) return;
        console.error('Viewer failed:', error);
        setViewerStatus(status, 'Page unavailable for the current files.');
    } finally {
        if (run === viewerGeneration) dialog.removeAttribute('aria-busy');
    }
}

function initializeViewer(frame) {
    const { dialog, scroll, page, status, prev, next } = viewerElements();
    const enlarge = document.getElementById('output-preview-enlarge');
    if (!dialog || !enlarge) return;

    const open = opener => {
        viewerOpener = opener;
        viewerZoom = 1;
        clearTimeout(timer);
        controller?.abort();
        dialog.showModal();
        renderViewer();
    };
    enlarge.addEventListener('click', () => open(enlarge));
    frame.addEventListener('click', event => {
        if (event.target.closest('canvas')) open(frame);
    });
    document.getElementById('output-viewer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        viewerController?.abort();
        viewerGeneration++;
        if (viewerCanvas) viewerCanvas.width = viewerCanvas.height = 0;
        viewerCanvas = null;
        page.replaceChildren();
        setViewerStatus(status, '');
        pointers.clear();
        pinch = null;
        drag = null;
        viewerOpener?.focus();
        schedule(0);
    });
    prev.addEventListener('click', () => goToPage(currentPage - 1));
    next.addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('output-viewer-zoom-out').addEventListener('click', () => setViewerZoom(viewerZoom - 0.25));
    document.getElementById('output-viewer-zoom-in').addEventListener('click', () => setViewerZoom(viewerZoom + 0.25));
    document.getElementById('output-viewer-fit').addEventListener('click', () => setViewerZoom(1));
    dialog.addEventListener('keydown', event => {
        if (event.key === '+' || event.key === '=') setViewerZoom(viewerZoom + 0.25);
        else if (event.key === '-') setViewerZoom(viewerZoom - 0.25);
        else if (event.key === '0') setViewerZoom(1);
        else if (viewerZoom === 1 && event.key === 'ArrowLeft') goToPage(currentPage - 1);
        else if (viewerZoom === 1 && event.key === 'ArrowRight') goToPage(currentPage + 1);
        else return;
        event.preventDefault();
    });
    scroll.addEventListener('wheel', event => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        setViewerZoom(viewerZoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    }, { passive: false });
    scroll.addEventListener('dblclick', event => {
        if (Date.now() - lastTouchDoubleTap < 500) return;
        event.preventDefault();
        setViewerZoom(viewerZoom === 1 ? 2.5 : 1, event.clientX, event.clientY);
    });

    const pointers = new Map();
    let pinch = null;
    let drag = null;
    let lastTap = null;
    let lastTouchDoubleTap = 0;
    const midpoint = () => {
        const [a, b] = [...pointers.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
            distance: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    scroll.addEventListener('pointerdown', event => {
        if (!viewerCanvas) return;
        if (event.pointerType === 'mouse' && event.button === 0 && viewerZoom > 1) {
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
            scroll.setPointerCapture(event.pointerId);
            scroll.classList.add('is-dragging');
        }
        if (event.pointerType !== 'touch') return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
            const start = midpoint();
            pinch = { start, zoom: viewerZoom, anchor: viewerAnchor(start.x, start.y) };
        }
    });
    scroll.addEventListener('pointermove', event => {
        if (drag?.id === event.pointerId) {
            scroll.scrollLeft -= event.clientX - drag.x;
            scroll.scrollTop -= event.clientY - drag.y;
            drag.x = event.clientX;
            drag.y = event.clientY;
        }
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!pinch || pointers.size !== 2) return;
        const now = midpoint();
        const ratio = clampViewerZoom(pinch.zoom * now.distance / pinch.start.distance) / pinch.zoom;
        viewerCanvas.style.transformOrigin = `${pinch.anchor.x * 100}% ${pinch.anchor.y * 100}%`;
        viewerCanvas.style.transform = `translate(${now.x - pinch.start.x}px, ${now.y - pinch.start.y}px) scale(${ratio})`;
    });
    const endPointer = event => {
        if (drag?.id === event.pointerId) {
            drag = null;
            scroll.classList.remove('is-dragging');
        }
        if (!pointers.has(event.pointerId)) return;
        const wasPinching = pinch;
        const end = pointers.size === 2 ? midpoint() : null;
        pointers.delete(event.pointerId);
        if (wasPinching && end) {
            viewerCanvas.style.transform = '';
            const anchor = wasPinching.anchor;
            const rect = scroll.getBoundingClientRect();
            anchor.viewportX = end.x - rect.left;
            anchor.viewportY = end.y - rect.top;
            viewerZoom = clampViewerZoom(wasPinching.zoom * end.distance / wasPinching.start.distance);
            pinch = null;
            pointers.clear();
            lastTap = null;
            renderViewer(anchor);
        } else if (!wasPinching && event.type === 'pointerup' && event.pointerType === 'touch') {
            const now = { time: Date.now(), x: event.clientX, y: event.clientY };
            if (lastTap && now.time - lastTap.time < 350 && Math.hypot(now.x - lastTap.x, now.y - lastTap.y) < 32) {
                lastTouchDoubleTap = now.time;
                setViewerZoom(viewerZoom === 1 ? 2.5 : 1, now.x, now.y);
                lastTap = null;
            } else lastTap = now;
        }
    };
    scroll.addEventListener('pointerup', endPointer);
    scroll.addEventListener('pointercancel', endPointer);

    let gesture = null;
    scroll.addEventListener('gesturestart', event => {
        event.preventDefault();
        gesture = { zoom: viewerZoom, anchor: viewerAnchor(event.clientX, event.clientY) };
    });
    scroll.addEventListener('gesturechange', event => {
        event.preventDefault();
        if (!gesture || !viewerCanvas) return;
        viewerCanvas.style.transformOrigin = `${gesture.anchor.x * 100}% ${gesture.anchor.y * 100}%`;
        viewerCanvas.style.transform = `scale(${clampViewerZoom(gesture.zoom * event.scale) / gesture.zoom})`;
    });
    scroll.addEventListener('gestureend', event => {
        event.preventDefault();
        if (!gesture || !viewerCanvas) return;
        viewerCanvas.style.transform = '';
        viewerZoom = clampViewerZoom(gesture.zoom * event.scale);
        renderViewer(gesture.anchor);
        gesture = null;
    });
}

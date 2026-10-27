import * as pdfjsLib from './vendor/pdf.min.mjs?v=1.3.5';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs?v=1.3.5', import.meta.url).href;

/**
 * Detects whether a PDF requires a password to open (an encryption "open"
 * password). PDF.js raises a PasswordException only for files that cannot be
 * read without a password, so permission-only / owner-restricted PDFs (which
 * merge fine) are correctly reported as NOT protected.
 *
 * @param {File} file
 * @returns {Promise<boolean>} true only if an open password is required
 */
export async function isPdfPasswordProtected(file) {
    let task;
    try {
        const data = await file.arrayBuffer();
        task = pdfjsLib.getDocument({ data });
        await task.promise;
        return false;
    } catch (err) {
        if (err && err.name === 'PasswordException') return true;
        // Unreadable for some other reason — let the normal flow surface it.
        return false;
    } finally {
        // Destroying the loading task also destroys the document and frees
        // the worker resources on both the success and error paths.
        if (task) await task.destroy().catch(() => {});
    }
}

export async function renderPdfThumbnail(file, height = 80) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const scale = height / viewport.height;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(scaledViewport.width);
        canvas.height = Math.round(scaledViewport.height);

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;

        return await new Promise((resolve) => {
            // toBlob yields null when encoding fails; settle with null so
            // callers can show a blank thumbnail instead of waiting forever.
            canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.85);
        });
    } finally {
        await loadingTask.destroy().catch(() => {});
    }
}

export async function renderOutputPages(bytes, width, signal) {
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const cancel = () => { void loadingTask.destroy().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        const pdf = await loadingTask.promise;
        const canvases = [];
        for (let number = 1; number <= pdf.numPages; number++) {
            if (signal?.aborted) throw new DOMException('Preview cancelled', 'AbortError');
            const page = await pdf.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: width / base.width });
            const ratio = window.devicePixelRatio || 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width * ratio);
            canvas.height = Math.ceil(viewport.height * ratio);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            const context = canvas.getContext('2d');
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            await page.render({ canvasContext: context, viewport }).promise;
            canvases.push(canvas);
        }
        return canvases;
    } finally {
        signal?.removeEventListener('abort', cancel);
        await loadingTask.destroy().catch(() => {});
    }
}

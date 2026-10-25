import * as pdfjsLib from './vendor/pdf.min.mjs?v=1.2.1';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs?v=1.2.1', import.meta.url).href;

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

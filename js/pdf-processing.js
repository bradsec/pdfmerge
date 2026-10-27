/**
 * @fileoverview PDF processing operations including merging, scaling, and conversion
 * @author BRADSEC
 */

import { createIcon } from './icons.js?v=1.3.5';
import { 
    formatDateTime, 
    getFormattedCurrentDate, 
    displayFlashMessage, 
    formatFileSize, 
    hexToRgb,
    parseTextColor,
    estimateTextWidth,
    isMobileDevice 
} from './utils.js?v=1.3.5';
import { resizeImageAndConvertToJPEG } from './image-processing.js?v=1.3.5';
import { getSelectedPaperSizePoints } from './paper-size.js?v=1.3.5';
import { parsePageRangeSelection } from './page-range.js?v=1.3.5';
import { planOutputPages } from './output-count.js?v=1.3.5';
import { needsDuplexPadding, formatPageNumber, getTextPlacement, getTextBox, parsePageNumberStart, parsePageNumberTemplate, parseTextMargin, mmToPt, fitPageNumberSize, getTextOverlap, needsNumberingStart, shouldDrawOnPage } from './output-pages.js?v=1.3.5';

import { 
    selectedFiles, 
    isSupportedFileType, 
    resetFiles,
    clearResultLink,
    updateButtonVisibility, 
    updateToggleItemVisibility,
    updateDropAreaState,
    validatePageRanges
} from './file-handling.js?v=1.3.5';

import { addWatermarkToPage, addImageWatermarkToPage, compensateWatermarkDrawForPageTransform, embedWatermarkImage, getWatermarkType, hasWatermarkImage } from './watermark.js?v=1.3.5';
import { openSettingFor } from './settings-accordion.js?v=1.3.5';
import { DOMCache } from './dom-cache.js?v=1.3.5';

// PDF Processing constants
const PDF_CONFIG = {
    TIMEOUT_DURATION: 60000, // 60 seconds
    BATCH_SIZE: 5,
    IMAGE_EXTENSIONS: ["jpg", "jpeg", "webp", "gif", "png"],
    IMAGE_QUALITY: 0.9,
    DPI: 300,
    POINTS_PER_MM: 2.83465
};

// Processing state
let conversionTimeout;
let abortController = null;

/**
 * Main PDF conversion and merging function
 * Processes all selected files and creates a merged PDF
 */
async function convertToPDF() {
    const mergeDate = new Date();
    const invalidRange = await validatePageRanges();
    if (invalidRange) {
        const message = invalidRange.reason
            ? `Cannot merge ${invalidRange.fileEntry.name}: ${invalidRange.reason}.`
            : `Cannot merge: invalid page range "${invalidRange.token || '(empty)'}" for ${invalidRange.fileEntry.name}.`;
        DOMCache.getElementById("tool-status").textContent = message;
        displayFlashMessage(message, "danger");
        return;
    }
    if (needsNumberingStart(isPageNumberingEnabled(), isTextLineEnabled('header'), isTextLineEnabled('footer')) &&
        !validatePageNumberStart(true)) {
        const message = "Cannot merge: enter a start page number of 1 or greater.";
        DOMCache.getElementById("tool-status").textContent = message;
        displayFlashMessage(message, "danger");
        return;
    }
    if (isPageNumberingEnabled() && !validatePageNumberTemplate(true)) {
        const message = 'Cannot merge: enter a valid page number template containing {n}.';
        DOMCache.getElementById("tool-status").textContent = message;
        displayFlashMessage(message, "danger");
        return;
    }
    for (const kind of ['header', 'footer']) {
        if (isTextLineEnabled(kind) && !validateTextTemplate(kind, true)) {
            const message = `Cannot merge: enter a valid ${kind} template.`;
            DOMCache.getElementById('tool-status').textContent = message;
            displayFlashMessage(message, 'danger');
            return;
        }
    }
    if (!validateTextOverlap(true)) {
        const message = 'Cannot merge: page numbers and header or footer text overlap.';
        DOMCache.getElementById('tool-status').textContent = message;
        displayFlashMessage(message, 'danger');
        return;
    }
    for (const kind of ['page-number', 'header', 'footer']) {
        const enabled = kind === 'page-number' ? isPageNumberingEnabled() : isTextLineEnabled(kind);
        if (enabled && !validateTextMargin(kind, true)) {
            const message = `Cannot merge: enter a valid ${kind} margin from 0 to 50 mm.`;
            DOMCache.getElementById('tool-status').textContent = message;
            displayFlashMessage(message, 'danger');
            return;
        }
    }
    if (isWatermarkEnabled() && getWatermarkType() === 'image' && !hasWatermarkImage()) {
        const message = 'Cannot merge: choose a watermark image, or switch the watermark type to Text.';
        DOMCache.getElementById('tool-status').textContent = message;
        displayFlashMessage(message, 'danger');
        const input = DOMCache.getElementById('watermark-image');
        openSettingFor(input);
        input.focus();
        return;
    }
    clearResultLink();
    // Cancel any existing operation
    if (abortController) {
        abortController.abort();
    }

    // Create new AbortController for this operation
    abortController = new AbortController();
    const signal = abortController.signal;
    // Per-run token: shared state (abortController, conversionTimeout, UI) must
    // only be reset by the run that still owns it.
    const runController = abortController;

    const convertButton = DOMCache.getElementById("convert-button");
    if (convertButton) convertButton.disabled = true;
    DOMCache.getElementById("tool-status").textContent = "Merging PDF files…";
    DOMCache.getElementById("progress-bar").setAttribute("aria-valuenow", "0");
    DOMCache.getElementById("tool-surface").setAttribute("aria-busy", "true");

    const runTimeout = setTimeout(() => {
        handleConversionTimeout(runController);
    }, PDF_CONFIG.TIMEOUT_DURATION);
    conversionTimeout = runTimeout;

    try {
        // Check if operation was cancelled before starting
        if (signal.aborted) {
            throw new Error('Operation was cancelled');
        }
        
        const spinner = DOMCache.getElementById("spinner");
        const progressContainer = DOMCache.getElementById("progress-container");
        spinner.style.display = "block";
        progressContainer.style.display = "block";
        const cancelButton = DOMCache.getElementById("cancel-button");
        if (cancelButton) {
            cancelButton.style.display = "inline-block";
            cancelButton.onclick = cancelPDFProcessing;
        }
        if (selectedFiles.length < 1) {
            displayFlashMessage("Please select at least one file to convert.", "warning");
            return;
        }

        const { pdfDoc, failedFiles, unsupportedTemplate, replacedFileGlyph } = await buildOutputDocument({
            signal, mergeDate,
            onProgress(processedFiles, totalFiles) {
                const progressBar = DOMCache.getElementById("progress-bar");
                progressBar.style.width = `${(processedFiles / totalFiles) * 100}%`;
                progressBar.setAttribute("aria-valuenow", String(Math.round(processedFiles / totalFiles * 100)));
            }
        });
        if (pdfDoc.getPageCount() === 0) {
            displayFlashMessage(`No pages were produced — failed to process: ${failedFiles.join(", ")}`, "danger", 10000);
            return;
        }
        if (unsupportedTemplate) {
            const message = `Cannot merge: the ${unsupportedTemplate} template contains characters Roboto cannot draw.`;
            DOMCache.getElementById("tool-status").textContent = message;
            displayFlashMessage(message, 'danger');
            return;
        }
        if (replacedFileGlyph) displayFlashMessage('Some file name characters were replaced with ? in page text.', 'warning');

        // Never save a partial document if the run was cancelled or timed out
        throwIfAborted(signal);

        const pdfBytes = await pdfDoc.save();
        throwIfAborted(signal);

        // The merge is done; time spent in the save dialog must not trip the
        // conversion timeout and abort a finished run.
        clearTimeout(runTimeout);

        // Report any partial failures alongside the success
        if (failedFiles.length > 0) {
            displayFlashMessage(`PDF Merge complete (${failedFiles.length} file(s) could not be processed: ${failedFiles.join(", ")})`, "warning");
        } else {
            displayFlashMessage("PDF Merge complete.", "success");
        }
        clearLegacyPageRangeStorage();

        // Keep the file list when the save dialog is cancelled so the user can
        // merge again without re-adding everything.
        if (await prepareFileLink(pdfBytes)) {
            resetFiles(true);
        }
    } catch (error) {
        if (error.name === 'AbortError' || signal.aborted) {
            // Cancellation feedback is handled by the cancel/timeout paths
            console.warn("PDF conversion aborted:", error.message);
        } else {
            console.error("Error during PDF conversion:", error);
            displayFlashMessage(`An error occurred during PDF conversion: ${error.message}`, "danger");
        }
    } finally {
        clearTimeout(runTimeout);
        if (convertButton) convertButton.disabled = false;
        // Only reset shared conversion state if this run is still the active one
        if (abortController === runController) {
            resetConversionState();
        }
    }
}

/**
 * Builds the merged document. Merge and preview share this path so the preview
 * is the compiled output. `pageWindow` ({from, to}, 0-based output pages)
 * builds only that slice: cards before it are skipped without being read, and
 * page numbers, {file}, skip-first and image numbers keep their global values.
 */
export async function buildOutputDocument({ files = selectedFiles, maxPages = Infinity, signal,
    mergeDate = new Date(), totalPages, onProgress, preview = false, pageWindow = null } = {}) {
    throwIfAborted(signal);
    const textItems = getTextItems();
    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const hasImages = files.some(isImageEntry);
    const needsTextFont = textItems.length > 0 || (hasImages &&
        (shouldPrintImageDetails() || shouldPrintImagePageNumbers() || shouldPrintImageHash()));
    const regularFont = needsTextFont ? await loadFont(pdfDoc, 'fonts/Roboto-Regular.ttf', signal, preview) : null;
    textItems.forEach(item => {
        item.tokens = parsePageNumberTemplate(item.template, { requireNumber: item.name === 'page number' }).tokens;
    });
    const hasGlyph = regularFont?.embedder?.font?.hasGlyphForCodePoint?.bind(regularFont.embedder.font);
    const boldFont = hasImages && shouldPrintImageDetails()
        ? await loadFont(pdfDoc, 'fonts/Roboto-Bold.ttf', signal, preview) : null;
    const imageWatermark = isWatermarkEnabled() && getWatermarkType() === 'image';
    const blackFont = isWatermarkEnabled() && !imageWatermark
        ? await loadFont(pdfDoc, 'fonts/Roboto-Black.ttf', signal, preview) : null;
    const watermarkImage = imageWatermark ? await embedWatermarkImage(pdfDoc) : null;

    const failedFiles = [];
    const pageFiles = [];
    const imageNumber = { index: 0 };
    let processedFiles = 0;
    // Without a plan (a PDF still loading, or an invalid range) page positions
    // are unknown, so build from the first page up to the window end instead.
    const plan = pageWindow ? planOutputPages(files, { duplexPadding: isDuplexPaddingEnabled() }) : null;
    const ctx = {
        pdfDoc, regularFont, boldFont, signal, failedFiles, pageFiles, imageNumber, preview,
        totalFiles: files.length, plan,
        from: plan ? pageWindow.from : 0,
        to: pageWindow ? pageWindow.to : maxPages,
        outputIndex: 0,
        done: false
    };
    if (preview && files.length === 0) {
        const [width, height] = getSelectedPaperSize();
        pdfDoc.addPage([width, height]);
        pageFiles.push('');
    }
    for (const chunk of chunkArray(files, PDF_CONFIG.BATCH_SIZE)) {
        throwIfAborted(signal);
        if (ctx.done || (!plan && pdfDoc.getPageCount() >= ctx.to)) break;
        processedFiles += await processFileChunk(chunk, ctx, processedFiles);
        onProgress?.(processedFiles, files.length);
    }
    const firstPageIndex = ctx.from;

    throwIfAborted(signal);
    if (watermarkImage) {
        pdfDoc.getPages().forEach(page => addImageWatermarkToPage(page, watermarkImage));
    } else if (isWatermarkEnabled() && !imageWatermark) {
        pdfDoc.getPages().forEach(page => addWatermarkToPage(page, getWatermarkText(), blackFont));
    }

    let replacedFileGlyph = false;
    if (textItems.length && pdfDoc.getPageCount()) {
        const pages = pdfDoc.getPages();
        const start = parsePageNumberStart(DOMCache.getElementById("page-number-start").value);
        const total = totalPages ?? pages.length;
        const drawableItems = textItems.filter(item => pages.some((_, index) =>
            shouldDrawOnPage(firstPageIndex + index, item.skipFirst)));
        if (drawableItems.length && !hasGlyph) throw new Error('Cannot check page text font characters.');
        const unsupportedTemplate = drawableItems.find(item =>
            Array.from(formatPageNumber(start + Number(item.skipFirst), total, item.tokens, '', mergeDate))
                .some(char => !hasGlyph(char.codePointAt(0))));
        if (unsupportedTemplate) {
            return { pdfDoc, pageFiles, failedFiles, unsupportedTemplate: unsupportedTemplate.name,
                replacedFileGlyph, firstPageIndex };
        }
        pages.forEach((page, index) => {
            const activeItems = drawableItems.filter(item =>
                shouldDrawOnPage(firstPageIndex + index, item.skipFirst));
            if (!activeItems.length) return;
            const number = start + firstPageIndex + index;
            const usesFile = activeItems.some(item => item.tokens.some(token => token.name === 'file'));
            const file = Array.from(usesFile ? pageFiles[index] || '' : '', char => {
                if (hasGlyph(char.codePointAt(0))) return char;
                replacedFileGlyph = true;
                return '?';
            }).join('');
            activeItems.forEach(item => {
                const label = formatPageNumber(number, total, item.tokens, file, mergeDate);
                if (Array.from(label).some(char => !hasGlyph(char.codePointAt(0)))) {
                    throw new Error(`${item.name} label contains characters Roboto cannot draw.`);
                }
                const box = page.getCropBox();
                const angle = page.getRotation().angle;
                const visibleWidth = angle % 180 ? box.height : box.width;
                const fontSize = fitPageNumberSize(visibleWidth,
                    size => regularFont.widthOfTextAtSize(label, size), item.margin);
                const textWidth = regularFont.widthOfTextAtSize(label, fontSize);
                const placement = getTextPlacement(box, angle, item.edge, item.align,
                    textWidth, fontSize, item.margin);
                // Resized pages keep a content transform that also applies to
                // later drawing, so map page coordinates back through it.
                const transform = page.__pdfmergeWatermarkTransform ?? null;
                const scale = transform?.scale || 1;
                if (item.boxColor) {
                    const rect = getTextBox(placement, textWidth, fontSize);
                    const corner = compensateWatermarkDrawForPageTransform({ x: rect.x, y: rect.y, size: 0 }, transform);
                    page.drawRectangle({
                        x: corner.x, y: corner.y, width: rect.width / scale, height: rect.height / scale,
                        rotate: PDFLib.degrees(rect.rotation),
                        color: PDFLib.rgb(item.boxColor.r, item.boxColor.g, item.boxColor.b), opacity: 1
                    });
                }
                const draw = compensateWatermarkDrawForPageTransform(
                    { x: placement.x, y: placement.y, size: fontSize }, transform);
                page.drawText(label, {
                    x: draw.x, y: draw.y, rotate: PDFLib.degrees(placement.rotation),
                    size: draw.size, font: regularFont,
                    color: PDFLib.rgb(item.color.r, item.color.g, item.color.b)
                });
            });
        });
    }
    throwIfAborted(signal);
    return { pdfDoc, pageFiles, failedFiles, replacedFileGlyph, firstPageIndex };
}

function isImageEntry(fileEntry) {
    if (fileEntry.type === 'blank') return false;
    const extension = fileEntry.extension || fileEntry.name.split(".").pop().toLowerCase();
    return PDF_CONFIG.IMAGE_EXTENSIONS.includes(extension);
}

const previewFontBytes = new Map();

async function loadFont(pdfDoc, fontPath, signal, cacheBytes = false) {
    try {
        const fetchBytes = async () => {
            const response = await fetch(fontPath, cacheBytes ? undefined : { signal });
            if (!response.ok) throw new Error(`Failed to fetch font: ${response.status} ${response.statusText}`);
            return response.arrayBuffer();
        };
        if (cacheBytes && !previewFontBytes.has(fontPath)) {
            previewFontBytes.set(fontPath, fetchBytes().catch(error => {
                previewFontBytes.delete(fontPath);
                throw error;
            }));
        }
        const fontBytes = await (cacheBytes ? previewFontBytes.get(fontPath) : fetchBytes());
        throwIfAborted(signal);
        return await pdfDoc.embedFont(fontBytes.slice(0), { subset: true });
    } catch (error) {
        console.error(`Failed to load font from ${fontPath}:`, error);
        throw new Error(`Font loading failed for ${fontPath}: ${error.message}`, { cause: error });
    }
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error('Operation was cancelled');
        error.name = 'AbortError';
        throw error;
    }
}

function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

async function processFileChunk(chunk, ctx, startIndex) {
    const { pdfDoc, signal, failedFiles, pageFiles, plan } = ctx;
    let processed = 0;
    for (let i = 0; i < chunk.length; i++) {
        throwIfAborted(signal);
        const fileEntry = chunk[i];
        const cardIndex = startIndex + i;
        const isFinalCard = cardIndex === ctx.totalFiles - 1;
        const card = plan?.[cardIndex];
        const cardStart = ctx.outputIndex;

        if (card) {
            const cardEnd = cardStart + card.pages + card.padding;
            if (cardStart >= ctx.to) { ctx.done = true; break; }
            if (cardEnd <= ctx.from) {
                // Entirely before the window: account for it without reading the file.
                if (isImageEntry(fileEntry) && countsImageNumber(fileEntry)) ctx.imageNumber.index++;
                ctx.outputIndex = cardEnd;
                processed++;
                continue;
            }
        } else if (pdfDoc.getPageCount() >= ctx.to) {
            break;
        }

        if (!isSupportedFileType(fileEntry)) {
            console.error(`Unsupported file type: ${fileEntry.name}`);
            processed++;
            continue;
        }

        // Main pages of this card that fall inside the window. When only its
        // duplex padding page is inside, build the last main page anyway so the
        // padding copies its size and rotation, then drop it.
        let skip = 0;
        let limit;
        let dropLeading = 0;
        if (card) {
            skip = Math.max(0, ctx.from - cardStart);
            limit = Math.min(card.pages, ctx.to - cardStart) - skip;
            if (skip >= card.pages) {
                dropLeading = 1;
                skip = card.pages - 1;
                limit = 1;
            }
        } else {
            limit = ctx.to - pdfDoc.getPageCount();
        }

        const previousPageCount = pdfDoc.getPageCount();
        try {
            if (fileEntry.type === 'blank') {
                const [pageWidth, pageHeight] = getSelectedPaperSize();
                pdfDoc.addPage([pageWidth, pageHeight]);
            } else {
                const fileExtension = fileEntry.extension || fileEntry.name.split(".").pop().toLowerCase();
                if (PDF_CONFIG.IMAGE_EXTENSIONS.includes(fileExtension)) {
                    await processImageFile(fileEntry, pdfDoc, ctx.regularFont, ctx.boldFont, signal, ctx.imageNumber);
                } else if (fileExtension === "pdf") {
                    await processPdfFile(fileEntry, pdfDoc, signal, { skip, limit, cache: ctx.preview });
                } else {
                    throw new Error(`Unsupported file format: ${fileExtension}`);
                }
            }
        } catch (error) {
            // Abort must stop the whole merge, not mark the file as failed
            if (error.name === 'AbortError' || signal?.aborted) throw error;
            console.error("Error processing file:", error);
            failedFiles.push(fileEntry.name);
        }

        const builtPages = pdfDoc.getPageCount() - previousPageCount;
        const paddingIndex = cardStart + (card ? card.pages : builtPages);
        const wantsPadding = card
            ? card.padding > 0 && paddingIndex >= ctx.from && paddingIndex < ctx.to && builtPages > 0
            : isDuplexPaddingEnabled() && builtPages > 0 && pdfDoc.getPageCount() < ctx.to &&
                needsDuplexPadding(builtPages, isFinalCard);
        if (wantsPadding) {
            const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
            const padding = pdfDoc.addPage([lastPage.getWidth(), lastPage.getHeight()]);
            padding.setRotation(lastPage.getRotation());
        }
        for (let drop = 0; drop < dropLeading && pdfDoc.getPageCount() > previousPageCount; drop++) {
            pdfDoc.removePage(previousPageCount);
        }

        const name = fileEntry.type === 'blank' ? '' : fileEntry.name.replace(/\.[^.]+$/, '');
        pageFiles.push(...Array(pdfDoc.getPageCount() - previousPageCount).fill(name));
        ctx.outputIndex = card ? cardStart + card.pages + card.padding : pdfDoc.getPageCount();
        processed++;
    }
    return processed;
}

function countsImageNumber(fileEntry) {
    const layout = getImageLayout(fileEntry);
    return shouldPrintImagePageNumbers() && layout !== 'cover' && layout !== 'fit';
}

async function processImageFile(fileEntry, pdfDoc, regularFont, boldFont, signal, imageNumber) {
    throwIfAborted(signal);
    try {
        const dataUrl = await resizeImageAndConvertToJPEG(fileEntry, {
            config: PDF_CONFIG,
            getSelectedPaperSize
        });
        const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

        const [pageWidth, pageHeight] = getSelectedPaperSize();
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Printer-safe margins: 0.75 inches (54 points) for wide printer compatibility
        const safeMargin = 54;
        const leftMargin = safeMargin;
        const topMargin = safeMargin;
        const rightMargin = pageWidth - safeMargin;
        const bottomMargin = pageHeight - safeMargin;

        const image = await pdfDoc.embedJpg(imageBytes);
        const layout = getImageLayout(fileEntry);
        const isFullPage = layout === "cover" || layout === "fit";

        if (isFullPage) {
            page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        } else {
            if (shouldPrintImageDetails() || shouldPrintImagePageNumbers() || shouldPrintImageHash()) {
                await addImageDetailsToPage(page, fileEntry.file, regularFont, boldFont,
                    pageWidth, pageHeight, imageNumber);
            }

            const imgDim = image.scaleToFit(
                rightMargin - leftMargin,
                bottomMargin - topMargin - (shouldPrintImageDetails() ? 100 : 0)
            );

            const xPosition = (rightMargin - leftMargin - imgDim.width) / 2 + leftMargin;
            const yPosition = (bottomMargin - topMargin - imgDim.height) / 2 + topMargin;

            page.drawImage(image, {
                x: xPosition,
                y: yPosition,
                width: imgDim.width,
                height: imgDim.height,
            });
        }

        if (fileEntry.rotation) {
            page.setRotation(PDFLib.degrees(fileEntry.rotation));
        }
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`Failed to process image file ${fileEntry.name}:`, error);
        throw new Error(`Image processing failed for ${fileEntry.name}: ${error.message}`, { cause: error });
    }
}

// Parsed source PDFs reused across preview renders; keyed by card entry so
// removed cards are released with it.
const previewSourceDocs = new WeakMap();

async function loadSourcePdf(fileEntry, signal, cache) {
    if (cache && previewSourceDocs.has(fileEntry)) return previewSourceDocs.get(fileEntry);
    const loading = fileEntry.file.arrayBuffer().then(fileBytes => {
        throwIfAborted(signal);
        return PDFLib.PDFDocument.load(fileBytes, { ignoreEncryption: true });
    });
    if (cache) {
        previewSourceDocs.set(fileEntry, loading);
        loading.catch(() => previewSourceDocs.delete(fileEntry));
    }
    return loading;
}

async function processPdfFile(fileEntry, pdfDoc, signal, { skip = 0, limit = Infinity, cache = false } = {}) {
    try {
        const existingPdfDoc = await loadSourcePdf(fileEntry, signal, cache);
        throwIfAborted(signal);

        // null means no range entered, which falls back to all pages. An
        // entered range with zero valid tokens throws instead of merging all.
        const selectedPageIndices = getSelectedPageIndicesForFile(fileEntry, existingPdfDoc.getPageCount());
        const pagesToCopy = (selectedPageIndices ?? existingPdfDoc.getPageIndices()).slice(skip, skip + limit);
        
        const copiedPages = await pdfDoc.copyPages(existingPdfDoc, pagesToCopy);
        const [targetWidth, targetHeight] = getSelectedPaperSize();
        
        copiedPages.forEach((page) => {
            // Add page to document first
            pdfDoc.addPage(page);

            // Scale page to selected paper size with orientation awareness
            const currentSize = page.getSize();

            // Determine if the current page is landscape oriented
            const isCurrentPageLandscape = currentSize.width > currentSize.height;

            // Choose appropriate target dimensions based on page orientation
            let finalTargetWidth, finalTargetHeight;
            if (isCurrentPageLandscape) {
                // For landscape pages, use landscape target dimensions
                [finalTargetWidth, finalTargetHeight] = [Math.max(targetWidth, targetHeight), Math.min(targetWidth, targetHeight)];
            } else {
                // For portrait pages, use portrait target dimensions
                [finalTargetWidth, finalTargetHeight] = [Math.min(targetWidth, targetHeight), Math.max(targetWidth, targetHeight)];
            }

            if (Math.abs(currentSize.width - finalTargetWidth) > 1 || Math.abs(currentSize.height - finalTargetHeight) > 1) {
                resizePdfPageToOutputSize(page, finalTargetWidth, finalTargetHeight);
            }

            if (fileEntry.rotation) {
                const current = page.getRotation().angle;
                page.setRotation(PDFLib.degrees((current + fileEntry.rotation) % 360));
            }
        });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`Failed to process PDF file ${fileEntry.name}:`, error);
        throw new Error(`PDF processing failed for ${fileEntry.name}: ${error.message}`, { cause: error });
    }
}

function normalizePageBoxes(page, width, height) {
    page.setMediaBox(0, 0, width, height);
    page.setCropBox(0, 0, width, height);
    page.setBleedBox(0, 0, width, height);
    page.setTrimBox(0, 0, width, height);
    page.setArtBox(0, 0, width, height);
}

function resizePdfPageToOutputSize(page, finalTargetWidth, finalTargetHeight) {
    const currentSize = page.getSize();
    const mediaBox = page.getMediaBox();
    const scaleX = finalTargetWidth / currentSize.width;
    const scaleY = finalTargetHeight / currentSize.height;
    const scale = Math.min(scaleX, scaleY);
    const originX = mediaBox.x;
    const originY = mediaBox.y;
    const scaledWidth = currentSize.width * scale;
    const scaledHeight = currentSize.height * scale;
    const centerOffX = (finalTargetWidth - scaledWidth) / 2;
    const centerOffY = (finalTargetHeight - scaledHeight) / 2;

    page.setSize(finalTargetWidth, finalTargetHeight);
    page.scaleContent(scale, scale);
    page.translateContent(
        Math.round(centerOffX - originX * scale),
        Math.round(centerOffY - originY * scale)
    );
    normalizePageBoxes(page, finalTargetWidth, finalTargetHeight);
    page.__pdfmergeWatermarkTransform = {
        scale,
        translateX: Math.round(centerOffX - originX * scale),
        translateY: Math.round(centerOffY - originY * scale)
    };
}


async function addImageDetailsToPage(page, file, regularFont, boldFont, pageWidth, pageHeight, imageNumber) {
    const fontSize = 10;
    const maxTextWidth = pageWidth - 60; // Accounting for left and right margins
    const lineHeight = 14;
    const textX = 30; // Left margin
    let textY = pageHeight - 20; // Top margin

    if (shouldPrintImageDetails()) {
        const imgDetails = await getImageDetails(file);
        const imgGpsInfo = imgDetails.imgGpsInfo;
        const imgDateTime = imgDetails.imgDateTime;

        textY -= lineHeight;
        drawWrappedText(page, file.name, textX, textY, maxTextWidth, lineHeight, boldFont, fontSize, "#000000");

        if (imgDateTime !== null) {
            textY -= lineHeight;
            drawWrappedText(page, formatDateTime(imgDateTime), textX, textY, maxTextWidth, lineHeight, regularFont, fontSize, "#000000");
        }

        if (imgGpsInfo) {
            textY -= lineHeight;
            drawWrappedText(page, `GPS (Lat, Long) ${imgGpsInfo}`, textX, textY, maxTextWidth, lineHeight, regularFont, fontSize, "#000000");
        }
    }

    if (shouldPrintImageHash()) {
        const imgHash = await calculateImageHash(file);
        if (imgHash !== null) {
            textY -= lineHeight;
            drawWrappedText(page, `SHA-256: ${imgHash}`, textX, textY, maxTextWidth, lineHeight, regularFont, fontSize, "#000000");
        }
    }

    if (shouldPrintImagePageNumbers()) {
        const pageNumberText = `Image ${imageNumber.index + 1}`;
        const pageNumberFontSize = 10;
        const pageNumberWidth = estimateTextWidth(pageNumberText, pageNumberFontSize);
        const pageNumberX = pageWidth - pageNumberWidth - 30;
        const pageNumberY = 30;

        page.drawText(pageNumberText, {
            x: pageNumberX,
            y: pageNumberY,
            size: pageNumberFontSize,
            font: regularFont,
            color: PDFLib.rgb(0, 0, 0),
        });
        imageNumber.index++;
    }
}


function handleConversionTimeout(controller) {
    console.error("Conversion process timed out.");
    // Actually abort the in-flight operation so the heavy work stops instead of
    // continuing to run after the timeout fires.
    if (controller) controller.abort();
    displayFlashMessage("Conversion process took too long and was terminated.", "danger");
    // Reset only the conversion UI; the user's file list must survive a
    // timeout so they can retry without re-adding everything. The aborted
    // run's own finally normally resets; this delayed fallback only fires if
    // that run is hung and still owns the shared state, so it never clobbers
    // a newer run started in the meantime.
    setTimeout(() => {
        if (abortController === controller) resetConversionState();
    }, 3000);
}

function resetConversionState() {
    const spinner = DOMCache.getElementById("spinner");
    const progressContainer = DOMCache.getElementById("progress-container");
    const progressBar = DOMCache.getElementById("progress-bar");
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
    progressBar.setAttribute("aria-valuenow", "0");
    DOMCache.getElementById("tool-surface").setAttribute("aria-busy", "false");
    DOMCache.getElementById("tool-status").textContent = "";
    const cancelButton = DOMCache.getElementById("cancel-button");
    if (cancelButton) cancelButton.style.display = "none";
    // Re-enable the convert button here as well: if a run hangs and never
    // reaches its finally block, the timeout fallback reset is the only
    // thing that can unlock the button again.
    const convertButton = DOMCache.getElementById("convert-button");
    if (convertButton) convertButton.disabled = false;
    clearTimeout(conversionTimeout);
    
    // Clean up AbortController
    if (abortController) {
        abortController = null;
    }

    updateButtonVisibility();
    updateToggleItemVisibility();
    updateDropAreaState();
}

/**
 * Cancel the current PDF processing operation
 */
function cancelPDFProcessing() {
    if (abortController) {
        abortController.abort();
        displayFlashMessage("PDF processing cancelled", "info");
        resetConversionState();
    }
}

/**
 * Removes page ranges saved to localStorage by earlier versions, which keyed
 * them per file. Page ranges now live on each file entry.
 */
function clearLegacyPageRangeStorage() {
    try {
        Object.keys(localStorage)
            .filter(key => key.startsWith('pdf-page-range-'))
            .forEach(key => localStorage.removeItem(key));
    } catch (error) {
        console.warn('Failed to clear saved page ranges:', error);
    }
}

/**
 * Saves the merged PDF via the save picker, or falls back to a download link.
 * @returns {Promise<boolean>} false when the user cancelled the save dialog
 */
async function prepareFileLink(pdfBytes) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const defaultFilename = `PDFMerge_${getFormattedCurrentDate()}.pdf`;
    const filenameInput = DOMCache.getElementById("output-filename");
    const rawName = filenameInput ? filenameInput.value.trim() : "";
    const sanitised = rawName.replace(/[\\/:*?"<>|]/g, "").replace(/\.pdf$/i, "").trim();
    const outputFilename = sanitised ? `${sanitised}.pdf` : defaultFilename;
    const fileSize = formatFileSize(blob.size);
    
    let savedSuccessfully = false;
    // Try to use the File System Access API for modern browsers
    if ('showSaveFilePicker' in window) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: outputFilename,
                types: [
                    {
                        description: 'PDF files',
                        accept: {
                            'application/pdf': ['.pdf'],
                        },
                    },
                ],
            });
            
            const writableStream = await fileHandle.createWritable();
            await writableStream.write(blob);
            await writableStream.close();
            
            savedSuccessfully = true;
            const actualFilename = fileHandle.name;
            
            displayFlashMessage(`Successfully saved "${actualFilename}" (${fileSize})`, "success", 8000);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('File System Access API failed, falling back to download:', error);
                // Fall through to traditional download
            } else {
                displayFlashMessage("Save cancelled. Your files are still listed, merge again to save.", "info", 8000);
                return false;
            }
        }
    }
    
    // Fallback to traditional download for unsupported browsers or if save picker failed
    if (!savedSuccessfully) {
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        
        anchor.href = blobUrl;
        anchor.download = outputFilename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        
        // Show download link for user reference
        const fileLink = DOMCache.getElementById("file-link");
        fileLink.dataset.blobUrl = blobUrl;
        
        // Customize message based on device type
        const isMobile = isMobileDevice();
        const downloadText = isMobile ? 
            "Tap to save file" : 
            "Click to download again";
        
        const dlAnchor = document.createElement("a");
        dlAnchor.href = blobUrl;
        dlAnchor.className = "file-link flash-success";
        dlAnchor.download = outputFilename;
        const icon = createIcon('file-text');
        icon.style.fontSize = "45px";
        const label = document.createTextNode(` ${outputFilename} (${fileSize}) - ${downloadText}`);
        dlAnchor.appendChild(icon);
        dlAnchor.appendChild(label);
        fileLink.replaceChildren(dlAnchor);
        fileLink.style.display = "block";
        
        // Show device-appropriate message
        if (isMobile) {
            displayFlashMessage(`PDF ready! Tap the link below to save "${outputFilename}" (${fileSize})`, "success", 8000);
        } else {
            displayFlashMessage(`PDF downloaded as "${outputFilename}" (${fileSize})`, "success", 8000);
        }
        
    }

    return true;
}

function getImageLayout(fileEntry = null) {
    if (fileEntry?.imageLayout) {
        return fileEntry.imageLayout;
    }

    return "default";
}

/**
 * Gets the selected paper size dimensions in points
 * @returns {number[]} [width, height] in points
 */
function getSelectedPaperSize() {
    return getSelectedPaperSizePoints();
}

/**
 * Converts EXIF GPS tags to a "lat, long" decimal degrees string.
 * Applies the hemisphere reference tags so southern/western coordinates are
 * negative. Returns null on missing or malformed data so the GPS line is skipped.
 * @param {Object|null} tags - EXIF tags from exif-js
 * @returns {string|null} Formatted coordinates or null
 */
function formatExifGpsCoordinates(tags) {
    if (!tags) return null;
    const latitude = convertExifGpsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef, "S");
    const longitude = convertExifGpsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef, "W");
    if (latitude === null || longitude === null) return null;
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/**
 * Converts a 3-element EXIF [degrees, minutes, seconds] array to signed
 * decimal degrees. exif-js values may be Number objects, so coerce first.
 * @param {Array} dms - [degrees, minutes, seconds]
 * @param {string} ref - Hemisphere reference ("N"/"S"/"E"/"W")
 * @param {string} negativeRef - Reference value that flips the sign ("S" or "W")
 * @returns {number|null} Decimal degrees, or null when the data is invalid
 */
function convertExifGpsToDecimal(dms, ref, negativeRef) {
    if (!Array.isArray(dms) || dms.length !== 3) return null;
    const [degrees, minutes, seconds] = dms.map(Number);
    if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
    }
    const decimal = degrees + minutes / 60 + seconds / 3600;
    return ref === negativeRef ? -decimal : decimal;
}

async function getImageDetails(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const fileExtension = file.name.split(".").pop().toLowerCase();
                let imgGpsInfo = null,
                    imgDateTime = null,
                    tags = null;

                if (fileExtension !== "webp" && fileExtension !== "gif") {
                    tags = EXIF.readFromBinaryFile(e.target.result);
                    imgGpsInfo = formatExifGpsCoordinates(tags);
                    if (tags && tags.DateTimeOriginal) {
                        imgDateTime = tags.DateTimeOriginal;
                    }
                }
                resolve({ exifData: tags, imgGpsInfo, imgDateTime });
            } catch (error) {
                console.error("Error in getImageDetails:", error);
                reject("Error processing image details.");
            }
        };
        reader.onerror = () => {
            reject("Error reading the file for image details.");
        };
        reader.readAsArrayBuffer(file);
    });
}

async function calculateImageHash(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function (event) {
            try {
                const arrayBuffer = event.target.result;
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                resolve(hashHex);
            } catch (error) {
                console.error("Error calculating image hash:", error);
                reject(null);
            }
        };
        reader.onerror = () => reject(null);
        reader.readAsArrayBuffer(file);
    });
}

function drawWrappedText(page, text, x, y, maxWidth, lineHeight, font, fontSize, hexColor) {
    const { r, g, b } = hexToRgb(hexColor);
    const words = text.split(' ');
    let line = '';
    
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth > maxWidth && n > 0) {
            page.drawText(line, {
                x: x,
                y: y,
                size: fontSize,
                font: font,
                color: PDFLib.rgb(r, g, b),
            });
            line = words[n] + ' ';
            y -= lineHeight;
        } else {
            line = testLine;
        }
    }
    
    page.drawText(line, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: PDFLib.rgb(r, g, b),
    });
}

function shouldPrintImageDetails() {
    return DOMCache.getElementById("print-image-details").checked;
}

function shouldPrintImagePageNumbers() {
    return DOMCache.getElementById("print-image-page-numbers").checked;
}

function shouldPrintImageHash() {
    return DOMCache.getElementById("print-image-hash").checked;
}

function isPageNumberingEnabled() {
    return DOMCache.getElementById("add-page-numbers").checked;
}

function isTextLineEnabled(kind) {
    return DOMCache.getElementById(`add-${kind}-text`).checked;
}

function getTextItems() {
    const items = [];
    if (isPageNumberingEnabled()) {
        const [edge, align] = DOMCache.getElementById('page-number-position').value.split('-');
        items.push({ name: 'page number', template: getPageNumberTemplate(), edge, align,
            ...getTextAppearance('page-number'),
            color: parseTextColor(DOMCache.getElementById('page-number-color').value),
            skipFirst: DOMCache.getElementById('page-number-skip-first').checked });
    }
    for (const kind of ['header', 'footer']) {
        if (isTextLineEnabled(kind)) items.push({
            name: kind,
            template: DOMCache.getElementById(`${kind}-text-template`).value,
            edge: kind === 'header' ? 'top' : 'bottom',
            align: DOMCache.getElementById(`${kind}-text-alignment`).value,
            ...getTextAppearance(kind),
            color: parseTextColor(DOMCache.getElementById(`${kind}-color`).value),
            skipFirst: DOMCache.getElementById(`${kind}-skip-first`).checked
        });
    }
    return items;
}

function getTextAppearance(kind) {
    return {
        margin: mmToPt(parseTextMargin(DOMCache.getElementById(`${kind}-margin`).value)),
        boxColor: DOMCache.getElementById(`${kind}-box`).checked
            ? parseTextColor(DOMCache.getElementById(`${kind}-box-color`).value, '#ffffff') : null
    };
}

function validateTextMargin(kind, focus = false) {
    const input = DOMCache.getElementById(`${kind}-margin`);
    const error = DOMCache.getElementById(`${kind}-margin-error`);
    const valid = parseTextMargin(input.value) !== null;
    input.setAttribute('aria-invalid', String(!valid));
    if (valid) input.removeAttribute('aria-describedby');
    else input.setAttribute('aria-describedby', error.id);
    error.hidden = valid;
    if (!valid && focus) { openSettingFor(input); input.focus(); }
    return valid;
}

function isDuplexPaddingEnabled() {
    return DOMCache.getElementById("duplex-padding").checked;
}

function validatePageNumberStart(focus = false) {
    const input = DOMCache.getElementById("page-number-start");
    const error = DOMCache.getElementById("page-number-start-error");
    const valid = parsePageNumberStart(input.value) !== null;
    input.setAttribute("aria-invalid", String(!valid));
    if (valid) input.removeAttribute("aria-describedby");
    else input.setAttribute("aria-describedby", error.id);
    error.hidden = valid;
    if (!valid && focus) { openSettingFor(input); input.focus(); }
    return valid;
}

function getPageNumberTemplate() {
    const format = DOMCache.getElementById('page-number-format').value;
    return format === 'custom' ? DOMCache.getElementById('page-number-template').value : format;
}

function validatePageNumberTemplate(focus = false) {
    const custom = DOMCache.getElementById('page-number-format').value === 'custom';
    return validateTemplate('page-number-template', getPageNumberTemplate(), custom, true, focus);
}

function validateTextTemplate(kind, focus = false) {
    const id = `${kind}-text-template`;
    return validateTemplate(id, DOMCache.getElementById(id).value, isTextLineEnabled(kind), false, focus);
}

function validateTemplate(id, template, showError, requireNumber, focus) {
    const input = DOMCache.getElementById(id);
    const error = DOMCache.getElementById(`${id}-error`);
    const result = parsePageNumberTemplate(template, { requireNumber });
    const valid = !result.error;
    if (focus) input.dataset.blurred = 'true';
    const displayError = showError && !valid &&
        (input.dataset.blurred === 'true' || (input.dataset.touched === 'true' && !!template.trim()));
    input.setAttribute('aria-invalid', String(displayError));
    if (displayError) input.setAttribute('aria-describedby', error.id);
    else input.removeAttribute('aria-describedby');
    error.textContent = displayError ? result.error : '';
    error.hidden = !displayError;
    if (displayError && focus) { openSettingFor(input); input.focus(); }
    return valid;
}

function getCurrentTextOverlap() {
    const position = isPageNumberingEnabled() ? DOMCache.getElementById('page-number-position').value : null;
    const header = isTextLineEnabled('header') ? DOMCache.getElementById('header-text-alignment').value : null;
    const footer = isTextLineEnabled('footer') ? DOMCache.getElementById('footer-text-alignment').value : null;
    return getTextOverlap(position, header, footer);
}

/**
 * Side-effect-free version of the merge-time checks, for the live preview:
 * it must not reveal untouched field errors or move focus while the user types.
 * @returns {string|null} what is invalid, or null when a build can proceed
 */
function getOutputSettingsProblem(files = selectedFiles) {
    const enabled = { 'page-number': isPageNumberingEnabled(), header: isTextLineEnabled('header'),
        footer: isTextLineEnabled('footer') };
    if (needsNumberingStart(enabled['page-number'], enabled.header, enabled.footer) &&
        parsePageNumberStart(DOMCache.getElementById('page-number-start').value) === null) return 'start number';
    if (getTextItems().some(item =>
        parsePageNumberTemplate(item.template, { requireNumber: item.name === 'page number' }).error)) return 'template';
    if (Object.entries(enabled).some(([kind, on]) =>
        on && parseTextMargin(DOMCache.getElementById(`${kind}-margin`).value) === null)) return 'margin';
    if (getCurrentTextOverlap()) return 'overlap';
    if (isWatermarkEnabled() && getWatermarkType() === 'image' && !hasWatermarkImage()) return 'watermark image';
    if (files.some(file => file.pageRange?.trim() && Number.isInteger(file.pageCount) &&
        parsePageRangeSelection(file.pageRange, file.pageCount).invalidTokens.length)) return 'page range';
    return null;
}

function validateTextOverlap(focus = false) {
    const overlap = getCurrentTextOverlap();
    for (const kind of ['header', 'footer']) {
        const input = DOMCache.getElementById(`${kind}-text-alignment`);
        const error = DOMCache.getElementById(`${kind}-text-alignment-error`);
        const invalid = overlap === kind;
        input.setAttribute('aria-invalid', String(invalid));
        if (invalid) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
        error.hidden = !invalid;
        if (invalid && focus) { openSettingFor(input); input.focus(); }
    }
    return !overlap;
}

function isWatermarkEnabled() {
    return DOMCache.getElementById("add-watermark").checked;
}

function getWatermarkText() {
    return DOMCache.getElementById("watermark-text").value || "PDFMerge";
}

/**
 * Parses a page range string (e.g. "1-3,5,8") into 0-based page indices.
 * @param {string} pageRangeValue - The raw page range input
 * @param {number} totalPages - Number of pages in the source PDF
 * @returns {{pageIndices: number[], invalidTokens: string[]}} Indices in the
 *   order typed (repeats kept) plus any tokens that could not be parsed or are
 *   out of range
 */
function getSelectedPageIndicesForFile(file, totalPages) {
    const pageRangeValue = (file.pageRange ?? '').trim();
    if (!pageRangeValue) {
        return null; // Empty input means use all pages
    }

    const { pageIndices, invalidTokens } = parsePageRangeSelection(pageRangeValue, totalPages);

    if (invalidTokens.length) throw new Error(`Invalid page range "${invalidTokens[0]}" for ${file.name}.`);

    return pageIndices;
}

export { convertToPDF, cancelPDFProcessing, normalizePageBoxes, resizePdfPageToOutputSize, formatExifGpsCoordinates, parsePageRangeSelection, validatePageNumberStart, validatePageNumberTemplate, validateTextTemplate, validateTextOverlap, validateTextMargin, getOutputSettingsProblem, isDuplexPaddingEnabled };

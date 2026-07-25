/**
 * @fileoverview PDF processing operations including merging, scaling, and conversion
 * @author BRADSEC
 */

import { 
    formatDateTime, 
    sleep, 
    getFormattedCurrentDate, 
    displayFlashMessage, 
    formatFileSize, 
    hexToRgb,
    estimateTextWidth,
    isMobileDevice 
} from './utils.js';
import { resizeImageAndConvertToJPEG } from './image-processing.js';
import { getSelectedPaperSizePoints } from './paper-size.js';

import { 
    selectedFiles, 
    isSupportedFileType, 
    resetFiles,
    updateButtonVisibility, 
    updateToggleItemVisibility,
    updateDropAreaState
} from './file-handling.js';

import { addWatermarkToPage } from './watermark.js';
import { DOMCache } from './dom-cache.js';

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
let currentPageIndex = 0;
let conversionTimeout;
let abortController = null;

/**
 * Main PDF conversion and merging function
 * Processes all selected files and creates a merged PDF
 */
async function convertToPDF() {
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

    const runTimeout = setTimeout(() => {
        handleConversionTimeout(runController);
    }, PDF_CONFIG.TIMEOUT_DURATION);
    conversionTimeout = runTimeout;

    try {
        // Check if operation was cancelled before starting
        if (signal.aborted) {
            throw new Error('Operation was cancelled');
        }
        
        currentPageIndex = 0;
        const { PDFDocument } = PDFLib;

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const regularFont = await loadFont(pdfDoc, 'fonts/Roboto-Regular.ttf', signal);
        const boldFont = await loadFont(pdfDoc, 'fonts/Roboto-Bold.ttf', signal);
        const blackFont = await loadFont(pdfDoc, 'fonts/Roboto-Black.ttf', signal);

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

        const fileChunks = chunkArray(selectedFiles, PDF_CONFIG.BATCH_SIZE);
        let processedFiles = 0;
        const failedFiles = [];

        for (const chunk of fileChunks) {
            // Check for cancellation before processing each chunk
            if (signal.aborted) {
                throw new Error('Operation was cancelled');
            }

            await processFileChunk(chunk, pdfDoc, regularFont, boldFont, signal, failedFiles);
            processedFiles += chunk.length;
            const progressBar = DOMCache.getElementById("progress-bar");
            progressBar.style.width = `${(processedFiles / selectedFiles.length) * 100}%`;
            await sleep(500);
        }

        // Guard: if every file failed to process there is nothing to save
        if (pdfDoc.getPageCount() === 0) {
            const names = failedFiles.join(", ");
            displayFlashMessage(`No pages were produced — failed to process: ${names}`, "danger", 10000);
            return;
        }

        // Apply watermarks after all PDF processing is complete
        if (isWatermarkEnabled()) {
            const pages = pdfDoc.getPages();
            pages.forEach((page) => {
                // Use actual final page dimensions - no need for standardWidth/Height
                addWatermarkToPage(page, getWatermarkText(), blackFont);
            });
        }

        // Never save a partial document if the run was cancelled or timed out
        throwIfAborted(signal);

        const pdfBytes = await pdfDoc.save();

        // Report any partial failures alongside the success
        if (failedFiles.length > 0) {
            displayFlashMessage(`PDF Merge complete (${failedFiles.length} file(s) could not be processed: ${failedFiles.join(", ")})`, "warning");
        } else {
            displayFlashMessage("PDF Merge complete.", "success");
        }
        prepareFileLink(pdfBytes);
        resetAllSettingsToDefaults();
        
        // Clear the file list after successful merge
        resetFiles();
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

async function loadFont(pdfDoc, fontPath, signal) {
    try {
        const fontResponse = await fetch(fontPath, { signal });
        if (!fontResponse.ok) {
            throw new Error(`Failed to fetch font: ${fontResponse.status} ${fontResponse.statusText}`);
        }
        const fontBytes = await fontResponse.arrayBuffer();
        return await pdfDoc.embedFont(fontBytes);
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

async function processFileChunk(chunk, pdfDoc, regularFont, boldFont, signal, failedFiles) {
    for (let i = 0; i < chunk.length; i++) {
        // Check for cancellation before processing each file
        if (signal && signal.aborted) {
            throw new Error('Operation was cancelled');
        }

        const fileEntry = chunk[i];

        if (!isSupportedFileType(fileEntry)) {
            console.error(`Unsupported file type: ${fileEntry.name}`);
            continue;
        }
        try {
            if (fileEntry.type === 'blank') {
                const [pageWidth, pageHeight] = getSelectedPaperSize();
                pdfDoc.addPage([pageWidth, pageHeight]);
            } else {
                const fileName = fileEntry.name;
                const fileExtension = fileEntry.extension || fileName.split(".").pop().toLowerCase();
                if (PDF_CONFIG.IMAGE_EXTENSIONS.includes(fileExtension)) {
                    await processImageFile(fileEntry, pdfDoc, regularFont, boldFont, signal);
                } else if (fileExtension === "pdf") {
                    await processPdfFile(fileEntry, pdfDoc, signal);
                } else {
                    throw new Error(`Unsupported file format: ${fileExtension}`);
                }
            }
        } catch (error) {
            // Abort must stop the whole merge, not mark the file as failed
            if (error.name === 'AbortError' || (signal && signal.aborted)) {
                throw error;
            }
            console.error("Error processing file:", error);
            failedFiles.push(fileEntry.name);
        }
    }
}

async function processImageFile(fileEntry, pdfDoc, regularFont, boldFont, signal) {
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
                await addImageDetailsToPage(page, fileEntry.file, regularFont, boldFont, pageWidth, pageHeight);
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

async function processPdfFile(fileEntry, pdfDoc, signal) {
    try {
        const fileBytes = await fileEntry.file.arrayBuffer();
        throwIfAborted(signal);
        const existingPdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
            ignoreEncryption: true,
        });
        
        // null means no range entered, which falls back to all pages. An
        // entered range with zero valid tokens throws instead of merging all.
        const selectedPageIndices = getSelectedPageIndicesForFile(fileEntry, existingPdfDoc.getPageCount());
        const pagesToCopy = selectedPageIndices ?? existingPdfDoc.getPageIndices();
        
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


async function addImageDetailsToPage(page, file, regularFont, boldFont, pageWidth, pageHeight) {
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
        const pageNumberText = `Image ${currentPageIndex + 1}`;
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
        currentPageIndex++;
    }
}


function handleConversionTimeout(controller) {
    console.error("Conversion process timed out.");
    // Actually abort the in-flight operation so the heavy work stops instead of
    // continuing to run (and racing the resetPage below) after the timeout fires.
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
    
    DOMCache.getElementById("add-watermark").checked = false;
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
 * Resets all form settings to their default values
 */
function resetAllSettingsToDefaults() {
    // Reset all checkboxes to unchecked
    const checkboxes = [
        'print-image-details',
        'print-image-page-numbers',
        'print-image-hash',
        'add-watermark',
        'watermark-tiled'
    ];
    
    checkboxes.forEach(id => {
        const checkbox = DOMCache.getElementById(id);
        if (checkbox) {
            checkbox.checked = false;
            // Trigger change event to update UI visibility
            checkbox.dispatchEvent(new Event('change'));
            // Remove from localStorage if it exists
            try {
                localStorage.removeItem(id);
            } catch (error) {
                console.warn(`Failed to remove localStorage item ${id}:`, error);
            }
        }
    });
    
    // Reset watermark text input
    const watermarkText = DOMCache.getElementById('watermark-text');
    if (watermarkText) {
        watermarkText.value = '';
    }
    
    // Reset watermark color to default black
    const watermarkColor = DOMCache.getElementById('watermark-color');
    if (watermarkColor) {
        watermarkColor.value = '#000000';
    }
    
    // Reset watermark opacity to default 0.5
    const watermarkOpacity = DOMCache.getElementById('watermark-opacity');
    if (watermarkOpacity) {
        watermarkOpacity.value = '0.5';
    }
    
    // Reset watermark rotation to default -45
    const watermarkRotation = DOMCache.getElementById('watermark-rotation');
    if (watermarkRotation) {
        watermarkRotation.value = '-45';
    }
    
    // Reset watermark scale to default 1
    const watermarkScale = DOMCache.getElementById('watermark-scale');
    if (watermarkScale) {
        watermarkScale.value = '1';
    }
    
    // Reset paper size to default A4
    const paperSizeSelect = DOMCache.getElementById('paper-size-select');
    if (paperSizeSelect) {
        paperSizeSelect.value = 'A4';
        try {
            localStorage.removeItem('paper-size-select');
        } catch (error) {
            console.warn('Failed to remove paper-size-select from localStorage:', error);
        }
    }

    // Remove all watermark-related localStorage entries
    const watermarkKeys = [
        'watermark-text',
        'watermark-color', 
        'watermark-opacity',
        'watermark-rotation',
        'watermark-scale'
    ];
    
    watermarkKeys.forEach(key => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`Failed to remove localStorage item ${key}:`, error);
        }
    });
    
    // Clear all PDF page range localStorage entries
    try {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('pdf-page-range-')) {
                try {
                    localStorage.removeItem(key);
                } catch (error) {
                    console.warn(`Failed to remove localStorage key ${key}:`, error);
                }
            }
        });
    } catch (error) {
        console.warn('Failed to access localStorage keys:', error);
    }
}

function resetPage() {
    resetConversionState();
    resetFiles();
    
    // Clear file input
    const fileInput = DOMCache.getElementById("file-input");
    if (fileInput) {
        fileInput.value = "";
    }
    
    const fileLink = DOMCache.getElementById("file-link");
    if (fileLink) {
        fileLink.style.display = "none";
        fileLink.innerHTML = "";
    }
}

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
                // User cancelled the save dialog
                displayFlashMessage("Save cancelled by user", "info");
                resetPage();
                return;
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
        fileLink.href = blobUrl;
        
        // Customize message based on device type
        const isMobile = isMobileDevice();
        const downloadText = isMobile ? 
            "Tap to save file" : 
            "Click to download again";
        
        const dlAnchor = document.createElement("a");
        dlAnchor.href = blobUrl;
        dlAnchor.className = "file-link flash-success";
        dlAnchor.download = outputFilename;
        const icon = document.createElement("span");
        icon.className = "material-icons-outlined";
        icon.style.fontSize = "45px";
        icon.textContent = "picture_as_pdf";
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
        
        // Clean up the blob URL after longer delay for mobile
        const cleanupDelay = isMobile ? 120000 : 60000; // 2 minutes on mobile, 1 minute on desktop
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            fileLink.innerHTML = "";
        }, cleanupDelay);
    }
    
    // Reset the page after appropriate delay based on device
    const resetDelay = isMobileDevice() ? 15000 : 5000; // 15 seconds on mobile, 5 seconds on desktop
    setTimeout(() => {
        resetPage();
    }, resetDelay);
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
 * @returns {{pageIndices: number[], invalidTokens: string[]}} Sorted unique
 *   indices plus any tokens that could not be parsed or are out of range
 */
function parsePageRangeSelection(pageRangeValue, totalPages) {
    const pageIndices = [];
    const invalidTokens = [];
    const ranges = pageRangeValue.split(',').map(r => r.trim());

    for (const range of ranges) {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n.trim()));
            if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
                invalidTokens.push(range);
                continue;
            }
            for (let i = start; i <= end; i++) {
                pageIndices.push(i - 1); // Convert to 0-based index
            }
        } else {
            const pageNum = parseInt(range);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
                invalidTokens.push(range);
                continue;
            }
            pageIndices.push(pageNum - 1); // Convert to 0-based index
        }
    }

    // Remove duplicates and sort
    return {
        pageIndices: [...new Set(pageIndices)].sort((a, b) => a - b),
        invalidTokens
    };
}

function getSelectedPageIndicesForFile(file, totalPages) {
    // Find the corresponding page range input for this file
    const pageRangeInput = DOMCache.querySelector(`input.pdf-page-range-input[data-file-id="${file.id}"]`);

    if (!pageRangeInput) {
        return null; // If no input found, use all pages
    }

    const pageRangeValue = pageRangeInput.value.trim();
    if (!pageRangeValue) {
        return null; // Empty input means use all pages
    }

    const { pageIndices, invalidTokens } = parsePageRangeSelection(pageRangeValue, totalPages);

    for (const token of invalidTokens) {
        const label = token.includes('-') ? "page range" : "page number";
        displayFlashMessage(`Invalid ${label} "${token}" for ${file.name}. File has ${totalPages} pages.`, "warning");
    }

    // A range was entered but nothing in it is valid; merging all pages here
    // would silently ignore the user's selection, so fail this file instead.
    if (pageIndices.length === 0) {
        displayFlashMessage(`No valid pages in range "${pageRangeValue}" for ${file.name}. File was not merged.`, "danger");
        throw new Error(`No valid pages in range "${pageRangeValue}"`);
    }

    return pageIndices;
}

export { convertToPDF, cancelPDFProcessing, normalizePageBoxes, resizePdfPageToOutputSize, formatExifGpsCoordinates, parsePageRangeSelection };

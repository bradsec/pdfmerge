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

import { 
    selectedFiles, 
    isSupportedFileType, 
    updateButtonVisibility, 
    updateToggleItemVisibility,
    updateDropAreaState,
    addedFilesSet 
} from './file-handling.js';

import { addWatermarkToPage } from './watermark.js';
import { DOMCache } from './dom-cache.js';

// PDF Processing constants
const PDF_CONFIG = {
    TIMEOUT_DURATION: 60000, // 60 seconds
    BATCH_SIZE: 5,
    PAPER_DIMENSIONS: {
        A0: [841, 1189],  // mm
        A1: [594, 841],   // mm
        A2: [420, 594],   // mm
        A3: [297, 420],   // mm
        A4: [210, 297],   // mm
    },
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
    
    conversionTimeout = setTimeout(() => {
        handleConversionTimeout();
    }, PDF_CONFIG.TIMEOUT_DURATION);

    try {
        // Check if operation was cancelled before starting
        if (signal.aborted) {
            throw new Error('Operation was cancelled');
        }
        
        currentPageIndex = 0;
        const { PDFDocument, rgb } = PDFLib;

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const regularFont = await loadFont(pdfDoc, 'fonts/Roboto-Regular.ttf', signal);
        const boldFont = await loadFont(pdfDoc, 'fonts/Roboto-Bold.ttf', signal);
        const blackFont = await loadFont(pdfDoc, 'fonts/Roboto-Black.ttf', signal);

        const spinner = DOMCache.getElementById("spinner");
        const progressContainer = DOMCache.getElementById("progress-container");
        spinner.style.display = "block";
        progressContainer.style.display = "block";

        if (selectedFiles.length < 1) {
            displayFlashMessage("Please select at least one file to convert.", "warning");
            return;
        }

        const fileChunks = chunkArray(selectedFiles, PDF_CONFIG.BATCH_SIZE);
        let processedFiles = 0;

        for (const chunk of fileChunks) {
            // Check for cancellation before processing each chunk
            if (signal.aborted) {
                throw new Error('Operation was cancelled');
            }
            
            await processFileChunk(chunk, pdfDoc, regularFont, boldFont, processedFiles, signal);
            processedFiles += chunk.length;
            const progressBar = DOMCache.getElementById("progress-bar");
            progressBar.style.width = `${(processedFiles / selectedFiles.length) * 100}%`;
            await sleep(500);
        }

        // Apply watermarks after all PDF processing is complete
        if (isWatermarkEnabled()) {
            const pages = pdfDoc.getPages();
            pages.forEach((page) => {
                // Use actual final page dimensions - no need for standardWidth/Height
                addWatermarkToPage(page, getWatermarkText(), blackFont);
            });
        }

        const pdfBytes = await pdfDoc.save();
        displayFlashMessage("PDF Merge complete.", "success");
        prepareFileLink(pdfBytes);
        resetAllSettingsToDefaults();
        
        // Clear the file list after successful merge
        selectedFiles.length = 0;
        const fileList = DOMCache.getElementById("selected-files-list");
        if (fileList) {
            fileList.innerHTML = "";
        }
        updateButtonVisibility();
        updateToggleItemVisibility();
        updateDropAreaState();
    } catch (error) {
        console.error("Error during PDF conversion:", error);
        displayFlashMessage(`An error occurred during PDF conversion: ${error.message}`, "danger");
    } finally {
        resetConversionState();
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
        throw new Error(`Font loading failed for ${fontPath}: ${error.message}`);
    }
}

function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

async function processFileChunk(chunk, pdfDoc, regularFont, boldFont, startIndex, signal) {
    for (let i = 0; i < chunk.length; i++) {
        // Check for cancellation before processing each file
        if (signal && signal.aborted) {
            throw new Error('Operation was cancelled');
        }
        
        const file = chunk[i];
        const fileIndex = startIndex + i;
        
        if (!isSupportedFileType(file)) {
            console.error(`Unsupported file type: ${file.name}`);
            continue;
        }
        try {
            const fileName = file.name;
            const fileExtension = fileName.split(".").pop().toLowerCase();
            if (PDF_CONFIG.IMAGE_EXTENSIONS.includes(fileExtension)) {
                await processImageFile(file, pdfDoc, regularFont, boldFont, signal);
            } else if (fileExtension === "pdf") {
                await processPdfFile(file, pdfDoc, fileIndex, signal);
            } else {
                throw new Error(`Unsupported file format: ${fileExtension}`);
            }
        } catch (error) {
            console.error("Error processing file:", error);
        }
    }
}

async function processImageFile(file, pdfDoc, regularFont, boldFont) {
    try {
        const dataUrl = await resizeImageAndConvertToJPEG(file);
        const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

        const isLandscape = isLandscapeOrientation();
        let [pageWidth, pageHeight] = getSelectedPaperSize();
        if (isLandscape) {
            [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Printer-safe margins: 0.75 inches (54 points) for wide printer compatibility
        const safeMargin = 54;
        const leftMargin = safeMargin;
        const topMargin = safeMargin;
        const rightMargin = pageWidth - safeMargin;
        const bottomMargin = pageHeight - safeMargin;

        const image = await pdfDoc.embedJpg(imageBytes);

        if (shouldPrintImageDetails() || shouldPrintImagePageNumbers() || shouldPrintImageHash()) {
            await addImageDetailsToPage(page, file, regularFont, boldFont, pageWidth, pageHeight);
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
    } catch (error) {
        console.error(`Failed to process image file ${file.name}:`, error);
        throw new Error(`Image processing failed for ${file.name}: ${error.message}`);
    }
}

async function processPdfFile(file, pdfDoc, fileIndex) {
    try {
        const fileBytes = await file.arrayBuffer();
        const existingPdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
            ignoreEncryption: true,
        });
        
        const selectedPageIndices = getSelectedPageIndicesForFile(file, existingPdfDoc.getPageCount(), fileIndex);
        const pagesToCopy = selectedPageIndices.length > 0 ? selectedPageIndices : existingPdfDoc.getPageIndices();
        
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
                const scaleX = finalTargetWidth / currentSize.width;
                const scaleY = finalTargetHeight / currentSize.height;
                const scale = Math.min(scaleX, scaleY);
                
                // Calculate aspect ratios to determine scaling method
                const currentRatio = currentSize.width / currentSize.height;
                const targetRatio = finalTargetWidth / finalTargetHeight;
                
                if (Math.abs(targetRatio - currentRatio) > 0.1) {
                    // Different aspect ratios - use advanced scaling method
                    page.setSize(finalTargetWidth, finalTargetHeight);
                    page.scaleContent(scale, scale);
                    
                    // Center the scaled content
                    const scaledWidth = currentSize.width * scale;
                    const scaledHeight = currentSize.height * scale;
                    const offsetX = (finalTargetWidth - scaledWidth) / 2;
                    const offsetY = (finalTargetHeight - scaledHeight) / 2;
                    page.translateContent(Math.round(offsetX), Math.round(offsetY));
                } else {
                    // Similar aspect ratios - use simple scaling
                    page.scale(scaleX, scaleY);
                }
            }
        });
    } catch (error) {
        console.error(`Failed to process PDF file ${file.name}:`, error);
        throw new Error(`PDF processing failed for ${file.name}: ${error.message}`);
    }
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

async function resizeImageAndConvertToJPEG(file) {
    return new Promise((resolve, reject) => {
        if (!window.FileReader) {
            return reject("FileReader API is not supported by your browser.");
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                try {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    const isLandscape = isLandscapeOrientation();
                    let [pageWidth, pageHeight] = getSelectedPaperSize();
                    if (isLandscape) {
                        [pageWidth, pageHeight] = [pageHeight, pageWidth];
                    }

                    const widthMM = pageWidth / PDF_CONFIG.POINTS_PER_MM;
                    const heightMM = pageHeight / PDF_CONFIG.POINTS_PER_MM;
                    const maxWidthPixels = widthMM * (PDF_CONFIG.DPI / 25.4);
                    const maxHeightPixels = heightMM * (PDF_CONFIG.DPI / 25.4);

                    let width = img.width;
                    let height = img.height;
                    const scalingFactor = Math.min(
                        maxWidthPixels / width,
                        maxHeightPixels / height
                    );
                    width = width * scalingFactor;
                    height = height * scalingFactor;

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL("image/jpeg", PDF_CONFIG.IMAGE_QUALITY);
                    img.src = "";
                    canvas.remove();
                    resolve(dataUrl);
                } catch (error) {
                    console.error("Error in image processing:", error);
                    reject("Error during image processing.");
                }
            };
            img.onerror = () => {
                reject("Error loading the image file.");
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            reject("Error reading the file.");
        };
        reader.readAsDataURL(file);
    });
}

function handleConversionTimeout() {
    console.error("Conversion process timed out.");
    displayFlashMessage("Conversion process took too long and was terminated.", "danger");
    setTimeout(resetPage, 3000);
}

function resetConversionState() {
    const spinner = DOMCache.getElementById("spinner");
    const progressContainer = DOMCache.getElementById("progress-container");
    const progressBar = DOMCache.getElementById("progress-bar");
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
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
        'landscape-orientation', 
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
    selectedFiles.length = 0;
    addedFilesSet.clear();
    
    // Clear file input
    const fileInput = DOMCache.getElementById("file-input");
    if (fileInput) {
        fileInput.value = "";
    }
    
    // Clear file list DOM
    const fileList = DOMCache.getElementById("selected-files-list");
    if (fileList) {
        fileList.innerHTML = "";
    }
    
    const fileLink = DOMCache.getElementById("file-link");
    if (fileLink) {
        fileLink.style.display = "none";
        fileLink.innerHTML = "";
    }
    updateButtonVisibility();
    updateToggleItemVisibility();
    updateDropAreaState();
}

async function prepareFileLink(pdfBytes) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const defaultFilename = `PDFMerge_${getFormattedCurrentDate()}.pdf`;
    const fileSize = formatFileSize(blob.size);
    
    let savedSuccessfully = false;
    let actualFilename = defaultFilename;
    
    // Try to use the File System Access API for modern browsers
    if ('showSaveFilePicker' in window) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: defaultFilename,
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
            actualFilename = fileHandle.name;
            
            displayFlashMessage(`Successfully saved "${actualFilename}" (${fileSize})`, "success");
            
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
        anchor.download = defaultFilename;
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
        
        fileLink.innerHTML = `<a href="${blobUrl}" class="file-link flash-success" download="${defaultFilename}">
            <span class="material-icons-outlined" style="font-size:45px;">picture_as_pdf</span>
            ${defaultFilename} (${fileSize}) - ${downloadText}
        </a>`;
        fileLink.style.display = "block";
        
        // Show device-appropriate message
        if (isMobile) {
            displayFlashMessage(`PDF ready! Tap the link below to save "${defaultFilename}" (${fileSize})`, "success");
        } else {
            displayFlashMessage(`PDF downloaded as "${defaultFilename}" (${fileSize})`, "success");
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

function isLandscapeOrientation() {
    return DOMCache.getElementById("landscape-orientation").checked;
}

/**
 * Gets the selected paper size dimensions in points
 * @returns {number[]} [width, height] in points
 */
function getSelectedPaperSize() {
    const paperSizeSelect = DOMCache.getElementById("paper-size-select");
    const selectedSize = paperSizeSelect ? paperSizeSelect.value : "A4";
    const [widthMM, heightMM] = PDF_CONFIG.PAPER_DIMENSIONS[selectedSize] || PDF_CONFIG.PAPER_DIMENSIONS.A4;
    const widthPoints = widthMM * PDF_CONFIG.POINTS_PER_MM;
    const heightPoints = heightMM * PDF_CONFIG.POINTS_PER_MM;
    return [widthPoints, heightPoints];
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
                    if (tags && tags.GPSLatitude && tags.GPSLongitude) {
                        const gpsLat = tags.GPSLatitude[0] + tags.GPSLatitude[1] / 60 + tags.GPSLatitude[2] / 3600;
                        const gpsLong = tags.GPSLongitude[0] + tags.GPSLongitude[1] / 60 + tags.GPSLongitude[2] / 3600;
                        imgGpsInfo = `${gpsLat.toFixed(6)}, ${gpsLong.toFixed(6)}`;
                    }
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

function getSelectedPageIndicesForFile(file, totalPages, fileIndex) {
    // Find the corresponding page range input for this file
    const pageRangeInput = DOMCache.querySelector(`input.pdf-page-range-input[data-file-index="${fileIndex}"]`);
    
    if (!pageRangeInput) {
        return []; // If no input found, use all pages
    }
    
    const pageRangeValue = pageRangeInput.value.trim();
    if (!pageRangeValue) {
        return []; // Empty input means use all pages
    }
    
    const pageIndices = [];
    const ranges = pageRangeValue.split(',').map(r => r.trim());
    
    for (const range of ranges) {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n.trim()));
            if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
                displayFlashMessage(`Invalid page range "${range}" for ${file.name}. File has ${totalPages} pages.`, "warning");
                continue;
            }
            for (let i = start; i <= end; i++) {
                pageIndices.push(i - 1); // Convert to 0-based index
            }
        } else {
            const pageNum = parseInt(range);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
                displayFlashMessage(`Invalid page number "${range}" for ${file.name}. File has ${totalPages} pages.`, "warning");
                continue;
            }
            pageIndices.push(pageNum - 1); // Convert to 0-based index
        }
    }
    
    // Remove duplicates and sort
    return [...new Set(pageIndices)].sort((a, b) => a - b);
}

export { convertToPDF };
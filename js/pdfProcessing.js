import { 
    formatDateTime, 
    sleep, 
    getFormattedCurrentDate, 
    displayFlashMessage, 
    formatFileSize, 
    hexToRgb 
} from './utils.js';

import { 
    selectedFiles, 
    isSupportedFileType, 
    updateButtonVisibility, 
    updateToggleItemVisibility 
} from './fileHandling.js';

import { addWatermarkToPage } from './watermark.js';

const TIMEOUT_DURATION = 60000; // 60 seconds
let currentPageIndex = 0;
let conversionTimeout;

const paperDimensions = {
    A0: [841, 1189],
    A1: [594, 841],
    A2: [420, 594],
    A3: [297, 420],
    A4: [210, 297],
};

async function convertToPDF() {
    conversionTimeout = setTimeout(() => {
        handleConversionTimeout();
    }, TIMEOUT_DURATION);

    try {
        currentPageIndex = 0;
        const { PDFDocument, rgb } = PDFLib;

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const regularFont = await loadFont(pdfDoc, 'fonts/Roboto-Regular.ttf');
        const boldFont = await loadFont(pdfDoc, 'fonts/Roboto-Bold.ttf');
        const blackFont = await loadFont(pdfDoc, 'fonts/Roboto-Black.ttf');

        const spinner = document.getElementById("spinner");
        const progressContainer = document.getElementById("progress-container");
        spinner.style.display = "block";
        progressContainer.style.display = "block";

        if (selectedFiles.length < 1) {
            displayFlashMessage("Select at least one image to convert.", "warning");
            return;
        }

        const BATCH_SIZE = 5;
        const fileChunks = chunkArray(selectedFiles, BATCH_SIZE);
        let processedFiles = 0;

        for (const chunk of fileChunks) {
            await processFileChunk(chunk, pdfDoc, regularFont, boldFont);
            processedFiles += chunk.length;
            const progressBar = document.getElementById("progress-bar");
            progressBar.style.width = `${(processedFiles / selectedFiles.length) * 100}%`;
            await sleep(500);
        }

        if (isWatermarkEnabled()) {
            const pages = pdfDoc.getPages();
            pages.forEach((page) => addWatermarkToPage(page, getWatermarkText(), blackFont));
        }

        const pdfBytes = await pdfDoc.save();
        displayFlashMessage("PDF Merge complete.", "success");
        prepareFileLink(pdfBytes);
    } catch (error) {
        console.error("Error during PDF conversion:", error);
        displayFlashMessage(`An error occurred during PDF conversion: ${error.message}`, "danger");
    } finally {
        resetConversionState();
    }
}

async function loadFont(pdfDoc, fontPath) {
    const fontResponse = await fetch(fontPath);
    const fontBytes = await fontResponse.arrayBuffer();
    return await pdfDoc.embedFont(fontBytes);
}

function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

async function processFileChunk(chunk, pdfDoc, regularFont, boldFont) {
    for (const file of chunk) {
        if (!isSupportedFileType(file)) {
            console.error(`Unsupported file type: ${file.name}`);
            continue;
        }
        try {
            const fileName = file.name;
            const fileExtension = fileName.split(".").pop().toLowerCase();
            if (["jpg", "jpeg", "webp", "gif", "png"].includes(fileExtension)) {
                await processImageFile(file, pdfDoc, regularFont, boldFont);
            } else if (fileExtension === "pdf") {
                await processPdfFile(file, pdfDoc);
            } else {
                throw new Error(`Unsupported file format: ${fileExtension}`);
            }
        } catch (error) {
            console.error("Error processing file:", error);
        }
    }
}

async function processImageFile(file, pdfDoc, regularFont, boldFont) {
    const dataUrl = await resizeImageAndConvertToJPEG(file);
    const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

    const isLandscape = isLandscapeOrientation();
    let [pageWidth, pageHeight] = getSelectedPaperSize();
    if (isLandscape) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const leftMargin = 30;
    const topMargin = 40;
    const rightMargin = pageWidth - 30;
    const bottomMargin = pageHeight - 40;

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
}

async function processPdfFile(file, pdfDoc) {
    const fileBytes = await file.arrayBuffer();
    const existingPdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
        ignoreEncryption: true,
    });
    const copiedPages = await pdfDoc.copyPages(existingPdfDoc, existingPdfDoc.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));
}

function estimateTextWidth(text, fontSize) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
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

                    const widthMM = pageWidth / 2.83465;
                    const heightMM = pageHeight / 2.83465;
                    const maxWidthPixels = widthMM * (300 / 25.4);
                    const maxHeightPixels = heightMM * (300 / 25.4);

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

                    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
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
    const spinner = document.getElementById("spinner");
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
    clearTimeout(conversionTimeout);
    document.getElementById("add-watermark").checked = false;
    updateButtonVisibility();
    updateToggleItemVisibility();
}

function prepareFileLink(pdfBytes) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    const filename = `PDFMerge_${getFormattedCurrentDate()}.pdf`;
    const fileSize = formatFileSize(blob.size);
    const anchor = document.createElement("a");

    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();

    const fileLink = document.getElementById("file-link");
    fileLink.href = blobUrl;
    fileLink.innerHTML = `<a href="${blobUrl}" class="file-link flash-success"><span><img src="images/PDF_32.png" alt="PDF file icon" /></span>${filename} (${fileSize})</a>`;
    fileLink.style.display = "block";

    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        fileLink.innerHTML = "";
        resetPage();
    }, 60000);
}

function isLandscapeOrientation() {
    return document.getElementById("landscape-orientation").checked;
}

function getSelectedPaperSize() {
    const [widthMM, heightMM] = paperDimensions.A4; // Default to A4
    const widthPoints = widthMM * 2.83465;
    const heightPoints = heightMM * 2.83465;
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
    return document.getElementById("print-image-details").checked;
}

function shouldPrintImagePageNumbers() {
    return document.getElementById("print-image-page-numbers").checked;
}

function shouldPrintImageHash() {
    return document.getElementById("print-image-hash").checked;
}

function isWatermarkEnabled() {
    return document.getElementById("add-watermark").checked;
}

function getWatermarkText() {
    return document.getElementById("watermark-text").value || "PDFMerge";
}

export { convertToPDF };
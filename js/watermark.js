import { hexToRgb } from './utils.js?v=1.3.10';
import { DOMCache } from './dom-cache.js?v=1.3.10';
import { getSelectedPaperSizePoints } from './paper-size.js?v=1.3.10';

function getPageContentBounds(page) {
    const pageSize = page.getSize();
    const pageWidth = pageSize.width;
    const pageHeight = pageSize.height;
    const pageRotation = page.getRotation().angle;
    const isTransposed = pageRotation === 90 || pageRotation === 270;
    const mediaBox = typeof page.getMediaBox === 'function'
        ? page.getMediaBox()
        : { x: 0, y: 0, width: pageWidth, height: pageHeight };

    return {
        left: mediaBox.x ?? 0,
        bottom: mediaBox.y ?? 0,
        width: pageWidth,
        height: pageHeight,
        effectiveWidth: isTransposed ? pageHeight : pageWidth,
        effectiveHeight: isTransposed ? pageWidth : pageHeight,
        pageRotation
    };
}

function addWatermarkToPage(page, text, font) {
    if (!text || !text.trim()) {
        return;
    }

    const watermarkColor = DOMCache.getElementById("watermark-color").value || "#000000";
    const watermarkOpacity = parseFloat(DOMCache.getElementById("watermark-opacity").value) || 0.5;
    const watermarkRotation = (() => {
        const value = parseFloat(DOMCache.getElementById("watermark-rotation").value);
        return isNaN(value) ? -45 : value;
    })();
    const watermarkScale = (() => {
        const value = parseFloat(DOMCache.getElementById("watermark-scale").value);
        return isNaN(value) ? 1.0 : value;
    })();
    const watermarkTiled = DOMCache.getElementById("watermark-tiled").checked;
    
    const { r, g, b } = hexToRgb(watermarkColor);
    const opacity = watermarkOpacity;

    const contentBounds = getPageContentBounds(page);
    const pageRotation = contentBounds.pageRotation;
    const pageTransform = page.__pdfmergeWatermarkTransform ?? null;

    // Adjust watermark angle so it appears at the intended angle to the viewer
    // regardless of the page's display rotation.
    const adjustedRotation = watermarkRotation + pageRotation;

    if (watermarkTiled) {
        addTiledWatermark(page, text, font, contentBounds, {
            color: { r, g, b },
            opacity,
            rotation: adjustedRotation,
            scale: watermarkScale,
            pageTransform
        });
    } else {
        addSingleWatermark(page, text, font, contentBounds, {
            color: { r, g, b },
            opacity,
            rotation: adjustedRotation,
            scale: watermarkScale,
            pageTransform
        });
    }
}

function addSingleWatermark(page, text, font, contentBounds, options) {
    const baseFontSize = calculateSingleWatermarkFontSize(
        text,
        font,
        contentBounds,
        options.scale,
        getSelectedPaperSizePoints()
    );
    const fontSize = fitWatermarkFontSizeToPage(
        text,
        font,
        contentBounds,
        baseFontSize,
        options.rotation,
        0.8
    );
    const textBounds = getWatermarkTextBounds(text, font, fontSize);
    const drawPosition = getSingleWatermarkDrawPosition(contentBounds, textBounds, options.rotation);
    const compensatedDraw = compensateWatermarkDrawForPageTransform(
        { x: drawPosition.x, y: drawPosition.y, size: fontSize },
        options.pageTransform
    );

    page.drawText(text, {
        x: compensatedDraw.x,
        y: compensatedDraw.y,
        size: compensatedDraw.size,
        font,
        color: PDFLib.rgb(options.color.r, options.color.g, options.color.b),
        rotate: PDFLib.degrees(options.rotation),
        opacity: options.opacity,
    });
}

function getSingleWatermarkCenter(contentBounds) {
    const layoutBox = getWatermarkLayoutBox(contentBounds);

    return {
        centerX: layoutBox.centerX,
        centerY: layoutBox.centerY
    };
}

function getWatermarkLayoutBox(contentBounds) {
    const left = contentBounds.left ?? 0;
    const bottom = contentBounds.bottom ?? 0;
    const width = contentBounds.width ?? 0;
    const height = contentBounds.height ?? 0;

    return {
        left,
        bottom,
        width,
        height,
        right: left + width,
        top: bottom + height,
        centerX: left + (width / 2),
        centerY: bottom + (height / 2)
    };
}

function getRotatedWatermarkFootprint(textBounds, rotationDegrees) {
    const angleRadians = (rotationDegrees * Math.PI) / 180;

    const corners = [
        { x: textBounds.minX, y: textBounds.minY },
        { x: textBounds.maxX, y: textBounds.minY },
        { x: textBounds.minX, y: textBounds.maxY },
        { x: textBounds.maxX, y: textBounds.maxY }
    ].map((point) => ({
        x: point.x * Math.cos(angleRadians) - point.y * Math.sin(angleRadians),
        y: point.x * Math.sin(angleRadians) + point.y * Math.cos(angleRadians)
    }));

    const minX = Math.min(...corners.map((point) => point.x));
    const maxX = Math.max(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerOffsetX: (minX + maxX) / 2,
        centerOffsetY: (minY + maxY) / 2
    };
}

function getSingleWatermarkDrawPosition(contentBounds, textBounds, rotationDegrees) {
    const { centerX, centerY } = getSingleWatermarkCenter(contentBounds);
    const footprint = getRotatedWatermarkFootprint(textBounds, rotationDegrees);

    return {
        x: centerX - footprint.centerOffsetX,
        y: centerY - footprint.centerOffsetY
    };
}

function calculateSingleWatermarkFontSize(text, font, contentBounds, scale = 1.0, selectedPaperSizePoints = null) {
    const referenceBounds = getWatermarkReferenceBounds(contentBounds, selectedPaperSizePoints);

    return calculateWatermarkFontSize(
        referenceBounds.width,
        referenceBounds.height,
        text,
        font,
        scale
    );
}

function getWatermarkTextBounds(text, font, fontSize) {
    try {
        const fontkitFont = font?.embedder?.font;
        if (!fontkitFont?.layout || !fontkitFont.unitsPerEm) {
            throw new Error('Fontkit layout unavailable');
        }

        const layout = fontkitFont.layout(text);
        let cursorX = 0;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        layout.glyphs.forEach((glyph, index) => {
            const position = layout.positions[index];
            const bbox = glyph?.bbox;

            if (!bbox || position?.xAdvance === undefined) {
                cursorX += position?.xAdvance ?? 0;
                return;
            }

            const glyphX = cursorX + (position.xOffset ?? 0);
            const glyphY = position.yOffset ?? 0;

            minX = Math.min(minX, glyphX + bbox.minX);
            minY = Math.min(minY, glyphY + bbox.minY);
            maxX = Math.max(maxX, glyphX + bbox.maxX);
            maxY = Math.max(maxY, glyphY + bbox.maxY);

            cursorX += position.xAdvance;
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            throw new Error('No glyph bounds available');
        }

        const scale = fontSize / fontkitFont.unitsPerEm;
        return {
            minX: minX * scale,
            minY: minY * scale,
            maxX: maxX * scale,
            maxY: maxY * scale
        };
    } catch {
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        return {
            minX: 0,
            minY: 0,
            maxX: textWidth,
            maxY: textHeight
        };
    }
}

function addTiledWatermark(page, text, font, contentBounds, options) {
    const rawFontSize = calculateTiledWatermarkFontSize(
        text,
        font,
        contentBounds,
        options.scale,
        getSelectedPaperSizePoints()
    );
    const baseFontSize = fitWatermarkFontSizeToPage(
        text,
        font,
        contentBounds,
        rawFontSize,
        options.rotation,
        0.55
    );
    
    // Get text dimensions at 0 degrees
    const baseTextWidth = font.widthOfTextAtSize(text, baseFontSize);
    const baseTextHeight = font.heightAtSize(baseFontSize, { descender: false });

    const footprint = getRotatedWatermarkFootprint({
        minX: 0,
        minY: 0,
        maxX: baseTextWidth,
        maxY: baseTextHeight
    }, options.rotation);

    const positions = getTiledWatermarkPositions(contentBounds, {
        rotatedWidth: footprint.width,
        rotatedHeight: footprint.height,
        centerOffsetX: footprint.centerOffsetX,
        centerOffsetY: footprint.centerOffsetY,
        scale: options.scale
    });

    for (const { x, y } of positions) {
        const compensatedDraw = compensateWatermarkDrawForPageTransform(
            { x, y, size: baseFontSize },
            options.pageTransform
        );
        page.drawText(text, {
            x: compensatedDraw.x,
            y: compensatedDraw.y,
            size: compensatedDraw.size,
            font: font,
            color: PDFLib.rgb(options.color.r, options.color.g, options.color.b),
            rotate: PDFLib.degrees(options.rotation),
            opacity: options.opacity * 0.7,
        });
    }
}

function getTiledWatermarkPositions(contentBounds, {
    rotatedWidth,
    rotatedHeight,
    centerOffsetX = rotatedWidth / 2,
    centerOffsetY = rotatedHeight / 2,
    scale = 1
}) {
    const layoutBox = getWatermarkLayoutBox(contentBounds);
    const spacing = Math.max(rotatedWidth, rotatedHeight) * (1.2 + scale * 0.3);
    const columns = Math.ceil((layoutBox.width / 2 + rotatedWidth) / spacing);
    const rows = Math.ceil((layoutBox.height / 2 + rotatedHeight) / spacing);
    const positions = [];

    for (let row = -rows; row <= rows; row++) {
        for (let col = -columns; col <= columns; col++) {
            positions.push({
                x: layoutBox.centerX + (col * spacing) - centerOffsetX,
                y: layoutBox.centerY + (row * spacing) - centerOffsetY
            });
        }
    }

    return positions;
}

function compensateWatermarkDrawForPageTransform(draw, pageTransform = null) {
    if (!pageTransform || !pageTransform.scale || pageTransform.scale === 1) {
        return draw;
    }

    return {
        x: (draw.x - pageTransform.translateX) / pageTransform.scale,
        y: (draw.y - pageTransform.translateY) / pageTransform.scale,
        size: draw.size / pageTransform.scale
    };
}

function fitWatermarkFontSizeToPage(
    text,
    font,
    contentBounds,
    baseFontSize,
    rotationDegrees,
    maxFillRatio = 0.8
) {
    const textBounds = getWatermarkTextBounds(text, font, baseFontSize);
    const footprint = getRotatedWatermarkFootprint(textBounds, rotationDegrees);
    const layoutBox = getWatermarkLayoutBox(contentBounds);
    const maxWidth = layoutBox.width * maxFillRatio;
    const maxHeight = layoutBox.height * maxFillRatio;

    if (footprint.width <= maxWidth && footprint.height <= maxHeight) {
        return baseFontSize;
    }

    const widthScale = maxWidth / footprint.width;
    const heightScale = maxHeight / footprint.height;

    return baseFontSize * Math.min(widthScale, heightScale);
}

function calculateTiledWatermarkFontSize(text, font, contentBounds, scale = 1.0, selectedPaperSizePoints = null) {
    const referenceBounds = getWatermarkReferenceBounds(contentBounds, selectedPaperSizePoints);

    return calculateWatermarkFontSize(
        referenceBounds.width,
        referenceBounds.height,
        text,
        font,
        scale * 0.3
    );
}

function getWatermarkReferenceBounds(contentBounds, selectedPaperSizePoints = null) {
    if (!selectedPaperSizePoints) {
        return {
            width: contentBounds.width,
            height: contentBounds.height
        };
    }

    const [selectedWidth, selectedHeight] = selectedPaperSizePoints;
    const isLandscape = (contentBounds.effectiveWidth || contentBounds.width) > (contentBounds.effectiveHeight || contentBounds.height);

    return isLandscape
        ? { width: Math.max(selectedWidth, selectedHeight), height: Math.min(selectedWidth, selectedHeight) }
        : { width: Math.min(selectedWidth, selectedHeight), height: Math.max(selectedWidth, selectedHeight) };
}

// Cache for font size calculations to improve performance
const fontSizeCache = new Map();

function calculateWatermarkFontSize(pageWidth, pageHeight, text, font, scale = 1.0) {
    // Create cache key for repeated calculations (truncate very long text for cache key)
    const cacheKey = `${pageWidth}-${pageHeight}-${text.slice(0, 50)}-${scale}`;

    // Check cache first (LRU: on hit, move to end by delete + re-set)
    if (fontSizeCache.has(cacheKey)) {
        const value = fontSizeCache.get(cacheKey);
        fontSizeCache.delete(cacheKey);
        fontSizeCache.set(cacheKey, value);
        return value;
    }

    // Target watermark width: 75% of page width for good visibility, adjusted by scale
    const targetTextWidth = pageWidth * 0.75 * scale;

    // Start with a reasonable font size estimate
    let fontSize = 50;
    let textWidth = font.widthOfTextAtSize(text, fontSize);

    // Scale font size to achieve target width
    fontSize = fontSize * (targetTextWidth / textWidth);

    // Ensure reasonable bounds for readability (scaled)
    const minSize = 8 * scale;
    const maxSize = 120 * scale;
    fontSize = Math.max(minSize, Math.min(fontSize, maxSize));

    // Final check: if still too wide after max font size, scale down
    textWidth = font.widthOfTextAtSize(text, fontSize);
    const maxAllowedWidth = pageWidth * 0.9;
    if (textWidth > maxAllowedWidth) {
        fontSize = fontSize * (maxAllowedWidth / textWidth);
    }

    // Limit cache size to prevent memory issues (evict BEFORE set)
    if (fontSizeCache.size >= 100) {
        fontSizeCache.delete(fontSizeCache.keys().next().value);
    }

    // Cache the result for performance
    fontSizeCache.set(cacheKey, fontSize);

    return fontSize;
}

const IMAGE_WATERMARK_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_WATERMARK_SETTINGS = ['watermark-type', 'watermark-position', 'watermark-image-width', 'watermark-margin'];
const IMAGE_WATERMARK_STORAGE_PREFIX = 'watermark-setting:';

// Held in memory only: the privacy promise means the image is never persisted.
let watermarkImage = null;

function getWatermarkType() {
    return DOMCache.getElementById('watermark-type')?.value === 'image' ? 'image' : 'text';
}

function hasWatermarkImage() {
    return watermarkImage !== null;
}

/**
 * Identifies PNG or JPEG data by signature rather than trusting the file name
 * or browser-reported MIME type.
 * @param {Uint8Array} bytes
 * @returns {'png'|'jpg'|null}
 */
function detectWatermarkImageKind(bytes) {
    if (bytes.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((value, i) => bytes[i] === value)) {
        return 'png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
    return null;
}

function clampNumber(value, min, max, fallback) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * Centres (in visible page space) where the image watermark is drawn.
 * Edge positions keep the rotated footprint inside the margin.
 */
function getImageWatermarkCentres(visibleWidth, visibleHeight, width, height, {
    position = 'middle-centre', margin = 24, rotation = 0, tiled = false
} = {}) {
    const radians = (rotation * Math.PI) / 180;
    const footprintWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
    const footprintHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));

    if (tiled) {
        const spacing = Math.max(footprintWidth, footprintHeight) * 1.4;
        const centres = [];
        for (let y = spacing / 2; y < visibleHeight + spacing / 2; y += spacing) {
            for (let x = spacing / 2; x < visibleWidth + spacing / 2; x += spacing) centres.push({ x, y });
        }
        return centres;
    }

    const [vertical, horizontal] = position.split('-');
    const x = horizontal === 'left' ? margin + footprintWidth / 2
        : horizontal === 'right' ? visibleWidth - margin - footprintWidth / 2 : visibleWidth / 2;
    const y = vertical === 'bottom' ? margin + footprintHeight / 2
        : vertical === 'top' ? visibleHeight - margin - footprintHeight / 2 : visibleHeight / 2;
    return [{ x, y }];
}

/**
 * Maps a point in the page as displayed (after /Rotate) to PDF user space.
 */
function visibleToUserPoint(box, pageRotation, x, y) {
    switch (((pageRotation % 360) + 360) % 360) {
        case 90: return { x: box.x + box.width - y, y: box.y + x };
        case 180: return { x: box.x + box.width - x, y: box.y + box.height - y };
        case 270: return { x: box.x + y, y: box.y + box.height - x };
        default: return { x: box.x + x, y: box.y + y };
    }
}

/**
 * drawImage rotates around the image's bottom-left corner; find that corner so
 * the rotated image is centred on the requested point.
 */
function getRotatedImageOrigin(centreX, centreY, width, height, rotationDegrees) {
    const radians = (rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: centreX - (width / 2 * cos - height / 2 * sin),
        y: centreY - (width / 2 * sin + height / 2 * cos)
    };
}

async function embedWatermarkImage(pdfDoc) {
    if (!watermarkImage) return null;
    return watermarkImage.kind === 'png'
        ? pdfDoc.embedPng(watermarkImage.bytes)
        : pdfDoc.embedJpg(watermarkImage.bytes);
}

function addImageWatermarkToPage(page, image) {
    const opacity = clampNumber(DOMCache.getElementById('watermark-opacity').value, 0, 1, 0.5);
    const rotation = clampNumber(DOMCache.getElementById('watermark-rotation').value, -180, 180, 0);
    const widthPercent = clampNumber(DOMCache.getElementById('watermark-image-width').value, 5, 100, 30);
    const margin = clampNumber(DOMCache.getElementById('watermark-margin').value, 0, 50, 8.5) * 72 / 25.4;
    const tiled = DOMCache.getElementById('watermark-tiled').checked;
    const position = DOMCache.getElementById('watermark-position').value;

    const box = page.getCropBox();
    const pageRotation = ((page.getRotation().angle % 360) + 360) % 360;
    const visibleWidth = pageRotation % 180 ? box.height : box.width;
    const visibleHeight = pageRotation % 180 ? box.width : box.height;
    const width = visibleWidth * widthPercent / 100;
    const height = width * image.height / image.width;
    // Rotating by the page rotation as well keeps the requested angle as seen.
    const drawRotation = rotation + pageRotation;
    const transform = page.__pdfmergeWatermarkTransform ?? null;
    const scale = transform?.scale || 1;

    for (const centre of getImageWatermarkCentres(visibleWidth, visibleHeight, width, height,
        { position, margin, rotation, tiled })) {
        const point = visibleToUserPoint(box, pageRotation, centre.x, centre.y);
        const origin = getRotatedImageOrigin(point.x, point.y, width, height, drawRotation);
        const draw = compensateWatermarkDrawForPageTransform({ x: origin.x, y: origin.y, size: 0 }, transform);
        page.drawImage(image, {
            x: draw.x, y: draw.y, width: width / scale, height: height / scale,
            rotate: PDFLib.degrees(drawRotation), opacity
        });
    }
}

async function setWatermarkImageFile(file, status) {
    watermarkImage = null;
    if (!file) {
        status.textContent = 'No image chosen. The image stays in this tab and is never uploaded or saved.';
        return false;
    }
    if (file.size > IMAGE_WATERMARK_MAX_BYTES) {
        status.textContent = 'Image is larger than 10 MB. Choose a smaller PNG or JPG.';
        return false;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectWatermarkImageKind(bytes);
    if (!kind) {
        status.textContent = 'This file is not a PNG or JPG image.';
        return false;
    }
    watermarkImage = { bytes, kind };
    status.textContent = `${file.name} (${kind.toUpperCase()}). Kept in this tab only.`;
    return true;
}

/**
 * Replaces a short select with a row of radio buttons. The select stays as
 * the hidden source of truth so storage and change listeners keep working.
 */
function buildSegmentedControl(select) {
    const group = document.createElement('div');
    group.className = 'segmented-control';
    group.setAttribute('role', 'radiogroup');
    const label = select.labels?.[0];
    if (label) {
        label.id ||= `${select.id}-label`;
        label.removeAttribute('for');
        group.setAttribute('aria-labelledby', label.id);
    }
    for (const option of select.options) {
        const id = `${select.id}-${option.value}`;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `${select.id}-choice`;
        radio.id = id;
        radio.value = option.value;
        radio.checked = option.value === select.value;
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            select.value = radio.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const text = document.createElement('label');
        text.htmlFor = id;
        text.textContent = option.textContent;
        group.append(radio, text);
    }
    select.addEventListener('change', () => {
        const radio = group.querySelector(`input[value="${CSS.escape(select.value)}"]`);
        if (radio) radio.checked = true;
    });
    select.hidden = true;
    select.after(group);
}

function initWatermarkControls() {
    const watermarkCheckbox = DOMCache.getElementById("add-watermark");
    const watermarkGroup = DOMCache.querySelector(".watermark-group");

    if (!watermarkCheckbox || !watermarkGroup) {
        console.warn('Watermark controls not found in DOM');
        return;
    }

    // Set initial state based on checkbox value
    watermarkGroup.style.display = watermarkCheckbox.checked ? "flex" : "none";

    watermarkCheckbox.addEventListener("change", function () {
        watermarkGroup.style.display = this.checked ? "flex" : "none";
    });

    for (const id of IMAGE_WATERMARK_SETTINGS) {
        const input = DOMCache.getElementById(id);
        if (!input) continue;
        try {
            const saved = localStorage.getItem(`${IMAGE_WATERMARK_STORAGE_PREFIX}${id}`);
            if (saved !== null && (input.tagName !== 'SELECT' ||
                [...input.options].some(option => option.value === saved))) input.value = saved;
        } catch (error) {
            console.warn(`Failed to load ${id}:`, error);
        }
        input.addEventListener('change', () => {
            try { localStorage.setItem(`${IMAGE_WATERMARK_STORAGE_PREFIX}${id}`, input.value); }
            catch (error) { console.warn(`Failed to save ${id}:`, error); }
        });
    }

    const typeSelect = DOMCache.getElementById('watermark-type');
    const syncType = () => {
        const image = typeSelect.value === 'image';
        watermarkGroup.querySelectorAll('.watermark-text-only').forEach(item => { item.hidden = image; });
        watermarkGroup.querySelectorAll('.watermark-image-only').forEach(item => { item.hidden = !image; });
    };
    typeSelect?.addEventListener('change', syncType);
    if (typeSelect) {
        syncType();
        buildSegmentedControl(typeSelect);
    }

    const imageInput = DOMCache.getElementById('watermark-image');
    const status = DOMCache.getElementById('watermark-image-status');
    imageInput?.addEventListener('change', async () => {
        try {
            const valid = await setWatermarkImageFile(imageInput.files[0], status);
            if (!valid) imageInput.value = '';
        } catch (error) {
            console.error('Failed to read watermark image:', error);
            status.textContent = 'Could not read this image.';
        }
        // The preview listens for changes; signal once the bytes are ready.
        imageInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

export {
    addWatermarkToPage,
    addImageWatermarkToPage,
    detectWatermarkImageKind,
    embedWatermarkImage,
    getImageWatermarkCentres,
    getRotatedImageOrigin,
    getWatermarkType,
    hasWatermarkImage,
    visibleToUserPoint,
    calculateSingleWatermarkFontSize,
    calculateTiledWatermarkFontSize,
    compensateWatermarkDrawForPageTransform,
    fitWatermarkFontSizeToPage,
    getPageContentBounds,
    getRotatedWatermarkFootprint,
    getSingleWatermarkCenter,
    getSingleWatermarkDrawPosition,
    getTiledWatermarkPositions,
    getWatermarkReferenceBounds,
    initWatermarkControls
};

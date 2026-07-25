import { hexToRgb } from './utils.js';
import { DOMCache } from './dom-cache.js';
import { getSelectedPaperSizePoints } from './paper-size.js';

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
}

export {
    addWatermarkToPage,
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

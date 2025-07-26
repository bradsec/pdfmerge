import { hexToRgb } from './utils.js';
import { DOMCache } from './dom-cache.js';

function addWatermarkToPage(page, text, font) {
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

    // Use actual final page dimensions after all PDF processing is complete
    const pageSize = page.getSize();
    const pageWidth = pageSize.width;
    const pageHeight = pageSize.height;
    
    let contentBounds;
    if (watermarkTiled) {
        // For tiled watermarks, use exact page dimensions
        contentBounds = {
            left: 0,
            bottom: 0,
            width: pageWidth,
            height: pageHeight
        };
    } else {
        // For single watermarks, use safe print margins
        contentBounds = getPageContentBounds(page, pageWidth, pageHeight);
    }
    
    if (watermarkTiled) {
        addTiledWatermark(page, text, font, contentBounds, {
            color: { r, g, b },
            opacity,
            rotation: watermarkRotation,
            scale: watermarkScale
        });
    } else {
        addSingleWatermark(page, text, font, contentBounds, {
            color: { r, g, b },
            opacity,
            rotation: watermarkRotation,
            scale: watermarkScale
        });
    }
}

function getPageContentBounds(page, width, height) {
    // Printer-safe margins: 0.75 inches (54 points) for wide printer compatibility
    // This matches the safe margin used in PDF processing for images
    const safeMargin = 54;
    
    let contentBounds;
    
    try {
        // Method 1: Try to get crop box first (most accurate for content)
        const cropBox = page.getCropBox();
        if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
            contentBounds = {
                left: cropBox.x,
                bottom: cropBox.y,
                width: cropBox.width,
                height: cropBox.height
            };
        }
    } catch (error) {
        // Crop box not available
    }
    
    if (!contentBounds) {
        try {
            // Method 2: Try media box
            const mediaBox = page.getMediaBox();
            if (mediaBox && mediaBox.width > 0 && mediaBox.height > 0) {
                contentBounds = {
                    left: mediaBox.x,
                    bottom: mediaBox.y,
                    width: mediaBox.width,
                    height: mediaBox.height
                };
            }
        } catch (error) {
            // Media box not available
        }
    }
    
    // Method 3: Fallback to page size (most reliable)
    if (!contentBounds) {
        contentBounds = {
            left: 0,
            bottom: 0,
            width: width,
            height: height
        };
    }
    
    // Apply printer-safe margins to ensure watermarks stay within printable area
    // This ensures watermarks will be visible when printed on any standard printer
    const printableWidth = contentBounds.width - (safeMargin * 2);
    const printableHeight = contentBounds.height - (safeMargin * 2);
    
    // Ensure we have a reasonable printable area (minimum 200x200 points)
    if (printableWidth < 200 || printableHeight < 200) {
        console.warn('Page too small for safe margins, using reduced margins for watermark');
        const reducedMargin = Math.min(safeMargin / 2, Math.min(contentBounds.width, contentBounds.height) / 10);
        return {
            left: contentBounds.left + reducedMargin,
            bottom: contentBounds.bottom + reducedMargin,
            width: contentBounds.width - (reducedMargin * 2),
            height: contentBounds.height - (reducedMargin * 2)
        };
    }
    
    return {
        left: contentBounds.left + safeMargin,
        bottom: contentBounds.bottom + safeMargin,
        width: printableWidth,
        height: printableHeight
    };
}

function addSingleWatermark(page, text, font, contentBounds, options) {
    const fontSize = calculateWatermarkFontSize(contentBounds.width, contentBounds.height, text, font, options.scale);

    // Get precise text dimensions for accurate centering
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize, { descender: false });

    // Calculate true center of the content area
    const centerX = contentBounds.left + contentBounds.width / 2;
    const centerY = contentBounds.bottom + contentBounds.height / 2;
    
    // Convert angle to radians for calculations
    const angleRadians = (options.rotation * Math.PI) / 180;
    
    // Calculate the offset needed to center the rotated text
    const offsetX = (textWidth / 2) * Math.cos(angleRadians) - (textHeight / 2) * Math.sin(angleRadians);
    const offsetY = (textWidth / 2) * Math.sin(angleRadians) + (textHeight / 2) * Math.cos(angleRadians);
    
    const x = centerX - offsetX;
    const y = centerY - offsetY;

    page.drawText(text, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: PDFLib.rgb(options.color.r, options.color.g, options.color.b),
        rotate: PDFLib.degrees(options.rotation),
        opacity: options.opacity,
    });
}

function addTiledWatermark(page, text, font, contentBounds, options) {
    // Calculate base font size for tiled watermarks
    const baseFontSize = calculateWatermarkFontSize(contentBounds.width, contentBounds.height, text, font, options.scale * 0.3);
    
    // Get text dimensions at 0 degrees
    const baseTextWidth = font.widthOfTextAtSize(text, baseFontSize);
    const baseTextHeight = font.heightAtSize(baseFontSize, { descender: false });
    
    // Calculate rotated text bounding box
    const angleRadians = (options.rotation * Math.PI) / 180;
    const cosAngle = Math.abs(Math.cos(angleRadians));
    const sinAngle = Math.abs(Math.sin(angleRadians));
    
    // Effective dimensions after rotation
    const rotatedWidth = baseTextWidth * cosAngle + baseTextHeight * sinAngle;
    const rotatedHeight = baseTextWidth * sinAngle + baseTextHeight * cosAngle;
    
    // Simple spacing calculation based on scale
    const spacing = Math.max(rotatedWidth, rotatedHeight) * (1.2 + options.scale * 0.3);
    
    // Calculate how many watermarks fit across width and height
    // Add extra to ensure coverage beyond edges
    const numX = Math.ceil(contentBounds.width / spacing) + 2;
    const numY = Math.ceil(contentBounds.height / spacing) + 2;
    
    // Start from negative position to ensure edge coverage
    const startX = -(spacing / 2);
    const startY = -(spacing / 2);
    
    // Draw watermarks in a simple grid
    for (let row = 0; row < numY; row++) {
        for (let col = 0; col < numX; col++) {
            const x = startX + (col * spacing);
            const y = startY + (row * spacing);
            
            page.drawText(text, {
                x: x,
                y: y,
                size: baseFontSize,
                font: font,
                color: PDFLib.rgb(options.color.r, options.color.g, options.color.b),
                rotate: PDFLib.degrees(options.rotation),
                opacity: options.opacity * 0.7,
            });
        }
    }
}

// Cache for font size calculations to improve performance
const fontSizeCache = new Map();

function calculateWatermarkFontSize(pageWidth, pageHeight, text, font, scale = 1.0) {
    // Create cache key for repeated calculations (truncate very long text for cache key)
    const cacheKey = `${pageWidth}-${pageHeight}-${text.slice(0, 50)}-${scale}`;
    if (fontSizeCache.has(cacheKey)) {
        return fontSizeCache.get(cacheKey);
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
    
    // Cache the result for performance
    fontSizeCache.set(cacheKey, fontSize);
    
    // Clear cache if it gets too large (memory management)
    if (fontSizeCache.size > 100) {
        fontSizeCache.clear();
    }
    
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

export { addWatermarkToPage, initWatermarkControls };
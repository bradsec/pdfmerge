/**
 * @fileoverview Bold, italic and underline for drawn text. Italic is a
 * synthetic slant because only upright Roboto files are bundled; underline is
 * a line drawn along the rotated baseline.
 */

import { DOMCache } from './dom-cache.js?v=1.3.21';

const ITALIC_SLANT_DEGREES = 12;
// Fractions of the font size, close to Roboto's own underline metrics.
const UNDERLINE_OFFSET = 0.12;
const UNDERLINE_THICKNESS = 0.06;

export function getTextStyle(prefix) {
    const checked = name => DOMCache.getElementById(`${prefix}-${name}`)?.checked === true;
    return { bold: checked('bold'), italic: checked('italic'), underline: checked('underline') };
}

/** Start and end of an underline below a baseline that runs at rotationDegrees. */
export function underlineSegment(x, y, width, size, rotationDegrees) {
    const radians = rotationDegrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const drop = UNDERLINE_OFFSET * size;
    const start = { x: x + drop * sin, y: y - drop * cos };
    return { start, end: { x: start.x + width * cos, y: start.y + width * sin }, thickness: UNDERLINE_THICKNESS * size };
}

export function drawStyledText(page, text, { x, y, size, font, color, opacity = 1, rotation = 0, style = {} }) {
    page.drawText(text, {
        x, y, size, font, color, opacity,
        rotate: PDFLib.degrees(rotation),
        // ySkew slants glyphs along the baseline; xSkew would tilt the baseline.
        ySkew: PDFLib.degrees(style.italic ? ITALIC_SLANT_DEGREES : 0)
    });
    if (!style.underline) return;
    const line = underlineSegment(x, y, font.widthOfTextAtSize(text, size), size, rotation);
    page.drawLine({ ...line, color, opacity });
}

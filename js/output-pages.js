export function needsDuplexPadding(pageCount, isFinalCard) {
    return !isFinalCard && pageCount % 2 === 1;
}

export function formatPageNumber(number, total, format) {
    return format === 'page-of-total' ? `Page ${number} of ${total}` : String(number);
}

export function parsePageNumberStart(value) {
    const text = String(value).trim();
    const number = Number(text);
    return /^\d+$/.test(text) && Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export function getPageNumberPlacement(cropBox, angle, position, textWidth, fontSize) {
    const rotation = ((angle % 360) + 360) % 360;
    const visibleWidth = rotation % 180 ? cropBox.height : cropBox.width;
    const visibleHeight = rotation % 180 ? cropBox.width : cropBox.height;
    const x = position === 'bottom-centre'
        ? (visibleWidth - textWidth) / 2
        : visibleWidth - 24 - textWidth;
    const y = position === 'top-right' ? visibleHeight - 24 - fontSize : 24;

    switch (rotation) {
        case 90: return { x: cropBox.x + cropBox.width - y, y: cropBox.y + x, rotation };
        case 180: return { x: cropBox.x + cropBox.width - x, y: cropBox.y + cropBox.height - y, rotation };
        case 270: return { x: cropBox.x + y, y: cropBox.y + cropBox.height - x, rotation };
        default: return { x: cropBox.x + x, y: cropBox.y + y, rotation };
    }
}

export function clampViewerZoom(zoom) {
    return Math.max(1, Math.min(4, zoom));
}

export function cappedRenderScale(fitScale, zoom, width, height, devicePixelRatio, maxPixels = 16000000) {
    return Math.min(fitScale * zoom, Math.sqrt(maxPixels / (width * height)) / devicePixelRatio);
}

export function anchorScroll(fraction, contentSize, viewportPoint, contentOffset) {
    return contentOffset + fraction * contentSize - viewportPoint;
}

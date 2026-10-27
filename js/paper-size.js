import { DOMCache } from './dom-cache.js?v=1.3.21';

const PAPER_DIMENSIONS_MM = {
    A0: [841, 1189],
    A1: [594, 841],
    A2: [420, 594],
    A3: [297, 420],
    A4: [210, 297],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
    Tabloid: [279.4, 431.8]
};

const POINTS_PER_MM = 2.83465;

export function getDefaultPaperSizeValue() {
    return 'A4';
}

export function getPaperDimensionsMm(size = getDefaultPaperSizeValue()) {
    return PAPER_DIMENSIONS_MM[size] || PAPER_DIMENSIONS_MM[getDefaultPaperSizeValue()];
}

export function getSelectedPaperSizePoints() {
    const paperSizeSelect = DOMCache.getElementById('paper-size-select');
    const selectedSize = paperSizeSelect ? paperSizeSelect.value : getDefaultPaperSizeValue();
    const [widthMM, heightMM] = getPaperDimensionsMm(selectedSize);

    return [widthMM * POINTS_PER_MM, heightMM * POINTS_PER_MM];
}

export function initializePaperSizeSelect(selectElement, storage = null, storageKey = 'paper-size-select') {
    if (!selectElement) {
        return;
    }

    selectElement.value = getDefaultPaperSizeValue();

    if (storage && typeof storage.removeItem === 'function') {
        try {
            storage.removeItem(storageKey);
        } catch (error) {
            console.warn('Failed to clear saved paper size preference:', error);
        }
    }
}

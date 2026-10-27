import { parsePageRangeSelection } from './page-range.js?v=1.3.16';
import { needsDuplexPadding } from './output-pages.js?v=1.3.16';

/**
 * Pages each card contributes to the merged output, in order. Returns null
 * when a card's page count is not known yet (PDF still loading) or its page
 * range is invalid, because later page positions then cannot be predicted.
 * @returns {Array<{pages: number, padding: number}>|null}
 */
export function planOutputPages(files, { duplexPadding }) {
    const plan = [];
    for (const [index, file] of files.entries()) {
        const extension = file.extension || file.name?.split('.').pop().toLowerCase();
        let pages;
        if (file.type === 'blank' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            pages = 1;
        } else if (extension === 'pdf' && Number.isInteger(file.pageCount) && file.pageCount > 0) {
            if (file.pageRange?.trim()) {
                const range = parsePageRangeSelection(file.pageRange, file.pageCount);
                if (range.invalidTokens.length) return null;
                pages = range.pageIndices.length;
            } else {
                pages = file.pageCount;
            }
        } else {
            return null;
        }
        const padding = duplexPadding && needsDuplexPadding(pages, index === files.length - 1) ? 1 : 0;
        plan.push({ pages, padding });
    }
    return plan;
}

export function countOutputPages(files, options) {
    const plan = planOutputPages(files, options);
    if (!plan) return { count: null, exact: false };
    return { count: plan.reduce((sum, card) => sum + card.pages + card.padding, 0), exact: true };
}

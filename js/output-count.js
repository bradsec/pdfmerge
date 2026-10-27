import { parsePageRangeSelection } from './page-range.js?v=1.3.5';
import { needsDuplexPadding } from './output-pages.js?v=1.3.5';

export function countOutputPages(files, { duplexPadding }) {
    let count = 0;
    for (const [index, file] of files.entries()) {
        const extension = file.extension || file.name?.split('.').pop().toLowerCase();
        let pages;
        if (file.type === 'blank' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            pages = 1;
        } else if (extension === 'pdf' && Number.isInteger(file.pageCount) && file.pageCount > 0) {
            if (file.pageRange?.trim()) {
                const range = parsePageRangeSelection(file.pageRange, file.pageCount);
                if (range.invalidTokens.length) return { count: null, exact: false };
                pages = range.pageIndices.length;
            } else {
                pages = file.pageCount;
            }
        } else {
            return { count: null, exact: false };
        }
        count += pages;
        if (duplexPadding && needsDuplexPadding(pages, index === files.length - 1)) count++;
    }
    return { count, exact: true };
}

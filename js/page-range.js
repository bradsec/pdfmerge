export function parsePageRangeSelection(value, totalPages, collectIndices = true) {
    const pageIndices = [];
    const invalidTokens = [];

    for (const rawToken of value.split(',')) {
        const token = rawToken.trim();
        const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(rawToken);
        const start = match ? Number(match[1]) : NaN;
        const end = match?.[2] ? Number(match[2]) : start;

        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
            start < 1 || end > totalPages || start > end) {
            invalidTokens.push(token);
            continue;
        }

        if (collectIndices) {
            for (let page = start; page <= end; page++) {
                pageIndices.push(page - 1);
            }
        }
    }

    return { pageIndices, invalidTokens };
}

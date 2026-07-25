import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateSingleWatermarkFontSize,
    calculateTiledWatermarkFontSize,
    compensateWatermarkDrawForPageTransform,
    fitWatermarkFontSizeToPage,
    getRotatedWatermarkFootprint,
    getPageContentBounds,
    getSingleWatermarkCenter,
    getSingleWatermarkDrawPosition,
    getTiledWatermarkPositions,
    getWatermarkReferenceBounds
} from '../js/watermark.js';

test('watermark bounds use media box origin for imported PDF pages', () => {
    const page = {
        getSize() {
            return { width: 600, height: 800 };
        },
        getRotation() {
            return { angle: 0 };
        },
        getMediaBox() {
            return { x: 100, y: 200, width: 600, height: 800 };
        }
    };

    assert.deepEqual(getPageContentBounds(page), {
        left: 100,
        bottom: 200,
        width: 600,
        height: 800,
        effectiveWidth: 600,
        effectiveHeight: 800,
        pageRotation: 0
    });
});

test('watermark bounds use final page size, not media box size, for scaling', () => {
    const page = {
        getSize() {
            return { width: 595, height: 842 };
        },
        getRotation() {
            return { angle: 0 };
        },
        getMediaBox() {
            return { x: 0, y: 0, width: 612, height: 792 };
        }
    };

    assert.deepEqual(getPageContentBounds(page), {
        left: 0,
        bottom: 0,
        width: 595,
        height: 842,
        effectiveWidth: 595,
        effectiveHeight: 842,
        pageRotation: 0
    });
});

test('watermark bounds transpose effective dimensions for rotated pages', () => {
    const page = {
        getSize() {
            return { width: 600, height: 800 };
        },
        getRotation() {
            return { angle: 90 };
        },
        getMediaBox() {
            return { x: 0, y: 0, width: 600, height: 800 };
        }
    };

    assert.deepEqual(getPageContentBounds(page), {
        left: 0,
        bottom: 0,
        width: 600,
        height: 800,
        effectiveWidth: 800,
        effectiveHeight: 600,
        pageRotation: 90
    });
});

test('single watermark center includes imported page origin offset', () => {
    assert.deepEqual(
        getSingleWatermarkCenter({
            left: 100,
            bottom: 200,
            width: 595,
            height: 842
        }),
        {
            centerX: 397.5,
            centerY: 621
        }
    );
});

test('tiled watermark font size matches across image and imported PDF pages for the same output size', () => {
    const font = {
        widthOfTextAtSize(text, fontSize) {
            return text.length * fontSize * 0.5;
        },
        heightAtSize(fontSize) {
            return fontSize;
        }
    };

    const imagePageBounds = {
        left: 0,
        bottom: 0,
        width: 595,
        height: 842,
        effectiveWidth: 595,
        effectiveHeight: 842
    };

    const importedPdfBounds = {
        left: 100,
        bottom: 200,
        width: 595,
        height: 842,
        effectiveWidth: 595,
        effectiveHeight: 842
    };

    assert.equal(
        calculateTiledWatermarkFontSize('PDFMerge', font, imagePageBounds, 1, [595, 842]),
        calculateTiledWatermarkFontSize('PDFMerge', font, importedPdfBounds, 1, [595, 842])
    );
});

test('single watermark font size uses selected output paper size consistently', () => {
    const font = {
        widthOfTextAtSize(text, fontSize) {
            return text.length * fontSize * 0.5;
        },
        heightAtSize(fontSize) {
            return fontSize;
        }
    };

    const imagePageBounds = {
        left: 0,
        bottom: 0,
        width: 595,
        height: 842,
        effectiveWidth: 595,
        effectiveHeight: 842
    };

    const importedPdfBounds = {
        left: 100,
        bottom: 200,
        width: 595,
        height: 842,
        effectiveWidth: 595,
        effectiveHeight: 842
    };

    assert.equal(
        calculateSingleWatermarkFontSize('PDFMerge', font, imagePageBounds, 1, [841.89, 1190.55]),
        calculateSingleWatermarkFontSize('PDFMerge', font, importedPdfBounds, 1, [841.89, 1190.55])
    );
});

test('tiled watermark reference bounds follow selected output paper size', () => {
    assert.deepEqual(
        getWatermarkReferenceBounds(
            { width: 612, height: 792, effectiveWidth: 612, effectiveHeight: 792 },
            [595, 842]
        ),
        { width: 595, height: 842 }
    );

    assert.deepEqual(
        getWatermarkReferenceBounds(
            { width: 792, height: 612, effectiveWidth: 792, effectiveHeight: 612 },
            [595, 842]
        ),
        { width: 842, height: 595 }
    );
});

test('single watermark draw position stays centered on the final output box for landscape pages', () => {
    const textBounds = {
        minX: 0,
        minY: -20,
        maxX: 400,
        maxY: 80
    };

    const placement = getSingleWatermarkDrawPosition(
        {
            left: 0,
            bottom: 0,
            width: 1190.55,
            height: 841.89
        },
        textBounds,
        -45
    );

    const footprint = getRotatedWatermarkFootprint(textBounds, -45);

    assert.ok(Math.abs((placement.x + footprint.centerOffsetX) - 595.275) < 0.001);
    assert.ok(Math.abs((placement.y + footprint.centerOffsetY) - 420.945) < 0.001);
});

test('tiled watermark positions are anchored to the page bounds origin', () => {
    const positions = getTiledWatermarkPositions(
        {
            left: 100,
            bottom: 200,
            width: 595,
            height: 842
        },
        {
            rotatedWidth: 180,
            rotatedHeight: 120,
            scale: 1
        }
    );

    const xs = positions.map(({ x }) => x);
    const ys = positions.map(({ y }) => y);

    assert.ok(Math.min(...xs) < 100);
    assert.ok(Math.max(...xs) > 695);
    assert.ok(Math.min(...ys) < 200);
    assert.ok(Math.max(...ys) > 1042);
});

test('tiled watermark positions cover large-format landscape pages edge to edge', () => {
    const positions = getTiledWatermarkPositions(
        {
            left: 0,
            bottom: 0,
            width: 1683.78,
            height: 1189.13
        },
        {
            rotatedWidth: 300,
            rotatedHeight: 180,
            scale: 1
        }
    );

    const xs = positions.map(({ x }) => x);
    const ys = positions.map(({ y }) => y);

    assert.ok(Math.min(...xs) < 0);
    assert.ok(Math.max(...xs) > 1683.78);
    assert.ok(Math.min(...ys) < 0);
    assert.ok(Math.max(...ys) > 1189.13);
    assert.ok(positions.some(({ x, y }) => x > 600 && x < 1100 && y > 400 && y < 800));
});

test('rotation-aware single watermark sizing keeps long text within portrait A2 bounds', () => {
    const font = {
        widthOfTextAtSize(text, fontSize) {
            return text.length * fontSize * 0.62;
        },
        heightAtSize(fontSize) {
            return fontSize;
        }
    };

    const contentBounds = {
        left: 0,
        bottom: 0,
        width: 1190.553,
        height: 1683.7821,
        effectiveWidth: 1190.553,
        effectiveHeight: 1683.7821
    };

    const fontSize = fitWatermarkFontSizeToPage(
        'THIS IS A MUCH LONGER WATERMARK TO TEST BOUNDS',
        font,
        contentBounds,
        calculateSingleWatermarkFontSize(
            'THIS IS A MUCH LONGER WATERMARK TO TEST BOUNDS',
            font,
            contentBounds,
            3,
            [1190.553, 1683.7821]
        ),
        -45,
        0.8
    );

    const textBounds = {
        minX: 0,
        minY: 0,
        maxX: font.widthOfTextAtSize('THIS IS A MUCH LONGER WATERMARK TO TEST BOUNDS', fontSize),
        maxY: font.heightAtSize(fontSize)
    };
    const placement = getSingleWatermarkDrawPosition(contentBounds, textBounds, -45);
    const footprint = getRotatedWatermarkFootprint(textBounds, -45);

    assert.ok((placement.x + footprint.minX) >= 0);
    assert.ok((placement.y + footprint.minY) >= 0);
    assert.ok((placement.x + footprint.maxX) <= contentBounds.width);
    assert.ok((placement.y + footprint.maxY) <= contentBounds.height);
});

test('rotation-aware tiled watermark sizing caps oversized scale for landscape pages', () => {
    const font = {
        widthOfTextAtSize(text, fontSize) {
            return text.length * fontSize * 0.62;
        },
        heightAtSize(fontSize) {
            return fontSize;
        }
    };

    const contentBounds = {
        left: 0,
        bottom: 0,
        width: 1683.7821,
        height: 1190.553,
        effectiveWidth: 1683.7821,
        effectiveHeight: 1190.553
    };

    const baseSize = calculateTiledWatermarkFontSize(
        'CONFIDENTIAL COPY',
        font,
        contentBounds,
        3,
        [1190.553, 1683.7821]
    );

    const fittedSize = fitWatermarkFontSizeToPage(
        'CONFIDENTIAL COPY',
        font,
        contentBounds,
        baseSize,
        -45,
        0.55
    );

    const textBounds = {
        minX: 0,
        minY: 0,
        maxX: font.widthOfTextAtSize('CONFIDENTIAL COPY', fittedSize),
        maxY: font.heightAtSize(fittedSize)
    };
    const footprint = getRotatedWatermarkFootprint(textBounds, -45);

    assert.ok(footprint.width <= contentBounds.width * 0.55);
    assert.ok(footprint.height <= contentBounds.height * 0.55);
});

test('compensateWatermarkDrawForPageTransform cancels imported PDF scaling before drawing', () => {
    assert.deepEqual(
        compensateWatermarkDrawForPageTransform(
            { x: 985, y: 1832, size: 120 },
            { scale: 3.973234416666666, translateX: -397, translateY: -795 }
        ),
        {
            x: (985 + 397) / 3.973234416666666,
            y: (1832 + 795) / 3.973234416666666,
            size: 120 / 3.973234416666666
        }
    );
});

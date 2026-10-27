import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from './import-app.mjs';

const { needsDuplexPadding, formatPageNumber, getPageNumberPlacement, parsePageNumberStart,
    parsePageNumberTemplate, fitPageNumberSize, formatDateTime, getTextPlacement,
    getTextOverlap, needsNumberingStart, shouldDrawOnPage, mmToPt,
    parseTextMargin, getTextBox, parseExifDateTime } = await importApp('output-pages.js');

test('duplex pads odd non-final cards only', () => {
    assert.equal(needsDuplexPadding(3, false), true);
    assert.equal(needsDuplexPadding(2, false), false);
    assert.equal(needsDuplexPadding(3, true), false);
    const cardCounts = [2, 3, 1];
    const outputCount = cardCounts.reduce((total, count, index) =>
        total + count + Number(needsDuplexPadding(count, index === cardCounts.length - 1)), 0);
    assert.equal(outputCount, 7);
});

test('template parser accepts placeholders, padding, and escaped braces', () => {
    const parsed = parsePageNumberTemplate('{{{file}}} {n:3} / {total:2}');
    assert.equal(parsed.error, undefined);
    assert.equal(formatPageNumber(4, 9, parsed.tokens, 'Contract'), '{Contract} 004 / 09');
    assert.equal(formatPageNumber(4, 9, parsePageNumberTemplate('{n:1}').tokens), '4');
    assert.equal(formatPageNumber(4, 9, parsePageNumberTemplate('{n:6}').tokens), '000004');
});

test('template parser rejects empty, long, missing number, and malformed placeholders', () => {
    for (const template of ['', ' ', 'x'.repeat(101), '{file}', '{foo} {n}', '{n:9}',
        '{total:0} {n}', '{n:}', '{n', '{n} }', '{n} {']) {
        assert.ok(parsePageNumberTemplate(template).error, template);
    }
    assert.ok(parsePageNumberTemplate('{n}' + 'x'.repeat(97)).tokens);
});

test('header and footer templates allow plain text but keep placeholder validation', () => {
    const plain = parsePageNumberTemplate('CONFIDENTIAL', { requireNumber: false });
    assert.equal(formatPageNumber(7, 12, plain.tokens), 'CONFIDENTIAL');
    const tokens = parsePageNumberTemplate('{file} {date:YYYY-MM-DD} {total:2}', { requireNumber: false }).tokens;
    assert.equal(formatPageNumber(7, 12, tokens, 'Contract', new Date(2024, 0, 8)),
        'Contract 2024-01-08 12');
    assert.ok(parsePageNumberTemplate('CONFIDENTIAL').error);
    for (const template of ['', '{foo}', '{n:9}', 'x'.repeat(101)]) {
        assert.ok(parsePageNumberTemplate(template, { requireNumber: false }).error, template);
    }
});

test('date and time templates parse defaults, formats, colons, and bracket literals', () => {
    const tokens = parsePageNumberTemplate('{n} {date} {time:hh:mm A} {date:[Day] D}').tokens;
    assert.deepEqual(tokens.slice(2).filter(token => typeof token !== 'string'), [
        { name: 'date', format: 'YYYY-MM-DD' },
        { name: 'time', format: 'hh:mm A' },
        { name: 'date', format: '[Day] D' }
    ]);
    for (const template of ['{n} {date:}', '{n} {time:}', '{n} {date:YYYY{MM}', '{n} {time:HH{mm}', '{n} {date:YYYY}}']) {
        assert.ok(parsePageNumberTemplate(template).error, template);
    }
});

test('date formatter uses local fields, longest tokens, literals, and 12-hour boundaries', () => {
    const midnight = new Date(2024, 0, 8, 0, 5, 9);
    assert.equal(formatDateTime(midnight, 'YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm ss A'),
        '2024 24 January Jan 01 1 08 8 Monday Mon 00 0 12 12 05 09 AM');
    assert.equal(formatDateTime(midnight, '[Day] D [at] hh:mm A'), 'Day 8 at 12:05 AM');
    assert.equal(formatDateTime(new Date(2024, 0, 8, 12, 5), 'hh:mm A HH:mm'), '12:05 PM 12:05');
    assert.equal(formatDateTime(new Date(2024, 0, 8, 13, 5), 'h A'), '1 PM');
});

test('full template renders date and time from the passed merge timestamp', () => {
    const date = new Date(2024, 0, 8, 13, 5);
    const tokens = parsePageNumberTemplate('{file} {n:3} {date:D MMM YYYY} {time:hh:mm A} {date:YYYY-MM-DD HH:mm}').tokens;
    assert.equal(formatPageNumber(2, 12, tokens, 'Contract', date),
        'Contract 002 8 Jan 2024 01:05 PM 2024-01-08 13:05');
    assert.equal(formatPageNumber(2, 12, parsePageNumberTemplate('{n} {date} {time}').tokens, '', date),
        '2 2024-01-08 13:05');
});

test('rendering uses file name and collapses whitespace', () => {
    const tokens = parsePageNumberTemplate('{file} - {n} of {total}').tokens;
    assert.equal(formatPageNumber(2, 12, tokens, 'Contract'), 'Contract - 2 of 12');
    assert.equal(formatPageNumber(2, 12, tokens, ''), '- 2 of 12');
    assert.equal(formatPageNumber(2, 12, parsePageNumberTemplate('Page  {n}\n of {total}').tokens), 'Page 2 of 12');
});

test('page number font shrinks to fit visible width and stops at six points', () => {
    const widthAtTen = size => size * 20;
    assert.equal(fitPageNumberSize(228, widthAtTen), 9);
    assert.equal(fitPageNumberSize(100, widthAtTen), 6);
    assert.equal(fitPageNumberSize(228, widthAtTen, 36), 7.8);
});

test('margin accepts half-millimetre values from zero through fifty', () => {
    assert.equal(mmToPt(25.4), 72);
    assert.ok(Math.abs(mmToPt(8.5) - 24.094488188976378) < 1e-12);
    for (const value of ['0', '8.5', '50', '8.50']) assert.equal(parseTextMargin(value), Number(value));
    for (const value of ['', '-0.5', '50.5', '8.25', 'abc', 'Infinity']) {
        assert.equal(parseTextMargin(value), null, value);
    }
});

test('page number start must be a positive safe integer', () => {
    assert.equal(parsePageNumberStart(' 2 '), 2);
    for (const value of ['', '0', '-1', '1.5', '2x', '9007199254740993']) {
        assert.equal(parsePageNumberStart(value), null);
    }
});

test('page number coordinates stay in visible page across quarter turns', () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    assert.deepEqual(getPageNumberPlacement(box, 0, 'bottom-centre', 20, 10),
        { x: 300, y: 44, rotation: 0 });
    assert.deepEqual(getPageNumberPlacement(box, 90, 'bottom-right', 20, 10),
        { x: 586, y: 776, rotation: 90 });
    assert.deepEqual(getPageNumberPlacement(box, 180, 'top-right', 20, 10),
        { x: 54, y: 54, rotation: 180 });
    assert.deepEqual(getPageNumberPlacement(box, 270, 'bottom-right', 20, 10),
        { x: 34, y: 64, rotation: 270 });
});

test('top and bottom alignment stays on visible edges through quarter turns', () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    const cases = [
        [0, 'bottom', [{ x: 34, y: 44 }, { x: 300, y: 44 }, { x: 566, y: 44 }]],
        [0, 'top', [{ x: 34, y: 786 }, { x: 300, y: 786 }, { x: 566, y: 786 }]],
        [90, 'bottom', [{ x: 586, y: 44 }, { x: 586, y: 410 }, { x: 586, y: 776 }]],
        [90, 'top', [{ x: 44, y: 44 }, { x: 44, y: 410 }, { x: 44, y: 776 }]],
        [180, 'bottom', [{ x: 586, y: 796 }, { x: 320, y: 796 }, { x: 54, y: 796 }]],
        [180, 'top', [{ x: 586, y: 54 }, { x: 320, y: 54 }, { x: 54, y: 54 }]],
        [270, 'bottom', [{ x: 34, y: 796 }, { x: 34, y: 430 }, { x: 34, y: 64 }]],
        [270, 'top', [{ x: 576, y: 796 }, { x: 576, y: 430 }, { x: 576, y: 64 }]]
    ];
    for (const [angle, edge, expected] of cases) {
        ['left', 'centre', 'right'].forEach((align, index) => {
            assert.deepEqual(getTextPlacement(box, angle, edge, align, 20, 10),
                { ...expected[index], rotation: angle }, `${angle} ${edge} ${align}`);
        });
    }
});

test('custom margin applies on both axes for every edge, alignment, and rotation', () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    const cases = [
        [0, 'bottom', [[46, 56], [300, 56], [554, 56]]],
        [0, 'top', [[46, 774], [300, 774], [554, 774]]],
        [90, 'bottom', [[574, 56], [574, 410], [574, 764]]],
        [90, 'top', [[56, 56], [56, 410], [56, 764]]],
        [180, 'bottom', [[574, 784], [320, 784], [66, 784]]],
        [180, 'top', [[574, 66], [320, 66], [66, 66]]],
        [270, 'bottom', [[46, 784], [46, 430], [46, 76]]],
        [270, 'top', [[564, 784], [564, 430], [564, 76]]]
    ];
    for (const [angle, edge, expected] of cases) {
        ['left', 'centre', 'right'].forEach((align, index) => {
            const [x, y] = expected[index];
            assert.deepEqual(getTextPlacement(box, angle, edge, align, 20, 10, 36),
                { x, y, rotation: angle }, `${angle} ${edge} ${align}`);
        });
    }
});

test('background box pads and rotates with text placement', () => {
    for (const [rotation, x, y] of [[0, 97, 197], [90, 103, 197],
        [180, 103, 203], [270, 97, 203]]) {
        assert.deepEqual(getTextBox({ x: 100, y: 200, rotation }, 20, 10),
            { x, y, width: 26, height: 16, rotation });
    }
});

test('only matching enabled page-number edge and alignment overlaps', () => {
    assert.equal(getTextOverlap('bottom-centre', 'centre', 'centre'), 'footer');
    assert.equal(getTextOverlap('top-right', 'right', 'right'), 'header');
    assert.equal(getTextOverlap('bottom-right', 'centre', 'right'), 'footer');
    assert.equal(getTextOverlap('bottom-centre', 'left', 'right'), null);
    assert.equal(getTextOverlap(null, 'right', 'right'), null);
});

test('shared start number is needed whenever any text option is enabled', () => {
    assert.equal(needsNumberingStart(false, false, false), false);
    for (const options of [[true, false, false], [false, true, false], [false, false, true]]) {
        assert.equal(needsNumberingStart(...options), true);
    }
});

test('skip first page keeps page one in numbering and total', () => {
    assert.equal(shouldDrawOnPage(0, true), false);
    assert.equal(shouldDrawOnPage(1, true), true);
    assert.equal(shouldDrawOnPage(0, false), true);
    const start = 4;
    const tokens = parsePageNumberTemplate('{n} of {total}').tokens;
    const labels = Array.from({ length: 3 }, (_, index) =>
        shouldDrawOnPage(index, true) ? formatPageNumber(start + index, 3, tokens) : null);
    assert.deepEqual(labels, [null, '5 of 3', '6 of 3']);
});

test('source placeholders print EXIF date, GPS, hash and image number', () => {
    const { tokens } = parsePageNumberTemplate('{img:2} {taken:D MMM YYYY H:mm} {gps} {hash:8} {hash}', { requireNumber: false });
    const source = {
        file: 'Photo', taken: new Date(2024, 0, 8, 14, 5), gps: '-27.470125, 153.021072',
        hash: 'a'.repeat(64), img: 3
    };
    assert.equal(formatPageNumber(1, 2, tokens, source),
        `03 8 Jan 2024 14:05 -27.470125, 153.021072 aaaaaaaa ${'a'.repeat(64)}`);
});

test('source placeholders print nothing when the page has no such data', () => {
    const { tokens } = parsePageNumberTemplate('Taken {taken} at {gps} #{img} {hash}', { requireNumber: false });
    assert.equal(formatPageNumber(1, 2, tokens, 'Contract'), 'Taken at #');
});

test('hash length must be 4 to 64', () => {
    assert.ok(parsePageNumberTemplate('{hash:4}', { requireNumber: false }).tokens);
    assert.ok(parsePageNumberTemplate('{hash:3}', { requireNumber: false }).error);
    assert.ok(parsePageNumberTemplate('{hash:65}', { requireNumber: false }).error);
});

test('EXIF dates parse as local time', () => {
    assert.deepEqual(parseExifDateTime('2024:01:08 14:05:09'), new Date(2024, 0, 8, 14, 5, 9));
    assert.equal(parseExifDateTime('not a date'), null);
    assert.equal(parseExifDateTime(undefined), null);
});

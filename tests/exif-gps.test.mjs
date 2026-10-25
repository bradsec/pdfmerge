import { importApp } from './import-app.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { formatExifGpsCoordinates } = await importApp('pdf-processing.js');

test('northern and eastern coordinates stay positive', () => {
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: [51, 30, 36],
            GPSLatitudeRef: 'N',
            GPSLongitude: [0, 7, 12],
            GPSLongitudeRef: 'E'
        }),
        '51.510000, 0.120000'
    );
});

test('southern and western refs flip the sign', () => {
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: [33, 52, 4.8],
            GPSLatitudeRef: 'S',
            GPSLongitude: [151, 12, 36],
            GPSLongitudeRef: 'W'
        }),
        '-33.868000, -151.210000'
    );
});

test('exif-js Number object values are coerced', () => {
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: [new Number(10), new Number(30), new Number(0)],
            GPSLatitudeRef: 'S',
            GPSLongitude: [new Number(20), new Number(0), new Number(0)],
            GPSLongitudeRef: 'E'
        }),
        '-10.500000, 20.000000'
    );
});

test('missing tags or missing GPS arrays return null', () => {
    assert.equal(formatExifGpsCoordinates(null), null);
    assert.equal(formatExifGpsCoordinates({}), null);
    assert.equal(formatExifGpsCoordinates({ GPSLatitude: [1, 2, 3] }), null);
});

test('malformed GPS arrays return null instead of NaN output', () => {
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: [1, 2],
            GPSLongitude: [1, 2, 3]
        }),
        null
    );
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: ['garbage', 'in', 'tags'],
            GPSLongitude: [1, 2, 3]
        }),
        null
    );
    assert.equal(
        formatExifGpsCoordinates({
            GPSLatitude: 'not-an-array',
            GPSLongitude: [1, 2, 3]
        }),
        null
    );
});

function roundPixels(value) {
    return Math.max(1, Math.round(value));
}

export function getImageProcessingPixelBudget(env = globalThis) {
    const navigatorObject = env?.navigator;
    const userAgent = navigatorObject?.userAgent || '';
    const deviceMemory = navigatorObject?.deviceMemory;
    const maxTouchPoints = navigatorObject?.maxTouchPoints || 0;
    const isMobileLike = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent) || maxTouchPoints > 1;

    if (typeof deviceMemory === 'number') {
        if (deviceMemory <= 4) {
            return 8_000_000;
        }

        if (deviceMemory <= 8) {
            return 12_000_000;
        }

        return 16_000_000;
    }

    return isMobileLike ? 8_000_000 : 16_000_000;
}

export function getImageProcessingCapabilities(env = globalThis) {
    return {
        canUseWorkerPipeline: typeof env?.Worker === 'function'
            && typeof env?.OffscreenCanvas === 'function'
            && typeof env?.createImageBitmap === 'function'
    };
}

export function calculateImageProcessingBounds({
    pageWidthPoints,
    pageHeightPoints,
    dpi,
    pointsPerMm
}) {
    const widthMM = pageWidthPoints / pointsPerMm;
    const heightMM = pageHeightPoints / pointsPerMm;

    return {
        maxWidthPixels: roundPixels(widthMM * (dpi / 25.4)),
        maxHeightPixels: roundPixels(heightMM * (dpi / 25.4))
    };
}

export function applyPixelBudgetToBounds({
    maxWidthPixels,
    maxHeightPixels,
    maxCanvasPixels
}) {
    if (!maxCanvasPixels || (maxWidthPixels * maxHeightPixels) <= maxCanvasPixels) {
        return { maxWidthPixels, maxHeightPixels };
    }

    const scale = Math.sqrt(maxCanvasPixels / (maxWidthPixels * maxHeightPixels));

    return {
        maxWidthPixels: roundPixels(maxWidthPixels * scale),
        maxHeightPixels: roundPixels(maxHeightPixels * scale)
    };
}

function buildImageProcessingPayload(fileEntry, config, pageWidthPoints, pageHeightPoints) {
    const targetBounds = calculateImageProcessingBounds({
        pageWidthPoints,
        pageHeightPoints,
        dpi: config.DPI,
        pointsPerMm: config.POINTS_PER_MM
    });
    const { maxWidthPixels, maxHeightPixels } = applyPixelBudgetToBounds({
        ...targetBounds,
        maxCanvasPixels: getImageProcessingPixelBudget()
    });

    return {
        layout: fileEntry.imageLayout ?? 'default',
        imageRotation: fileEntry.imageRotation ?? 0,
        maxWidthPixels,
        maxHeightPixels,
        imageQuality: config.IMAGE_QUALITY
    };
}

function drawImageToCanvas(ctx, source, payload) {
    const { layout, maxWidthPixels, maxHeightPixels } = payload;
    const isCover = layout === 'cover';
    const isFit = layout === 'fit';

    if (isCover) {
        const scale = Math.max(maxWidthPixels / source.width, maxHeightPixels / source.height);
        const scaledW = source.width * scale;
        const scaledH = source.height * scale;
        const offsetX = (scaledW - maxWidthPixels) / 2;
        const offsetY = (scaledH - maxHeightPixels) / 2;
        ctx.canvas.width = maxWidthPixels;
        ctx.canvas.height = maxHeightPixels;
        ctx.drawImage(source, -offsetX, -offsetY, scaledW, scaledH);
        return;
    }

    if (isFit) {
        const scale = Math.min(maxWidthPixels / source.width, maxHeightPixels / source.height);
        const scaledW = source.width * scale;
        const scaledH = source.height * scale;
        ctx.canvas.width = maxWidthPixels;
        ctx.canvas.height = maxHeightPixels;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxWidthPixels, maxHeightPixels);
        ctx.drawImage(source, (maxWidthPixels - scaledW) / 2, (maxHeightPixels - scaledH) / 2, scaledW, scaledH);
        return;
    }

    const scalingFactor = Math.min(maxWidthPixels / source.width, maxHeightPixels / source.height);
    const width = source.width * scalingFactor;
    const height = source.height * scalingFactor;
    ctx.canvas.width = roundPixels(width);
    ctx.canvas.height = roundPixels(height);
    ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

function rotateCanvasSource(canvasFactory, source, degrees = 90) {
    const sideways = degrees === 90 || degrees === 270;
    const canvas = canvasFactory(sideways ? source.height : source.width, sideways ? source.width : source.height);
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read processed image blob.'));
        reader.readAsDataURL(blob);
    });
}

function nextFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
            return;
        }

        setTimeout(resolve, 0);
    });
}

let imageProcessingWorkerPromise = null;

function getImageProcessingWorker() {
    if (!imageProcessingWorkerPromise) {
        imageProcessingWorkerPromise = Promise.resolve(
            new Worker(new URL('./image-processing.worker.js?v=1.3.4', import.meta.url), { type: 'module' })
        );
    }

    return imageProcessingWorkerPromise;
}

async function processImageInWorker(fileEntry, payload) {
    const worker = await getImageProcessingWorker();
    const arrayBuffer = await fileEntry.file.arrayBuffer();

    return new Promise((resolve, reject) => {
        const requestId = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const handleMessage = (event) => {
            const message = event.data;
            if (!message || message.id !== requestId) {
                return;
            }

            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);

            if (message.error) {
                reject(new Error(message.error));
                return;
            }

            resolve(message.dataUrl);
        };

        const handleError = (event) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            reject(event.error || new Error('Worker image processing failed.'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        worker.postMessage({
            id: requestId,
            type: fileEntry.file.type,
            buffer: arrayBuffer,
            payload
        }, [arrayBuffer]);
    });
}

async function decodeImageFromObjectUrl(file) {
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = new Image();
        image.decoding = 'async';
        image.src = objectUrl;

        if (typeof image.decode === 'function') {
            await image.decode();
        } else {
            await new Promise((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error('Error loading the image file.'));
            });
        }

        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function processImageOnMainThread(fileEntry, payload) {
    const img = await decodeImageFromObjectUrl(fileEntry.file);

    await nextFrame();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Canvas 2D context is not available.');
    }

    const rotateImage = payload.imageRotation !== 0;
    const source = rotateImage
        ? rotateCanvasSource((width, height) => {
            const rotatedCanvas = document.createElement('canvas');
            rotatedCanvas.width = width;
            rotatedCanvas.height = height;
            return rotatedCanvas;
        }, img, payload.imageRotation)
        : img;

    drawImageToCanvas(ctx, source, payload);

    if (rotateImage && source instanceof HTMLCanvasElement) {
        source.width = 0;
        source.height = 0;
    }

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
            if (!result) {
                reject(new Error('Failed to encode image as JPEG.'));
                return;
            }

            resolve(result);
        }, 'image/jpeg', payload.imageQuality);
    });

    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();

    return blobToDataUrl(blob);
}

export async function resizeImageAndConvertToJPEG(fileEntry, options) {
    const {
        config,
        getSelectedPaperSize
    } = options;

    const [pageWidthPoints, pageHeightPoints] = getSelectedPaperSize();
    const payload = buildImageProcessingPayload(fileEntry, config, pageWidthPoints, pageHeightPoints);
    const capabilities = getImageProcessingCapabilities();

    if (capabilities.canUseWorkerPipeline) {
        try {
            return await processImageInWorker(fileEntry, payload);
        } catch (error) {
            console.warn('Falling back to main-thread image processing:', error);
        }
    }

    return processImageOnMainThread(fileEntry, payload);
}

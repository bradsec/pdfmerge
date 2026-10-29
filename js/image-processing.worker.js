self.onmessage = async (event) => {
    const { id, type, buffer, payload } = event.data;

    try {
        const blob = new Blob([buffer], { type });
        const imageBitmap = await createImageBitmap(blob);
        const source = payload.imageRotation
            ? rotateBitmap(imageBitmap, payload.imageRotation)
            : imageBitmap;
        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('OffscreenCanvas 2D context is not available.');
        }

        drawImageToCanvas(ctx, source, payload);

        if (source !== imageBitmap && typeof source.close === 'function') {
            source.close();
        }

        if (typeof imageBitmap.close === 'function') {
            imageBitmap.close();
        }

        const outputBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: payload.imageQuality
        });
        const dataUrl = await blobToDataUrl(outputBlob);

        self.postMessage({ id, dataUrl });
    } catch (error) {
        self.postMessage({ id, error: error?.message || 'Worker image processing failed.' });
    }
};

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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxWidthPixels, maxHeightPixels);
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
    ctx.canvas.width = Math.max(1, Math.round(source.width * scalingFactor));
    ctx.canvas.height = Math.max(1, Math.round(source.height * scalingFactor));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

function rotateBitmap(source, degrees) {
    const sideways = degrees === 90 || degrees === 270;
    const canvas = new OffscreenCanvas(sideways ? source.height : source.width, sideways ? source.width : source.height);
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas.transferToImageBitmap();
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read processed worker blob.'));
        reader.readAsDataURL(blob);
    });
}

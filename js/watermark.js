import { hexToRgb } from './utils.js';

function addWatermarkToPage(page, text, font) {
    const watermarkColor = document.getElementById("watermark-color").value || "#000000";
    const watermarkOpacity = parseFloat(document.getElementById("watermark-opacity").value) || 0.5;
    
    const { r, g, b } = hexToRgb(watermarkColor);
    const opacity = watermarkOpacity;

    const { width, height } = page.getSize();
    const fontSize = calculateWatermarkFontSize(width, height, text, font);

    const angleRadians = Math.atan(height / width);
    const angleDegrees = angleRadians * (180 / Math.PI);

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = (width - textWidth * Math.cos(angleRadians)) / 2;
    const y = (height + textWidth * Math.sin(angleRadians)) / 2;

    page.drawText(text, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: PDFLib.rgb(r, g, b),
        rotate: PDFLib.degrees(-angleDegrees),
        opacity: opacity,
    });
}

function calculateWatermarkFontSize(pageWidth, pageHeight, text, font) {
    let fontSize = 10;
    let textWidth;

    do {
        fontSize++;
        textWidth = font.widthOfTextAtSize(text, fontSize);
    } while (textWidth < pageWidth && fontSize < 100);

    return fontSize;
}

function initWatermarkControls() {
    const watermarkCheckbox = document.getElementById("add-watermark");
    const watermarkGroup = document.querySelector(".watermark-group");

    watermarkCheckbox.addEventListener("change", function () {
        watermarkGroup.style.display = this.checked ? "flex" : "none";
    });
}

export { addWatermarkToPage, initWatermarkControls };
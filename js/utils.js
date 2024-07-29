function formatFileSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Byte";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
}

function formatDateTime(dateTime) {
    if (!dateTime) {
        return "";
    }

    const standardizedDateTime = dateTime.replace(
        /(\d{4}):(\d{2}):(\d{2})/,
        "$1-$2-$3"
    );

    const options = {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    };

    const isValidDate = !isNaN(Date.parse(standardizedDateTime));

    if (isValidDate) {
        return new Date(standardizedDateTime).toLocaleString("en-US", options);
    } else {
        return "Invalid Date";
    }
}

function estimateTextWidth(text, fontSize) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
}

function hexToRgb(hex) {
    // Remove the hash at the start if it's there
    hex = hex.replace(/^#/, '');

    // Parse the hex string
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    // Return an object with r, g, b properties
    return { r: r / 255, g: g / 255, b: b / 255 };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFormattedCurrentDate() {
    const currentDate = new Date();
    return currentDate
        .toISOString()
        .replace(/:/g, "")
        .replace(/-/g, "")
        .replace(/\.\d+/, "");
}

function displayFlashMessage(message, type) {
    const flashBannerContainer = document.querySelector(
        ".flash-banner-container"
    );

    flashBannerContainer.classList.remove(
        "flash-banner-success",
        "flash-banner-danger",
        "flash-banner-warning",
        "flash-banner-info"
    );

    flashBannerContainer.classList.add(`flash-banner-${type}`);
    flashBannerContainer.textContent = message;
    flashBannerContainer.style.display = "block";

    setTimeout(function () {
        flashBannerContainer.style.display = "none";
    }, 5000);
}

export {
    formatFileSize,
    formatDateTime,
    estimateTextWidth,
    hexToRgb,
    sleep,
    getFormattedCurrentDate,
    displayFlashMessage,
};
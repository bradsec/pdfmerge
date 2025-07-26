import { DOMCache } from './dom-cache.js';

/**
 * Formats file size from bytes to human-readable format
 * @param {number} bytes - The file size in bytes
 * @returns {string} Formatted file size (e.g., "2.3 MB")
 */
function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) {
        return "0 Bytes";
    }
    
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Bytes";
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    // Use appropriate decimal places based on size
    const decimals = i === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
    
    return `${size.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Formats EXIF date/time string to localized format
 * @param {string} dateTime - Raw EXIF date/time string
 * @returns {string} Formatted date/time or empty string if invalid
 */
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

/**
 * Estimates the width of text using canvas measurement
 * @param {string} text - The text to measure
 * @param {number} fontSize - Font size in pixels
 * @returns {number} Estimated text width in pixels
 */
function estimateTextWidth(text, fontSize) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
}

/**
 * Converts hex color to RGB values normalized for PDF-lib
 * @param {string} hex - Hex color string (with or without #)
 * @returns {Object} RGB object with r, g, b values between 0-1
 */
function hexToRgb(hex) {
    // Remove the hash at the start if it's there
    hex = hex.replace(/^#/, '');

    // Parse the hex string
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    // Return an object with r, g, b properties normalized for PDF-lib
    return { r: r / 255, g: g / 255, b: b / 255 };
}

/**
 * Creates a delay using promises
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the specified delay
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gets current date/time in filename-safe format
 * @returns {string} Formatted timestamp suitable for filenames
 */
function getFormattedCurrentDate() {
    const currentDate = new Date();
    return currentDate
        .toISOString()
        .replace(/:/g, "")
        .replace(/-/g, "")
        .replace(/\.\d+/, "");
}

/**
 * Displays a temporary flash message to the user
 * @param {string} message - The message to display
 * @param {string} type - Message type: 'success', 'danger', 'warning', or 'info'
 * @param {number} duration - Duration in ms (default: 5000)
 */
function displayFlashMessage(message, type = 'info', duration = 5000) {
    const flashBannerContainer = DOMCache.querySelector('.flash-banner-container');
    
    if (!flashBannerContainer) {
        console.warn('Flash banner container not found');
        return;
    }

    if (!message || typeof message !== 'string') {
        console.warn('Invalid message for flash banner');
        return;
    }

    // Valid types
    const validTypes = ['success', 'danger', 'warning', 'info'];
    if (!validTypes.includes(type)) {
        console.warn(`Invalid flash message type: ${type}`);
        type = 'info';
    }

    // Clear existing classes
    flashBannerContainer.classList.remove(
        'flash-banner-success',
        'flash-banner-danger', 
        'flash-banner-warning',
        'flash-banner-info'
    );

    // Add new class and content
    flashBannerContainer.classList.add(`flash-banner-${type}`);
    flashBannerContainer.textContent = message;
    flashBannerContainer.style.display = 'block';

    // Auto-hide after duration
    setTimeout(() => {
        if (flashBannerContainer.style.display === 'block') {
            flashBannerContainer.style.display = 'none';
        }
    }, duration);
}

/**
 * Detects if the current device is mobile (including tablets)
 * @returns {boolean} True if mobile device detected
 */
function isMobileDevice() {
    // Check for mobile user agents
    const mobileUserAgents = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const userAgentCheck = mobileUserAgents.test(navigator.userAgent);
    
    // Check for touch capability
    const touchCheck = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check screen size (mobile-like dimensions)
    const screenCheck = window.innerWidth <= 768 || window.innerHeight <= 768;
    
    // Check for iOS specifically (which often needs longer download times)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    return userAgentCheck || (touchCheck && screenCheck) || isIOS;
}

export {
    formatFileSize,
    formatDateTime,
    estimateTextWidth,
    hexToRgb,
    sleep,
    getFormattedCurrentDate,
    displayFlashMessage,
    isMobileDevice,
};
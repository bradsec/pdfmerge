import { showToast } from './toast.js?v=1.3.22';

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

function parseTextColor(hex, fallback = '#6b7078') {
    const safeHex = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
    return { hex: safeHex, ...hexToRgb(safeHex) };
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

function displayFlashMessage(message, type = 'info', duration) {
    showToast(message, { type: type === 'danger' ? 'error' : type, duration });
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
    hexToRgb,
    parseTextColor,
    getFormattedCurrentDate,
    displayFlashMessage,
    isMobileDevice,
};

/**
 * @fileoverview Main application initialization and event handlers
 * @author BRADSEC
 */

import { handleFileInputChange, handleDropArea, resetFiles, updateButtonVisibility, initializeDragManager } from './file-handling.js';
import { convertToPDF } from './pdf-processing.js';
import { initWatermarkControls } from './watermark.js';
import { DOMCache } from './dom-cache.js';

// Application constants
const APP_CONFIG = {
    CHECKBOX_IDS: [
        "print-image-details",
        "print-image-page-numbers", 
        "print-image-hash",
        "landscape-orientation",
        "add-watermark",
        "watermark-tiled"
    ],
    STORAGE_KEYS: {
        PAPER_SIZE: "paper-size-select",
        WATERMARK_TEXT: "watermark-text",
        WATERMARK_COLOR: "watermark-color",
        WATERMARK_OPACITY: "watermark-opacity",
        WATERMARK_ROTATION: "watermark-rotation",
        WATERMARK_SCALE: "watermark-scale"
    },
    DEBOUNCE_DELAY: 300 // milliseconds
};

/**
 * Debounce utility function
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Initializes the main application components and event listeners
 */
function initializeApp() {
    const fileInput = DOMCache.getElementById("file-input");
    const dropArea = DOMCache.getElementById("drop-area");
    const convertButton = DOMCache.getElementById("convert-button");
    const resetButton = DOMCache.getElementById("reset-button");

    if (!fileInput || !dropArea || !convertButton || !resetButton) {
        console.error('Required DOM elements not found. Check HTML structure.');
        return;
    }

    fileInput.addEventListener("change", handleFileInputChange);
    
    // Enhanced drag and drop with better accessibility and visual feedback
    dropArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        dropArea.classList.add("drag");
    });

    dropArea.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dropArea.classList.add("drag");
    });

    dropArea.addEventListener("dragleave", (e) => {
        // Only remove drag class if leaving the drop area entirely
        if (!dropArea.contains(e.relatedTarget)) {
            dropArea.classList.remove("drag");
        }
    });

    dropArea.addEventListener("drop", handleDropArea);

    // Add keyboard accessibility for file input
    dropArea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.click();
        }
    });

    // Make drop area focusable for keyboard navigation
    dropArea.setAttribute("tabindex", "0");
    dropArea.setAttribute("role", "button");
    dropArea.setAttribute("aria-label", "Drop files here or press Enter to select files");

    convertButton.addEventListener("click", convertToPDF);
    resetButton.addEventListener("click", resetFiles);

    updateButtonVisibility();
    initWatermarkControls();
    loadCheckboxStates();
    loadWatermarkFormStates();
    initializeDragManager();
}

/**
 * Loads and manages checkbox states from localStorage
 * Persists user preferences across sessions
 */
function loadCheckboxStates() {
    APP_CONFIG.CHECKBOX_IDS.forEach(id => {
        const checkbox = DOMCache.getElementById(id);
        if (!checkbox) {
            console.warn(`Checkbox with id "${id}" not found`);
            return;
        }
        
        try {
            const savedState = localStorage.getItem(id);
            checkbox.checked = savedState === "true";
            
            checkbox.addEventListener("change", function() {
                try {
                    localStorage.setItem(id, this.checked);
                } catch (error) {
                    console.warn(`Failed to save checkbox state for ${id}:`, error);
                }
            });
        } catch (error) {
            console.warn(`Failed to load checkbox state for ${id}:`, error);
        }
    });
    
    // Load paper size selection
    const paperSizeSelect = DOMCache.getElementById("paper-size-select");
    if (!paperSizeSelect) {
        console.warn('Paper size select element not found');
        return;
    }
    
    try {
        const savedPaperSize = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PAPER_SIZE);
        if (savedPaperSize) {
            paperSizeSelect.value = savedPaperSize;
        }
        
        paperSizeSelect.addEventListener("change", function() {
            try {
                localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PAPER_SIZE, this.value);
            } catch (error) {
                console.warn('Failed to save paper size preference:', error);
            }
        });
    } catch (error) {
        console.warn('Failed to load paper size preference:', error);
    }
}

/**
 * Loads and manages watermark form control states from localStorage
 * Persists watermark preferences across sessions
 */
function loadWatermarkFormStates() {
    // Handle watermark text input
    const watermarkText = DOMCache.getElementById("watermark-text");
    if (watermarkText) {
        try {
            const savedText = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_TEXT);
            if (savedText) {
                watermarkText.value = savedText;
            }
            
            const debouncedSaveText = debounce(function(value) {
                try {
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_TEXT, value);
                } catch (error) {
                    console.warn('Failed to save watermark text preference:', error);
                }
            }, APP_CONFIG.DEBOUNCE_DELAY);
            
            watermarkText.addEventListener("input", function() {
                debouncedSaveText(this.value);
            });
        } catch (error) {
            console.warn('Failed to load watermark text preference:', error);
        }
    }
    
    // Handle watermark color input
    const watermarkColor = DOMCache.getElementById("watermark-color");
    if (watermarkColor) {
        try {
            const savedColor = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_COLOR);
            if (savedColor) {
                watermarkColor.value = savedColor;
            }
            
            const debouncedSaveColor = debounce(function(value) {
                try {
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_COLOR, value);
                } catch (error) {
                    console.warn('Failed to save watermark color preference:', error);
                }
            }, APP_CONFIG.DEBOUNCE_DELAY);
            
            watermarkColor.addEventListener("input", function() {
                debouncedSaveColor(this.value);
            });
        } catch (error) {
            console.warn('Failed to load watermark color preference:', error);
        }
    }
    
    // Handle watermark opacity input
    const watermarkOpacity = DOMCache.getElementById("watermark-opacity");
    if (watermarkOpacity) {
        try {
            const savedOpacity = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_OPACITY);
            if (savedOpacity) {
                watermarkOpacity.value = savedOpacity;
            }
            
            const debouncedSaveOpacity = debounce(function(value) {
                try {
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_OPACITY, value);
                } catch (error) {
                    console.warn('Failed to save watermark opacity preference:', error);
                }
            }, APP_CONFIG.DEBOUNCE_DELAY);
            
            watermarkOpacity.addEventListener("input", function() {
                debouncedSaveOpacity(this.value);
            });
        } catch (error) {
            console.warn('Failed to load watermark opacity preference:', error);
        }
    }
    
    // Handle watermark rotation input
    const watermarkRotation = DOMCache.getElementById("watermark-rotation");
    if (watermarkRotation) {
        try {
            const savedRotation = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_ROTATION);
            if (savedRotation) {
                watermarkRotation.value = savedRotation;
            }
            
            const debouncedSaveRotation = debounce(function(value) {
                try {
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_ROTATION, value);
                } catch (error) {
                    console.warn('Failed to save watermark rotation preference:', error);
                }
            }, APP_CONFIG.DEBOUNCE_DELAY);
            
            watermarkRotation.addEventListener("input", function() {
                debouncedSaveRotation(this.value);
            });
        } catch (error) {
            console.warn('Failed to load watermark rotation preference:', error);
        }
    }
    
    // Handle watermark scale input
    const watermarkScale = DOMCache.getElementById("watermark-scale");
    if (watermarkScale) {
        try {
            const savedScale = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_SCALE);
            if (savedScale) {
                watermarkScale.value = savedScale;
            }
            
            const debouncedSaveScale = debounce(function(value) {
                try {
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATERMARK_SCALE, value);
                } catch (error) {
                    console.warn('Failed to save watermark scale preference:', error);
                }
            }, APP_CONFIG.DEBOUNCE_DELAY);
            
            watermarkScale.addEventListener("input", function() {
                debouncedSaveScale(this.value);
            });
        } catch (error) {
            console.warn('Failed to load watermark scale preference:', error);
        }
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
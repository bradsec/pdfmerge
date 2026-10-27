/**
 * @fileoverview Main application initialization and event handlers
 * @author BRADSEC
 */

import { handleFileInputChange, handleDropArea, resetFiles, clearResultLink, updateButtonVisibility, initializeDragManager, selectedFiles, updateSelectedFilesList, createBlankPageEntry, appendSelectedFileEntriesToList } from './file-handling.js?v=1.3.5';
import { convertToPDF, validatePageNumberStart, validatePageNumberTemplate, validateTextTemplate, validateTextOverlap, validateTextMargin } from './pdf-processing.js?v=1.3.5';
import { parsePageNumberTemplate, formatPageNumber, parsePageNumberStart, needsNumberingStart, parseTextMargin } from './output-pages.js?v=1.3.5';
import { parseTextColor } from './utils.js?v=1.3.5';
import { initWatermarkControls } from './watermark.js?v=1.3.5';
import { DOMCache } from './dom-cache.js?v=1.3.5';
import { initializePaperSizeSelect } from './paper-size.js?v=1.3.5';

// Application constants
const APP_CONFIG = {
    CHECKBOX_IDS: [
        "print-image-details",
        "print-image-page-numbers",
        "print-image-hash",
        "add-watermark",
        "add-page-numbers",
        "add-header-text",
        "add-footer-text",
        "page-number-skip-first",
        "header-skip-first",
        "footer-skip-first",
        "page-number-box",
        "header-box",
        "footer-box",
        "duplex-padding",
        "watermark-tiled"
    ],
    STORAGE_KEYS: {
        WATERMARK_TEXT: "watermark-text",
        WATERMARK_COLOR: "watermark-color",
        WATERMARK_OPACITY: "watermark-opacity",
        WATERMARK_ROTATION: "watermark-rotation",
        WATERMARK_SCALE: "watermark-scale",
        PAGE_NUMBER_FORMAT: "page-number-format",
        PAGE_NUMBER_TEMPLATE: "page-number-template",
        PAGE_NUMBER_COLOR: "page-number-color",
        PAGE_NUMBER_BOX_COLOR: "page-number-box-color",
        PAGE_NUMBER_MARGIN: "page-number-margin",
        HEADER_TEXT_TEMPLATE: "header-text-template",
        HEADER_TEXT_ALIGNMENT: "header-text-alignment",
        HEADER_COLOR: "header-color",
        HEADER_BOX_COLOR: "header-box-color",
        HEADER_MARGIN: "header-margin",
        FOOTER_TEXT_TEMPLATE: "footer-text-template",
        FOOTER_TEXT_ALIGNMENT: "footer-text-alignment",
        FOOTER_COLOR: "footer-color",
        FOOTER_BOX_COLOR: "footer-box-color",
        FOOTER_MARGIN: "footer-margin"
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

    // Drops anywhere on the page add files. Without this, a drop that misses
    // the drop area navigates the tab to the file and discards the list.
    const isFileDrag = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    document.addEventListener("dragover", (e) => {
        if (isFileDrag(e)) e.preventDefault();
    });
    document.addEventListener("drop", (e) => {
        if (!isFileDrag(e)) return;
        handleDropArea(e);
    });

    // The drop area is not a button: it contains the file cards, and a button
    // role would hide their controls from assistive tech and swallow their
    // Enter/Space keys. Keyboard users pick files with the native #file-input.

    convertButton.addEventListener("click", convertToPDF);
    resetButton.addEventListener("click", () => resetFiles());

    const blankPageButton = DOMCache.getElementById("blank-page-button");
    if (blankPageButton) {
        blankPageButton.addEventListener("click", async () => {
            clearResultLink();
            const entry = createBlankPageEntry();
            selectedFiles.push(entry);
            try {
                await appendSelectedFileEntriesToList([entry]);
            } catch {
                // card rendering failed — entry is still in selectedFiles, full re-render recovers
                updateSelectedFilesList();
            }
        });
    }

    updateButtonVisibility();
    initWatermarkControls();
    loadCheckboxStates();
    const pageNumberToggle = DOMCache.getElementById("add-page-numbers");
    const pageNumberOptions = DOMCache.querySelector(".page-number-options");
    const textControls = ['header', 'footer'].map(kind => ({
        kind,
        toggle: DOMCache.getElementById(`add-${kind}-text`),
        options: DOMCache.getElementById(`${kind}-text-options`),
        template: DOMCache.getElementById(`${kind}-text-template`),
        alignment: DOMCache.getElementById(`${kind}-text-alignment`),
        preview: DOMCache.getElementById(`${kind}-text-preview`),
        templateKey: APP_CONFIG.STORAGE_KEYS[`${kind.toUpperCase()}_TEXT_TEMPLATE`],
        alignmentKey: APP_CONFIG.STORAGE_KEYS[`${kind.toUpperCase()}_TEXT_ALIGNMENT`]
    }));
    const pageNumberStart = DOMCache.getElementById("page-number-start");
    const startOptions = DOMCache.querySelector('.numbering-start-options');
    const pageNumberFormat = DOMCache.getElementById("page-number-format");
    const pageNumberTemplate = DOMCache.getElementById("page-number-template");
    const customField = DOMCache.querySelector(".page-number-custom");
    const preview = DOMCache.getElementById("page-number-preview");
    ['page-number', 'header', 'footer'].forEach(kind => {
        const input = DOMCache.getElementById(`${kind}-color`);
        const swatch = DOMCache.getElementById(`${kind}-color-swatch`);
        const box = DOMCache.getElementById(`${kind}-box`);
        const boxColor = DOMCache.getElementById(`${kind}-box-color`);
        const boxSwatch = DOMCache.getElementById(`${kind}-box-swatch`);
        const margin = DOMCache.getElementById(`${kind}-margin`);
        const prefix = kind.replace('-', '_').toUpperCase();
        const key = APP_CONFIG.STORAGE_KEYS[`${prefix}_COLOR`];
        const boxKey = APP_CONFIG.STORAGE_KEYS[`${prefix}_BOX_COLOR`];
        const marginKey = APP_CONFIG.STORAGE_KEYS[`${prefix}_MARGIN`];
        try {
            input.value = parseTextColor(localStorage.getItem(key)).hex;
            boxColor.value = parseTextColor(localStorage.getItem(boxKey), '#ffffff').hex;
            const savedMargin = localStorage.getItem(marginKey);
            margin.value = parseTextMargin(savedMargin) ?? 8.5;
        } catch (error) {
            console.warn(`Failed to load ${kind} appearance:`, error);
        }
        swatch.style.backgroundColor = input.value;
        const updateBox = () => {
            boxColor.parentElement.hidden = !box.checked;
            boxSwatch.hidden = !box.checked;
            boxSwatch.style.backgroundColor = boxColor.value;
        };
        updateBox();
        box.addEventListener('change', updateBox);
        const saveColor = debounce(value => {
            try { localStorage.setItem(key, value); }
            catch (error) { console.warn(`Failed to save ${kind} colour:`, error); }
        }, APP_CONFIG.DEBOUNCE_DELAY);
        const saveBoxColor = debounce(value => {
            try { localStorage.setItem(boxKey, value); }
            catch (error) { console.warn(`Failed to save ${kind} box colour:`, error); }
        }, APP_CONFIG.DEBOUNCE_DELAY);
        input.addEventListener('input', () => {
            swatch.style.backgroundColor = input.value;
            saveColor(input.value);
        });
        boxColor.addEventListener('input', () => {
            boxSwatch.style.backgroundColor = boxColor.value;
            saveBoxColor(boxColor.value);
        });
        margin.addEventListener('input', () => {
            validateTextMargin(kind);
            try { localStorage.setItem(marginKey, margin.value); }
            catch (error) { console.warn(`Failed to save ${kind} margin:`, error); }
        });
        margin.addEventListener('blur', () => validateTextMargin(kind));
    });
    const updatePreviews = () => {
        customField.hidden = pageNumberFormat.value !== "custom";
        const template = customField.hidden ? pageNumberFormat.value : pageNumberTemplate.value;
        const { tokens } = parsePageNumberTemplate(template);
        const start = parsePageNumberStart(pageNumberStart.value);
        const now = new Date();
        const previewText = (value, parsed) => {
            if (!value.trim()) return 'Preview: (empty)';
            if (!parsed) return 'Preview: (invalid template)';
            if (start === null) return 'Preview: (invalid start number)';
            return `Preview: ${formatPageNumber(start, 12, parsed, 'Contract', now)}`;
        };
        preview.textContent = previewText(template, tokens);
        textControls.forEach(control => {
            const parsed = parsePageNumberTemplate(control.template.value, { requireNumber: false });
            control.preview.textContent = previewText(control.template.value, parsed.tokens);
        });
    };
    const updateVisibility = () => {
        pageNumberOptions.hidden = !pageNumberToggle.checked;
        textControls.forEach(control => {
            control.options.hidden = !control.toggle.checked;
            validateTextTemplate(control.kind);
        });
        startOptions.hidden = !needsNumberingStart(pageNumberToggle.checked,
            textControls[0].toggle.checked, textControls[1].toggle.checked);
        updatePreviews();
        validateTextOverlap();
    };
    try {
        const savedFormat = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PAGE_NUMBER_FORMAT);
        if (Array.from(pageNumberFormat.options).some(option => option.value === savedFormat)) pageNumberFormat.value = savedFormat;
        pageNumberTemplate.value = (localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PAGE_NUMBER_TEMPLATE) ?? '{n}').slice(0, 100);
    } catch (error) {
        console.warn('Failed to load page number preferences:', error);
    }
    textControls.forEach(control => {
        try {
            control.template.value = (localStorage.getItem(control.templateKey) ?? '').slice(0, 100);
            const alignment = localStorage.getItem(control.alignmentKey);
            if (Array.from(control.alignment.options).some(option => option.value === alignment)) {
                control.alignment.value = alignment;
            }
        } catch (error) {
            console.warn(`Failed to load ${control.kind} text preferences:`, error);
        }
        control.toggle.addEventListener('change', updateVisibility);
        control.template.addEventListener('input', () => {
            control.template.dataset.touched = 'true';
            validateTextTemplate(control.kind);
            updatePreviews();
            try { localStorage.setItem(control.templateKey, control.template.value); }
            catch (error) { console.warn(`Failed to save ${control.kind} template:`, error); }
        });
        control.template.addEventListener('blur', () => {
            control.template.dataset.blurred = 'true';
            validateTextTemplate(control.kind);
        });
        control.alignment.addEventListener('change', () => {
            validateTextOverlap();
            try { localStorage.setItem(control.alignmentKey, control.alignment.value); }
            catch (error) { console.warn(`Failed to save ${control.kind} alignment:`, error); }
        });
    });
    updateVisibility();
    validatePageNumberTemplate();
    pageNumberToggle.addEventListener('change', updateVisibility);
    DOMCache.getElementById('page-number-position').addEventListener('change', () => validateTextOverlap());
    pageNumberFormat.addEventListener('change', () => {
        updatePreviews();
        validatePageNumberTemplate();
        try { localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PAGE_NUMBER_FORMAT, pageNumberFormat.value); }
        catch (error) { console.warn('Failed to save page number format:', error); }
    });
    pageNumberTemplate.addEventListener('input', () => {
        pageNumberTemplate.dataset.touched = 'true';
        validatePageNumberTemplate();
        updatePreviews();
        try { localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PAGE_NUMBER_TEMPLATE, pageNumberTemplate.value); }
        catch (error) { console.warn('Failed to save page number template:', error); }
    });
    pageNumberTemplate.addEventListener('blur', () => {
        pageNumberTemplate.dataset.blurred = 'true';
        validatePageNumberTemplate();
    });
    pageNumberStart.addEventListener("input", () => { validatePageNumberStart(); updatePreviews(); });
    pageNumberStart.addEventListener("blur", () => validatePageNumberStart());
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
    
    const paperSizeSelect = DOMCache.getElementById("paper-size-select");
    if (!paperSizeSelect) {
        console.warn('Paper size select element not found');
        return;
    }

    initializePaperSizeSelect(paperSizeSelect, localStorage);

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

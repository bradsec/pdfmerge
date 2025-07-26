/**
 * @fileoverview File handling operations including upload, validation, and display
 * @author BRADSEC
 */

import { formatFileSize, displayFlashMessage } from './utils.js';
import { CardDragManager } from './card-drag-manager.js';
import { CardExplosion } from './card-explosion.js';
import { DOMCache } from './dom-cache.js';

// File handling constants
const FILE_CONFIG = {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    SUPPORTED_EXTENSIONS: ["pdf", "jpg", "jpeg", "png", "gif", "webp"],
    IMAGE_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"]
};

// Application state
const selectedFiles = [];
const addedFilesSet = new Set();

// PDF page count cache to avoid repeated parsing
const pdfPageCountCache = new Map();

// Drag manager instance
let dragManager = null;

/**
 * Handles file input change events
 * @param {Event} event - The file input change event
 */
async function handleFileInputChange(event) {
    const fileInput = event.target;
    const fileLink = DOMCache.getElementById("file-link");
    const spinner = DOMCache.getElementById("spinner");

    fileLink.style.display = "none";
    spinner.style.display = "block";

    Array.from(fileInput.files).forEach((file) => {
        if (isSupportedFileType(file) && isNewFile(file)) {
            addedFilesSet.add(file.name);
            selectedFiles.push(file);
        }
    });

    await updateSelectedFilesList();
    updateDropAreaState();
    spinner.style.display = "none";
}

async function handleDropArea(event) {
    event.preventDefault();
    event.target.classList.remove("drag");
    const spinner = DOMCache.getElementById("spinner");
    const fileLink = DOMCache.getElementById("file-link");

    fileLink.style.display = "none";
    spinner.style.display = "block";

    const newFiles = Array.from(event.dataTransfer.files).filter(
        (file) => isSupportedFileType(file) && isNewFile(file)
    );

    newFiles.forEach((file) => {
        if (!selectedFiles.some((f) => f.name === file.name)) {
            selectedFiles.push(file);
        }
    });

    await updateSelectedFilesList();
    updateDropAreaState();
    spinner.style.display = "none";
}

/**
 * Checks if a file type is supported by the application
 * @param {File} file - The file to check
 * @returns {boolean} True if file type is supported
 */
function isSupportedFileType(file) {
    if (!file) return false;
    const extension = file.name.split(".").pop().toLowerCase();
    return FILE_CONFIG.SUPPORTED_EXTENSIONS.includes(extension);
}

/**
 * Checks if a file is new (not already added) and within size limits
 * @param {File} file - The file to check
 * @returns {boolean} True if file is new and valid
 */
function isNewFile(file) {
    if (!file) return false;
    const fileAlreadyExists = selectedFiles.some((f) => f.name === file.name);
    return (
        !fileAlreadyExists &&
        (file.size <= FILE_CONFIG.MAX_FILE_SIZE || file.type === "application/pdf")
    );
}

/**
 * Creates a file card DOM element for display in the file list
 * @param {File} file - The file object
 * @param {number} index - The index of the file in the array
 * @returns {Promise<HTMLElement>} The created list item element
 */
async function createFileCard(file, index) {
    // Create the file card container
    const listItem = document.createElement("li");
    listItem.className = "flex-item";
    listItem.id = `file-${index}`;

    const fileExtension = file.name.split(".").pop().toLowerCase();
    const fileSize = formatFileSize(file.size);
    const isImageFile = ["jpg", "jpeg", "webp", "gif", "png"].includes(fileExtension);
    
    // Create card header with order number and type badge
    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header";
    
    const orderNumber = document.createElement("span");
    orderNumber.className = "order-number";
    orderNumber.textContent = (index + 1).toString();
    orderNumber.title = `Merge order: ${index + 1} (Click to move to end)`;
    
    const typeBadge = document.createElement("span");
    typeBadge.className = `file-type-badge ${isImageFile ? 'image' : 'pdf'}`;
    typeBadge.textContent = fileExtension.toUpperCase();
    
    cardHeader.appendChild(orderNumber);
    cardHeader.appendChild(typeBadge);
    
    // Create card body with file name
    const cardBody = document.createElement("div");
    cardBody.className = "card-body";
    
    const fileNameSpan = document.createElement("div");
    fileNameSpan.className = "file-name";
    // Extract just the filename without extension for cleaner display
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    fileNameSpan.textContent = nameWithoutExt;
    fileNameSpan.title = nameWithoutExt; // Show full name on hover
    
    cardBody.appendChild(fileNameSpan);
    
    // Add page range input for PDF files or resolution display for images
    if (fileExtension === "pdf") {
        const pageRangeInput = document.createElement("input");
        pageRangeInput.type = "text";
        pageRangeInput.className = "pdf-page-range-input";
        pageRangeInput.placeholder = "Pages: e.g. 1-5, (default = all)";
        pageRangeInput.setAttribute("data-file-index", index);
        pageRangeInput.title = "Specify page range (e.g., 1-5) or leave empty for all pages";
        
        // Load saved page range if exists
        try {
            const savedRange = localStorage.getItem(`pdf-page-range-${file.name}-${file.size}`);
            if (savedRange && typeof savedRange === 'string') {
                pageRangeInput.value = savedRange;
            }
        } catch (error) {
            console.warn('Failed to load saved page range:', error);
        }
        
        // Save page range on change
        pageRangeInput.addEventListener("input", function() {
            try {
                localStorage.setItem(`pdf-page-range-${file.name}-${file.size}`, this.value);
            } catch (error) {
                console.warn('Failed to save page range:', error);
            }
        });
        
        cardBody.appendChild(pageRangeInput);
    } else if (isImageFile) {
        // Add image resolution display for image files
        const resolutionDisplay = document.createElement("div");
        resolutionDisplay.className = "image-resolution-display";
        resolutionDisplay.textContent = "Loading resolution...";
        
        // Get image resolution asynchronously
        getImageResolution(file).then(resolution => {
            if (resolution) {
                resolutionDisplay.textContent = `${resolution.width} × ${resolution.height}`;
            } else {
                resolutionDisplay.textContent = "Resolution unknown";
            }
        }).catch(() => {
            resolutionDisplay.textContent = "Resolution unknown";
        });
        
        cardBody.appendChild(resolutionDisplay);
    }
    
    // Create card footer with metadata
    const cardFooter = document.createElement("div");
    cardFooter.className = "card-footer";
    
    const fileSizeSpan = document.createElement("div");
    fileSizeSpan.className = "file-size";
    fileSizeSpan.textContent = fileSize;
    
    cardFooter.appendChild(fileSizeSpan);
    
    // For PDF files, add page count in bottom-right
    if (fileExtension === "pdf") {
        try {
            const pageCount = await getPDFPageCount(file);
            if (pageCount && pageCount > 0) {
                const filePagesSpan = document.createElement("div");
                filePagesSpan.className = "file-pages";
                filePagesSpan.textContent = `${pageCount} pages`;
                cardFooter.appendChild(filePagesSpan);
            } else {
                // Add empty div if no page count available
                const emptyDiv = document.createElement("div");
                cardFooter.appendChild(emptyDiv);
            }
        } catch (error) {
            console.error("Error getting PDF page count:", error);
            // Add empty div if error occurs
            const emptyDiv = document.createElement("div");
            cardFooter.appendChild(emptyDiv);
        }
    } else {
        // For non-PDF files, add empty div to maintain layout
        const emptyDiv = document.createElement("div");
        cardFooter.appendChild(emptyDiv);
    }
    
    // Create file info container
    const fileInfoContainer = document.createElement("div");
    fileInfoContainer.className = "file-info-container";
    
    fileInfoContainer.appendChild(cardHeader);
    fileInfoContainer.appendChild(cardBody);
    fileInfoContainer.appendChild(cardFooter);

    // Create delete button
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-file-button";
    deleteButton.innerHTML = '<span class="material-icons-outlined">delete</span>';
    deleteButton.title = "Remove file";
    deleteButton.setAttribute("data-file-index", index);
    deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFileFromList(index);
    });

    // Add unique view transition name for smooth animations
    listItem.style.setProperty('--card-id', `card-${file.name}-${file.size}`);
    listItem.style.viewTransitionName = `card-${file.name}-${file.size}`;
    
    // Add unique ID for drag tracking
    listItem.dataset.fileId = `file-${index}-${file.name}-${file.size}`;
    
    // Add click handler for reordering with animation
    orderNumber.addEventListener("click", (e) => {
        // Don't trigger on delete button or input clicks
        if (e.target.classList.contains('delete-file-button') || 
            e.target.closest('.delete-file-button') ||
            e.target.tagName === 'INPUT') {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Use drag manager for smooth animation if available
        if (dragManager) {
            dragManager.animateClickReorder(index);
        } else {
            // Fallback to original behavior
            moveCardToEnd(index);
        }
    });

    listItem.appendChild(fileInfoContainer);
    listItem.appendChild(deleteButton);

    return listItem;
}

async function updateSelectedFilesList() {
    try {
        const fileList = DOMCache.getElementById("selected-files-list");
        if (!fileList) {
            console.error("File list element not found");
            return;
        }
        
        const fragment = document.createDocumentFragment();
        const fileMap = new Map();

        const filteredFiles = selectedFiles.filter((file) => {
            if (!isSupportedFileType(file) || fileMap.has(file.name)) {
                return false;
            }
            fileMap.set(file.name, true);
            return true;
        });

        selectedFiles.length = 0;
        selectedFiles.push(...filteredFiles);

        for (let index = 0; index < filteredFiles.length; index++) {
            const file = filteredFiles[index];
            const listItem = await createFileCard(file, index);
            fragment.appendChild(listItem);
        }

        fileList.innerHTML = "";
        fileList.appendChild(fragment);

        // Initialize or update drag manager
        initializeDragManager();

        updateButtonVisibility();
        updateToggleItemVisibility();
    } catch (error) {
        console.error("Error updating file list:", error);
        // Try to recover by ensuring buttons are visible if files exist
        if (selectedFiles.length > 0) {
            updateButtonVisibility();
        }
    }
}

/**
 * Moves a card to the end of the list (cycling through positions)
 * @param {number} cardIndex - Index of the card to move
 */
async function moveCardToEnd(cardIndex) {
    if (cardIndex < 0 || cardIndex >= selectedFiles.length) {
        return;
    }
    
    // Check for View Transition API support
    if (!document.startViewTransition) {
        // Fallback with simple CSS animation
        const cardElement = DOMCache.querySelector(`#selected-files-list li:nth-child(${cardIndex + 1})`);
        if (cardElement) {
            cardElement.style.transform = 'scale(1.1)';
            cardElement.style.transition = 'transform 0.3s ease';
            
            setTimeout(() => {
                cardElement.style.transform = '';
                cardElement.style.transition = '';
            }, 300);
        }
        
        const file = selectedFiles.splice(cardIndex, 1)[0];
        selectedFiles.push(file);
        await updateSelectedFilesList();
        return;
    }
    
    // Use View Transition API for smooth animation
    const transition = document.startViewTransition(async () => {
        // Move the file from current position to end
        const file = selectedFiles.splice(cardIndex, 1)[0];
        selectedFiles.push(file);
        
        // Update the DOM
        await updateSelectedFilesList();
    });
}

function updateButtonVisibility() {
    const convertButton = DOMCache.getElementById("convert-button");
    const resetButton = DOMCache.getElementById("reset-button");

    if (selectedFiles.length > 0) {
        convertButton.style.display = "inline-block";
        resetButton.style.display = "inline-block";
    } else {
        convertButton.style.display = "none";
        resetButton.style.display = "none";
    }
}

/**
 * Updates visibility of UI toggle items based on selected file types
 */
function updateToggleItemVisibility() {
    const hasImageFiles = selectedFiles.some((file) => {
        const fileName = file.name.toLowerCase();
        return FILE_CONFIG.IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    });

    const toggleImageItem = DOMCache.getElementById("image-details-toggle");
    const toggleWatermarkItem = DOMCache.getElementById("watermark-details-toggle");
    const paperSizeSelection = DOMCache.getElementById("paper-size-selection");

    toggleImageItem.style.display = hasImageFiles ? "block" : "none";
    toggleWatermarkItem.style.display = selectedFiles.length > 0 ? "block" : "none";
    paperSizeSelection.style.display = selectedFiles.length > 0 ? "block" : "none";
}

/**
 * Removes a file from the selected files list with animation
 * @param {number} index - The index of the file to remove
 */
async function removeFileFromList(index) {
    if (index >= 0 && index < selectedFiles.length) {
        const file = selectedFiles[index];
        const cardElement = DOMCache.querySelector(`#file-${index}`);
        
        if (cardElement) {
            // Create explosion effect
            const explosion = new CardExplosion();
            
            // Start explosion animation
            explosion.explodeElement(cardElement, () => {
                // Animation complete callback
                completeFileRemoval(index, file);
            });
        } else {
            // Fallback if card element not found
            completeFileRemoval(index, file);
        }
    }
}

/**
 * Completes the file removal after animation
 * @param {number} index - File index
 * @param {File} file - File object
 */
async function completeFileRemoval(index, file) {
    // Remove from addedFilesSet to allow re-adding
    addedFilesSet.delete(file.name);
    
    // Remove from selectedFiles array
    selectedFiles.splice(index, 1);
    
    // Remove saved page range from localStorage if it's a PDF
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (fileExtension === "pdf") {
        try {
            localStorage.removeItem(`pdf-page-range-${file.name}-${file.size}`);
        } catch (error) {
            console.warn('Failed to remove saved page range:', error);
        }
    }
    
    // Update the display
    await updateSelectedFilesList();
    updateDropAreaState();
    updateButtonVisibility();
    updateToggleItemVisibility();
}

function resetFiles() {
    selectedFiles.length = 0;
    addedFilesSet.clear();
    const fileList = DOMCache.getElementById("selected-files-list");
    fileList.innerHTML = "";
    const fileInput = DOMCache.getElementById("file-input");
    fileInput.value = "";
    
    updateDropAreaState();
    updateButtonVisibility();
    updateToggleItemVisibility();
}

/**
 * Updates the visual state of the drop area based on whether files are selected
 */
function updateDropAreaState() {
    const dropArea = DOMCache.getElementById("drop-area");
    const dropIcon = dropArea.querySelector(".drop-icon");
    const dropText = dropArea.querySelector("p");
    
    if (selectedFiles.length > 0) {
        dropArea.classList.add("has-files");
        if (dropIcon) dropIcon.style.opacity = "0.2";
        if (dropText) dropText.style.opacity = "0.2";
    } else {
        dropArea.classList.remove("has-files");
        dropArea.classList.remove("drag"); // Ensure drag class is removed when no files
        if (dropIcon) dropIcon.style.opacity = "1";
        if (dropText) dropText.style.opacity = "1";
    }
}

/**
 * Gets the page count of a PDF file with caching
 * @param {File} file - The PDF file to analyze
 * @returns {Promise<number|null>} The number of pages or null if error
 */
async function getPDFPageCount(file) {
    // Create cache key from file properties
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`;
    
    // Check cache first
    if (pdfPageCountCache.has(cacheKey)) {
        return pdfPageCountCache.get(cacheKey);
    }
    
    try {
        const fileBytes = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
            ignoreEncryption: true,
        });
        const pageCount = pdfDoc.getPageCount();
        
        // Cache the result
        pdfPageCountCache.set(cacheKey, pageCount);
        
        // Limit cache size to prevent memory issues
        if (pdfPageCountCache.size > 100) {
            const firstKey = pdfPageCountCache.keys().next().value;
            pdfPageCountCache.delete(firstKey);
        }
        
        return pageCount;
    } catch (error) {
        console.error("Error reading PDF page count:", error);
        // Cache null result to avoid repeated failed attempts
        pdfPageCountCache.set(cacheKey, null);
        return null;
    }
}

/**
 * Gets the resolution of an image file
 * @param {File} file - The image file to analyze
 * @returns {Promise<{width: number, height: number}>} The width and height of the image
 */
async function getImageResolution(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectURL = URL.createObjectURL(file);
        
        img.onload = function() {
            URL.revokeObjectURL(objectURL);
            resolve({
                width: this.naturalWidth,
                height: this.naturalHeight
            });
        };
        img.onerror = function() {
            URL.revokeObjectURL(objectURL);
            reject(new Error('Failed to load image'));
        };
        img.src = objectURL;
    });
}

// Guard to prevent recursive calls to initializeDragManager
let isInitializingDragManager = false;

/**
 * Initializes or updates the drag manager for file cards
 */
function initializeDragManager() {
    // Prevent recursive calls
    if (isInitializingDragManager) {
        console.warn('initializeDragManager: Preventing recursive call');
        return;
    }
    
    isInitializingDragManager = true;
    
    try {
        // Destroy existing drag manager if it exists
        if (dragManager) {
            dragManager.destroy();
            dragManager = null;
        }

        // Only create drag manager if there are files
        if (selectedFiles.length > 0) {
            dragManager = new CardDragManager('#selected-files-list', handleCardReorder);
            dragManager.makeDraggable();
        }
    } finally {
        isInitializingDragManager = false;
    }
}

/**
 * Handle card reordering from drag manager
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Target index
 */
function handleCardReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
    }

    // Reorder the files array
    const draggedFile = selectedFiles.splice(fromIndex, 1)[0];
    selectedFiles.splice(toIndex, 0, draggedFile);
    
    // Update the display without reinitializing drag manager
    updateSelectedFilesListWithoutDragInit();
}

/**
 * Updates the files list without reinitializing the drag manager
 * Used during drag operations to prevent infinite recursion
 */
async function updateSelectedFilesListWithoutDragInit() {
    try {
        const fileList = DOMCache.getElementById("selected-files-list");
        if (!fileList) {
            console.error("File list element not found");
            return;
        }
        
        const fragment = document.createDocumentFragment();
        const fileMap = new Map();

        const filteredFiles = selectedFiles.filter((file) => {
            if (!isSupportedFileType(file) || fileMap.has(file.name)) {
                return false;
            }
            fileMap.set(file.name, true);
            return true;
        });

        selectedFiles.length = 0;
        selectedFiles.push(...filteredFiles);

        for (let index = 0; index < filteredFiles.length; index++) {
            const file = filteredFiles[index];
            const listItem = await createFileCard(file, index);
            fragment.appendChild(listItem);
        }

        fileList.innerHTML = "";
        fileList.appendChild(fragment);

        // Update drag manager for new elements without reinitializing
        if (dragManager) {
            dragManager.makeDraggable();
        }

        updateButtonVisibility();
        updateToggleItemVisibility();
    } catch (error) {
        console.error("Error updating file list:", error);
        if (selectedFiles.length > 0) {
            updateButtonVisibility();
        }
    }
}




export {
    handleFileInputChange,
    handleDropArea,
    resetFiles,
    selectedFiles,
    isSupportedFileType,
    updateButtonVisibility,
    updateToggleItemVisibility,
    updateDropAreaState,
    addedFilesSet,
    initializeDragManager
};
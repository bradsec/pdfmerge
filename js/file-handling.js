/**
 * @fileoverview File handling operations including upload, validation, and display
 * @author BRADSEC
 */

import { formatFileSize, displayFlashMessage, getFormattedCurrentDate } from './utils.js';
import { CardDragManager } from './card-drag-manager.js';
import { CardExplosion } from './card-explosion.js';
import { DOMCache } from './dom-cache.js';
import { renderPdfThumbnail, isPdfPasswordProtected } from './pdf-thumbnail.js';
import { getPdfThumbnailPreviewState } from './thumbnail-orientation.js';

// File handling constants
const FILE_CONFIG = {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    SUPPORTED_EXTENSIONS: ["pdf", "jpg", "jpeg", "png", "gif", "webp"],
    IMAGE_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    IMAGE_LAYOUT_OPTIONS: [
        { value: "default", label: "Default Margins" },
        { value: "cover", label: "Cover" },
        { value: "fit", label: "Fit" }
    ]
};

// Application state
const selectedFiles = [];
const addedFilesSet = new Set();
let nextSelectedFileId = 0;

/**
 * Checks if a file entry is a blank page sentinel
 * @param {Object} file - The file or sentinel to check
 * @returns {boolean} True if it is a blank page sentinel
 */
function isBlankPage(fileEntry) {
    return fileEntry && fileEntry.type === 'blank';
}

function createFileFingerprint(file) {
    return [file.name, file.size, file.lastModified, file.type].join('::');
}

function createSelectedFileEntry(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    return {
        id: `file-entry-${Date.now()}-${nextSelectedFileId++}`,
        type: 'file',
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        extension,
        imageLayout: FILE_CONFIG.IMAGE_EXTENSIONS.includes(`.${extension}`) ? getDefaultImageLayout() : null,
        imageRotation: 0,
        rotation: 0,
        fingerprint: createFileFingerprint(file)
    };
}

function createBlankPageEntry() {
    return {
        id: `blank-entry-${Date.now()}-${nextSelectedFileId++}`,
        type: 'blank',
        name: 'Blank Page',
        size: 0,
        rotation: 0
    };
}

function findSelectedFileIndexById(fileId) {
    return selectedFiles.findIndex((fileEntry) => fileEntry.id === fileId);
}

function getPageRangeStorageKey(fileEntry) {
    return `pdf-page-range-${fileEntry.fingerprint ?? fileEntry.id}`;
}

function getDefaultImageLayout() {
    return "default";
}

function getImageLayoutValue(fileEntry) {
    return normalizeImageLayoutValue(fileEntry?.imageLayout || getDefaultImageLayout());
}

function normalizeImageLayoutValue(layout) {
    if (!layout || typeof layout !== "string") {
        return "default";
    }
    // Migrate old value names (rotated variants collapse to their base; imageRotation defaults to 0)
    if (layout === "landscape") return "default";
    if (layout === "cover-landscape" || layout === "cover-rotated") return "cover";
    if (layout === "fit-landscape" || layout === "fit-rotated") return "fit";
    if (layout === "default-rotated") return "default";
    const validLayouts = FILE_CONFIG.IMAGE_LAYOUT_OPTIONS.map((opt) => opt.value);
    if (validLayouts.includes(layout)) {
        return layout;
    }
    return "default";
}

function getImagePageOrientation(rotation) {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    return normalizedRotation === 90 || normalizedRotation === 270 ? "landscape" : "portrait";
}

function getOrientationFromDimensions(width, height) {
    if (!width || !height) {
        return "unknown";
    }

    if (Math.abs(width - height) < 1) {
        return "square";
    }

    return width > height ? "landscape" : "portrait";
}

function getEffectiveOrientation(baseOrientation, rotation) {
    const normalizedRotation = ((rotation % 360) + 360) % 360;

    if (baseOrientation === "portrait" || baseOrientation === "landscape") {
        if (normalizedRotation === 90 || normalizedRotation === 270) {
            return baseOrientation === "portrait" ? "landscape" : "portrait";
        }

        return baseOrientation;
    }

    if (normalizedRotation === 90 || normalizedRotation === 270) {
        return "landscape";
    }

    return "portrait";
}

function describeOrientation(baseOrientation, rotation) {
    const effectiveOrientation = getEffectiveOrientation(baseOrientation, rotation);

    if (effectiveOrientation === "portrait") {
        return {
            key: "portrait",
            label: "Portrait",
            title: "Output page orientation is portrait"
        };
    }

    if (effectiveOrientation === "landscape") {
        return {
            key: "landscape",
            label: "Landscape",
            title: "Output page orientation is landscape"
        };
    }
}

function getNextRotationState(rotation) {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const nextRotation = (normalizedRotation + 90) % 360;

    return {
        label: "Page Orientation",
        rotation: nextRotation,
        title: `Rotate page 90° clockwise (current: ${normalizedRotation}°, next: ${nextRotation}°)`
    };
}

function getVisualPageRotation(fileEntry) {
    if (typeof fileEntry?.rotationVisual === "number") {
        return fileEntry.rotationVisual;
    }

    return fileEntry?.rotation ?? 0;
}

function getThumbnailPreviewLayout(fileEntry) {
    const layout = getImageLayoutValue(fileEntry);
    const ir = fileEntry.imageRotation ?? 0;
    const sideways = ir === 90 || ir === 270;

    if (layout === "cover") return sideways ? "cover-rotated" : "cover";
    if (layout === "fit") return sideways ? "fit-rotated" : "fit";
    return sideways ? "default-rotated" : "default";
}

function getImageContentRotation(fileEntry) {
    if (typeof fileEntry?.imageRotationVisual === "number") {
        return fileEntry.imageRotationVisual;
    }

    return fileEntry?.imageRotation ?? 0;
}

function getImageLayoutScale(fileEntry) {
    const layout = getImageLayoutValue(fileEntry);
    const ir = fileEntry.imageRotation ?? 0;
    if (layout === "cover" && (ir === 90 || ir === 270)) return 4 / 3;
    return 1;
}

function getNextImageRotationState(imageRotation) {
    const normalized = ((imageRotation % 360) + 360) % 360;
    const next = (normalized + 90) % 360;
    return {
        label: "Image Rotation",
        imageRotation: next,
        title: `Rotate image 90° clockwise (current: ${normalized}°, next: ${next}°)`
    };
}

// PDF page count cache to avoid repeated parsing
const pdfPageCountCache = new Map();
const thumbnailUrlCache = new Map();
const pdfThumbnailPromiseCache = new Map();
const imageResolutionCache = new Map();

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

    const appendedEntries = await appendFilesToSelection(Array.from(fileInput.files));
    try {
        await appendSelectedFileEntriesToList(appendedEntries);
    } finally {
        // Clear the input so selecting the same file again re-fires change
        fileInput.value = "";
        updateDropAreaState();
        spinner.style.display = "none";
    }
}

async function handleDropArea(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag");
    const spinner = DOMCache.getElementById("spinner");
    const fileLink = DOMCache.getElementById("file-link");

    fileLink.style.display = "none";
    spinner.style.display = "block";

    const appendedEntries = await appendFilesToSelection(Array.from(event.dataTransfer.files));
    try {
        await appendSelectedFileEntriesToList(appendedEntries);
    } finally {
        updateDropAreaState();
        spinner.style.display = "none";
    }
}

/**
 * Checks if a file type is supported by the application
 * @param {File} file - The file to check
 * @returns {boolean} True if file type is supported
 */
function isSupportedFileType(file) {
    if (!file) return false;
    if (isBlankPage(file)) return true;
    const extension = file.extension || file.name.split(".").pop().toLowerCase();
    return FILE_CONFIG.SUPPORTED_EXTENSIONS.includes(extension);
}

function isPdfFileObject(file) {
    if (isBlankPage(file)) return false;
    const extension = file.extension || file.name.split(".").pop().toLowerCase();
    return file.type === "application/pdf" || extension === "pdf";
}

async function appendFilesToSelection(files) {
    const appendedEntries = [];
    const blockedEncrypted = [];
    const skippedFiles = [];

    for (const file of files) {
        if (!file) {
            continue;
        }

        if (!isSupportedFileType(file)) {
            skippedFiles.push(`${file.name} (unsupported type)`);
            continue;
        }

        if (!isBlankPage(file)) {
            if (addedFilesSet.has(createFileFingerprint(file))) {
                skippedFiles.push(`${file.name} (already added)`);
                continue;
            }

            if (file.size > FILE_CONFIG.MAX_FILE_SIZE && !isPdfFileObject(file)) {
                skippedFiles.push(`${file.name} (over the 50 MB image size limit)`);
                continue;
            }
        }

        // Reject password-protected (open-password) PDFs: they cannot be read,
        // so they would merge as blank/garbled pages and render no thumbnail.
        if (isPdfFileObject(file) && await isPdfPasswordProtected(file)) {
            blockedEncrypted.push(file.name);
            continue;
        }

        const fileEntry = createSelectedFileEntry(file);
        addedFilesSet.add(fileEntry.fingerprint);
        selectedFiles.push(fileEntry);
        appendedEntries.push(fileEntry);
    }

    if (blockedEncrypted.length > 0) {
        const names = blockedEncrypted.join(", ");
        displayFlashMessage(
            `Password-protected PDF skipped: ${names}. Remove the password first at pdfprotect.me, then add the file again.`,
            "warning",
            10000
        );
    }

    if (skippedFiles.length > 0) {
        displayFlashMessage(
            `Skipped: ${skippedFiles.join(", ")}.`,
            "warning",
            10000
        );
    }

    return appendedEntries;
}

/**
 * Creates a file card DOM element for display in the file list
 * @param {File} file - The file object
 * @param {number} index - The index of the file in the array
 * @returns {Promise<HTMLElement>} The created list item element
 */
async function createFileCard(fileEntry, index) {
    if (isBlankPage(fileEntry)) {
        const listItem = document.createElement("li");
        listItem.className = "flex-item";
        listItem.id = fileEntry.id;
        listItem.dataset.fileId = fileEntry.id;

        const fileInfoContainer = document.createElement("div");
        fileInfoContainer.className = "file-info-container";

        const cardHeader = document.createElement("div");
        cardHeader.className = "card-header";

        const cardMeta = document.createElement("div");
        cardMeta.className = "card-meta";

        const cardMetaTopRow = document.createElement("div");
        cardMetaTopRow.className = "card-meta-top-row";

        const orderNumber = document.createElement("span");
        orderNumber.className = "order-number";
        orderNumber.textContent = (index + 1).toString();
        orderNumber.title = `Merge order: ${index + 1} (Click to move to end)`;

        const typeBadge = document.createElement("span");
        typeBadge.className = "file-type-badge blank";
        typeBadge.textContent = "BLANK";

        const orientationBadge = document.createElement("span");
        orientationBadge.className = "orientation-badge orientation-badge--portrait";
        orientationBadge.textContent = "Portrait";
        orientationBadge.title = "Blank pages are added in portrait orientation";

        cardMetaTopRow.appendChild(orderNumber);
        cardMetaTopRow.appendChild(typeBadge);
        cardMeta.appendChild(cardMetaTopRow);
        cardMeta.appendChild(orientationBadge);

        const thumbnailWrapper = document.createElement("div");
        thumbnailWrapper.className = "card-thumbnail-wrapper blank-page-preview";
        thumbnailWrapper.innerHTML = `<span class="material-icons-outlined">article</span>`;

        const blankCard = document.createElement("div");
        blankCard.className = "blank-page-card file-info-container";
        blankCard.innerHTML = `<span>Blank Page</span>`;

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-file-button";
        deleteButton.type = "button";
        deleteButton.innerHTML = '<span class="material-icons-outlined">delete</span>';
        deleteButton.title = "Remove blank page";
        deleteButton.setAttribute("data-file-id", fileEntry.id);
        deleteButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentFileId = e.currentTarget.getAttribute("data-file-id");
            removeFileFromList(currentFileId);
        });

        cardHeader.appendChild(cardMeta);
        cardHeader.appendChild(deleteButton);
        fileInfoContainer.appendChild(cardHeader);
        fileInfoContainer.appendChild(thumbnailWrapper);
        fileInfoContainer.appendChild(blankCard);
        listItem.appendChild(fileInfoContainer);
        return listItem;
    }

    // Create the file card container
    const listItem = document.createElement("li");
    listItem.className = "flex-item";
    listItem.id = fileEntry.id;

    const fileExtension = fileEntry.extension || fileEntry.name.split(".").pop().toLowerCase();
    const fileSize = formatFileSize(fileEntry.size);
    const isImageFile = ["jpg", "jpeg", "webp", "gif", "png"].includes(fileExtension);
    
    // Create card header with order number and type badge
    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header";

    const cardMeta = document.createElement("div");
    cardMeta.className = "card-meta";

    const cardMetaTopRow = document.createElement("div");
    cardMetaTopRow.className = "card-meta-top-row";
    
    const orderNumber = document.createElement("span");
    orderNumber.className = "order-number";
    orderNumber.textContent = (index + 1).toString();
    orderNumber.title = `Merge order: ${index + 1} (Click to move to end)`;
    
    const typeBadge = document.createElement("span");
    typeBadge.className = `file-type-badge ${isImageFile ? 'image' : 'pdf'}`;
    typeBadge.textContent = fileExtension.toUpperCase();

    const orientationBadge = document.createElement("span");
    orientationBadge.className = "orientation-badge orientation-badge--unknown";
    
    cardMetaTopRow.appendChild(orderNumber);
    cardMetaTopRow.appendChild(typeBadge);
    cardMeta.appendChild(cardMetaTopRow);
    cardMeta.appendChild(orientationBadge);
    cardHeader.appendChild(cardMeta);
    
    // Create card body with file name
    const cardBody = document.createElement("div");
    cardBody.className = "card-body";
    
    const fileNameSpan = document.createElement("div");
    fileNameSpan.className = "file-name";
    // Extract just the filename without extension for cleaner display
    const nameWithoutExt = fileEntry.name.substring(0, fileEntry.name.lastIndexOf('.')) || fileEntry.name;
    fileNameSpan.textContent = nameWithoutExt;
    fileNameSpan.title = nameWithoutExt; // Show full name on hover
    
    cardBody.appendChild(fileNameSpan);
    
    // Add page range input for PDF files or resolution display for images
    if (fileExtension === "pdf") {
        const pageRangeInput = document.createElement("input");
        pageRangeInput.type = "text";
        pageRangeInput.className = "pdf-page-range-input";
        pageRangeInput.placeholder = "e.g. 1-5 or 1,3,7 (default all)";
        pageRangeInput.setAttribute("data-file-id", fileEntry.id);
        pageRangeInput.title = "Ranges (1-5), individual pages (1,3,7), or mixed (1-3,5,8). Leave empty for all pages.";
        
        // Load saved page range if exists
        try {
            const savedRange = localStorage.getItem(getPageRangeStorageKey(fileEntry));
            if (savedRange && typeof savedRange === 'string') {
                pageRangeInput.value = savedRange;
            }
        } catch (error) {
            console.warn('Failed to load saved page range:', error);
        }
        
        // Save page range on change
        pageRangeInput.addEventListener("input", function() {
            try {
                localStorage.setItem(getPageRangeStorageKey(fileEntry), this.value);
            } catch (error) {
                console.warn('Failed to save page range:', error);
            }
        });
        
        cardBody.appendChild(pageRangeInput);
    } else if (isImageFile) {
        const imageLayoutSelect = document.createElement("select");
        imageLayoutSelect.className = "image-layout-card-select";
        imageLayoutSelect.title = "Choose how this image is placed on its output page";

        FILE_CONFIG.IMAGE_LAYOUT_OPTIONS.forEach((option) => {
            const optionElement = document.createElement("option");
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            imageLayoutSelect.appendChild(optionElement);
        });

        imageLayoutSelect.value = getImageLayoutValue(fileEntry);

        cardBody.appendChild(imageLayoutSelect);
    }
    
    // Create card footer with metadata
    const cardTopMeta = document.createElement("div");
    cardTopMeta.className = "card-top-meta";

    const fileSizeSpan = document.createElement("span");
    fileSizeSpan.className = "file-size";
    fileSizeSpan.textContent = fileSize;
    cardTopMeta.appendChild(fileSizeSpan);

    if (fileExtension === "pdf") {
        try {
            const pageCount = await getPDFPageCount(fileEntry.file);
            if (pageCount && pageCount > 0) {
                const filePagesSpan = document.createElement("span");
                filePagesSpan.className = "file-pages";
                filePagesSpan.textContent = `· ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
                cardTopMeta.appendChild(filePagesSpan);
            }
        } catch (error) {
            console.error("Error getting PDF page count:", error);
        }
    } else if (isImageFile) {
        const resolutionSpan = document.createElement("span");
        resolutionSpan.className = "file-pages";
        getImageResolution(fileEntry.file).then(resolution => {
            if (resolution) resolutionSpan.textContent = `· ${resolution.width} × ${resolution.height}`;
        }).catch(() => {});
        cardTopMeta.appendChild(resolutionSpan);
    }
    
    // Create file info container
    const fileInfoContainer = document.createElement("div");
    fileInfoContainer.className = "file-info-container";

    // Create delete button
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-file-button";
    deleteButton.type = "button";
    deleteButton.innerHTML = '<span class="material-icons-outlined">delete</span>';
    deleteButton.title = "Remove file";
    deleteButton.setAttribute("data-file-id", fileEntry.id);
    deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFileFromList(e.currentTarget.getAttribute("data-file-id"));
    });
    cardHeader.appendChild(deleteButton);

    // Add unique view transition name for smooth animations
    listItem.style.setProperty('--card-id', `card-${fileEntry.id}`);
    listItem.style.viewTransitionName = `card-${fileEntry.id}`;

    // Add unique ID for drag tracking
    listItem.dataset.fileId = fileEntry.id;

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
            const currentIndex = findSelectedFileIndexById(fileEntry.id);
            if (currentIndex >= 0) {
                dragManager.animateClickReorder(currentIndex);
            }
        } else {
            // Fallback to original behavior
            const currentIndex = findSelectedFileIndexById(fileEntry.id);
            if (currentIndex >= 0) {
                moveCardToEnd(currentIndex);
            }
        }
    });

    // Thumbnail preview (image or PDF page 1) in an overflow-clip wrapper
    let thumbnail = null;
    let thumbnailContentElement = null;
    const isPdfFile = fileExtension === "pdf";
    fileInfoContainer.appendChild(cardHeader);
    fileInfoContainer.appendChild(cardTopMeta);

    const updateOrientationBadge = () => {
        const baseOrientation = isImageFile ? "portrait" : fileEntry.baseOrientation;
        const orientation = describeOrientation(baseOrientation, fileEntry.rotation);
        orientationBadge.className = `orientation-badge orientation-badge--${orientation.key}`;
        orientationBadge.textContent = orientation.label;
        orientationBadge.title = orientation.title;
    };

    if (isImageFile || isPdfFile) {
        const wrapper = document.createElement("div");
        wrapper.className = isPdfFile ? "card-thumbnail-wrapper card-thumbnail-wrapper--pdf" : "card-thumbnail-wrapper";

        const frame = document.createElement("div");
        frame.className = "card-thumbnail-frame";

        const page = document.createElement("div");
        page.className = "card-thumbnail-page";
        const pageSurface = document.createElement("div");
        pageSurface.className = "card-thumbnail-surface";
        if (isPdfFile) {
            pageSurface.classList.add("card-thumbnail-surface--pdf");
        }
        const thumbnailContent = document.createElement("div");
        thumbnailContent.className = "card-thumbnail-content";
        if (isPdfFile) {
            thumbnailContent.classList.add("card-thumbnail-content--pdf");
        } else {
            thumbnailContent.classList.add("card-thumbnail-content--image");
        }
        thumbnailContentElement = thumbnailContent;

        thumbnail = document.createElement("img");
        thumbnail.className = "card-thumbnail";
        if (isPdfFile) {
            thumbnail.classList.add("card-thumbnail--pdf");
        }
        thumbnail.alt = fileEntry.name;

        try {
            const thumbnailUrl = await getThumbnailUrl(fileEntry, isPdfFile);
            if (thumbnailUrl) {
                thumbnail.src = thumbnailUrl;
            }
        } catch {
            // Rendering failed — thumbnail stays blank
        }

        thumbnailContent.appendChild(thumbnail);
        pageSurface.appendChild(thumbnailContent);
        page.appendChild(pageSurface);
        frame.appendChild(page);
        wrapper.appendChild(frame);
        fileInfoContainer.appendChild(wrapper);
    }

    fileInfoContainer.appendChild(cardBody);

    // Initialise rotation state
    if (fileEntry.rotation === undefined) fileEntry.rotation = 0;
    if (fileEntry.rotationVisual === undefined) {
        fileEntry.rotationVisual = ((fileEntry.rotation % 360) + 360) % 360;
    }

    const rotationControls = document.createElement("div");
    rotationControls.className = "rotation-controls";

    const orientationToggleBtn = document.createElement("button");
    orientationToggleBtn.type = "button";
    orientationToggleBtn.className = "orientation-toggle-btn";
    orientationToggleBtn.innerHTML = '<span class="material-icons-outlined">screen_rotation</span>';

    const syncPreviewFrameOrientation = () => {
        if (!fileInfoContainer) {
            return;
        }

        const baseOrientation = isImageFile ? "portrait" : fileEntry.baseOrientation;
        const effectiveOrientation = isImageFile
            ? getImagePageOrientation(fileEntry.rotation)
            : getEffectiveOrientation(baseOrientation, fileEntry.rotation);
        listItem.dataset.orientation = effectiveOrientation === "landscape" ? "landscape" : "portrait";
        if (isPdfFile) {
            const previewState = getPdfThumbnailPreviewState(baseOrientation, fileEntry.rotation, getVisualPageRotation(fileEntry));
            if (thumbnailContentElement) {
                thumbnailContentElement.dataset.pdfRotationMode = previewState.isSideways ? 'sideways' : 'upright';
            }
            listItem.style.setProperty('--thumbnail-rotation', `${previewState.shellRotation}deg`);
            listItem.style.setProperty('--thumbnail-pdf-content-rotation', `${previewState.contentRotation}deg`);
        } else {
            listItem.style.setProperty(
                '--thumbnail-rotation',
                `${getVisualPageRotation(fileEntry)}deg`
            );
            listItem.style.removeProperty('--thumbnail-pdf-content-rotation');
            if (thumbnailContentElement) {
                delete thumbnailContentElement.dataset.pdfRotationMode;
            }
        }
        listItem.style.setProperty('--thumbnail-page-scale', '1');
        if (isImageFile) {
            listItem.dataset.imageLayout = getThumbnailPreviewLayout(fileEntry);
            listItem.style.setProperty('--thumbnail-image-rotation', `${getImageContentRotation(fileEntry)}deg`);
            listItem.style.setProperty('--thumbnail-image-scale', `${getImageLayoutScale(fileEntry)}`);
        }
    };

    const syncOrientationUi = () => {
        updateOrientationBadge();
        syncPreviewFrameOrientation();

        const toggleState = getNextRotationState(fileEntry.rotation);
        orientationToggleBtn.title = toggleState.title;
        orientationToggleBtn.setAttribute('aria-label', toggleState.title);
    };

    syncOrientationUi();

    orientationToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const toggleState = getNextRotationState(fileEntry.rotation);
        fileEntry.rotation = toggleState.rotation;
        fileEntry.rotationVisual = (fileEntry.rotationVisual ?? fileEntry.rotation) + 90;
        syncOrientationUi();
    });

    const imageLayoutSelect = isImageFile ? cardBody.querySelector('.image-layout-card-select') : null;
    if (imageLayoutSelect) {
        imageLayoutSelect.addEventListener("click", (e) => e.stopPropagation());
        imageLayoutSelect.addEventListener("change", (e) => {
            fileEntry.imageLayout = e.currentTarget.value;
            syncOrientationUi();
        });
    }

    rotationControls.appendChild(orientationToggleBtn);

    if (isImageFile) {
        if (fileEntry.imageRotation === undefined) fileEntry.imageRotation = 0;
        if (fileEntry.imageRotationVisual === undefined) {
            fileEntry.imageRotationVisual = ((fileEntry.imageRotation % 360) + 360) % 360;
        }
        const imageRotationBtn = document.createElement("button");
        imageRotationBtn.type = "button";
        imageRotationBtn.className = "orientation-toggle-btn";
        imageRotationBtn.innerHTML = '<span class="material-icons-outlined">rotate_right</span>';
        const syncImageRotationBtn = () => {
            const state = getNextImageRotationState(fileEntry.imageRotation);
            imageRotationBtn.title = state.title;
            imageRotationBtn.setAttribute('aria-label', state.title);
        };
        syncImageRotationBtn();
        imageRotationBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const state = getNextImageRotationState(fileEntry.imageRotation);
            fileEntry.imageRotation = state.imageRotation;
            fileEntry.imageRotationVisual = (fileEntry.imageRotationVisual ?? 0) + 90;
            syncImageRotationBtn();
            syncPreviewFrameOrientation();
        });
        rotationControls.appendChild(imageRotationBtn);
    }

    if (isImageFile) {
        getImageResolution(fileEntry.file).then((resolution) => {
            if (resolution) {
                syncOrientationUi();
            }
        }).catch(() => {
            syncOrientationUi();
        });
    } else if (thumbnail) {
        const updatePdfOrientation = () => {
            fileEntry.baseOrientation = getOrientationFromDimensions(thumbnail.naturalWidth, thumbnail.naturalHeight);
            syncOrientationUi();
        };

        if (thumbnail.complete && thumbnail.naturalWidth > 0) {
            updatePdfOrientation();
        } else {
            thumbnail.addEventListener("load", updatePdfOrientation, { once: true });
        }
    } else {
        syncOrientationUi();
    }
    fileInfoContainer.appendChild(rotationControls);

    listItem.appendChild(fileInfoContainer);

    return listItem;
}

async function updateSelectedFilesList(skipDragReinit = false) {
    try {
        const fileList = DOMCache.getElementById("selected-files-list");
        if (!fileList) {
            console.error("File list element not found");
            return;
        }

        const fragment = document.createDocumentFragment();
        const validFiles = selectedFiles.filter((fileEntry) => isSupportedFileType(fileEntry));

        for (let index = 0; index < validFiles.length; index++) {
            const fileEntry = validFiles[index];
            const listItem = await createFileCard(fileEntry, index);
            fragment.appendChild(listItem);
        }

        fileList.innerHTML = "";
        fileList.appendChild(fragment);

        if (skipDragReinit) {
            if (dragManager) dragManager.makeDraggable();
        } else {
            initializeDragManager();
        }
        updateCardOrderLabels();

        updateButtonVisibility();
        updateToggleItemVisibility();
    } catch (error) {
        console.error("Error updating file list:", error);
        if (selectedFiles.length > 0) {
            updateButtonVisibility();
        }
    }
}

async function appendSelectedFileEntriesToList(fileEntries) {
    if (!fileEntries.length) {
        updateButtonVisibility();
        updateToggleItemVisibility();
        return;
    }

    const fileList = DOMCache.getElementById("selected-files-list");
    if (!fileList) {
        console.error("File list element not found");
        return;
    }

    const fragment = document.createDocumentFragment();
    // Count only file cards; a drag placeholder li would skew the order numbers
    const startIndex = fileList.querySelectorAll('li[data-file-id]').length;

    for (let index = 0; index < fileEntries.length; index++) {
        const fileEntry = fileEntries[index];
        const listItem = await createFileCard(fileEntry, startIndex + index);
        // The entry may have been removed (delete/reset) while the card was
        // rendering; skip it so no ghost card is appended.
        if (findSelectedFileIndexById(fileEntry.id) < 0) {
            continue;
        }
        fragment.appendChild(listItem);
    }

    // Entries can also be removed while LATER cards are still rendering, so
    // re-filter the queued cards right before they hit the DOM.
    for (const queuedCard of Array.from(fragment.children)) {
        if (findSelectedFileIndexById(queuedCard.dataset.fileId) < 0) {
            queuedCard.remove();
        }
    }

    fileList.appendChild(fragment);

    if (dragManager) {
        dragManager.makeDraggable();
    } else {
        initializeDragManager();
    }

    updateCardOrderLabels();
    updateButtonVisibility();
    updateToggleItemVisibility();
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
        // Fallback with simple CSS animation. Look the card up directly:
        // caching a positional selector would return the wrong card later.
        const fileList = DOMCache.getElementById("selected-files-list");
        const cardElement = fileList ? fileList.children[cardIndex] : null;
        if (cardElement) {
            cardElement.style.transform = 'scale(1.1)';
            cardElement.style.transition = 'transform 0.3s ease';
            
            setTimeout(() => {
                cardElement.style.transform = '';
                cardElement.style.transition = '';
            }, 300);
        }
        
        reorderSelectedFiles(cardIndex, selectedFiles.length - 1);
        syncCardDomOrder();
        return;
    }
    
    // Use View Transition API for smooth animation
    document.startViewTransition(() => {
        reorderSelectedFiles(cardIndex, selectedFiles.length - 1);
        syncCardDomOrder();
    });
}

function updateButtonVisibility() {
    const convertButton = DOMCache.getElementById("convert-button");
    const resetButton = DOMCache.getElementById("reset-button");

    const filenameContainer = DOMCache.getElementById("output-filename-container");
    const filenameInput = DOMCache.getElementById("output-filename");

    if (selectedFiles.length > 0) {
        convertButton.style.display = "inline-block";
        resetButton.style.display = "inline-block";
        if (filenameContainer && filenameContainer.style.display === "none") {
            filenameContainer.style.display = "block";
            if (filenameInput && !filenameInput.value) {
                filenameInput.value = `PDFMerge_${getFormattedCurrentDate()}`;
            }
        }
        const blankBtn = DOMCache.getElementById("blank-page-button");
        if (blankBtn) blankBtn.style.display = "inline-block";
    } else {
        convertButton.style.display = "none";
        resetButton.style.display = "none";
        if (filenameContainer) filenameContainer.style.display = "none";
        if (filenameInput) filenameInput.value = "";
        const blankBtn = DOMCache.getElementById("blank-page-button");
        if (blankBtn) blankBtn.style.display = "none";
    }
}

/**
 * Updates visibility of UI toggle items based on selected file types
 */
function updateToggleItemVisibility() {
    const hasImageFiles = selectedFiles.some((fileEntry) => {
        const fileName = fileEntry.name.toLowerCase();
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
async function removeFileFromList(fileId) {
    const index = findSelectedFileIndexById(fileId);
    if (index >= 0 && index < selectedFiles.length) {
        const cardElement = DOMCache.getElementById(fileId);
        
        if (cardElement) {
            // Create explosion effect
            const explosion = new CardExplosion();
            
            // Start explosion animation
            explosion.explodeElement(cardElement, () => {
                // Animation complete callback
                completeFileRemoval(fileId);
            });
        } else {
            // Fallback if card element not found
            completeFileRemoval(fileId);
        }
    }
}

/**
 * Completes the file removal after animation
 * @param {number} index - File index
 * @param {File} file - File object
 */
async function completeFileRemoval(fileId) {
    const index = findSelectedFileIndexById(fileId);
    if (index < 0) return;
    const fileEntry = selectedFiles[index];
    const cardElement = DOMCache.getElementById(fileId);

    // Remove from addedFilesSet to allow re-adding
    if (fileEntry.fingerprint) {
        addedFilesSet.delete(fileEntry.fingerprint);
    }
    revokeThumbnailUrl(fileEntry);
    
    // Remove from selectedFiles array
    selectedFiles.splice(index, 1);
    
    // Remove saved page range from localStorage if it's a PDF
    const fileExtension = fileEntry.extension || fileEntry.name.split(".").pop().toLowerCase();
    if (fileExtension === "pdf") {
        try {
            localStorage.removeItem(getPageRangeStorageKey(fileEntry));
        } catch (error) {
            console.warn('Failed to remove saved page range:', error);
        }
    }
    
    cardElement?.remove();
    if (dragManager) {
        dragManager.makeDraggable();
    }
    updateCardOrderLabels();
    updateDropAreaState();
    updateButtonVisibility();
    updateToggleItemVisibility();
}

function resetFiles() {
    selectedFiles.forEach((fileEntry) => revokeThumbnailUrl(fileEntry));
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
    const dropText = dropArea.querySelector("p.bold");

    if (selectedFiles.length > 0) {
        dropArea.classList.add("has-files");
        if (dropIcon) dropIcon.style.display = "none";
        if (dropText) dropText.style.display = "none";
    } else {
        dropArea.classList.remove("has-files");
        dropArea.classList.remove("drag");
        if (dropIcon) dropIcon.style.display = "";
        if (dropText) dropText.style.display = "";
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

    // Check cache first (LRU: on hit, move to end by delete + re-set)
    if (pdfPageCountCache.has(cacheKey)) {
        const value = pdfPageCountCache.get(cacheKey);
        pdfPageCountCache.delete(cacheKey);
        pdfPageCountCache.set(cacheKey, value);
        return value;
    }

    try {
        const fileBytes = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
            ignoreEncryption: true,
        });
        const pageCount = pdfDoc.getPageCount();

        // Limit cache size to prevent memory issues (evict BEFORE set)
        if (pdfPageCountCache.size >= 100) {
            const firstKey = pdfPageCountCache.keys().next().value;
            pdfPageCountCache.delete(firstKey);
        }

        // Cache the result
        pdfPageCountCache.set(cacheKey, pageCount);

        return pageCount;
    } catch (error) {
        console.error("Error reading PDF page count:", error);
        // Cache null result to avoid repeated failed attempts
        // Evict before set to maintain max size
        if (pdfPageCountCache.size >= 100) {
            const firstKey = pdfPageCountCache.keys().next().value;
            pdfPageCountCache.delete(firstKey);
        }
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
    const cacheKey = createFileFingerprint(file);

    // Check cache first (LRU: on hit, move to end by delete + re-set)
    if (imageResolutionCache.has(cacheKey)) {
        const value = imageResolutionCache.get(cacheKey);
        imageResolutionCache.delete(cacheKey);
        imageResolutionCache.set(cacheKey, value);
        return value;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectURL = URL.createObjectURL(file);

        img.onload = function() {
            URL.revokeObjectURL(objectURL);
            const resolution = {
                width: this.naturalWidth,
                height: this.naturalHeight
            };
            // Limit cache size to prevent memory issues (evict BEFORE set)
            if (imageResolutionCache.size >= 100) {
                imageResolutionCache.delete(imageResolutionCache.keys().next().value);
            }
            imageResolutionCache.set(cacheKey, resolution);
            resolve(resolution);
        };
        img.onerror = function() {
            URL.revokeObjectURL(objectURL);
            reject(new Error('Failed to load image'));
        };
        img.src = objectURL;
    });
}

async function getThumbnailUrl(fileEntry, isPdfFile) {
    if (thumbnailUrlCache.has(fileEntry.id)) {
        return thumbnailUrlCache.get(fileEntry.id);
    }

    if (!isPdfFile) {
        const objectUrl = URL.createObjectURL(fileEntry.file);
        thumbnailUrlCache.set(fileEntry.id, objectUrl);
        return objectUrl;
    }

    if (!pdfThumbnailPromiseCache.has(fileEntry.id)) {
        pdfThumbnailPromiseCache.set(fileEntry.id, renderPdfThumbnail(fileEntry.file, 200));
    }

    let blobUrl;
    try {
        blobUrl = await pdfThumbnailPromiseCache.get(fileEntry.id);
    } finally {
        // Evict on rejection too, otherwise the failed promise is re-awaited
        // forever and the thumbnail can never be retried.
        pdfThumbnailPromiseCache.delete(fileEntry.id);
    }

    // The entry may have been removed (delete/reset) while rendering; never
    // cache a URL for a removed entry, it would leak the blob.
    if (findSelectedFileIndexById(fileEntry.id) < 0) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return null;
    }

    // Rendering can settle with null (e.g. canvas encoding failure); the
    // caller leaves the thumbnail blank, so never cache it as a URL.
    if (blobUrl) {
        thumbnailUrlCache.set(fileEntry.id, blobUrl);
    }
    return blobUrl;
}

function revokeThumbnailUrl(fileEntry) {
    const cachedUrl = thumbnailUrlCache.get(fileEntry.id);
    if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        thumbnailUrlCache.delete(fileEntry.id);
    }

    pdfThumbnailPromiseCache.delete(fileEntry.id);
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

    reorderSelectedFiles(fromIndex, toIndex);
    syncCardDomOrder();
}


function reorderSelectedFiles(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= selectedFiles.length || toIndex >= selectedFiles.length) {
        return;
    }

    const draggedFile = selectedFiles.splice(fromIndex, 1)[0];
    selectedFiles.splice(toIndex, 0, draggedFile);
}

function syncCardDomOrder() {
    const fileList = DOMCache.getElementById("selected-files-list");
    if (!fileList) {
        return;
    }

    const cardElements = selectedFiles.map((fileEntry) => DOMCache.getElementById(fileEntry.id)).filter(Boolean);
    if (cardElements.length !== selectedFiles.length) {
        updateSelectedFilesList(true);
        return;
    }

    cardElements.forEach((cardElement) => {
        fileList.appendChild(cardElement);
    });

    updateCardOrderLabels();
}

function updateCardOrderLabels() {
    const fileList = DOMCache.getElementById("selected-files-list");
    if (!fileList) {
        return;
    }

    Array.from(fileList.querySelectorAll('li')).forEach((cardElement, index) => {
        const orderNumber = cardElement.querySelector('.order-number');
        if (!orderNumber) {
            return;
        }

        const order = index + 1;
        orderNumber.textContent = order.toString();
        orderNumber.title = `Merge order: ${order} (Click to move to end)`;
    });
}




export {
    handleFileInputChange,
    handleDropArea,
    resetFiles,
    createBlankPageEntry,
    selectedFiles,
    isSupportedFileType,
    updateButtonVisibility,
    updateToggleItemVisibility,
    updateDropAreaState,
    addedFilesSet,
    initializeDragManager,
    updateSelectedFilesList,
    appendSelectedFileEntriesToList,
};

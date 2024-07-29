import { formatFileSize, displayFlashMessage } from './utils.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const selectedFiles = [];
const addedFilesSet = new Set();

function handleFileInputChange(event) {
    const fileInput = event.target;
    const fileLink = document.getElementById("file-link");
    const spinner = document.getElementById("spinner");

    fileLink.style.display = "none";
    spinner.style.display = "block";

    Array.from(fileInput.files).forEach((file) => {
        if (isSupportedFileType(file) && isNewFile(file)) {
            addedFilesSet.add(file.name);
            selectedFiles.push(file);
        }
    });

    updateSelectedFilesList();
    spinner.style.display = "none";
}

function handleDropArea(event) {
    event.preventDefault();
    event.target.classList.remove("drag");
    const spinner = document.getElementById("spinner");
    const fileLink = document.getElementById("file-link");

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

    updateSelectedFilesList();
    spinner.style.display = "none";
}

function isSupportedFileType(file) {
    if (!file) return false;
    const supportedExtensions = ["pdf", "jpg", "jpeg", "png", "gif", "webp"];
    const extension = file.name.split(".").pop().toLowerCase();
    return supportedExtensions.includes(extension);
}

function isNewFile(file) {
    if (!file) return false;
    const fileAlreadyExists = selectedFiles.some((f) => f.name === file.name);
    return (
        !fileAlreadyExists &&
        (file.size <= MAX_FILE_SIZE || file.type === "application/pdf")
    );
}

function updateSelectedFilesList() {
    const fileList = document.getElementById("selected-files-list");
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

    filteredFiles.forEach((file, index) => {
        const listItem = document.createElement("li");
        listItem.className = "flex-item";
        listItem.draggable = true;
        listItem.id = `file-${index}`;

        listItem.addEventListener("dragstart", handleDragStart);
        listItem.addEventListener("dragover", handleDragOver);
        listItem.addEventListener("drop", handleDrop);

        const iconSpan = document.createElement("span");
        iconSpan.className = "material-icons-outlined";
        iconSpan.style.marginRight = "8px";
        const fileExtension = file.name.split(".").pop().toLowerCase();

        if (["jpg", "jpeg", "webp", "gif", "png"].includes(fileExtension)) {
            iconSpan.textContent = "image";
        } else if (fileExtension === "pdf") {
            iconSpan.textContent = "description";
        } else {
            iconSpan.textContent = "description";
        }

        const fileSize = formatFileSize(file.size);

        listItem.appendChild(iconSpan);
        listItem.appendChild(document.createTextNode(`${file.name} (${fileSize})`));

        fragment.appendChild(listItem);
    });

    fileList.innerHTML = "";
    fileList.appendChild(fragment);

    updateButtonVisibility();
    updateToggleItemVisibility();
}

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.id);
    e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function handleDrop(e) {
    e.preventDefault();
    const draggedItemId = e.dataTransfer.getData('text');
    const draggedItem = document.getElementById(draggedItemId);
    const dropTarget = e.target.closest('li');

    if (dropTarget && draggedItem !== dropTarget) {
        const draggedIndex = parseInt(draggedItemId.split('-')[1]);
        const targetIndex = parseInt(dropTarget.id.split('-')[1]);

        const itemToMove = selectedFiles[draggedIndex];
        selectedFiles.splice(draggedIndex, 1);
        selectedFiles.splice(targetIndex, 0, itemToMove);

        updateSelectedFilesList();
    }
}

function updateButtonVisibility() {
    const convertButton = document.getElementById("convert-button");
    const resetButton = document.getElementById("reset-button");

    if (selectedFiles.length > 0) {
        convertButton.style.display = "inline-block";
        resetButton.style.display = "inline-block";
    } else {
        convertButton.style.display = "none";
        resetButton.style.display = "none";
    }
}

function updateToggleItemVisibility() {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const hasImageFiles = selectedFiles.some((file) => {
        const fileName = file.name.toLowerCase();
        return imageExtensions.some((ext) => fileName.endsWith(ext));
    });

    const toggleImageItem = document.getElementById("image-details-toggle");
    const toggleWatermarkItem = document.getElementById("watermark-details-toggle");

    toggleImageItem.style.display = hasImageFiles ? "block" : "none";
    toggleWatermarkItem.style.display = selectedFiles.length > 0 ? "block" : "none";
}

function resetFiles() {
    selectedFiles.length = 0;
    const fileList = document.getElementById("selected-files-list");
    fileList.innerHTML = "";
    const fileInput = document.getElementById("file-input");
    fileInput.value = "";
    updateButtonVisibility();
    updateToggleItemVisibility();
}

export {
    handleFileInputChange,
    handleDropArea,
    updateSelectedFilesList,
    resetFiles,
    selectedFiles,
    isSupportedFileType,
    updateButtonVisibility,
    updateToggleItemVisibility  
};
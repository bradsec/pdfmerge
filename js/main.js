import { handleFileInputChange, handleDropArea, resetFiles, updateButtonVisibility } from './fileHandling.js';
import { convertToPDF } from './pdfProcessing.js';
import { initWatermarkControls } from './watermark.js';

function initializeApp() {
    const fileInput = document.getElementById("file-input");
    const dropArea = document.getElementById("drop-area");
    const convertButton = document.getElementById("convert-button");
    const resetButton = document.getElementById("reset-button");

    fileInput.addEventListener("change", handleFileInputChange);
    
    dropArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropArea.classList.add("drag");
    });

    dropArea.addEventListener("dragleave", () => {
        dropArea.classList.remove("drag");
    });

    dropArea.addEventListener("drop", handleDropArea);

    convertButton.addEventListener("click", convertToPDF);
    resetButton.addEventListener("click", resetFiles);

    updateButtonVisibility();
    initWatermarkControls();
    loadCheckboxStates();
}

function loadCheckboxStates() {
    const checkboxIds = [
        "print-image-details",
        "print-image-page-numbers",
        "print-image-hash",
        "landscape-orientation"
    ];

    checkboxIds.forEach(id => {
        const checkbox = document.getElementById(id);
        const savedState = localStorage.getItem(id);
        checkbox.checked = savedState === "true";
        
        checkbox.addEventListener("change", function() {
            localStorage.setItem(id, this.checked);
        });
    });
}

document.addEventListener("DOMContentLoaded", initializeApp);
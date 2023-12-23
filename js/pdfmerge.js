// Check for FileReader API support
function checkFileReaderSupport() {
  if (window.FileReader) {
    console.log("FileReader API is supported.");
  } else {
    console.error("FileReader API is not supported in your browser.");
    displayFlashMessage(
      "Your browser does not support required features. Please update your browser or try a different one.", "danger"
    );
  }
}

// Reset the page
function resetPage() {
  location.reload();
}

// Estimate text width
function estimateTextWidth(text, fontSize) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${fontSize}px Arial`;
  return context.measureText(text).width;
}

function isLandscapeOrientation() {
  return document.getElementById('landscape-orientation').checked;
}


// Convert hex to RGB
function hexToRgb(hex) {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) {
    console.error("Invalid hex color: " + hex);
    return null;
  }
  hex = hex.replace(/^#/, ""); // Remove the hash at the start if it's there
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const selectedFiles = [];
const addedFilesSet = new Set();
let currentPageIndex = 0;
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("selected-files-list");
const watermarkCheckbox = document.getElementById('add-watermark');
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

// Function to reset selected files
function resetFiles() {
  selectedFiles.length = 0;
  fileList.innerHTML = "";
  fileInput.value = "";
}

function updateSelectedFilesList() {
  const fragment = document.createDocumentFragment(); // Create a document fragment

  selectedFiles.forEach((file, index) => {
    const listItem = document.createElement("li");
    listItem.className = "flex-item";
    listItem.draggable = true;
    listItem.id = `file-${index}`;

    // Add event listeners for drag-and-drop
    listItem.addEventListener("dragstart", handleDragStart);
    listItem.addEventListener("dragover", handleDragOver);
    listItem.addEventListener("drop", handleDrop);

    // Create a span for the file icon
    const iconSpan = document.createElement("span");
    iconSpan.className = "material-icons-outlined";
    iconSpan.style.marginRight = "8px";
    const fileExtension = file.name.split(".").pop().toLowerCase();

    // Determine the icon based on the file extension
    if (["jpg", "jpeg", "webp", "gif", "png"].includes(fileExtension)) {
      iconSpan.textContent = "image";
    } else if (fileExtension === "pdf") {
      iconSpan.textContent = "description";
    } else {
      iconSpan.textContent = "description";
    }

    const fileSize = formatFileSize(file.size);

    // Append elements to the list item
    listItem.appendChild(iconSpan);
    listItem.appendChild(document.createTextNode(`${file.name} (${fileSize})`));

    // Append the list item to the document fragment
    fragment.appendChild(listItem);
  });

  // Clear the existing content and append the new fragment
  fileList.innerHTML = '';
  fileList.appendChild(fragment);

  // Update button visibility and other UI elements as needed
  updateButtonVisibility();
  updateToggleItemVisibility();
}


let draggedItemIndex = null;

function handleDragStart(e) {
  draggedItemIndex = parseInt(e.target.id.replace("file-", ""));
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

let orderChanged = false;

function handleDrop(e) {
  e.preventDefault();
  const listItem = e.target.closest("li"); // Find the closest list item ancestor
  if (!listItem) return;

  const targetIndex = parseInt(listItem.id.replace("file-", ""));
  if (draggedItemIndex !== targetIndex) {
    const itemToMove = selectedFiles[draggedItemIndex];
    selectedFiles.splice(draggedItemIndex, 1); // Remove the item from its original position
    selectedFiles.splice(targetIndex, 0, itemToMove); // Insert it at the new position
    orderChanged = true; // Set flag to true when order changes
    updateSelectedFilesList(); // Update the list display
  }
}

// Event listener for file input change
fileInput.addEventListener("change", () => {
  const newFiles = fileInput.files;
  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    if (file.type === "application/pdf" || file.size <= MAX_FILE_SIZE) {
      if (!selectedFiles.find((f) => f.name === file.name)) {
        selectedFiles.push(file);
      }
    } else if (file.type.startsWith("image/")) {
      displayFlashMessage("Image size exceeds max file size limit.", "danger");
    } else {
      displayFlashMessage("File size exceeds max file size limit.", "danger");
    }
  }
  updateSelectedFilesList();
});

// Event listeners for drag and drop
const dropArea = document.getElementById("drop-area");
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("drag");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("drag");
});

// Event listeners for drag and drop
dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("drag");
  const newFiles = e.dataTransfer.files;
  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    if (file.size <= MAX_FILE_SIZE || file.type === "application/pdf") {
      selectedFiles.push(file);
    } else if (file.type.startsWith("image/")) {
      displayFlashMessage("Image size exceeds max size limit.", "danger");
    }
  }
  updateSelectedFilesList();
});

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
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"]; // Add more image extensions if needed

  // Check if there are any image files in the selectedFiles array
  const hasImageFiles = selectedFiles.some((file) => {
    const fileName = file.name.toLowerCase();
    return imageExtensions.some((ext) => fileName.endsWith(ext));
  });

  // Get the toggle-item div
  const toggleItem = document.getElementById("image-details-toggle");

  // Show or hide the toggle-item div based on whether there are image files
  toggleItem.style.display = hasImageFiles ? "block" : "none";
}

// Function to format date time as "dd mmm yyyy, hh:mm:ss"
function formatDateTime(dateTime) {
  if (!dateTime) {
    return ""; // Handle the case when dateTime is null or undefined
  }

  // Convert your date format "2018:08:22 13:13:41" to a standard format
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

  // Check if standardizedDateTime is a valid date string
  const isValidDate = !isNaN(Date.parse(standardizedDateTime));

  if (isValidDate) {
    return new Date(standardizedDateTime).toLocaleString("en-US", options);
  } else {
    return "Invalid Date"; // Return an error message for invalid dates
  }
}

// Function to draw wrapped text
function drawWrappedText(
  page,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  font,
  fontSize,
  hexColor
) {
  const { r, g, b } = hexToRgb(hexColor);
  const color = PDFLib.rgb(r, g, b);
  const words = text.split(" ");
  let line = "";
  let lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = font.widthOfTextAtSize(testLine, fontSize);
    const testWidth = metrics;

    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }

  lines.push(line);

  for (let k = 0; k < lines.length; k++) {
    page.drawText(lines[k], {
      x: x,
      y: y - k * lineHeight,
      size: fontSize,
      font: font,
      color: color,
    });
  }
}

// Define dimensions for ISO paper sizes
const paperDimensions = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
};

function resizeImageAndConvertToJPEG(originalFile) {
  return new Promise((resolve, reject) => {
    if (!window.FileReader) {
      return reject("FileReader API is not supported by your browser.");
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          const isLandscape = isLandscapeOrientation();
          let pageWidth, pageHeight;
          if (isLandscape) {
            [pageHeight, pageWidth] = getSelectedPaperSize();
          } else {
            [pageWidth, pageHeight] = getSelectedPaperSize();
          }

          const widthMM = pageWidth / 2.83465;
          const heightMM = pageHeight / 2.83465;
          const maxWidthPixels = widthMM * (300 / 25.4);
          const maxHeightPixels = heightMM * (300 / 25.4);

          let width = img.width;
          let height = img.height;
          const scalingFactor = Math.min(maxWidthPixels / width, maxHeightPixels / height);
          width = width * scalingFactor;
          height = height * scalingFactor;

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          img.src = '';
          canvas.remove();
          resolve(dataUrl);
        } catch (error) {
          console.error("Error in image processing:", error);
          reject("Error during image processing.");
        }
      };
      img.onerror = () => {
        reject("Error loading the image file.");
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      reject("Error reading the file.");
    };
    reader.readAsDataURL(originalFile);
  });
}


function getImageDetails(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const fileExtension = file.name.split(".").pop().toLowerCase();
        let imgGpsInfo = null, imgDateTime = null, tags = null;

        if (fileExtension !== "webp" && fileExtension !== "gif") {
          tags = ExifReader.load(e.target.result, { expanded: true });
          if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
            const gpsLat = tags.gps.Latitude;
            const gpsLong = tags.gps.Longitude;
            imgGpsInfo = `${gpsLat.toFixed(6)}, ${gpsLong.toFixed(6)}`;
          }
          if (tags.exif && tags.exif.DateTimeOriginal) {
            imgDateTime = tags.exif.DateTimeOriginal.description;
          }
        }
        resolve({ exifData: tags, imgGpsInfo, imgDateTime });
      } catch (error) {
        console.error("Error in getImageDetails:", error);
        reject("Error processing image details.");
      }
    };
    reader.onerror = () => {
      reject("Error reading the file for image details.");
    };
    reader.readAsArrayBuffer(file);
  });
}


// Helper function to format file size
function formatFileSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes == 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + "" + sizes[i];
}

function handleConversionTimeout() {
  console.error("Conversion process timed out.");
  displayFlashMessage("Conversion process took too long and was terminated.", "danger");

  // Wait for 3 seconds before reloading the page
  setTimeout(function () {
    resetPage();
  }, 3000); // 3000 milliseconds = 3 seconds
}

// Function to get selected paper size with A4 as the default
function getSelectedPaperSize() {
  selectedSize = "A4";
  const [widthMM, heightMM] = paperDimensions[selectedSize]; // Get dimensions in millimeters
  const widthPoints = widthMM * 2.83465; // Convert width to points
  const heightPoints = heightMM * 2.83465; // Convert height to points
  return [widthPoints, heightPoints];
}

function chunkArray(array, size) {
  const chunkedArr = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArr.push(array.slice(i, i + size));
  }
  return chunkedArr;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function convertToPDF() {
  let conversionTimeout; 

  try {
    currentPageIndex = 0;
    const TIMEOUT_DURATION = 60000; // Timeout duration in milliseconds (60 seconds)
    const { PDFDocument, rgb } = PDFLib;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const regularFontResponse = await fetch("fonts/Roboto-Regular.ttf");
    const regularFontBytes = await regularFontResponse.arrayBuffer();
    const regularFont = await pdfDoc.embedFont(regularFontBytes);

    const boldFontResponse = await fetch("fonts/Roboto-Bold.ttf");
    const boldFontBytes = await boldFontResponse.arrayBuffer();
    const boldFont = await pdfDoc.embedFont(boldFontBytes);

    const blackFontResponse = await fetch("fonts/Roboto-Black.ttf");
    const blackFontBytes = await blackFontResponse.arrayBuffer();
    const blackFont = await pdfDoc.embedFont(blackFontBytes);

    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    progressContainer.style.display = "block";

    let conversionTimeout = setTimeout(() => {
      handleConversionTimeout();
    }, TIMEOUT_DURATION);

    if (selectedFiles.length < 1) {
      displayFlashMessage("Select at least one image to convert.", "warning");
      return;
    }

    const BATCH_SIZE = 5;
    const fileChunks = chunkArray(selectedFiles, BATCH_SIZE);
    let processedFiles = 0;

    for (const chunk of fileChunks) {
      await processFileChunk(chunk, pdfDoc, regularFont, boldFont);
      processedFiles += chunk.length;
      progressBar.style.width = `${(processedFiles / selectedFiles.length) * 100}%`;
      await sleep(500);
    }

    if (isWatermarkEnabled) {
      const pages = pdfDoc.getPages();
      pages.forEach(page => addWatermarkToPage(page, watermarkText, blackFont));
    }

    const pdfBytes = await pdfDoc.save();
    displayFlashMessage("PDF Merge complete.", "success");
    preparefileLink(pdfBytes);
  } catch (error) {
    console.error("Error during PDF conversion:", error);
    displayFlashMessage(`An error occurred during PDF conversion: ${error.message}`, "danger");
  } finally {
    resetFiles();
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
    clearTimeout(conversionTimeout);
    updateButtonVisibility();
    updateToggleItemVisibility();
    watermarkCheckbox.checked = false;
  }
}

async function processFileChunk(chunk, pdfDoc, regularFont, boldFont) {

  for (const file of chunk) {
    try {
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop().toLowerCase();
      if (
        fileExtension === "jpg" ||
        fileExtension === "jpeg" ||
        fileExtension === "webp" ||
        fileExtension === "gif" ||
        fileExtension === "png"
      ) {
        const dataUrl = await resizeImageAndConvertToJPEG(file);
        const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
          c.charCodeAt(0)
        );

        const isLandscape = isLandscapeOrientation();
        let pageWidth, pageHeight;
        if (isLandscape) {
          [pageHeight, pageWidth] = getSelectedPaperSize(); // Swap dimensions for landscape
        } else {
          [pageWidth, pageHeight] = getSelectedPaperSize(); // Keep original dimensions for portrait
        }
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const leftMargin = 30;
        const topMargin = 40;
        const rightMargin = pageWidth - 30;
        const bottomMargin = pageHeight - 40;

        const image = await pdfDoc.embedJpg(imageBytes);

        if (shouldPrintImageDetails() || shouldPrintImagePageNumbers() || shouldPrintImageHash) {
          const fontSize = 10;
          const maxTextWidth = rightMargin - leftMargin;
          const lineHeight = 14;
          const textX = leftMargin;
          let textY = pageHeight - 20;

          if (shouldPrintImageDetails()) {
            // Get image details
            const imgDetails = await getImageDetails(file);
            const imgGpsInfo = imgDetails.imgGpsInfo;
            const imgDateTime = imgDetails.imgDateTime;

            // Draw filename
            textY -= lineHeight; // Adjust Y position for each detail
            drawWrappedText(
              page,
              `${fileName}`,
              textX,
              textY,
              maxTextWidth,
              lineHeight,
              boldFont,
              fontSize,
              "#000000"
            );

            if (imgDateTime !== null) {
              const formattedDateTime = formatDateTime(imgDateTime);
              textY -= lineHeight; // Adding an extra line's height for spacing between details
              drawWrappedText(
                page,
                `${formattedDateTime}`,
                textX,
                textY,
                maxTextWidth,
                lineHeight,
                regularFont,
                fontSize,
                "#000000"
              );
            }

            if (imgGpsInfo) {
              textY -= lineHeight; // Adjust Y position for each detail
              drawWrappedText(
                page,
                `GPS (Lat, Long) ${imgGpsInfo}`,
                textX,
                textY,
                maxTextWidth,
                lineHeight,
                regularFont,
                fontSize,
                "#000000"
              );
            }
          }
            
            if (shouldPrintImageHash()) {
              // Calculate the SHA256 hash from the file data
              const fileData = await new Response(file).arrayBuffer();
              const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const imgHash = hashArray
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

              if (imgHash !== null) {
                textY -= lineHeight; // Adjust Y position for spacing
                drawWrappedText(
                  page,
                  `SHA-256: ${imgHash}`,
                  textX,
                  textY,
                  maxTextWidth,
                  lineHeight,
                  regularFont,
                  fontSize,
                  "#000000"
                );
              }
            }

            if (shouldPrintImagePageNumbers()) {
              const pageNumberText = `Image ${currentPageIndex + 1}`;
              const pageNumberFontSize = 10;
              const pageNumberWidth = estimateTextWidth(pageNumberText, pageNumberFontSize);
              const pageNumberX = pageWidth - pageNumberWidth - 30; // Adjust for right margin
              const pageNumberY = 30; // Adjust as needed for bottom margin
            
              // Use drawText instead of drawWrappedText for precise positioning
              page.drawText(pageNumberText, {
                x: pageNumberX,
                y: pageNumberY,
                size: pageNumberFontSize,
                font: regularFont,
                color: PDFLib.rgb(0, 0, 0)
              });
              currentPageIndex++;
            }
            
            
            let imgDetailsPadding = 100;

            let imgDim = image.scaleToFit(
              rightMargin - leftMargin,
              bottomMargin - topMargin - imgDetailsPadding
            );

            let xPosition =
              (rightMargin - leftMargin - imgDim.width) / 2 + leftMargin;
            let yPosition =
              (bottomMargin - topMargin - imgDim.height) / 2 + topMargin;

            page.drawImage(image, {
              x: xPosition,
              y: yPosition,
              width: imgDim.width,
              height: imgDim.height,
            });
        } else {
          let imgDim = image.scaleToFit(
            rightMargin - leftMargin,
            bottomMargin - topMargin
          );

          let xPosition =
            (rightMargin - leftMargin - imgDim.width) / 2 + leftMargin;
          let yPosition =
            (bottomMargin - topMargin - imgDim.height) / 2 + topMargin;

          page.drawImage(image, {
            x: xPosition,
            y: yPosition,
            width: imgDim.width,
            height: imgDim.height,
          });
        }
      } else if (fileExtension === "pdf") {
        const fileBytes = await fetch(URL.createObjectURL(file)).then((res) =>
          res.arrayBuffer()
        );
        const existingPdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
          ignoreEncryption: true,
        });
        const copiedPages = await pdfDoc.copyPages(
          existingPdfDoc,
          existingPdfDoc.getPageIndices()
        );
        copiedPages.forEach((page) => pdfDoc.addPage(page));
      } else {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }
    } catch (error) {
      console.error("Error processing file chunk:", error);
    }
  }
}

function getFormattedCurrentDate() {
  const currentDate = new Date();
  return currentDate.toISOString().replace(/:/g, "").replace(/-/g, "").replace(/\.\d+/, "");
}

function preparefileLink(pdfBytes) {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const filename = `PDFMerge_${getFormattedCurrentDate()}.pdf`;
  const fileSize = formatFileSize(blob.size);
  const fileLink = document.getElementById("file-link");
  const anchor = document.createElement("a");


  // Trigger the file download
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.style.display = "none"; // Hide the anchor element
  document.body.appendChild(anchor);
  anchor.click(); // Simulate a click on the anchor to trigger the download

  // Display a link to the downloaded file
  fileLink.href = blobUrl;
  fileLink.innerHTML = `<a href="${blobUrl}" class="file-link flash-success"><span class="material-icons-outlined" style="font-size:45px;">picture_as_pdf</span>${filename} (${fileSize})</a>`;
  fileLink.style.display = "block"; // Make sure it's visible

  // Clean up after a delay
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    fileLink.innerHTML = "";
    resetPage();
  }, 60000); // Cleanup after 60 seconds
}

// Function to check if the checkbox for print image details is checked
function shouldPrintImageDetails() {
  const checkbox = document.getElementById("print-image-details");
  return checkbox && checkbox.checked;
}

function shouldPrintImagePageNumbers() {
  const checkbox = document.getElementById("print-image-page-numbers");
  return checkbox && checkbox.checked;
}

function shouldPrintImageHash() {
  const checkbox = document.getElementById("print-image-hash");
  return checkbox && checkbox.checked;
}

// Initialize event listeners
function initEventListeners() {
  fileInput.addEventListener("change", handleFileInputChange);

  const dropArea = document.getElementById("drop-area");
  dropArea.addEventListener("dragover", handleDragOverArea);
  dropArea.addEventListener("dragleave", () =>
    dropArea.classList.remove("drag")
  );
  dropArea.addEventListener("drop", handleDropArea);

  const imageDetailsCheckbox = document.getElementById("print-image-details");
  imageDetailsCheckbox.addEventListener("change", handleImageDetailsCheckboxChange);

  const imagePageNumbersCheckbox = document.getElementById("print-image-details");
  imagePageNumbersCheckbox.addEventListener("change", handleImagePageNumbersCheckboxChange);

  const imageHashCheckbox = document.getElementById("print-image-hash");
  imageHashCheckbox.addEventListener("change", handleImageHashCheckboxChange);

  const imageOrientationCheckbox = document.getElementById("landscape-orientation");
  imageOrientationCheckbox.addEventListener("change", handleImageOrientationCheckboxChange);

  document.addEventListener('DOMContentLoaded', toggleWatermarkOptions);
  document.getElementById('add-watermark').addEventListener('change', toggleWatermarkOptions);

  document.addEventListener("DOMContentLoaded", loadCheckboxState);
}

function handleFileInputChange() {
  const spinner = document.getElementById("spinner");
  const fileLink = document.getElementById("file-link");
  fileLink.style.display = "none";
  spinner.style.display = "block";

  Array.from(this.files).forEach((file) => {
    if (isNewFile(file) && !addedFilesSet.has(file.name)) {
      addedFilesSet.add(file.name);
      selectedFiles.push(file);
    }
  });

  updateSelectedFilesList();
  spinner.style.display = "none";
}

function handleDropArea(e) {
  e.preventDefault();
  this.classList.remove("drag");
  const spinner = document.getElementById("spinner");
  const fileLink = document.getElementById("file-link");
  fileLink.style.display = "none";
  spinner.style.display = "block";

  Array.from(e.dataTransfer.files).forEach((file) => {
    if (isNewFile(file) && !addedFilesSet.has(file.name)) {
      addedFilesSet.add(file.name);
      selectedFiles.push(file);
    }
  });

  updateSelectedFilesList();
  spinner.style.display = "none";
}


function isNewFile(file) {
  return (
    (file.size <= MAX_FILE_SIZE || file.type === "application/pdf") &&
    !selectedFiles.find((f) => f.name === file.name)
  );
}

function handleDragOverArea(e) {
  e.preventDefault();
  this.classList.add("drag");
}

function handleImageDetailsCheckboxChange() {
  localStorage.setItem("imageDetails", this.checked);
}

function handleImagePageNumbersCheckboxChange() {
  localStorage.setItem("imagePageNumbers", this.checked);
}

function handleImageHashCheckboxChange() {
  localStorage.setItem("imageHash", this.checked);
}

function handleImageOrientationCheckboxChange() {
  localStorage.setItem("landscapeOrientation", this.checked);
}


function loadCheckboxState() {
  const printImageDetailsState = localStorage.getItem("imageDetails");
  document.getElementById("print-image-details").checked =
    printImageDetailsState === "true";
  
  const printImagePageNumbersState = localStorage.getItem("imagePageNumbers");
  document.getElementById("print-image-page-numbers").checked =
    printImagePageNumbersState === "true";

  const printImageHashState = localStorage.getItem("imageHash");
  document.getElementById("print-image-hash").checked =
    printImageHashState === "true";

  const landscapeOrientationState = localStorage.getItem("landscapeOrientation");
  document.getElementById("landscape-orientation").checked =
    landscapeOrientationState === "true";
}

// Add new global variables
let watermarkText = '';
let isWatermarkEnabled = false;
let watermarkColor = '#000000';
let watermarkOpacity = 0.5;

// Initialize event listeners for the new UI elements
function initWatermarkControls() {
  const watermarkTextInput = document.getElementById('watermark-text');
  const watermarkColorInput = document.getElementById('watermark-color');
  const watermarkOpacityInput = document.getElementById('watermark-opacity');
  const watermarkGroup = document.querySelector('.watermark-group');

  watermarkCheckbox.checked = false;
  watermarkTextInput.value = '';
  watermarkColorInput.value = '#000000';
  watermarkGroup.style.display = "none";
  watermarkOpacityInput.value = 0.5;

  watermarkCheckbox.addEventListener('change', function() {
    isWatermarkEnabled = this.checked;
  });

  watermarkTextInput.addEventListener('input', function() {
    watermarkText = this.value;
  });

  watermarkColorInput.addEventListener('input', function() {
      watermarkColor = this.value;
  });

  watermarkOpacityInput.addEventListener('input', function() {
    watermarkOpacity = parseFloat(this.value);
  });
}

function addWatermarkToPage(page, text, font) {
    // Set default watermark text if none is specified
    if (!text || text.trim() === '') {
      text = 'PDFMerge';
  }

  const { width, height } = page.getSize();
  const fontSize = calculateWatermarkFontSize(width, height, text, font);
  const { r, g, b } = hexToRgb(watermarkColor);

  // Calculate diagonal angle in radians and convert to degrees
  const angleRadians = Math.atan(height / width);
  const angleDegrees = angleRadians * (180 / Math.PI);

  // Calculate starting position for the text
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
    opacity: watermarkOpacity
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

function toggleWatermarkOptions() {
  const watermarkGroup = document.querySelector('.watermark-group');
  const watermarkCheckbox = document.getElementById('add-watermark');

  if (watermarkCheckbox.checked) {
    watermarkGroup.style.display = "flex";
  } else {
    watermarkGroup.style.display = "none";
    initWatermarkControls();
  }
}


// Call this function on page load or before the relevant features are used
checkFileReaderSupport();
initEventListeners();
initWatermarkControls();

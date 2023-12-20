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

// Convert hex to RGB
function hexToRgb(hex) {
  hex = hex.replace(/^#/, ""); // Remove the hash at the start if it's there
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

const selectedFiles = [];
const addedFilesSet = new Set();

// Function to reset selected files
function resetFiles() {
  selectedFiles.length = 0;
  const imageList = document.getElementById("selected-files-list");
  imageList.innerHTML = "";
  const fileInput = document.getElementById("file-input");
  fileInput.value = "";
}

function updateSelectedFilesList() {
  const imageList = document.getElementById("selected-files-list");
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
  imageList.innerHTML = '';
  imageList.appendChild(fragment);

  // Update button visibility and other UI elements as needed
  updateButtonVisibility();
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
  const targetIndex = parseInt(e.target.id.replace("file-", ""));
  if (draggedItemIndex !== targetIndex) {
    const itemToMove = selectedFiles[draggedItemIndex];
    selectedFiles.splice(draggedItemIndex, 1); // Remove the item from its original position
    selectedFiles.splice(targetIndex, 0, itemToMove); // Insert it at the new position
    orderChanged = true; // Set flag to true when order changes
    updateSelectedFilesList(); // Update the list display
  }
}

const fileInput = document.getElementById("file-input");

// Event listener for file input change
fileInput.addEventListener("change", () => {
  const newFiles = fileInput.files;
  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    if (file.type === "application/pdf" || file.size <= 20 * 1024 * 1024) {
      if (!selectedFiles.find((f) => f.name === file.name)) {
        selectedFiles.push(file);
      }
    } else if (file.type.startsWith("image/")) {
      displayFlashMessage("Image size exceeds 20MB limit.", "danger");
    } else {
      displayFlashMessage("File size exceeds 20MB limit.", "danger");
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
    if (file.size <= 20 * 1024 * 1024 || file.type === "application/pdf") {
      selectedFiles.push(file);
    } else if (file.type.startsWith("image/")) {
      displayFlashMessage("Image size exceeds 20MB limit.", "danger");
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

// Function to get selected paper size with A4 as the default
function getSelectedPaperSize() {
  const dropdown = document.getElementById("paper-size-dropdown");
  return dropdown.value || "A4"; // Use A4 as the default if no size is selected
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
    if (window.FileReader) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Get selected paper size in points
          const [widthPoints, heightPoints] = getSelectedPaperSize();
          // Convert points to millimeters
          const widthMM = widthPoints / 2.83465;
          const heightMM = heightPoints / 2.83465;
          // Calculate max width and height in pixels for 300 DPI
          const maxWidthPixels = widthMM * (300 / 25.4);
          const maxHeightPixels = heightMM * (300 / 25.4);

          let width = img.width;
          let height = img.height;

          // Calculate the scaling factor
          const scalingFactor = Math.min(
            maxWidthPixels / width,
            maxHeightPixels / height
          );
          width = width * scalingFactor;
          height = height * scalingFactor;

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG at 90% quality
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
              // Cleanup
              img.src = '';
              canvas.remove();

              resolve(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(originalFile);
    } else {
      reject("FileReader API is not supported by your browser.");
    }
  });
}

function getImageDetails(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const fileExtension = file.name.split(".").pop().toLowerCase();
        let imgGpsInfo = null,
          imgDateTime = null,
          tags = null;

        // Only use ExifReader for file types other than .webp and .gif
        if (fileExtension !== "webp" && fileExtension !== "gif") {
          tags = ExifReader.load(e.target.result, { expanded: true });
          // Check if GPS data exists
          if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
            const gpsLat = tags.gps.Latitude;
            const gpsLong = tags.gps.Longitude;

            imgGpsInfo = `${gpsLat.toFixed(6)}, ${gpsLong.toFixed(6)}`;
          }

          // Check if DateTimeOriginal exists in the EXIF data
          if (tags.exif && tags.exif.DateTimeOriginal) {
            imgDateTime = tags.exif.DateTimeOriginal.description;
          }
        }

        // Compute imgHash hash
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          e.target.result
        );
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        resolve({
          exifData: tags,
          imgGpsInfo: imgGpsInfo,
          imgDateTime: imgDateTime,
          imgHash: hashHex,
        });
      } catch (error) {
        console.error("Error in getImageDetails:", error);
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Helper function to format file size
function formatFileSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes == 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
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
  const TIMEOUT_DURATION = 60000; // Timeout duration in milliseconds (60 seconds)
  const { PDFDocument, rgb } = PDFLib;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontResponse = await fetch("fonts/Roboto-Regular.ttf");
  const fontBytes = await fontResponse.arrayBuffer();
  const customFont = await pdfDoc.embedFont(fontBytes);

  const progressContainer = document.getElementById("progress-container");
  progressContainer.style.display = "block";
  const progressBar = document.getElementById("progress-bar");

  // Start the conversion timeout
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

  try {
    for (const chunk of fileChunks) {
      await processFileChunk(chunk, pdfDoc, customFont);
      processedFiles += chunk.length;
      progressBar.style.width = `${(processedFiles / selectedFiles.length) * 100}%`;
      await sleep(500);
    }

    const pdfBytes = await pdfDoc.save();
    downloadPDF(pdfBytes);

    displayFlashMessage("PDF Merge completed.", "success");
  } catch (error) {
    console.error("Error during conversion:", error);
    displayFlashMessage(`An error occurred: ${error.message}`, "danger");
  } finally {
    // Cleanup, UI updates, and clearing timeout
    resetFiles();
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
    clearTimeout(conversionTimeout);
  }
}

async function processFileChunk(chunk, pdfDoc, customFont) {
  for (const file of chunk) {
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

      const [pageWidth, pageHeight] = getSelectedPaperSize();
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const leftMargin = 25;
      const topMargin = 40;
      const rightMargin = pageWidth - 25;
      const bottomMargin = pageHeight - 40;

      const image = await pdfDoc.embedJpg(imageBytes);

      if (shouldPrintImageDetails()) {
        const fontSize = 10;
        const maxTextWidth = rightMargin - leftMargin;
        const lineHeight = 14;
        const textX = leftMargin;
        let textY = pageHeight - 20;

        // Get image details
        const imgDetails = await getImageDetails(file);

        const imgGpsInfo = imgDetails.imgGpsInfo;
        const imgDateTime = imgDetails.imgDateTime;

        // Calculate the SHA256 hash from the file data
        const fileData = await new Response(file).arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const imgHash = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Draw filename
        textY -= lineHeight; // Adjust Y position for each detail
        drawWrappedText(
          page,
          `Name: ${fileName}`,
          textX,
          textY,
          maxTextWidth,
          lineHeight,
          customFont,
          fontSize,
          "#000000"
        );

        if (imgHash !== null) {
          textY -= lineHeight; // Adjust Y position for spacing
          drawWrappedText(
            page,
            `Hash: ${imgHash}`,
            textX,
            textY,
            maxTextWidth,
            lineHeight,
            customFont,
            fontSize,
            "#000000"
          );
        }

        if (imgDateTime !== null) {
          const formattedDateTime = formatDateTime(imgDateTime);
          textY -= lineHeight; // Adding an extra line's height for spacing between details
          drawWrappedText(
            page,
            `Date: ${formattedDateTime}`,
            textX,
            textY,
            maxTextWidth,
            lineHeight,
            customFont,
            fontSize,
            "#000000"
          );
        }

        if (imgGpsInfo) {
          textY -= lineHeight; // Adjust Y position for each detail
          drawWrappedText(
            page,
            `GPS (Lat, Long): ${imgGpsInfo}`,
            textX,
            textY,
            maxTextWidth,
            lineHeight,
            customFont,
            fontSize,
            "#000000"
          );
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
  }
}

async function downloadPDF(pdfBytes) {
  const currentDate = new Date();
  const formattedDate = currentDate
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "")
    .replace(/, /g, "_")
    .replace(/:/g, "");

  const filename = `pdfmerge_${formattedDate}.pdf`;

  try {
    if ("showSaveFilePicker" in window) {
      // Logic for browsers that support the File System Access API
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBytes);
      await writable.close();
    } else {
      // Fallback logic for browsers that do not support the File System Access API
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error("Error during PDF download:", error);
    displayFlashMessage("File save was cancelled or failed.", "danger");
  } finally {
    updateButtonVisibility();
  }
}


function degrees(degrees) {
  return (degrees * Math.PI) / 180;
}

// Function to check if the checkbox for print image details is checked
function shouldPrintImageDetails() {
  const checkbox = document.getElementById("print-image-details");
  return checkbox && checkbox.checked;
}

// Initialize event listeners
function initEventListeners() {
  const fileInput = document.getElementById("file-input");
  fileInput.addEventListener("change", handleFileInputChange);

  const dropArea = document.getElementById("drop-area");
  dropArea.addEventListener("dragover", handleDragOverArea);
  dropArea.addEventListener("dragleave", () =>
    dropArea.classList.remove("drag")
  );
  dropArea.addEventListener("drop", handleDropArea);

  const printImageDetailsCheckbox = document.getElementById(
    "print-image-details"
  );
  printImageDetailsCheckbox.addEventListener("change", handleCheckboxChange);

  document.addEventListener("DOMContentLoaded", loadCheckboxState);
}

function handleFileInputChange() {
  const spinner = document.getElementById("spinner"); // Get the spinner element
  spinner.style.display = "block"; // Show the spinner

  Array.from(this.files).forEach((file) => {
    if (isNewFile(file) && !addedFilesSet.has(file.name)) {
      addedFilesSet.add(file.name);
      selectedFiles.push(file);
    }
  });

  updateSelectedFilesList();
  spinner.style.display = "none"; // Hide the spinner after updating the file list
}

function handleDropArea(e) {
  e.preventDefault();
  this.classList.remove("drag");

  const spinner = document.getElementById("spinner"); // Get the spinner element
  spinner.style.display = "block"; // Show the spinner

  Array.from(e.dataTransfer.files).forEach((file) => {
    if (isNewFile(file) && !addedFilesSet.has(file.name)) {
      addedFilesSet.add(file.name);
      selectedFiles.push(file);
    }
  });

  updateSelectedFilesList();
  spinner.style.display = "none"; // Hide the spinner after updating the file list
}


function isNewFile(file) {
  return (
    (file.size <= 20 * 1024 * 1024 || file.type === "application/pdf") &&
    !selectedFiles.find((f) => f.name === file.name)
  );
}

function handleDragOverArea(e) {
  e.preventDefault();
  this.classList.add("drag");
}

function handleCheckboxChange() {
  localStorage.setItem("printFilename", this.checked);
}

function loadCheckboxState() {
  const savedState = localStorage.getItem("printFilename");
  document.getElementById("print-image-details").checked =
    savedState === null ? false : savedState === "true";
}

// Call this function on page load or before the relevant features are used
checkFileReaderSupport();
initEventListeners();

function checkFileReaderSupport() {
  if (window.FileReader) {
    // FileReader is supported.
    console.log("FileReader API is supported.");
  } else {
    // FileReader is not supported.
    console.error("FileReader API is not supported in your browser.");
    displayErrorMessage("Your browser does not support required features. Please update your browser or try a different one.");
  }
}

// Call this function on page load or before the relevant features are used
checkFileReaderSupport();

// Function to reset the page
function resetPage() {
  location.reload();
}

// Function to estimate text width
function estimateTextWidth(text, fontSize) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${fontSize}px Arial`;
  return context.measureText(text).width;
}

// Function to convert hex to RGB
function hexToRgb(hex) {
  hex = hex.replace(/^#/, ""); // Remove the hash at the start if it's there
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

// Function to display a success message
function displaySuccessMessage() {
  const convertButton = document.getElementById("convert-button");
  const resetButton = document.getElementById("reset-button");
  convertButton.style.display = "none";
  resetButton.style.display = "none";

  const successMessage = document.getElementById("success-message");
  successMessage.textContent = "PDF Merge Successful.";
  successMessage.style.display = "block";

  setTimeout(() => {
    successMessage.style.display = "none";
  }, 5000);
}

// Function to display an error message
function displayErrorMessage(message) {
  const errorMessageElement = document.getElementById("error-message");
  errorMessageElement.textContent = message;
  errorMessageElement.style.display = "block";

  setTimeout(() => {
    errorMessageElement.style.display = "none";
  }, 5000);
}

const selectedFiles = [];

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
  imageList.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const listItem = document.createElement("li");
    listItem.className = "flex-item";
    listItem.draggable = true;
    listItem.id = `file-${index}`;

    // Add event listeners for drag-and-drop
    listItem.addEventListener('dragstart', handleDragStart);
    listItem.addEventListener('dragover', handleDragOver);
    listItem.addEventListener('drop', handleDrop);

    // File icon
    const iconSpan = document.createElement("span");
    iconSpan.className = "material-icons-outlined";
    iconSpan.style.marginRight = "8px";
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (fileExtension === "jpg" || fileExtension === "jpeg" || fileExtension === "png") {
      iconSpan.textContent = "image";
    } else if (fileExtension === "pdf") {
      iconSpan.textContent = "description";
    } else {
      iconSpan.textContent = "description";
    }

    // Append elements
    listItem.appendChild(iconSpan);
    listItem.appendChild(document.createTextNode(file.name));
    imageList.appendChild(listItem);
    updateButtonVisibility();
  });
}

let draggedItemIndex = null;

function handleDragStart(e) {
  draggedItemIndex = parseInt(e.target.id.replace('file-', ''));
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
  e.preventDefault();
  const targetIndex = parseInt(e.target.id.replace('file-', ''));
  if (draggedItemIndex !== targetIndex) {
    const itemToMove = selectedFiles[draggedItemIndex];
    selectedFiles.splice(draggedItemIndex, 1); // Remove the item from its original position
    selectedFiles.splice(targetIndex, 0, itemToMove); // Insert it at the new position
    updateSelectedFilesList(); // Update the list display
  }
}


// Event listener for file input change
const fileInput = document.getElementById("file-input");
fileInput.addEventListener("change", () => {
  const newFiles = fileInput.files;
  for (let i = 0; i < newFiles.length; i++) {
    selectedFiles.push(newFiles[i]);
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

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("drag");
  const newFiles = e.dataTransfer.files;
  for (let i = 0; i < newFiles.length; i++) {
    selectedFiles.push(newFiles[i]);
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

          const MAX_SIZE = 1920;
          let width = img.width;
          let height = img.height;

          // Calculate the scaling factor
          const scalingFactor = Math.min(MAX_SIZE / width, MAX_SIZE / height);
          width = width * scalingFactor;
          height = height * scalingFactor;

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG at 90% quality
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          resolve(dataUrl); // Resolve the Promise with the data URL
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

// Function to get selected paper size with A4 as the default
function getSelectedPaperSize() {
  // const dropdown = document.getElementById("paper-size-dropdown");
  // const selectedSize = dropdown.value || "A4"; // Use A4 as the default if no size is selected
  selectedSize = "A4";
  const [widthMM, heightMM] = paperDimensions[selectedSize]; // Get dimensions in millimeters
  const widthPoints = widthMM * 2.83465; // Convert width to points
  const heightPoints = heightMM * 2.83465; // Convert height to points
  return [widthPoints, heightPoints];
}

async function convertToPDF() {
  const { PDFDocument, rgb } = PDFLib;

  if (selectedFiles.length < 1) {
    displayErrorMessage("Select at least one image to convert.");
    return;
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontResponse = await fetch("fonts/Roboto-Regular.ttf");
  const fontBytes = await fontResponse.arrayBuffer();
  const customFont = await pdfDoc.embedFont(fontBytes);

  const progressContainer = document.getElementById("progress-container");
  progressContainer.style.display = "block";
  const progressBar = document.getElementById("progress-bar");

  try {
    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop().toLowerCase();
      const fileBytes = await fetch(URL.createObjectURL(file)).then((res) =>
        res.arrayBuffer()
      );

      // Check if the file is an image (jpg, jpeg, or png)
      if (
        fileExtension === "jpg" ||
        fileExtension === "jpeg" ||
        fileExtension === "png"
      ) {
        // Resize and convert the image to JPEG, then embed it into the PDF
        const dataUrl = await resizeImageAndConvertToJPEG(file);
        const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
          c.charCodeAt(0)
        );

        // Create a PDF page with the selected paper size
        const [pageWidth, pageHeight] = getSelectedPaperSize();
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Define margins (adjust these values as needed)
        const leftMargin = 25;
        const topMargin = 40;
        const rightMargin = pageWidth - 25;
        const bottomMargin = pageHeight - 40;

        // Embed the JPEG image
        const image = await pdfDoc.embedJpg(imageBytes);

        // Calculate dimensions to maintain aspect ratio and fit within margins
        const imgDim = image.scaleToFit(
          rightMargin - leftMargin,
          bottomMargin - topMargin
        );

        // Calculate position to center the image within margins
        const xPosition =
          (rightMargin - leftMargin - imgDim.width) / 2 + leftMargin;
        const yPosition =
          (bottomMargin - topMargin - imgDim.height) / 2 + topMargin;

        // Draw the image with margins
        page.drawImage(image, {
          x: xPosition,
          y: yPosition,
          width: imgDim.width,
          height: imgDim.height,
        });

        // Set a preferred font size and maximum text width
        const fontSize = 12;
        const maxTextWidth = rightMargin - leftMargin;

        // Calculate the position to draw the text at the top of the page
        const textX = leftMargin;
        const textY = pageHeight - 35;

        // Draw the text
        drawWrappedText(
          page,
          fileName,
          textX,
          textY,
          maxTextWidth,
          fontSize,
          customFont,
          fontSize,
          "#000000"
        );
      } else if (fileExtension === "pdf") {
        // If the file is a PDF, copy its pages to the merged PDF
        const existingPdfDoc = await PDFLib.PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const copiedPages = await pdfDoc.copyPages(
          existingPdfDoc,
          existingPdfDoc.getPageIndices()
        );
        copiedPages.forEach((page) => pdfDoc.addPage(page));
      } else {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }    

      // Update the progress bar
      progressBar.style.width = `${((i + 1) / selectedFiles.length) * 100}%`;
    }

    // Save or download the PDF file
    const pdfBytes = await pdfDoc.save();

    if ("showSaveFilePicker" in window) {
      // Logic for browsers that support the File System Access API
      const handle = await window.showSaveFilePicker({
        suggestedName: "merged_document.pdf",
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
      downloadLink.download = "merged_document.pdf";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);
    }

    // Hide the spinner when processing is complete
    spinner.style.display = "none";

    // Display a success message
    displaySuccessMessage();
  } catch (error) {
    // Handle errors and display an error message
    spinner.style.display = "none";
    displayErrorMessage(`An error occurred: ${error.message}`);
    console.error(error);
  } finally {
    // Ensure files are reset regardless of the outcome
    resetFiles();
    spinner.style.display = "none";
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
  }
}

function degrees(degrees) {
  return (degrees * Math.PI) / 180;
}

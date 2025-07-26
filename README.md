# PDFMerge

PDFMerge is a web-based application for merging PDFs and images into a single document. It operates entirely client-side for maximum privacy, using modern JavaScript, HTML5, and CSS. Built on the robust [PDF-LIB.js](https://pdf-lib.js.org/) library, PDFMerge offers efficient PDF generation and manipulation. It also leverages the HTML5 FileReader API for image handling, and basic GPS and date EXIF details from photos thanks to [ExifReader](https://github.com/mattiasw/ExifReader).

## Key Features

### Core Functionality
- **PDF & Image Merging**: Seamlessly combine PDFs with JPG, PNG, WEBP, and GIF images
- **Drag & Drop Reordering**: Intuitively reorder files by dragging and dropping them within the interface
- **Individual File Management**: Delete specific files from selection with dedicated remove buttons
- **PDF Page Selection**: Specify custom page ranges for PDF files (e.g., 1-5, 7, 10-12)
- **Multiple Paper Sizes**: Support for A0, A1, A2, A3, and A4 output formats

### Advanced Features
- **Image Optimization**: Automatic resizing and optimization for various paper formats
- **Privacy-First**: No server uploads - all processing happens locally in your browser
- **EXIF Data Integration**: Optionally include image metadata, GPS coordinates, and timestamps
- **SHA-256 Hashing**: Add unique cryptographic hashes for image verification
- **Custom Watermarking**: Add text watermarks with adjustable color and opacity

### Try it out @ [pdfmerge.me](https://pdfmerge.me)

![PDFMerge Interface](screenshot.png)

### Browser Compatibility
- **Optimal**: Google Chrome (latest)
- **Good**: Firefox, Safari, Edge (latest versions)

## Known Limitations and Testing

- **In-Browser Processing Constraints:** PDFMerge runs directly in your browser, using client-side resources. This approach guarantees data privacy and eliminates the need for server-side data transfer. However, it does limit performance to what your device and browser can handle. This is particularly noticeable with large image files. Image files are restricted to a maximum size of 50MB due to potential performance issues during resizing with the HTML5 FileReader method. For larger images, it's advisable to use external tools to reduce their size and resolution before using them with the PDFMerge application. In testing [Google Chrome](https://www.google.com.au/chrome/) was able to handle larger files sizes and also larger lists of files at once better than Firefox. Firefox on occassion would hang and timeout on the same file lists which Chrome could process.

## Credits and Third-Party Licensing
- **[PDF-LIB.js](https://pdf-lib.js.org/)** by Andrew-Dillon | [MIT License](https://opensource.org/licenses/MIT)
- **[ExifReader](https://github.com/mattiasw/ExifReader)** by Mattias Wallander | [MPL-2.0 license](https://www.mozilla.org/en-US/MPL/2.0/)
- **Roboto Regular, Bold, and Black Fonts** by Christian Robertson | [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)


# PDFMerge

PDFMerge is a versatile web-based tool developed using JavaScript, HTML, and CSS, designed to merge PDFs and images into a single PDF document. Ideal for professionals, students, and anyone needing a reliable PDF merging solution, this tool processes files entirely on the client side, ensuring data privacy and eliminating the need for server uploads. Built on the robust [PDF-LIB.js](https://pdf-lib.js.org/) library, PDFMerge offers efficient PDF generation and manipulation. It also leverages the HTML5 FileReader API for image handling, with the option to include the original filename, SHA256 hash, and basic GPS and date EXIF details from photos at the top of each image page, thanks to [ExifReader](https://github.com/mattiasw/ExifReader).

### Try it out at [pdfmerge.me](https://pdfmerge.me)

## Features
- **User-Friendly Interface**: Merge PDFs and images with ease.
- **File Support**: Works with `.jpg`, `.png`, `.webp`, `.gif`, and `.pdf`.
- **Optimisation**: Resize and optimise images for reduced PDF file size.
- **Privacy Focused**: Local processing for enhanced data privacy and control.

## Getting Started
To use PDFMerge, simply visit [pdfmerge.me](https://pdfmerge.me) and upload your PDFs and images. The intuitive interface will guide you through the merging process. No installation or setup required!

## Screenshots
![PDFMerge Interface](screenshot.png)
*PDFMerge in action*

## Known Limitations

- **In-Browser Processing Constraints:** PDFMerge runs directly in your browser, using client-side resources. This approach guarantees data privacy and eliminates the need for server-side data transfer. However, it does limit performance to what your device and browser can handle. This is particularly noticeable with large image files. Image files are restricted to a maximum size of 20MB due to potential performance issues during resizing with the HTML5 FileReader method. For larger images, it's advisable to use external tools to reduce their size and resolution before using them with the PDFMerge application. In contrast, merging large PDFs, even those over 50MB, hasn't shown significant issues during tests.

## Credits and Third-Party Licensing
- **PDF-LIB.js** by Andrew-Dillon | [MIT License](https://opensource.org/licenses/MIT)
- **ExifReader** by Mattias Wallander | [MPL-2.0 license](https://www.mozilla.org/en-US/MPL/2.0/)
- **Roboto Regular Font** by Christian Robertson | [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)


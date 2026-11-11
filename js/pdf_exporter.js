/**
 * CamScanner Web - PDF Exporter & File Downloader
 * Generates multi-page high-resolution PDFs from canvas elements.
 * Features built-in standalone PDF generator fallback so it works 100% offline!
 */

class PDFExporter {
    /**
     * Export multiple canvas pages to a single PDF
     */
    static async exportPagesToPDF(canvasList, filename = 'camlab_Document.pdf', pageSize = 'a4') {
        if (!canvasList || canvasList.length === 0) return;

        // Try CDN jsPDF if available
        if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: pageSize
            });

            for (let i = 0; i < canvasList.length; i++) {
                const canvas = canvasList[i];
                const isLandscape = canvas.width > canvas.height;
                const orientation = isLandscape ? 'l' : 'p';

                if (i === 0) {
                    // Adjust first page orientation
                    pdf.deletePage(1);
                    pdf.addPage(pageSize, orientation);
                } else {
                    pdf.addPage(pageSize, orientation);
                }

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();

                // Compute aspect ratio fit
                const imgRatio = canvas.width / canvas.height;
                let drawW = pageW;
                let drawH = pageW / imgRatio;

                if (drawH > pageH) {
                    drawH = pageH;
                    drawW = pageH * imgRatio;
                }

                const posX = (pageW - drawW) / 2;
                const posY = (pageH - drawH) / 2;

                pdf.addImage(imgData, 'JPEG', posX, posY, drawW, drawH, undefined, 'FAST');
            }

            pdf.save(filename);
            return;
        }

        // Native Browser Print to PDF Fallback (works in any modern browser without any external library!)
        PDFExporter.printCanvasListAsPDF(canvasList, filename);
    }

    /**
     * Clean native print-to-PDF window that prompts user to "Save as PDF"
     */
    static printCanvasListAsPDF(canvasList, title = 'camlab Document', pageCssSize = 'auto') {
        const printWin = window.open('', '_blank');
        if (!printWin) {
            alert('অনুগ্রহ করে পপ-আপ অনুমোদন করুন যাতে PDF তৈরি হতে পারে।');
            return;
        }

        let imagesHtml = '';
        for (const canvas of canvasList) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            imagesHtml += `<div class="page"><img src="${dataUrl}" /></div>`;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <style>
                    @page { size: ${pageCssSize}; margin: 0; }
                    body { margin: 0; padding: 0; background: #fff; font-family: sans-serif; }
                    .page { page-break-after: always; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
                    img { max-width: 100%; max-height: 100%; object-fit: contain; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="position:fixed; top:10px; right:10px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:9999;" onclick="window.print()">
                    🖨️ প্রিন্ট করুন অথবা "Save as PDF" সিলেক্ট করুন
                </div>
                ${imagesHtml}
                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 400);
                    };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    }

    /**
     * Download canvas as high-resolution PNG / JPG
     */
    static downloadCanvasImage(canvas, filename = 'passport_photo.png', format = 'image/png', quality = 1.0) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL(format, quality);
        link.click();
    }
}

/**
 * CAMLAB Web - PDF Exporter & Multi-Format Converter (PDF, Word, Excel, PPT, Long Image)
 * Generates multi-page high-resolution PDFs, Word (.doc), Excel (.csv), PPT slides, and Long Stitched Images.
 * Works 100% offline!
 */

class PDFExporter {
    /**
     * Export multiple canvas pages to a single PDF with optional Page Numbers, Verified Seal & Security Note
     */
    static async exportPagesToPDF(canvasList, filename = 'camlab_Document.pdf', pageSize = 'a4', options = {}) {
        if (!canvasList || canvasList.length === 0) return;

        const addPageNumbers = options.addPageNumbers !== undefined ? options.addPageNumbers : true;
        const watermarkNote = Boolean(options.watermarkNote);
        const password = options.password ? String(options.password).trim() : '';

        // Decorate canvases with page numbers / security header if requested
        const decoratedCanvases = canvasList.map((srcCanvas, idx) => {
            if (!addPageNumbers && !watermarkNote && !password) return srcCanvas;
            const c = document.createElement('canvas');
            c.width = srcCanvas.width || 800;
            c.height = srcCanvas.height || 1100;
            const ctx = c.getContext('2d');
            ctx.drawImage(srcCanvas, 0, 0);

            const fontSize = Math.max(14, Math.round(c.width * 0.018));
            ctx.font = `bold ${fontSize}px sans-serif`;

            if (addPageNumbers) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
                ctx.textAlign = 'right';
                ctx.fillText(`Page ${idx + 1} / ${canvasList.length}`, c.width - 24, c.height - 20);
            }
            if (watermarkNote) {
                ctx.fillStyle = 'rgba(0, 168, 132, 0.85)';
                ctx.textAlign = 'left';
                ctx.fillText('✓ camlab Verified Authentic Scan', 24, c.height - 20);
            }
            if (password) {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
                ctx.textAlign = 'center';
                ctx.fillText(`🔒 PROTECTED DOCUMENT [PIN: ${'*'.repeat(Math.min(6, password.length))}]`, c.width / 2, 28);
            }
            return c;
        });

        // Try CDN jsPDF if available
        if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdfOpts = {
                orientation: 'p',
                unit: 'mm',
                format: pageSize
            };
            if (password) {
                pdfOpts.encryption = {
                    userPassword: password,
                    ownerPassword: password,
                    userPermissions: ['print', 'modify', 'copy']
                };
            }
            const pdf = new jsPDF(pdfOpts);

            for (let i = 0; i < decoratedCanvases.length; i++) {
                const canvas = decoratedCanvases[i];
                const isLandscape = canvas.width > canvas.height;
                const orientation = isLandscape ? 'l' : 'p';

                if (i === 0) {
                    pdf.deletePage(1);
                    pdf.addPage(pageSize, orientation);
                } else {
                    pdf.addPage(pageSize, orientation);
                }

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();

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

        // Native Browser Print to PDF Fallback
        PDFExporter.printCanvasListAsPDF(decoratedCanvases, filename);
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

    /**
     * Export Document (Pages + OCR Text) to Editable Microsoft Word (.doc)
     */
    static exportDocumentToWord(doc, extractedText = '') {
        if (!doc) return;
        const pagesHtml = (doc.pages || []).map((dataUrl, i) => `
            <div style="margin-bottom:24px; page-break-after:always;">
                <h3 style="color:#00a884; font-family:Arial,sans-serif;">Page ${i + 1} — ${doc.title}</h3>
                <p><img src="${dataUrl}" style="max-width:620px; height:auto; border:1px solid #cbd5e1;" /></p>
            </div>
        `).join('');

        const textBlock = extractedText
            ? `<div style="margin-top:16px; padding:16px; border:1px solid #00a884; background:#f8fafc;">
                 <h3 style="color:#0f172a;">Extracted OCR Text:</h3>
                 <pre style="white-space:pre-wrap; font-family:'Hind Siliguri', Arial, sans-serif; font-size:12pt;">${extractedText}</pre>
               </div>`
            : '';

        const wordContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office"
                  xmlns:w="urn:schemas-microsoft-com:office:word"
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"><title>${doc.title}</title></head>
            <body style="font-family:Arial, sans-serif;">
                <h1 style="color:#00a884;">${doc.title}</h1>
                <p style="color:#64748b;">Generated by camlab Studio • Date: ${doc.date || new Date().toLocaleDateString()}</p>
                ${textBlock}
                ${pagesHtml}
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', wordContent], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(doc.title || 'camlab_Doc').replace(/\s+/g, '_')}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export Document / OCR Text to Microsoft Excel (.csv with UTF-8 BOM)
     */
    static exportDocumentToExcel(doc, extractedText = '') {
        const rows = [
            ['SL', 'Document Title', 'Category', 'Page / Line', 'Content / Details', 'Date']
        ];

        if (extractedText && extractedText.trim().length > 0) {
            const lines = extractedText.split(/\r?\n/).filter(l => l.trim().length > 0);
            lines.forEach((line, idx) => {
                const cols = line.split(/\t|,|\s{2,}/).map(s => s.trim()).filter(Boolean);
                if (cols.length > 1) {
                    rows.push([String(idx + 1), doc?.title || 'camlab OCR', doc?.category || 'Table', `Row ${idx + 1}`, ...cols]);
                } else {
                    rows.push([String(idx + 1), doc?.title || 'camlab OCR', doc?.category || 'Text', `Line ${idx + 1}`, line.trim(), doc?.date || '']);
                }
            });
        } else if (doc && doc.pages) {
            doc.pages.forEach((_, idx) => {
                rows.push([
                    String(idx + 1),
                    doc.title || 'camlab Document',
                    doc.category || 'Document',
                    `Page ${idx + 1}`,
                    `Scanned High-Resolution Page ${idx + 1}`,
                    doc.date || new Date().toLocaleDateString()
                ]);
            });
        }

        const csvString = rows.map(r =>
            r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        ).join('\r\n');

        const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(doc?.title || 'camlab_Table').replace(/\s+/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export Document to PPT Presentation Slide Deck (.ppt.html)
     */
    static exportDocumentToPPT(doc) {
        if (!doc || !doc.pages || !doc.pages.length) return;
        const slidesHtml = doc.pages.map((p, idx) => `
            <section class="slide">
                <div class="slide-header">
                    <span>${doc.title}</span>
                    <span>Slide ${idx + 1} / ${doc.pages.length}</span>
                </div>
                <div class="slide-body">
                    <img src="${p}" alt="Slide ${idx + 1}">
                </div>
            </section>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${doc.title} - camlab Presentation</title>
<style>
  body { margin:0; background:#0f172a; color:#fff; font-family:sans-serif; }
  .slide { width:92vw; max-width:1100px; height:84vh; margin:3vh auto; background:#1e293b; border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.5); page-break-after:always; }
  .slide-header { padding:14px 24px; background:#00a884; color:#fff; font-weight:bold; display:flex; justify-content:space-between; }
  .slide-body { flex:1; display:flex; align-items:center; justify-content:center; padding:20px; background:#fff; }
  .slide-body img { max-width:100%; max-height:100%; object-fit:contain; }
</style>
</head>
<body>${slidesHtml}</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(doc.title || 'camlab_Slides').replace(/\s+/g, '_')}_Slides.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Stitch all pages of a document vertically into a single Long Image (.jpg)
     */
    static exportLongImage(doc, callback) {
        if (!doc || !doc.pages || !doc.pages.length) return;
        const loadedImages = [];
        let count = 0;

        doc.pages.forEach((src, idx) => {
            const img = new Image();
            img.onload = () => {
                loadedImages[idx] = img;
                count++;
                if (count === doc.pages.length) {
                    const targetW = 900;
                    const gap = 24;
                    let totalH = gap;
                    const scaledHeights = loadedImages.map(im => {
                        const h = Math.round((im.height / Math.max(1, im.width)) * targetW);
                        totalH += h + gap;
                        return h;
                    });

                    const longCanvas = document.createElement('canvas');
                    longCanvas.width = targetW + gap * 2;
                    longCanvas.height = totalH;
                    const ctx = longCanvas.getContext('2d');
                    ctx.fillStyle = '#f1f5f9';
                    ctx.fillRect(0, 0, longCanvas.width, longCanvas.height);

                    let y = gap;
                    loadedImages.forEach((im, i) => {
                        const sh = scaledHeights[i];
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(gap, y, targetW, sh);
                        ctx.drawImage(im, gap, y, targetW, sh);
                        y += sh + gap;
                    });

                    PDFExporter.downloadCanvasImage(
                        longCanvas,
                        `${(doc.title || 'camlab').replace(/\s+/g, '_')}_LongImage.jpg`,
                        'image/jpeg',
                        0.92
                    );
                    if (callback) callback();
                }
            };
            img.src = src;
        });
    }
}

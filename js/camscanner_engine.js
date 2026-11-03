/**
 * CamScanner Web Studio Pro - Core Application Engine
 * Implements full authentic CamScanner functionality:
 * - Document Library with LocalStorage persistence
 * - 8-Point Intelligent Crop with Real-time Loupe / Magnifier
 * - Camera Viewfinder with Mode Carousel (Docs, ID Photo, ID Card, Book, To Word, QR Code)
 * - Signature Filters (Magic Color, B&W, B&W 2, Grayscale, Lighten, Original)
 * - Tools Hub with PDF Tools, Compression, QR Scanner, Book Split, Watermark, Signature
 */

class CamScannerEngine {
    constructor() {
        this.documents = [];
        this.currentDocId = null;
        this.currentImage = null; // Image/Canvas currently being processed
        this.activeCameraMode = 'docs'; // 'docs', 'id_photo', 'id_card', 'book', 'to_word', 'qr'
        this.batchQueue = []; // For batch scanning mode
        this.isBatchMode = false;

        // 8-Point Crop handles
        this.cropPoints = [
            { x: 50, y: 50, id: 'tl' },
            { x: 250, y: 50, id: 't' },
            { x: 450, y: 50, id: 'tr' },
            { x: 450, y: 300, id: 'r' },
            { x: 450, y: 550, id: 'br' },
            { x: 250, y: 550, id: 'b' },
            { x: 50, y: 550, id: 'bl' },
            { x: 50, y: 300, id: 'l' }
        ];
        this.activeDragPoint = null;
        this.cropRotation = 0;

        // Active Enhancement State
        this.currentFilter = 'magic';
        this.brightness = 0;
        this.contrast = 0;
        this.processedCanvas = null;

        // Signature & Watermark on Doc
        this.docWatermark = null;
        this.docSignature = null;

        this.initStorage();
    }

    initStorage() {
        try {
            const saved = localStorage.getItem('cs_documents');
            if (saved) {
                this.documents = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not read documents from localStorage:', e);
            this.documents = [];
        }

        // Add a sample welcoming document if library is empty
        if (this.documents.length === 0) {
            this.createSampleDocument();
        }
    }

    saveToStorage() {
        try {
            // Keep at most 20 recent documents in storage to prevent quota overflow
            const trimmed = this.documents.slice(0, 20);
            localStorage.setItem('cs_documents', JSON.stringify(trimmed));
        } catch (e) {
            console.warn('Storage limit reached:', e);
        }
    }

    createSampleDocument() {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 600;
        sampleCanvas.height = 800;
        const ctx = sampleCanvas.getContext('2d');

        // Draw sample paper
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 600, 800);

        // Header banner
        ctx.fillStyle = '#00a884';
        ctx.fillRect(0, 0, 600, 90);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('CamScanner Studio Welcome Note', 30, 55);

        ctx.fillStyle = '#1e293b';
        ctx.font = '18px sans-serif';
        ctx.fillText('Welcome to CamScanner Web Studio Pro!', 40, 150);
        ctx.fillText('স্বাগতম! ক্যামস্ক্যানার ওয়েব স্টুডিও প্রো-তে।', 40, 185);

        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText('• 100% Authentic CamScanner Mobile & Web Experience', 40, 240);
        ctx.fillText('• Signature Magic Color, B&W, and Grayscale filters', 40, 275);
        ctx.fillText('• Intelligent 8-Point Quad Crop with Live Zoom Magnifier', 40, 310);
        ctx.fillText('• Passport Photo Studio with 10+ Country presets & Suit Changer', 40, 345);
        ctx.fillText('• ID Card 2-Sided Scanner (A4 1:1 Scale)', 40, 380);
        ctx.fillText('• Digital Signatures, Security Watermarks & OCR Text', 40, 415);

        // Official CamScanner Stamp in bottom right
        ctx.strokeStyle = '#00a884';
        ctx.lineWidth = 3;
        ctx.strokeRect(380, 650, 180, 80);
        ctx.fillStyle = '#00a884';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VERIFIED ORIGINAL', 470, 685);
        ctx.font = '12px sans-serif';
        ctx.fillText('CamScanner Studio Pro', 470, 710);
        ctx.textAlign = 'left';

        const dataUrl = sampleCanvas.toDataURL('image/jpeg', 0.85);

        this.documents.push({
            id: 'doc_' + Date.now(),
            title: 'Welcome to CamScanner Pro',
            category: 'All Docs',
            date: new Date().toLocaleDateString('bn-BD', { month: 'short', day: 'numeric', year: 'numeric' }),
            pageCount: 1,
            thumbnail: dataUrl,
            pages: [dataUrl]
        });
        this.saveToStorage();
    }

    /**
     * Start new document from an image src with Automatic Edge & Corner Detection
     */
    startNewScan(imageSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.currentImage = img;
            this.cropRotation = 0;
            // Use Automatic Document Edge Detection to find paper boundary
            this.autoDetectCrop();
            if (callback) callback();
        };
        img.src = imageSrc;
    }

    /**
     * Automatic Document Corner & Boundary Detection
     */
    autoDetectCrop() {
        if (!this.currentImage) return;
        try {
            this.cropPoints = ImageProcessor.detectDocumentCorners(this.currentImage);
        } catch (e) {
            console.warn('Auto corner detect fallback:', e);
            this.setupInitial8CropPoints(this.currentImage.width, this.currentImage.height);
        }
    }

    /**
     * Fully Automatic Pipeline: Detects Corners, Crops, and Applies Auto Brightness & Magic Filter
     * Used for batch/multi-file uploads and auto-capture!
     */
    autoProcessAndCropImage(imageSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onerror = () => {
            console.error('Failed to load image for auto process');
            if (callback) callback(null);
        };
        img.onload = () => {
            try {
                let corners8;
                try {
                    corners8 = ImageProcessor.detectDocumentCorners(img);
                } catch (e) {
                    console.warn('Auto corner detect failed:', e);
                }
                if (!corners8 || corners8.length < 8) {
                    const padX = img.width * 0.04;
                    const padY = img.height * 0.04;
                    corners8 = [
                        { x: padX, y: padY, id: 'tl' },
                        { x: img.width / 2, y: padY, id: 't' },
                        { x: img.width - padX, y: padY, id: 'tr' },
                        { x: img.width - padX, y: img.height / 2, id: 'r' },
                        { x: img.width - padX, y: img.height - padY, id: 'br' },
                        { x: img.width / 2, y: img.height - padY, id: 'b' },
                        { x: padX, y: img.height - padY, id: 'bl' },
                        { x: padX, y: img.height / 2, id: 'l' }
                    ];
                }
                const corners = [corners8[0], corners8[2], corners8[4], corners8[6]];

                const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
                const btmW = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
                const lftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
                const rgtH = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

                const targetW = Math.max(100, Math.round(Math.max(topW, btmW)));
                const targetH = Math.max(100, Math.round(Math.max(lftH, rgtH)));

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = img.width;
                srcCanvas.height = img.height;
                const sCtx = srcCanvas.getContext('2d');
                sCtx.drawImage(img, 0, 0);

                // Perspective warp & rectify
                let warped = ImageProcessor.perspectiveWarp(srcCanvas, corners, targetW, targetH);
                if (!warped) warped = srcCanvas;

                // Auto Brightness & Magic Color
                const wCtx = warped.getContext('2d');
                let imgData = wCtx.getImageData(0, 0, warped.width, warped.height);
                ImageProcessor.autoBrightnessNormalize(imgData);
                ImageProcessor.applyFilter(imgData, 'magic');
                wCtx.putImageData(imgData, 0, 0);

                if (callback) callback(warped);
            } catch (err) {
                console.error('Error auto-processing image:', err);
                const fallbackCanvas = document.createElement('canvas');
                fallbackCanvas.width = img.width;
                fallbackCanvas.height = img.height;
                fallbackCanvas.getContext('2d').drawImage(img, 0, 0);
                if (callback) callback(fallbackCanvas);
            }
        };
        img.src = imageSrc;
    }

    /**
     * Initialize 8 crop control points around image with 5% inset
     */
    setupInitial8CropPoints(w, h) {
        const padX = w * 0.05;
        const padY = h * 0.05;
        this.cropPoints = [
            { x: padX, y: padY, id: 'tl' },
            { x: w / 2, y: padY, id: 't' },
            { x: w - padX, y: padY, id: 'tr' },
            { x: w - padX, y: h / 2, id: 'r' },
            { x: w - padX, y: h - padY, id: 'br' },
            { x: w / 2, y: h - padY, id: 'b' },
            { x: padX, y: h - padY, id: 'bl' },
            { x: padX, y: h / 2, id: 'l' }
        ];
    }

    /**
     * Set crop to full image bounds
     */
    fullPageCrop() {
        if (!this.currentImage) return;
        const w = this.currentImage.width;
        const h = this.currentImage.height;

        this.cropPoints = [
            { x: 0, y: 0, id: 'tl' },
            { x: w / 2, y: 0, id: 't' },
            { x: w, y: 0, id: 'tr' },
            { x: w, y: h / 2, id: 'r' },
            { x: w, y: h, id: 'br' },
            { x: w / 2, y: h, id: 'b' },
            { x: 0, y: h, id: 'bl' },
            { x: 0, y: h / 2, id: 'l' }
        ];
    }

    /**
     * Rotate current crop image by 90 degrees
     */
    rotateCropImage() {
        if (!this.currentImage) return;

        const src = this.currentImage;
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = src.height;
        rotCanvas.height = src.width;

        const ctx = rotCanvas.getContext('2d');
        ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(src, -src.width / 2, -src.height / 2);

        const newImg = new Image();
        newImg.onload = () => {
            this.currentImage = newImg;
            this.setupInitial8CropPoints(newImg.width, newImg.height);
        };
        newImg.src = rotCanvas.toDataURL('image/jpeg', 0.95);
    }

    /**
     * Complete crop and rectify document using 4 corners [TL, TR, BR, BL]
     */
    executeCrop() {
        if (!this.currentImage) return null;

        const c = this.cropPoints;
        const corners = [
            c[0], // TL
            c[2], // TR
            c[4], // BR
            c[6]  // BL
        ];

        // Average dimensions of the quad
        const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
        const btmW = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
        const lftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
        const rgtH = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

        const targetW = Math.round(Math.max(topW, btmW));
        const targetH = Math.round(Math.max(lftH, rgtH));

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = this.currentImage.width;
        srcCanvas.height = this.currentImage.height;
        const sCtx = srcCanvas.getContext('2d');
        sCtx.drawImage(this.currentImage, 0, 0);

        // Perspective warp homography
        const warped = ImageProcessor.perspectiveWarp(srcCanvas, corners, targetW, targetH);
        this.processedCanvas = warped;

        // Apply default Magic Color filter
        this.applyFilter('magic');
        return this.processedCanvas;
    }

    /**
     * Apply signature CamScanner filters (magic, bw, bw2, grayscale, lighten, original)
     */
    applyFilter(filterName) {
        if (!this.processedCanvas) return;
        this.currentFilter = filterName;

        const ctx = this.processedCanvas.getContext('2d');
        const w = this.processedCanvas.width;
        const h = this.processedCanvas.height;

        let imgData = ctx.getImageData(0, 0, w, h);
        ImageProcessor.applyFilter(imgData, filterName, {
            brightness: this.brightness,
            contrast: this.contrast
        });
        ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Save active processed page into document library (or append to existing active doc)
     */
    saveActivePageToLibrary(title = null) {
        if (!this.processedCanvas) return;

        const dataUrl = this.processedCanvas.toDataURL('image/jpeg', 0.92);

        // If currently editing an existing document, append the page!
        if (this.currentDocId) {
            const existing = this.documents.find(d => d.id === this.currentDocId);
            if (existing) {
                existing.pages.push(dataUrl);
                existing.pageCount = existing.pages.length;
                this.saveToStorage();
                return existing;
            }
        }

        const defaultTitle = title || `CamScanner ${new Date().toISOString().slice(5, 10).replace('-', '')}_${Math.floor(Math.random()*1000)}`;

        const newDoc = {
            id: 'doc_' + Date.now(),
            title: defaultTitle,
            category: this.activeCameraMode === 'id_photo' ? 'ID Photo' : (this.activeCameraMode === 'id_card' ? 'ID Card' : 'All Docs'),
            date: new Date().toLocaleDateString('bn-BD', { month: 'short', day: 'numeric', year: 'numeric' }),
            pageCount: 1,
            thumbnail: dataUrl,
            pages: [dataUrl]
        };

        this.documents.unshift(newDoc);
        this.currentDocId = newDoc.id;
        this.saveToStorage();
        return newDoc;
    }

    /**
     * Add an additional page to an existing document
     */
    addPageToCurrentDocument(dataUrl) {
        if (!this.currentDocId) return;
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (doc) {
            doc.pages.push(dataUrl);
            doc.pageCount = doc.pages.length;
            this.saveToStorage();
            return doc;
        }
    }

    /**
     * Remove a page from current document
     */
    removePageFromCurrentDocument(pageIndex) {
        if (!this.currentDocId) return;
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (doc && pageIndex >= 0 && pageIndex < doc.pages.length) {
            doc.pages.splice(pageIndex, 1);
            doc.pageCount = doc.pages.length;
            if (doc.pages.length > 0) {
                doc.thumbnail = doc.pages[0];
            }
            this.saveToStorage();
            return doc;
        }
    }

    /**
     * Delete document by ID
     */
    deleteDocument(id) {
        this.documents = this.documents.filter(d => d.id !== id);
        this.saveToStorage();
    }

    /**
     * Rename document
     */
    renameDocument(id, newTitle) {
        const found = this.documents.find(d => d.id === id);
        if (found) {
            found.title = newTitle;
            this.saveToStorage();
        }
    }

    /**
     * Book Scanner: Split 2 pages (Left & Right) from an open book scan
     */
    splitBookPages(imageSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            const halfW = Math.round(w / 2);

            // Left Page
            const leftCanvas = document.createElement('canvas');
            leftCanvas.width = halfW;
            leftCanvas.height = h;
            const lCtx = leftCanvas.getContext('2d');
            lCtx.drawImage(img, 0, 0, halfW, h, 0, 0, halfW, h);

            // Right Page
            const rightCanvas = document.createElement('canvas');
            rightCanvas.width = halfW;
            rightCanvas.height = h;
            const rCtx = rightCanvas.getContext('2d');
            rCtx.drawImage(img, halfW, 0, halfW, h, 0, 0, halfW, h);

            // Apply Magic Color to both
            const lData = lCtx.getImageData(0, 0, halfW, h);
            ImageProcessor.applyFilter(lData, 'magic');
            lCtx.putImageData(lData, 0, 0);

            const rData = rCtx.getImageData(0, 0, halfW, h);
            ImageProcessor.applyFilter(rData, 'magic');
            rCtx.putImageData(rData, 0, 0);

            if (callback) callback(leftCanvas, rightCanvas);
        };
        img.src = imageSrc;
    }

    /**
     * PDF Compressor: Compresses canvas quality to reduce PDF file size
     */
    compressDocument(docId, qualityLevel = 'medium') { // 'high', 'medium', 'low'
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        let quality = 0.8;
        if (qualityLevel === 'high') quality = 0.55;
        if (qualityLevel === 'low') quality = 0.9;

        // Re-encode pages
        doc.pages = doc.pages.map(dataUrl => {
            const img = new Image();
            img.src = dataUrl;
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            return c.toDataURL('image/jpeg', quality);
        });

        doc.thumbnail = doc.pages[0];
        this.saveToStorage();
    }
}


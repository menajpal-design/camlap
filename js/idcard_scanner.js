/**
 * CAMLAB Web - Authentic ID Card 2-Sided Scanner
 * Replicates CAMLAB's exact ID Card scanning workflow:
 * - Card Templates: National ID / NID, Driver's License, Passport
 * - Step 1: Scan Front Side with interactive card guide
 * - Step 2: Scan Back Side with flip guide
 * - Step 3: Combine onto A4 Paper with 1:1 physical millimeter scale
 * - Anti-theft security watermark ("FOR VERIFICATION ONLY")
 * - Layout options: Stacked Center, Side-by-Side, Front Only
 * - Magic Color enhancement for crisp text
 */

class IDCardScanner {
    constructor() {
        this.frontCanvas = null;
        this.backCanvas = null;
        this.currentStep = 1; // 1: Front, 2: Back, 3: A4 Preview
        this.selectedTemplate = 'nid'; // 'nid', 'driver_license', 'passport'

        this.templates = {
            nid: {
                id: 'nid',
                name_bn: 'জাতীয় পরিচয়পত্র / NID কার্ড',
                name_en: 'National ID / Smart Card',
                widthMm: 85.6,
                heightMm: 53.98,
                needsBack: true,
                icon: 'assets/ic_idcard_idcard_en_60px.webp'
            },
            driver_license: {
                id: 'driver_license',
                name_bn: 'ড্রাইভিং লাইসেন্স (Driver License)',
                name_en: 'Driver\'s License',
                widthMm: 85.6,
                heightMm: 53.98,
                needsBack: true,
                icon: 'assets/ic_idcard_drive_license_60px.webp'
            },
            passport: {
                id: 'passport',
                name_bn: 'পাসপোর্ট বায়োপেজ (Passport Bio)',
                name_en: 'Passport Bio Page',
                widthMm: 125,
                heightMm: 88,
                needsBack: false,
                icon: 'assets/ic_idcard_passport_60px.webp'
            }
        };

        this.layout = 'vertical'; // 'vertical' (stacked), 'horizontal' (side-by-side), 'front_only'
        this.antiTheftWatermark = 'FOR VERIFICATION ONLY';
        this.watermarkEnabled = true;
        this.filterMode = 'magic'; // 'magic', 'bw', 'original'
        this.dpi = 300;
    }

    setTemplate(templateId) {
        if (this.templates[templateId]) {
            this.selectedTemplate = templateId;
        }
    }

    getCardDimensions() {
        return this.templates[this.selectedTemplate] || this.templates.nid;
    }

    /**
     * Process and crop front side image
     */
    setFrontImage(imgSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.frontCanvas = this.processCardImage(img);
            this.currentStep = this.getCardDimensions().needsBack ? 2 : 3;
            if (callback) callback(this.frontCanvas);
        };
        img.src = imgSrc;
    }

    /**
     * Process and crop back side image
     */
    setBackImage(imgSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.backCanvas = this.processCardImage(img);
            this.currentStep = 3;
            if (callback) callback(this.backCanvas);
        };
        img.src = imgSrc;
    }

    /**
     * Crop image to exact aspect ratio and apply CAMLAB enhancement
     */
    processCardImage(img) {
        const t = this.getCardDimensions();
        const targetRatio = t.widthMm / t.heightMm;
        const imgRatio = img.width / img.height;

        const targetW = Math.round((t.widthMm / 25.4) * this.dpi);
        const targetH = Math.round((t.heightMm / 25.4) * this.dpi);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);

        // Aspect fit crop
        let sw = img.width;
        let sh = img.height;
        let sx = 0, sy = 0;

        if (imgRatio > targetRatio) {
            sw = img.height * targetRatio;
            sx = (img.width - sw) / 2;
        } else {
            sh = img.width / targetRatio;
            sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

        // Apply CAMLAB filter
        if (this.filterMode !== 'original') {
            const imgData = ctx.getImageData(0, 0, targetW, targetH);
            ImageProcessor.applyFilter(imgData, this.filterMode);
            ctx.putImageData(imgData, 0, 0);
        }

        return canvas;
    }

    /**
     * Generate Authentic A4 Sheet with 1:1 Scale Print
     */
    generateA4Sheet() {
        const a4WidthMm = 210;
        const a4HeightMm = 297;
        const a4W = Math.round((a4WidthMm / 25.4) * this.dpi);
        const a4H = Math.round((a4HeightMm / 25.4) * this.dpi);

        const canvas = document.createElement('canvas');
        canvas.width = a4W;
        canvas.height = a4H;
        const ctx = canvas.getContext('2d');

        // Pure white photographic sheet
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, a4W, a4H);

        const cardDim = this.getCardDimensions();
        const cardW = Math.round((cardDim.widthMm / 25.4) * this.dpi);
        const cardH = Math.round((cardDim.heightMm / 25.4) * this.dpi);

        // Page Header
        ctx.fillStyle = '#1e293b';
        ctx.font = `bold ${Math.round(this.dpi * 0.08)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('IDENTIFICATION DOCUMENT COPY / পরিচয়পত্র অনুলিপি', a4W / 2, Math.round(this.dpi * 0.45));

        const labelFont = `${Math.round(this.dpi * 0.042)}px sans-serif`;

        if (this.layout === 'vertical') {
            // Stacked vertically in center (CAMLAB default for ID Cards)
            const startX = (a4W - cardW) / 2;
            const frontY = Math.round(a4H * 0.22);
            const backY = Math.round(a4H * 0.54);

            // Front Label
            ctx.fillStyle = '#64748b';
            ctx.font = labelFont;
            ctx.fillText('Front Side (সামনের পাতা)', a4W / 2, frontY - 14);

            if (this.frontCanvas) {
                ctx.drawImage(this.frontCanvas, startX, frontY, cardW, cardH);
            } else {
                this.drawCardPlaceholder(ctx, startX, frontY, cardW, cardH, 'Front Side Missing');
            }
            this.drawCardBorder(ctx, startX, frontY, cardW, cardH);

            // Back Side
            if (cardDim.needsBack) {
                ctx.fillStyle = '#64748b';
                ctx.fillText('Back Side (পেছনের পাতা)', a4W / 2, backY - 14);

                if (this.backCanvas) {
                    ctx.drawImage(this.backCanvas, startX, backY, cardW, cardH);
                } else {
                    this.drawCardPlaceholder(ctx, startX, backY, cardW, cardH, 'Back Side Missing');
                }
                this.drawCardBorder(ctx, startX, backY, cardW, cardH);
            }

        } else if (this.layout === 'horizontal') {
            // Side-by-side
            const gap = Math.round(this.dpi * 0.2);
            const totalW = cardW * 2 + gap;
            const startX = (a4W - totalW) / 2;
            const cardY = (a4H - cardH) / 2;

            // Front
            ctx.fillStyle = '#64748b';
            ctx.font = labelFont;
            ctx.fillText('Front Side (সামনের পাতা)', startX + cardW / 2, cardY - 14);
            if (this.frontCanvas) {
                ctx.drawImage(this.frontCanvas, startX, cardY, cardW, cardH);
            } else {
                this.drawCardPlaceholder(ctx, startX, cardY, cardW, cardH, 'Front Side Missing');
            }
            this.drawCardBorder(ctx, startX, cardY, cardW, cardH);

            // Back
            const backX = startX + cardW + gap;
            ctx.fillText('Back Side (পেছনের পাতা)', backX + cardW / 2, cardY - 14);
            if (this.backCanvas) {
                ctx.drawImage(this.backCanvas, backX, cardY, cardW, cardH);
            } else {
                this.drawCardPlaceholder(ctx, backX, cardY, cardW, cardH, 'Back Side Missing');
            }
            this.drawCardBorder(ctx, backX, cardY, cardW, cardH);
        } else {
            // Front only
            const startX = (a4W - cardW) / 2;
            const startY = (a4H - cardH) / 2;
            if (this.frontCanvas) {
                ctx.drawImage(this.frontCanvas, startX, startY, cardW, cardH);
            }
            this.drawCardBorder(ctx, startX, startY, cardW, cardH);
        }

        // Apply CAMLAB Anti-theft watermark if enabled
        if (this.watermarkEnabled && this.antiTheftWatermark && this.antiTheftWatermark.trim() !== '') {
            this.applyAntiTheftWatermark(ctx, a4W, a4H);
        }

        // Footer note with scale guarantee
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(this.dpi * 0.035)}px sans-serif`;
        ctx.fillText('CAMLAB ID Card Studio • 100% 1:1 Scale Certified A4 Print • All Rights Reserved', a4W / 2, a4H - Math.round(this.dpi * 0.2));

        return canvas;
    }

    drawCardBorder(ctx, x, y, w, h) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
    }

    drawCardPlaceholder(ctx, x, y, w, h, text) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${Math.round(this.dpi * 0.048)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w / 2, y + h / 2);
    }

    /**
     * Draw authentic anti-counterfeit watermark across the cards
     */
    applyAntiTheftWatermark(ctx, a4W, a4H) {
        ctx.save();
        ctx.fillStyle = '#dc2626'; // Security Red
        ctx.globalAlpha = 0.22;
        const fontSize = Math.round(this.dpi * 0.065);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';

        ctx.translate(a4W / 2, a4H / 2);
        ctx.rotate((-28 * Math.PI) / 180);

        const stepY = fontSize * 3.8;
        for (let y = -a4H; y < a4H; y += stepY) {
            ctx.fillText(this.antiTheftWatermark, 0, y);
        }

        ctx.restore();
    }
}

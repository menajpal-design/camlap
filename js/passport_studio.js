/**
 * CamScanner Web - Passport & ID Photo Studio Pro
 * Complete solution for biometric passport photo creation, background editing,
 * formal suit overlay, and multi-photo print sheet generation.
 */

const PASSPORT_PRESETS = [
    {
        id: 'bd_passport',
        country: '🇧🇩 Bangladesh (পাসপোর্ট)',
        name_bn: 'বাংলাদেশ পাসপোর্ট (৪০ × ৫০ মিমি)',
        name_en: 'Bangladesh Passport (40 x 50 mm)',
        widthMm: 40,
        heightMm: 50,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'bd_epassport',
        country: '🇧🇩 Bangladesh (ই-পাসপোর্ট / MRP)',
        name_bn: 'বাংলাদেশ ই-পাসপোর্ট / ভিসা (৩৫ × ৪৫ মিমি)',
        name_en: 'Bangladesh e-Passport / MRP (35 x 45 mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'bd_nid',
        country: '🇧🇩 Bangladesh (স্মার্ট কার্ড / NID)',
        name_bn: 'জাতীয় পরিচয়পত্র / NID (২৫ × ৩০ মিমি)',
        name_en: 'Bangladesh NID / Smart Card (25 x 30 mm)',
        widthMm: 25,
        heightMm: 30,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'us_visa',
        country: '🇺🇸 United States (USA)',
        name_bn: 'আমেরিকা ভিসা / পাসপোর্ট (২ × ২ ইঞ্চি / ৫১ × ৫১ মিমি)',
        name_en: 'US Visa / Passport (2 x 2 inch / 51 x 51 mm)',
        widthMm: 50.8,
        heightMm: 50.8,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'schengen',
        country: '🇪🇺 Schengen / UK / Europe',
        name_bn: 'ইউরোপ / শেঞ্জেন / যুক্তরাজ্য (৩৫ × ৪৫ মিমি)',
        name_en: 'Schengen / UK / Europe (35 x 45 mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#F5F5F0',
        dpi: 300
    },
    {
        id: 'india_passport',
        country: '🇮🇳 India (পাসপোর্ট / ভিসা)',
        name_bn: 'ভারত পাসপোর্ট (৩৫ × ৪৫ মিমি)',
        name_en: 'India Passport (35 x 45 mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'saudi_visa',
        country: '🇸🇦 Saudi Arabia (হজ ও উমরাহ)',
        name_bn: 'সৌদি আরব হজ / উমরাহ ভিসা (৪০ × ৬০ মিমি)',
        name_en: 'Saudi Arabia Hajj/Umrah (40 x 60 mm)',
        widthMm: 40,
        heightMm: 60,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'canada',
        country: '🇨🇦 Canada',
        name_bn: 'কানাডা পাসপোর্ট (৫০ × ৭০ মিমি)',
        name_en: 'Canada Passport (50 x 70 mm)',
        widthMm: 50,
        heightMm: 70,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'malaysia',
        country: '🇲🇾 Malaysia',
        name_bn: 'মালয়েশিয়া ভিসা (৩৫ × ৫০ মিমি - নীল ব্যাকগ্রাউন্ড)',
        name_en: 'Malaysia Visa (35 x 50 mm - Blue Background)',
        widthMm: 35,
        heightMm: 50,
        bgColor: '#2563EB',
        dpi: 300
    },
    {
        id: 'custom',
        country: '⚙️ Custom Size (কাস্টম সাইজ)',
        name_bn: 'নিজের পছন্দমতো সাইজ (কাস্টম মাপ)',
        name_en: 'Custom Dimensions (User Defined)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#FFFFFF',
        dpi: 300
    }
];

class PassportStudio {
    constructor() {
        this.currentPreset = PASSPORT_PRESETS[0];
        this.rawImage = null; // Original loaded Image/Canvas
        this.cropCanvas = document.createElement('canvas');
        this.processedCanvas = document.createElement('canvas');

        // Transform state for interactive pan/zoom/rotate
        this.state = {
            scale: 1,
            rotation: 0,
            offsetX: 0,
            offsetY: 0,
            bgColor: '#FFFFFF',
            brightness: 0,
            contrast: 0,
            saturation: 0,
            skinSmoothing: 0,
            selectedSuit: 'none',
            suitState: {
                x: 0,
                y: 120,
                scale: 1,
                opacity: 1
            },
            showBiometricGuide: true
        };

        // Print Sheet State
        this.printState = {
            paperSize: '4x6', // '4x6', 'A4', '5x7', 'single'
            photoCount: 6,
            showCutLines: true,
            hasBorder: true,
            gapMm: 4
        };

        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.activeDragTarget = 'photo'; // 'photo' or 'suit'
    }

    /**
     * Load an image file or dataURL into the studio
     */
    loadImage(src, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.rawImage = img;
            this.resetTransform();
            this.renderCroppedPhoto();
            if (callback) callback();
        };
        img.src = src;
    }

    /**
     * Set active passport dimension preset
     */
    setPreset(presetId, customW, customH) {
        if (presetId === 'custom') {
            this.currentPreset = {
                id: 'custom',
                country: '⚙️ Custom',
                name_bn: `কাস্টম (${customW} × ${customH} মিমি)`,
                name_en: `Custom (${customW} x ${customH} mm)`,
                widthMm: customW || 35,
                heightMm: customH || 45,
                bgColor: this.state.bgColor,
                dpi: 300
            };
        } else {
            const found = PASSPORT_PRESETS.find(p => p.id === presetId);
            if (found) {
                this.currentPreset = found;
                this.state.bgColor = found.bgColor;
            }
        }
        this.resetTransform();
        this.renderCroppedPhoto();
    }

    /**
     * Reset transform to center image inside target passport ratio
     */
    resetTransform() {
        if (!this.rawImage) return;

        const targetW = this.getPixelWidth();
        const targetH = this.getPixelHeight();

        // Fit image nicely into frame
        const scaleW = targetW / this.rawImage.width;
        const scaleH = targetH / this.rawImage.height;
        this.state.scale = Math.max(scaleW, scaleH) * 1.1; // slight zoom for portrait fill
        this.state.offsetX = (targetW - this.rawImage.width * this.state.scale) / 2;
        this.state.offsetY = (targetH - this.rawImage.height * this.state.scale) / 2;
        this.state.rotation = 0;

        // Reset suit position to bottom center
        this.state.suitState.x = targetW / 2;
        this.state.suitState.y = targetH * 0.72;
        this.state.suitState.scale = (targetW / 400);
    }

    getPixelWidth() {
        return Math.round((this.currentPreset.widthMm / 25.4) * this.currentPreset.dpi);
    }

    getPixelHeight() {
        return Math.round((this.currentPreset.heightMm / 25.4) * this.currentPreset.dpi);
    }

    /**
     * Render the cropped photo at target resolution (300 DPI)
     */
    renderCroppedPhoto() {
        if (!this.rawImage) return null;

        const w = this.getPixelWidth();
        const h = this.getPixelHeight();

        this.cropCanvas.width = w;
        this.cropCanvas.height = h;
        const ctx = this.cropCanvas.getContext('2d');

        // 1. Draw solid passport background
        ctx.fillStyle = this.state.bgColor;
        ctx.fillRect(0, 0, w, h);

        // 2. Draw user photo with transforms
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((this.state.rotation * Math.PI) / 180);
        ctx.translate(-w / 2, -h / 2);

        ctx.drawImage(
            this.rawImage,
            this.state.offsetX,
            this.state.offsetY,
            this.rawImage.width * this.state.scale,
            this.rawImage.height * this.state.scale
        );
        ctx.restore();

        // 3. Apply color, brightness, contrast, skin beautify
        let imgData = ctx.getImageData(0, 0, w, h);
        this.applyAdjustments(imgData);
        ctx.putImageData(imgData, 0, 0);

        // 4. Draw suit overlay if selected
        if (this.state.selectedSuit && this.state.selectedSuit !== 'none') {
            this.drawSuitOverlay(ctx, w, h);
        }

        return this.cropCanvas;
    }

    /**
     * Apply brightness, contrast, saturation & smooth skin filters
     */
    applyAdjustments(imgData) {
        const d = imgData.data;
        const len = d.length;
        const brightness = this.state.brightness;
        const contrast = this.state.contrast;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        const smooth = this.state.skinSmoothing;

        for (let i = 0; i < len; i += 4) {
            let r = d[i], g = d[i+1], b = d[i+2];

            // Brightness & Contrast
            if (brightness !== 0 || contrast !== 0) {
                r = factor * (r - 128) + 128 + brightness;
                g = factor * (g - 128) + 128 + brightness;
                b = factor * (b - 128) + 128 + brightness;
            }

            // Skin smoothing / Beautify (reduces harsh skin redness/imperfections)
            if (smooth > 0) {
                // If pixel is within skin tone ranges
                if (r > 95 && g > 40 && b > 20 && (r - g) > 15 && r > b) {
                    const avg = (r + g + b) / 3;
                    const blend = smooth / 100 * 0.35;
                    r = r * (1 - blend) + (avg + 15) * blend;
                    g = g * (1 - blend) + (avg + 5) * blend;
                    b = b * (1 - blend) + avg * blend;
                }
            }

            d[i] = Math.min(255, Math.max(0, r));
            d[i+1] = Math.min(255, Math.max(0, g));
            d[i+2] = Math.min(255, Math.max(0, b));
        }
    }

    /**
     * Draw Suit SVG onto the passport photo synchronously
     */
    drawSuitOverlay(ctx, canvasW, canvasH) {
        const suit = SUIT_TEMPLATES.find(s => s.id === this.state.selectedSuit);
        if (!suit || !suit.image) return;

        const sw = 500 * this.state.suitState.scale;
        const sh = 450 * this.state.suitState.scale;
        const sx = this.state.suitState.x - sw / 2;
        const sy = this.state.suitState.y;

        ctx.save();
        ctx.globalAlpha = this.state.suitState.opacity || 1;
        if (suit.image.complete) {
            ctx.drawImage(suit.image, sx, sy, sw, sh);
        } else {
            suit.image.onload = () => {
                ctx.drawImage(suit.image, sx, sy, sw, sh);
            };
        }
        ctx.restore();
    }

    /**
     * Draw Biometric Face Guidelines (ISO/ICAO Standard overlay)
     * Shows: Crown line (top of head), Eye level line, Chin level line, Center symmetry line
     */
    drawBiometricGuidelines(ctx, w, h) {
        if (!this.state.showBiometricGuide) return;

        ctx.save();
        ctx.strokeStyle = '#22c55e'; // Green guide lines
        ctx.lineWidth = Math.max(1.5, w / 350);
        ctx.setLineDash([6, 6]);

        // 1. Center vertical symmetry line
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        // 2. Head oval guide (typically face takes 70-80% of photo height)
        const ovalCenterX = w / 2;
        const ovalCenterY = h * 0.48;
        const radiusX = w * 0.28;
        const radiusY = h * 0.32;

        ctx.beginPath();
        ctx.ellipse(ovalCenterX, ovalCenterY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Eye level line (around 50-55% from bottom or 45-50% from top)
        ctx.strokeStyle = '#38bdf8'; // Blue eye line
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h * 0.44);
        ctx.lineTo(w * 0.85, h * 0.44);
        ctx.stroke();

        // 4. Chin line
        ctx.strokeStyle = '#f59e0b'; // Amber chin line
        ctx.beginPath();
        ctx.moveTo(w * 0.25, h * 0.76);
        ctx.lineTo(w * 0.75, h * 0.76);
        ctx.stroke();

        // 5. Crown / Head top line
        ctx.strokeStyle = '#ef4444'; // Red crown line
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.16);
        ctx.lineTo(w * 0.8, h * 0.16);
        ctx.stroke();

        // Guide Labels
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(w / 32)}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText('Crown / মাথার উপরিভাগ', w * 0.22, h * 0.14);
        ctx.fillText('Eye Level / চোখের লেভেল', w * 0.22, h * 0.42);
        ctx.fillText('Chin / থুতনি', w * 0.26, h * 0.74);

        ctx.restore();
    }

    /**
     * Generate Multi-Photo Print Sheet (e.g. 4x6" photo paper or A4 paper with cutting lines)
     */
    generatePrintSheet() {
        const photoCanvas = this.renderCroppedPhoto();
        if (!photoCanvas) return null;

        const dpi = 300;
        let sheetWidthMm, sheetHeightMm;

        // Paper dimensions in millimeters
        switch (this.printState.paperSize) {
            case '4x6': // 4 x 6 inch (102 x 152 mm) standard photo paper
                sheetWidthMm = 152.4;
                sheetHeightMm = 101.6;
                break;
            case 'A4': // 210 x 297 mm
                sheetWidthMm = 210;
                sheetHeightMm = 297;
                break;
            case '5x7': // 5 x 7 inch (127 x 178 mm)
                sheetWidthMm = 177.8;
                sheetHeightMm = 127;
                break;
            default:
                sheetWidthMm = 152.4;
                sheetHeightMm = 101.6;
        }

        const sheetW = Math.round((sheetWidthMm / 25.4) * dpi);
        const sheetH = Math.round((sheetHeightMm / 25.4) * dpi);

        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = sheetW;
        sheetCanvas.height = sheetH;
        const ctx = sheetCanvas.getContext('2d');

        // Pure white photographic paper background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, sheetW, sheetH);

        // Photo dimensions in pixels on sheet
        const photoW = Math.round((this.currentPreset.widthMm / 25.4) * dpi);
        const photoH = Math.round((this.currentPreset.heightMm / 25.4) * dpi);
        const gapPx = Math.round((this.printState.gapMm / 25.4) * dpi);

        // Calculate rows and columns that fit
        const maxCols = Math.floor((sheetW - gapPx) / (photoW + gapPx));
        const maxRows = Math.floor((sheetH - gapPx) / (photoH + gapPx));

        let count = Math.min(this.printState.photoCount, maxCols * maxRows);
        let cols = Math.min(count, maxCols);
        let rows = Math.ceil(count / cols);

        // Center the grid on the sheet
        const totalGridW = cols * photoW + (cols - 1) * gapPx;
        const totalGridH = rows * photoH + (rows - 1) * gapPx;
        const startX = (sheetW - totalGridW) / 2;
        const startY = (sheetH - totalGridH) / 2;

        let drawn = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (drawn >= count) break;

                const px = startX + c * (photoW + gapPx);
                const py = startY + r * (photoH + gapPx);

                // Draw photo
                ctx.drawImage(photoCanvas, px, py, photoW, photoH);

                // Draw photo thin border if enabled
                if (this.printState.hasBorder) {
                    ctx.strokeStyle = '#e2e8f0';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px, py, photoW, photoH);
                }

                // Draw cutting guides (dashed lines & corner crop marks)
                if (this.printState.showCutLines) {
                    this.drawCuttingMarks(ctx, px, py, photoW, photoH, gapPx);
                }

                drawn++;
            }
        }

        // Add studio footer label at the edge of sheet
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(dpi * 0.045)}px sans-serif`;
        ctx.fillText(
            `CamScanner Studio Pro | ${this.currentPreset.name_en} | 300 DPI High-Quality Print`,
            startX,
            sheetH - Math.round(dpi * 0.08)
        );

        return sheetCanvas;
    }

    /**
     * Draw professional scissor cutting marks around each photo
     */
    drawCuttingMarks(ctx, x, y, w, h, gap) {
        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);

        const markLen = Math.max(15, gap / 2);

        // Top-Left marks
        ctx.beginPath();
        ctx.moveTo(x - markLen, y); ctx.lineTo(x, y);
        ctx.moveTo(x, y - markLen); ctx.lineTo(x, y);

        // Top-Right marks
        ctx.moveTo(x + w, y); ctx.lineTo(x + w + markLen, y);
        ctx.moveTo(x + w, y - markLen); ctx.lineTo(x + w, y);

        // Bottom-Left marks
        ctx.moveTo(x - markLen, y + h); ctx.lineTo(x, y + h);
        ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + markLen);

        // Bottom-Right marks
        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + markLen, y + h);
        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w, y + h + markLen);

        ctx.stroke();
        ctx.restore();
    }
}

/**
 * camlab - Intelligent Biometric Passport & A4 Print Studio Pro
 * Complete end-to-end passport system:
 * 1. Face, Head Crown, Chin, Neck & Upper-Chest Detection (auto-crops strictly Head + Neck + Shoulder/Chest)
 * 2. Male / Female Detection & Gender-aware Formal Suit / Blazer Fitting
 * 3. Attire / Clothing Analysis (Formal Dark Suit, White Shirt, or Casual/Colorful Dress)
 * 4. Studio Background Cutout & Replacement
 * 5. Live A4 Print Sheet Layout with exact Photos-Per-Row (এক লাইনে কয়টা ছবি) + Direct Print / PDF / JPG
 */

const PASSPORT_PRESETS = [
    {
        id: 'bd_epassport',
        country: '🇧🇩 Bangladesh (ই-পাসপোর্ট / স্ট্যান্ডার্ড)',
        name_bn: 'বাংলাদেশ পাসপোর্ট / ভিসা (৩৫ × ৪৫ মিমি)',
        name_en: 'Bangladesh Standard (35 x 45 mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'bd_passport',
        country: '🇧🇩 Bangladesh (পাসপোর্ট ৪০×৫০)',
        name_bn: 'বাংলাদেশ পাসপোর্ট (৪০ × ৫০ মিমি)',
        name_en: 'Bangladesh Passport (40 x 50 mm)',
        widthMm: 40,
        heightMm: 50,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'bd_nid',
        country: '🇧🇩 Bangladesh (স্ট্যাম্প / NID)',
        name_bn: 'স্ট্যাম্প সাইজ / NID (২৫ × ৩০ মিমি)',
        name_en: 'Stamp / NID Size (25 x 30 mm)',
        widthMm: 25,
        heightMm: 30,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'us_visa',
        country: '🇺🇸 USA (২×২ ইঞ্চি)',
        name_bn: 'আমেরিকা ভিসা (৫১ × ৫১ মিমি)',
        name_en: 'US Visa / Passport (50.8 x 50.8 mm)',
        widthMm: 50.8,
        heightMm: 50.8,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'schengen',
        country: '🇪🇺 Schengen / UK / Europe',
        name_bn: 'ইউরোপ / শেঞ্জেন / UK (৩৫ × ৪৫ মিমি)',
        name_en: 'Schengen / UK / Europe (35 x 45 mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#F5F5F0',
        dpi: 300
    },
    {
        id: 'saudi_visa',
        country: '🇸🇦 Saudi Arabia (হজ ও উমরাহ)',
        name_bn: 'সৌদি হজ / উমরাহ ভিসা (৪০ × ৬০ মিমি)',
        name_en: 'Saudi Hajj/Umrah (40 x 60 mm)',
        widthMm: 40,
        heightMm: 60,
        bgColor: '#FFFFFF',
        dpi: 300
    },
    {
        id: 'malaysia',
        country: '🇲🇾 Malaysia (নীল ব্যাকগ্রাউন্ড)',
        name_bn: 'মালয়েশিয়া ভিসা (৩৫ × ৫০ মিমি - নীল)',
        name_en: 'Malaysia Visa (35 x 50 mm - Blue)',
        widthMm: 35,
        heightMm: 50,
        bgColor: '#2563EB',
        dpi: 300
    },
    {
        id: 'custom',
        country: '⚙️ Custom Size (কাস্টম মাপ)',
        name_bn: 'কাস্টম সাইজ (মিমি)',
        name_en: 'Custom Dimensions (mm)',
        widthMm: 35,
        heightMm: 45,
        bgColor: '#FFFFFF',
        dpi: 300
    }
];

class PassportStudio {
    constructor() {
        this.currentPreset = PASSPORT_PRESETS[0];
        this.rawImage = null;
        this.cropCanvas = document.createElement('canvas');
        this.processedCanvas = document.createElement('canvas');

        // Transform & Enhancement State
        this.state = {
            scale: 1,
            rotation: 0,
            quarterTurnDeg: 0,
            photoOrientation: 'portrait', // 'portrait' | 'landscape'
            offsetX: 0,
            offsetY: 0,
            bgColor: '#FFFFFF',
            brightness: 0,
            contrast: 0,
            saturation: 0,
            skinSmoothing: 15,
            selectedSuit: 'none',
            suitState: {
                x: 0,
                y: 120,
                scale: 1,
                opacity: 1
            },
            showBiometricGuide: true
        };

        // Detected Biometric Portrait Analysis
        this.analysis = {
            faceDetected: false,
            confidence: 0,
            faceBox: null,     // { x, y, w, h, crownY, chinY, collarY, centerX } in rawImage pixels
            gender: 'male',    // 'male' | 'female'
            genderConfidence: 0,
            genderLabelBn: 'শনাক্ত হয়নি',
            attireType: 'casual',
            attireLabelBn: 'শনাক্ত হচ্ছে...',
            needsFormalSuit: false
        };

        // Print Sheet State (Custom Sheet Size + Portrait/Landscape + Photos-Per-Row)
        this.printState = {
            paperSize: 'A4',            // 'A4', '4x6', '5x7', 'legal', 'custom'
            sheetOrientation: 'portrait', // 'portrait' | 'landscape'
            customSheetWidthMm: 210,
            customSheetHeightMm: 297,
            photosPerRow: 5,
            rowCount: 2,
            photoCount: 10,
            showCutLines: true,
            hasBorder: true,
            gapMm: 3.5,
            marginMm: 6
        };
    }

    /**
     * Load image, run Face + Gender + Attire CV analysis, and auto-crop to Face + Neck + Upper Chest
     */
    loadImage(src, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
            this.rawImage = img;
            await this.analyzePortraitFeatures();
            this.autoFrameHeadNeckChest();
            this.renderCroppedPhoto();
            if (callback) callback(this.analysis);
        };
        img.src = src;
    }

    /**
     * Smart Offline Biometric Analyzer:
     * 1) Detects Face Box, Head Crown, Chin & Neck-to-Shoulder collar line
     * 2) Estimates Male vs Female via hair length beside jaw/neck & facial-hair/jaw contrast
     * 3) Analyzes Attire (Formal Dark Suit, Light/White Formal Shirt, or Casual/Patterned Dress)
     */
    async analyzePortraitFeatures() {
        if (!this.rawImage) return this.analysis;

        const img = this.rawImage;
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(60, Math.round(img.width * scale));
        const h = Math.max(60, Math.round(img.height * scale));

        const workCanvas = document.createElement('canvas');
        workCanvas.width = w;
        workCanvas.height = h;
        const ctx = workCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h).data;

        let faceBoxSmall = null;

        // Try native Chrome/Android FaceDetector API first when supported
        if (typeof window.FaceDetector !== 'undefined') {
            try {
                const detector = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 1 });
                const faces = await detector.detect(workCanvas);
                if (faces && faces.length > 0) {
                    const bb = faces[0].boundingBox;
                    if (bb.width > w * 0.1 && bb.height > h * 0.1) {
                        faceBoxSmall = { x: bb.x, y: bb.y, w: bb.width, h: bb.height, native: true };
                    }
                }
            } catch (e) {
                // Fallback to multi-cue skin + variance CV detector
            }
        }

        // Universal Multi-Cue Skin & Facial-Feature Detector
        const skinMask = new Uint8Array(w * h);
        const lumGrid = new Float32Array(w * h);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const d = idx * 4;
                const r = imgData[d];
                const g = imgData[d + 1];
                const b = imgData[d + 2];

                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                lumGrid[idx] = lum;

                // YCbCr chrominance skin-tone classifier (accurate across skin tones)
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);

                const isSkin = (
                    r > 65 && g > 30 && b > 18 &&
                    (maxC - minC) > 10 &&
                    r >= g && r > b &&
                    cb >= 76 && cb <= 130 &&
                    cr >= 132 && cr <= 176
                );
                if (isSkin) skinMask[idx] = 1;
            }
        }

        if (!faceBoxSmall) {
            faceBoxSmall = this._findBestFaceRegion(w, h, skinMask, lumGrid);
        }

        let fx, fy, fw, fh, faceDetected, confidence;
        if (faceBoxSmall) {
            fx = faceBoxSmall.x / scale;
            fy = faceBoxSmall.y / scale;
            fw = faceBoxSmall.w / scale;
            fh = faceBoxSmall.h / scale;
            faceDetected = true;
            confidence = faceBoxSmall.native ? 96 : 87;
        } else {
            // Reasonable portrait center fallback if photo has very unusual lighting
            fx = img.width * 0.28;
            fy = img.height * 0.14;
            fw = img.width * 0.44;
            fh = img.height * 0.42;
            faceDetected = false;
            confidence = 45;
        }

        // Refine Crown (top of hair/head) & Chin & Collar line
        const sx = Math.max(0, Math.round(fx * scale));
        const sy = Math.max(0, Math.round(fy * scale));
        const sw = Math.min(w - sx, Math.max(10, Math.round(fw * scale)));
        const sh = Math.min(h - sy, Math.max(10, Math.round(fh * scale)));

        // Sample top outer background color to locate true hair/crown boundary
        const bgSamples = [
            { r: imgData[2 * w * 4], g: imgData[2 * w * 4 + 1], b: imgData[2 * w * 4 + 2] },
            { r: imgData[(2 * w + w - 2) * 4], g: imgData[(2 * w + w - 2) * 4 + 1], b: imgData[(2 * w + w - 2) * 4 + 2] }
        ];
        const bgR = (bgSamples[0].r + bgSamples[1].r) / 2;
        const bgG = (bgSamples[0].g + bgSamples[1].g) / 2;
        const bgB = (bgSamples[0].b + bgSamples[1].b) / 2;

        // Scan upwards from eye/forehead level to find top of hair/head
        let crownYSmall = Math.max(0, sy - Math.round(sh * 0.28));
        const midXStart = Math.max(0, sx + Math.round(sw * 0.25));
        const midXEnd = Math.min(w - 1, sx + Math.round(sw * 0.75));
        for (let y = sy; y >= Math.max(0, sy - Math.round(sh * 0.55)); y--) {
            let fgCount = 0;
            const span = Math.max(1, midXEnd - midXStart);
            for (let x = midXStart; x <= midXEnd; x++) {
                const d = (y * w + x) * 4;
                const dist = Math.hypot(imgData[d] - bgR, imgData[d + 1] - bgG, imgData[d + 2] - bgB);
                if (dist > 28) fgCount++;
            }
            if (fgCount / span > 0.22) {
                crownYSmall = y;
            } else {
                break;
            }
        }

        const chinYSmall = Math.min(h - 1, sy + Math.round(sh * 1.02));
        const collarYSmall = Math.min(h - 1, chinYSmall + Math.round(sh * 0.24));

        const crownY = crownYSmall / scale;
        const chinY = chinYSmall / scale;
        const collarY = collarYSmall / scale;
        const centerX = fx + fw / 2;

        // --- Gender & Attire Heuristic CV Analysis ---
        const genderRes = this._analyzeGenderCues(w, h, sx, sy, sw, sh, chinYSmall, skinMask, lumGrid, bgR, bgG, bgB, imgData);
        const attireRes = this._analyzeAttireCues(w, h, sx, sw, chinYSmall, collarYSmall, sh, imgData);

        this.analysis = {
            faceDetected,
            confidence,
            faceBox: { x: fx, y: fy, w: fw, h: fh, crownY, chinY, collarY, centerX },
            gender: genderRes.gender,
            genderConfidence: genderRes.confidence,
            genderLabelBn: genderRes.gender === 'female' ? 'মেয়ে / নারী (Female)' : 'ছেলে / পুরুষ (Male)',
            attireType: attireRes.type,
            attireLabelBn: attireRes.labelBn,
            needsFormalSuit: attireRes.needsFormalSuit
        };

        return this.analysis;
    }

    _findBestFaceRegion(w, h, skinMask, lumGrid) {
        // Sliding window search over upper 82% of frame for dense skin + dark eyes/mouth variance
        let bestScore = 0;
        let bestRect = null;

        const minSize = Math.max(24, Math.round(Math.min(w, h) * 0.16));
        const maxSize = Math.round(Math.min(w, h) * 0.72);
        const stepSize = Math.max(6, Math.round(minSize * 0.25));

        for (let size = minSize; size <= maxSize; size += Math.max(8, Math.round(size * 0.22))) {
            const boxW = Math.round(size * 0.85);
            const boxH = Math.round(size * 1.12);
            if (boxW >= w || boxH >= h) continue;

            for (let y = Math.round(h * 0.02); y <= Math.round(h * 0.78) - boxH; y += stepSize) {
                for (let x = Math.round(w * 0.05); x <= Math.round(w * 0.95) - boxW; x += stepSize) {
                    let skinHits = 0;
                    let totalSamples = 0;
                    let darkFeatures = 0; // Eyes / eyebrows / mouth inside face box
                    let lumSum = 0;

                    const inc = Math.max(2, Math.round(boxW / 14));
                    for (let py = y; py < y + boxH; py += inc) {
                        for (let px = x; px < x + boxW; px += inc) {
                            const idx = py * w + px;
                            totalSamples++;
                            lumSum += lumGrid[idx];
                            if (skinMask[idx]) skinHits++;
                            // Eyes & eyebrows sit in upper-middle 25%-52% of face box
                            const relY = (py - y) / boxH;
                            if (relY > 0.22 && relY < 0.56 && lumGrid[idx] < 95) {
                                darkFeatures++;
                            }
                        }
                    }

                    const skinRatio = skinHits / Math.max(1, totalSamples);
                    const featureRatio = darkFeatures / Math.max(1, totalSamples);
                    if (skinRatio < 0.28 || skinRatio > 0.96 || featureRatio < 0.02) continue;

                    // Prefer centered-upper faces with strong skin + facial detail
                    const centerDist = Math.abs((x + boxW / 2) - w / 2) / w;
                    const score = (skinRatio * 1.4 + Math.min(0.25, featureRatio * 2.2)) * Math.sqrt(boxW * boxH) * (1 - centerDist * 0.35);

                    if (score > bestScore) {
                        bestScore = score;
                        bestRect = { x, y, w: boxW, h: boxH, native: false };
                    }
                }
            }
        }
        return bestRect;
    }

    _analyzeGenderCues(w, h, sx, sy, sw, sh, chinY, skinMask, lumGrid, bgR, bgG, bgB, imgData) {
        // 1. Side hair volume beside lower face & neck (left & right of jaw down to shoulder)
        let sideHairPixels = 0;
        let sideTotal = 0;
        const sideYStart = sy + Math.round(sh * 0.45);
        const sideYEnd = Math.min(h - 1, chinY + Math.round(sh * 0.32));
        const leftBand = [Math.max(0, sx - Math.round(sw * 0.34)), Math.max(0, sx - Math.round(sw * 0.04))];
        const rightBand = [Math.min(w - 1, sx + Math.round(sw * 1.04)), Math.min(w - 1, sx + Math.round(sw * 1.34))];

        for (let y = sideYStart; y <= sideYEnd; y += 2) {
            for (const band of [leftBand, rightBand]) {
                for (let x = band[0]; x <= band[1]; x += 2) {
                    const idx = y * w + x;
                    const d = idx * 4;
                    sideTotal++;
                    const distBg = Math.hypot(imgData[d] - bgR, imgData[d + 1] - bgG, imgData[d + 2] - bgB);
                    // Non-background, non-skin dark/textured hair beside neck/jaw
                    if (distBg > 30 && !skinMask[idx] && lumGrid[idx] < 130) {
                        sideHairPixels++;
                    }
                }
            }
        }
        const sideHairRatio = sideHairPixels / Math.max(1, sideTotal);

        // 2. Forehead brightness vs lower jaw darkness/stubble (beard/mustache cue)
        let foreheadSum = 0, foreheadCount = 0;
        let jawSum = 0, jawCount = 0;
        for (let y = sy + Math.round(sh * 0.14); y < sy + Math.round(sh * 0.34); y += 2) {
            for (let x = sx + Math.round(sw * 0.28); x < sx + Math.round(sw * 0.72); x += 2) {
                if (y >= 0 && y < h && x >= 0 && x < w) {
                    foreheadSum += lumGrid[y * w + x];
                    foreheadCount++;
                }
            }
        }
        for (let y = sy + Math.round(sh * 0.72); y < sy + Math.round(sh * 0.96); y += 2) {
            for (let x = sx + Math.round(sw * 0.25); x < sx + Math.round(sw * 0.75); x += 2) {
                if (y >= 0 && y < h && x >= 0 && x < w) {
                    jawSum += lumGrid[y * w + x];
                    jawCount++;
                }
            }
        }
        const foreheadLum = foreheadSum / Math.max(1, foreheadCount);
        const jawLum = jawSum / Math.max(1, jawCount);
        const facialHairContrast = (foreheadLum - jawLum) / Math.max(40, foreheadLum);

        // Score positive -> female, negative -> male
        let score = 0;
        score += (sideHairRatio - 0.32) * 2.4;
        score -= (facialHairContrast - 0.08) * 1.9;

        const gender = score > 0.12 ? 'female' : 'male';
        const confidence = Math.min(94, Math.max(66, Math.round(70 + Math.abs(score) * 24)));
        return { gender, confidence };
    }

    _analyzeAttireCues(w, h, sx, sw, chinY, collarY, sh, imgData) {
        const torsoYStart = Math.min(h - 2, collarY);
        const torsoYEnd = Math.min(h - 1, chinY + Math.round(sh * 0.85));
        if (torsoYEnd <= torsoYStart + 4) {
            return { type: 'unknown', labelBn: 'পোশাক দৃশ্যমান নয় (স্যুট যোগ করুন)', needsFormalSuit: true };
        }

        let darkShoulderPx = 0, brightCenterPx = 0, colorfulPx = 0, shoulderTotal = 0, centerTotal = 0;
        const sLeftX = Math.max(0, sx - Math.round(sw * 0.45));
        const sRightX = Math.min(w - 1, sx + Math.round(sw * 1.45));
        const cLeftX = Math.max(0, sx + Math.round(sw * 0.18));
        const cRightX = Math.min(w - 1, sx + Math.round(sw * 0.82));

        for (let y = torsoYStart; y <= torsoYEnd; y += 2) {
            for (let x = sLeftX; x <= sRightX; x += 2) {
                const d = (y * w + x) * 4;
                const r = imgData[d], g = imgData[d + 1], b = imgData[d + 2];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const sat = Math.max(r, g, b) - Math.min(r, g, b);

                if (x >= cLeftX && x <= cRightX) {
                    centerTotal++;
                    if (lum > 185 && sat < 35) brightCenterPx++;
                } else {
                    shoulderTotal++;
                    if (lum < 85 && sat < 45) darkShoulderPx++;
                }
                if (sat > 55) colorfulPx++;
            }
        }

        const darkShoulderRatio = darkShoulderPx / Math.max(1, shoulderTotal);
        const brightCenterRatio = brightCenterPx / Math.max(1, centerTotal);
        const colorfulRatio = colorfulPx / Math.max(1, shoulderTotal + centerTotal);

        if (darkShoulderRatio > 0.48 && brightCenterRatio > 0.22) {
            return { type: 'formal_suit', labelBn: 'ফরমাল স্যুট / ব্লেজার শনাক্ত ✓', needsFormalSuit: false };
        } else if (brightCenterRatio > 0.55 && colorfulRatio < 0.2) {
            return { type: 'formal_shirt', labelBn: 'ফরমাল হালকা/সাদা শার্ট শনাক্ত', needsFormalSuit: false };
        } else if (colorfulRatio > 0.35) {
            return { type: 'casual_color', labelBn: 'রঙিন/ক্যাজুয়াল পোশাক (ফরমাল স্যুট দিন)', needsFormalSuit: true };
        }
        return { type: 'casual', labelBn: 'সাধারণ পোশাক শনাক্ত (স্যুট সুপারিশকৃত)', needsFormalSuit: true };
    }

    /**
     * Allow user to manually override gender and match formal suit options
     */
    setGender(gender) {
        this.analysis.gender = gender === 'female' ? 'female' : 'male';
        this.analysis.genderLabelBn = this.analysis.gender === 'female' ? 'মেয়ে / নারী (Female)' : 'ছেলে / পুরুষ (Male)';
        if (this.state.selectedSuit && this.state.selectedSuit !== 'none') {
            this.applyAutoFormalSuit();
        }
    }

    /**
     * Strict Biometric Auto-Crop:
     * Keeps ONLY Head Crown -> Face -> Neck -> Upper Chest/Shoulders required for Passport size!
     */
    autoFrameHeadNeckChest() {
        if (!this.rawImage) return;

        const targetW = this.getPixelWidth();
        const targetH = this.getPixelHeight();
        const fb = this.analysis.faceBox;

        if (fb && fb.chinY > fb.crownY) {
            const headHeightRaw = fb.chinY - fb.crownY;
            // ISO Passport Framing:
            // Crown sits at 11% from top, Chin sits at 65% from top -> Head occupies 54% of height,
            // leaving bottom 35% (65% to 100%) strictly for Neck + Upper Collar/Chest!
            const targetHeadHeightPx = targetH * 0.54;
            const fitScale = targetHeadHeightPx / Math.max(30, headHeightRaw);

            // Prevent showing empty black/white gaps at bottom if raw photo ends shortly below chin
            const minBottomCoverScale = (targetH * 0.96) / Math.max(1, this.rawImage.height - (fb.crownY - headHeightRaw * 0.2));
            this.state.scale = Math.max(fitScale, targetW / this.rawImage.width, minBottomCoverScale * 0.9);

            this.state.offsetX = (targetW / 2) - (fb.centerX * this.state.scale);
            this.state.offsetY = (targetH * 0.11) - (fb.crownY * this.state.scale);
            this.state.rotation = 0;

            // Align Formal Suit collar precisely below detected chin + neck
            const renderedChinY = (fb.chinY * this.state.scale) + this.state.offsetY;
            const renderedFaceW = fb.w * this.state.scale;
            this.state.suitState.x = targetW / 2;
            this.state.suitState.y = Math.round(renderedChinY + renderedFaceW * 0.18);
            this.state.suitState.scale = Math.max(0.55, (targetW / 390) * (renderedFaceW / (targetW * 0.44)));
        } else {
            this.resetTransform();
        }
    }

    /**
     * Auto-fit matching Male or Female Formal Suit right onto neck & shoulders
     */
    applyAutoFormalSuit() {
        if (this.analysis.gender === 'female') {
            this.state.selectedSuit = 'womens_dark_blazer';
        } else {
            this.state.selectedSuit = 'mens_black_suit';
        }

        const targetW = this.getPixelWidth();
        const targetH = this.getPixelHeight();
        const fb = this.analysis.faceBox;
        if (fb) {
            const renderedChinY = (fb.chinY * this.state.scale) + this.state.offsetY;
            const renderedFaceW = fb.w * this.state.scale;
            this.state.suitState.x = targetW / 2;
            this.state.suitState.y = Math.round(Math.min(targetH * 0.78, Math.max(targetH * 0.56, renderedChinY + renderedFaceW * 0.16)));
            this.state.suitState.scale = Math.max(0.65, (targetW / 380));
        } else {
            this.state.suitState.x = targetW / 2;
            this.state.suitState.y = Math.round(targetH * 0.70);
            this.state.suitState.scale = targetW / 390;
        }
        return this.state.selectedSuit;
    }

    /**
     * Set active passport dimension preset & keep face framed cleanly
     */
    setPreset(presetId, customW, customH) {
        if (presetId === 'custom') {
            const w = Math.max(12, Math.min(250, customW || 35));
            const h = Math.max(12, Math.min(250, customH || 45));
            this.state.photoOrientation = w > h ? 'landscape' : 'portrait';
            this.currentPreset = {
                id: 'custom',
                country: '⚙️ Custom',
                name_bn: `কাস্টম (${w} × ${h} মিমি)`,
                name_en: `Custom (${w} x ${h} mm)`,
                widthMm: w,
                heightMm: h,
                bgColor: this.state.bgColor,
                dpi: 300
            };
        } else {
            const found = PASSPORT_PRESETS.find(p => p.id === presetId);
            if (found) {
                const clone = { ...found };
                if (this.state.photoOrientation === 'landscape' && clone.widthMm !== clone.heightMm) {
                    const mn = Math.min(clone.widthMm, clone.heightMm);
                    const mx = Math.max(clone.widthMm, clone.heightMm);
                    clone.widthMm = mx;
                    clone.heightMm = mn;
                }
                this.currentPreset = clone;
                this.state.bgColor = found.bgColor;
            }
        }
        this.autoFrameHeadNeckChest();
        this.renderCroppedPhoto();
    }

    setPhotoOrientation(orientation) {
        this.state.photoOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
        const minD = Math.min(this.currentPreset.widthMm, this.currentPreset.heightMm);
        const maxD = Math.max(this.currentPreset.widthMm, this.currentPreset.heightMm);
        if (Math.abs(minD - maxD) >= 0.2) {
            this.currentPreset = {
                ...this.currentPreset,
                widthMm: this.state.photoOrientation === 'landscape' ? maxD : minD,
                heightMm: this.state.photoOrientation === 'landscape' ? minD : maxD
            };
        }
        this.autoFrameHeadNeckChest();
        this.renderCroppedPhoto();
    }

    rotate90() {
        this.state.quarterTurnDeg = ((this.state.quarterTurnDeg || 0) + 90) % 360;
        this.renderCroppedPhoto();
    }

    resetTransform() {
        if (!this.rawImage) return;
        const targetW = this.getPixelWidth();
        const targetH = this.getPixelHeight();

        const scaleW = targetW / this.rawImage.width;
        const scaleH = targetH / this.rawImage.height;
        this.state.scale = Math.max(scaleW, scaleH) * 1.15;
        this.state.offsetX = (targetW - this.rawImage.width * this.state.scale) / 2;
        this.state.offsetY = (targetH - this.rawImage.height * this.state.scale) * 0.25;
        this.state.rotation = 0;

        this.state.suitState.x = targetW / 2;
        this.state.suitState.y = Math.round(targetH * 0.71);
        this.state.suitState.scale = targetW / 390;
    }

    getPixelWidth() {
        return Math.round((this.currentPreset.widthMm / 25.4) * this.currentPreset.dpi);
    }

    getPixelHeight() {
        return Math.round((this.currentPreset.heightMm / 25.4) * this.currentPreset.dpi);
    }

    renderCroppedPhoto() {
        if (!this.rawImage) return null;

        const w = this.getPixelWidth();
        const h = this.getPixelHeight();

        this.cropCanvas.width = w;
        this.cropCanvas.height = h;
        const ctx = this.cropCanvas.getContext('2d');

        ctx.fillStyle = this.state.bgColor;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        const totalDeg = (this.state.rotation || 0) + (this.state.quarterTurnDeg || 0);
        ctx.rotate((totalDeg * Math.PI) / 180);
        ctx.translate(-w / 2, -h / 2);

        ctx.drawImage(
            this.rawImage,
            this.state.offsetX,
            this.state.offsetY,
            this.rawImage.width * this.state.scale,
            this.rawImage.height * this.state.scale
        );
        ctx.restore();

        let imgData = ctx.getImageData(0, 0, w, h);
        this.applyAdjustments(imgData);
        ctx.putImageData(imgData, 0, 0);

        if (this.state.selectedSuit && this.state.selectedSuit !== 'none') {
            this.drawSuitOverlay(ctx, w, h);
        }

        return this.cropCanvas;
    }

    applyAdjustments(imgData) {
        const d = imgData.data;
        const len = d.length;
        const brightness = this.state.brightness;
        const contrast = this.state.contrast;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        const smooth = this.state.skinSmoothing;

        for (let i = 0; i < len; i += 4) {
            let r = d[i], g = d[i + 1], b = d[i + 2];

            if (brightness !== 0 || contrast !== 0) {
                r = factor * (r - 128) + 128 + brightness;
                g = factor * (g - 128) + 128 + brightness;
                b = factor * (b - 128) + 128 + brightness;
            }

            if (smooth > 0 && r > 80 && g > 35 && b > 18 && (r - g) > 12 && r > b) {
                const avg = (r + g + b) / 3;
                const blend = (smooth / 100) * 0.3;
                r = r * (1 - blend) + (avg + 14) * blend;
                g = g * (1 - blend) + (avg + 4) * blend;
                b = b * (1 - blend) + avg * blend;
            }

            d[i] = Math.min(255, Math.max(0, r));
            d[i + 1] = Math.min(255, Math.max(0, g));
            d[i + 2] = Math.min(255, Math.max(0, b));
        }
    }

    drawSuitOverlay(ctx) {
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
            suit.image.onload = () => ctx.drawImage(suit.image, sx, sy, sw, sh);
        }
        ctx.restore();
    }

    drawBiometricGuidelines(ctx, w, h) {
        if (!this.state.showBiometricGuide) return;

        ctx.save();
        ctx.strokeStyle = '#00A884';
        ctx.lineWidth = Math.max(1.5, w / 320);
        ctx.setLineDash([6, 5]);

        // Center vertical axis
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        // Face Oval
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.39, w * 0.27, h * 0.27, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Crown line (11%)
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(w * 0.18, h * 0.11);
        ctx.lineTo(w * 0.82, h * 0.11);
        ctx.stroke();

        // Eye level (38%)
        ctx.strokeStyle = '#0ea5e9';
        ctx.beginPath();
        ctx.moveTo(w * 0.16, h * 0.38);
        ctx.lineTo(w * 0.84, h * 0.38);
        ctx.stroke();

        // Chin level (65%) -> below this 35% is Neck & Upper Chest
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(w * 0.22, h * 0.65);
        ctx.lineTo(w * 0.78, h * 0.65);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(11, Math.round(w / 32))}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.fillText('মাথার শীর্ষ', w * 0.20, h * 0.095);
        ctx.fillText('চোখের লেভেল', w * 0.20, h * 0.36);
        ctx.fillText('থুতনি (নিচে গলা ও কলার)', w * 0.23, h * 0.63);

        ctx.restore();
    }

    /**
     * Calculate paper dimensions & max columns for current preset
     */
    getPaperMetrics() {
        let baseW = 210, baseH = 297;
        const ps = this.printState.paperSize;
        if (ps === '4x6') {
            baseW = 101.6;
            baseH = 152.4;
        } else if (ps === '5x7') {
            baseW = 127;
            baseH = 177.8;
        } else if (ps === 'legal') {
            baseW = 215.9;
            baseH = 355.6;
        } else if (ps === 'custom') {
            baseW = Math.max(40, Math.min(600, parseFloat(this.printState.customSheetWidthMm) || 210));
            baseH = Math.max(40, Math.min(600, parseFloat(this.printState.customSheetHeightMm) || 297));
        }

        let sheetWidthMm = baseW;
        let sheetHeightMm = baseH;
        if (ps !== 'custom') {
            const mn = Math.min(baseW, baseH);
            const mx = Math.max(baseW, baseH);
            const isLand = this.printState.sheetOrientation === 'landscape';
            sheetWidthMm = isLand ? mx : mn;
            sheetHeightMm = isLand ? mn : mx;
        } else if (this.printState.sheetOrientation === 'landscape' && sheetWidthMm < sheetHeightMm) {
            [sheetWidthMm, sheetHeightMm] = [sheetHeightMm, sheetWidthMm];
        } else if (this.printState.sheetOrientation === 'portrait' && sheetWidthMm > sheetHeightMm) {
            [sheetWidthMm, sheetHeightMm] = [sheetHeightMm, sheetWidthMm];
        }

        const usableW = sheetWidthMm - (this.printState.marginMm || 6) * 2;
        const gap = this.printState.gapMm || 3.5;
        const maxColsFit = Math.max(1, Math.floor((usableW + gap) / (this.currentPreset.widthMm + gap)));
        const maxRowsFit = Math.max(1, Math.floor(((sheetHeightMm - 18) + gap) / (this.currentPreset.heightMm + gap)));
        return { sheetWidthMm, sheetHeightMm, maxColsFit, maxRowsFit };
    }

    /**
     * Generate Print Sheet (A4 / 4x6 / 5x7) respecting exact Photos-Per-Row (এক লাইনে কয়টা ছবি) & Row Count
     */
    generatePrintSheet() {
        const photoCanvas = this.renderCroppedPhoto();
        if (!photoCanvas) return null;

        const dpi = 300;
        const { sheetWidthMm, sheetHeightMm, maxRowsFit } = this.getPaperMetrics();

        const sheetW = Math.round((sheetWidthMm / 25.4) * dpi);
        const sheetH = Math.round((sheetHeightMm / 25.4) * dpi);

        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = sheetW;
        sheetCanvas.height = sheetH;
        const ctx = sheetCanvas.getContext('2d');

        // Pure crisp white photographic / A4 paper
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, sheetW, sheetH);

        let photoW = Math.round((this.currentPreset.widthMm / 25.4) * dpi);
        let photoH = Math.round((this.currentPreset.heightMm / 25.4) * dpi);
        let gapPx = Math.round(((this.printState.gapMm || 3.5) / 25.4) * dpi);
        const marginPx = Math.round(((this.printState.marginMm || 6) / 25.4) * dpi);

        const desiredCols = Math.max(1, parseInt(this.printState.photosPerRow) || 5);
        const usableW = sheetW - marginPx * 2;

        // Ensure exact desiredCols photos fit cleanly in one horizontal row
        const reqWidthWithGap = desiredCols * photoW + (desiredCols - 1) * gapPx;
        if (reqWidthWithGap > usableW) {
            // First try reducing gap slightly, then scale down uniformly only if user forced many per line
            const minGap = Math.round((1.5 / 25.4) * dpi);
            if (desiredCols * photoW + (desiredCols - 1) * minGap <= usableW) {
                gapPx = Math.max(minGap, Math.floor((usableW - desiredCols * photoW) / Math.max(1, desiredCols - 1)));
            } else {
                const shrink = usableW / reqWidthWithGap;
                photoW = Math.round(photoW * shrink);
                photoH = Math.round(photoH * shrink);
                gapPx = Math.max(8, Math.round(gapPx * shrink));
            }
        }

        const rows = this.printState.rowCount === 'full'
            ? Math.max(1, Math.floor((sheetH - marginPx * 2 + gapPx) / (photoH + gapPx)))
            : Math.min(maxRowsFit + 2, Math.max(1, parseInt(this.printState.rowCount) || 2));

        const totalPhotos = rows * desiredCols;
        const totalGridW = desiredCols * photoW + (desiredCols - 1) * gapPx;
        const startX = (sheetW - totalGridW) / 2;
        const startY = marginPx + Math.round(dpi * 0.08);

        let drawn = 0;
        for (let r = 0; r < rows; r++) {
            const py = startY + r * (photoH + gapPx);
            if (py + photoH > sheetH - marginPx) break;

            for (let c = 0; c < desiredCols; c++) {
                if (drawn >= totalPhotos) break;
                const px = startX + c * (photoW + gapPx);

                ctx.drawImage(photoCanvas, px, py, photoW, photoH);

                if (this.printState.hasBorder) {
                    ctx.strokeStyle = '#cbd5e1';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px, py, photoW, photoH);
                }

                if (this.printState.showCutLines) {
                    this.drawCuttingMarks(ctx, px, py, photoW, photoH, gapPx);
                }
                drawn++;
            }
        }

        // Studio Print Sheet Footer
        ctx.fillStyle = '#64748b';
        ctx.font = `bold ${Math.round(dpi * 0.042)}px sans-serif`;
        ctx.fillText(
            `camlab Print Studio | ${this.currentPreset.name_en} | ${desiredCols} Photos/Row • ${drawn} Total • 300 DPI`,
            Math.max(marginPx, startX),
            sheetH - Math.round(dpi * 0.12)
        );

        return sheetCanvas;
    }

    drawCuttingMarks(ctx, x, y, w, h, gap) {
        ctx.save();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);

        const markLen = Math.max(10, Math.min(22, gap / 2));

        ctx.beginPath();
        ctx.moveTo(x - markLen, y); ctx.lineTo(x, y);
        ctx.moveTo(x, y - markLen); ctx.lineTo(x, y);

        ctx.moveTo(x + w, y); ctx.lineTo(x + w + markLen, y);
        ctx.moveTo(x + w, y - markLen); ctx.lineTo(x + w, y);

        ctx.moveTo(x - markLen, y + h); ctx.lineTo(x, y + h);
        ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + markLen);

        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + markLen, y + h);
        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w, y + h + markLen);

        ctx.stroke();
        ctx.restore();
    }
}

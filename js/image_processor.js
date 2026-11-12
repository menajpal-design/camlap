/**
 * CamScanner Web - Image Processor & Filter Engine
 * Implements CamScanner's signature filters, perspective warping, and passport image processing.
 */

class ImageProcessor {
    /**
     * Automatic Document & Book Corner Detection (Perspective Quad + Paper Segmentation)
     * Uses 5x5 morphological closing (to suppress interior text strokes) + directional
     * boundary gradient peak detection across 8 zones to find true perspective corners [TL, TR, BR, BL].
     */
    static detectDocumentCorners(sourceImage, withMeta = false) {
        const w = sourceImage.width || 640;
        const h = sourceImage.height || 480;

        // Downscale to working canvas for fast, accurate contour finding
        const scale = Math.min(320 / w, 240 / h, 1.0);
        const dw = Math.max(64, Math.round(w * scale));
        const dh = Math.max(48, Math.round(h * scale));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dw;
        tempCanvas.height = dh;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(sourceImage, 0, 0, dw, dh);

        const imgData = tCtx.getImageData(0, 0, dw, dh);
        const d = imgData.data;
        const numPixels = dw * dh;

        // 1. Extract raw grayscale luminance and color channels
        const gray = new Uint8Array(numPixels);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            gray[j] = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
        }

        // 2. 5x5 Morphological Dilation (Local Max) to erase dark ink/text lines inside book/page
        const dilated = new Uint8Array(numPixels);
        for (let y = 0; y < dh; y++) {
            const y0 = Math.max(0, y - 2);
            const y1 = Math.min(dh - 1, y + 2);
            for (let x = 0; x < dw; x++) {
                const x0 = Math.max(0, x - 2);
                const x1 = Math.min(dw - 1, x + 2);
                let maxVal = 0;
                for (let ny = y0; ny <= y1; ny++) {
                    const rowOffset = ny * dw;
                    for (let nx = x0; nx <= x1; nx++) {
                        const v = gray[rowOffset + nx];
                        if (v > maxVal) maxVal = v;
                    }
                }
                dilated[y * dw + x] = maxVal;
            }
        }

        // 3. Measure Center Paper Luminance vs Outer Border Luminance & Interior Text Contrast
        let centerSum = 0, centerCount = 0;
        let textEdgeCount = 0;
        const cx0 = Math.round(dw * 0.28), cx1 = Math.round(dw * 0.72);
        const cy0 = Math.round(dh * 0.28), cy1 = Math.round(dh * 0.72);
        for (let y = cy0; y <= cy1; y++) {
            for (let x = cx0; x <= cx1; x++) {
                const idx = y * dw + x;
                centerSum += dilated[idx];
                centerCount++;
                if (x > 1 && x < dw - 1 && y > 1 && y < dh - 1) {
                    const rawDiff = Math.abs(gray[idx + 1] - gray[idx - 1]) + Math.abs(gray[idx + dw] - gray[idx - dw]);
                    if (rawDiff > 38) textEdgeCount++;
                }
            }
        }
        const centerPaperLum = centerCount > 0 ? centerSum / centerCount : 180;
        const textDensity = centerCount > 0 ? textEdgeCount / centerCount : 0;

        // 4. Compute Directional Boundary Gradients on the dilated (text-free) surface
        const gradX = new Int16Array(numPixels);
        const gradY = new Int16Array(numPixels);
        const edges = new Uint8Array(numPixels);
        let maxGrad = 0;

        for (let y = 1; y < dh - 1; y++) {
            for (let x = 1; x < dw - 1; x++) {
                const idx = y * dw + x;
                // Gradient on dilated surface (captures true paper boundary, ignores thin text)
                const gx = dilated[idx + 1] - dilated[idx - 1];
                const gy = dilated[idx + dw] - dilated[idx - dw];
                // Also blend raw gradient for low-contrast colored documents
                const rgx = (gray[idx + 1] - gray[idx - 1]) >> 1;
                const rgy = (gray[idx + dw] - gray[idx - dw]) >> 1;

                gradX[idx] = gx;
                gradY[idx] = gy;
                const mag = Math.min(255, Math.abs(gx) + Math.abs(gy) + ((Math.abs(rgx) + Math.abs(rgy)) >> 1));
                edges[idx] = mag;
                if (mag > maxGrad) maxGrad = mag;
            }
        }

        const edgeThreshold = Math.max(18, Math.round(maxGrad * 0.18));
        const lumSimThreshold = Math.max(22, centerPaperLum * 0.22);

        // Helper: scan horizontal segment at y to score boundary transition
        const scoreHorizBand = (y, xStart, xEnd, dirY) => {
            let score = 0;
            const span = Math.max(1, xEnd - xStart);
            for (let x = xStart; x < xEnd; x++) {
                const idx = y * dw + x;
                const insideY = Math.min(dh - 1, Math.max(0, y + dirY * 3));
                const outsideY = Math.min(dh - 1, Math.max(0, y - dirY * 3));
                const inSim = Math.abs(dilated[insideY * dw + x] - centerPaperLum) < lumSimThreshold ? 1.4 : 0.6;
                const outDiff = Math.abs(dilated[outsideY * dw + x] - centerPaperLum) > lumSimThreshold * 0.8 ? 1.5 : 0.5;
                if (edges[idx] > edgeThreshold) {
                    score += edges[idx] * inSim * outDiff;
                }
            }
            return score / span;
        };

        // Helper: scan vertical segment at x to score boundary transition
        const scoreVertBand = (x, yStart, yEnd, dirX) => {
            let score = 0;
            const span = Math.max(1, yEnd - yStart);
            for (let y = yStart; y < yEnd; y++) {
                const idx = y * dw + x;
                const insideX = Math.min(dw - 1, Math.max(0, x + dirX * 3));
                const outsideX = Math.min(dw - 1, Math.max(0, x - dirX * 3));
                const inSim = Math.abs(dilated[y * dw + insideX] - centerPaperLum) < lumSimThreshold ? 1.4 : 0.6;
                const outDiff = Math.abs(dilated[y * dw + outsideX] - centerPaperLum) > lumSimThreshold * 0.8 ? 1.5 : 0.5;
                if (edges[idx] > edgeThreshold) {
                    score += edges[idx] * inSim * outDiff;
                }
            }
            return score / span;
        };

        // 5. Locate 8 Perspective Boundary Segments (allows slanted/skewed books & pages)
        const findPeakY = (yStart, yEnd, step, x0, x1, dirY, fallbackY) => {
            let bestY = fallbackY;
            let bestScore = 8; // minimum confidence threshold
            for (let y = yStart; step > 0 ? y <= yEnd : y >= yEnd; y += step) {
                const s = scoreHorizBand(y, x0, x1, dirY);
                if (s > bestScore) {
                    bestScore = s;
                    bestY = y;
                    // Prefer outermost strong boundary edge of the page
                    if (s > edgeThreshold * 1.15) break;
                }
            }
            return { pos: bestY, found: bestScore > 8 };
        };

        const findPeakX = (xStart, xEnd, step, y0, y1, dirX, fallbackX) => {
            let bestX = fallbackX;
            let bestScore = 8;
            for (let x = xStart; step > 0 ? x <= xEnd : x >= xEnd; x += step) {
                const s = scoreVertBand(x, y0, y1, dirX);
                if (s > bestScore) {
                    bestScore = s;
                    bestX = x;
                    if (s > edgeThreshold * 1.15) break;
                }
            }
            return { pos: bestX, found: bestScore > 8 };
        };

        const topL = findPeakY(Math.round(dh * 0.03), Math.round(dh * 0.42), 1, Math.round(dw * 0.16), Math.round(dw * 0.48), 1, Math.round(dh * 0.06));
        const topR = findPeakY(Math.round(dh * 0.03), Math.round(dh * 0.42), 1, Math.round(dw * 0.52), Math.round(dw * 0.84), 1, Math.round(dh * 0.06));

        const btmL = findPeakY(Math.round(dh * 0.97), Math.round(dh * 0.58), -1, Math.round(dw * 0.16), Math.round(dw * 0.48), -1, Math.round(dh * 0.94));
        const btmR = findPeakY(Math.round(dh * 0.97), Math.round(dh * 0.58), -1, Math.round(dw * 0.52), Math.round(dw * 0.84), -1, Math.round(dh * 0.94));

        const lftT = findPeakX(Math.round(dw * 0.03), Math.round(dw * 0.42), 1, Math.round(dh * 0.16), Math.round(dh * 0.48), 1, Math.round(dw * 0.06));
        const lftB = findPeakX(Math.round(dw * 0.03), Math.round(dw * 0.42), 1, Math.round(dh * 0.52), Math.round(dh * 0.84), 1, Math.round(dw * 0.06));

        const rgtT = findPeakX(Math.round(dw * 0.97), Math.round(dw * 0.58), -1, Math.round(dh * 0.16), Math.round(dh * 0.48), -1, Math.round(dw * 0.94));
        const rgtB = findPeakX(Math.round(dw * 0.97), Math.round(dw * 0.58), -1, Math.round(dh * 0.52), Math.round(dh * 0.84), -1, Math.round(dw * 0.94));

        // Limit extreme slant unless supported by strong edges
        const maxTiltY = dh * 0.14;
        if (Math.abs(topL.pos - topR.pos) > maxTiltY) {
            const avg = Math.round((topL.pos + topR.pos) / 2);
            topL.pos = avg; topR.pos = avg;
        }
        if (Math.abs(btmL.pos - btmR.pos) > maxTiltY) {
            const avg = Math.round((btmL.pos + btmR.pos) / 2);
            btmL.pos = avg; btmR.pos = avg;
        }
        const maxTiltX = dw * 0.14;
        if (Math.abs(lftT.pos - lftB.pos) > maxTiltX) {
            const avg = Math.round((lftT.pos + lftB.pos) / 2);
            lftT.pos = avg; lftB.pos = avg;
        }
        if (Math.abs(rgtT.pos - rgtB.pos) > maxTiltX) {
            const avg = Math.round((rgtT.pos + rgtB.pos) / 2);
            rgtT.pos = avg; rgtB.pos = avg;
        }

        const sidesFound = (topL.found || topR.found ? 1 : 0) +
                           (btmL.found || btmR.found ? 1 : 0) +
                           (lftT.found || lftB.found ? 1 : 0) +
                           (rgtT.found || rgtB.found ? 1 : 0);

        // Scale detected coordinates back to original resolution (with slight inward trim to avoid desk borders)
        const invScale = 1.0 / scale;
        const insetX = w * 0.004;
        const insetY = h * 0.004;

        const tlX = Math.max(0, Math.min(w, lftT.pos * invScale + insetX));
        const tlY = Math.max(0, Math.min(h, topL.pos * invScale + insetY));
        const trX = Math.max(0, Math.min(w, rgtT.pos * invScale - insetX));
        const trY = Math.max(0, Math.min(h, topR.pos * invScale + insetY));
        const brX = Math.max(0, Math.min(w, rgtB.pos * invScale - insetX));
        const brY = Math.max(0, Math.min(h, btmR.pos * invScale - insetY));
        const blX = Math.max(0, Math.min(w, lftB.pos * invScale + insetX));
        const blY = Math.max(0, Math.min(h, btmL.pos * invScale - insetY));

        const corners = [
            { x: Math.round(tlX), y: Math.round(tlY), id: 'tl' },
            { x: Math.round((tlX + trX) / 2), y: Math.round((tlY + trY) / 2), id: 't' },
            { x: Math.round(trX), y: Math.round(trY), id: 'tr' },
            { x: Math.round((trX + brX) / 2), y: Math.round((trY + brY) / 2), id: 'r' },
            { x: Math.round(brX), y: Math.round(brY), id: 'br' },
            { x: Math.round((blX + brX) / 2), y: Math.round((blY + brY) / 2), id: 'b' },
            { x: Math.round(blX), y: Math.round(blY), id: 'bl' },
            { x: Math.round((tlX + blX) / 2), y: Math.round((tlY + blY) / 2), id: 'l' }
        ];

        if (!withMeta) return corners;

        // Determine whether a real document/book is present in the frame
        const quadW = ((trX - tlX) + (brX - blX)) / 2;
        const quadH = ((blY - tlY) + (brY - trY)) / 2;
        const validSize = quadW > w * 0.25 && quadH > h * 0.25;
        const hasDocStructure = (sidesFound >= 2 && (textDensity > 0.015 || centerPaperLum > 85)) ||
                                (sidesFound >= 3) ||
                                (textDensity > 0.045 && centerPaperLum > 95);

        return {
            corners,
            detected: Boolean(validSize && hasDocStructure),
            sidesFound,
            textDensity,
            grayBuffer: gray
        };
    }

    /**
     * Analyze live camera frame for motion stability, page change, and document boundaries
     */
    static analyzeLiveFrame(sourceCanvas, prevGrayBuffer = null, lastCapturedGrayBuffer = null) {
        const meta = ImageProcessor.detectDocumentCorners(sourceCanvas, true);
        const currGray = meta.grayBuffer;

        // 1. Frame-to-frame motion score (lower = steadier camera)
        let motionScore = 0;
        if (prevGrayBuffer && prevGrayBuffer.length === currGray.length) {
            let diffSum = 0;
            let samples = 0;
            for (let i = 0; i < currGray.length; i += 4) {
                diffSum += Math.abs(currGray[i] - prevGrayBuffer[i]);
                samples++;
            }
            motionScore = samples > 0 ? diffSum / samples : 0;
        }

        // 2. Scene difference from last captured frame (detects page turn / new document)
        let diffFromLastCapture = 100;
        if (lastCapturedGrayBuffer && lastCapturedGrayBuffer.length === currGray.length) {
            let diffSum = 0;
            let samples = 0;
            for (let i = 0; i < currGray.length; i += 4) {
                diffSum += Math.abs(currGray[i] - lastCapturedGrayBuffer[i]);
                samples++;
            }
            diffFromLastCapture = samples > 0 ? diffSum / samples : 100;
        }

        return {
            corners: meta.corners,
            detected: meta.detected,
            isSteady: motionScore < 9.5,
            motionScore,
            diffFromLastCapture,
            grayBuffer: currGray
        };
    }

    /**
     * Automatic Brightness & Lighting Normalization (White Balance & Shadow Lift)
     */
    static autoBrightnessNormalize(imageData) {
        const d = imageData.data;
        const len = d.length;

        // Sample luminance to build histogram
        const hist = new Int32Array(256);
        let total = 0;
        for (let i = 0; i < len; i += 16) {
            const lum = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
            hist[lum]++;
            total++;
        }

        // Find 5th percentile (ink/shadows) and 92nd percentile (paper background)
        let count = 0;
        let pLow = 30;
        let pHigh = 220;

        for (let i = 0; i < 256; i++) {
            count += hist[i];
            if (count >= total * 0.05 && pLow === 30) pLow = i;
            if (count >= total * 0.92) { pHigh = i; break; }
        }

        if (pHigh <= pLow) { pLow = 30; pHigh = 220; }

        // Contrast stretch: map [pLow, pHigh] -> [20, 255]
        const range = pHigh - pLow;
        for (let i = 0; i < len; i += 4) {
            for (let c = 0; c < 3; c++) {
                let v = d[i + c];
                // Lift shadows and whiten paper
                let stretched = ((v - pLow) / range) * 235 + 20;
                d[i + c] = Math.min(255, Math.max(0, Math.round(stretched)));
            }
        }

        return imageData;
    }

    /**
     * Apply signature CamScanner filters
     */
    static applyFilter(imageData, filterType, options = {}) {
        const d = imageData.data;
        const len = d.length;
        const brightness = options.brightness || 0; // -100 to 100
        const contrast = options.contrast || 0;     // -100 to 100

        // Brightness & Contrast multiplier
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        switch (filterType) {
            case 'original':
                for (let i = 0; i < len; i += 4) {
                    if (brightness !== 0 || contrast !== 0) {
                        d[i] = Math.min(255, Math.max(0, factor * (d[i] - 128) + 128 + brightness));
                        d[i+1] = Math.min(255, Math.max(0, factor * (d[i+1] - 128) + 128 + brightness));
                        d[i+2] = Math.min(255, Math.max(0, factor * (d[i+2] - 128) + 128 + brightness));
                    }
                }
                break;

            case 'magic':
                // Automatic Brightness & Lighting Normalization
                ImageProcessor.autoBrightnessNormalize(imageData);

                // Magic Color: Deepens dark ink, whitens paper, boosts saturation & contrast
                for (let i = 0; i < len; i += 4) {
                    let r = d[i], g = d[i+1], b = d[i+2];

                    // Adaptive whitening for paper background
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (luminance > 135) {
                        // Whiten background
                        r = Math.min(255, r * 1.25 + 15);
                        g = Math.min(255, g * 1.25 + 15);
                        b = Math.min(255, b * 1.25 + 15);
                    } else {
                        // Deepen text
                        r = Math.max(0, r * 0.72 - 12);
                        g = Math.max(0, g * 0.72 - 12);
                        b = Math.max(0, b * 0.72 - 12);
                    }

                    // Boost contrast & vibrancy
                    r = Math.min(255, Math.max(0, 1.35 * (r - 120) + 120 + brightness));
                    g = Math.min(255, Math.max(0, 1.35 * (g - 120) + 120 + brightness));
                    b = Math.min(255, Math.max(0, 1.35 * (b - 120) + 120 + brightness));

                    d[i] = r;
                    d[i+1] = g;
                    d[i+2] = b;
                }
                break;

            case 'bw':
                // B&W (Thresholding with adaptive look)
                for (let i = 0; i < len; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                    // Threshold at 128 + brightness adjustment
                    const threshold = Math.max(40, Math.min(220, 130 - brightness * 0.5));
                    const val = lum > threshold ? 255 : 0;
                    d[i] = val;
                    d[i+1] = val;
                    d[i+2] = val;
                }
                break;

            case 'grayscale':
                // Clean grayscale photocopy style
                for (let i = 0; i < len; i += 4) {
                    let gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                    gray = Math.min(255, Math.max(0, factor * (gray - 128) + 128 + brightness));
                    d[i] = gray;
                    d[i+1] = gray;
                    d[i+2] = gray;
                }
                break;

            case 'lighten':
                // Lighten filter removes dirty shadow artifacts while preserving dark text
                for (let i = 0; i < len; i += 4) {
                    let r = d[i], g = d[i+1], b = d[i+2];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    const boost = (lum / 255) * 60 + 20;

                    d[i] = Math.min(255, r + boost + brightness);
                    d[i+1] = Math.min(255, g + boost + brightness);
                    d[i+2] = Math.min(255, b + boost + brightness);
                }
                break;

            case 'sharpen':
                // Convolution Sharpen
                ImageProcessor.applySharpen(imageData);
                break;
        }

        return imageData;
    }

    /**
     * 3x3 Convolution Sharpen Kernel
     */
    static applySharpen(imageData) {
        const w = imageData.width;
        const h = imageData.height;
        const src = new Uint8ClampedArray(imageData.data);
        const dst = imageData.data;

        // Kernel:
        // [  0, -1,  0 ]
        // [ -1,  5, -1 ]
        // [  0, -1,  0 ]
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;

                for (let c = 0; c < 3; c++) {
                    const top = ((y - 1) * w + x) * 4 + c;
                    const btm = ((y + 1) * w + x) * 4 + c;
                    const lft = (y * w + (x - 1)) * 4 + c;
                    const rgt = (y * w + (x + 1)) * 4 + c;
                    const cur = idx + c;

                    const val = 5 * src[cur] - src[top] - src[btm] - src[lft] - src[rgt];
                    dst[cur] = Math.min(255, Math.max(0, val));
                }
            }
        }
    }

    /**
     * 4-Point Perspective Warp / Homography Rectification
     * Transforms quadrilateral corners [TL, TR, BR, BL] into a flat rectangle of targetWidth x targetHeight.
     */
    static perspectiveWarp(srcCanvas, corners, targetWidth, targetHeight) {
        const dstCanvas = document.createElement('canvas');
        dstCanvas.width = targetWidth;
        dstCanvas.height = targetHeight;
        const dstCtx = dstCanvas.getContext('2d');

        const srcCtx = srcCanvas.getContext('2d');
        const srcW = srcCanvas.width;
        const srcH = srcCanvas.height;
        const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
        const dstImgData = dstCtx.createImageData(targetWidth, targetHeight);

        // Compute projective transformation matrix from dst rectangle to src quad
        // Destination points: (0,0), (targetWidth,0), (targetWidth,targetHeight), (0,targetHeight)
        const matrix = ImageProcessor.getPerspectiveTransform(
            [
                {x: 0, y: 0},
                {x: targetWidth, y: 0},
                {x: targetWidth, y: targetHeight},
                {x: 0, y: targetHeight}
            ],
            corners
        );

        const srcD = srcImgData.data;
        const dstD = dstImgData.data;

        // Backward mapping with bilinear interpolation
        for (let y = 0; y < targetHeight; y++) {
            for (let x = 0; x < targetWidth; x++) {
                const dIdx = (y * targetWidth + x) * 4;

                // Transform (x, y) via matrix
                const denom = matrix[6] * x + matrix[7] * y + matrix[8];
                if (Math.abs(denom) < 1e-7) continue;

                const sx = (matrix[0] * x + matrix[1] * y + matrix[2]) / denom;
                const sy = (matrix[3] * x + matrix[4] * y + matrix[5]) / denom;

                if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
                    const x0 = Math.floor(sx);
                    const y0 = Math.floor(sy);
                    const x1 = x0 + 1;
                    const y1 = y0 + 1;
                    const wx = sx - x0;
                    const wy = sy - y0;

                    for (let c = 0; c < 4; c++) {
                        const c00 = srcD[(y0 * srcW + x0) * 4 + c];
                        const c10 = srcD[(y0 * srcW + x1) * 4 + c];
                        const c01 = srcD[(y1 * srcW + x0) * 4 + c];
                        const c11 = srcD[(y1 * srcW + x1) * 4 + c];

                        const top = c00 * (1 - wx) + c10 * wx;
                        const btm = c01 * (1 - wx) + c11 * wx;
                        dstD[dIdx + c] = top * (1 - wy) + btm * wy;
                    }
                }
            }
        }

        dstCtx.putImageData(dstImgData, 0, 0);
        return dstCanvas;
    }

    /**
     * Compute 3x3 Projective Homography Matrix mapping src points to dst points
     */
    static getPerspectiveTransform(src, dst) {
        // Solves 8 linear equations for 8 matrix unknowns:
        // x' = (h00*x + h01*y + h02) / (h20*x + h21*y + 1)
        // y' = (h10*x + h11*y + h12) / (h20*x + h21*y + 1)
        const a = [];
        const b = [];

        for (let i = 0; i < 4; i++) {
            const sx = src[i].x;
            const sy = src[i].y;
            const dx = dst[i].x;
            const dy = dst[i].y;

            a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
            b.push(dx);
            a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
            b.push(dy);
        }

        const h = ImageProcessor.solveGaussian(a, b);
        return [
            h[0], h[1], h[2],
            h[3], h[4], h[5],
            h[6], h[7], 1
        ];
    }

    /**
     * Gaussian elimination solver for 8x8 system
     */
    static solveGaussian(A, b) {
        const n = A.length;
        for (let i = 0; i < n; i++) {
            let maxEl = Math.abs(A[i][i]);
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > maxEl) {
                    maxEl = Math.abs(A[k][i]);
                    maxRow = k;
                }
            }

            for (let k = i; k < n; k++) {
                const tmp = A[maxRow][k];
                A[maxRow][k] = A[i][k];
                A[i][k] = tmp;
            }
            const tmp = b[maxRow];
            b[maxRow] = b[i];
            b[i] = tmp;

            for (let k = i + 1; k < n; k++) {
                const c = -A[k][i] / (A[i][i] || 1e-7);
                for (let j = i; j < n; j++) {
                    if (i === j) {
                        A[k][j] = 0;
                    } else {
                        A[k][j] += c * A[i][j];
                    }
                }
                b[k] += c * b[i];
            }
        }

        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = b[i] / (A[i][i] || 1e-7);
            for (let k = i - 1; k >= 0; k--) {
                b[k] -= A[k][i] * x[i];
            }
        }
        return x;
    }

    /**
     * Load MediaPipe Selfie Segmentation lazily on demand with fast offline fallback.
     */
    static async _getMediaPipeSegmenter() {
        if (this._mpSegmenter) return this._mpSegmenter;
        if (this._mpLoadFailed) return null;

        if (!this._mpInitPromise) {
            this._mpInitPromise = (async () => {
                try {
                    if (typeof window.SelfieSegmentation === 'undefined') {
                        await new Promise((resolve, reject) => {
                            const s = document.createElement('script');
                            s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
                            s.async = true;
                            s.crossOrigin = 'anonymous';
                            const timer = setTimeout(() => reject(new Error('timeout')), 4500);
                            s.onload = () => { clearTimeout(timer); resolve(); };
                            s.onerror = () => { clearTimeout(timer); reject(new Error('load-error')); };
                            document.head.appendChild(s);
                        });
                    }
                    if (typeof window.SelfieSegmentation === 'undefined') {
                        throw new Error('SelfieSegmentation unavailable');
                    }
                    const seg = new window.SelfieSegmentation({
                        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
                    });
                    seg.setOptions({ modelSelection: 1 });
                    if (typeof seg.initialize === 'function') {
                        await Promise.race([
                            seg.initialize(),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('init-timeout')), 5000))
                        ]);
                    }
                    this._mpSegmenter = seg;
                    return seg;
                } catch {
                    this._mpLoadFailed = true;
                    return null;
                }
            })();
        }
        return this._mpInitPromise;
    }

    /**
     * Build a clean transparent RGBA cutout canvas using a normalized [0..1] foreground alpha mask,
     * smoothing hair/shoulder transitions and removing background color spill along edges.
     */
    static _buildTransparentCutoutFromAlpha(srcImgOrCanvas, alphaGrid, mw, mh) {
        const w = srcImgOrCanvas.width;
        const h = srcImgOrCanvas.height;

        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = mw;
        alphaCanvas.height = mh;
        const aCtx = alphaCanvas.getContext('2d');
        const aData = aCtx.createImageData(mw, mh);
        for (let i = 0; i < mw * mh; i++) {
            const p = i * 4;
            const aByte = Math.max(0, Math.min(255, Math.round(alphaGrid[i] * 255)));
            aData.data[p] = aByte;
            aData.data[p + 1] = aByte;
            aData.data[p + 2] = aByte;
            aData.data[p + 3] = 255;
        }
        aCtx.putImageData(aData, 0, 0);

        const upscaledAlphaCanvas = document.createElement('canvas');
        upscaledAlphaCanvas.width = w;
        upscaledAlphaCanvas.height = h;
        const uaCtx = upscaledAlphaCanvas.getContext('2d');
        uaCtx.imageSmoothingEnabled = true;
        uaCtx.imageSmoothingQuality = 'high';
        uaCtx.filter = w >= 400 ? 'blur(1.4px)' : 'blur(0.9px)';
        uaCtx.drawImage(alphaCanvas, 0, 0, w, h);
        uaCtx.filter = 'none';
        const upAlpha = uaCtx.getImageData(0, 0, w, h).data;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = w;
        outCanvas.height = h;
        const outCtx = outCanvas.getContext('2d');
        outCtx.drawImage(srcImgOrCanvas, 0, 0, w, h);
        const outImg = outCtx.getImageData(0, 0, w, h);
        const d = outImg.data;

        // Estimate dominant background color from pure-background samples for spill suppression
        let bgR = 0, bgG = 0, bgB = 0, bgCnt = 0;
        const step = Math.max(4, Math.floor((w * h) / 4000));
        for (let i = 0; i < w * h; i += step) {
            const p = i * 4;
            if (upAlpha[p] < 16) {
                bgR += d[p]; bgG += d[p + 1]; bgB += d[p + 2]; bgCnt++;
            }
        }
        const hasBg = bgCnt > 20;
        const mBgR = hasBg ? bgR / bgCnt : 220;
        const mBgG = hasBg ? bgG / bgCnt : 220;
        const mBgB = hasBg ? bgB / bgCnt : 220;

        for (let i = 0; i < w * h; i++) {
            const p = i * 4;
            let a = upAlpha[p];
            if (a < 22) a = 0;
            else if (a > 236) a = 255;
            else if (hasBg) {
                // De-fringe semi-transparent boundary pixels toward true foreground color
                const af = a / 255;
                if (af > 0.15) {
                    const inv = 1 - af;
                    d[p] = Math.max(0, Math.min(255, Math.round((d[p] - mBgR * inv) / af)));
                    d[p + 1] = Math.max(0, Math.min(255, Math.round((d[p + 1] - mBgG * inv) / af)));
                    d[p + 2] = Math.max(0, Math.min(255, Math.round((d[p + 2] - mBgB * inv) / af)));
                }
            }
            d[p + 3] = a;
        }
        outCtx.putImageData(outImg, 0, 0);
        return outCanvas;
    }

    /**
     * Offline Perceptual Foreground/Background Graph Segmentation:
     * Combines multi-cluster outer-margin background swatches, central face/neck/torso foreground samples,
     * human head-neck-shoulder spatial prior, 4-pass edge-aware 8-neighbor MRF relaxation, and border flood cleanup.
     */
    static _computeOfflineForegroundAlpha(srcImgOrCanvas, faceBox = null, tolerance = 45) {
        const srcW = srcImgOrCanvas.width;
        const srcH = srcImgOrCanvas.height;
        const maxDim = 280;
        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const w = Math.max(80, Math.round(srcW * scale));
        const h = Math.max(80, Math.round(srcH * scale));

        const work = document.createElement('canvas');
        work.width = w;
        work.height = h;
        const wCtx = work.getContext('2d');
        wCtx.drawImage(srcImgOrCanvas, 0, 0, w, h);
        const px = wCtx.getImageData(0, 0, w, h).data;

        const fx = faceBox ? (faceBox.centerX / srcW) * w : w * 0.5;
        const fy = faceBox ? (((faceBox.crownY || srcH * 0.15) + (faceBox.chinY || srcH * 0.58)) * 0.5 / srcH) * h : h * 0.36;
        const fw = faceBox ? Math.max(w * 0.18, ((faceBox.w || srcW * 0.34) / srcW) * w) : w * 0.34;
        const fh = faceBox ? Math.max(h * 0.22, (((faceBox.chinY || srcH * 0.58) - (faceBox.crownY || srcH * 0.15)) / srcH) * h) : h * 0.42;

        // Spatial Human Silhouette Prior [-1..+1]: positive = likely human, negative = likely background
        const prior = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const dxH = (x - fx) / (fw * 0.62);
                const dyH = (y - fy) / (fh * 0.68);
                const dHead = dxH * dxH + dyH * dyH;

                const neckDx = Math.abs(x - fx) / (fw * 0.48);
                const shoulderY = Math.max(0, Math.min(1, (y - (fy + fh * 0.32)) / (h - (fy + fh * 0.32) + 1)));
                const shoulderHalfW = fw * (0.58 + 1.15 * Math.pow(shoulderY, 0.72));
                const dTorso = (y > fy + fh * 0.28) ? Math.abs(x - fx) / shoulderHalfW : 2.5;

                if (dHead < 0.72 || (y > fy + fh * 0.35 && neckDx < 0.88)) {
                    prior[idx] = 1.0;
                } else if (dHead < 1.25 || dTorso < 0.85) {
                    prior[idx] = 0.55;
                } else if (dHead < 1.75 || dTorso < 1.15) {
                    prior[idx] = 0.05;
                } else {
                    prior[idx] = -0.85;
                }
                if (x < w * 0.06 || x > w * 0.94 || y < h * 0.05) {
                    prior[idx] = Math.min(prior[idx], -0.9);
                }
            }
        }

        // Collect quantized color clusters for Background (outer frame) vs Foreground (core person)
        const quantKey = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const buildPalette = (isBg) => {
            const bins = new Map();
            for (let y = 0; y < h; y += 2) {
                for (let x = 0; x < w; x += 2) {
                    const p = prior[y * w + x];
                    if (isBg ? (p > -0.75 || y > h * 0.86) : (p < 0.82)) continue;
                    const i = (y * w + x) * 4;
                    const k = quantKey(px[i], px[i + 1], px[i + 2]);
                    let entry = bins.get(k);
                    if (!entry) { entry = { r: 0, g: 0, b: 0, c: 0 }; bins.set(k, entry); }
                    entry.r += px[i]; entry.g += px[i + 1]; entry.b += px[i + 2]; entry.c++;
                }
            }
            return Array.from(bins.values())
                .sort((a, b) => b.c - a.c)
                .slice(0, 14)
                .map(e => [e.r / e.c, e.g / e.c, e.b / e.c]);
        };

        const bgPalette = buildPalette(true);
        const fgPalette = buildPalette(false);

        const minColorDist = (r, g, b, pal) => {
            let best = 1e9;
            for (let i = 0; i < pal.length; i++) {
                const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
                // Perceptual luma-weighted distance handles shadows & textured walls better than raw RGB
                const lumaD = 0.299 * dr + 0.587 * dg + 0.114 * db;
                const d2 = (dr * dr + dg * dg + db * db) * 0.72 + lumaD * lumaD * 0.65;
                if (d2 < best) best = d2;
            }
            return Math.sqrt(best);
        };

        const tolBias = (tolerance - 45) * 0.45;
        let fgMask = new Uint8Array(w * h);
        const unary = new Float32Array(w * h);

        for (let i = 0; i < w * h; i++) {
            const p = prior[i];
            const dIdx = i * 4;
            const dBg = bgPalette.length ? minColorDist(px[dIdx], px[dIdx + 1], px[dIdx + 2], bgPalette) : 120;
            const dFg = fgPalette.length ? minColorDist(px[dIdx], px[dIdx + 1], px[dIdx + 2], fgPalette) : 120;
            const colorScore = (dBg - dFg) + tolBias;
            const score = colorScore + p * 34;
            unary[i] = score;
            fgMask[i] = (p >= 0.92 || score > 2.0) ? 1 : 0;
        }

        // 4 passes of edge-aware MRF relaxation to snap cleanly to clothing/hair edges
        let nextMask = new Uint8Array(w * h);
        const offs = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
        for (let pass = 0; pass < 4; pass++) {
            nextMask.set(fgMask);
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const idx = y * w + x;
                    if (prior[idx] >= 0.95) { nextMask[idx] = 1; continue; }
                    const dIdx = idx * 4;
                    let fgW = 0, bgW = 0;
                    for (let k = 0; k < 8; k++) {
                        const nIdx = idx + offs[k];
                        const nd = nIdx * 4;
                        const diff = Math.abs(px[dIdx] - px[nd]) + Math.abs(px[dIdx + 1] - px[nd + 1]) + Math.abs(px[dIdx + 2] - px[nd + 2]);
                        const edgeW = Math.exp(-diff / 42);
                        if (fgMask[nIdx] === 1) fgW += edgeW; else bgW += edgeW;
                    }
                    const mrfScore = unary[idx] * 0.14 + (fgW - bgW) * 1.45;
                    nextMask[idx] = mrfScore > 0 ? 1 : 0;
                }
            }
            const tmp = fgMask; fgMask = nextMask; nextMask = tmp;
        }

        // Remove floating background islands by keeping foreground blobs connected to core head/torso
        const keep = new Uint8Array(w * h);
        const q = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (fgMask[idx] === 1 && prior[idx] >= 0.72) {
                    keep[idx] = 1;
                    q.push(idx);
                }
            }
        }
        let qHead = 0;
        while (qHead < q.length) {
            const cur = q[qHead++];
            const cx = cur % w;
            const cy = (cur / w) | 0;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = cy + dy;
                if (ny < 0 || ny >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx;
                    if (nx < 0 || nx >= w) continue;
                    const nIdx = ny * w + nx;
                    if (fgMask[nIdx] === 1 && !keep[nIdx]) {
                        keep[nIdx] = 1;
                        q.push(nIdx);
                    }
                }
            }
        }

        const alpha = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) alpha[i] = keep[i] ? 1.0 : 0.0;
        return { alpha, mw: w, mh: h };
    }

    /**
     * Primary AI Neural + Offline Graph Background Cutout Extractor for Passport Studio.
     * Returns a transparent RGBA canvas of the extracted person cutout.
     */
    static async extractForegroundCutoutAI(srcImgOrCanvas, faceBox = null, tolerance = 45) {
        const w = srcImgOrCanvas.width;
        const h = srcImgOrCanvas.height;

        try {
            const seg = await this._getMediaPipeSegmenter();
            if (seg) {
                const maskResult = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('seg-timeout')), 6500);
                    seg.onResults((res) => {
                        clearTimeout(timer);
                        resolve(res);
                    });
                    seg.send({ image: srcImgOrCanvas }).catch((e) => {
                        clearTimeout(timer);
                        reject(e);
                    });
                });

                if (maskResult && maskResult.segmentationMask) {
                    const mCanvas = document.createElement('canvas');
                    const mw = Math.min(512, w);
                    const mh = Math.min(512, Math.max(120, Math.round(h * (mw / w))));
                    mCanvas.width = mw;
                    mCanvas.height = mh;
                    const mCtx = mCanvas.getContext('2d');
                    mCtx.drawImage(maskResult.segmentationMask, 0, 0, mw, mh);
                    const mData = mCtx.getImageData(0, 0, mw, mh).data;
                    const alpha = new Float32Array(mw * mh);
                    // MediaPipe writes confidence in R/A channel depending on build
                    let fgSum = 0;
                    for (let i = 0; i < mw * mh; i++) {
                        const v = (mData[i * 4] > 0 ? mData[i * 4] : mData[i * 4 + 3]) / 255;
                        // Contrast curve centered around 0.5 to harden solid core and soften hair fringe
                        const tuned = v < 0.28 ? 0 : (v > 0.72 ? 1 : (v - 0.28) / 0.44);
                        alpha[i] = tuned;
                        fgSum += tuned;
                    }
                    const cov = fgSum / (mw * mh);
                    if (cov > 0.06 && cov < 0.94) {
                        const cutout = this._buildTransparentCutoutFromAlpha(srcImgOrCanvas, alpha, mw, mh);
                        cutout.cutoutMethod = 'mediapipe-ai';
                        return cutout;
                    }
                }
            }
        } catch {
            // Fall through cleanly to offline Perceptual Lab/MRF Segmentation
        }

        const { alpha, mw, mh } = this._computeOfflineForegroundAlpha(srcImgOrCanvas, faceBox, tolerance);
        const cutout = this._buildTransparentCutoutFromAlpha(srcImgOrCanvas, alpha, mw, mh);
        cutout.cutoutMethod = 'offline-mrf';
        return cutout;
    }

    /**
     * Synchronous Background Replacement helper (used for legacy/quick fallback paths).
     */
    static replaceBackground(canvas, targetHex, tolerance = 45, seedPoint = null, faceBox = null) {
        const { alpha, mw, mh } = this._computeOfflineForegroundAlpha(canvas, faceBox, tolerance);
        const cutout = this._buildTransparentCutoutFromAlpha(canvas, alpha, mw, mh);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.fillStyle = targetHex || '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cutout, 0, 0);
        ctx.restore();
        return canvas;
    }
}


/**
 * CamScanner Web - Image Processor & Filter Engine
 * Implements CamScanner's signature filters, perspective warping, and passport image processing.
 */

class ImageProcessor {
    /**
     * Automatic Document Corner & Edge Detection (Auto Contour / Edge Finding)
     * Detects 4 corners [TL, TR, BR, BL] of paper document in the image.
     */
    static detectDocumentCorners(sourceImage) {
        const w = sourceImage.width;
        const h = sourceImage.height;

        // Downscale to working canvas for real-time fast edge detection
        const scale = Math.min(320 / w, 240 / h, 1.0);
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dw;
        tempCanvas.height = dh;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(sourceImage, 0, 0, dw, dh);

        const imgData = tCtx.getImageData(0, 0, dw, dh);
        const d = imgData.data;

        // 1. Convert to grayscale & compute gradients (Sobel filter approximation)
        const gray = new Uint8Array(dw * dh);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            gray[j] = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
        }

        // 2. Compute edge magnitude map
        const edges = new Uint8Array(dw * dh);
        let maxGrad = 0;
        for (let y = 1; y < dh - 1; y++) {
            for (let x = 1; x < dw - 1; x++) {
                const idx = y * dw + x;
                const gx = (gray[idx + 1] - gray[idx - 1]);
                const gy = (gray[idx + dw] - gray[idx - dw]);
                const grad = Math.abs(gx) + Math.abs(gy);
                edges[idx] = grad;
                if (grad > maxGrad) maxGrad = grad;
            }
        }

        const threshold = Math.max(25, maxGrad * 0.22);

        // 3. Scan from 4 outer edges inward to locate candidate paper boundaries
        let topY = Math.round(dh * 0.05);
        let btmY = Math.round(dh * 0.95);
        let lftX = Math.round(dw * 0.05);
        let rgtX = Math.round(dw * 0.95);

        // Top edge
        for (let y = Math.round(dh * 0.04); y < dh * 0.45; y++) {
            let edgeCount = 0;
            for (let x = Math.round(dw * 0.15); x < dw * 0.85; x++) {
                if (edges[y * dw + x] > threshold) edgeCount++;
            }
            if (edgeCount > (dw * 0.15)) {
                topY = y;
                break;
            }
        }

        // Bottom edge
        for (let y = Math.round(dh * 0.96); y > dh * 0.55; y--) {
            let edgeCount = 0;
            for (let x = Math.round(dw * 0.15); x < dw * 0.85; x++) {
                if (edges[y * dw + x] > threshold) edgeCount++;
            }
            if (edgeCount > (dw * 0.15)) {
                btmY = y;
                break;
            }
        }

        // Left edge
        for (let x = Math.round(dw * 0.04); x < dw * 0.45; x++) {
            let edgeCount = 0;
            for (let y = Math.round(dh * 0.15); y < dh * 0.85; y++) {
                if (edges[y * dw + x] > threshold) edgeCount++;
            }
            if (edgeCount > (dh * 0.15)) {
                lftX = x;
                break;
            }
        }

        // Right edge
        for (let x = Math.round(dw * 0.96); x > dw * 0.55; x--) {
            let edgeCount = 0;
            for (let y = Math.round(dh * 0.15); y < dh * 0.85; y++) {
                if (edges[y * dw + x] > threshold) edgeCount++;
            }
            if (edgeCount > (dh * 0.15)) {
                rgtX = x;
                break;
            }
        }

        // Scale detected coordinates back to original resolution
        const invScale = 1.0 / scale;
        const padX = w * 0.02;
        const padY = h * 0.02;

        const tlX = Math.max(0, lftX * invScale - padX);
        const tlY = Math.max(0, topY * invScale - padY);
        const trX = Math.min(w, rgtX * invScale + padX);
        const trY = Math.max(0, topY * invScale - padY);
        const brX = Math.min(w, rgtX * invScale + padX);
        const brY = Math.min(h, btmY * invScale + padY);
        const blX = Math.max(0, lftX * invScale - padX);
        const blY = Math.min(h, btmY * invScale + padY);

        return [
            { x: Math.round(tlX), y: Math.round(tlY), id: 'tl' },
            { x: Math.round((tlX + trX) / 2), y: Math.round((tlY + trY) / 2), id: 't' },
            { x: Math.round(trX), y: Math.round(trY), id: 'tr' },
            { x: Math.round((trX + brX) / 2), y: Math.round((trY + brY) / 2), id: 'r' },
            { x: Math.round(brX), y: Math.round(brY), id: 'br' },
            { x: Math.round((blX + brX) / 2), y: Math.round((blY + brY) / 2), id: 'b' },
            { x: Math.round(blX), y: Math.round(blY), id: 'bl' },
            { x: Math.round((tlX + blX) / 2), y: Math.round((tlY + blY) / 2), id: 'l' }
        ];
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
     * Smart Background Color Replacement for Passport Photos
     * Uses seed flood-fill or edge sampling with color distance tolerance and edge feathering.
     */
    static replaceBackground(canvas, targetHex, tolerance = 35, seedPoint = null) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Parse target color
        const targetR = parseInt(targetHex.slice(1, 3), 16);
        const targetG = parseInt(targetHex.slice(3, 5), 16);
        const targetB = parseInt(targetHex.slice(5, 7), 16);

        // Identify background color by sampling the 4 outer corners or seed point
        let baseR, baseG, baseB;
        if (seedPoint && seedPoint.x >= 0 && seedPoint.x < w && seedPoint.y >= 0 && seedPoint.y < h) {
            const sIdx = (seedPoint.y * w + seedPoint.x) * 4;
            baseR = data[sIdx];
            baseG = data[sIdx + 1];
            baseB = data[sIdx + 2];
        } else {
            // Average corners
            const corners = [
                0,                          // Top-Left
                (w - 1) * 4,                // Top-Right
                ((h - 1) * w) * 4,          // Bottom-Left
                ((h - 1) * w + (w - 1)) * 4 // Bottom-Right
            ];
            baseR = Math.round((data[corners[0]] + data[corners[1]] + data[corners[2]] + data[corners[3]]) / 4);
            baseG = Math.round((data[corners[0]+1] + data[corners[1]+1] + data[corners[2]+1] + data[corners[3]+1]) / 4);
            baseB = Math.round((data[corners[0]+2] + data[corners[1]+2] + data[corners[2]+2] + data[corners[3]+2]) / 4);
        }

        // Flood fill mask from the edges (top, left, right)
        const mask = new Uint8Array(w * h); // 1 = background, 0 = foreground
        const visited = new Uint8Array(w * h);
        const queue = [];

        // Seed queue with border pixels
        for (let x = 0; x < w; x++) {
            queue.push(x, 0);       // Top edge
            visited[x] = 1;
            const bIdx = (h - 1) * w + x;
            queue.push(x, h - 1);   // Bottom edge
            visited[bIdx] = 1;
        }
        for (let y = 1; y < h - 1; y++) {
            queue.push(0, y);       // Left edge
            visited[y * w] = 1;
            queue.push(w - 1, y);   // Right edge
            visited[y * w + (w - 1)] = 1;
        }

        // BFS Flood Fill based on color similarity
        let head = 0;
        while (head < queue.length) {
            const qx = queue[head++];
            const qy = queue[head++];
            const pIdx = qy * w + qx;
            const dIdx = pIdx * 4;

            const r = data[dIdx];
            const g = data[dIdx + 1];
            const b = data[dIdx + 2];

            // Euclidean color distance in RGB space
            const dist = Math.sqrt(
                (r - baseR) ** 2 +
                (g - baseG) ** 2 +
                (b - baseB) ** 2
            );

            if (dist <= tolerance) {
                mask[pIdx] = 1;

                // Push 4-connected neighbors
                const neighbors = [
                    [qx + 1, qy],
                    [qx - 1, qy],
                    [qx, qy + 1],
                    [qx, qy - 1]
                ];

                for (let i = 0; i < 4; i++) {
                    const nx = neighbors[i][0];
                    const ny = neighbors[i][1];
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        const nIdx = ny * w + nx;
                        if (!visited[nIdx]) {
                            visited[nIdx] = 1;
                            queue.push(nx, ny);
                        }
                    }
                }
            }
        }

        // Apply background color to mask with soft edge feathering
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const dIdx = idx * 4;

                if (mask[idx] === 1) {
                    data[dIdx] = targetR;
                    data[dIdx + 1] = targetG;
                    data[dIdx + 2] = targetB;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }
}


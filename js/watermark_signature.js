/**
 * CAMLAB Web - Watermark & Digital Signature Studio
 * Adds secure anti-counterfeit watermarks, signature drawing pad, and signature overlay.
 */

class WatermarkSignatureStudio {
    constructor() {
        this.signatureCanvas = document.createElement('canvas');
        this.signatureCtx = this.signatureCanvas.getContext('2d');
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.penColor = '#000000';
        this.penSize = 3;

        // Overlay signature state
        this.placedSignature = null; // Image/Canvas
        this.sigPos = { x: 100, y: 100, width: 150, height: 75 };
    }

    initSignaturePad(canvasElement) {
        this.signatureCanvas = canvasElement;
        this.signatureCtx = this.signatureCanvas.getContext('2d');
        this.signatureCtx.lineCap = 'round';
        this.signatureCtx.lineJoin = 'round';

        const getPos = (e) => {
            const rect = canvasElement.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (canvasElement.width / rect.width),
                y: (clientY - rect.top) * (canvasElement.height / rect.height)
            };
        };

        const start = (e) => {
            e.preventDefault();
            this.isDrawing = true;
            const pos = getPos(e);
            this.lastX = pos.x;
            this.lastY = pos.y;
        };

        const move = (e) => {
            if (!this.isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);

            this.signatureCtx.strokeStyle = this.penColor;
            this.signatureCtx.lineWidth = this.penSize;
            this.signatureCtx.beginPath();
            this.signatureCtx.moveTo(this.lastX, this.lastY);
            this.signatureCtx.lineTo(pos.x, pos.y);
            this.signatureCtx.stroke();

            this.lastX = pos.x;
            this.lastY = pos.y;
        };

        const stop = () => {
            this.isDrawing = false;
        };

        canvasElement.addEventListener('mousedown', start);
        canvasElement.addEventListener('mousemove', move);
        window.addEventListener('mouseup', stop);

        canvasElement.addEventListener('touchstart', start, { passive: false });
        canvasElement.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', stop);
    }

    clearSignature() {
        if (!this.signatureCanvas) return;
        this.signatureCtx.clearRect(0, 0, this.signatureCanvas.width, this.signatureCanvas.height);
    }

    /**
     * Remove white background from an uploaded signature photo
     */
    extractSignatureFromPhoto(imageSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            const d = imgData.data;

            // Make white/light background transparent and keep ink dark
            for (let i = 0; i < d.length; i += 4) {
                const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                if (lum > 180) {
                    d[i+3] = 0; // Transparent
                } else {
                    // Turn ink to crisp blue/black
                    d[i] = 20;
                    d[i+1] = 40;
                    d[i+2] = 100;
                    d[i+3] = Math.min(255, (255 - lum) * 1.5);
                }
            }
            ctx.putImageData(imgData, 0, 0);
            if (callback) callback(canvas);
        };
        img.src = imageSrc;
    }

    /**
     * Apply diagonal or centered text watermark to a canvas
     */
    static applyWatermark(targetCanvas, text, options = {}) {
        if (!text || text.trim() === '') return targetCanvas;

        const ctx = targetCanvas.getContext('2d');
        const w = targetCanvas.width;
        const h = targetCanvas.height;

        const opacity = options.opacity !== undefined ? options.opacity : 0.2;
        const color = options.color || '#dc2626'; // Default security red
        const fontSize = options.fontSize || Math.round(w / 18);
        const repeat = options.repeat !== undefined ? options.repeat : true;

        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (repeat) {
            // Diagonal grid pattern across the page
            ctx.rotate((-30 * Math.PI) / 180);
            const stepX = fontSize * (text.length * 0.7) + 60;
            const stepY = fontSize * 3.5;

            for (let x = -w * 1.5; x < w * 2; x += stepX) {
                for (let y = -h * 1.5; y < h * 2; y += stepY) {
                    ctx.fillText(text, x, y);
                }
            }
        } else {
            // Single large centered watermark
            ctx.translate(w / 2, h / 2);
            ctx.rotate((-30 * Math.PI) / 180);
            ctx.fillText(text, 0, 0);
        }

        ctx.restore();
        return targetCanvas;
    }
}


/**
 * CamScanner Web - 8-Point Intelligent Crop View with Live Magnifier Loupe
 * Replicates the authentic CamScanner boundary adjustment experience.
 */

class CropView {
    constructor(canvasElement, loupeElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.loupe = loupeElement;
        this.loupeCtx = loupeElement ? loupeElement.getContext('2d') : null;

        this.points = [];
        this.activePointIndex = -1;
        this.isDragging = false;
        this.engine = null;
        this.scaleRatio = 1;

        this.initEvents();
    }

    setEngine(engine) {
        this.engine = engine;
        this.points = engine.cropPoints;
        this.render();
    }

    render() {
        if (!this.engine || !this.engine.currentImage) return;

        const img = this.engine.currentImage;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const maxW = Math.max(200, (rect.width ? rect.width - 24 : window.innerWidth - 40));
        const maxH = Math.max(200, (rect.height ? rect.height - 24 : window.innerHeight - 150));

        const scale = Math.min(maxW / img.width, maxH / img.height);
        this.scaleRatio = scale;

        this.canvas.width = Math.round(img.width * scale);
        this.canvas.height = Math.round(img.height * scale);

        // 1. Draw scaled background image
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw semi-transparent dark shade outside the quad polygon
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Clear the inside cropped quad
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        const pts = this.engine.cropPoints;
        this.ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();

        // 3. Draw glowing green connecting lines
        this.ctx.save();
        this.ctx.strokeStyle = '#00a884'; // CamScanner teal green
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
        }
        this.ctx.closePath();
        this.ctx.stroke();

        // 4. Draw 8 control point handles
        for (let i = 0; i < pts.length; i++) {
            const px = pts[i].x * scale;
            const py = pts[i].y * scale;
            const isCorner = i % 2 === 0;

            this.ctx.beginPath();
            this.ctx.arc(px, py, isCorner ? 9 : 7, 0, Math.PI * 2);
            this.ctx.fillStyle = isCorner ? '#00a884' : '#ffffff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2.5;
            this.ctx.stroke();

            // Inner dot for corner
            if (isCorner) {
                this.ctx.beginPath();
                this.ctx.arc(px, py, 3.5, 0, Math.PI * 2);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    initEvents() {
        const getCanvasPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) / this.scaleRatio,
                y: (clientY - rect.top) / this.scaleRatio
            };
        };

        const onStart = (e) => {
            if (!this.engine || !this.engine.currentImage) return;
            const pos = getCanvasPos(e);
            const pts = this.engine.cropPoints;
            const hitRadius = 35 / this.scaleRatio;

            let closest = -1;
            let minDist = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const dist = Math.hypot(pts[i].x - pos.x, pts[i].y - pos.y);
                if (dist < hitRadius && dist < minDist) {
                    minDist = dist;
                    closest = i;
                }
            }

            if (closest !== -1) {
                e.preventDefault();
                this.isDragging = true;
                this.activePointIndex = closest;
                this.updateLoupe(pts[closest].x, pts[closest].y);
            }
        };

        const onMove = (e) => {
            if (!this.isDragging || this.activePointIndex === -1) return;
            e.preventDefault();
            const pos = getCanvasPos(e);
            const img = this.engine.currentImage;
            const pts = this.engine.cropPoints;

            // Constrain within image boundaries
            const nx = Math.max(0, Math.min(img.width, pos.x));
            const ny = Math.max(0, Math.min(img.height, pos.y));

            pts[this.activePointIndex].x = nx;
            pts[this.activePointIndex].y = ny;

            // If corner dragged, re-calculate adjacent midpoints
            this.updateMidpoints();

            this.render();
            this.updateLoupe(nx, ny);
        };

        const onEnd = () => {
            this.isDragging = false;
            this.activePointIndex = -1;
            if (this.loupe) this.loupe.style.display = 'none';
        };

        this.canvas.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        this.canvas.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);

        window.addEventListener('resize', () => {
            if (this.engine && this.engine.currentImage) {
                this.render();
            }
        });
    }

    updateMidpoints() {
        const pts = this.engine.cropPoints;
        // TL(0), T(1), TR(2), R(3), BR(4), B(5), BL(6), L(7)
        pts[1].x = (pts[0].x + pts[2].x) / 2;
        pts[1].y = (pts[0].y + pts[2].y) / 2;

        pts[3].x = (pts[2].x + pts[4].x) / 2;
        pts[3].y = (pts[2].y + pts[4].y) / 2;

        pts[5].x = (pts[4].x + pts[6].x) / 2;
        pts[5].y = (pts[4].y + pts[6].y) / 2;

        pts[7].x = (pts[6].x + pts[0].x) / 2;
        pts[7].y = (pts[6].y + pts[0].y) / 2;
    }

    /**
     * Render 2.5x Zoom Magnifier Loupe at the top of the screen
     */
    updateLoupe(targetX, targetY) {
        if (!this.loupe || !this.loupeCtx || !this.engine.currentImage) return;

        this.loupe.style.display = 'block';
        const size = this.loupe.width; // e.g. 110px
        const zoom = 2.5;

        this.loupeCtx.clearRect(0, 0, size, size);

        // Clip to circular lens
        this.loupeCtx.save();
        this.loupeCtx.beginPath();
        this.loupeCtx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        this.loupeCtx.clip();

        // Draw zoomed area from original image
        const srcW = size / zoom;
        const srcH = size / zoom;
        const sx = targetX - srcW / 2;
        const sy = targetY - srcH / 2;

        this.loupeCtx.drawImage(
            this.engine.currentImage,
            sx, sy, srcW, srcH,
            0, 0, size, size
        );

        // Draw red precision crosshairs
        this.loupeCtx.strokeStyle = '#ef4444';
        this.loupeCtx.lineWidth = 1.5;
        this.loupeCtx.beginPath();
        // Horiz
        this.loupeCtx.moveTo(size / 2 - 15, size / 2);
        this.loupeCtx.lineTo(size / 2 + 15, size / 2);
        // Vert
        this.loupeCtx.moveTo(size / 2, size / 2 - 15);
        this.loupeCtx.lineTo(size / 2, size / 2 + 15);
        this.loupeCtx.stroke();

        this.loupeCtx.restore();

        // Loupe outer chrome ring
        this.loupeCtx.strokeStyle = '#00a884';
        this.loupeCtx.lineWidth = 4;
        this.loupeCtx.beginPath();
        this.loupeCtx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        this.loupeCtx.stroke();
    }
}


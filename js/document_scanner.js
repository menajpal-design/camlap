/**
 * CamScanner Web - Document Scanner & Multi-page Binder
 * Interactive 4-point quad perspective warp, signature magic filters, and multi-page management.
 */

class DocumentScanner {
    constructor() {
        this.pages = []; // Array of { id, originalImg, corners, processedCanvas, filter, brightness, contrast }
        this.activePageIndex = 0;
        this.currentFilter = 'magic';
        this.brightness = 0;
        this.contrast = 0;

        // Interactive corners [TL, TR, BR, BL]
        this.corners = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ];

        this.selectedCorner = null;
        this.isWarped = false;
    }

    /**
     * Add a newly uploaded document or captured photo
     */
    addPage(imageSrc, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const w = img.width;
            const h = img.height;

            // Default corners: full image boundaries
            const corners = [
                { x: 0, y: 0 },
                { x: w, y: 0 },
                { x: w, y: h },
                { x: 0, y: h }
            ];

            const page = {
                id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                image: img,
                corners: corners,
                filter: 'magic',
                brightness: 0,
                contrast: 0,
                rotation: 0,
                processedCanvas: null
            };

            this.pages.push(page);
            this.activePageIndex = this.pages.length - 1;
            this.processActivePage();

            if (callback) callback(page);
        };
        img.src = imageSrc;
    }

    getActivePage() {
        if (this.pages.length === 0) return null;
        return this.pages[this.activePageIndex];
    }

    /**
     * Warp corners into flat rectangle, then apply active filter
     */
    processActivePage() {
        const page = this.getActivePage();
        if (!page) return null;

        // 1. Calculate warped rectangle dimensions based on average width and height of quad
        const c = page.corners;
        const topW = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
        const btmW = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y);
        const lftH = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y);
        const rgtH = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);

        const targetW = Math.round(Math.max(topW, btmW));
        const targetH = Math.round(Math.max(lftH, rgtH));

        // Create canvas of source image
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = page.image.width;
        srcCanvas.height = page.image.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(page.image, 0, 0);

        let warpedCanvas;
        const isFullRect = (
            c[0].x === 0 && c[0].y === 0 &&
            c[1].x === page.image.width && c[1].y === 0 &&
            c[2].x === page.image.width && c[2].y === page.image.height &&
            c[3].x === 0 && c[3].y === page.image.height
        );

        if (isFullRect) {
            warpedCanvas = document.createElement('canvas');
            warpedCanvas.width = page.image.width;
            warpedCanvas.height = page.image.height;
            const wCtx = warpedCanvas.getContext('2d');
            wCtx.drawImage(page.image, 0, 0);
        } else {
            // 2. Perform perspective warp
            warpedCanvas = ImageProcessor.perspectiveWarp(srcCanvas, page.corners, targetW, targetH);
        }

        // 3. Apply CamScanner signature filters
        const finalCtx = warpedCanvas.getContext('2d');
        let imgData = finalCtx.getImageData(0, 0, targetW, targetH);

        ImageProcessor.applyFilter(imgData, page.filter, {
            brightness: page.brightness,
            contrast: page.contrast
        });

        finalCtx.putImageData(imgData, 0, 0);
        page.processedCanvas = warpedCanvas;
        return warpedCanvas;
    }

    /**
     * Change filter for current page
     */
    setFilter(filterName) {
        const page = this.getActivePage();
        if (!page) return;
        page.filter = filterName;
        return this.processActivePage();
    }

    /**
     * Rotate current page by 90 degrees
     */
    rotatePage(deg = 90) {
        const page = this.getActivePage();
        if (!page || !page.processedCanvas) return;

        const src = page.processedCanvas;
        const rotCanvas = document.createElement('canvas');
        if (deg === 90 || deg === 270) {
            rotCanvas.width = src.height;
            rotCanvas.height = src.width;
        } else {
            rotCanvas.width = src.width;
            rotCanvas.height = src.height;
        }

        const ctx = rotCanvas.getContext('2d');
        ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(src, -src.width / 2, -src.height / 2);

        page.processedCanvas = rotCanvas;
        return rotCanvas;
    }

    /**
     * Remove page by index
     */
    removePage(index) {
        if (index >= 0 && index < this.pages.length) {
            this.pages.splice(index, 1);
            if (this.activePageIndex >= this.pages.length) {
                this.activePageIndex = Math.max(0, this.pages.length - 1);
            }
        }
    }
}

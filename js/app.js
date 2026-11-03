/**
 * CamScanner Web Studio Pro - Master Application Controller
 * Replicates the authentic CamScanner mobile/web interface and full functionality:
 * - 8-Point intelligent quad crop with real-time magnifying loupe
 * - Authentic camera viewfinder with horizontal mode carousel
 * - Signature Magic Color & B&W filters with real thumbnails
 * - Multi-page Document Detail & PDF Studio with compression & encryption
 * - Authentic 3-Step ID Card Studio (Front, Back, A4 1:1 Scale Print & Anti-Theft Watermark)
 * - Passport Photo Studio with country presets & suit changer
 * - Tools Hub with 25+ features (PDF tools, QR code, Book split, Watermark, e-Sign, OCR)
 */

// Global Module Instances
const csEngine = new CamScannerEngine();
const passportStudio = new PassportStudio();
const idCardScanner = new IDCardScanner();
const watermarkStudio = new WatermarkSignatureStudio();
const ocrEngine = new OCREngine();

let cropViewInstance = null;
let cameraMediaStream = null;
let currentActiveScreen = 'screen-home';
let activeDocFilterCategory = 'All Docs';

document.addEventListener('DOMContentLoaded', () => {
    initCamScannerApp();
});

function initCamScannerApp() {
    setupTabNavigation();
    setupHeaderAndSearch();
    setupCategoryPills();
    setupBatchUploadHandlers();
    renderDocumentLibrary();

    setupCameraViewfinder();
    setupCropViewAndLoupe();
    setupFilterScreen();

    setupDocumentDetailScreen();
    setupPDFExportModal();

    setupIDCardScanner();
    setupPassportStudio();
    setupWatermarkAndSignature();
    setupOCR();
    setupToolsHub();
    setupProfileScreen();

    renderSuitSelector();
}

/**
 * -------------------------------------------------------------------------
 * BATCH / MULTI-FILE UPLOAD ENGINE
 * Automatically processes multiple images:
 * - Sobel edge detection & auto quad crop
 * - Auto brightness & shadow lifting
 * - CamScanner signature Magic Color filter
 * - Appends to target document or creates a new multi-page document
 * -------------------------------------------------------------------------
 */
function setupBatchUploadHandlers() {
    // Home screen batch upload
    const homeBatch = document.getElementById('cs-batch-upload-home');
    if (homeBatch) {
        homeBatch.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length) {
                handleBatchFileUpload(e.target.files);
                e.target.value = '';
            }
        });
    }

    // Home screen quick camera button
    const homeCamBtn = document.getElementById('cs-btn-home-camera');
    if (homeCamBtn) {
        homeCamBtn.addEventListener('click', () => {
            openCameraViewfinder('docs');
        });
    }
}

function handleBatchFileUpload(fileList, targetDocId = null) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) {
        alert('অনুগ্রহ করে এক বা একাধিক ছবি নির্বাচন করুন (Please select image files)');
        return;
    }

    const modal = document.getElementById('cs-batch-progress-modal');
    const bar = document.getElementById('cs-batch-progress-bar');
    const countEl = document.getElementById('cs-batch-progress-count');
    const titleEl = document.getElementById('cs-batch-progress-title');
    const subEl = document.getElementById('cs-batch-progress-sub');

    if (modal) modal.style.display = 'block';

    const processedPages = [];
    let currentIndex = 0;

    function processNext() {
        if (currentIndex >= files.length) {
            // Done processing all files!
            if (bar) bar.style.width = '100%';
            if (titleEl) titleEl.textContent = 'সকল ছবি সফলভাবে প্রসেস সম্পন্ন!';
            if (subEl) subEl.textContent = 'ডকুমেন্ট আপডেট হচ্ছে...';

            setTimeout(() => {
                if (modal) modal.style.display = 'none';

                if (targetDocId) {
                    const doc = csEngine.documents.find(d => d.id === targetDocId);
                    if (doc) {
                        processedPages.forEach(pData => doc.pages.push(pData));
                        doc.pageCount = doc.pages.length;
                        csEngine.saveToStorage();
                        openDocumentDetail(targetDocId);
                    }
                } else {
                    const newDoc = {
                        id: 'doc_' + Date.now(),
                        title: `CamScanner Batch ${new Date().toLocaleDateString('bn-BD')}`,
                        category: 'All Docs',
                        date: new Date().toLocaleDateString('bn-BD', { month: 'short', day: 'numeric', year: 'numeric' }),
                        pageCount: processedPages.length,
                        thumbnail: processedPages[0],
                        pages: processedPages
                    };
                    csEngine.documents.unshift(newDoc);
                    csEngine.saveToStorage();
                    openDocumentDetail(newDoc.id);
                }
            }, 450);
            return;
        }

        const file = files[currentIndex];
        const percent = Math.round(((currentIndex) / files.length) * 100);
        if (bar) bar.style.width = `${percent}%`;
        if (countEl) countEl.textContent = `${currentIndex + 1} / ${files.length}`;
        if (titleEl) titleEl.textContent = `ছবি প্রসেস হচ্ছে (${currentIndex + 1}/${files.length})...`;
        if (subEl) subEl.textContent = `${file.name} - অটো-ক্রপ ও ব্রাইটনেস অ্যাডজাস্ট`;

        const reader = new FileReader();
        reader.onload = (e) => {
            csEngine.autoProcessAndCropImage(e.target.result, (warpedCanvas) => {
                const dataUrl = warpedCanvas ? warpedCanvas.toDataURL('image/jpeg', 0.92) : e.target.result;
                processedPages.push(dataUrl);
                currentIndex++;
                processNext();
            });
        };
        reader.onerror = () => {
            currentIndex++;
            processNext();
        };
        reader.readAsDataURL(file);
    }

    processNext();
}

/**
 * -------------------------------------------------------------------------
 * 1. BOTTOM TAB BAR NAVIGATION
 * -------------------------------------------------------------------------
 */
function setupTabNavigation() {
    const tabItems = document.querySelectorAll('.cs-tab-item');
    tabItems.forEach(tab => {
        tab.addEventListener('click', () => {
            const screen = tab.dataset.screen;
            if (!screen) return;

            tabItems.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            navigateToScreen(screen);
        });
    });

    const fabCamera = document.getElementById('cs-fab-camera');
    if (fabCamera) {
        fabCamera.addEventListener('click', () => {
            openCameraViewfinder('docs');
        });
    }
}

function navigateToScreen(screenId) {
    currentActiveScreen = screenId;
    document.querySelectorAll('.cs-screen').forEach(scr => {
        scr.classList.remove('active');
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }

    // Toggle body class to hide tab bar in document detail mode so action bar is 100% visible
    document.body.classList.toggle('in-doc-detail', screenId === 'screen-doc-detail');

    if (screenId === 'screen-home') {
        renderDocumentLibrary();
    } else if (screenId === 'screen-passport') {
        updatePassportCanvasView();
    } else if (screenId === 'screen-idcard') {
        updateIDCardWorkflowView();
    }
}

/**
 * -------------------------------------------------------------------------
 * 2. APP HEADER, SEARCH & CATEGORY PILLS
 * -------------------------------------------------------------------------
 */
function setupHeaderAndSearch() {
    const searchInput = document.getElementById('cs-doc-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderDocumentLibrary(query);
        });
    }

    const themeBtn = document.getElementById('cs-btn-theme');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', next);
            themeBtn.innerHTML = next === 'dark' ? '🌙 ডার্ক' : '☀️ লাইট';
        });
    }

    const langBtn = document.getElementById('cs-btn-lang');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            currentLanguage = currentLanguage === 'bn' ? 'en' : 'bn';
            langBtn.innerHTML = currentLanguage === 'bn' ? '🌐 বাংলা' : '🌐 English';
        });
    }
}

function setupCategoryPills() {
    const pills = document.querySelectorAll('.cs-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            activeDocFilterCategory = pill.dataset.category;

            if (activeDocFilterCategory === 'ID Photo') {
                navigateToScreen('screen-passport');
            } else if (activeDocFilterCategory === 'ID Card') {
                navigateToScreen('screen-idcard');
            } else if (activeDocFilterCategory === 'Watermark') {
                navigateToScreen('screen-watermark');
            } else if (activeDocFilterCategory === 'OCR') {
                navigateToScreen('screen-ocr');
            } else {
                navigateToScreen('screen-home');
                renderDocumentLibrary();
            }
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 3. HOME DOCUMENT LIBRARY (GRID & LIST)
 * -------------------------------------------------------------------------
 */
function renderDocumentLibrary(filterQuery = '') {
    const container = document.getElementById('cs-docs-container');
    if (!container) return;

    let list = csEngine.documents;

    if (activeDocFilterCategory && activeDocFilterCategory !== 'All Docs') {
        list = list.filter(d => d.category === activeDocFilterCategory);
    }

    if (filterQuery) {
        list = list.filter(d => d.title.toLowerCase().includes(filterQuery));
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--cs-text-dim);">
                <div style="font-size: 48px; margin-bottom: 12px;">📁</div>
                <h3 style="font-size: 1.1rem; color: var(--cs-text-white);">কোনো ডকুমেন্ট পাওয়া যায়নি</h3>
                <p style="font-size: 0.85rem; margin-top: 6px;">নিচের ক্যামেরা বাটনে ক্লিক করে নতুন ডকুমেন্ট স্ক্যান করুন।</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(doc => `
        <div class="cs-doc-card" data-docid="${doc.id}">
            <div class="cs-doc-thumb">
                <img src="${doc.thumbnail}" alt="${doc.title}" />
                <div class="cs-page-badge">${doc.pageCount || 1} Page</div>
            </div>
            <div class="cs-doc-body">
                <div class="cs-doc-title">${doc.title}</div>
                <div class="cs-doc-meta">
                    <span>${doc.date}</span>
                    <span>${doc.category || 'Document'}</span>
                </div>
                <div class="cs-doc-actions">
                    <button class="cs-action-mini btn-open-doc" data-id="${doc.id}">📑 ওপেন করুন</button>
                    <button class="cs-action-mini btn-share-doc" data-id="${doc.id}">📤 PDF</button>
                    <button class="cs-action-mini btn-del-doc" data-id="${doc.id}" style="color:#ef4444;">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    // Open Document Detail Screen when clicking anywhere on the card
    container.querySelectorAll('.cs-doc-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-del-doc')) return;
            const docId = card.dataset.docid;
            openDocumentDetail(docId);
        });
    });

    // Share PDF directly
    container.querySelectorAll('.btn-share-doc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = btn.dataset.id;
            csEngine.currentDocId = docId;
            openPDFExportDialog(docId);
        });
    });

    // Delete Document
    container.querySelectorAll('.btn-del-doc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = btn.dataset.id;
            if (confirm('আপনি কি এই ডকুমেন্টটি মুছে ফেলতে চান?')) {
                csEngine.deleteDocument(docId);
                renderDocumentLibrary();
            }
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 4. AUTHENTIC DOCUMENT DETAIL & MULTI-PAGE PDF STUDIO
 * -------------------------------------------------------------------------
 */
function setupDocumentDetailScreen() {
    const backBtn = document.getElementById('btn-back-to-home');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            navigateToScreen('screen-home');
            renderDocumentLibrary();
        });
    }

    const titleInput = document.getElementById('docdetail-title');
    if (titleInput) {
        titleInput.addEventListener('change', (e) => {
            if (csEngine.currentDocId) {
                csEngine.renameDocument(csEngine.currentDocId, e.target.value);
            }
        });
    }

    // Add Page to Current Document
    const addPageBtn = document.getElementById('btn-doc-add-page');
    if (addPageBtn) {
        addPageBtn.addEventListener('click', () => {
            openCameraViewfinder('docs');
        });
    }

    // Batch Add Pages to Current Document
    const addPageUpload = document.getElementById('docdetail-add-page-upload');
    if (addPageUpload) {
        addPageUpload.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length) {
                handleBatchFileUpload(e.target.files, csEngine.currentDocId);
            }
        });
    }

    // PDF triggers
    document.getElementById('btn-open-pdf-dialog').addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });
    document.getElementById('btn-doc-pdf-trigger').addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });

    // Share Current Doc
    document.getElementById('btn-share-current-doc').addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });

    // OCR on Current Doc
    document.getElementById('btn-doc-ocr-trigger').addEventListener('click', () => {
        navigateToScreen('screen-ocr');
    });

    // Watermark
    document.getElementById('btn-doc-watermark-trigger').addEventListener('click', () => {
        navigateToScreen('screen-watermark');
    });

    // Signature
    document.getElementById('btn-doc-sign-trigger').addEventListener('click', () => {
        navigateToScreen('screen-watermark');
    });

    // Compress
    document.getElementById('btn-doc-compress-trigger').addEventListener('click', () => {
        if (!csEngine.currentDocId) return;
        csEngine.compressDocument(csEngine.currentDocId, 'high');
        alert('পিডিএফ ফাইল সাইজ সফলভাবে কম্প্রেস ও অপ্টিমাইজ করা হয়েছে!');
        openDocumentDetail(csEngine.currentDocId);
    });
}

function openDocumentDetail(docId) {
    csEngine.currentDocId = docId;
    const doc = csEngine.documents.find(d => d.id === docId);
    if (!doc) return;

    navigateToScreen('screen-doc-detail');

    const titleInput = document.getElementById('docdetail-title');
    if (titleInput) titleInput.value = doc.title;

    const counter = document.getElementById('docdetail-page-counter');
    if (counter) counter.textContent = `মোট পেজ: ${doc.pages.length}`;

    const container = document.getElementById('docdetail-pages-container');
    if (!container) return;

    container.innerHTML = doc.pages.map((pageSrc, idx) => `
        <div class="cs-docpage-card">
            <div class="cs-docpage-thumb">
                <img src="${pageSrc}" alt="Page ${idx + 1}" />
            </div>
            <div class="cs-docpage-footer">
                <span class="cs-docpage-num">পেজ ${idx + 1}</span>
                <div style="display:flex; gap:6px;">
                    <button class="cs-action-mini btn-recrop-page" data-idx="${idx}" title="ক্রপ ও ফিল্টার">✂️ এডিট</button>
                    <button class="cs-action-mini btn-del-page" data-idx="${idx}" style="color:#ef4444;" title="মুছে ফেলুন">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    // Page Delete
    container.querySelectorAll('.btn-del-page').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            if (confirm(`পেজ ${idx + 1} মুছে ফেলতে চান?`)) {
                csEngine.removePageFromCurrentDocument(idx);
                openDocumentDetail(docId);
            }
        });
    });

    // Re-crop / Edit Page
    container.querySelectorAll('.btn-recrop-page').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            openCropScreen(doc.pages[idx]);
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 5. DEDICATED CAMSCANNER PDF EXPORT MODAL
 * -------------------------------------------------------------------------
 */
function setupPDFExportModal() {
    const modal = document.getElementById('cs-pdf-export-modal');

    // Compression level pills
    document.querySelectorAll('input[name="pdf_compress"]').forEach(radio => {
        radio.parentElement.addEventListener('click', () => {
            document.querySelectorAll('input[name="pdf_compress"]').forEach(r => {
                r.parentElement.classList.remove('active');
            });
            radio.parentElement.classList.add('active');
            radio.checked = true;
        });
    });

    // Download PDF Button
    document.getElementById('btn-download-final-pdf').addEventListener('click', () => {
        const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId) || csEngine.documents[0];
        if (!doc) return;

        const qualityRadio = document.querySelector('input[name="pdf_compress"]:checked');
        const qualityMode = qualityRadio ? qualityRadio.value : 'original';
        let quality = 0.95;
        if (qualityMode === 'medium') quality = 0.75;
        if (qualityMode === 'low') quality = 0.55;

        const canvasList = doc.pages.map(dataUrl => {
            const c = document.createElement('canvas');
            const img = new Image();
            img.src = dataUrl;
            c.width = img.width || 800;
            c.height = img.height || 1100;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Re-encode at chosen quality
            const qUrl = c.toDataURL('image/jpeg', quality);
            const qImg = new Image();
            qImg.src = qUrl;
            const finalC = document.createElement('canvas');
            finalC.width = c.width;
            finalC.height = c.height;
            finalC.getContext('2d').drawImage(qImg, 0, 0);
            return finalC;
        });

        modal.classList.remove('active');
        PDFExporter.exportPagesToPDF(canvasList, `${doc.title}.pdf`, 'a4');
    });

    // Print Direct PDF Button
    document.getElementById('btn-print-direct-pdf').addEventListener('click', () => {
        const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId) || csEngine.documents[0];
        if (!doc) return;

        const canvasList = doc.pages.map(p => {
            const c = document.createElement('canvas');
            const im = new Image();
            im.src = p;
            c.width = 800; c.height = 1100;
            c.getContext('2d').drawImage(im, 0, 0);
            return c;
        });

        modal.classList.remove('active');
        PDFExporter.printCanvasListAsPDF(canvasList, doc.title);
    });
}

function openPDFExportDialog(docId) {
    const doc = csEngine.documents.find(d => d.id === docId) || csEngine.documents[0];
    if (!doc) return;

    csEngine.currentDocId = doc.id;
    const modal = document.getElementById('cs-pdf-export-modal');
    modal.classList.add('active');

    document.getElementById('pdf-doc-name-display').textContent = `${doc.title}.pdf`;
    document.getElementById('pdf-page-count-display').textContent = `${doc.pages.length} টি পেজ অন্তর্ভুক্ত`;

    // Estimate file size
    const estMb = ((doc.pages.length * 450) / 1024).toFixed(1);
    document.getElementById('pdf-est-size-display').textContent = `~${estMb} MB`;
}

/**
 * -------------------------------------------------------------------------
 * 6. AUTHENTIC 3-STEP ID CARD SCANNER WORKFLOW
 * -------------------------------------------------------------------------
 */
function setupIDCardScanner() {
    // Template selection (NID, Driver License, Passport)
    document.querySelectorAll('.cs-template-btn[data-tmpl]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cs-template-btn[data-tmpl]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tmpl = btn.dataset.tmpl;
            idCardScanner.setTemplate(tmpl);
            updateIDCardWorkflowView();
        });
    });

    // Camera open specifically for ID Card
    document.getElementById('btn-idcard-open-cam').addEventListener('click', () => {
        openCameraViewfinder('id_card');
    });

    // Step file upload
    const fileInput = document.getElementById('idcard-step-upload');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (idCardScanner.currentStep === 1) {
                    idCardScanner.setFrontImage(evt.target.result, () => {
                        updateIDCardWorkflowView();
                    });
                } else {
                    idCardScanner.setBackImage(evt.target.result, () => {
                        updateIDCardWorkflowView();
                    });
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Watermark text change
    const wmInput = document.getElementById('idcard-watermark-text');
    if (wmInput) {
        wmInput.addEventListener('input', (e) => {
            idCardScanner.antiTheftWatermark = e.target.value;
            updateIDCardA4Preview();
        });
    }

    // Layout mode
    const layoutSel = document.getElementById('idcard-layout-mode');
    if (layoutSel) {
        layoutSel.addEventListener('change', (e) => {
            idCardScanner.layout = e.target.value;
            updateIDCardA4Preview();
        });
    }

    // Filter mode
    const filterSel = document.getElementById('idcard-filter-mode');
    if (filterSel) {
        filterSel.addEventListener('change', (e) => {
            idCardScanner.filterMode = e.target.value;
            if (idCardScanner.frontCanvas) {
                idCardScanner.frontCanvas = idCardScanner.processCardImage(idCardScanner.frontCanvas);
            }
            if (idCardScanner.backCanvas) {
                idCardScanner.backCanvas = idCardScanner.processCardImage(idCardScanner.backCanvas);
            }
            updateIDCardA4Preview();
        });
    }

    // Download A4 PDF
    document.getElementById('btn-idcard-pdf-download').addEventListener('click', () => {
        const sheet = idCardScanner.generateA4Sheet();
        PDFExporter.exportPagesToPDF([sheet], `ID_Card_Copy_${idCardScanner.selectedTemplate}.pdf`, 'a4');
    });

    // Print A4 Sheet
    document.getElementById('btn-idcard-print').addEventListener('click', () => {
        const sheet = idCardScanner.generateA4Sheet();
        PDFExporter.printCanvasListAsPDF([sheet], 'ID Card Copy A4');
    });

    // Retake button
    document.getElementById('btn-idcard-retake').addEventListener('click', () => {
        idCardScanner.frontCanvas = null;
        idCardScanner.backCanvas = null;
        idCardScanner.currentStep = 1;
        updateIDCardWorkflowView();
    });
}

function updateIDCardWorkflowView() {
    const step1 = document.getElementById('idstep-1-indicator');
    const step2 = document.getElementById('idstep-2-indicator');
    const step3 = document.getElementById('idstep-3-indicator');
    const captureView = document.getElementById('idcard-capture-view');
    const a4View = document.getElementById('idcard-a4-view');
    const captureTitle = document.getElementById('idcard-capture-title');

    // Update Indicators
    step1.classList.toggle('active', idCardScanner.currentStep >= 1);
    step2.classList.toggle('active', idCardScanner.currentStep >= 2);
    step3.classList.toggle('active', idCardScanner.currentStep >= 3);

    // Front / Back preview thumbnails
    const frontBox = document.getElementById('idcard-front-preview-box');
    if (frontBox) {
        frontBox.innerHTML = idCardScanner.frontCanvas ?
            `<img src="${idCardScanner.frontCanvas.toDataURL()}" style="max-height:100%; max-width:100%; border-radius:4px;" />` :
            `<span style="font-size:0.75rem; color:#64748b;">খালি</span>`;
    }

    const backBox = document.getElementById('idcard-back-preview-box');
    if (backBox) {
        backBox.innerHTML = idCardScanner.backCanvas ?
            `<img src="${idCardScanner.backCanvas.toDataURL()}" style="max-height:100%; max-width:100%; border-radius:4px;" />` :
            `<span style="font-size:0.75rem; color:#64748b;">খালি</span>`;
    }

    if (idCardScanner.currentStep < 3) {
        captureView.style.display = 'block';
        a4View.style.display = 'none';

        if (idCardScanner.currentStep === 1) {
            captureTitle.textContent = 'কার্ডের সামনের পাতা ফ্রেমের মাঝে রাখুন (Front Side)';
        } else {
            captureTitle.textContent = 'কার্ডটি উল্টে পেছনের পাতা ফ্রেমের মাঝে রাখুন (Back Side)';
        }
    } else {
        // Step 3: Show A4 Preview & Anti-theft watermark settings!
        captureView.style.display = 'none';
        a4View.style.display = 'grid';
        updateIDCardA4Preview();
    }
}

function updateIDCardA4Preview() {
    const container = document.getElementById('idcard-a4-canvas-container');
    if (!container) return;

    const sheet = idCardScanner.generateA4Sheet();
    container.innerHTML = '';
    sheet.style.maxWidth = '100%';
    sheet.style.maxHeight = '520px';
    sheet.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    sheet.style.borderRadius = '4px';
    container.appendChild(sheet);
}

/**
 * -------------------------------------------------------------------------
 * 7. AUTHENTIC CAMERA VIEWFINDER WITH MODE CAROUSEL & AUTO-DETECTION
 * -------------------------------------------------------------------------
 */
let cameraDetectTimer = null;
let consecutiveDetections = 0;
let autoCaptureActive = true;

function setupCameraViewfinder() {
    const modal = document.getElementById('cs-camera-overlay');
    const video = document.getElementById('cs-camera-video');
    const shutterBtn = document.getElementById('cs-btn-shutter');
    const closeBtn = document.getElementById('cs-btn-close-camera');
    const importInput = document.getElementById('cs-camera-import-file');
    const faceGuide = document.getElementById('cs-biometric-face-guide');
    const autoCapBtn = document.getElementById('cs-btn-toggle-autocapture');

    // Auto-capture toggle button
    if (autoCapBtn) {
        autoCapBtn.addEventListener('click', () => {
            autoCaptureActive = !autoCaptureActive;
            autoCapBtn.classList.toggle('active', autoCaptureActive);
            autoCapBtn.textContent = autoCaptureActive ? '⚡ অটো-ক্যাপচার: চালু (ON)' : '⚡ অটো-ক্যাপচার: বন্ধ (OFF)';
            autoCapBtn.style.background = autoCaptureActive ? 'rgba(0,168,132,0.25)' : 'rgba(255,255,255,0.1)';
        });
    }

    const modeButtons = document.querySelectorAll('.cs-camera-mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.mode;
            csEngine.activeCameraMode = mode;

            if (faceGuide) {
                faceGuide.style.display = mode === 'id_photo' ? 'block' : 'none';
            }
            const liveFrame = document.getElementById('cs-camera-live-frame');
            if (liveFrame) {
                liveFrame.style.display = (mode === 'id_photo') ? 'none' : 'flex';
            }
        });
    });

    if (shutterBtn) {
        shutterBtn.addEventListener('click', () => {
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = video.videoWidth || 1280;
            snapCanvas.height = video.videoHeight || 720;
            const ctx = snapCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
            const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);

            closeCameraViewfinder();
            handleCapturedImage(dataUrl);
        });
    }

    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files || files.length === 0) return;
            closeCameraViewfinder();

            if (files.length > 1) {
                handleBatchFileUpload(files);
            } else {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    handleCapturedImage(evt.target.result);
                };
                reader.readAsDataURL(files[0]);
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeCameraViewfinder);
    }
}

function startCameraDetectionLoop() {
    stopCameraDetectionLoop();
    const video = document.getElementById('cs-camera-video');
    const liveFrame = document.getElementById('cs-camera-live-frame');
    const statusText = document.getElementById('cs-camera-status-text');
    if (!video) return;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 320;
    offCanvas.height = 240;
    const offCtx = offCanvas.getContext('2d');

    cameraDetectTimer = setInterval(() => {
        if (!cameraMediaStream || video.readyState < 2) return;

        // Run auto-detect in docs and id_card mode
        if (csEngine.activeCameraMode !== 'docs' && csEngine.activeCameraMode !== 'id_card') {
            if (liveFrame) liveFrame.classList.remove('detected');
            return;
        }

        try {
            offCtx.drawImage(video, 0, 0, 320, 240);
            const corners = ImageProcessor.detectDocumentCorners(offCanvas);
            const minX = Math.min(...corners.map(p => p.x));
            const maxX = Math.max(...corners.map(p => p.x));
            const minY = Math.min(...corners.map(p => p.y));
            const maxY = Math.max(...corners.map(p => p.y));
            const spanW = maxX - minX;
            const spanH = maxY - minY;

            if (spanW > 100 && spanH > 80) {
                consecutiveDetections++;
                if (liveFrame) liveFrame.classList.add('detected');
                if (statusText) statusText.textContent = `ডকুমেন্ট শনাক্ত হয়েছে (${consecutiveDetections}/3)... স্থির রাখুন`;

                if (autoCaptureActive && consecutiveDetections >= 3) {
                    consecutiveDetections = 0;
                    if (statusText) statusText.textContent = `✓ স্ক্যান সম্পন্ন হচ্ছে...`;
                    stopCameraDetectionLoop();
                    const shutterBtn = document.getElementById('cs-btn-shutter');
                    if (shutterBtn) shutterBtn.click();
                }
            } else {
                consecutiveDetections = Math.max(0, consecutiveDetections - 1);
                if (liveFrame) liveFrame.classList.remove('detected');
                if (statusText) statusText.textContent = `স্বয়ংক্রিয় ফ্রেম ডিটেকশন চালু (Auto-Detect Active)`;
            }
        } catch (e) {
            // Frame processing catch
        }
    }, 350);
}

function stopCameraDetectionLoop() {
    if (cameraDetectTimer) {
        clearInterval(cameraDetectTimer);
        cameraDetectTimer = null;
    }
    consecutiveDetections = 0;
}

function openCameraViewfinder(defaultMode = 'docs') {
    const modal = document.getElementById('cs-camera-overlay');
    const video = document.getElementById('cs-camera-video');
    const faceGuide = document.getElementById('cs-biometric-face-guide');
    const liveFrame = document.getElementById('cs-camera-live-frame');

    csEngine.activeCameraMode = defaultMode;
    document.querySelectorAll('.cs-camera-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === defaultMode);
    });

    if (faceGuide) {
        faceGuide.style.display = defaultMode === 'id_photo' ? 'block' : 'none';
    }
    if (liveFrame) {
        liveFrame.style.display = defaultMode === 'id_photo' ? 'none' : 'flex';
        liveFrame.classList.remove('detected');
    }

    navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: defaultMode === 'id_photo' ? 'user' : 'environment'
        }
    }).then(stream => {
        cameraMediaStream = stream;
        video.srcObject = stream;
        video.play();
        modal.classList.add('active');
        startCameraDetectionLoop();
    }).catch(err => {
        document.getElementById('cs-camera-import-file').click();
    });
}

function closeCameraViewfinder() {
    stopCameraDetectionLoop();
    if (cameraMediaStream) {
        cameraMediaStream.getTracks().forEach(t => t.stop());
        cameraMediaStream = null;
    }
    const modal = document.getElementById('cs-camera-overlay');
    if (modal) modal.classList.remove('active');
}

function handleCapturedImage(dataUrl) {
    if (csEngine.activeCameraMode === 'id_photo') {
        navigateToScreen('screen-passport');
        passportStudio.loadImage(dataUrl, () => {
            document.getElementById('passport-empty-state').style.display = 'none';
            document.getElementById('passport-canvas').style.display = 'block';
            updatePassportCanvasView();
        });
    } else if (csEngine.activeCameraMode === 'id_card') {
        navigateToScreen('screen-idcard');
        if (idCardScanner.currentStep === 1) {
            idCardScanner.setFrontImage(dataUrl, () => {
                updateIDCardWorkflowView();
            });
        } else {
            idCardScanner.setBackImage(dataUrl, () => {
                updateIDCardWorkflowView();
            });
        }
    } else if (csEngine.activeCameraMode === 'book') {
        csEngine.splitBookPages(dataUrl, (leftCanvas, rightCanvas) => {
            csEngine.processedCanvas = leftCanvas;
            csEngine.saveActivePageToLibrary('Book Scan - Left Page');
            csEngine.processedCanvas = rightCanvas;
            const doc = csEngine.saveActivePageToLibrary('Book Scan - Right Page');
            openDocumentDetail(doc.id);
            alert('বইয়ের দুটি পেজ সফলভাবে আলাদা করে সংরক্ষণ করা হয়েছে!');
        });
    } else {
        openCropScreen(dataUrl);
    }
}

/**
 * -------------------------------------------------------------------------
 * 8. 8-POINT INTELLIGENT CROP VIEW & MAGNIFYING LOUPE
 * -------------------------------------------------------------------------
 */
function setupCropViewAndLoupe() {
    const canvas = document.getElementById('cs-crop-canvas');
    const loupe = document.getElementById('cs-crop-loupe');
    if (!canvas) return;

    cropViewInstance = new CropView(canvas, loupe);

    document.getElementById('cs-btn-crop-auto').addEventListener('click', () => {
        csEngine.autoDetectCrop();
        cropViewInstance.render();
    });

    document.getElementById('cs-btn-crop-all').addEventListener('click', () => {
        csEngine.fullPageCrop();
        cropViewInstance.render();
    });

    document.getElementById('cs-btn-crop-rotate').addEventListener('click', () => {
        csEngine.rotateCropImage();
        setTimeout(() => cropViewInstance.render(), 100);
    });

    document.getElementById('cs-btn-crop-done').addEventListener('click', () => {
        closeCropScreen();
        const warpedCanvas = csEngine.executeCrop();
        openFilterScreen(warpedCanvas);
    });

    document.getElementById('cs-btn-crop-close').addEventListener('click', closeCropScreen);
}

function openCropScreen(imageSrc) {
    const screen = document.getElementById('cs-crop-screen');
    csEngine.startNewScan(imageSrc, () => {
        screen.classList.add('active');
        cropViewInstance.setEngine(csEngine);
    });
}

function closeCropScreen() {
    const screen = document.getElementById('cs-crop-screen');
    if (screen) screen.classList.remove('active');
}

/**
 * -------------------------------------------------------------------------
 * 9. FILTER & ENHANCEMENT SCREEN (Exact CamScanner Signature Filters)
 * -------------------------------------------------------------------------
 */
function setupFilterScreen() {
    const screen = document.getElementById('cs-filter-screen');
    const filterCards = document.querySelectorAll('.cs-filter-thumb-card');

    filterCards.forEach(card => {
        card.addEventListener('click', () => {
            filterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const filterName = card.dataset.filter;
            csEngine.applyFilter(filterName);
            renderFilterCanvasPreview();
        });
    });

    const handleSaveAndOpen = () => {
        const titleInput = document.getElementById('cs-doc-title-input');
        const title = titleInput ? titleInput.value : null;

        const savedDoc = csEngine.saveActivePageToLibrary(title);
        closeFilterScreen();
        openDocumentDetail(savedDoc.id);
    };

    // Save & Done button on topbar
    const doneBtn = document.getElementById('cs-btn-filter-done');
    if (doneBtn) doneBtn.addEventListener('click', handleSaveAndOpen);

    // Next & Save button on bottombar
    const nextBtn = document.getElementById('cs-btn-filter-next');
    if (nextBtn) nextBtn.addEventListener('click', handleSaveAndOpen);

    // Recrop button on bottombar
    const recropBtn = document.getElementById('cs-btn-filter-recrop');
    if (recropBtn) {
        recropBtn.addEventListener('click', () => {
            closeFilterScreen();
            if (csEngine.currentImage) {
                openCropScreen(csEngine.currentImage.src);
            }
        });
    }

    const backBtn = document.getElementById('cs-btn-filter-back');
    if (backBtn) backBtn.addEventListener('click', closeFilterScreen);
}

function openFilterScreen(canvas) {
    const screen = document.getElementById('cs-filter-screen');
    screen.classList.add('active');
    renderFilterCanvasPreview();
}

function renderFilterCanvasPreview() {
    const container = document.getElementById('cs-filter-viewport-wrap');
    if (!container || !csEngine.processedCanvas) return;

    container.innerHTML = '';
    const canvas = csEngine.processedCanvas;
    canvas.style.maxWidth = '95%';
    canvas.style.maxHeight = '95%';
    canvas.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    canvas.style.borderRadius = '4px';
    container.appendChild(canvas);
}

function closeFilterScreen() {
    const screen = document.getElementById('cs-filter-screen');
    if (screen) screen.classList.remove('active');
}

/**
 * -------------------------------------------------------------------------
 * 10. PASSPORT & ID PHOTO STUDIO (The Requested Star Feature)
 * -------------------------------------------------------------------------
 */
function setupPassportStudio() {
    const uploadInput = document.getElementById('passport-upload');
    const previewCanvas = document.getElementById('passport-canvas');

    const presetSelect = document.getElementById('passport-preset-select');
    if (presetSelect) {
        presetSelect.innerHTML = PASSPORT_PRESETS.map(p =>
            `<option value="${p.id}">${p.country} - ${p.name_bn}</option>`
        ).join('');

        presetSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const customWrap = document.getElementById('custom-size-inputs');
            if (val === 'custom') {
                customWrap.style.display = 'grid';
            } else {
                customWrap.style.display = 'none';
                passportStudio.setPreset(val);
                updatePassportCanvasView();
            }
        });
    }

    const customApply = () => {
        const w = parseFloat(document.getElementById('custom-width').value) || 35;
        const h = parseFloat(document.getElementById('custom-height').value) || 45;
        passportStudio.setPreset('custom', w, h);
        updatePassportCanvasView();
    };
    const cWidth = document.getElementById('custom-width');
    const cHeight = document.getElementById('custom-height');
    if (cWidth) cWidth.addEventListener('input', customApply);
    if (cHeight) cHeight.addEventListener('input', customApply);

    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                passportStudio.loadImage(evt.target.result, () => {
                    document.getElementById('passport-empty-state').style.display = 'none';
                    previewCanvas.style.display = 'block';
                    updatePassportCanvasView();
                });
            };
            reader.readAsDataURL(file);
        });
    }

    const btnPassCam = document.getElementById('btn-passport-camera');
    if (btnPassCam) {
        btnPassCam.addEventListener('click', () => {
            openCameraViewfinder('id_photo');
        });
    }

    const bindSlider = (id, property) => {
        const el = document.getElementById(id);
        const valDisplay = document.getElementById(`${id}-val`);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            passportStudio.state[property] = v;
            if (valDisplay) valDisplay.textContent = v;
            updatePassportCanvasView();
        });
    };

    bindSlider('passport-zoom', 'scale');
    bindSlider('passport-rotate', 'rotation');
    bindSlider('passport-brightness', 'brightness');
    bindSlider('passport-contrast', 'contrast');
    bindSlider('passport-smooth', 'skinSmoothing');

    document.querySelectorAll('.passport-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('.passport-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            passportStudio.state.bgColor = dot.dataset.color;
            updatePassportCanvasView();
        });
    });

    const customCol = document.getElementById('passport-custom-color');
    if (customCol) {
        customCol.addEventListener('input', (e) => {
            passportStudio.state.bgColor = e.target.value;
            updatePassportCanvasView();
        });
    }

    const guideToggle = document.getElementById('toggle-guidelines');
    if (guideToggle) {
        guideToggle.addEventListener('change', (e) => {
            passportStudio.state.showBiometricGuide = e.target.checked;
            updatePassportCanvasView();
        });
    }

    const magicBgBtn = document.getElementById('btn-magic-bg');
    if (magicBgBtn) {
        magicBgBtn.addEventListener('click', () => {
            if (!passportStudio.rawImage) {
                alert('অনুগ্রহ করে প্রথমে একটি ছবি আপলোড করুন!');
                return;
            }
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = passportStudio.rawImage.width;
            tempCanvas.height = passportStudio.rawImage.height;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(passportStudio.rawImage, 0, 0);

            const tol = parseInt(document.getElementById('bg-tolerance').value) || 35;
            ImageProcessor.replaceBackground(tempCanvas, passportStudio.state.bgColor, tol);

            passportStudio.loadImage(tempCanvas.toDataURL('image/png'), () => {
                updatePassportCanvasView();
            });
        });
    }

    if (previewCanvas) {
        setupCanvasInteractions(previewCanvas);
    }

    const btnDlSingle = document.getElementById('btn-download-single');
    if (btnDlSingle) {
        btnDlSingle.addEventListener('click', () => {
            const photo = passportStudio.renderCroppedPhoto();
            if (!photo) return;
            PDFExporter.downloadCanvasImage(photo, `Passport_Photo_${passportStudio.currentPreset.id}.png`, 'image/png');
        });
    }

    const btnPreviewSheet = document.getElementById('btn-preview-sheet');
    if (btnPreviewSheet) {
        btnPreviewSheet.addEventListener('click', () => {
            if (!passportStudio.rawImage) {
                alert('প্রথমে একটি ছবি আপলোড করুন!');
                return;
            }
            document.getElementById('print-modal').classList.add('active');
            renderPrintSheetModal();
        });
    }

    document.getElementById('sheet-paper-size').addEventListener('change', (e) => {
        passportStudio.printState.paperSize = e.target.value;
        renderPrintSheetModal();
    });
    document.getElementById('sheet-photo-count').addEventListener('change', (e) => {
        passportStudio.printState.photoCount = parseInt(e.target.value);
        renderPrintSheetModal();
    });
    document.getElementById('sheet-cut-lines').addEventListener('change', (e) => {
        passportStudio.printState.showCutLines = e.target.checked;
        renderPrintSheetModal();
    });
    document.getElementById('sheet-border').addEventListener('change', (e) => {
        passportStudio.printState.hasBorder = e.target.checked;
        renderPrintSheetModal();
    });

    document.getElementById('btn-download-sheet-img').addEventListener('click', () => {
        const sheet = passportStudio.generatePrintSheet();
        if (!sheet) return;
        PDFExporter.downloadCanvasImage(sheet, `Print_Sheet_${passportStudio.printState.paperSize}.jpg`, 'image/jpeg', 0.95);
    });

    document.getElementById('btn-download-sheet-pdf').addEventListener('click', () => {
        const sheet = passportStudio.generatePrintSheet();
        if (!sheet) return;
        PDFExporter.exportPagesToPDF([sheet], `Passport_Print_Sheet_${passportStudio.printState.paperSize}.pdf`, passportStudio.printState.paperSize === 'A4' ? 'a4' : [102, 152]);
    });
}

function updatePassportCanvasView() {
    const previewCanvas = document.getElementById('passport-canvas');
    if (!previewCanvas || !passportStudio.rawImage) return;

    const cropped = passportStudio.renderCroppedPhoto();
    if (!cropped) return;

    previewCanvas.width = cropped.width;
    previewCanvas.height = cropped.height;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(cropped, 0, 0);

    passportStudio.drawBiometricGuidelines(ctx, previewCanvas.width, previewCanvas.height);

    const dimBadge = document.getElementById('passport-dimensions-badge');
    if (dimBadge) {
        dimBadge.textContent = `${passportStudio.currentPreset.widthMm} × ${passportStudio.currentPreset.heightMm} mm | ${cropped.width} × ${cropped.height} px (300 DPI)`;
    }
}

function renderSuitSelector() {
    const container = document.getElementById('suits-container');
    if (!container) return;

    container.innerHTML = SUIT_TEMPLATES.map(suit => `
        <div class="suit-card ${passportStudio.state.selectedSuit === suit.id ? 'active' : ''}" data-suit="${suit.id}">
            <div class="suit-thumb">
                ${suit.svg ? suit.svg : '<div style="font-size:24px;">🚫</div>'}
            </div>
            <span>${currentLanguage === 'bn' ? suit.name_bn : suit.name_en}</span>
        </div>
    `).join('');

    container.querySelectorAll('.suit-card').forEach(card => {
        card.addEventListener('click', () => {
            container.querySelectorAll('.suit-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            passportStudio.state.selectedSuit = card.dataset.suit;

            const suitControls = document.getElementById('suit-adjust-controls');
            if (suitControls) {
                suitControls.style.display = card.dataset.suit === 'none' ? 'none' : 'flex';
            }
            updatePassportCanvasView();
        });
    });

    const suitScaleSlider = document.getElementById('suit-scale');
    if (suitScaleSlider) {
        suitScaleSlider.addEventListener('input', (e) => {
            passportStudio.state.suitState.scale = parseFloat(e.target.value);
            updatePassportCanvasView();
        });
    }

    const suitYSlider = document.getElementById('suit-y-pos');
    if (suitYSlider) {
        suitYSlider.addEventListener('input', (e) => {
            const h = passportStudio.getPixelHeight();
            passportStudio.state.suitState.y = h * (parseFloat(e.target.value) / 100);
            updatePassportCanvasView();
        });
    }
}

function renderPrintSheetModal() {
    const sheetCanvas = passportStudio.generatePrintSheet();
    const container = document.getElementById('print-sheet-preview-wrap');
    if (!sheetCanvas || !container) return;

    container.innerHTML = '';
    sheetCanvas.style.maxWidth = '100%';
    sheetCanvas.style.maxHeight = '450px';
    sheetCanvas.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    container.appendChild(sheetCanvas);
}

function setupCanvasInteractions(canvas) {
    let isDown = false;
    let startX = 0, startY = 0;

    const onStart = (clientX, clientY) => {
        isDown = true;
        startX = clientX;
        startY = clientY;
    };

    const onMove = (clientX, clientY) => {
        if (!isDown || !passportStudio.rawImage) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        passportStudio.state.offsetX += dx;
        passportStudio.state.offsetY += dy;

        startX = clientX;
        startY = clientY;
        updatePassportCanvasView();
    };

    const onEnd = () => { isDown = false; };

    canvas.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', onEnd);
}

/**
 * -------------------------------------------------------------------------
 * 11. WATERMARK & SIGNATURE STUDIO
 * -------------------------------------------------------------------------
 */
function setupWatermarkAndSignature() {
    const sigPad = document.getElementById('signature-pad');
    if (sigPad) {
        watermarkStudio.initSignaturePad(sigPad);
    }

    document.getElementById('btn-clear-sig').addEventListener('click', () => {
        watermarkStudio.clearSignature();
    });

    document.querySelectorAll('.pen-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('.pen-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            watermarkStudio.penColor = dot.dataset.color;
        });
    });

    document.getElementById('sig-pen-size').addEventListener('input', (e) => {
        watermarkStudio.penSize = parseInt(e.target.value);
    });

    document.getElementById('btn-apply-watermark').addEventListener('click', () => {
        const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId) || csEngine.documents[0];
        if (!doc) {
            alert('দয়া করে প্রথমে একটি ডকুমেন্ট স্ক্যান করুন!');
            return;
        }

        const text = document.getElementById('watermark-text').value;
        const opacity = parseFloat(document.getElementById('watermark-opacity').value);
        const color = document.getElementById('watermark-color').value;
        const repeat = document.getElementById('watermark-repeat').checked;

        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            WatermarkSignatureStudio.applyWatermark(c, text, { opacity, color, repeat });
            doc.pages[0] = c.toDataURL('image/jpeg', 0.9);
            doc.thumbnail = doc.pages[0];
            csEngine.saveToStorage();
            alert('ওয়াটারমার্ক সফলভাবে যুক্ত হয়েছে!');
            openDocumentDetail(doc.id);
        };
        img.src = doc.pages[0];
    });

    document.getElementById('btn-stamp-signature').addEventListener('click', () => {
        const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId) || csEngine.documents[0];
        if (!doc) {
            alert('দয়া করে প্রথমে একটি ডকুমেন্ট স্ক্যান করুন!');
            return;
        }

        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const sigW = Math.round(c.width * 0.28);
            const sigH = Math.round(sigW * (sigPad.height / sigPad.width));
            const posX = c.width - sigW - 40;
            const posY = c.height - sigH - 40;

            ctx.drawImage(sigPad, posX, posY, sigW, sigH);
            doc.pages[0] = c.toDataURL('image/jpeg', 0.9);
            doc.thumbnail = doc.pages[0];
            csEngine.saveToStorage();
            alert('স্বাক্ষর ডকুমেন্টে স্ট্যাম্প করা হয়েছে!');
            openDocumentDetail(doc.id);
        };
        img.src = doc.pages[0];
    });
}

/**
 * -------------------------------------------------------------------------
 * 12. OCR TEXT EXTRACTION
 * -------------------------------------------------------------------------
 */
function setupOCR() {
    const ocrBtn = document.getElementById('btn-run-ocr');
    const ocrOutput = document.getElementById('ocr-output');
    const progressBar = document.getElementById('ocr-progress-bar');
    const copyBtn = document.getElementById('btn-copy-ocr');

    if (!ocrBtn) return;

    ocrBtn.addEventListener('click', async () => {
        const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId) || csEngine.documents[0];
        if (!doc) {
            alert('দয়া করে প্রথমে একটি ডকুমেন্ট স্ক্যান করুন!');
            return;
        }

        progressBar.style.display = 'block';
        progressBar.style.width = '20%';
        ocrBtn.disabled = true;
        ocrBtn.innerHTML = '⏳ টেক্সট রিকগনিশন চলছে...';

        const img = new Image();
        img.onload = async () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);

            try {
                const text = await ocrEngine.recognizeText(c, 'eng', (progress) => {
                    progressBar.style.width = `${Math.round(progress.progress * 100)}%`;
                });
                ocrOutput.value = text;
            } catch (err) {
                ocrOutput.value = 'OCR সম্পন্ন করার সময় সমস্যা হয়েছে।';
            } finally {
                ocrBtn.disabled = false;
                ocrBtn.innerHTML = '🔍 টেক্সট এক্সট্রাক্ট করুন (Run OCR)';
                setTimeout(() => { progressBar.style.display = 'none'; }, 800);
            }
        };
        img.src = doc.pages[0];
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (!ocrOutput.value) return;
            navigator.clipboard.writeText(ocrOutput.value).then(() => {
                const orig = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅ কপি সম্পন্ন!';
                setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
            });
        });
    }

    document.getElementById('btn-download-ocr-txt').addEventListener('click', () => {
        if (!ocrOutput.value) return;
        const blob = new Blob([ocrOutput.value], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Extracted_Document_Text.txt';
        a.click();
        URL.revokeObjectURL(url);
    });
}

/**
 * -------------------------------------------------------------------------
 * 13. TOOLS HUB (25+ CamScanner Features)
 * -------------------------------------------------------------------------
 */
function setupToolsHub() {
    document.querySelectorAll('.cs-tool-item').forEach(tool => {
        tool.addEventListener('click', () => {
            const action = tool.dataset.action;
            switch (action) {
                case 'tool-idphoto':
                    navigateToScreen('screen-passport');
                    break;
                case 'tool-idcard':
                    navigateToScreen('screen-idcard');
                    break;
                case 'tool-camera-doc':
                    openCameraViewfinder('docs');
                    break;
                case 'tool-book':
                    openCameraViewfinder('book');
                    break;
                case 'tool-watermark':
                    navigateToScreen('screen-watermark');
                    break;
                case 'tool-ocr':
                    navigateToScreen('screen-ocr');
                    break;
                case 'tool-compress':
                    if (csEngine.documents.length === 0) {
                        alert('কম্প্রেস করার মতো কোনো ডকুমেন্ট নেই!');
                        return;
                    }
                    csEngine.compressDocument(csEngine.documents[0].id, 'high');
                    alert('PDF সফলভাবে উচ্চ হারে কম্প্রেস করা হয়েছে!');
                    break;
                case 'tool-pdfmerge':
                    if (csEngine.documents.length === 0) {
                        alert('প্রথমে এক বা একাধিক ডকুমেন্ট স্ক্যান করুন!');
                        return;
                    }
                    const allPages = [];
                    csEngine.documents.forEach(d => {
                        d.pages.forEach(p => {
                            const c = document.createElement('canvas');
                            const im = new Image();
                            im.src = p;
                            c.width = 800; c.height = 1100;
                            c.getContext('2d').drawImage(im, 0, 0);
                            allPages.push(c);
                        });
                    });
                    PDFExporter.exportPagesToPDF(allPages, 'Merged_CamScanner_Docs.pdf', 'a4');
                    break;
                default:
                    openCameraViewfinder('docs');
            }
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 14. ME / PROFILE & APP SETTINGS
 * -------------------------------------------------------------------------
 */
function setupProfileScreen() {
    const docCountBadge = document.getElementById('me-doc-count');
    if (docCountBadge) {
        docCountBadge.textContent = `${csEngine.documents.length} টি ডকুমেন্ট সংরক্ষিত`;
    }
}

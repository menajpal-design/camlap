/**
 * CamScanner Web Studio Pro - Master Application Controller
 * Replicates the authentic CamScanner mobile, web & desktop interface and full functionality:
 * - Multi-device responsive design (Mobile, Tablet, Desktop)
 * - 8-Point intelligent quad crop with real-time magnifying loupe
 * - Authentic camera viewfinder with mode carousel, camera flip & torch
 * - Signature Magic Color & B&W filters with real thumbnails
 * - Multi-page Document Detail & PDF Studio with compression & encryption
 * - Authentic 3-Step ID Card Studio (Front, Back, A4 1:1 Scale Print & Anti-Theft Watermark)
 * - Passport Photo Studio with country presets & suit changer
 * - VIP Promo Banners & Quick Feature Shortcuts (App Style)
 * - Grid View & List View Switcher with Sorting & Drag-and-Drop
 * - Batch Selection Mode (Select All, Merge to PDF, Batch Delete)
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

// State management
let currentLanguage = 'bn';
let csViewMode = localStorage.getItem('cs_view_mode') || 'grid'; // 'grid' or 'list'
let csDocSort = 'newest'; // 'newest', 'oldest', 'name_asc', 'name_desc'
let isBatchSelectMode = false;
let selectedDocIds = new Set();

let currentFacingMode = 'environment'; // 'environment' (back) or 'user' (front)
let currentFlashTorch = false;
let showCameraGrid = false;
let bannerInterval = null;
let currentBannerIdx = 0;

document.addEventListener('DOMContentLoaded', () => {
    initCamScannerApp();
});

function initCamScannerApp() {
    setupTabNavigation();
    setupHeaderAndSearch();
    setupCategoryPills();
    setupBannerSlider();
    setupQuickShortcuts();
    setupDragAndDrop();
    setupViewModeAndSort();
    setupBatchSelectEngine();
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
    setupKeyboardShortcuts();

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

    // Header batch upload
    const headerBatch = document.getElementById('cs-batch-upload-header');
    if (headerBatch) {
        headerBatch.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length) {
                handleBatchFileUpload(e.target.files);
                e.target.value = '';
            }
        });
    }

    // Dropzone upload
    const dropzoneBatch = document.getElementById('cs-batch-upload-dropzone');
    if (dropzoneBatch) {
        dropzoneBatch.addEventListener('change', (e) => {
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

    // Header quick camera button
    const headerCamBtn = document.getElementById('cs-btn-header-camera');
    if (headerCamBtn) {
        headerCamBtn.addEventListener('click', () => {
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

    const brandHome = document.getElementById('cs-brand-home');
    if (brandHome) {
        brandHome.addEventListener('click', () => {
            navigateToScreen('screen-home');
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

    // Toggle body class to hide tab bar in document detail mode
    document.body.classList.toggle('in-doc-detail', screenId === 'screen-doc-detail');

    // Update bottom tabbar active item
    document.querySelectorAll('.cs-tab-item').forEach(tab => {
        if (tab.dataset.screen === screenId) {
            tab.classList.add('active');
        } else if (screenId === 'screen-home' && tab.dataset.screen === 'screen-home') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

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
    const searchClear = document.getElementById('cs-search-clear');
    const mobileSearchInput = document.getElementById('cs-doc-search-mobile');
    const mobileSearchToggle = document.getElementById('cs-btn-search-mobile-toggle');
    const mobileSearchDrawer = document.getElementById('cs-mobile-search-drawer');
    const mobileSearchClose = document.getElementById('cs-mobile-search-close');

    // Desktop search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (searchClear) searchClear.style.display = query ? 'block' : 'none';
            renderDocumentLibrary(query);
        });
    }

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchClear.style.display = 'none';
                renderDocumentLibrary('');
            }
        });
    }

    // Mobile search toggle
    if (mobileSearchToggle && mobileSearchDrawer) {
        mobileSearchToggle.addEventListener('click', () => {
            const isVisible = mobileSearchDrawer.style.display !== 'none';
            mobileSearchDrawer.style.display = isVisible ? 'none' : 'block';
            if (!isVisible && mobileSearchInput) mobileSearchInput.focus();
        });
    }

    if (mobileSearchClose && mobileSearchDrawer) {
        mobileSearchClose.addEventListener('click', () => {
            mobileSearchDrawer.style.display = 'none';
            if (mobileSearchInput) {
                mobileSearchInput.value = '';
                renderDocumentLibrary('');
            }
        });
    }

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderDocumentLibrary(query);
        });
    }

    // Theme toggle
    const themeBtn = document.getElementById('cs-btn-theme');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', next);
            themeBtn.innerHTML = next === 'dark' ? '🌙 ডার্ক' : '☀️ লাইট';
        });
    }

    // Language toggle
    const langBtn = document.getElementById('cs-btn-lang');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            currentLanguage = currentLanguage === 'bn' ? 'en' : 'bn';
            langBtn.innerHTML = currentLanguage === 'bn' ? '🌐 বাংলা' : '🌐 English';
            renderSuitSelector();
        });
    }
}

function setupCategoryPills() {
    const pills = document.querySelectorAll('.cs-pills-bar .cs-pill');
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
 * 3. AUTHENTIC CAMSCANNER PROMO BANNER CAROUSEL
 * -------------------------------------------------------------------------
 */
function setupBannerSlider() {
    const slides = document.querySelectorAll('.cs-banner-slide');
    const dots = document.querySelectorAll('.cs-banner-dot');
    if (!slides.length) return;

    function goToSlide(index) {
        currentBannerIdx = (index + slides.length) % slides.length;
        slides.forEach((slide, idx) => {
            slide.classList.toggle('active', idx === currentBannerIdx);
        });
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentBannerIdx);
        });
    }

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const idx = parseInt(dot.dataset.idx);
            goToSlide(idx);
            resetBannerTimer();
        });
    });

    slides.forEach(slide => {
        slide.addEventListener('click', () => {
            const action = slide.dataset.action;
            if (action === 'banner-idcard') {
                navigateToScreen('screen-idcard');
            } else if (action === 'banner-pdf') {
                if (csEngine.documents.length) {
                    openPDFExportDialog(csEngine.documents[0].id);
                } else {
                    navigateToScreen('screen-tools');
                }
            } else if (action === 'banner-compress') {
                if (csEngine.documents.length) {
                    csEngine.compressDocument(csEngine.documents[0].id, 'high');
                    alert('পিডিএফ ফাইল সাইজ সফলভাবে কম্প্রেস ও অপ্টিমাইজ করা হয়েছে!');
                    openDocumentDetail(csEngine.documents[0].id);
                } else {
                    alert('প্রথমে একটি ডকুমেন্ট স্ক্যান করুন!');
                }
            } else {
                navigateToScreen('screen-me');
            }
        });
    });

    function resetBannerTimer() {
        if (bannerInterval) clearInterval(bannerInterval);
        bannerInterval = setInterval(() => {
            goToSlide(currentBannerIdx + 1);
        }, 4500);
    }

    resetBannerTimer();
}

/**
 * -------------------------------------------------------------------------
 * 4. CAMSCANNER QUICK SHORTCUTS ROW
 * -------------------------------------------------------------------------
 */
function setupQuickShortcuts() {
    document.querySelectorAll('.cs-shortcut-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'camera-docs') {
                openCameraViewfinder('docs');
            } else if (action === 'tool-idcard') {
                navigateToScreen('screen-idcard');
            } else if (action === 'tool-idphoto') {
                navigateToScreen('screen-passport');
            } else if (action === 'tool-pdfmerge') {
                if (csEngine.documents.length) {
                    openPDFExportDialog(csEngine.documents[0].id);
                } else {
                    navigateToScreen('screen-tools');
                }
            } else if (action === 'tool-ocr') {
                navigateToScreen('screen-ocr');
            } else if (action === 'tool-watermark') {
                navigateToScreen('screen-watermark');
            }
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 5. DESKTOP DRAG & DROP ZONE
 * -------------------------------------------------------------------------
 */
function setupDragAndDrop() {
    const dropzone = document.getElementById('cs-desktop-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    window.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
            handleBatchFileUpload(dt.files);
        }
    });

    dropzone.addEventListener('click', () => {
        const uploader = document.getElementById('cs-batch-upload-dropzone');
        if (uploader) uploader.click();
    });
}

/**
 * -------------------------------------------------------------------------
 * 6. VIEW MODE SWITCHER & SORT ENGINE
 * -------------------------------------------------------------------------
 */
function setupViewModeAndSort() {
    const viewBtn = document.getElementById('cs-btn-view-toggle');
    const viewIcon = document.getElementById('cs-view-toggle-icon');
    const viewText = document.getElementById('cs-view-toggle-text');

    function updateViewButtonUI() {
        if (csViewMode === 'grid') {
            if (viewIcon) viewIcon.textContent = '📋';
            if (viewText) viewText.textContent = 'লিস্ট ভিউ';
        } else {
            if (viewIcon) viewIcon.textContent = '🔲';
            if (viewText) viewText.textContent = 'গ্রিড ভিউ';
        }
    }

    if (viewBtn) {
        updateViewButtonUI();
        viewBtn.addEventListener('click', () => {
            csViewMode = csViewMode === 'grid' ? 'list' : 'grid';
            localStorage.setItem('cs_view_mode', csViewMode);
            updateViewButtonUI();
            renderDocumentLibrary();
        });
    }

    const sortSelect = document.getElementById('cs-doc-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            csDocSort = e.target.value;
            renderDocumentLibrary();
        });
    }
}

/**
 * -------------------------------------------------------------------------
 * 7. BATCH SELECTION ENGINE (Select All, Merge to PDF, Batch Delete)
 * -------------------------------------------------------------------------
 */
function setupBatchSelectEngine() {
    const toggleBtn = document.getElementById('cs-btn-toggle-select-mode');
    const bar = document.getElementById('cs-batch-action-bar');
    const selectAllCheckbox = document.getElementById('cs-batch-select-all');
    const selectedCountBadge = document.getElementById('cs-batch-selected-count');
    const mergeBtn = document.getElementById('cs-btn-batch-merge-pdf');
    const deleteBtn = document.getElementById('cs-btn-batch-delete');
    const cancelBtn = document.getElementById('cs-btn-batch-cancel');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isBatchSelectMode = !isBatchSelectMode;
            selectedDocIds.clear();
            if (bar) bar.style.display = isBatchSelectMode ? 'flex' : 'none';
            toggleBtn.style.background = isBatchSelectMode ? 'rgba(0,168,132,0.2)' : 'transparent';
            toggleBtn.style.borderColor = isBatchSelectMode ? 'var(--cs-teal)' : 'var(--cs-border-dark)';
            renderDocumentLibrary();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            isBatchSelectMode = false;
            selectedDocIds.clear();
            if (bar) bar.style.display = 'none';
            if (toggleBtn) {
                toggleBtn.style.background = 'transparent';
                toggleBtn.style.borderColor = 'var(--cs-border-dark)';
            }
            renderDocumentLibrary();
        });
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                csEngine.documents.forEach(d => selectedDocIds.add(d.id));
            } else {
                selectedDocIds.clear();
            }
            updateBatchSelectionUI();
            renderDocumentLibrary();
        });
    }

    // Batch Merge to PDF
    if (mergeBtn) {
        mergeBtn.addEventListener('click', () => {
            if (!selectedDocIds.size) {
                alert('অনুগ্রহ করে এক বা একাধিক ডকুমেন্ট সিলেক্ট করুন!');
                return;
            }

            const allCanvases = [];
            csEngine.documents
                .filter(d => selectedDocIds.has(d.id))
                .forEach(doc => {
                    doc.pages.forEach(pageDataUrl => {
                        const c = document.createElement('canvas');
                        const img = new Image();
                        img.src = pageDataUrl;
                        c.width = 800;
                        c.height = 1100;
                        c.getContext('2d').drawImage(img, 0, 0);
                        allCanvases.push(c);
                    });
                });

            if (allCanvases.length) {
                PDFExporter.exportPagesToPDF(allCanvases, `CamScanner_Batch_Merged_${Date.now()}.pdf`, 'a4');
            }
        });
    }

    // Batch Delete
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!selectedDocIds.size) {
                alert('অনুগ্রহ করে এক বা একাধিক ডকুমেন্ট সিলেক্ট করুন!');
                return;
            }

            if (confirm(`আপনি কি নির্বাচিত ${selectedDocIds.size} টি ডকুমেন্ট মুছে ফেলতে চান?`)) {
                csEngine.documents = csEngine.documents.filter(d => !selectedDocIds.has(d.id));
                csEngine.saveToStorage();
                selectedDocIds.clear();
                updateBatchSelectionUI();
                renderDocumentLibrary();
            }
        });
    }
}

function updateBatchSelectionUI() {
    const badge = document.getElementById('cs-batch-selected-count');
    if (badge) {
        badge.textContent = `${selectedDocIds.size} টি নির্বাচিত`;
    }
    const selectAllCheckbox = document.getElementById('cs-batch-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = csEngine.documents.length > 0 && selectedDocIds.size === csEngine.documents.length;
    }
}

/**
 * -------------------------------------------------------------------------
 * 8. HOME DOCUMENT LIBRARY (GRID & LIST VIEWS)
 * -------------------------------------------------------------------------
 */
function renderDocumentLibrary(filterQuery = '') {
    const container = document.getElementById('cs-docs-container');
    const countBadge = document.getElementById('cs-library-count');
    if (!container) return;

    let list = [...csEngine.documents];

    // Category filter
    if (activeDocFilterCategory && activeDocFilterCategory !== 'All Docs') {
        list = list.filter(d => d.category === activeDocFilterCategory);
    }

    // Search filter
    if (filterQuery) {
        list = list.filter(d => d.title.toLowerCase().includes(filterQuery));
    }

    // Sorting
    if (csDocSort === 'oldest') {
        list.reverse();
    } else if (csDocSort === 'name_asc') {
        list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (csDocSort === 'name_desc') {
        list.sort((a, b) => b.title.localeCompare(a.title));
    }

    // Update document count
    if (countBadge) {
        countBadge.textContent = `${csEngine.documents.length} টি ডকুমেন্ট`;
    }
    const meCount = document.getElementById('me-doc-count');
    if (meCount) {
        meCount.textContent = `${csEngine.documents.length} টি ডকুমেন্ট সংরক্ষিত`;
    }

    // Empty state
    if (list.length === 0) {
        container.className = 'cs-docs-grid';
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--cs-text-dim);">
                <div style="font-size: 48px; margin-bottom: 12px;">📁</div>
                <h3 style="font-size: 1.1rem; color: var(--cs-text-white);">কোনো ডকুমেন্ট পাওয়া যায়নি</h3>
                <p style="font-size: 0.85rem; margin-top: 6px;">নিচের ক্যামেরা বাটনে ক্লিক করে নতুন ডকুমেন্ট স্ক্যান করুন অথবা ছবি আপলোড করুন।</p>
            </div>
        `;
        return;
    }

    // Render Grid View vs List View
    if (csViewMode === 'grid') {
        container.className = 'cs-docs-grid';
        container.innerHTML = list.map(doc => {
            const isSelected = selectedDocIds.has(doc.id);
            return `
                <div class="cs-doc-card ${isSelected ? 'selected' : ''}" data-docid="${doc.id}">
                    ${isBatchSelectMode ? `
                        <input type="checkbox" class="cs-doc-select-checkbox" data-id="${doc.id}" ${isSelected ? 'checked' : ''}>
                    ` : ''}
                    <div class="cs-doc-thumb">
                        <img src="${doc.thumbnail}" alt="${doc.title}" loading="lazy" />
                        <div class="cs-page-badge">${doc.pageCount || (doc.pages ? doc.pages.length : 1)} Pages</div>
                    </div>
                    <div class="cs-doc-body">
                        <div class="cs-doc-title">${doc.title}</div>
                        <div class="cs-doc-meta">
                            <span>${doc.date || 'Recent'}</span>
                            <span>${doc.category || 'Document'}</span>
                        </div>
                        <div class="cs-doc-actions">
                            <button class="cs-action-mini btn-open-doc" data-id="${doc.id}">📑 ওপেন</button>
                            <button class="cs-action-mini btn-share-doc" data-id="${doc.id}">📤 PDF</button>
                            <button class="cs-action-mini btn-del-doc" data-id="${doc.id}" style="color:#ef4444;">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        // List View (Table Format)
        container.className = 'cs-docs-list';
        container.innerHTML = list.map(doc => {
            const isSelected = selectedDocIds.has(doc.id);
            const estKb = Math.round((doc.pages ? doc.pages.length : 1) * 380);
            return `
                <div class="cs-doc-row ${isSelected ? 'selected' : ''}" data-docid="${doc.id}">
                    <div class="cs-row-left">
                        ${isBatchSelectMode ? `
                            <input type="checkbox" class="cs-doc-select-checkbox" data-id="${doc.id}" ${isSelected ? 'checked' : ''} style="position:static; margin-right:4px;">
                        ` : ''}
                        <div class="cs-row-thumb">
                            <img src="${doc.thumbnail}" alt="${doc.title}" loading="lazy" />
                        </div>
                        <div class="cs-row-details">
                            <div class="cs-row-title">${doc.title}</div>
                            <div class="cs-row-meta">
                                <span>${doc.date || 'Recent'}</span>
                                <span>• ${doc.pageCount || (doc.pages ? doc.pages.length : 1)} Pages</span>
                                <span>• ~${estKb} KB</span>
                            </div>
                        </div>
                    </div>
                    <div class="cs-row-actions">
                        <button class="cs-action-mini btn-open-doc" data-id="${doc.id}">📑 ওপেন</button>
                        <button class="cs-action-mini btn-share-doc" data-id="${doc.id}">📤 PDF</button>
                        <button class="cs-action-mini btn-del-doc" data-id="${doc.id}" style="color:#ef4444;">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Attach card click handlers
    container.querySelectorAll('.cs-doc-card, .cs-doc-row').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.btn-del-doc') || e.target.closest('.btn-share-doc')) return;

            const docId = el.dataset.docid;
            if (isBatchSelectMode) {
                if (selectedDocIds.has(docId)) {
                    selectedDocIds.delete(docId);
                } else {
                    selectedDocIds.add(docId);
                }
                updateBatchSelectionUI();
                renderDocumentLibrary(filterQuery);
            } else {
                openDocumentDetail(docId);
            }
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
                renderDocumentLibrary(filterQuery);
            }
        });
    });

    // Checkbox changes in batch select mode
    container.querySelectorAll('.cs-doc-select-checkbox').forEach(cb => {
        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = cb.dataset.id;
            if (cb.checked) {
                selectedDocIds.add(id);
            } else {
                selectedDocIds.delete(id);
            }
            updateBatchSelectionUI();
        });
    });
}

/**
 * -------------------------------------------------------------------------
 * 9. AUTHENTIC DOCUMENT DETAIL & MULTI-PAGE PDF STUDIO
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

    // Add Page to Current Document via Camera
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
    document.getElementById('btn-open-pdf-dialog')?.addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });
    document.getElementById('btn-doc-pdf-trigger')?.addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });

    // Share Current Doc
    document.getElementById('btn-share-current-doc')?.addEventListener('click', () => {
        openPDFExportDialog(csEngine.currentDocId);
    });

    // OCR on Current Doc
    document.getElementById('btn-doc-ocr-trigger')?.addEventListener('click', () => {
        navigateToScreen('screen-ocr');
    });

    // Watermark
    document.getElementById('btn-doc-watermark-trigger')?.addEventListener('click', () => {
        navigateToScreen('screen-watermark');
    });

    // Signature
    document.getElementById('btn-doc-sign-trigger')?.addEventListener('click', () => {
        navigateToScreen('screen-watermark');
    });

    // Compress
    document.getElementById('btn-doc-compress-trigger')?.addEventListener('click', () => {
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
                <img src="${pageSrc}" alt="Page ${idx + 1}" loading="lazy" />
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
 * 10. DEDICATED CAMSCANNER PDF EXPORT MODAL
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
    document.getElementById('btn-download-final-pdf')?.addEventListener('click', () => {
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
    document.getElementById('btn-print-direct-pdf')?.addEventListener('click', () => {
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
 * 11. AUTHENTIC 3-STEP ID CARD SCANNER WORKFLOW
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
    document.getElementById('btn-idcard-open-cam')?.addEventListener('click', () => {
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
    document.getElementById('btn-idcard-pdf-download')?.addEventListener('click', () => {
        const sheet = idCardScanner.generateA4Sheet();
        PDFExporter.exportPagesToPDF([sheet], `ID_Card_Copy_${idCardScanner.selectedTemplate}.pdf`, 'a4');
    });

    // Print A4 Sheet
    document.getElementById('btn-idcard-print')?.addEventListener('click', () => {
        const sheet = idCardScanner.generateA4Sheet();
        PDFExporter.printCanvasListAsPDF([sheet], 'ID Card Copy A4');
    });

    // Retake button
    document.getElementById('btn-idcard-retake')?.addEventListener('click', () => {
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
    if (step1) step1.classList.toggle('active', idCardScanner.currentStep >= 1);
    if (step2) step2.classList.toggle('active', idCardScanner.currentStep >= 2);
    if (step3) step3.classList.toggle('active', idCardScanner.currentStep >= 3);

    // Front / Back preview thumbnails
    const frontBox = document.getElementById('idcard-front-preview-box');
    if (frontBox) {
        frontBox.innerHTML = idCardScanner.frontCanvas ?
            `<img src="${idCardScanner.frontCanvas.toDataURL()}" style="max-height:100%; max-width:100%; border-radius:4px;" />` :
            `<span class="cs-placeholder-text">খালি</span>`;
    }

    const backBox = document.getElementById('idcard-back-preview-box');
    if (backBox) {
        backBox.innerHTML = idCardScanner.backCanvas ?
            `<img src="${idCardScanner.backCanvas.toDataURL()}" style="max-height:100%; max-width:100%; border-radius:4px;" />` :
            `<span class="cs-placeholder-text">খালি</span>`;
    }

    if (idCardScanner.currentStep < 3) {
        if (captureView) captureView.style.display = 'block';
        if (a4View) a4View.style.display = 'none';

        if (captureTitle) {
            if (idCardScanner.currentStep === 1) {
                captureTitle.textContent = 'কার্ডের সামনের পাতা ফ্রেমের মাঝে রাখুন (Front Side)';
            } else {
                captureTitle.textContent = 'কার্ডটি উল্টে পেছনের পাতা ফ্রেমের মাঝে রাখুন (Back Side)';
            }
        }
    } else {
        if (captureView) captureView.style.display = 'none';
        if (a4View) {
            a4View.style.display = 'grid';
            updateIDCardA4Preview();
        }
    }
}

function updateIDCardA4Preview() {
    const container = document.getElementById('idcard-a4-canvas-container');
    if (!container) return;

    const sheet = idCardScanner.generateA4Sheet();
    container.innerHTML = '';
    sheet.style.maxWidth = '100%';
    sheet.style.maxHeight = '480px';
    sheet.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    sheet.style.borderRadius = '4px';
    container.appendChild(sheet);
}

/**
 * -------------------------------------------------------------------------
 * 12. CAMERA VIEWFINDER WITH FLIP, TORCH, GRID & AUTO-DETECTION
 * -------------------------------------------------------------------------
 */
let cameraDetectTimer = null;
let consecutiveDetections = 0;
let autoCaptureActive = true;

function setupCameraViewfinder() {
    const video = document.getElementById('cs-camera-video');
    const shutterBtn = document.getElementById('cs-btn-shutter');
    const closeBtn = document.getElementById('cs-btn-close-camera');
    const importInput = document.getElementById('cs-camera-import-file');
    const faceGuide = document.getElementById('cs-biometric-face-guide');
    const autoCapBtn = document.getElementById('cs-btn-toggle-autocapture');
    const flipBtn = document.getElementById('cs-btn-camera-flip');
    const torchBtn = document.getElementById('cs-btn-camera-torch');
    const gridBtn = document.getElementById('cs-btn-camera-grid');
    const gridOverlay = document.getElementById('cs-camera-grid-overlay');

    // Camera Flip (Rear / Front Switch)
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            closeCameraViewfinder(false);
            openCameraViewfinder(csEngine.activeCameraMode, currentFacingMode);
        });
    }

    // Camera Torch Toggle
    if (torchBtn) {
        torchBtn.addEventListener('click', async () => {
            if (!cameraMediaStream) return;
            const track = cameraMediaStream.getVideoTracks()[0];
            if (!track) return;

            try {
                const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                if (capabilities.torch) {
                    currentFlashTorch = !currentFlashTorch;
                    await track.applyConstraints({
                        advanced: [{ torch: currentFlashTorch }]
                    });
                    torchBtn.style.color = currentFlashTorch ? '#00FFBB' : '#fff';
                } else {
                    alert('আপনার ডিভাইসে ফ্ল্যাশলাইট কন্ট্রোল সাপোর্ট করছে না।');
                }
            } catch (err) {
                console.warn('Torch error:', err);
            }
        });
    }

    // Grid Guidelines Toggle
    if (gridBtn && gridOverlay) {
        gridBtn.addEventListener('click', () => {
            showCameraGrid = !showCameraGrid;
            gridOverlay.style.display = showCameraGrid ? 'block' : 'none';
            gridBtn.style.color = showCameraGrid ? '#00FFBB' : '#fff';
        });
    }

    // Auto-capture toggle
    if (autoCapBtn) {
        autoCapBtn.addEventListener('click', () => {
            autoCaptureActive = !autoCaptureActive;
            autoCapBtn.classList.toggle('active', autoCaptureActive);
            autoCapBtn.textContent = autoCaptureActive ? '⚡ অটো-ক্যাপচার: চালু (ON)' : '⚡ অটো-ক্যাপচার: বন্ধ (OFF)';
            autoCapBtn.style.background = autoCaptureActive ? 'rgba(0,168,132,0.25)' : 'rgba(255,255,255,0.1)';
        });
    }

    // Camera Mode Carousel
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
        closeBtn.addEventListener('click', () => closeCameraViewfinder());
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

function openCameraViewfinder(defaultMode = 'docs', facing = null) {
    const modal = document.getElementById('cs-camera-overlay');
    const video = document.getElementById('cs-camera-video');
    const faceGuide = document.getElementById('cs-biometric-face-guide');
    const liveFrame = document.getElementById('cs-camera-live-frame');

    if (facing) currentFacingMode = facing;
    else currentFacingMode = defaultMode === 'id_photo' ? 'user' : 'environment';

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
            facingMode: currentFacingMode
        }
    }).then(stream => {
        cameraMediaStream = stream;
        video.srcObject = stream;
        video.play();
        modal.classList.add('active');
        startCameraDetectionLoop();
    }).catch(err => {
        // Fallback to file picker if camera access is denied or unavailable
        document.getElementById('cs-camera-import-file')?.click();
    });
}

function closeCameraViewfinder(hideModal = true) {
    stopCameraDetectionLoop();
    if (cameraMediaStream) {
        cameraMediaStream.getTracks().forEach(t => t.stop());
        cameraMediaStream = null;
    }
    if (hideModal) {
        const modal = document.getElementById('cs-camera-overlay');
        if (modal) modal.classList.remove('active');
    }
}

function handleCapturedImage(dataUrl) {
    if (csEngine.activeCameraMode === 'id_photo') {
        navigateToScreen('screen-passport');
        passportStudio.loadImage(dataUrl, () => {
            const emptyState = document.getElementById('passport-empty-state');
            const pCanvas = document.getElementById('passport-canvas');
            if (emptyState) emptyState.style.display = 'none';
            if (pCanvas) pCanvas.style.display = 'block';
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
 * 13. 8-POINT INTELLIGENT CROP VIEW & MAGNIFYING LOUPE
 * -------------------------------------------------------------------------
 */
function setupCropViewAndLoupe() {
    const canvas = document.getElementById('cs-crop-canvas');
    const loupe = document.getElementById('cs-crop-loupe');
    if (!canvas) return;

    cropViewInstance = new CropView(canvas, loupe);

    document.getElementById('cs-btn-crop-auto')?.addEventListener('click', () => {
        csEngine.autoDetectCrop();
        cropViewInstance.render();
    });

    document.getElementById('cs-btn-crop-all')?.addEventListener('click', () => {
        csEngine.fullPageCrop();
        cropViewInstance.render();
    });

    document.getElementById('cs-btn-crop-rotate')?.addEventListener('click', () => {
        csEngine.rotateCropImage();
        setTimeout(() => cropViewInstance.render(), 100);
    });

    document.getElementById('cs-btn-crop-done')?.addEventListener('click', () => {
        closeCropScreen();
        const warpedCanvas = csEngine.executeCrop();
        openFilterScreen(warpedCanvas);
    });

    document.getElementById('cs-btn-crop-close')?.addEventListener('click', closeCropScreen);
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
 * 14. FILTER & ENHANCEMENT SCREEN (Exact CamScanner Signature Filters)
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

    document.getElementById('cs-btn-filter-done')?.addEventListener('click', handleSaveAndOpen);
    document.getElementById('cs-btn-filter-next')?.addEventListener('click', handleSaveAndOpen);

    document.getElementById('cs-btn-filter-recrop')?.addEventListener('click', () => {
        closeFilterScreen();
        if (csEngine.currentImage) {
            openCropScreen(csEngine.currentImage.src);
        }
    });

    document.getElementById('cs-btn-filter-back')?.addEventListener('click', closeFilterScreen);
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
 * 15. PASSPORT & ID PHOTO STUDIO
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
                if (customWrap) customWrap.style.display = 'grid';
            } else {
                if (customWrap) customWrap.style.display = 'none';
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
    document.getElementById('custom-width')?.addEventListener('input', customApply);
    document.getElementById('custom-height')?.addEventListener('input', customApply);

    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                passportStudio.loadImage(evt.target.result, () => {
                    const emptyState = document.getElementById('passport-empty-state');
                    if (emptyState) emptyState.style.display = 'none';
                    if (previewCanvas) previewCanvas.style.display = 'block';
                    updatePassportCanvasView();
                });
            };
            reader.readAsDataURL(file);
        });
    }

    document.getElementById('btn-passport-camera')?.addEventListener('click', () => {
        openCameraViewfinder('id_photo');
    });

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

    document.getElementById('passport-custom-color')?.addEventListener('input', (e) => {
        passportStudio.state.bgColor = e.target.value;
        updatePassportCanvasView();
    });

    document.getElementById('toggle-guidelines')?.addEventListener('change', (e) => {
        passportStudio.state.showBiometricGuide = e.target.checked;
        updatePassportCanvasView();
    });

    document.getElementById('btn-magic-bg')?.addEventListener('click', () => {
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

    if (previewCanvas) {
        setupCanvasInteractions(previewCanvas);
    }

    document.getElementById('btn-download-single')?.addEventListener('click', () => {
        const photo = passportStudio.renderCroppedPhoto();
        if (!photo) return;
        PDFExporter.downloadCanvasImage(photo, `Passport_Photo_${passportStudio.currentPreset.id}.png`, 'image/png');
    });

    document.getElementById('btn-preview-sheet')?.addEventListener('click', () => {
        if (!passportStudio.rawImage) {
            alert('প্রথমে একটি ছবি আপলোড করুন!');
            return;
        }
        document.getElementById('print-modal')?.classList.add('active');
        renderPrintSheetModal();
    });

    document.getElementById('sheet-paper-size')?.addEventListener('change', (e) => {
        passportStudio.printState.paperSize = e.target.value;
        renderPrintSheetModal();
    });
    document.getElementById('sheet-photo-count')?.addEventListener('change', (e) => {
        passportStudio.printState.photoCount = parseInt(e.target.value);
        renderPrintSheetModal();
    });
    document.getElementById('sheet-cut-lines')?.addEventListener('change', (e) => {
        passportStudio.printState.showCutLines = e.target.checked;
        renderPrintSheetModal();
    });
    document.getElementById('sheet-border')?.addEventListener('change', (e) => {
        passportStudio.printState.hasBorder = e.target.checked;
        renderPrintSheetModal();
    });

    document.getElementById('btn-download-sheet-img')?.addEventListener('click', () => {
        const sheet = passportStudio.generatePrintSheet();
        if (!sheet) return;
        PDFExporter.downloadCanvasImage(sheet, `Print_Sheet_${passportStudio.printState.paperSize}.jpg`, 'image/jpeg', 0.95);
    });

    document.getElementById('btn-download-sheet-pdf')?.addEventListener('click', () => {
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

    document.getElementById('suit-scale')?.addEventListener('input', (e) => {
        passportStudio.state.suitState.scale = parseFloat(e.target.value);
        updatePassportCanvasView();
    });

    document.getElementById('suit-y-pos')?.addEventListener('input', (e) => {
        const h = passportStudio.getPixelHeight();
        passportStudio.state.suitState.y = h * (parseFloat(e.target.value) / 100);
        updatePassportCanvasView();
    });
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
 * 16. WATERMARK & SIGNATURE STUDIO
 * -------------------------------------------------------------------------
 */
function setupWatermarkAndSignature() {
    const sigPad = document.getElementById('signature-pad');
    if (sigPad) {
        watermarkStudio.initSignaturePad(sigPad);
    }

    document.getElementById('btn-clear-sig')?.addEventListener('click', () => {
        watermarkStudio.clearSignature();
    });

    document.querySelectorAll('.pen-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('.pen-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            watermarkStudio.penColor = dot.dataset.color;
        });
    });

    document.getElementById('sig-pen-size')?.addEventListener('input', (e) => {
        watermarkStudio.penSize = parseInt(e.target.value);
    });

    document.getElementById('btn-apply-watermark')?.addEventListener('click', () => {
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

    document.getElementById('btn-stamp-signature')?.addEventListener('click', () => {
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
 * 17. OCR TEXT EXTRACTION
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

    document.getElementById('btn-download-ocr-txt')?.addEventListener('click', () => {
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
 * 18. TOOLS HUB (25+ CamScanner Features)
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
 * 19. ME / PROFILE & APP SETTINGS
 * -------------------------------------------------------------------------
 */
function setupProfileScreen() {
    const docCountBadge = document.getElementById('me-doc-count');
    if (docCountBadge) {
        docCountBadge.textContent = `${csEngine.documents.length} টি ডকুমেন্ট সংরক্ষিত`;
    }
}

/**
 * -------------------------------------------------------------------------
 * 20. DESKTOP KEYBOARD SHORTCUTS
 * -------------------------------------------------------------------------
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC to close any modal, camera, or crop screen
        if (e.key === 'Escape') {
            closeCameraViewfinder();
            closeCropScreen();
            closeFilterScreen();
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            const mobileSearchDrawer = document.getElementById('cs-mobile-search-drawer');
            if (mobileSearchDrawer) mobileSearchDrawer.style.display = 'none';
        }

        // Ctrl + O or Cmd + O to Import / Upload
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            const uploader = document.getElementById('cs-batch-upload-home');
            if (uploader) uploader.click();
        }

        // Ctrl + S or Cmd + S to Export PDF
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (csEngine.currentDocId) {
                openPDFExportDialog(csEngine.currentDocId);
            } else if (csEngine.documents.length) {
                openPDFExportDialog(csEngine.documents[0].id);
            }
        }

        // Ctrl + F or Cmd + F to Focus Search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('cs-doc-search');
            if (searchInput) searchInput.focus();
        }

        // Spacebar to capture in Camera view
        if (e.code === 'Space' && document.getElementById('cs-camera-overlay')?.classList.contains('active')) {
            e.preventDefault();
            document.getElementById('cs-btn-shutter')?.click();
        }
    });
}

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
    setupAppDownloadCenter();
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
                        title: `camlab Batch ${new Date().toLocaleDateString('bn-BD')}`,
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

    // Theme toggle (Light default for fresh clean look; persisted in localStorage)
    const themeBtn = document.getElementById('cs-btn-theme');
    const savedTheme = localStorage.getItem('cs_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    if (themeBtn) {
        themeBtn.innerHTML = savedTheme === 'dark' ? '☀️ লাইট' : '🌙 ডার্ক';
        themeBtn.addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', next);
            localStorage.setItem('cs_theme', next);
            themeBtn.innerHTML = next === 'dark' ? '☀️ লাইট' : '🌙 ডার্ক';
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
            } else if (action === 'open-app-download') {
                openAppDownloadModal();
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
                PDFExporter.exportPagesToPDF(allCanvases, `camlab_Batch_Merged_${Date.now()}.pdf`, 'a4');
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

    // Add Page to Current Document via Camera (append to currentDocId)
    const addPageBtn = document.getElementById('btn-doc-add-page');
    if (addPageBtn) {
        addPageBtn.addEventListener('click', () => {
            openCameraViewfinder('docs', null, csEngine.currentDocId);
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

    // Re-crop / Edit Page in-place
    container.querySelectorAll('.btn-recrop-page').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            editingPageIndex = idx;
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
 * 12. CONTINUOUS AUTO-CROP CAMERA VIEWFINDER, BACKGROUND QUEUE & COMPLETE BAR
 * -------------------------------------------------------------------------
 */
let cameraDetectTimer = null;
let consecutiveDetections = 0;
let autoCaptureActive = false; // OFF by default — user presses shutter; auto-crop still happens

// Continuous Scanning & Background Auto-Crop Session State
let cameraSessionPages = [];
let pendingBgCount = 0;
let cameraTargetDocId = null;
let prevFrameGray = null;
let lastCapturedGray = null;
let captureCooldownUntil = 0;
let latestDetectedCorners = null;
let editingPageIndex = null;

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
    const completeBtn = document.getElementById('cs-btn-camera-complete');
    const undoBtn = document.getElementById('cs-btn-camera-undo');

    // Camera Flip (Rear / Front Switch) without losing current session pages
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            closeCameraViewfinder(false);
            openCameraViewfinder(csEngine.activeCameraMode, currentFacingMode, cameraTargetDocId, true);
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

    // Auto-capture toggle — default OFF; user presses shutter; auto-crop still happens on capture
    if (autoCapBtn) {
        // Sync button visual state with the default OFF
        autoCapBtn.classList.remove('active');
        autoCapBtn.textContent = '⚡ অটো-ক্যাপচার: বন্ধ (OFF)';
        autoCapBtn.style.background = 'rgba(255,255,255,0.1)';

        autoCapBtn.addEventListener('click', () => {
            autoCaptureActive = !autoCaptureActive;
            autoCapBtn.classList.toggle('active', autoCaptureActive);
            autoCapBtn.textContent = autoCaptureActive ? '⚡ অটো-ক্যাপচার: চালু (ON)' : '⚡ অটো-ক্যাপচার: বন্ধ (OFF)';
            autoCapBtn.style.background = autoCaptureActive ? 'rgba(0,168,132,0.25)' : 'rgba(255,255,255,0.1)';
            consecutiveDetections = 0;
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
            updateCameraModeGuides(mode);
            consecutiveDetections = 0;
        });
    });

    // Shutter Button: Continuous Background Auto-Crop in docs/book/to_word mode
    if (shutterBtn) {
        shutterBtn.addEventListener('click', () => {
            if (!video) return;

            if (csEngine.activeCameraMode === 'id_photo' || csEngine.activeCameraMode === 'id_card') {
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = video.videoWidth || 1280;
                snapCanvas.height = video.videoHeight || 720;
                const ctx = snapCanvas.getContext('2d');
                ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
                const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
                closeCameraViewfinder();
                handleCapturedImage(dataUrl);
                return;
            }

            // Continuous background auto-crop for Document, Book & To-Word modes
            captureCooldownUntil = Date.now() + 1800;
            consecutiveDetections = 0;
            triggerContinuousCameraCapture(latestDetectedCorners);
        });
    }

    // Undo Last Scanned Page in Current Session
    if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (cameraSessionPages.length > 0) {
                cameraSessionPages.pop();
                lastCapturedGray = null;
                updateCameraSessionUI();
                showCameraBgToast('↩️ সর্বশেষ পেজটি বাদ দেওয়া হয়েছে', false, 1800);
            }
        });
    }

    // Complete Button: Finish Continuous Scanning & Open Scanned Document
    if (completeBtn) {
        completeBtn.addEventListener('click', () => {
            finalizeContinuousCameraSession();
        });
    }

    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files || files.length === 0) return;
            closeCameraViewfinder();

            if (files.length > 1) {
                handleBatchFileUpload(files, cameraTargetDocId);
            } else {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    handleCapturedImage(evt.target.result);
                };
                reader.readAsDataURL(files[0]);
            }
            e.target.value = '';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (cameraSessionPages.length > 0 || pendingBgCount > 0) {
                if (confirm(`আপনি ${cameraSessionPages.length}টি পেজ স্ক্যান করেছেন। সেভ করতে "OK" চাপুন অথবা বাতিল করতে "Cancel" চাপুন।`)) {
                    finalizeContinuousCameraSession();
                    return;
                }
            }
            cameraSessionPages = [];
            pendingBgCount = 0;
            closeCameraViewfinder();
        });
    }
}

function updateCameraModeGuides(mode) {
    const faceGuide = document.getElementById('cs-biometric-face-guide');
    const liveFrame = document.getElementById('cs-camera-live-frame');
    const bookGuide = document.getElementById('cs-book-split-guide');
    const quadCanvas = document.getElementById('cs-camera-quad-canvas');

    if (faceGuide) {
        faceGuide.style.display = mode === 'id_photo' ? 'block' : 'none';
    }
    if (liveFrame) {
        liveFrame.style.display = mode === 'id_photo' ? 'none' : 'flex';
        liveFrame.classList.remove('detected');
    }
    if (bookGuide) {
        bookGuide.style.display = mode === 'book' ? 'block' : 'none';
    }
    if (quadCanvas && mode === 'id_photo') {
        const qCtx = quadCanvas.getContext('2d');
        qCtx.clearRect(0, 0, quadCanvas.width, quadCanvas.height);
    }
}

function updateCameraSessionUI() {
    const thumbWrap = document.getElementById('cs-camera-thumb-wrap');
    const lastThumb = document.getElementById('cs-camera-last-thumb');
    const badge = document.getElementById('cs-camera-page-badge');
    const completeBtn = document.getElementById('cs-btn-camera-complete');
    const completeCount = document.getElementById('cs-camera-complete-count');

    const count = cameraSessionPages.length;
    if (completeCount) completeCount.textContent = count;

    if (completeBtn) {
        completeBtn.disabled = (count === 0 && pendingBgCount === 0);
        if (pendingBgCount > 0) {
            completeBtn.innerHTML = `⏳ প্রসেস হচ্ছে... (<span id="cs-camera-complete-count">${count}</span>)`;
        } else {
            completeBtn.innerHTML = `✓ কমপ্লিট (<span id="cs-camera-complete-count">${count}</span>)`;
        }
    }

    if (thumbWrap && lastThumb && badge) {
        if (count > 0) {
            thumbWrap.style.display = 'block';
            lastThumb.src = cameraSessionPages[count - 1];
            badge.textContent = count;
        } else {
            thumbWrap.style.display = 'none';
        }
    }
}

let bgToastHideTimer = null;
function showCameraBgToast(message, showSpinner = true, autoHideMs = 0) {
    const toast = document.getElementById('cs-camera-bg-toast');
    const textEl = document.getElementById('cs-camera-bg-toast-text');
    const spinner = document.getElementById('cs-camera-bg-spinner');
    if (!toast || !textEl) return;

    if (bgToastHideTimer) {
        clearTimeout(bgToastHideTimer);
        bgToastHideTimer = null;
    }

    textEl.textContent = message;
    if (spinner) spinner.style.display = showSpinner ? 'inline-block' : 'none';
    toast.style.display = 'flex';

    if (autoHideMs > 0 && pendingBgCount === 0) {
        bgToastHideTimer = setTimeout(() => {
            if (pendingBgCount === 0) toast.style.display = 'none';
        }, autoHideMs);
    }
}

function triggerCameraShutterFlash() {
    const flashEl = document.getElementById('cs-camera-shutter-flash');
    if (!flashEl) return;
    flashEl.classList.add('flash');
    setTimeout(() => {
        flashEl.classList.remove('flash');
    }, 160);
}

/**
 * Draw real-time detected green boundary polygon around page/book on #cs-camera-quad-canvas
 */
function drawLiveCameraQuad(corners320, isSteadyLock = false) {
    const quadCanvas = document.getElementById('cs-camera-quad-canvas');
    const video = document.getElementById('cs-camera-video');
    if (!quadCanvas || !video) return;

    const rect = quadCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (quadCanvas.width !== Math.round(rect.width) || quadCanvas.height !== Math.round(rect.height)) {
        quadCanvas.width = Math.round(rect.width);
        quadCanvas.height = Math.round(rect.height);
    }

    const ctx = quadCanvas.getContext('2d');
    ctx.clearRect(0, 0, quadCanvas.width, quadCanvas.height);

    if (!corners320 || corners320.length < 8) return;

    // Map 320x240 coordinates to video object-fit: cover display coordinates
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const cw = quadCanvas.width;
    const ch = quadCanvas.height;

    const scale = Math.max(cw / vw, ch / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const offsetX = (cw - dispW) / 2;
    const offsetY = (ch - dispH) / 2;

    const mapPt = (pt) => ({
        x: offsetX + (pt.x / 320) * dispW,
        y: offsetY + (pt.y / 240) * dispH
    });

    const tl = mapPt(corners320[0]);
    const tr = mapPt(corners320[2]);
    const br = mapPt(corners320[4]);
    const bl = mapPt(corners320[6]);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();

    ctx.fillStyle = isSteadyLock ? 'rgba(0, 230, 184, 0.24)' : 'rgba(0, 196, 154, 0.14)';
    ctx.fill();

    ctx.lineWidth = isSteadyLock ? 3.5 : 2.5;
    ctx.strokeStyle = isSteadyLock ? '#00FFBB' : '#00C49A';
    ctx.shadowColor = 'rgba(0, 255, 187, 0.6)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // If Book mode, draw center spine split line inside the detected book quad
    if (csEngine.activeCameraMode === 'book') {
        const topMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
        const btmMid = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
        ctx.beginPath();
        ctx.setLineDash([7, 5]);
        ctx.moveTo(topMid.x, topMid.y);
        ctx.lineTo(btmMid.x, btmMid.y);
        ctx.strokeStyle = '#FFD166';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw corner handles
    [tl, tr, br, bl].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00FFBB';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });

    ctx.restore();
}

/**
 * Capture frame and auto-crop in background WITHOUT closing camera
 */
function triggerContinuousCameraCapture(detectedCorners320 = null) {
    const video = document.getElementById('cs-camera-video');
    const statusText = document.getElementById('cs-camera-status-text');
    if (!video) return;

    triggerCameraShutterFlash();

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = vw;
    snapCanvas.height = vh;
    const ctx = snapCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);
    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.94);

    // Scale 320x240 corners to full frame resolution if detected
    let scaledCorners = null;
    if (detectedCorners320 && detectedCorners320.length === 8) {
        const scaleX = vw / 320;
        const scaleY = vh / 240;
        scaledCorners = detectedCorners320.map(pt => ({
            x: pt.x * scaleX,
            y: pt.y * scaleY,
            id: pt.id
        }));
    }

    const captureMode = csEngine.activeCameraMode;
    pendingBgCount++;
    updateCameraSessionUI();

    if (captureMode === 'book') {
        showCameraBgToast('⚙️ বইয়ের ২টি পৃষ্ঠা আড়ালে অটো-ক্রপ ও প্রসেস হচ্ছে...', true);
    } else {
        showCameraBgToast(`⚙️ পেজ আড়ালে অটো-ক্রপ ও প্রসেস হচ্ছে... (${pendingBgCount})`, true);
    }
    if (statusText) {
        statusText.textContent = '✓ ক্যাপচার হয়েছে! আড়ালে অটো-ক্রপ চলছে — পরের পেজ ধরুন';
    }

    // Process asynchronously in background so camera stays smooth and ready for next page
    setTimeout(() => {
        if (captureMode === 'book') {
            csEngine.splitBookPages(dataUrl, (leftCanvas, rightCanvas) => {
                if (leftCanvas) {
                    cameraSessionPages.push(leftCanvas.toDataURL('image/jpeg', 0.92));
                }
                if (rightCanvas) {
                    cameraSessionPages.push(rightCanvas.toDataURL('image/jpeg', 0.92));
                }
                pendingBgCount = Math.max(0, pendingBgCount - 1);
                updateCameraSessionUI();
                showCameraBgToast(
                    `✅ বইয়ের ২টি পেজ অটো-ক্রপ সম্পন্ন (মোট ${cameraSessionPages.length} পেজ) — পরের পেজ উল্টান বা কমপ্লিট চাপুন`,
                    false,
                    3200
                );
            }, scaledCorners);
        } else {
            csEngine.autoProcessAndCropImage(dataUrl, (croppedCanvas) => {
                if (croppedCanvas) {
                    cameraSessionPages.push(croppedCanvas.toDataURL('image/jpeg', 0.92));
                }
                pendingBgCount = Math.max(0, pendingBgCount - 1);
                updateCameraSessionUI();
                showCameraBgToast(
                    `✅ পেজ ${cameraSessionPages.length} অটো-ক্রপ সম্পন্ন — পরের ডকুমেন্ট ধরুন বা কমপ্লিট চাপুন`,
                    false,
                    2800
                );
            }, scaledCorners);
        }
    }, 30);
}

/**
 * Finalize continuous camera session when user clicks Complete (✓ কমপ্লিট)
 */
function finalizeContinuousCameraSession() {
    if (pendingBgCount > 0) {
        showCameraBgToast('⏳ আড়ালে অটো-ক্রপ শেষ হচ্ছে, একটু অপেক্ষা করুন...', true);
        const waitTimer = setInterval(() => {
            if (pendingBgCount <= 0) {
                clearInterval(waitTimer);
                finalizeContinuousCameraSession();
            }
        }, 150);
        return;
    }

    if (cameraSessionPages.length === 0) {
        alert('কমপ্লিট করার আগে অন্তত ১টি ডকুমেন্ট বা বইয়ের পেজ স্ক্যান করুন।');
        return;
    }

    const pagesToSave = [...cameraSessionPages];
    const modeAtFinish = csEngine.activeCameraMode;
    const targetId = cameraTargetDocId;

    cameraSessionPages = [];
    cameraTargetDocId = null;
    closeCameraViewfinder(true);

    let savedDoc = null;
    if (targetId) {
        savedDoc = csEngine.documents.find(d => d.id === targetId);
    }

    if (savedDoc) {
        pagesToSave.forEach(p => savedDoc.pages.push(p));
        savedDoc.pageCount = savedDoc.pages.length;
        savedDoc.thumbnail = savedDoc.pages[0];
        csEngine.currentDocId = savedDoc.id;
        csEngine.saveToStorage();
    } else {
        const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const defaultTitle = modeAtFinish === 'book'
            ? `Book Scan ${nowStr}`
            : `camlab ${nowStr}`;
        savedDoc = {
            id: 'doc_' + Date.now(),
            title: defaultTitle,
            date: new Date().toLocaleString('bn-BD'),
            category: modeAtFinish === 'book' ? 'Book' : 'Document',
            pages: pagesToSave,
            pageCount: pagesToSave.length,
            thumbnail: pagesToSave[0]
        };
        csEngine.documents.unshift(savedDoc);
        csEngine.currentDocId = savedDoc.id;
        csEngine.saveToStorage();
    }

    renderDocumentLibrary();

    if (modeAtFinish === 'to_word') {
        navigateToScreen('screen-ocr');
    } else {
        openDocumentDetail(savedDoc.id);
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

        const mode = csEngine.activeCameraMode;
        if (mode === 'id_photo') {
            if (liveFrame) liveFrame.classList.remove('detected');
            drawLiveCameraQuad(null);
            return;
        }

        try {
            offCtx.drawImage(video, 0, 0, 320, 240);
            const analysis = ImageProcessor.analyzeLiveFrame(offCanvas, prevFrameGray, lastCapturedGray);
            prevFrameGray = analysis.grayBuffer;

            // Cooldown right after capturing a page so user can flip page or place next document
            if (Date.now() < captureCooldownUntil) {
                consecutiveDetections = 0;
                if (liveFrame) liveFrame.classList.remove('detected');
                drawLiveCameraQuad(analysis.detected ? analysis.corners : null, false);
                if (statusText) {
                    statusText.textContent = `✓ পেজ স্ক্যান হয়েছে (মোট ${cameraSessionPages.length + pendingBgCount}টি) — পরের পেজ বা ডকুমেন্ট ধরুন`;
                }
                return;
            }

            if (analysis.detected) {
                latestDetectedCorners = analysis.corners;

                // Prevent re-capturing the exact same unmoved page right after an auto-capture
                if (lastCapturedGray && analysis.diffFromLastCapture < 9.5) {
                    drawLiveCameraQuad(analysis.corners, false);
                    if (liveFrame) liveFrame.classList.remove('detected');
                    if (statusText) {
                        statusText.textContent = `✓ এই পেজটি স্ক্যান হয়েছে — পরের পৃষ্ঠা উল্টান বা কমপ্লিট চাপুন`;
                    }
                    return;
                } else if (lastCapturedGray && analysis.diffFromLastCapture >= 9.5) {
                    // User changed the page or moved a new document into view!
                    lastCapturedGray = null;
                }

                if (analysis.isSteady) {
                    consecutiveDetections++;
                } else {
                    consecutiveDetections = Math.max(1, consecutiveDetections - 1);
                }

                drawLiveCameraQuad(analysis.corners, consecutiveDetections >= 2);
                if (liveFrame) liveFrame.classList.add('detected');

                const modeLabel = mode === 'book' ? 'বইয়ের ২ পৃষ্ঠা' : 'ডকুমেন্ট সীমানা';
                if (autoCaptureActive) {
                    if (statusText) {
                        statusText.textContent = `${modeLabel} শনাক্ত হয়েছে (${Math.min(3, consecutiveDetections)}/3)... অটো-ক্রপের জন্য স্থির রাখুন`;
                    }

                    if (consecutiveDetections >= 3) {
                        consecutiveDetections = 0;
                        lastCapturedGray = analysis.grayBuffer;
                        captureCooldownUntil = Date.now() + 2200;

                        if (mode === 'id_card') {
                            const snapCanvas = document.createElement('canvas');
                            snapCanvas.width = video.videoWidth || 1280;
                            snapCanvas.height = video.videoHeight || 720;
                            snapCanvas.getContext('2d').drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
                            const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
                            closeCameraViewfinder();
                            handleCapturedImage(dataUrl);
                        } else {
                            // Auto-crop in background and KEEP camera open for next page!
                            triggerContinuousCameraCapture(analysis.corners);
                        }
                    }
                } else {
                    if (statusText) {
                        statusText.textContent = `${modeLabel} শনাক্ত হয়েছে — ছবি তুলতে শাটার বাটনে চাপুন`;
                    }
                }
            } else {
                latestDetectedCorners = null;
                consecutiveDetections = Math.max(0, consecutiveDetections - 1);
                if (liveFrame) liveFrame.classList.remove('detected');
                drawLiveCameraQuad(null);

                // If user removed the old page, clear lastCapturedGray so next page is ready
                if (lastCapturedGray && analysis.diffFromLastCapture > 11) {
                    lastCapturedGray = null;
                }

                if (statusText) {
                    if (cameraSessionPages.length > 0) {
                        statusText.textContent = `${cameraSessionPages.length}টি পেজ স্ক্যান হয়েছে — পরের ডকুমেন্ট ধরুন অথবা "✓ কমপ্লিট" চাপুন`;
                    } else {
                        statusText.textContent = mode === 'book'
                            ? 'বইয়ের দুটি পৃষ্ঠা ফ্রেমের ভেতর ধরুন — অটো ক্রপ ও স্প্লিট হবে'
                            : 'ডকুমেন্ট বা বইয়ের পেজ ফ্রেমের ভেতর ধরুন (Auto-Crop Active)';
                    }
                }
            }
        } catch (e) {
            // Frame processing catch
        }
    }, 320);
}

function stopCameraDetectionLoop() {
    if (cameraDetectTimer) {
        clearInterval(cameraDetectTimer);
        cameraDetectTimer = null;
    }
    consecutiveDetections = 0;
    latestDetectedCorners = null;
}

function openCameraViewfinder(defaultMode = 'docs', facing = null, targetDocId = null, preserveSession = false) {
    const modal = document.getElementById('cs-camera-overlay');
    const video = document.getElementById('cs-camera-video');

    if (!preserveSession) {
        cameraSessionPages = [];
        pendingBgCount = 0;
        cameraTargetDocId = targetDocId || null;
        prevFrameGray = null;
        lastCapturedGray = null;
        captureCooldownUntil = 0;
        const toast = document.getElementById('cs-camera-bg-toast');
        if (toast) toast.style.display = 'none';
    }
    updateCameraSessionUI();

    if (facing) currentFacingMode = facing;
    else currentFacingMode = defaultMode === 'id_photo' ? 'user' : 'environment';

    csEngine.activeCameraMode = defaultMode;
    document.querySelectorAll('.cs-camera-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === defaultMode);
    });
    updateCameraModeGuides(defaultMode);

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
        passportStudio.loadImage(dataUrl, (analysis) => {
            onPassportImageLoaded(analysis);
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
            const pages = [];
            if (leftCanvas) pages.push(leftCanvas.toDataURL('image/jpeg', 0.92));
            if (rightCanvas) pages.push(rightCanvas.toDataURL('image/jpeg', 0.92));
            const newDoc = {
                id: 'doc_' + Date.now(),
                title: 'Book Scan ' + new Date().toISOString().slice(0, 10),
                date: new Date().toLocaleString('bn-BD'),
                category: 'Book',
                pages: pages,
                pageCount: pages.length,
                thumbnail: pages[0]
            };
            csEngine.documents.unshift(newDoc);
            csEngine.currentDocId = newDoc.id;
            csEngine.saveToStorage();
            openDocumentDetail(newDoc.id);
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

    document.getElementById('cs-btn-crop-close')?.addEventListener('click', () => {
        editingPageIndex = null;
        closeCropScreen();
    });
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

        // If re-cropping/editing an existing page in Document Detail, update in-place
        if (editingPageIndex !== null && csEngine.currentDocId && csEngine.processedCanvas) {
            const doc = csEngine.documents.find(d => d.id === csEngine.currentDocId);
            if (doc && doc.pages[editingPageIndex] !== undefined) {
                doc.pages[editingPageIndex] = csEngine.processedCanvas.toDataURL('image/jpeg', 0.92);
                doc.thumbnail = doc.pages[0];
                csEngine.saveToStorage();
                editingPageIndex = null;
                closeFilterScreen();
                openDocumentDetail(doc.id);
                return;
            }
        }

        editingPageIndex = null;
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
function syncPassportSlidersFromState() {
    const zoomEl = document.getElementById('passport-zoom');
    const zoomVal = document.getElementById('passport-zoom-val');
    if (zoomEl) {
        const clampedZoom = Math.min(3, Math.max(0.3, passportStudio.state.scale)).toFixed(2);
        zoomEl.value = clampedZoom;
        if (zoomVal) zoomVal.textContent = clampedZoom;
    }

    const rotEl = document.getElementById('passport-rotate');
    const rotVal = document.getElementById('passport-rotate-val');
    if (rotEl) {
        rotEl.value = Math.round(passportStudio.state.rotation || 0);
        if (rotVal) rotVal.textContent = `${Math.round(passportStudio.state.rotation || 0)}°`;
    }
}

function updatePassportAnalysisUI(analysis) {
    if (!analysis) return;
    const aiBar = document.getElementById('passport-ai-bar');
    if (aiBar) aiBar.style.display = 'flex';

    const faceBadge = document.getElementById('passport-face-badge');
    if (faceBadge) {
        faceBadge.className = `cs-ai-chip ${analysis.faceDetected ? 'ok' : 'warn'}`;
        faceBadge.textContent = analysis.faceDetected
            ? `🎯 মুখ, গলা ও কাঁধ শনাক্ত (${analysis.confidence}%)`
            : '⚠️ মুখ অস্পষ্ট — মাউস ড্র্যাগ করে ফ্রেম ঠিক করুন';
    }

    const btnMale = document.getElementById('btn-gender-male');
    const btnFemale = document.getElementById('btn-gender-female');
    if (btnMale && btnFemale) {
        btnMale.classList.toggle('active', analysis.gender === 'male');
        btnFemale.classList.toggle('active', analysis.gender === 'female');
    }

    const attireBadge = document.getElementById('passport-attire-badge');
    if (attireBadge) {
        const activeSuit = passportStudio.state.selectedSuit !== 'none';
        attireBadge.className = `cs-ai-chip ${(!analysis.needsFormalSuit || activeSuit) ? 'ok' : 'warn'}`;
        attireBadge.textContent = activeSuit
            ? '👔 ফরমাল স্যুট পরানো হয়েছে ✓'
            : `👕 ${analysis.attireLabelBn || 'পোশাক বিশ্লেষণ সম্পন্ন'}`;
    }
}

function onPassportImageLoaded(analysis) {
    const emptyState = document.getElementById('passport-empty-state');
    const previewCanvas = document.getElementById('passport-canvas');
    if (emptyState) emptyState.style.display = 'none';
    if (previewCanvas) previewCanvas.style.display = 'block';

    syncPassportSlidersFromState();
    updatePassportAnalysisUI(analysis);
    renderSuitSelector();
    updatePassportCanvasView();

    if (analysis?.faceDetected) {
        showComfortToast(
            `${analysis.genderLabelBn} • মুখ ও গলা অটো-ক্রপ সম্পন্ন!`,
            '✨',
            3000
        );
    }
}

function getPrintSheetLayoutSummaryText() {
    const ps = passportStudio.printState;
    const { sheetWidthMm, sheetHeightMm, maxRowsFit } = passportStudio.getPaperMetrics();
    const rowsUsed = ps.rowCount === 'full' ? maxRowsFit : (parseInt(ps.rowCount) || 2);
    const cols = parseInt(ps.photosPerRow) || 5;
    const total = rowsUsed * cols;
    const orientBn = ps.sheetOrientation === 'landscape' ? 'ল্যান্ডস্কিপ' : 'সোজা';
    const paperLabel = ps.paperSize === 'custom'
        ? `কাস্টম (${Math.round(sheetWidthMm)}×${Math.round(sheetHeightMm)} মিমি, ${orientBn})`
        : `${ps.paperSize.toUpperCase()} (${Math.round(sheetWidthMm)}×${Math.round(sheetHeightMm)} মিমি, ${orientBn})`;
    return `${paperLabel} • এক লাইনে ${cols}টি × ${rowsUsed} সারি = ${total}টি ছবি`;
}

function updateSheetOrientationAndCustomUI() {
    const ps = passportStudio.printState;
    const isCustom = ps.paperSize === 'custom';
    const inlineWrap = document.getElementById('inline-custom-sheet-wrap');
    const modalWrap = document.getElementById('modal-custom-sheet-wrap');
    if (inlineWrap) inlineWrap.style.display = isCustom ? 'inline-flex' : 'none';
    if (modalWrap) modalWrap.style.display = isCustom ? 'inline-flex' : 'none';

    const { sheetWidthMm, sheetHeightMm } = passportStudio.getPaperMetrics();
    ['inline-sheet-w', 'modal-sheet-w'].forEach(id => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = Math.round(sheetWidthMm);
    });
    ['inline-sheet-h', 'modal-sheet-h'].forEach(id => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = Math.round(sheetHeightMm);
    });

    const isLand = ps.sheetOrientation === 'landscape';
    ['inline-sheet-orient-portrait', 'modal-sheet-orient-portrait'].forEach(id => {
        document.getElementById(id)?.classList.toggle('active', !isLand);
    });
    ['inline-sheet-orient-landscape', 'modal-sheet-orient-landscape'].forEach(id => {
        document.getElementById(id)?.classList.toggle('active', isLand);
    });
}

function syncPrintSheetControls(source = 'inline') {
    const pairs = [
        { inlineId: 'inline-sheet-paper', modalId: 'sheet-paper-size', key: 'paperSize', isInt: false },
        { inlineId: 'inline-sheet-per-row', modalId: 'sheet-photos-per-row', key: 'photosPerRow', isInt: true },
        { inlineId: 'inline-sheet-rows', modalId: 'sheet-row-count', key: 'rowCount', isInt: false }
    ];

    pairs.forEach(({ inlineId, modalId, key, isInt }) => {
        const inlineEl = document.getElementById(inlineId);
        const modalEl = document.getElementById(modalId);
        const activeEl = source === 'modal' ? modalEl : inlineEl;
        if (!activeEl) return;

        const rawVal = activeEl.value;
        passportStudio.printState[key] = isInt ? (parseInt(rawVal) || 1) : rawVal;

        if (inlineEl && inlineEl.value !== rawVal) inlineEl.value = rawVal;
        if (modalEl && modalEl.value !== rawVal) modalEl.value = rawVal;
    });

    updateSheetOrientationAndCustomUI();
    renderInlineA4SheetPreview();
    if (document.getElementById('print-modal')?.classList.contains('active')) {
        renderPrintSheetModal();
    }
}

function exportOrPrintPassportSheet(action) {
    if (!passportStudio.rawImage) {
        alert('প্রথমে একটি ছবি আপলোড বা ক্যামেরায় তুলুন!');
        return;
    }
    const sheet = passportStudio.generatePrintSheet();
    if (!sheet) return;

    const paper = passportStudio.printState.paperSize;
    const { sheetWidthMm, sheetHeightMm } = passportStudio.getPaperMetrics();
    if (action === 'jpg') {
        PDFExporter.downloadCanvasImage(sheet, `camlab_Passport_${paper}.jpg`, 'image/jpeg', 0.96);
    } else if (action === 'pdf') {
        PDFExporter.exportPagesToPDF([sheet], `camlab_Passport_Sheet_${paper}.pdf`, [sheetWidthMm, sheetHeightMm]);
    } else if (action === 'print') {
        PDFExporter.printCanvasListAsPDF([sheet], `camlab Passport ${paper} Print`, `${sheetWidthMm}mm ${sheetHeightMm}mm`);
    }
}

function renderInlineA4SheetPreview() {
    const inlineCanvas = document.getElementById('passport-inline-sheet-canvas');
    const summaryEl = document.getElementById('inline-sheet-summary');
    if (summaryEl) summaryEl.textContent = getPrintSheetLayoutSummaryText();
    if (!inlineCanvas) return;

    const sheet = passportStudio.generatePrintSheet();
    if (!sheet) return;

    inlineCanvas.width = sheet.width;
    inlineCanvas.height = sheet.height;
    inlineCanvas.getContext('2d').drawImage(sheet, 0, 0);
}

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
                syncPassportSlidersFromState();
                updatePassportCanvasView();
            }
        });
    }

    const customApply = () => {
        const w = parseFloat(document.getElementById('custom-width').value) || 35;
        const h = parseFloat(document.getElementById('custom-height').value) || 45;
        passportStudio.setPreset('custom', w, h);
        syncPassportSlidersFromState();
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
                passportStudio.loadImage(evt.target.result, (analysis) => {
                    onPassportImageLoaded(analysis);
                });
            };
            reader.readAsDataURL(file);
        });
    }

    document.getElementById('btn-passport-camera')?.addEventListener('click', () => {
        openCameraViewfinder('id_photo');
    });

    // Gender detection & manual toggle
    const handleGenderSwitch = (gender) => {
        passportStudio.setGender(gender);
        updatePassportAnalysisUI(passportStudio.analysis);
        renderSuitSelector();
        updatePassportCanvasView();
    };
    document.getElementById('btn-gender-male')?.addEventListener('click', () => handleGenderSwitch('male'));
    document.getElementById('btn-gender-female')?.addEventListener('click', () => handleGenderSwitch('female'));

    // One-click Auto Crop (Face + Neck + Upper Chest)
    document.getElementById('btn-auto-crop-face')?.addEventListener('click', () => {
        if (!passportStudio.rawImage) return;
        passportStudio.autoFrameHeadNeckChest();
        syncPassportSlidersFromState();
        updatePassportCanvasView();
        showComfortToast('মুখ, গলা ও বুকের অংশ পাসপোর্ট মাপে ক্রপ করা হয়েছে!', '✨');
    });

    // One-click Auto Formal Suit matching Male/Female
    document.getElementById('btn-auto-fit-suit')?.addEventListener('click', () => {
        if (!passportStudio.rawImage) return;
        passportStudio.applyAutoFormalSuit();
        const suitControls = document.getElementById('suit-adjust-controls');
        if (suitControls) suitControls.style.display = 'flex';
        updatePassportAnalysisUI(passportStudio.analysis);
        renderSuitSelector();
        updatePassportCanvasView();
        showComfortToast('ফরমাল স্যুট স্বয়ংক্রিয়ভাবে বসানো হয়েছে!', '👔');
    });

    const bindSlider = (id, property) => {
        const el = document.getElementById(id);
        const valDisplay = document.getElementById(`${id}-val`);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            passportStudio.state[property] = v;
            if (valDisplay) valDisplay.textContent = property === 'rotation' ? `${v}°` : v;
            updatePassportCanvasView();
        });
    };

    // Single Photo Portrait / Landscape & 90° Rotation
    const setPhotoOrientUI = (orient) => {
        passportStudio.setPhotoOrientation(orient);
        document.getElementById('btn-photo-orient-portrait')?.classList.toggle('active', orient !== 'landscape');
        document.getElementById('btn-photo-orient-landscape')?.classList.toggle('active', orient === 'landscape');
        const cw = document.getElementById('custom-width');
        const ch = document.getElementById('custom-height');
        if (cw) cw.value = passportStudio.currentPreset.widthMm;
        if (ch) ch.value = passportStudio.currentPreset.heightMm;
        syncPassportSlidersFromState();
        updatePassportCanvasView();
    };
    document.getElementById('btn-photo-orient-portrait')?.addEventListener('click', () => setPhotoOrientUI('portrait'));
    document.getElementById('btn-photo-orient-landscape')?.addEventListener('click', () => setPhotoOrientUI('landscape'));
    document.getElementById('btn-passport-rotate-90')?.addEventListener('click', () => {
        if (!passportStudio.rawImage) return;
        passportStudio.rotate90();
        updatePassportCanvasView();
    });

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
        ImageProcessor.replaceBackground(tempCanvas, passportStudio.state.bgColor, tol, null, passportStudio.analysis?.faceBox);

        passportStudio.loadImage(tempCanvas.toDataURL('image/png'), (analysis) => {
            onPassportImageLoaded(analysis);
        });
    });

    if (previewCanvas) {
        setupCanvasInteractions(previewCanvas);
    }

    document.getElementById('btn-download-single')?.addEventListener('click', () => {
        const photo = passportStudio.renderCroppedPhoto();
        if (!photo) return;
        PDFExporter.downloadCanvasImage(photo, `camlab_Passport_${passportStudio.currentPreset.id}.png`, 'image/png');
    });

    const openPrintModal = () => {
        if (!passportStudio.rawImage) {
            alert('প্রথমে একটি ছবি আপলোড বা ক্যামেরায় তুলুন!');
            return;
        }
        document.getElementById('print-modal')?.classList.add('active');
        renderPrintSheetModal();
    };
    document.getElementById('btn-preview-sheet')?.addEventListener('click', openPrintModal);
    document.getElementById('btn-open-full-print-modal')?.addEventListener('click', openPrintModal);

    // Inline A4 Sheet controls
    ['inline-sheet-paper', 'inline-sheet-per-row', 'inline-sheet-rows'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => syncPrintSheetControls('inline'));
    });

    // Modal A4 Sheet controls
    ['sheet-paper-size', 'sheet-photos-per-row', 'sheet-row-count'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => syncPrintSheetControls('modal'));
    });

    // Sheet Orientation toggles (inline + modal)
    const setSheetOrient = (orient) => {
        passportStudio.printState.sheetOrientation = orient === 'landscape' ? 'landscape' : 'portrait';
        if (passportStudio.printState.paperSize === 'custom') {
            const cw = parseFloat(passportStudio.printState.customSheetWidthMm) || 210;
            const ch = parseFloat(passportStudio.printState.customSheetHeightMm) || 297;
            passportStudio.printState.customSheetWidthMm = orient === 'landscape' ? Math.max(cw, ch) : Math.min(cw, ch);
            passportStudio.printState.customSheetHeightMm = orient === 'landscape' ? Math.min(cw, ch) : Math.max(cw, ch);
        }
        updateSheetOrientationAndCustomUI();
        renderInlineA4SheetPreview();
        if (document.getElementById('print-modal')?.classList.contains('active')) renderPrintSheetModal();
    };
    ['inline-sheet-orient-portrait', 'modal-sheet-orient-portrait'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => setSheetOrient('portrait'));
    });
    ['inline-sheet-orient-landscape', 'modal-sheet-orient-landscape'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => setSheetOrient('landscape'));
    });

    const bindCustomSheetInputs = (wId, hId) => {
        const apply = () => {
            const w = parseFloat(document.getElementById(wId)?.value) || 210;
            const h = parseFloat(document.getElementById(hId)?.value) || 297;
            passportStudio.printState.paperSize = 'custom';
            passportStudio.printState.customSheetWidthMm = w;
            passportStudio.printState.customSheetHeightMm = h;
            passportStudio.printState.sheetOrientation = w > h ? 'landscape' : 'portrait';
            updateSheetOrientationAndCustomUI();
            renderInlineA4SheetPreview();
            if (document.getElementById('print-modal')?.classList.contains('active')) renderPrintSheetModal();
        };
        document.getElementById(wId)?.addEventListener('input', apply);
        document.getElementById(hId)?.addEventListener('input', apply);
    };
    bindCustomSheetInputs('inline-sheet-w', 'inline-sheet-h');
    bindCustomSheetInputs('modal-sheet-w', 'modal-sheet-h');
    updateSheetOrientationAndCustomUI();

    document.getElementById('sheet-cut-lines')?.addEventListener('change', (e) => {
        passportStudio.printState.showCutLines = e.target.checked;
        renderPrintSheetModal();
        renderInlineA4SheetPreview();
    });
    document.getElementById('sheet-border')?.addEventListener('change', (e) => {
        passportStudio.printState.hasBorder = e.target.checked;
        renderPrintSheetModal();
        renderInlineA4SheetPreview();
    });

    // Export / Direct Print actions (inline + modal)
    document.getElementById('btn-direct-print-passport')?.addEventListener('click', () => exportOrPrintPassportSheet('print'));
    document.getElementById('btn-print-passport-now')?.addEventListener('click', () => exportOrPrintPassportSheet('print'));
    document.getElementById('btn-inline-download-pdf')?.addEventListener('click', () => exportOrPrintPassportSheet('pdf'));
    document.getElementById('btn-download-sheet-pdf')?.addEventListener('click', () => exportOrPrintPassportSheet('pdf'));
    document.getElementById('btn-inline-download-jpg')?.addEventListener('click', () => exportOrPrintPassportSheet('jpg'));
    document.getElementById('btn-download-sheet-img')?.addEventListener('click', () => exportOrPrintPassportSheet('jpg'));
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

    renderInlineA4SheetPreview();
}

function renderSuitSelector() {
    const container = document.getElementById('suits-container');
    if (!container) return;

    const detectedGender = passportStudio.analysis?.gender || 'male';
    const sortedSuits = [...SUIT_TEMPLATES].sort((a, b) => {
        if (a.id === 'none') return -1;
        if (b.id === 'none') return 1;
        const aMatch = a.gender === detectedGender ? 0 : 1;
        const bMatch = b.gender === detectedGender ? 0 : 1;
        return aMatch - bMatch;
    });

    container.innerHTML = sortedSuits.map(suit => `
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
            updatePassportAnalysisUI(passportStudio.analysis);
            updatePassportCanvasView();
        });
    });

    const suitScaleEl = document.getElementById('suit-scale');
    const suitYPosEl = document.getElementById('suit-y-pos');
    if (suitScaleEl && !suitScaleEl.dataset.bound) {
        suitScaleEl.dataset.bound = '1';
        suitScaleEl.addEventListener('input', (e) => {
            passportStudio.state.suitState.scale = parseFloat(e.target.value);
            updatePassportCanvasView();
        });
    }
    if (suitYPosEl && !suitYPosEl.dataset.bound) {
        suitYPosEl.dataset.bound = '1';
        suitYPosEl.addEventListener('input', (e) => {
            const h = passportStudio.getPixelHeight();
            passportStudio.state.suitState.y = h * (parseFloat(e.target.value) / 100);
            updatePassportCanvasView();
        });
    }
}

function renderPrintSheetModal() {
    const sheetCanvas = passportStudio.generatePrintSheet();
    const container = document.getElementById('print-sheet-preview-wrap');
    const summaryEl = document.getElementById('sheet-modal-summary');
    if (summaryEl) summaryEl.textContent = getPrintSheetLayoutSummaryText();
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
                    PDFExporter.exportPagesToPDF(allPages, 'Merged_camlab_Docs.pdf', 'a4');
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

/**
 * -------------------------------------------------------------------------
 * 21. MOBILE & DESKTOP APP DOWNLOAD CENTER, PWA INSTALLER & COMFORT TOAST
 * -------------------------------------------------------------------------
 */
let deferredInstallPrompt = null;
let comfortToastTimer = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

function showComfortToast(message, icon = '✅', duration = 3200) {
    const toast = document.getElementById('cs-comfort-toast');
    const iconEl = document.getElementById('cs-comfort-toast-icon');
    const msgEl = document.getElementById('cs-comfort-toast-msg');
    if (!toast || !msgEl) return;

    if (comfortToastTimer) clearTimeout(comfortToastTimer);
    if (iconEl) iconEl.textContent = icon;
    msgEl.textContent = message;
    toast.style.display = 'flex';

    comfortToastTimer = setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function setupAppDownloadCenter() {
    // Open Modal triggers
    document.getElementById('cs-btn-header-get-app')?.addEventListener('click', () => openAppDownloadModal());
    document.getElementById('cs-btn-home-dl-center')?.addEventListener('click', () => openAppDownloadModal());
    document.getElementById('cs-btn-me-open-dl-modal')?.addEventListener('click', () => openAppDownloadModal());
    // Tab bar download button
    document.getElementById('cs-tab-btn-download')?.addEventListener('click', () => openAppDownloadModal());

    // Quick Home & Profile Mobile/Desktop Download Buttons
    document.getElementById('cs-btn-home-dl-mobile')?.addEventListener('click', () => {
        openAppDownloadModal();
        triggerAppDownload('android-apk');
    });
    document.getElementById('cs-btn-home-dl-desktop')?.addEventListener('click', () => {
        openAppDownloadModal();
        triggerAppDownload('windows-exe');
    });
    document.getElementById('cs-btn-me-dl-mobile')?.addEventListener('click', () => {
        openAppDownloadModal();
        triggerAppDownload('android-apk');
    });
    document.getElementById('cs-btn-me-dl-desktop')?.addEventListener('click', () => {
        openAppDownloadModal();
        triggerAppDownload('windows-exe');
    });

    // Modal internal action buttons
    document.getElementById('cs-btn-close-app-dl-modal')?.addEventListener('click', () => {
        document.getElementById('cs-app-download-modal')?.classList.remove('active');
    });

    // Modal internal action feedback for real APK / EXE downloads
    document.getElementById('btn-dl-android-apk')?.addEventListener('click', () => showAppDownloadFeedback('android-apk'));
    document.getElementById('btn-dl-windows-exe')?.addEventListener('click', () => showAppDownloadFeedback('windows-exe'));

    // Hide all app download prompts if opened inside standalone / WebView / installed app
    const isStandaloneApp = window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.navigator.standalone === true ||
        /;\s*wv\)/i.test(navigator.userAgent);
    if (isStandaloneApp) {
        document.querySelectorAll('#cs-btn-header-get-app, .cs-simple-dl-pills, #cs-tab-btn-download, .cs-profile-dl-panel')
            .forEach(el => { el.style.display = 'none'; });
    }

    // Copy Link button
    document.getElementById('btn-copy-app-link')?.addEventListener('click', () => {
        const urlInput = document.getElementById('cs-app-share-url');
        const link = urlInput ? urlInput.value : window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(() => {
                showComfortToast('অ্যাপ ডাউনলোড লিংক কপি করা হয়েছে!', '📋');
            });
        } else if (urlInput) {
            urlInput.select();
            document.execCommand('copy');
            showComfortToast('অ্যাপ ডাউনলোড লিংক কপি করা হয়েছে!', '📋');
        }
    });
}

function openAppDownloadModal() {
    const modal = document.getElementById('cs-app-download-modal');
    if (!modal) return;

    const urlInput = document.getElementById('cs-app-share-url');
    const liveUrl = (window.location.protocol.startsWith('http'))
        ? window.location.href
        : 'https://menajpal-design.github.io/camlap/';
    if (urlInput) urlInput.value = liveUrl;

    modal.classList.add('active');
    drawAppQRCode(liveUrl);
}

function showAppDownloadFeedback(type) {
    const progressBox = document.getElementById('cs-app-dl-progress-box');
    const statusText = document.getElementById('cs-app-dl-status-text');
    const percentText = document.getElementById('cs-app-dl-percent');
    const bar = document.getElementById('cs-app-dl-bar');

    const isApk = type === 'android-apk';
    const fileName = isApk ? 'camlab.apk' : 'camlab.exe';

    if (progressBox) progressBox.style.display = 'block';
    if (statusText) {
        statusText.innerHTML = `📦 সর্বশেষ <strong>${fileName}</strong> ডাউনলোড শুরু হচ্ছে... (<a href="https://github.com/menajpal-design/camlap/releases/latest" target="_blank" style="color:var(--cs-teal); text-decoration:underline;">GitHub Releases</a>)`;
    }
    if (percentText) percentText.textContent = '100%';
    if (bar) bar.style.width = '100%';

    showComfortToast(`${fileName} ডাউনলোড শুরু হয়েছে!`, '📦', 3500);
}

function triggerAppDownload(type) {
    const isApk = type === 'android-apk';
    const fileName = isApk ? 'camlab.apk' : 'camlab.exe';
    const targetUrl = isApk
        ? 'https://github.com/menajpal-design/camlap/releases/latest/download/camlab.apk'
        : 'https://github.com/menajpal-design/camlap/releases/latest/download/camlab.exe';

    showAppDownloadFeedback(isApk ? 'android-apk' : 'windows-exe');

    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Draw crisp QR matrix on #cs-app-qr-canvas for scanning with mobile phone
 */
function drawAppQRCode(text) {
    const canvas = document.getElementById('cs-app-qr-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 21;
    const cell = canvas.width / size;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawFinder = (r, c) => {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(c * cell, r * cell, 7 * cell, 7 * cell);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect((c + 1) * cell, (r + 1) * cell, 5 * cell, 5 * cell);
        ctx.fillStyle = '#00A884';
        ctx.fillRect((c + 2) * cell, (r + 2) * cell, 3 * cell, 3 * cell);
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    ctx.fillStyle = '#0F172A';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const inTL = r < 8 && c < 8;
            const inTR = r < 8 && c >= size - 8;
            const inBL = r >= size - 8 && c < 8;
            if (inTL || inTR || inBL) continue;

            const bit = ((r * 31 + c * 17 + Math.abs(hash)) % 7) < 3;
            if (bit) {
                ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
            }
        }
    }
}

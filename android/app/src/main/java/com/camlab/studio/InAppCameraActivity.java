package com.camlab.studio;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.PointF;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native In-App CameraX Scanner inside camlab (no external camera app needed).
 * Supports Document Scan, Passport Portrait, ID Card Front/Back, OCR, and Watermark capture.
 */
public class InAppCameraActivity extends AppCompatActivity {

    public static final String EXTRA_SCAN_MODE = "scan_mode";
    public static final String EXTRA_BATCH_URIS = "batch_uris";

    private PreviewView viewFinder;
    private LiveQuadOverlayView liveQuadOverlay;
    private View viewScanGuide;
    private TextView tvTitle;
    private TextView tvHint;
    private Button btnFlash;
    private Button btnSwitch;
    private Button btnAutoSelect;
    private Button btnShutter;
    private Button btnDone;

    private final java.util.ArrayList<String> capturedUris = new java.util.ArrayList<>();
    private long captureCooldownUntil = 0L;

    private ImageCapture imageCapture;
    private int lensFacing = CameraSelector.LENS_FACING_BACK;
    private int flashMode = ImageCapture.FLASH_MODE_AUTO;
    private String scanMode = "doc";

    private boolean autoSelectEnabled = true;
    private volatile boolean isCapturing = false;
    private long lastAnalysisMs = 0L;
    private PointF[] prevQuad = null;
    private int steadyCount = 0;
    private final ExecutorService analysisExecutor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<String> permLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_in_app_camera);

        viewFinder = findViewById(R.id.view_finder);
        liveQuadOverlay = findViewById(R.id.live_quad_overlay);
        viewScanGuide = findViewById(R.id.view_scan_guide);
        tvTitle = findViewById(R.id.tv_cam_title);
        tvHint = findViewById(R.id.tv_cam_hint);
        btnFlash = findViewById(R.id.btn_cam_flash);
        btnSwitch = findViewById(R.id.btn_cam_switch);
        btnAutoSelect = findViewById(R.id.btn_cam_autoselect);
        btnShutter = findViewById(R.id.btn_cam_shutter);
        btnDone = findViewById(R.id.btn_cam_done);

        if (btnDone != null) {
            btnDone.setOnClickListener(v -> finishBatchReturn());
        }

        findViewById(R.id.btn_mode_doc).setOnClickListener(v -> switchMode("doc"));
        findViewById(R.id.btn_mode_book).setOnClickListener(v -> switchMode("book"));
        findViewById(R.id.btn_mode_board).setOnClickListener(v -> switchMode("whiteboard"));
        findViewById(R.id.btn_mode_id).setOnClickListener(v -> switchMode("id_front"));
        findViewById(R.id.btn_mode_passport).setOnClickListener(v -> switchMode("passport"));
        findViewById(R.id.btn_mode_ocr).setOnClickListener(v -> switchMode("ocr"));

        String modeExtra = getIntent().getStringExtra(EXTRA_SCAN_MODE);
        if (modeExtra != null && !modeExtra.isEmpty()) {
            scanMode = modeExtra;
        }

        configureGuideForMode(scanMode);

        findViewById(R.id.btn_cam_close).setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });

        btnFlash.setOnClickListener(v -> cycleFlashMode());
        btnSwitch.setOnClickListener(v -> toggleCameraLens());
        btnShutter.setOnClickListener(v -> capturePhoto());

        if (btnAutoSelect != null) {
            btnAutoSelect.setOnClickListener(v -> {
                autoSelectEnabled = !autoSelectEnabled;
                btnAutoSelect.setText(autoSelectEnabled ? "✨ অটো" : "🖐️ ম্যানুয়াল");
                steadyCount = 0;
                Toast.makeText(this, autoSelectEnabled ? "অটো ডকুমেন্ট সিলেক্ট ও ক্যাপচার চালু" : "ম্যানুয়াল ক্যাপচার চালু", Toast.LENGTH_SHORT).show();
            });
        }

        View btnGrid = findViewById(R.id.btn_cam_grid);
        if (btnGrid != null) {
            btnGrid.setOnClickListener(v -> {
                boolean next = !liveQuadOverlay.isShowGrid();
                liveQuadOverlay.setShowGrid(next);
                viewScanGuide.setVisibility(next ? View.VISIBLE : View.INVISIBLE);
                Toast.makeText(this, next ? "গ্রিড ও বর্ডার চালু" : "গ্রিড বন্ধ", Toast.LENGTH_SHORT).show();
            });
        }

        permLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) {
                startCamera();
            } else {
                Toast.makeText(this, "ক্যামেরা পারমিশন ছাড়া স্ক্যান করা যাবে না!", Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
                finish();
            }
        });

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            permLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void switchMode(String mode) {
        scanMode = mode;
        steadyCount = 0;
        configureGuideForMode(mode);
    }

    private boolean isBatchMode() {
        return "doc".equals(scanMode) || "book".equals(scanMode) || "whiteboard".equals(scanMode);
    }

    private void finishBatchReturn() {
        Intent data = new Intent();
        if (!capturedUris.isEmpty()) {
            data.setData(Uri.parse(capturedUris.get(0)));
            data.putStringArrayListExtra(EXTRA_BATCH_URIS, capturedUris);
            data.putExtra(EXTRA_SCAN_MODE, scanMode);
            data.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            setResult(RESULT_OK, data);
        } else {
            setResult(RESULT_CANCELED);
        }
        finish();
    }

    private void configureGuideForMode(String mode) {
        float density = getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) viewScanGuide.getLayoutParams();
        lp.gravity = Gravity.CENTER;

        if ("passport".equals(mode)) {
            tvTitle.setText("🪪 পাসপোর্ট ফটো ক্যামেরা");
            tvHint.setText("মুখ, গলা ও কাঁধ ফ্রেমের মাঝখানে রাখুন");
            lp.width = Math.round(250 * density);
            lp.height = Math.round(320 * density);
        } else if ("id_front".equals(mode)) {
            tvTitle.setText("💳 আইডি কার্ড (সামনের দিক)");
            tvHint.setText("আইডি কার্ডের সামনের দিক ফ্রেমের ভেতর রাখুন");
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = Math.round(215 * density);
        } else if ("id_back".equals(mode)) {
            tvTitle.setText("💳 আইডি কার্ড (পেছনের দিক)");
            tvHint.setText("আইডি কার্ডের পেছনের দিক ফ্রেমের ভেতর রাখুন");
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = Math.round(215 * density);
        } else if ("ocr".equals(mode)) {
            tvTitle.setText("🔍 OCR টেক্সট স্ক্যানার");
            tvHint.setText("লেখা স্পষ্টভাবে ফ্রেমের ভেতর রাখুন");
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = FrameLayout.LayoutParams.MATCH_PARENT;
        } else {
            tvTitle.setText("📷 ডকুমেন্ট স্ক্যানার (camlab)");
            tvHint.setText("ডকুমেন্ট ফ্রেমের ভেতর রেখে স্ক্যান বাটন চাপুন");
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = FrameLayout.LayoutParams.MATCH_PARENT;
        }
        viewScanGuide.setLayoutParams(lp);
    }

    private void cycleFlashMode() {
        if (flashMode == ImageCapture.FLASH_MODE_AUTO) {
            flashMode = ImageCapture.FLASH_MODE_ON;
            btnFlash.setText("⚡ অন");
        } else if (flashMode == ImageCapture.FLASH_MODE_ON) {
            flashMode = ImageCapture.FLASH_MODE_OFF;
            btnFlash.setText("⚡ অফ");
        } else {
            flashMode = ImageCapture.FLASH_MODE_AUTO;
            btnFlash.setText("⚡ অটো");
        }
        if (imageCapture != null) {
            imageCapture.setFlashMode(flashMode);
        }
    }

    private void toggleCameraLens() {
        lensFacing = (lensFacing == CameraSelector.LENS_FACING_BACK)
                ? CameraSelector.LENS_FACING_FRONT
                : CameraSelector.LENS_FACING_BACK;
        startCamera();
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(viewFinder.getSurfaceProvider());

                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                        .setFlashMode(flashMode)
                        .build();

                ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();

                imageAnalysis.setAnalyzer(analysisExecutor, imageProxy -> {
                    long now = System.currentTimeMillis();
                    if (isCapturing || now < captureCooldownUntil || "passport".equals(scanMode) || (now - lastAnalysisMs) < 180) {
                        imageProxy.close();
                        return;
                    }
                    lastAnalysisMs = now;
                    try {
                        Bitmap bmp = imageProxy.toBitmap();
                        int rot = imageProxy.getImageInfo().getRotationDegrees();
                        if (rot != 0) bmp = NativeImageUtils.rotateBitmap(bmp, rot);
                        PointF[] quad = NativeImageUtils.detectDocumentQuadLive(bmp);
                        if (quad != null) {
                            boolean steady = isQuadSteady(prevQuad, quad);
                            if (prevQuad != null) {
                                for (int i = 0; i < 4; i++) {
                                    quad[i].x = prevQuad[i].x * 0.50f + quad[i].x * 0.50f;
                                    quad[i].y = prevQuad[i].y * 0.50f + quad[i].y * 0.50f;
                                }
                            }
                            prevQuad = quad;
                            steadyCount = steady ? (steadyCount + 1) : 1;
                            boolean locked = steadyCount >= 2;
                            liveQuadOverlay.setDetectedQuad(quad, locked, bmp.getWidth(), bmp.getHeight());
                            runOnUiThread(() -> {
                                if (!isCapturing) {
                                    tvHint.setText(autoSelectEnabled
                                            ? "✨ ডকুমেন্ট শনাক্ত (" + Math.min(2, steadyCount) + "/2) — স্থির রাখুন"
                                            : "✨ ডকুমেন্ট সীমানা শনাক্ত হয়েছে — স্ক্যান চাপুন");
                                }
                            });
                            if (autoSelectEnabled && steadyCount >= 2 && !isCapturing) {
                                runOnUiThread(this::capturePhoto);
                            }
                        } else {
                            prevQuad = null;
                            steadyCount = 0;
                            liveQuadOverlay.setDetectedQuad(null, false);
                        }
                    } catch (Exception ignored) {
                    } finally {
                        imageProxy.close();
                    }
                });

                CameraSelector selector = new CameraSelector.Builder()
                        .requireLensFacing(lensFacing)
                        .build();

                provider.unbindAll();
                provider.bindToLifecycle(this, selector, preview, imageCapture, imageAnalysis);
            } catch (Exception e) {
                // Fallback if front/back lens not available
                try {
                    ProcessCameraProvider provider = future.get();
                    Preview preview = new Preview.Builder().build();
                    preview.setSurfaceProvider(viewFinder.getSurfaceProvider());
                    imageCapture = new ImageCapture.Builder().build();
                    provider.unbindAll();
                    provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
                } catch (Exception ex) {
                    Toast.makeText(this, "ক্যামেরা চালু করা যায়নি: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private boolean isQuadSteady(PointF[] a, PointF[] b) {
        if (a == null || b == null || a.length != 4 || b.length != 4) return false;
        float maxDelta = 0f;
        for (int i = 0; i < 4; i++) {
            float d = (float) Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
            if (d > maxDelta) maxDelta = d;
        }
        return maxDelta < 0.045f;
    }

    private void capturePhoto() {
        if (imageCapture == null || isCapturing) {
            return;
        }
        isCapturing = true;

        btnShutter.setEnabled(false);
        btnShutter.setText("⏳ স্ক্যান হচ্ছে...");

        File photoFile = new File(getCacheDir(), "camlab_scan_" + System.currentTimeMillis() + ".jpg");
        ImageCapture.OutputFileOptions outputOptions =
                new ImageCapture.OutputFileOptions.Builder(photoFile).build();

        imageCapture.takePicture(
                outputOptions,
                ContextCompat.getMainExecutor(this),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                        Uri fileUri = FileProvider.getUriForFile(
                                InAppCameraActivity.this,
                                getPackageName() + ".fileprovider",
                                photoFile
                        );
                        if (isBatchMode()) {
                            capturedUris.add(fileUri.toString());
                            isCapturing = false;
                            steadyCount = 0;
                            captureCooldownUntil = System.currentTimeMillis() + 2000L;
                            btnShutter.setEnabled(true);
                            btnShutter.setText("📸 স্ক্যান");
                            if (btnDone != null) {
                                btnDone.setVisibility(View.VISIBLE);
                                btnDone.setText("✓ (" + capturedUris.size() + ")");
                            }
                            tvHint.setText("✅ " + capturedUris.size() + "টি পেজ স্ক্যান হয়েছে — পরের পেজ ধরুন বা ✓ চাপুন");
                            Toast.makeText(InAppCameraActivity.this, "✅ পেজ " + capturedUris.size() + " যুক্ত হয়েছে!", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        Intent data = new Intent();
                        data.setData(fileUri);
                        data.putExtra(EXTRA_SCAN_MODE, scanMode);
                        data.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        setResult(RESULT_OK, data);
                        finish();
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException exception) {
                        isCapturing = false;
                        steadyCount = 0;
                        btnShutter.setEnabled(true);
                        btnShutter.setText("📸 স্ক্যান করুন");
                        Toast.makeText(InAppCameraActivity.this,
                                "ছবি তোলা ব্যর্থ: " + exception.getMessage(),
                                Toast.LENGTH_SHORT).show();
                    }
                }
        );
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        analysisExecutor.shutdown();
    }
}


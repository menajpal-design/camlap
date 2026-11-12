package com.camlab.studio;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
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
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;

/**
 * Native In-App CameraX Scanner inside camlab (no external camera app needed).
 * Supports Document Scan, Passport Portrait, ID Card Front/Back, OCR, and Watermark capture.
 */
public class InAppCameraActivity extends AppCompatActivity {

    public static final String EXTRA_SCAN_MODE = "scan_mode";

    private PreviewView viewFinder;
    private View viewScanGuide;
    private TextView tvTitle;
    private TextView tvHint;
    private Button btnFlash;
    private Button btnSwitch;
    private Button btnShutter;

    private ImageCapture imageCapture;
    private int lensFacing = CameraSelector.LENS_FACING_BACK;
    private int flashMode = ImageCapture.FLASH_MODE_AUTO;
    private String scanMode = "doc";

    private ActivityResultLauncher<String> permLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_in_app_camera);

        viewFinder = findViewById(R.id.view_finder);
        viewScanGuide = findViewById(R.id.view_scan_guide);
        tvTitle = findViewById(R.id.tv_cam_title);
        tvHint = findViewById(R.id.tv_cam_hint);
        btnFlash = findViewById(R.id.btn_cam_flash);
        btnSwitch = findViewById(R.id.btn_cam_switch);
        btnShutter = findViewById(R.id.btn_cam_shutter);

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

                CameraSelector selector = new CameraSelector.Builder()
                        .requireLensFacing(lensFacing)
                        .build();

                provider.unbindAll();
                provider.bindToLifecycle(this, selector, preview, imageCapture);
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

    private void capturePhoto() {
        if (imageCapture == null) {
            Toast.makeText(this, "ক্যামেরা প্রস্তুত হচ্ছে...", Toast.LENGTH_SHORT).show();
            return;
        }

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
                        Intent data = new Intent();
                        data.setData(fileUri);
                        data.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        setResult(RESULT_OK, data);
                        finish();
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException exception) {
                        btnShutter.setEnabled(true);
                        btnShutter.setText("📸 ছবি তুলুন / স্ক্যান করুন");
                        Toast.makeText(InAppCameraActivity.this,
                                "ছবি তোলা ব্যর্থ: " + exception.getMessage(),
                                Toast.LENGTH_SHORT).show();
                    }
                }
        );
    }
}


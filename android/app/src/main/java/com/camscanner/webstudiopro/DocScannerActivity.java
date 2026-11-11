package com.camscanner.webstudiopro;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DocScannerActivity extends AppCompatActivity {

    private final List<Bitmap> rawPages = new ArrayList<>();
    private final List<Bitmap> filteredPages = new ArrayList<>();
    private int currentFilterMode = 1; // Default: Magic Color

    private ImageView ivPreview;
    private TextView tvEmpty;
    private TextView tvCount;

    private Uri pendingCameraUri;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Uri> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_doc_scanner);

        ivPreview = findViewById(R.id.iv_doc_preview);
        tvEmpty = findViewById(R.id.tv_doc_empty);
        tvCount = findViewById(R.id.tv_doc_count);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            if (ok && pendingCameraUri != null) {
                loadUriPage(pendingCameraUri);
            }
        });

        galleryLauncher = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) {
                loadUriPage(uri);
            }
        });

        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) launchNativeCamera();
            else Toast.makeText(this, "ক্যামেরা পারমিশন প্রয়োজন!", Toast.LENGTH_SHORT).show();
        });

        findViewById(R.id.btn_doc_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_doc_camera).setOnClickListener(v -> checkCameraAndLaunch());
        findViewById(R.id.btn_doc_gallery).setOnClickListener(v -> galleryLauncher.launch("image/*"));

        findViewById(R.id.btn_doc_rotate).setOnClickListener(v -> rotateLastPage());
        findViewById(R.id.btn_filter_orig).setOnClickListener(v -> setFilter(0));
        findViewById(R.id.btn_filter_magic).setOnClickListener(v -> setFilter(1));
        findViewById(R.id.btn_filter_bw).setOnClickListener(v -> setFilter(2));

        findViewById(R.id.btn_doc_save_pdf).setOnClickListener(v -> saveCurrentPdf());
        findViewById(R.id.btn_doc_print).setOnClickListener(v -> printCurrentPage());
    }

    private void checkCameraAndLaunch() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchNativeCamera();
        } else {
            cameraPermLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchNativeCamera() {
        try {
            File tmp = new File(getCacheDir(), "doc_" + System.currentTimeMillis() + ".jpg");
            pendingCameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", tmp);
            cameraLauncher.launch(pendingCameraUri);
        } catch (Exception e) {
            Toast.makeText(this, "ক্যামেরা চালু করা যায়নি", Toast.LENGTH_SHORT).show();
        }
    }

    private void loadUriPage(Uri uri) {
        executor.execute(() -> {
            Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 1600);
            if (bmp == null) return;
            Bitmap proc = NativeImageUtils.applyDocFilter(bmp, currentFilterMode);
            runOnUiThread(() -> {
                rawPages.add(bmp);
                filteredPages.add(proc);
                refreshPreview();
            });
        });
    }

    private void setFilter(int mode) {
        currentFilterMode = mode;
        if (rawPages.isEmpty()) return;
        executor.execute(() -> {
            int last = rawPages.size() - 1;
            Bitmap proc = NativeImageUtils.applyDocFilter(rawPages.get(last), mode);
            runOnUiThread(() -> {
                filteredPages.set(last, proc);
                refreshPreview();
            });
        });
    }

    private void rotateLastPage() {
        if (rawPages.isEmpty()) return;
        int last = rawPages.size() - 1;
        Bitmap rotated = NativeImageUtils.rotateBitmap(rawPages.get(last), 90);
        rawPages.set(last, rotated);
        setFilter(currentFilterMode);
    }

    private void refreshPreview() {
        tvCount.setText(filteredPages.size() + " পেজ");
        if (filteredPages.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            ivPreview.setImageDrawable(null);
        } else {
            tvEmpty.setVisibility(View.GONE);
            ivPreview.setImageBitmap(filteredPages.get(filteredPages.size() - 1));
        }
    }

    private void saveCurrentPdf() {
        if (filteredPages.isEmpty()) {
            Toast.makeText(this, "প্রথমে অন্তত একটি ডকুমেন্ট ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            try {
                String name = "camlab_Doc_" + System.currentTimeMillis() + ".pdf";
                File saved = NativePdfUtils.saveBitmapsToPdf(this, new ArrayList<>(filteredPages), name, true);
                runOnUiThread(() -> {
                    Toast.makeText(this, "✅ PDF সংরক্ষিত হয়েছে: Downloads/camlab/" + name, Toast.LENGTH_LONG).show();
                    if (saved != null) NativePdfUtils.shareFile(this, saved, "application/pdf");
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "ত্রুটি: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void printCurrentPage() {
        if (filteredPages.isEmpty()) {
            Toast.makeText(this, "প্রথমে একটি ডকুমেন্ট ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        NativePdfUtils.printBitmap(this, filteredPages.get(filteredPages.size() - 1), "camlab_Document", true);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}

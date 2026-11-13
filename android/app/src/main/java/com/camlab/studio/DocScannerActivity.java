package com.camlab.studio;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
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
import androidx.appcompat.app.AlertDialog;
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
    private int currentPageIdx = 0;
    private int currentFilterMode = 1; // Default: Magic Color

    private ImageView ivPreview;
    private TextView tvEmpty;
    private TextView tvCount;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Intent> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_doc_scanner);

        ivPreview = findViewById(R.id.iv_doc_preview);
        tvEmpty = findViewById(R.id.tv_doc_empty);
        tvCount = findViewById(R.id.tv_doc_count);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), res -> {
            if (res.getResultCode() == RESULT_OK && res.getData() != null && res.getData().getData() != null) {
                loadUriPage(res.getData().getData());
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

        findViewById(R.id.btn_doc_prev).setOnClickListener(v -> navigatePage(-1));
        findViewById(R.id.btn_doc_next).setOnClickListener(v -> navigatePage(1));
        findViewById(R.id.btn_doc_del_page).setOnClickListener(v -> deleteCurrentPage());

        findViewById(R.id.btn_doc_autocrop).setOnClickListener(v -> autoCropLastPage());
        findViewById(R.id.btn_doc_book_split).setOnClickListener(v -> splitCurrentBookPage());
        findViewById(R.id.btn_doc_eraser).setOnClickListener(v -> eraseSmudgesOnCurrentPage());
        findViewById(R.id.btn_doc_rotate).setOnClickListener(v -> rotateLastPage());
        findViewById(R.id.btn_doc_ocr).setOnClickListener(v -> runOcrOnLastPage());

        findViewById(R.id.btn_filter_orig).setOnClickListener(v -> setFilter(0));
        findViewById(R.id.btn_filter_magic).setOnClickListener(v -> setFilter(1));
        findViewById(R.id.btn_filter_bw).setOnClickListener(v -> setFilter(2));
        findViewById(R.id.btn_filter_bw2).setOnClickListener(v -> setFilter(3));
        findViewById(R.id.btn_filter_gray).setOnClickListener(v -> setFilter(4));
        findViewById(R.id.btn_filter_light).setOnClickListener(v -> setFilter(5));

        findViewById(R.id.btn_doc_save_pdf).setOnClickListener(v -> saveCurrentPdf());
        findViewById(R.id.btn_doc_long_img).setOnClickListener(v -> saveLongImage());
        findViewById(R.id.btn_doc_print).setOnClickListener(v -> printCurrentPage());
    }

    private void navigatePage(int delta) {
        if (filteredPages.isEmpty()) return;
        currentPageIdx = Math.max(0, Math.min(filteredPages.size() - 1, currentPageIdx + delta));
        refreshPreview();
    }

    private void deleteCurrentPage() {
        if (filteredPages.isEmpty()) return;
        rawPages.remove(currentPageIdx);
        filteredPages.remove(currentPageIdx);
        if (currentPageIdx >= filteredPages.size() && currentPageIdx > 0) {
            currentPageIdx = filteredPages.size() - 1;
        }
        refreshPreview();
        Toast.makeText(this, "🗑️ পেজ মুছে ফেলা হয়েছে", Toast.LENGTH_SHORT).show();
    }

    private void splitCurrentBookPage() {
        if (rawPages.isEmpty()) {
            Toast.makeText(this, "আগে একটি বইয়ের পেজ স্ক্যান করুন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            Bitmap src = rawPages.get(currentPageIdx);
            Bitmap[] halves = NativeImageUtils.splitBookPages(src);
            if (halves.length == 2) {
                Bitmap leftProc = NativeImageUtils.applyDocFilter(halves[0], currentFilterMode);
                Bitmap rightProc = NativeImageUtils.applyDocFilter(halves[1], currentFilterMode);
                runOnUiThread(() -> {
                    rawPages.set(currentPageIdx, halves[0]);
                    filteredPages.set(currentPageIdx, leftProc);
                    rawPages.add(currentPageIdx + 1, halves[1]);
                    filteredPages.add(currentPageIdx + 1, rightProc);
                    refreshPreview();
                    Toast.makeText(this, "📖 বইয়ের বাম ও ডান পেজ ২ ভাগে আলাদা হয়েছে!", Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void eraseSmudgesOnCurrentPage() {
        if (filteredPages.isEmpty()) {
            Toast.makeText(this, "আগে একটি ডকুমেন্ট স্ক্যান করুন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            Bitmap cleaned = NativeImageUtils.smartEraseClean(filteredPages.get(currentPageIdx));
            runOnUiThread(() -> {
                filteredPages.set(currentPageIdx, cleaned);
                refreshPreview();
                Toast.makeText(this, "🧹 স্মার্ট ইরেজার: দাগ ও ছায়া পরিষ্কার হয়েছে!", Toast.LENGTH_SHORT).show();
            });
        });
    }

    private void saveLongImage() {
        if (filteredPages.isEmpty()) {
            Toast.makeText(this, "প্রথমে অন্তত একটি ডকুমেন্ট ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            try {
                String name = "camlab_LongImage_" + System.currentTimeMillis() + ".jpg";
                File saved = NativePdfUtils.exportLongImage(this, new ArrayList<>(filteredPages), name);
                runOnUiThread(() -> {
                    Toast.makeText(this, "✅ লং ইমেজ সেভ হয়েছে: Downloads/camlab/" + name, Toast.LENGTH_LONG).show();
                    if (saved != null) NativePdfUtils.shareFile(this, saved, "image/jpeg");
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "ত্রুটি: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void checkCameraAndLaunch() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchNativeCamera();
        } else {
            cameraPermLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchNativeCamera() {
        Intent intent = new Intent(this, InAppCameraActivity.class);
        intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, "doc");
        cameraLauncher.launch(intent);
    }

    private void loadUriPage(Uri uri) {
        executor.execute(() -> {
            Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 1600);
            if (bmp == null) return;
            Bitmap cropped = NativeImageUtils.autoPerspectiveCropDoc(bmp);
            Bitmap proc = NativeImageUtils.applyDocFilter(cropped, currentFilterMode);
            runOnUiThread(() -> {
                rawPages.add(cropped);
                filteredPages.add(proc);
                currentPageIdx = filteredPages.size() - 1;
                refreshPreview();
            });
        });
    }

    private void autoCropLastPage() {
        if (rawPages.isEmpty()) return;
        executor.execute(() -> {
            int last = currentPageIdx;
            Bitmap cropped = NativeImageUtils.autoPerspectiveCropDoc(rawPages.get(last));
            Bitmap proc = NativeImageUtils.applyDocFilter(cropped, currentFilterMode);
            runOnUiThread(() -> {
                rawPages.set(last, cropped);
                filteredPages.set(last, proc);
                refreshPreview();
                Toast.makeText(this, "✂️ অটো বর্ডার ক্রপ সম্পন্ন!", Toast.LENGTH_SHORT).show();
            });
        });
    }

    private void runOcrOnLastPage() {
        if (filteredPages.isEmpty()) {
            Toast.makeText(this, "প্রথমে একটি ডকুমেন্ট ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        Toast.makeText(this, "🔤 অফলাইন OCR টেক্সট পড়া হচ্ছে...", Toast.LENGTH_SHORT).show();
        executor.execute(() -> {
            String txt = NativeImageUtils.extractTextOCR(filteredPages.get(currentPageIdx));
            runOnUiThread(() -> {
                String msg = txt.trim().isEmpty() ? "কোনো স্পষ্ট লেখা পাওয়া যায়নি।" : txt.trim();
                new AlertDialog.Builder(this)
                        .setTitle("🔤 OCR প্রাপ্ত লেখা")
                        .setMessage(msg)
                        .setPositiveButton("📋 কপি করুন", (d, w) -> {
                            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            if (cm != null) {
                                cm.setPrimaryClip(ClipData.newPlainText("camlab OCR", msg));
                                Toast.makeText(this, "টেক্সট কপি করা হয়েছে!", Toast.LENGTH_SHORT).show();
                            }
                        })
                        .setNeutralButton("📝 Word (.doc)", (d, w) -> {
                            executor.execute(() -> {
                                try {
                                    String docName = "camlab_Word_" + System.currentTimeMillis() + ".doc";
                                    NativePdfUtils.exportToWordDoc(this, "camlab Scanned Document", msg, docName);
                                    runOnUiThread(() -> Toast.makeText(this, "✅ Word সেভ হয়েছে: " + docName, Toast.LENGTH_LONG).show());
                                } catch (Exception ignored) {}
                            });
                        })
                        .setNegativeButton("বন্ধ", null)
                        .show();
            });
        });
    }

    private void setFilter(int mode) {
        currentFilterMode = mode;
        if (rawPages.isEmpty()) return;
        executor.execute(() -> {
            int last = currentPageIdx;
            Bitmap proc = NativeImageUtils.applyDocFilter(rawPages.get(last), mode);
            runOnUiThread(() -> {
                filteredPages.set(last, proc);
                refreshPreview();
            });
        });
    }

    private void rotateLastPage() {
        if (rawPages.isEmpty()) return;
        int last = currentPageIdx;
        Bitmap rotated = NativeImageUtils.rotateBitmap(rawPages.get(last), 90);
        rawPages.set(last, rotated);
        setFilter(currentFilterMode);
    }

    private void refreshPreview() {
        if (filteredPages.isEmpty()) {
            tvCount.setText("0 পেজ");
            tvEmpty.setVisibility(View.VISIBLE);
            ivPreview.setImageDrawable(null);
        } else {
            currentPageIdx = Math.max(0, Math.min(filteredPages.size() - 1, currentPageIdx));
            tvCount.setText((currentPageIdx + 1) + " / " + filteredPages.size() + " পেজ");
            tvEmpty.setVisibility(View.GONE);
            ivPreview.setImageBitmap(filteredPages.get(currentPageIdx));
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


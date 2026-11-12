package com.camscanner.webstudiopro;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.SeekBar;
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

/**
 * PDF Tools Activity — matches the Web App's PDF Tools screen.
 * Features: Import multiple images → Merge to PDF, Compress quality, Image-to-PDF conversion.
 * All processing is fully offline using NativePdfUtils.
 */
public class PdfToolsActivity extends AppCompatActivity {

    private final List<Bitmap> importedPages = new ArrayList<>();
    private TextView tvPageCount, tvStatus;
    private ProgressBar pbTools;
    private SeekBar sbQuality;
    private TextView tvQualityVal;
    private Button btnImport, btnClearAll, btnMergePdf, btnCompressPdf;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<String[]> multiGalleryLauncher;
    private ActivityResultLauncher<Intent> cameraLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_pdf_tools);

        tvPageCount = findViewById(R.id.tv_pdf_page_count);
        tvStatus = findViewById(R.id.tv_pdf_status);
        pbTools = findViewById(R.id.pb_pdf_tools);
        sbQuality = findViewById(R.id.sb_pdf_quality);
        tvQualityVal = findViewById(R.id.tv_pdf_quality_val);
        btnImport = findViewById(R.id.btn_pdf_import);
        btnClearAll = findViewById(R.id.btn_pdf_clear);
        btnMergePdf = findViewById(R.id.btn_pdf_merge);
        btnCompressPdf = findViewById(R.id.btn_pdf_compress);

        multiGalleryLauncher = registerForActivityResult(
                new ActivityResultContracts.OpenMultipleDocuments(),
                uris -> {
                    if (uris != null && !uris.isEmpty()) loadMultipleUris(uris);
                }
        );
        cameraLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                res -> {
                    if (res.getResultCode() == RESULT_OK && res.getData() != null && res.getData().getData() != null) {
                        java.util.List<Uri> single = new ArrayList<>();
                        single.add(res.getData().getData());
                        loadMultipleUris(single);
                    }
                }
        );
        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) {
                Intent intent = new Intent(this, InAppCameraActivity.class);
                intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, "doc");
                cameraLauncher.launch(intent);
            }
        });

        sbQuality.setMax(85);
        sbQuality.setProgress(60); // Default 70% quality
        tvQualityVal.setText("৭০%");
        sbQuality.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                tvQualityVal.setText((progress + 10) + "%");
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });

        findViewById(R.id.btn_pdf_back).setOnClickListener(v -> finish());

        findViewById(R.id.btn_pdf_camera).setOnClickListener(v -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                Intent intent = new Intent(this, InAppCameraActivity.class);
                intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, "doc");
                cameraLauncher.launch(intent);
            } else {
                cameraPermLauncher.launch(Manifest.permission.CAMERA);
            }
        });

        btnImport.setOnClickListener(v -> {
            multiGalleryLauncher.launch(new String[]{"image/*", "application/pdf"});
        });

        btnClearAll.setOnClickListener(v -> {
            importedPages.clear();
            updatePageCount();
            tvStatus.setText("সব পেজ সরানো হয়েছে");
        });

        btnMergePdf.setOnClickListener(v -> mergePagesToPdf());
        btnCompressPdf.setOnClickListener(v -> compressPagesToLightPdf());

        // Share existing PDF
        findViewById(R.id.btn_pdf_share_last).setOnClickListener(v -> shareLastExport());

        updatePageCount();
    }

    private void loadMultipleUris(List<Uri> uris) {
        setLoading(true, uris.size() + "টি ফাইল লোড হচ্ছে...");
        executor.execute(() -> {
            int loaded = 0;
            for (Uri uri : uris) {
                // Take persistent permission to read this URI
                try {
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 2000);
                if (bmp != null) {
                    // Auto perspective crop for documents
                    Bitmap cropped = NativeImageUtils.autoPerspectiveCropDoc(bmp);
                    Bitmap proc = NativeImageUtils.applyDocFilter(cropped, 1);
                    importedPages.add(proc);
                    loaded++;
                }
            }
            final int finalLoaded = loaded;
            runOnUiThread(() -> {
                setLoading(false, "");
                updatePageCount();
                tvStatus.setText("✅ " + finalLoaded + "টি পেজ যোগ করা হয়েছে");
            });
        });
    }

    private void mergePagesToPdf() {
        if (importedPages.isEmpty()) {
            Toast.makeText(this, "আগে ছবি বা পেজ ইমপোর্ট করুন", Toast.LENGTH_SHORT).show();
            return;
        }
        setLoading(true, "PDF তৈরি হচ্ছে (" + importedPages.size() + " পেজ)...");
        final List<Bitmap> pages = new ArrayList<>(importedPages);
        executor.execute(() -> {
            try {
                String name = "camlab_Merged_" + System.currentTimeMillis() + ".pdf";
                File f = NativePdfUtils.saveBitmapsToPdf(this, pages, name, true);
                long sizeKb = f != null ? f.length() / 1024 : 0;
                runOnUiThread(() -> {
                    setLoading(false, "");
                    tvStatus.setText("✅ PDF তৈরি হয়েছে: " + name + " (" + sizeKb + " KB)");
                    Toast.makeText(this, "✅ " + pages.size() + " পেজের PDF সংরক্ষিত!", Toast.LENGTH_LONG).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false, "");
                    tvStatus.setText("❌ PDF তৈরি ব্যর্থ: " + e.getMessage());
                });
            }
        });
    }

    private void compressPagesToLightPdf() {
        if (importedPages.isEmpty()) {
            Toast.makeText(this, "আগে ছবি বা পেজ ইমপোর্ট করুন", Toast.LENGTH_SHORT).show();
            return;
        }
        int quality = sbQuality.getProgress() + 10; // 10–95
        setLoading(true, "কম্প্রেস করা হচ্ছে (গুণমান " + quality + "%)...");
        final List<Bitmap> pages = new ArrayList<>(importedPages);
        final int q = quality;
        executor.execute(() -> {
            try {
                // Compress each page bitmap first, then merge to PDF
                List<Bitmap> compressed = new ArrayList<>();
                for (Bitmap bmp : pages) {
                    // Scale down if too large
                    int maxSide = 1600;
                    Bitmap scaled = bmp;
                    if (bmp.getWidth() > maxSide || bmp.getHeight() > maxSide) {
                        float scale = (float) maxSide / Math.max(bmp.getWidth(), bmp.getHeight());
                        scaled = Bitmap.createScaledBitmap(bmp,
                                Math.round(bmp.getWidth() * scale),
                                Math.round(bmp.getHeight() * scale), true);
                    }
                    // Re-compress through JPEG to reduce size
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    scaled.compress(Bitmap.CompressFormat.JPEG, q, baos);
                    byte[] bytes = baos.toByteArray();
                    Bitmap reloaded = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    compressed.add(reloaded != null ? reloaded : scaled);
                }
                String name = "camlab_Compressed_" + q + "pct_" + System.currentTimeMillis() + ".pdf";
                File f = NativePdfUtils.saveBitmapsToPdf(this, compressed, name, true);
                long origKb = pages.stream().mapToLong(b -> b.getByteCount() / 1024L).sum() / pages.size();
                long sizeKb = f != null ? f.length() / 1024 : 0;
                runOnUiThread(() -> {
                    setLoading(false, "");
                    tvStatus.setText("✅ কম্প্রেসড PDF: " + sizeKb + " KB (গুণমান " + q + "%)");
                    Toast.makeText(this, "✅ কম্প্রেসড PDF সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> { setLoading(false, ""); tvStatus.setText("❌ কম্প্রেস ব্যর্থ"); });
            }
        });
    }

    private void shareLastExport() {
        File dir = NativePdfUtils.getExportsDir(this);
        File[] files = dir.listFiles(f -> f.getName().endsWith(".pdf"));
        if (files == null || files.length == 0) {
            Toast.makeText(this, "কোনো PDF পাওয়া যায়নি", Toast.LENGTH_SHORT).show();
            return;
        }
        // Find the most recent
        File latest = files[0];
        for (File f : files) if (f.lastModified() > latest.lastModified()) latest = f;
        try {
            NativePdfUtils.shareFile(this, latest, "application/pdf");
        } catch (Exception e) {
            Toast.makeText(this, "শেয়ার করা যায়নি", Toast.LENGTH_SHORT).show();
        }
    }

    private void updatePageCount() {
        int n = importedPages.size();
        tvPageCount.setText(n + " টি পেজ / ছবি");
        btnMergePdf.setEnabled(n > 0);
        btnCompressPdf.setEnabled(n > 0);
        btnClearAll.setEnabled(n > 0);
    }

    private void setLoading(boolean loading, String msg) {
        pbTools.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (!msg.isEmpty()) tvStatus.setText(msg);
        btnImport.setEnabled(!loading);
        btnMergePdf.setEnabled(!loading && !importedPages.isEmpty());
        btnCompressPdf.setEnabled(!loading && !importedPages.isEmpty());
    }
}


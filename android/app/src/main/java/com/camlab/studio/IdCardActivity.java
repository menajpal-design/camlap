package com.camlab.studio;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
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

/**
 * ID Card (2-Sided) Activity
 * Scans / imports front and back of an ID card, lays them side-by-side on A4 paper at 1:1 scale,
 * and exports to PDF or image — matching the Web App's ID Card (২-সাইড) screen exactly.
 */
public class IdCardActivity extends AppCompatActivity {

    private Bitmap frontBitmap;
    private Bitmap backBitmap;
    private Bitmap sheetBitmap;

    private ImageView ivFront, ivBack, ivSheet;
    private TextView tvFrontLabel, tvBackLabel, tvSheetInfo;
    private Button btnFrontCamera, btnFrontGallery, btnBackCamera, btnBackGallery;
    private Button btnAutoCropFront, btnAutoCropBack, btnGenerateSheet;

    private boolean capturingFront = true;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Intent> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_id_card);

        ivFront = findViewById(R.id.iv_id_front);
        ivBack = findViewById(R.id.iv_id_back);
        ivSheet = findViewById(R.id.iv_id_sheet);
        tvFrontLabel = findViewById(R.id.tv_id_front_label);
        tvBackLabel = findViewById(R.id.tv_id_back_label);
        tvSheetInfo = findViewById(R.id.tv_id_sheet_info);
        btnFrontCamera = findViewById(R.id.btn_id_front_camera);
        btnFrontGallery = findViewById(R.id.btn_id_front_gallery);
        btnBackCamera = findViewById(R.id.btn_id_back_camera);
        btnBackGallery = findViewById(R.id.btn_id_back_gallery);
        btnAutoCropFront = findViewById(R.id.btn_id_autocrop_front);
        btnAutoCropBack = findViewById(R.id.btn_id_autocrop_back);
        btnGenerateSheet = findViewById(R.id.btn_id_generate_sheet);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), res -> {
            if (res.getResultCode() == RESULT_OK && res.getData() != null && res.getData().getData() != null) {
                loadUriAsCard(res.getData().getData(), capturingFront);
            }
        });
        galleryLauncher = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) loadUriAsCard(uri, capturingFront);
        });
        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) launchCamera();
            else Toast.makeText(this, "ক্যামেরা পারমিশন প্রয়োজন!", Toast.LENGTH_SHORT).show();
        });

        findViewById(R.id.btn_id_back).setOnClickListener(v -> finish());

        btnFrontCamera.setOnClickListener(v -> { capturingFront = true; checkCameraAndLaunch(); });
        btnFrontGallery.setOnClickListener(v -> { capturingFront = true; galleryLauncher.launch("image/*"); });
        btnBackCamera.setOnClickListener(v -> { capturingFront = false; checkCameraAndLaunch(); });
        btnBackGallery.setOnClickListener(v -> { capturingFront = false; galleryLauncher.launch("image/*"); });

        btnAutoCropFront.setOnClickListener(v -> {
            if (frontBitmap == null) { Toast.makeText(this, "আগে সামনের ছবি নিন", Toast.LENGTH_SHORT).show(); return; }
            executor.execute(() -> {
                Bitmap cropped = NativeImageUtils.autoPerspectiveCropDoc(frontBitmap);
                runOnUiThread(() -> { frontBitmap = cropped; ivFront.setImageBitmap(frontBitmap); generateSheetPreview(); });
            });
        });

        btnAutoCropBack.setOnClickListener(v -> {
            if (backBitmap == null) { Toast.makeText(this, "আগে পেছনের ছবি নিন", Toast.LENGTH_SHORT).show(); return; }
            executor.execute(() -> {
                Bitmap cropped = NativeImageUtils.autoPerspectiveCropDoc(backBitmap);
                runOnUiThread(() -> { backBitmap = cropped; ivBack.setImageBitmap(backBitmap); generateSheetPreview(); });
            });
        });

        btnGenerateSheet.setOnClickListener(v -> {
            if (frontBitmap == null && backBitmap == null) {
                Toast.makeText(this, "কমপক্ষে একটি ছবি নিন", Toast.LENGTH_SHORT).show();
                return;
            }
            generateSheetPreview();
        });

        findViewById(R.id.btn_id_save_pdf).setOnClickListener(v -> saveIdCardPdf());
        findViewById(R.id.btn_id_save_img).setOnClickListener(v -> saveIdCardImage());
        findViewById(R.id.btn_id_print).setOnClickListener(v -> printIdSheet());

        updateLabels();
    }

    private void checkCameraAndLaunch() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera();
        } else {
            cameraPermLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchCamera() {
        Intent intent = new Intent(this, InAppCameraActivity.class);
        intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, capturingFront ? "id_front" : "id_back");
        cameraLauncher.launch(intent);
    }

    private void loadUriAsCard(Uri uri, boolean isFront) {
        tvSheetInfo.setText("ছবি লোড হচ্ছে...");
        executor.execute(() -> {
            Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 2000);
            if (bmp == null) { runOnUiThread(() -> Toast.makeText(this, "ছবি খোলা যায়নি", Toast.LENGTH_SHORT).show()); return; }
            Bitmap proc = NativeImageUtils.applyDocFilter(bmp, 1); // Magic Color filter
            runOnUiThread(() -> {
                if (isFront) { frontBitmap = proc; ivFront.setImageBitmap(proc); }
                else { backBitmap = proc; ivBack.setImageBitmap(proc); }
                updateLabels();
                generateSheetPreview();
            });
        });
    }

    private void updateLabels() {
        tvFrontLabel.setText(frontBitmap != null ? "✅ সামনের দিক (Front)" : "📷 সামনের দিক (Front)");
        tvBackLabel.setText(backBitmap != null ? "✅ পেছনের দিক (Back)" : "📷 পেছনের দিক (Back)");
    }

    private void generateSheetPreview() {
        // A4 at 150 DPI: 1240×1754 px
        int sheetW = 1240, sheetH = 1754;
        float margin = 60f;
        float gap = 40f;
        float cardAreaW = sheetW - margin * 2f;
        float cardH = (sheetH - margin * 2f - gap) / 2f;

        Bitmap sheet = Bitmap.createBitmap(sheetW, sheetH, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(sheet);
        c.drawColor(Color.WHITE);

        Paint imgPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        Paint borderPaint = new Paint();
        borderPaint.setColor(Color.parseColor("#CBD5E1"));
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(2f);

        Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        labelPaint.setColor(Color.parseColor("#64748B"));
        labelPaint.setTextSize(32f);

        // Front card slot (top half)
        RectF frontRect = new RectF(margin, margin, margin + cardAreaW, margin + cardH);
        if (frontBitmap != null) {
            float scale = Math.min(cardAreaW / frontBitmap.getWidth(), cardH / frontBitmap.getHeight());
            float dw = frontBitmap.getWidth() * scale;
            float dh = frontBitmap.getHeight() * scale;
            float dx = frontRect.left + (cardAreaW - dw) / 2f;
            float dy = frontRect.top + (cardH - dh) / 2f;
            c.drawBitmap(frontBitmap, null, new RectF(dx, dy, dx + dw, dy + dh), imgPaint);
        } else {
            c.drawText("সামনের দিক এখানে", margin + 20, margin + cardH / 2f, labelPaint);
        }
        c.drawRect(frontRect, borderPaint);

        // Back card slot (bottom half)
        RectF backRect = new RectF(margin, margin + cardH + gap, margin + cardAreaW, margin + cardH * 2f + gap);
        if (backBitmap != null) {
            float scale = Math.min(cardAreaW / backBitmap.getWidth(), cardH / backBitmap.getHeight());
            float dw = backBitmap.getWidth() * scale;
            float dh = backBitmap.getHeight() * scale;
            float dx = backRect.left + (cardAreaW - dw) / 2f;
            float dy = backRect.top + (cardH - dh) / 2f;
            c.drawBitmap(backBitmap, null, new RectF(dx, dy, dx + dw, dy + dh), imgPaint);
        } else {
            c.drawText("পেছনের দিক এখানে", margin + 20, backRect.top + cardH / 2f, labelPaint);
        }
        c.drawRect(backRect, borderPaint);

        // Footer
        Paint footerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        footerPaint.setColor(Color.parseColor("#94A3B8"));
        footerPaint.setTextSize(28f);
        c.drawText("camlab ID Card Studio | A4 Sheet (210×297 mm)", margin, sheetH - 40f, footerPaint);

        sheetBitmap = sheet;
        ivSheet.setImageBitmap(sheetBitmap);
        int cnt = (frontBitmap != null ? 1 : 0) + (backBitmap != null ? 1 : 0);
        tvSheetInfo.setText("A4 প্রিভিউ — " + cnt + "/২ ছবি সেট করা হয়েছে");
    }

    private void saveIdCardPdf() {
        if (sheetBitmap == null) { generateSheetPreview(); if (sheetBitmap == null) return; }
        tvSheetInfo.setText("PDF সংরক্ষণ হচ্ছে...");
        final Bitmap finalSheet = sheetBitmap;
        executor.execute(() -> {
            try {
                List<Bitmap> pages = new ArrayList<>();
                pages.add(finalSheet);
                String name = "camlab_IDCard_" + System.currentTimeMillis() + ".pdf";
                File f = NativePdfUtils.saveBitmapsToPdf(this, pages, name, true);
                runOnUiThread(() -> {
                    tvSheetInfo.setText("✅ সংরক্ষিত: " + (f != null ? f.getName() : "?"));
                    Toast.makeText(this, "✅ ID কার্ড PDF সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "সংরক্ষণ ব্যর্থ: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private void saveIdCardImage() {
        if (sheetBitmap == null) { generateSheetPreview(); if (sheetBitmap == null) return; }
        tvSheetInfo.setText("ছবি সংরক্ষণ হচ্ছে...");
        final Bitmap finalSheet = sheetBitmap;
        executor.execute(() -> {
            try {
                String name = "camlab_IDCard_" + System.currentTimeMillis() + ".jpg";
                NativePdfUtils.saveBitmapImage(this, finalSheet, name, Bitmap.CompressFormat.JPEG);
                runOnUiThread(() -> {
                    tvSheetInfo.setText("✅ JPG সংরক্ষিত!");
                    Toast.makeText(this, "✅ ID কার্ড JPG সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "সংরক্ষণ ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void printIdSheet() {
        if (sheetBitmap == null) { generateSheetPreview(); if (sheetBitmap == null) return; }
        NativePdfUtils.printBitmap(this, sheetBitmap, "camlab ID Card", true);
    }
}


package com.camscanner.webstudiopro;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PassportStudioActivity extends AppCompatActivity {

    private Bitmap rawBitmap;
    private NativeImageUtils.PortraitInfo portraitInfo;
    private Bitmap croppedBitmap;
    private Bitmap sheetBitmap;

    private float userZoom = 1.0f;
    private float panX = 0f;
    private float panY = 0f;
    private int suitMode = 0; // 0=None, 1=Black Suit, 2=Navy Suit, 3=Womens Blazer
    private int bgColor = Color.WHITE;
    private boolean replaceBgEnabled = false;

    private int photosPerRow = 5;
    private int rowsCount = 2; // 0 = full A4 page

    private ImageView ivSingle;
    private ImageView ivA4Preview;
    private TextView tvAiStatus;
    private TextView tvAttire;

    private Uri pendingCameraUri;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Uri> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @SuppressLint("ClickableViewAccessibility")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_passport_studio);

        ivSingle = findViewById(R.id.iv_pp_single);
        ivA4Preview = findViewById(R.id.iv_a4_preview);
        tvAiStatus = findViewById(R.id.tv_pp_ai_status);
        tvAttire = findViewById(R.id.tv_pp_attire);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            if (ok && pendingCameraUri != null) loadPortraitUri(pendingCameraUri);
        });
        galleryLauncher = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) loadPortraitUri(uri);
        });
        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) launchCamera();
            else Toast.makeText(this, "ক্যামেরা পারমিশন প্রয়োজন!", Toast.LENGTH_SHORT).show();
        });

        findViewById(R.id.btn_pp_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_pp_camera).setOnClickListener(v -> checkCameraAndLaunch());
        findViewById(R.id.btn_pp_gallery).setOnClickListener(v -> galleryLauncher.launch("image/*"));

        // Touch drag pan on single photo
        final float[] lastTouch = new float[2];
        ivSingle.setOnTouchListener((v, event) -> {
            if (rawBitmap == null) return false;
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                v.getParent().requestDisallowInterceptTouchEvent(true);
                lastTouch[0] = event.getX();
                lastTouch[1] = event.getY();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_MOVE) {
                panX += (event.getX() - lastTouch[0]) * 1.6f;
                panY += (event.getY() - lastTouch[1]) * 1.6f;
                lastTouch[0] = event.getX();
                lastTouch[1] = event.getY();
                reRenderPassport();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                v.getParent().requestDisallowInterceptTouchEvent(false);
            }
            return false;
        });

        findViewById(R.id.btn_gender_male).setOnClickListener(v -> {
            if (portraitInfo != null) {
                portraitInfo.isFemale = false;
                portraitInfo.genderLabelBn = "ছেলে / পুরুষ";
                if (suitMode == 3) suitMode = 1;
                updateAiTexts();
                reRenderPassport();
            }
        });
        findViewById(R.id.btn_gender_female).setOnClickListener(v -> {
            if (portraitInfo != null) {
                portraitInfo.isFemale = true;
                portraitInfo.genderLabelBn = "মেয়ে / নারী";
                if (suitMode == 1 || suitMode == 2) suitMode = 3;
                updateAiTexts();
                reRenderPassport();
            }
        });

        findViewById(R.id.btn_pp_zoom_in).setOnClickListener(v -> {
            userZoom = Math.min(2.4f, userZoom + 0.08f);
            reRenderPassport();
        });
        findViewById(R.id.btn_pp_zoom_out).setOnClickListener(v -> {
            userZoom = Math.max(0.55f, userZoom - 0.08f);
            reRenderPassport();
        });

        findViewById(R.id.btn_suit_none).setOnClickListener(v -> { suitMode = 0; reRenderPassport(); });
        findViewById(R.id.btn_suit_black).setOnClickListener(v -> { suitMode = 1; reRenderPassport(); });
        findViewById(R.id.btn_suit_navy).setOnClickListener(v -> { suitMode = 2; reRenderPassport(); });
        findViewById(R.id.btn_suit_female).setOnClickListener(v -> { suitMode = 3; reRenderPassport(); });

        findViewById(R.id.btn_bg_white).setOnClickListener(v -> { bgColor = Color.WHITE; replaceBgEnabled = true; reRenderPassport(); });
        findViewById(R.id.btn_bg_sky).setOnClickListener(v -> { bgColor = Color.parseColor("#38BDF8"); replaceBgEnabled = true; reRenderPassport(); });
        findViewById(R.id.btn_bg_blue).setOnClickListener(v -> { bgColor = Color.parseColor("#1D4ED8"); replaceBgEnabled = true; reRenderPassport(); });
        findViewById(R.id.btn_bg_toggle).setOnClickListener(v -> { replaceBgEnabled = !replaceBgEnabled; reRenderPassport(); });

        setupSpinners();

        findViewById(R.id.btn_pp_save_single).setOnClickListener(v -> saveSinglePhoto());
        findViewById(R.id.btn_pp_save_pdf).setOnClickListener(v -> saveA4Pdf());
        findViewById(R.id.btn_pp_print).setOnClickListener(v -> printA4Sheet());
    }

    private void setupSpinners() {
        Spinner spPerRow = findViewById(R.id.sp_per_row);
        String[] perRowItems = new String[]{"২ টি", "৩ টি", "৪ টি", "৫ টি (A4 বেস্ট)", "৬ টি", "৭ টি"};
        ArrayAdapter<String> rowAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, perRowItems);
        spPerRow.setAdapter(rowAdapter);
        spPerRow.setSelection(3); // 5 photos per line default
        spPerRow.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                photosPerRow = pos + 2;
                reRenderSheetOnly();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        Spinner spRows = findViewById(R.id.sp_rows);
        String[] rowsItems = new String[]{"১ সারি", "২ সারি", "৩ সারি", "৪ সারি", "পুরো A4 পেপার"};
        ArrayAdapter<String> rowsAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, rowsItems);
        spRows.setAdapter(rowsAdapter);
        spRows.setSelection(1); // 2 rows default
        spRows.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                rowsCount = (pos == 4) ? 0 : (pos + 1);
                reRenderSheetOnly();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });
    }

    private void checkCameraAndLaunch() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera();
        } else {
            cameraPermLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchCamera() {
        try {
            File tmp = new File(getCacheDir(), "pp_" + System.currentTimeMillis() + ".jpg");
            pendingCameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", tmp);
            cameraLauncher.launch(pendingCameraUri);
        } catch (Exception e) {
            Toast.makeText(this, "ক্যামেরা চালু করা যায়নি", Toast.LENGTH_SHORT).show();
        }
    }

    private void loadPortraitUri(Uri uri) {
        tvAiStatus.setText("মুখ, ছেলে/মেয়ে, পোশাক ও গলার অংশ স্ক্যান হচ্ছে...");
        executor.execute(() -> {
            Bitmap loaded = NativeImageUtils.loadBitmapSafe(this, uri, 1200);
            if (loaded == null) return;
            NativeImageUtils.PortraitInfo info = NativeImageUtils.analyzePortrait(loaded);
            runOnUiThread(() -> {
                rawBitmap = loaded;
                portraitInfo = info;
                userZoom = 1.0f;
                panX = 0f;
                panY = 0f;
                updateAiTexts();
                reRenderPassport();
            });
        });
    }

    private void updateAiTexts() {
        if (portraitInfo == null) return;
        String faceTxt = portraitInfo.faceDetected ? "✓ মুখ ও গলা শনাক্ত" : "✓ ম্যানুয়াল ফ্রেম";
        tvAiStatus.setText(faceTxt + "  •  " + portraitInfo.genderLabelBn);
        tvAttire.setText(portraitInfo.attireLabelBn + " (ছবি টেনে পজিশন ঠিক করুন)");
    }

    private void reRenderPassport() {
        if (rawBitmap == null || portraitInfo == null) return;
        final Bitmap src = rawBitmap;
        final NativeImageUtils.PortraitInfo info = portraitInfo;
        final float zoom = userZoom, px = panX, py = panY;
        final int sm = suitMode, bg = bgColor;
        final boolean rbg = replaceBgEnabled;

        executor.execute(() -> {
            Bitmap single = NativeImageUtils.renderPassportPhoto(src, info, 413, 531, zoom, px, py, sm, bg, rbg); // 35x45mm @ 300 DPI
            Bitmap sheet = NativeImageUtils.composePrintSheet(single, 35f, 45f, true, photosPerRow, rowsCount, true);
            runOnUiThread(() -> {
                croppedBitmap = single;
                sheetBitmap = sheet;
                ivSingle.setImageBitmap(single);
                ivA4Preview.setImageBitmap(sheet);
            });
        });
    }

    private void reRenderSheetOnly() {
        if (croppedBitmap == null) return;
        final Bitmap single = croppedBitmap;
        final int ppr = photosPerRow, rc = rowsCount;
        executor.execute(() -> {
            Bitmap sheet = NativeImageUtils.composePrintSheet(single, 35f, 45f, true, ppr, rc, true);
            runOnUiThread(() -> {
                sheetBitmap = sheet;
                ivA4Preview.setImageBitmap(sheet);
            });
        });
    }

    private void saveSinglePhoto() {
        if (croppedBitmap == null) {
            Toast.makeText(this, "প্রথমে একটি ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            try {
                String name = "camlab_Passport_" + System.currentTimeMillis() + ".png";
                File saved = NativePdfUtils.saveBitmapImage(this, croppedBitmap, name, Bitmap.CompressFormat.PNG);
                runOnUiThread(() -> {
                    Toast.makeText(this, "✅ পাসপোর্ট ছবি সেভ হয়েছে: Downloads/camlab/" + name, Toast.LENGTH_LONG).show();
                    NativePdfUtils.shareFile(this, saved, "image/png");
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "সেভ ত্রুটি: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void saveA4Pdf() {
        if (sheetBitmap == null) {
            Toast.makeText(this, "প্রথমে একটি ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        executor.execute(() -> {
            try {
                String name = "camlab_Passport_A4_" + System.currentTimeMillis() + ".pdf";
                File saved = NativePdfUtils.saveBitmapsToPdf(this, Collections.singletonList(sheetBitmap), name, true);
                runOnUiThread(() -> {
                    Toast.makeText(this, "✅ A4 PDF তৈরি হয়েছে: Downloads/camlab/" + name, Toast.LENGTH_LONG).show();
                    if (saved != null) NativePdfUtils.shareFile(this, saved, "application/pdf");
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "PDF ত্রুটি: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void printA4Sheet() {
        if (sheetBitmap == null) {
            Toast.makeText(this, "প্রথমে একটি ছবি নিন!", Toast.LENGTH_SHORT).show();
            return;
        }
        NativePdfUtils.printBitmap(this, sheetBitmap, "camlab_Passport_A4", true);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}

package com.camscanner.webstudiopro;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
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
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PassportStudioActivity extends AppCompatActivity {

    private Bitmap rawBitmap;
    private Bitmap cutoutBitmap;
    private NativeImageUtils.PortraitInfo portraitInfo;
    private Bitmap croppedBitmap;
    private Bitmap sheetBitmap;

    private float userZoom = 1.0f;
    private float panX = 0f;
    private float panY = 0f;
    private int suitMode = 0; // 0=None, 1=Black Suit, 2=Navy Suit, 3=Womens Blazer
    private int bgColor = Color.WHITE;
    private boolean replaceBgEnabled = false;

    // Single Passport Photo Custom Dimensions & Orientation
    private float photoMmW = 35f;
    private float photoMmH = 45f;
    private boolean photoLandscape = false;

    // Main Sheet Custom Dimensions, Orientation & Tile Rotation
    private float sheetMmW = 210f;
    private float sheetMmH = 297f;
    private boolean sheetLandscape = false;
    private boolean tileLandscapeOnSheet = false;

    private int photosPerRow = 5;
    private int rowsCount = 2; // 0 = full sheet

    private ImageView ivSingle;
    private ImageView ivA4Preview;
    private TextView tvAiStatus;
    private TextView tvAttire;
    private TextView tvSheetSummary;
    private EditText etPhotoW, etPhotoH, etSheetW, etSheetH;
    private Spinner spPerRow;

    private Button btnGenderMale, btnGenderFemale;
    private Button btnPhotoPortrait, btnPhotoLandscape;
    private Button btnSuitNone, btnSuitBlack, btnSuitNavy, btnSuitFemale;
    private Button btnBgWhite, btnBgSky, btnBgBlue, btnBgToggle;
    private Button btnSheetPortrait, btnSheetLandscape;
    private Button btnTileUpright, btnTileLandscape;

    private boolean suppressSpinnerCallbacks = false;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Intent> cameraLauncher;
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
        tvSheetSummary = findViewById(R.id.tv_sheet_summary);

        etPhotoW = findViewById(R.id.et_photo_w_mm);
        etPhotoH = findViewById(R.id.et_photo_h_mm);
        etSheetW = findViewById(R.id.et_sheet_w_mm);
        etSheetH = findViewById(R.id.et_sheet_h_mm);

        btnGenderMale = findViewById(R.id.btn_gender_male);
        btnGenderFemale = findViewById(R.id.btn_gender_female);
        btnPhotoPortrait = findViewById(R.id.btn_photo_portrait);
        btnPhotoLandscape = findViewById(R.id.btn_photo_landscape);
        btnSuitNone = findViewById(R.id.btn_suit_none);
        btnSuitBlack = findViewById(R.id.btn_suit_black);
        btnSuitNavy = findViewById(R.id.btn_suit_navy);
        btnSuitFemale = findViewById(R.id.btn_suit_female);
        btnBgWhite = findViewById(R.id.btn_bg_white);
        btnBgSky = findViewById(R.id.btn_bg_sky);
        btnBgBlue = findViewById(R.id.btn_bg_blue);
        btnBgToggle = findViewById(R.id.btn_bg_toggle);
        btnSheetPortrait = findViewById(R.id.btn_sheet_portrait);
        btnSheetLandscape = findViewById(R.id.btn_sheet_landscape);
        btnTileUpright = findViewById(R.id.btn_tile_upright);
        btnTileLandscape = findViewById(R.id.btn_tile_landscape);
        spPerRow = findViewById(R.id.sp_per_row);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), res -> {
            if (res.getResultCode() == RESULT_OK && res.getData() != null && res.getData().getData() != null) {
                loadPortraitUri(res.getData().getData());
            }
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

        btnGenderMale.setOnClickListener(v -> {
            if (portraitInfo != null) {
                portraitInfo.isFemale = false;
                portraitInfo.genderLabelBn = "ছেলে / পুরুষ";
                if (suitMode == 3) suitMode = 1;
                updateAiTexts();
            }
            updateControlHighlights();
            reRenderPassport();
        });
        btnGenderFemale.setOnClickListener(v -> {
            if (portraitInfo != null) {
                portraitInfo.isFemale = true;
                portraitInfo.genderLabelBn = "মেয়ে / নারী";
                if (suitMode == 1 || suitMode == 2) suitMode = 3;
                updateAiTexts();
            }
            updateControlHighlights();
            reRenderPassport();
        });

        findViewById(R.id.btn_pp_rotate).setOnClickListener(v -> {
            if (rawBitmap == null) return;
            tvAiStatus.setText("ছবি ঘোরানো ও AI ব্যাকগ্রাউন্ড প্রস্তুত হচ্ছে...");
            final Bitmap rotated = NativeImageUtils.rotateBitmap(rawBitmap, 90f);
            executor.execute(() -> {
                NativeImageUtils.PortraitInfo info = NativeImageUtils.analyzePortrait(rotated);
                Bitmap cut = NativeImageUtils.extractForegroundCutoutAI(rotated, info);
                runOnUiThread(() -> {
                    rawBitmap = rotated;
                    cutoutBitmap = cut;
                    portraitInfo = info;
                    panX = 0f;
                    panY = 0f;
                    updateAiTexts();
                    updateControlHighlights();
                    reRenderPassport();
                });
            });
        });

        findViewById(R.id.btn_pp_zoom_in).setOnClickListener(v -> {
            userZoom = Math.min(2.4f, userZoom + 0.08f);
            reRenderPassport();
        });
        findViewById(R.id.btn_pp_zoom_out).setOnClickListener(v -> {
            userZoom = Math.max(0.50f, userZoom - 0.08f);
            reRenderPassport();
        });

        // Single Photo Orientation & Custom Size
        btnPhotoPortrait.setOnClickListener(v -> setSinglePhotoOrientation(false));
        btnPhotoLandscape.setOnClickListener(v -> setSinglePhotoOrientation(true));
        findViewById(R.id.btn_apply_photo_mm).setOnClickListener(v -> applyCustomPhotoMm());

        btnSuitNone.setOnClickListener(v -> { suitMode = 0; updateControlHighlights(); reRenderPassport(); });
        btnSuitBlack.setOnClickListener(v -> { suitMode = 1; updateControlHighlights(); reRenderPassport(); });
        btnSuitNavy.setOnClickListener(v -> { suitMode = 2; updateControlHighlights(); reRenderPassport(); });
        btnSuitFemale.setOnClickListener(v -> { suitMode = 3; updateControlHighlights(); reRenderPassport(); });

        btnBgWhite.setOnClickListener(v -> { bgColor = Color.WHITE; replaceBgEnabled = true; updateControlHighlights(); reRenderPassport(); });
        btnBgSky.setOnClickListener(v -> { bgColor = Color.parseColor("#38BDF8"); replaceBgEnabled = true; updateControlHighlights(); reRenderPassport(); });
        btnBgBlue.setOnClickListener(v -> { bgColor = Color.parseColor("#1D4ED8"); replaceBgEnabled = true; updateControlHighlights(); reRenderPassport(); });
        btnBgToggle.setOnClickListener(v -> { replaceBgEnabled = !replaceBgEnabled; updateControlHighlights(); reRenderPassport(); });

        // Sheet Orientation, Tile Placement & Custom Size
        btnSheetPortrait.setOnClickListener(v -> setSheetOrientation(false));
        btnSheetLandscape.setOnClickListener(v -> setSheetOrientation(true));
        findViewById(R.id.btn_apply_sheet_mm).setOnClickListener(v -> applyCustomSheetMm());

        btnTileUpright.setOnClickListener(v -> {
            tileLandscapeOnSheet = false;
            if (photosPerRow == 4 && spPerRow != null) {
                photosPerRow = 5;
                spPerRow.setSelection(3);
            }
            updateControlHighlights();
            updateSheetSummary();
            reRenderSheetOnly();
        });
        btnTileLandscape.setOnClickListener(v -> {
            tileLandscapeOnSheet = true;
            if (photosPerRow == 5 && spPerRow != null) {
                photosPerRow = 4;
                spPerRow.setSelection(2); // "৪ টি" optimal for 4x 45mm on Portrait A4
            }
            updateControlHighlights();
            updateSheetSummary();
            reRenderSheetOnly();
        });

        setupSpinners();
        syncInputs();
        updateControlHighlights();

        findViewById(R.id.btn_pp_save_single).setOnClickListener(v -> saveSinglePhoto());
        findViewById(R.id.btn_pp_save_pdf).setOnClickListener(v -> saveA4Pdf());
        findViewById(R.id.btn_pp_print).setOnClickListener(v -> printA4Sheet());
    }

    private void setChipActive(Button btn, boolean active) {
        if (btn == null) return;
        btn.setBackgroundResource(active ? R.drawable.bg_chip : R.drawable.bg_btn_outline);
        btn.setTextColor(active ? Color.parseColor("#00896C") : Color.parseColor("#0F172A"));
    }

    private void updateControlHighlights() {
        boolean isFemale = portraitInfo != null && portraitInfo.isFemale;
        setChipActive(btnGenderMale, !isFemale);
        setChipActive(btnGenderFemale, isFemale);

        setChipActive(btnPhotoPortrait, !photoLandscape);
        setChipActive(btnPhotoLandscape, photoLandscape);

        setChipActive(btnSuitNone, suitMode == 0);
        setChipActive(btnSuitBlack, suitMode == 1);
        setChipActive(btnSuitNavy, suitMode == 2);
        setChipActive(btnSuitFemale, suitMode == 3);

        setChipActive(btnBgWhite, replaceBgEnabled && bgColor == Color.WHITE);
        setChipActive(btnBgSky, replaceBgEnabled && bgColor == Color.parseColor("#38BDF8"));
        setChipActive(btnBgBlue, replaceBgEnabled && bgColor == Color.parseColor("#1D4ED8"));
        setChipActive(btnBgToggle, replaceBgEnabled);

        setChipActive(btnSheetPortrait, !sheetLandscape);
        setChipActive(btnSheetLandscape, sheetLandscape);

        setChipActive(btnTileUpright, !tileLandscapeOnSheet);
        setChipActive(btnTileLandscape, tileLandscapeOnSheet);
    }

    private void syncInputs() {
        etPhotoW.setText(fmtMm(photoMmW));
        etPhotoH.setText(fmtMm(photoMmH));
        etSheetW.setText(fmtMm(sheetMmW));
        etSheetH.setText(fmtMm(sheetMmH));
        updateSheetSummary();
    }

    private String fmtMm(float v) {
        if (Math.abs(v - Math.round(v)) < 0.05f) return String.valueOf(Math.round(v));
        return String.format(Locale.US, "%.1f", v);
    }

    private void updateSheetSummary() {
        String pOr = tileLandscapeOnSheet ? "শিটে ল্যান্ডস্কিপ (৯০°)" : (photoLandscape ? "ল্যান্ডস্কিপ" : "সোজা");
        String sOr = sheetLandscape ? "ল্যান্ডস্কিপ" : "সোজা";
        tvSheetSummary.setText("পেজ: " + fmtMm(sheetMmW) + "×" + fmtMm(sheetMmH) + " mm (" + sOr + ")  •  ছবি: " + fmtMm(photoMmW) + "×" + fmtMm(photoMmH) + " mm (" + pOr + ") • " + photosPerRow + "টি/লাইন");
    }

    private void setSinglePhotoOrientation(boolean landscape) {
        float minD = Math.min(photoMmW, photoMmH);
        float maxD = Math.max(photoMmW, photoMmH);
        photoLandscape = landscape;
        if (Math.abs(minD - maxD) >= 0.5f) {
            photoMmW = landscape ? maxD : minD;
            photoMmH = landscape ? minD : maxD;
        }
        syncInputs();
        updateControlHighlights();
        reRenderPassport();
    }

    private void applyCustomPhotoMm() {
        try {
            float w = Float.parseFloat(etPhotoW.getText().toString().trim());
            float h = Float.parseFloat(etPhotoH.getText().toString().trim());
            photoMmW = Math.max(12f, Math.min(250f, w));
            photoMmH = Math.max(12f, Math.min(250f, h));
            photoLandscape = photoMmW > photoMmH;
            syncInputs();
            updateControlHighlights();
            reRenderPassport();
        } catch (Exception e) {
            Toast.makeText(this, "সঠিক mm সংখ্যা লিখুন (যেমন 35 এবং 45)", Toast.LENGTH_SHORT).show();
        }
    }

    private void setSheetOrientation(boolean landscape) {
        float minD = Math.min(sheetMmW, sheetMmH);
        float maxD = Math.max(sheetMmW, sheetMmH);
        sheetLandscape = landscape;
        if (Math.abs(minD - maxD) >= 0.5f) {
            sheetMmW = landscape ? maxD : minD;
            sheetMmH = landscape ? minD : maxD;
        }
        syncInputs();
        updateControlHighlights();
        reRenderSheetOnly();
    }

    private void applyCustomSheetMm() {
        try {
            float w = Float.parseFloat(etSheetW.getText().toString().trim());
            float h = Float.parseFloat(etSheetH.getText().toString().trim());
            sheetMmW = Math.max(40f, Math.min(600f, w));
            sheetMmH = Math.max(40f, Math.min(600f, h));
            sheetLandscape = sheetMmW > sheetMmH;
            syncInputs();
            updateControlHighlights();
            reRenderSheetOnly();
        } catch (Exception e) {
            Toast.makeText(this, "সঠিক পেজ mm সংখ্যা লিখুন (যেমন 210 এবং 297)", Toast.LENGTH_SHORT).show();
        }
    }

    private void setupSpinners() {
        Spinner spPhotoPreset = findViewById(R.id.sp_photo_preset);
        String[] photoItems = new String[]{
                "35×45 mm (স্ট্যান্ডার্ড পাসপোর্ট)",
                "40×50 mm (পাসপোর্ট লার্জ)",
                "30×40 mm (স্ট্যাম্প / স্কুল)",
                "51×51 mm (US ভিসা 2×2\")",
                "Custom (নিজস্ব mm)"
        };
        spPhotoPreset.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, photoItems));
        spPhotoPreset.setSelection(0);
        spPhotoPreset.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                if (suppressSpinnerCallbacks || pos == 4) return;
                float[][] dims = {{35f, 45f}, {40f, 50f}, {30f, 40f}, {51f, 51f}};
                float baseW = dims[pos][0], baseH = dims[pos][1];
                if (photoLandscape && baseW != baseH) {
                    photoMmW = Math.max(baseW, baseH);
                    photoMmH = Math.min(baseW, baseH);
                } else {
                    photoMmW = baseW;
                    photoMmH = baseH;
                }
                syncInputs();
                updateControlHighlights();
                reRenderPassport();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        Spinner spSheetPaper = findViewById(R.id.sp_sheet_paper);
        String[] paperItems = new String[]{
                "A4 পেপার (210 × 297 mm)",
                "4×6 ফটো পেপার (102 × 152 mm)",
                "5×7 ফটো পেপার (127 × 178 mm)",
                "Legal পেপার (216 × 356 mm)",
                "Custom (কাস্টম পেজ mm)"
        };
        spSheetPaper.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, paperItems));
        spSheetPaper.setSelection(0);
        spSheetPaper.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                if (suppressSpinnerCallbacks || pos == 4) return;
                float[][] papers = {{210f, 297f}, {101.6f, 152.4f}, {127f, 177.8f}, {215.9f, 355.6f}};
                float pW = papers[pos][0], pH = papers[pos][1];
                sheetMmW = sheetLandscape ? Math.max(pW, pH) : Math.min(pW, pH);
                sheetMmH = sheetLandscape ? Math.min(pW, pH) : Math.max(pW, pH);
                syncInputs();
                updateControlHighlights();
                reRenderSheetOnly();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        Spinner spPerRow = findViewById(R.id.sp_per_row);
        String[] perRowItems = new String[]{"২ টি", "৩ টি", "৪ টি", "৫ টি (A4 বেস্ট)", "৬ টি", "৭ টি", "৮ টি"};
        ArrayAdapter<String> rowAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, perRowItems);
        spPerRow.setAdapter(rowAdapter);
        spPerRow.setSelection(3);
        spPerRow.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                photosPerRow = pos + 2;
                reRenderSheetOnly();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        Spinner spRows = findViewById(R.id.sp_rows);
        String[] rowsItems = new String[]{"১ সারি", "২ সারি", "৩ সারি", "৪ সারি", "৫ সারি", "পুরো পেজ পূর্ণ"};
        ArrayAdapter<String> rowsAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, rowsItems);
        spRows.setAdapter(rowsAdapter);
        spRows.setSelection(1);
        spRows.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                rowsCount = (pos == 5) ? 0 : (pos + 1);
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
        Intent intent = new Intent(this, InAppCameraActivity.class);
        intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, "passport");
        cameraLauncher.launch(intent);
    }

    private void loadPortraitUri(Uri uri) {
        tvAiStatus.setText("হিউমান ডিটেক্টর ও AI ব্যাকগ্রাউন্ড কাটআউট হচ্ছে...");
        executor.execute(() -> {
            Bitmap loaded = NativeImageUtils.loadBitmapSafe(this, uri, 1200);
            if (loaded == null) return;
            NativeImageUtils.PortraitInfo info = NativeImageUtils.analyzePortrait(loaded);
            Bitmap cut = NativeImageUtils.extractForegroundCutoutAI(loaded, info);
            runOnUiThread(() -> {
                rawBitmap = loaded;
                cutoutBitmap = cut;
                portraitInfo = info;
                userZoom = 1.0f;
                panX = 0f;
                panY = 0f;
                updateAiTexts();
                updateControlHighlights();
                reRenderPassport();
            });
        });
    }

    private void updateAiTexts() {
        if (portraitInfo == null) return;
        String faceTxt = portraitInfo.faceDetected
                ? "✓ হিউমান ও মুখ শনাক্ত"
                : (portraitInfo.humanDetected ? "✓ মানুষ শনাক্ত (অটো-ফ্রেম)" : "⚠️ মানুষ পাওয়া যায়নি (ম্যানুয়াল)");
        tvAiStatus.setText(faceTxt + "  •  " + portraitInfo.genderLabelBn);
        tvAttire.setText(portraitInfo.attireLabelBn + " (ড্র্যাগ করে পজিশন ঠিক করুন)");
    }

    private void reRenderPassport() {
        if (rawBitmap == null || portraitInfo == null) return;
        final Bitmap src = rawBitmap;
        final Bitmap cut = cutoutBitmap;
        final NativeImageUtils.PortraitInfo info = portraitInfo;
        final float zoom = userZoom, px = panX, py = panY;
        final int sm = suitMode, bg = bgColor;
        final boolean rbg = replaceBgEnabled;
        final float pMmW = photoMmW, pMmH = photoMmH;
        final float sMmW = sheetMmW, sMmH = sheetMmH;
        final int ppr = photosPerRow, rc = rowsCount;
        final boolean tileLand = tileLandscapeOnSheet;

        final int pxW = Math.max(150, Math.round((pMmW / 25.4f) * 300f));
        final int pxH = Math.max(150, Math.round((pMmH / 25.4f) * 300f));

        executor.execute(() -> {
            Bitmap single = NativeImageUtils.renderPassportPhoto(src, cut, info, pxW, pxH, zoom, px, py, sm, bg, rbg);
            Bitmap sheet = NativeImageUtils.composePrintSheet(single, pMmW, pMmH, sMmW, sMmH, ppr, rc, true, tileLand);
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
        final float pMmW = photoMmW, pMmH = photoMmH;
        final float sMmW = sheetMmW, sMmH = sheetMmH;
        final int ppr = photosPerRow, rc = rowsCount;
        final boolean tileLand = tileLandscapeOnSheet;
        executor.execute(() -> {
            Bitmap sheet = NativeImageUtils.composePrintSheet(single, pMmW, pMmH, sMmW, sMmH, ppr, rc, true, tileLand);
            runOnUiThread(() -> {
                sheetBitmap = sheet;
                ivA4Preview.setImageBitmap(sheet);
                updateSheetSummary();
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
        final float sW = sheetMmW, sH = sheetMmH;
        executor.execute(() -> {
            try {
                String name = "camlab_Passport_Sheet_" + System.currentTimeMillis() + ".pdf";
                File saved = NativePdfUtils.saveBitmapsToPdf(this, Collections.singletonList(sheetBitmap), name, sW, sH);
                runOnUiThread(() -> {
                    Toast.makeText(this, "✅ PDF তৈরি হয়েছে: Downloads/camlab/" + name, Toast.LENGTH_LONG).show();
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
        NativePdfUtils.printBitmap(this, sheetBitmap, "camlab_Passport_Sheet", sheetMmW, sheetMmH);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}

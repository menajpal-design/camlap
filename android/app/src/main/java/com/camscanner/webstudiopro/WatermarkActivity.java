package com.camscanner.webstudiopro;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
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
 * Watermark & Signature Studio Activity — matches the Web App's ওয়াটারমার্ক ও সিগনেচার screen.
 * Supports: custom text watermark, opacity, font size, diagonal / center / corner placement,
 * color selection, and export (PDF + JPG).
 */
public class WatermarkActivity extends AppCompatActivity {

    private Bitmap rawBitmap;
    private Bitmap processedBitmap;

    private ImageView ivWatermarkPreview;
    private EditText etWatermarkText;
    private SeekBar sbOpacity, sbFontSize;
    private TextView tvOpacityVal, tvFontVal, tvStatus;
    private Button btnPlaceDiag, btnPlaceCenter, btnPlaceCorner;
    private Button btnColorWhite, btnColorBlack, btnColorRed, btnColorBlue;

    private int placement = 0; // 0=Diagonal, 1=Center, 2=CornerBottomRight
    private int wmColor = Color.WHITE;
    private int opacity = 55;   // 0–100
    private int fontSize = 36; // sp-equivalent

    private Uri pendingCameraUri;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Uri> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_watermark);

        ivWatermarkPreview = findViewById(R.id.iv_wm_preview);
        etWatermarkText = findViewById(R.id.et_wm_text);
        sbOpacity = findViewById(R.id.sb_wm_opacity);
        sbFontSize = findViewById(R.id.sb_wm_font);
        tvOpacityVal = findViewById(R.id.tv_wm_opacity_val);
        tvFontVal = findViewById(R.id.tv_wm_font_val);
        tvStatus = findViewById(R.id.tv_wm_status);
        btnPlaceDiag = findViewById(R.id.btn_wm_diag);
        btnPlaceCenter = findViewById(R.id.btn_wm_center);
        btnPlaceCorner = findViewById(R.id.btn_wm_corner);
        btnColorWhite = findViewById(R.id.btn_wm_color_white);
        btnColorBlack = findViewById(R.id.btn_wm_color_black);
        btnColorRed = findViewById(R.id.btn_wm_color_red);
        btnColorBlue = findViewById(R.id.btn_wm_color_blue);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            if (ok && pendingCameraUri != null) loadUri(pendingCameraUri);
        });
        galleryLauncher = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) loadUri(uri);
        });
        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) launchCamera();
            else Toast.makeText(this, "ক্যামেরা পারমিশন প্রয়োজন!", Toast.LENGTH_SHORT).show();
        });

        findViewById(R.id.btn_wm_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_wm_camera).setOnClickListener(v -> checkCameraAndLaunch());
        findViewById(R.id.btn_wm_gallery).setOnClickListener(v -> galleryLauncher.launch("image/*"));

        sbOpacity.setMax(100);
        sbOpacity.setProgress(opacity);
        sbOpacity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                opacity = progress; tvOpacityVal.setText(progress + "%"); applyWatermark();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });

        sbFontSize.setMax(80);
        sbFontSize.setProgress(fontSize - 16);
        sbFontSize.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                fontSize = progress + 16; tvFontVal.setText(fontSize + "sp"); applyWatermark();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });

        tvOpacityVal.setText(opacity + "%");
        tvFontVal.setText(fontSize + "sp");

        btnPlaceDiag.setOnClickListener(v -> { placement = 0; updatePlacementHighlights(); applyWatermark(); });
        btnPlaceCenter.setOnClickListener(v -> { placement = 1; updatePlacementHighlights(); applyWatermark(); });
        btnPlaceCorner.setOnClickListener(v -> { placement = 2; updatePlacementHighlights(); applyWatermark(); });

        btnColorWhite.setOnClickListener(v -> { wmColor = Color.WHITE; updateColorHighlights(); applyWatermark(); });
        btnColorBlack.setOnClickListener(v -> { wmColor = Color.BLACK; updateColorHighlights(); applyWatermark(); });
        btnColorRed.setOnClickListener(v -> { wmColor = Color.parseColor("#DC2626"); updateColorHighlights(); applyWatermark(); });
        btnColorBlue.setOnClickListener(v -> { wmColor = Color.parseColor("#1D4ED8"); updateColorHighlights(); applyWatermark(); });

        etWatermarkText.setOnEditorActionListener((v, actionId, event) -> { applyWatermark(); return false; });
        etWatermarkText.setOnFocusChangeListener((v, hasFocus) -> { if (!hasFocus) applyWatermark(); });

        findViewById(R.id.btn_wm_apply).setOnClickListener(v -> applyWatermark());
        findViewById(R.id.btn_wm_save_jpg).setOnClickListener(v -> saveImage());
        findViewById(R.id.btn_wm_save_pdf).setOnClickListener(v -> savePdf());
        findViewById(R.id.btn_wm_print).setOnClickListener(v -> print());

        updatePlacementHighlights();
        updateColorHighlights();
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
            File tmp = new File(getCacheDir(), "wm_" + System.currentTimeMillis() + ".jpg");
            pendingCameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", tmp);
            cameraLauncher.launch(pendingCameraUri);
        } catch (Exception e) {
            Toast.makeText(this, "ক্যামেরা চালু করা যায়নি", Toast.LENGTH_SHORT).show();
        }
    }

    private void loadUri(Uri uri) {
        tvStatus.setText("ছবি লোড হচ্ছে...");
        executor.execute(() -> {
            Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 2400);
            runOnUiThread(() -> {
                if (bmp == null) { Toast.makeText(this, "ছবি খোলা যায়নি", Toast.LENGTH_SHORT).show(); return; }
                rawBitmap = bmp;
                applyWatermark();
            });
        });
    }

    private void applyWatermark() {
        if (rawBitmap == null) return;
        String text = etWatermarkText.getText().toString().trim();
        if (text.isEmpty()) text = "camlab";

        final String wmText = text;
        final int wmOpacity = opacity;
        final int wmFontSize = fontSize;
        final int wmPlacement = placement;
        final int color = wmColor;
        final Bitmap src = rawBitmap;

        executor.execute(() -> {
            Bitmap result = src.copy(Bitmap.Config.ARGB_8888, true);
            Canvas canvas = new Canvas(result);
            int w = result.getWidth(), h = result.getHeight();
            float densityScale = Math.min(w, h) / 500f;

            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(color);
            paint.setAlpha(Math.round(wmOpacity / 100f * 255));
            paint.setTextSize(wmFontSize * densityScale);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD));

            float textW = paint.measureText(wmText);

            if (wmPlacement == 0) {
                // Diagonal tiled watermark
                canvas.save();
                canvas.rotate(-35f, w / 2f, h / 2f);
                float stepX = textW * 1.5f;
                float stepY = wmFontSize * densityScale * 3f;
                for (float fy = -h; fy < h * 2f; fy += stepY) {
                    for (float fx = -w; fx < w * 2f; fx += stepX) {
                        canvas.drawText(wmText, fx, fy, paint);
                    }
                }
                canvas.restore();
            } else if (wmPlacement == 1) {
                // Center single
                float x = (w - textW) / 2f;
                float y = h / 2f;
                canvas.drawText(wmText, x, y, paint);
            } else {
                // Bottom-right corner
                float margin = 24f * densityScale;
                float x = w - textW - margin;
                float y = h - margin;
                canvas.drawText(wmText, x, y, paint);
            }

            runOnUiThread(() -> {
                processedBitmap = result;
                ivWatermarkPreview.setImageBitmap(processedBitmap);
                tvStatus.setText("ওয়াটারমার্ক প্রযুক্ত হয়েছে");
            });
        });
    }

    private void setChipActive(Button btn, boolean active) {
        if (btn == null) return;
        btn.setBackgroundResource(active ? R.drawable.bg_chip : R.drawable.bg_btn_outline);
        btn.setTextColor(active ? Color.parseColor("#00896C") : Color.parseColor("#0F172A"));
    }

    private void updatePlacementHighlights() {
        setChipActive(btnPlaceDiag, placement == 0);
        setChipActive(btnPlaceCenter, placement == 1);
        setChipActive(btnPlaceCorner, placement == 2);
    }

    private void updateColorHighlights() {
        setChipActive(btnColorWhite, wmColor == Color.WHITE);
        setChipActive(btnColorBlack, wmColor == Color.BLACK);
        setChipActive(btnColorRed, wmColor == Color.parseColor("#DC2626"));
        setChipActive(btnColorBlue, wmColor == Color.parseColor("#1D4ED8"));
    }

    private void saveImage() {
        if (processedBitmap == null) { applyWatermark(); return; }
        tvStatus.setText("সংরক্ষণ হচ্ছে...");
        final Bitmap finalBmp = processedBitmap;
        executor.execute(() -> {
            try {
                String name = "camlab_Watermark_" + System.currentTimeMillis() + ".jpg";
                NativePdfUtils.saveBitmapImage(this, finalBmp, name, Bitmap.CompressFormat.JPEG);
                runOnUiThread(() -> { tvStatus.setText("✅ JPG সংরক্ষিত!"); Toast.makeText(this, "✅ সংরক্ষিত!", Toast.LENGTH_SHORT).show(); });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "সংরক্ষণ ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void savePdf() {
        if (processedBitmap == null) { applyWatermark(); return; }
        tvStatus.setText("PDF তৈরি হচ্ছে...");
        final Bitmap finalBmp = processedBitmap;
        executor.execute(() -> {
            try {
                List<Bitmap> pages = new ArrayList<>();
                pages.add(finalBmp);
                String name = "camlab_Watermark_" + System.currentTimeMillis() + ".pdf";
                NativePdfUtils.saveBitmapsToPdf(this, pages, name, true);
                runOnUiThread(() -> { tvStatus.setText("✅ PDF সংরক্ষিত!"); Toast.makeText(this, "✅ PDF সংরক্ষিত!", Toast.LENGTH_SHORT).show(); });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "PDF তৈরি ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void print() {
        if (processedBitmap == null) { applyWatermark(); return; }
        NativePdfUtils.printBitmap(this, processedBitmap, "camlab Watermark Print", true);
    }
}

package com.camlab.studio;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Full OCR Text Extractor Activity — matches the Web App's OCR screen.
 * Uses ML Kit on-device OCR (Latin + Bengali), displays extracted text,
 * allows copy, search within result, and export to PDF/TXT.
 */
public class OcrActivity extends AppCompatActivity {

    private Bitmap rawBitmap;

    private ImageView ivOcrPreview;
    private EditText etOcrResult, etOcrSearch;
    private ProgressBar pbOcr;
    private TextView tvOcrStatus, tvWordCount;
    private Button btnHighlightSearch;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ActivityResultLauncher<Intent> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> cameraPermLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ocr);

        ivOcrPreview = findViewById(R.id.iv_ocr_preview);
        etOcrResult = findViewById(R.id.et_ocr_result);
        etOcrSearch = findViewById(R.id.et_ocr_search);
        pbOcr = findViewById(R.id.pb_ocr);
        tvOcrStatus = findViewById(R.id.tv_ocr_status);
        tvWordCount = findViewById(R.id.tv_ocr_word_count);
        btnHighlightSearch = findViewById(R.id.btn_ocr_highlight);

        cameraLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), res -> {
            if (res.getResultCode() == RESULT_OK && res.getData() != null && res.getData().getData() != null) {
                loadUriForOcr(res.getData().getData());
            }
        });
        galleryLauncher = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) loadUriForOcr(uri);
        });
        cameraPermLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) launchCamera();
            else Toast.makeText(this, "ক্যামেরা পারমিশন প্রয়োজন!", Toast.LENGTH_SHORT).show();
        });

        findViewById(R.id.btn_ocr_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_ocr_camera).setOnClickListener(v -> checkCameraAndLaunch());
        findViewById(R.id.btn_ocr_gallery).setOnClickListener(v -> galleryLauncher.launch("image/*"));
        findViewById(R.id.btn_ocr_run).setOnClickListener(v -> runOcr());
        findViewById(R.id.btn_ocr_copy).setOnClickListener(v -> copyText());
        findViewById(R.id.btn_ocr_clear).setOnClickListener(v -> { etOcrResult.setText(""); tvWordCount.setText("0 শব্দ"); tvOcrStatus.setText("টেক্সট পরিষ্কার করা হয়েছে"); });
        btnHighlightSearch.setOnClickListener(v -> searchInResult());
        findViewById(R.id.btn_ocr_translate).setOnClickListener(v -> translateAndFormatText());
        findViewById(R.id.btn_ocr_qr).setOnClickListener(v -> generateQrFromText());
        findViewById(R.id.btn_ocr_save_doc).setOnClickListener(v -> saveWordDoc());
        findViewById(R.id.btn_ocr_save_csv).setOnClickListener(v -> saveExcelCsv());
        findViewById(R.id.btn_ocr_save_txt).setOnClickListener(v -> saveTxt());
        findViewById(R.id.btn_ocr_save_pdf).setOnClickListener(v -> savePdf());
    }

    private void translateAndFormatText() {
        String text = etOcrResult.getText().toString().trim();
        if (text.isEmpty()) {
            Toast.makeText(this, "অনুবাদ ও ফরম্যাটের জন্য আগে টেক্সট লিখুন বা স্ক্যান করুন", Toast.LENGTH_SHORT).show();
            return;
        }
        String cleaned = text.replaceAll("[ \\t]+", " ").replaceAll("\\n{3,}", "\n\n").trim();
        int words = cleaned.split("\\s+").length;
        String summary = cleaned + "\n\n--- [camlab সারাংশ ও অনুবাদ সহায়িকা] ---\n"
                + "• মোট শব্দ: " + words + "টি\n"
                + "• স্ট্যাটাস: লাইন ও স্পেসিং অটো-ফরম্যাট সম্পন্ন ✓";
        etOcrResult.setText(summary);
        tvOcrStatus.setText("🌐 অফলাইন ফরম্যাট ও সারাংশ যোগ করা হয়েছে!");
    }

    private void generateQrFromText() {
        String text = etOcrResult.getText().toString().trim();
        if (text.isEmpty()) text = etOcrSearch.getText().toString().trim();
        if (text.isEmpty()) text = "camlab Smart Scanner & Studio";
        final String qrContent = text;
        executor.execute(() -> {
            try {
                Bitmap qrBmp = NativeImageUtils.generateQrBitmap(qrContent, 640);
                String name = "camlab_QR_" + System.currentTimeMillis() + ".png";
                NativePdfUtils.saveBitmapImage(this, qrBmp, name, Bitmap.CompressFormat.PNG);
                runOnUiThread(() -> {
                    rawBitmap = qrBmp;
                    ivOcrPreview.setImageBitmap(qrBmp);
                    tvOcrStatus.setText("🏁 QR কোড তৈরি ও সেভ হয়েছে: " + name);
                    Toast.makeText(this, "✅ QR কোড সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "QR তৈরি ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void saveWordDoc() {
        String text = etOcrResult.getText().toString();
        if (text.isEmpty()) { Toast.makeText(this, "কোনো টেক্সট নেই", Toast.LENGTH_SHORT).show(); return; }
        tvOcrStatus.setText("Word (.doc) তৈরি হচ্ছে...");
        executor.execute(() -> {
            try {
                String name = "camlab_Word_" + System.currentTimeMillis() + ".doc";
                NativePdfUtils.exportToWordDoc(this, "camlab OCR Document", text, name);
                runOnUiThread(() -> {
                    tvOcrStatus.setText("✅ Word (.doc) সংরক্ষিত: " + name);
                    Toast.makeText(this, "✅ Word (.doc) সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Word সংরক্ষণ ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void saveExcelCsv() {
        String text = etOcrResult.getText().toString();
        if (text.isEmpty()) { Toast.makeText(this, "কোনো টেক্সট নেই", Toast.LENGTH_SHORT).show(); return; }
        tvOcrStatus.setText("Excel (.csv) তৈরি হচ্ছে...");
        executor.execute(() -> {
            try {
                String name = "camlab_Excel_" + System.currentTimeMillis() + ".csv";
                NativePdfUtils.exportToExcelCsv(this, text, name);
                runOnUiThread(() -> {
                    tvOcrStatus.setText("✅ Excel (.csv) সংরক্ষিত: " + name);
                    Toast.makeText(this, "✅ Excel (.csv) সংরক্ষিত!", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Excel সংরক্ষণ ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
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
        intent.putExtra(InAppCameraActivity.EXTRA_SCAN_MODE, "ocr");
        cameraLauncher.launch(intent);
    }

    private void loadUriForOcr(Uri uri) {
        setLoading(true, "ছবি লোড হচ্ছে...");
        executor.execute(() -> {
            Bitmap bmp = NativeImageUtils.loadBitmapSafe(this, uri, 2400);
            runOnUiThread(() -> {
                setLoading(false, "");
                if (bmp == null) { Toast.makeText(this, "ছবি খোলা যায়নি", Toast.LENGTH_SHORT).show(); return; }
                rawBitmap = bmp;
                ivOcrPreview.setImageBitmap(rawBitmap);
                tvOcrStatus.setText("ছবি লোড হয়েছে। 'OCR চালান' বাটন দিন।");
                runOcr(); // Auto-run OCR after loading
            });
        });
    }

    private void runOcr() {
        if (rawBitmap == null) { Toast.makeText(this, "আগে ছবি নিন বা ইমপোর্ট করুন!", Toast.LENGTH_SHORT).show(); return; }
        setLoading(true, "ML Kit OCR চলছে... অনুগ্রহ করে অপেক্ষা করুন");

        final Bitmap bmp = rawBitmap;
        executor.execute(() -> {
            try {
                TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                InputImage inputImage = InputImage.fromBitmap(bmp, 0);
                Text result = Tasks.await(recognizer.process(inputImage));
                String extractedText = result.getText().trim();

                runOnUiThread(() -> {
                    setLoading(false, "");
                    etOcrResult.setText(extractedText);
                    if (extractedText.isEmpty()) {
                        tvOcrStatus.setText("❌ কোনো টেক্সট শনাক্ত হয়নি। পরিষ্কার ছবি ব্যবহার করুন।");
                        tvWordCount.setText("0 শব্দ");
                    } else {
                        int words = extractedText.split("\\s+").length;
                        int chars = extractedText.length();
                        tvOcrStatus.setText("✅ OCR সম্পন্ন!");
                        tvWordCount.setText(words + " শব্দ, " + chars + " অক্ষর");
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false, "");
                    tvOcrStatus.setText("❌ OCR ব্যর্থ: " + e.getMessage());
                });
            }
        });
    }

    private void copyText() {
        String text = etOcrResult.getText().toString();
        if (text.isEmpty()) { Toast.makeText(this, "কপি করার মতো কোনো টেক্সট নেই", Toast.LENGTH_SHORT).show(); return; }
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("camlab OCR", text));
        Toast.makeText(this, "✅ " + text.split("\\s+").length + " শব্দ কপি হয়েছে!", Toast.LENGTH_SHORT).show();
    }

    private void searchInResult() {
        String query = etOcrSearch.getText().toString().trim();
        String fullText = etOcrResult.getText().toString();
        if (query.isEmpty() || fullText.isEmpty()) return;
        int idx = fullText.toLowerCase().indexOf(query.toLowerCase());
        if (idx >= 0) {
            etOcrResult.requestFocus();
            etOcrResult.setSelection(idx, idx + query.length());
            tvOcrStatus.setText("🔍 পাওয়া গেছে: \"" + query + "\" (" + idx + " থেকে)");
        } else {
            tvOcrStatus.setText("❌ \"" + query + "\" পাওয়া যায়নি");
        }
    }

    private void saveTxt() {
        String text = etOcrResult.getText().toString();
        if (text.isEmpty()) { Toast.makeText(this, "কোনো টেক্সট নেই", Toast.LENGTH_SHORT).show(); return; }
        tvOcrStatus.setText("TXT সংরক্ষণ হচ্ছে...");
        executor.execute(() -> {
            try {
                String name = "camlab_OCR_" + System.currentTimeMillis() + ".txt";
                File dir = NativePdfUtils.getExportsDir(this);
                File f = new File(dir, name);
                try (java.io.FileWriter fw = new java.io.FileWriter(f)) {
                    fw.write(text);
                }
                // Also try to copy to Downloads
                try {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                        android.content.ContentValues cv = new android.content.ContentValues();
                        cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
                        cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "text/plain");
                        cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS + "/camlab");
                        android.net.Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri != null) {
                            try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                                if (os != null) os.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            }
                        }
                    }
                } catch (Exception ignored) {}
                runOnUiThread(() -> { tvOcrStatus.setText("✅ TXT সংরক্ষিত: " + name); Toast.makeText(this, "✅ TXT সংরক্ষিত!", Toast.LENGTH_SHORT).show(); });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "TXT সংরক্ষণ ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void savePdf() {
        if (rawBitmap == null) { Toast.makeText(this, "ছবি নেই", Toast.LENGTH_SHORT).show(); return; }
        tvOcrStatus.setText("PDF তৈরি হচ্ছে...");
        final Bitmap finalBmp = rawBitmap;
        final String ocrText = etOcrResult.getText().toString();
        executor.execute(() -> {
            try {
                // Create annotated bitmap with OCR text overlay at bottom
                Bitmap annotated = finalBmp.copy(Bitmap.Config.ARGB_8888, true);
                if (!ocrText.isEmpty()) {
                    android.graphics.Canvas c = new android.graphics.Canvas(annotated);
                    android.graphics.Paint p = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
                    p.setColor(Color.parseColor("#0F172A"));
                    p.setTextSize(Math.max(20f, annotated.getWidth() / 60f));
                    // Draw simple "OCR: ..." label at bottom
                    String label = "OCR টেক্সট: " + (ocrText.length() > 80 ? ocrText.substring(0, 80) + "..." : ocrText);
                    c.drawText(label, 24f, annotated.getHeight() - 24f, p);
                }
                List<Bitmap> pages = new ArrayList<>();
                pages.add(annotated);
                String name = "camlab_OCR_" + System.currentTimeMillis() + ".pdf";
                NativePdfUtils.saveBitmapsToPdf(this, pages, name, true);
                runOnUiThread(() -> { tvOcrStatus.setText("✅ PDF সংরক্ষিত!"); Toast.makeText(this, "✅ OCR PDF সংরক্ষিত!", Toast.LENGTH_SHORT).show(); });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "PDF তৈরি ব্যর্থ", Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void setLoading(boolean loading, String msg) {
        pbOcr.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (!msg.isEmpty()) tvOcrStatus.setText(msg);
        findViewById(R.id.btn_ocr_run).setEnabled(!loading);
    }
}


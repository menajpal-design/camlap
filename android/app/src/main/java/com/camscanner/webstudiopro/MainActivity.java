package com.camscanner.webstudiopro;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private LinearLayout savedFilesContainer;
    private TextView tvFileCount;
    private ActivityResultLauncher<String[]> permissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NativeImageUtils.ensureOpenCV();
        setContentView(R.layout.activity_main);

        savedFilesContainer = findViewById(R.id.saved_files_container);
        tvFileCount = findViewById(R.id.tv_file_count);

        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestMultiplePermissions(),
                result -> {}
        );
        requestAppPermissions();

        // === 6 Main Feature Cards ===
        findViewById(R.id.card_doc_scan).setOnClickListener(v ->
                startActivity(new Intent(this, DocScannerActivity.class))
        );
        findViewById(R.id.card_passport_studio).setOnClickListener(v ->
                startActivity(new Intent(this, PassportStudioActivity.class))
        );
        findViewById(R.id.card_id_card).setOnClickListener(v ->
                startActivity(new Intent(this, IdCardActivity.class))
        );
        findViewById(R.id.card_watermark).setOnClickListener(v ->
                startActivity(new Intent(this, WatermarkActivity.class))
        );
        findViewById(R.id.card_ocr).setOnClickListener(v ->
                startActivity(new Intent(this, OcrActivity.class))
        );
        findViewById(R.id.card_pdf_tools).setOnClickListener(v ->
                startActivity(new Intent(this, PdfToolsActivity.class))
        );

        // Search button — quick launch DocScanner
        View searchBtn = findViewById(R.id.btn_search);
        if (searchBtn != null) {
            searchBtn.setOnClickListener(v ->
                    startActivity(new Intent(this, DocScannerActivity.class))
            );
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshSavedFilesList();
    }

    private void requestAppPermissions() {
        java.util.List<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }
        if (!needed.isEmpty()) {
            permissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    private void refreshSavedFilesList() {
        savedFilesContainer.removeAllViews();
        File exportsDir = NativePdfUtils.getExportsDir(this);
        File[] files = exportsDir.listFiles();

        if (tvFileCount != null) {
            tvFileCount.setText(files != null ? String.valueOf(files.length) : "0");
        }

        if (files == null || files.length == 0) {
            TextView empty = new TextView(this);
            empty.setText("এখনো কোনো ফাইল তৈরি করা হয়নি।\nউপরের যেকোনো ফিচার ব্যবহার করুন।");
            empty.setTextColor(Color.parseColor("#64748B"));
            empty.setTextSize(13f);
            empty.setPadding(24, 32, 24, 32);
            empty.setBackgroundResource(R.drawable.bg_card);
            savedFilesContainer.addView(empty);
            return;
        }

        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        SimpleDateFormat sdf = new SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault());

        // Show at most 20 recent files
        int shown = Math.min(files.length, 20);
        for (int i = 0; i < shown; i++) {
            File file = files[i];
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setBackgroundResource(R.drawable.bg_card);
            row.setPadding(28, 20, 28, 20);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            lp.bottomMargin = 14;
            row.setLayoutParams(lp);

            String name = file.getName();
            String icon;
            if (name.endsWith(".pdf")) icon = "📄 ";
            else if (name.endsWith(".txt")) icon = "📝 ";
            else icon = "🖼️ ";

            TextView title = new TextView(this);
            title.setText(icon + name);
            title.setTextColor(Color.parseColor("#0F172A"));
            title.setTextSize(14f);
            title.setTypeface(null, android.graphics.Typeface.BOLD);
            title.setMaxLines(1);
            title.setEllipsize(android.text.TextUtils.TruncateAt.END);

            TextView meta = new TextView(this);
            long kb = Math.max(1, file.length() / 1024);
            meta.setText(sdf.format(new Date(file.lastModified())) + "  •  " + kb + " KB  •  টাপ করে খুলুন");
            meta.setTextColor(Color.parseColor("#64748B"));
            meta.setTextSize(11f);
            meta.setPadding(0, 6, 0, 0);

            row.addView(title);
            row.addView(meta);
            row.setOnClickListener(v -> {
                try {
                    String mime;
                    if (name.endsWith(".pdf")) mime = "application/pdf";
                    else if (name.endsWith(".txt")) mime = "text/plain";
                    else mime = "image/*";
                    NativePdfUtils.shareFile(this, file, mime);
                } catch (Exception e) {
                    Toast.makeText(this, "ফাইল খোলা যায়নি: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            });
            row.setOnLongClickListener(v -> {
                // Long press to delete
                new androidx.appcompat.app.AlertDialog.Builder(this)
                        .setTitle("ফাইল মুছুন?")
                        .setMessage(name + " মুছে ফেলতে চান?")
                        .setPositiveButton("মুছুন", (d, w) -> {
                            file.delete();
                            refreshSavedFilesList();
                            Toast.makeText(this, "✅ ফাইল মুছে গেছে", Toast.LENGTH_SHORT).show();
                        })
                        .setNegativeButton("বাতিল", null)
                        .show();
                return true;
            });
            savedFilesContainer.addView(row);
        }

        if (files.length > 20) {
            TextView more = new TextView(this);
            more.setText("…আরও " + (files.length - 20) + "টি ফাইল আছে");
            more.setTextColor(Color.parseColor("#64748B"));
            more.setTextSize(12f);
            more.setPadding(24, 8, 24, 16);
            savedFilesContainer.addView(more);
        }
    }
}

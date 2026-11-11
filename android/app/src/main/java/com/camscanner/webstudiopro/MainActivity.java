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
    private ActivityResultLauncher<String[]> permissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        savedFilesContainer = findViewById(R.id.saved_files_container);

        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestMultiplePermissions(),
                result -> {}
        );
        requestAppPermissions();

        View docCard = findViewById(R.id.card_doc_scan);
        docCard.setOnClickListener(v ->
                startActivity(new Intent(this, DocScannerActivity.class))
        );

        View passportCard = findViewById(R.id.card_passport_studio);
        passportCard.setOnClickListener(v ->
                startActivity(new Intent(this, PassportStudioActivity.class))
        );
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

        if (files == null || files.length == 0) {
            TextView empty = new TextView(this);
            empty.setText("এখনো কোনো PDF বা পাসপোর্ট ফাইল তৈরি করা হয়নি।\nউপরের বাটনে ট্যাপ করে শুরু করুন।");
            empty.setTextColor(Color.parseColor("#64748B"));
            empty.setTextSize(13f);
            empty.setPadding(24, 32, 24, 32);
            empty.setBackgroundResource(R.drawable.bg_card);
            savedFilesContainer.addView(empty);
            return;
        }

        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        SimpleDateFormat sdf = new SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault());

        for (File file : files) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setBackgroundResource(R.drawable.bg_card);
            row.setPadding(28, 24, 28, 24);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            lp.bottomMargin = 18;
            row.setLayoutParams(lp);

            TextView title = new TextView(this);
            String icon = file.getName().endsWith(".pdf") ? "📄 " : "🖼️ ";
            title.setText(icon + file.getName());
            title.setTextColor(Color.parseColor("#0F172A"));
            title.setTextSize(15f);
            title.setTypeface(null, android.graphics.Typeface.BOLD);

            TextView meta = new TextView(this);
            long kb = Math.max(1, file.length() / 1024);
            meta.setText(sdf.format(new Date(file.lastModified())) + "  •  " + kb + " KB  •  ট্যাপ করে শেয়ার/ওপেন করুন");
            meta.setTextColor(Color.parseColor("#64748B"));
            meta.setTextSize(12f);
            meta.setPadding(0, 8, 0, 0);

            row.addView(title);
            row.addView(meta);
            row.setOnClickListener(v -> {
                try {
                    String mime = file.getName().endsWith(".pdf") ? "application/pdf" : "image/*";
                    NativePdfUtils.shareFile(this, file, mime);
                } catch (Exception e) {
                    Toast.makeText(this, "ফাইল খোলা যায়নি: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            });
            savedFilesContainer.addView(row);
        }
    }
}

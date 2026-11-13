package com.camlab.studio;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;

public final class NativePdfUtils {

    private NativePdfUtils() {}

    public static File getExportsDir(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "exports");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /**
     * Generate crisp custom-dimension PDF natively using android.graphics.pdf.PdfDocument,
     * store inside app vault AND save copy to device Downloads/camlab folder.
     */
    public static File saveBitmapsToPdf(Context ctx, List<Bitmap> pages, String fileName, boolean isA4) throws Exception {
        return saveBitmapsToPdf(ctx, pages, fileName, isA4 ? 210f : 152.4f, isA4 ? 297f : 101.6f);
    }

    public static File saveBitmapsToPdf(Context ctx, List<Bitmap> pages, String fileName, float sheetMmW, float sheetMmH) throws Exception {
        if (pages == null || pages.isEmpty()) return null;

        int pageW = Math.max(72, Math.round((Math.max(40f, sheetMmW) / 25.4f) * 72f));
        int pageH = Math.max(72, Math.round((Math.max(40f, sheetMmH) / 25.4f) * 72f));

        PdfDocument pdf = new PdfDocument();
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        for (int i = 0; i < pages.size(); i++) {
            Bitmap bmp = pages.get(i);
            PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(pageW, pageH, i + 1).create();
            PdfDocument.Page page = pdf.startPage(info);
            Canvas c = page.getCanvas();

            float scale = Math.min((float) pageW / bmp.getWidth(), (float) pageH / bmp.getHeight());
            float dw = bmp.getWidth() * scale;
            float dh = bmp.getHeight() * scale;
            float dx = (pageW - dw) * 0.5f;
            float dy = (pageH - dh) * 0.5f;
            c.drawBitmap(bmp, null, new RectF(dx, dy, dx + dw, dy + dh), paint);

            if (pages.size() > 1) {
                Paint footerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                footerPaint.setColor(android.graphics.Color.parseColor("#64748B"));
                footerPaint.setTextSize(9f);
                footerPaint.setTextAlign(Paint.Align.RIGHT);
                c.drawText("camlab  •  Page " + (i + 1) + " / " + pages.size(), pageW - 18f, pageH - 10f, footerPaint);
            }
            pdf.finishPage(page);
        }

        File outFile = new File(getExportsDir(ctx), fileName);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            pdf.writeTo(fos);
        }
        pdf.close();

        copyToPublicDownloads(ctx, outFile, fileName, "application/pdf");
        return outFile;
    }

    /**
     * Stitches multiple scanned pages vertically into one continuous Long Image (.jpg).
     */
    public static File exportLongImage(Context ctx, List<Bitmap> pages, String fileName) throws Exception {
        if (pages == null || pages.isEmpty()) return null;
        int targetW = 1080;
        int gap = 16;
        int totalH = gap;
        for (Bitmap b : pages) {
            int scaledH = Math.round(b.getHeight() * ((float) targetW / b.getWidth()));
            totalH += scaledH + gap;
        }
        totalH = Math.min(totalH, 14000); // Guard against OOM on huge page counts
        Bitmap longBmp = Bitmap.createBitmap(targetW, Math.max(100, totalH), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(longBmp);
        c.drawColor(android.graphics.Color.parseColor("#F1F5F9"));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        int curY = gap;
        for (Bitmap b : pages) {
            int scaledH = Math.round(b.getHeight() * ((float) targetW / b.getWidth()));
            if (curY + scaledH > totalH) break;
            c.drawBitmap(b, null, new RectF(12, curY, targetW - 12, curY + scaledH), p);
            curY += scaledH + gap;
        }
        return saveBitmapImage(ctx, longBmp, fileName, Bitmap.CompressFormat.JPEG);
    }

    /**
     * Exports OCR text or document metadata as an editable MS Word (.doc) file.
     */
    public static File exportToWordDoc(Context ctx, String title, String ocrText, String fileName) throws Exception {
        String safeTitle = (title == null || title.isEmpty()) ? "camlab Document" : title;
        String safeBody = (ocrText == null || ocrText.trim().isEmpty())
                ? "(কোনো টেক্সট পাওয়া যায়নি)"
                : ocrText.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>");
        String html = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "
                + "xmlns:w='urn:schemas-microsoft-com:office:word' "
                + "xmlns='http://www.w3.org/TR/REC-html40'>"
                + "<head><meta charset='utf-8'><title>" + safeTitle + "</title>"
                + "<style>body{font-family:'Segoe UI',Arial,sans-serif;padding:24pt;color:#0F172A;}"
                + "h1{color:#00896C;border-bottom:2px solid #00896C;padding-bottom:6pt;}</style></head>"
                + "<body><h1>" + safeTitle + "</h1>"
                + "<p style='line-height:1.7;font-size:12pt;'>" + safeBody + "</p>"
                + "<hr/><p style='font-size:9pt;color:#64748B;'>Exported by camlab Studio</p></body></html>";

        File outFile = new File(getExportsDir(ctx), fileName);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            fos.write(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        copyToPublicDownloads(ctx, outFile, fileName, "application/msword");
        return outFile;
    }

    /**
     * Exports OCR text / table rows into an Excel-compatible UTF-8 CSV (.csv) spreadsheet.
     */
    public static File exportToExcelCsv(Context ctx, String ocrText, String fileName) throws Exception {
        StringBuilder sb = new StringBuilder("\uFEFFRow,Column 1,Column 2,Column 3\n");
        String[] lines = (ocrText == null ? "" : ocrText).split("\\r?\\n");
        int rowNum = 1;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            String[] cols = trimmed.split("\\s{2,}|\\t|,");
            sb.append(rowNum++).append(",");
            for (int i = 0; i < Math.min(3, cols.length); i++) {
                String cell = cols[i].replace("\"", "\"\"");
                sb.append("\"").append(cell).append("\"").append(i < 2 ? "," : "");
            }
            for (int i = cols.length; i < 3; i++) {
                sb.append("\"\"\"\"").append(i < 2 ? "," : "");
            }
            sb.append("\n");
        }
        File outFile = new File(getExportsDir(ctx), fileName);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            fos.write(sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        copyToPublicDownloads(ctx, outFile, fileName, "text/csv");
        return outFile;
    }

    public static File saveBitmapImage(Context ctx, Bitmap bmp, String fileName, Bitmap.CompressFormat fmt) throws Exception {
        File outFile = new File(getExportsDir(ctx), fileName);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            bmp.compress(fmt, fmt == Bitmap.CompressFormat.PNG ? 100 : 95, fos);
        }
        String mime = fmt == Bitmap.CompressFormat.PNG ? "image/png" : "image/jpeg";
        copyToPublicDownloads(ctx, outFile, fileName, mime);
        return outFile;
    }

    private static void copyToPublicDownloads(Context ctx, File srcFile, String fileName, String mimeType) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/camlab");
                Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri != null) {
                    try (OutputStream os = ctx.getContentResolver().openOutputStream(uri);
                         FileInputStream fis = new FileInputStream(srcFile)) {
                        byte[] buf = new byte[8192];
                        int len;
                        while ((len = fis.read(buf)) > 0) os.write(buf, 0, len);
                    }
                }
            } else {
                File dlDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "camlab");
                if (!dlDir.exists()) dlDir.mkdirs();
                File pubFile = new File(dlDir, fileName);
                try (FileOutputStream fos = new FileOutputStream(pubFile);
                     FileInputStream fis = new FileInputStream(srcFile)) {
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = fis.read(buf)) > 0) fos.write(buf, 0, len);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Launch native Android Print Dialog directly from a Bitmap using PrintManager with custom sheet size.
     */
    public static void printBitmap(Activity activity, Bitmap sheetBmp, String jobName, boolean isA4) {
        printBitmap(activity, sheetBmp, jobName, isA4 ? 210f : 152.4f, isA4 ? 297f : 101.6f);
    }

    public static void printBitmap(Activity activity, Bitmap sheetBmp, String jobName, float sheetMmW, float sheetMmH) {
        PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        if (pm == null || sheetBmp == null) return;

        final int pw = Math.max(72, Math.round((Math.max(40f, sheetMmW) / 25.4f) * 72f));
        final int ph = Math.max(72, Math.round((Math.max(40f, sheetMmH) / 25.4f) * 72f));
        boolean landscape = sheetMmW > sheetMmH;
        int wMils = Math.max(1500, Math.round((sheetMmW / 25.4f) * 1000f));
        int hMils = Math.max(1500, Math.round((sheetMmH / 25.4f) * 1000f));
        PrintAttributes.MediaSize baseMedia = new PrintAttributes.MediaSize(
                "camlab_sheet_" + wMils + "x" + hMils,
                Math.round(sheetMmW) + "x" + Math.round(sheetMmH) + "mm",
                Math.min(wMils, hMils),
                Math.max(wMils, hMils)
        );
        PrintAttributes.MediaSize media = landscape ? baseMedia.asLandscape() : baseMedia.asPortrait();

        pm.print(jobName, new PrintDocumentAdapter() {
            @Override
            public void onLayout(PrintAttributes oldAttrs, PrintAttributes newAttrs, CancellationSignal cs, LayoutResultCallback cb, Bundle extras) {
                if (cs.isCanceled()) {
                    cb.onLayoutCancelled();
                    return;
                }
                PrintDocumentInfo info = new PrintDocumentInfo.Builder(jobName + ".pdf")
                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_PHOTO)
                        .setPageCount(1)
                        .build();
                cb.onLayoutFinished(info, true);
            }

            @Override
            public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal cs, WriteResultCallback cb) {
                try {
                    PdfDocument doc = new PdfDocument();
                    PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(pw, ph, 1).create());
                    Canvas c = page.getCanvas();
                    float s = Math.min((float) pw / sheetBmp.getWidth(), (float) ph / sheetBmp.getHeight());
                    float dw = sheetBmp.getWidth() * s;
                    float dh = sheetBmp.getHeight() * s;
                    c.drawBitmap(sheetBmp, null, new RectF((pw - dw) * 0.5f, (ph - dh) * 0.5f, (pw + dw) * 0.5f, (ph + dh) * 0.5f),
                            new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
                    doc.finishPage(page);
                    FileOutputStream out = new FileOutputStream(dest.getFileDescriptor());
                    doc.writeTo(out);
                    out.flush();
                    doc.close();
                    cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                } catch (Exception e) {
                    cb.onWriteFailed(e.getMessage());
                }
            }
        }, new PrintAttributes.Builder().setMediaSize(media).build());
    }

    public static void shareFile(Context ctx, File file, String mimeType) {
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.startActivity(Intent.createChooser(intent, "শেয়ার / ওপেন করুন"));
    }
}

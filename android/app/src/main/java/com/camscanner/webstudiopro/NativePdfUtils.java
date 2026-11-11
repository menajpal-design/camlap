package com.camscanner.webstudiopro;

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
     * Generate crisp A4 / 4x6 PDF natively using android.graphics.pdf.PdfDocument,
     * store inside app vault AND save copy to device Downloads/camlab folder.
     */
    public static File saveBitmapsToPdf(Context ctx, List<Bitmap> pages, String fileName, boolean isA4) throws Exception {
        if (pages == null || pages.isEmpty()) return null;

        int pageW = isA4 ? 595 : 432;  // 72 pt/in: A4 = 210mm, 4x6 = 6 in landscape
        int pageH = isA4 ? 842 : 288;  // A4 = 297mm, 4x6 = 4 in landscape

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
     * Launch native Android Print Dialog directly from a Bitmap using PrintManager.
     */
    public static void printBitmap(Activity activity, Bitmap sheetBmp, String jobName, boolean isA4) {
        PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        if (pm == null || sheetBmp == null) return;

        PrintAttributes.MediaSize media = isA4
                ? PrintAttributes.MediaSize.ISO_A4
                : PrintAttributes.MediaSize.NA_INDEX_4X6.asLandscape();

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
                    int pw = isA4 ? 595 : 432;
                    int ph = isA4 ? 842 : 288;
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

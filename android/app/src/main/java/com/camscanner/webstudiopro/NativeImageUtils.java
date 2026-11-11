package com.camscanner.webstudiopro;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.DashPathEffect;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RectF;
import android.media.ExifInterface;
import android.media.FaceDetector;
import android.net.Uri;

import java.io.InputStream;
import java.util.ArrayDeque;

public final class NativeImageUtils {

    private NativeImageUtils() {}

    public static final class PortraitInfo {
        public boolean faceDetected;
        public float centerX;
        public float crownY;
        public float chinY;
        public float faceWidth;
        public boolean isFemale;
        public String genderLabelBn = "ছেলে / পুরুষ";
        public String attireLabelBn = "সাধারণ পোশাক (স্যুট দিন)";
        public boolean needsSuit = true;
    }

    /**
     * Load image safely from Uri with EXIF rotation applied and OOM protection.
     */
    public static Bitmap loadBitmapSafe(Context ctx, Uri uri, int maxDim) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream is = ctx.getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(is, null, bounds);
            }

            int sample = 1;
            int w = bounds.outWidth;
            int h = bounds.outHeight;
            while ((w / sample) > maxDim * 2 || (h / sample) > maxDim * 2) {
                sample *= 2;
            }

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap decoded;
            try (InputStream is2 = ctx.getContentResolver().openInputStream(uri)) {
                decoded = BitmapFactory.decodeStream(is2, null, opts);
            }
            if (decoded == null) return null;

            int rotDeg = 0;
            try (InputStream exifStream = ctx.getContentResolver().openInputStream(uri)) {
                if (exifStream != null) {
                    ExifInterface exif = new ExifInterface(exifStream);
                    int orient = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    if (orient == ExifInterface.ORIENTATION_ROTATE_90) rotDeg = 90;
                    else if (orient == ExifInterface.ORIENTATION_ROTATE_180) rotDeg = 180;
                    else if (orient == ExifInterface.ORIENTATION_ROTATE_270) rotDeg = 270;
                }
            } catch (Exception ignored) {}

            if (rotDeg != 0) {
                decoded = rotateBitmap(decoded, rotDeg);
            }

            if (Math.max(decoded.getWidth(), decoded.getHeight()) > maxDim) {
                float scale = (float) maxDim / Math.max(decoded.getWidth(), decoded.getHeight());
                int nw = Math.max(1, Math.round(decoded.getWidth() * scale));
                int nh = Math.max(1, Math.round(decoded.getHeight() * scale));
                decoded = Bitmap.createScaledBitmap(decoded, nw, nh, true);
            }
            return decoded;
        } catch (Exception e) {
            return null;
        }
    }

    public static Bitmap rotateBitmap(Bitmap src, int degrees) {
        if (src == null || degrees % 360 == 0) return src;
        Matrix m = new Matrix();
        m.postRotate(degrees);
        return Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
    }

    /**
     * Native Biometric Analyzer:
     * Uses Android FaceDetector (eyes midpoint + eye distance) + Skin fallback to determine
     * Crown of head, Chin, Center X, Male/Female hair cues, and Attire colors.
     */
    public static PortraitInfo analyzePortrait(Bitmap src) {
        PortraitInfo info = new PortraitInfo();
        if (src == null) return info;

        int maxW = 360;
        float scale = Math.min(1f, (float) maxW / Math.max(src.getWidth(), src.getHeight()));
        int sw = Math.max(40, Math.round(src.getWidth() * scale));
        if (sw % 2 != 0) sw--; // FaceDetector requires even width
        int sh = Math.max(40, Math.round(src.getHeight() * scale));

        Bitmap rgb565 = Bitmap.createBitmap(sw, sh, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(rgb565);
        c.drawBitmap(src, null, new RectF(0, 0, sw, sh), new Paint(Paint.FILTER_BITMAP_FLAG));

        FaceDetector detector = new FaceDetector(sw, sh, 1);
        FaceDetector.Face[] faces = new FaceDetector.Face[1];
        int count = detector.findFaces(rgb565, faces);

        float cx = sw * 0.5f;
        float eyeDist = sw * 0.22f;
        float eyeY = sh * 0.36f;

        if (count > 0 && faces[0] != null) {
            PointF mid = new PointF();
            faces[0].getMidPoint(mid);
            float ed = faces[0].eyesDistance();
            if (ed > sw * 0.06f) {
                info.faceDetected = true;
                cx = mid.x;
                eyeY = mid.y;
                eyeDist = ed;
            }
        }

        // Convert to full-res coordinates using biometric human proportions
        float inv = 1f / scale;
        float faceW = Math.max(sw * 0.28f, eyeDist * 2.15f);
        float crown = Math.max(0f, eyeY - faceW * 0.68f);
        float chin = Math.min(sh, eyeY + faceW * 0.72f);

        // Estimate Male vs Female via side hair beside jaw/neck
        int[] px = new int[sw * sh];
        Bitmap argbSmall = Bitmap.createScaledBitmap(src, sw, sh, true);
        argbSmall.getPixels(px, 0, sw, 0, 0, sw, sh);

        int bg = px[2 * sw + 2];
        int bgR = Color.red(bg), bgG = Color.green(bg), bgB = Color.blue(bg);

        int hairSide = 0, hairTot = 0;
        int sy1 = Math.max(0, Math.round(eyeY + faceW * 0.12f));
        int sy2 = Math.min(sh - 1, Math.round(chin + faceW * 0.30f));
        int lx1 = Math.max(0, Math.round(cx - faceW * 0.85f));
        int lx2 = Math.max(0, Math.round(cx - faceW * 0.50f));
        int rx1 = Math.min(sw - 1, Math.round(cx + faceW * 0.50f));
        int rx2 = Math.min(sw - 1, Math.round(cx + faceW * 0.85f));

        for (int y = sy1; y <= sy2; y += 2) {
            for (int x = lx1; x <= lx2; x += 2) {
                hairTot++;
                int col = px[y * sw + x];
                if (isDarkNonBg(col, bgR, bgG, bgB)) hairSide++;
            }
            for (int x = rx1; x <= rx2; x += 2) {
                hairTot++;
                int col = px[y * sw + x];
                if (isDarkNonBg(col, bgR, bgG, bgB)) hairSide++;
            }
        }
        float hairRatio = hairSide / Math.max(1f, (float) hairTot);
        info.isFemale = hairRatio > 0.34f;
        info.genderLabelBn = info.isFemale ? "মেয়ে / নারী" : "ছেলে / পুরুষ";

        // Attire check below chin
        int chestY1 = Math.min(sh - 2, Math.round(chin + faceW * 0.18f));
        int chestY2 = Math.min(sh - 1, Math.round(chin + faceW * 0.65f));
        int darkChest = 0, brightChest = 0, chestTot = 0;
        for (int y = chestY1; y <= chestY2; y += 2) {
            for (int x = Math.max(0, Math.round(cx - faceW * 0.7f)); x <= Math.min(sw - 1, Math.round(cx + faceW * 0.7f)); x += 2) {
                int col = px[y * sw + x];
                int lum = (Color.red(col) * 299 + Color.green(col) * 587 + Color.blue(col) * 114) / 1000;
                chestTot++;
                if (lum < 75) darkChest++;
                else if (lum > 185) brightChest++;
            }
        }
        if (darkChest > chestTot * 0.45f) {
            info.attireLabelBn = "ফরমাল স্যুট / ডার্ক পোশাক ✓";
            info.needsSuit = false;
        } else if (brightChest > chestTot * 0.5f) {
            info.attireLabelBn = "সাদা / হালকা ফরমাল শার্ট ✓";
            info.needsSuit = false;
        } else {
            info.attireLabelBn = "ক্যাজুয়াল পোশাক (অটো স্যুট দিন)";
            info.needsSuit = true;
        }

        info.centerX = cx * inv;
        info.crownY = crown * inv;
        info.chinY = chin * inv;
        info.faceWidth = faceW * inv;
        return info;
    }

    private static boolean isDarkNonBg(int col, int bgR, int bgG, int bgB) {
        int r = Color.red(col), g = Color.green(col), b = Color.blue(col);
        double lum = 0.299 * r + 0.587 * g + 0.114 * b;
        double distBg = Math.hypot(r - bgR, Math.hypot(g - bgG, b - bgB));
        return lum < 115 && distBg > 28;
    }

    /**
     * Strictly frames Head Crown + Face + Neck + Required Upper Chest for Passport size.
     */
    public static Bitmap renderPassportPhoto(
            Bitmap src,
            PortraitInfo info,
            int targetW,
            int targetH,
            float userZoom,
            float panX,
            float panY,
            int suitMode,
            int bgColor,
            boolean doReplaceBg
    ) {
        if (src == null) return null;

        Bitmap working = src;
        if (doReplaceBg) {
            working = replaceBackground(src, bgColor, 36);
        }

        Bitmap out = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(bgColor);

        float headH = Math.max(40f, info.chinY - info.crownY);
        float fitScale = (targetH * 0.54f) / headH;
        float minCoverW = (float) targetW / working.getWidth();
        float baseScale = Math.max(fitScale, minCoverW);
        float finalScale = baseScale * userZoom;

        float offsetX = (targetW * 0.5f) - (info.centerX * finalScale) + panX;
        float offsetY = (targetH * 0.11f) - (info.crownY * finalScale) + panY;

        canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(finalScale, finalScale);
        canvas.drawBitmap(working, 0f, 0f, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        canvas.restore();

        // Draw crisp Native Formal Suit Overlay anchored to Chin/Neck
        if (suitMode > 0) {
            float renderedChinY = (info.chinY * finalScale) + offsetY;
            float neckY = Math.max(targetH * 0.58f, Math.min(targetH * 0.78f, renderedChinY + targetH * 0.045f));
            drawFormalSuit(canvas, targetW, targetH, neckY, suitMode);
        }

        return out;
    }

    private static void drawFormalSuit(Canvas c, int w, int h, float neckY, int suitMode) {
        int suitColor = Color.parseColor("#111827");
        int tieColor = Color.parseColor("#991B1B");
        if (suitMode == 2) {
            suitColor = Color.parseColor("#1E3A8A");
            tieColor = Color.parseColor("#B91C1C");
        } else if (suitMode == 3) {
            suitColor = Color.parseColor("#1F2937"); // Women's dark blazer
        }

        Paint shirtPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        shirtPaint.setColor(Color.WHITE);

        Paint suitPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        suitPaint.setColor(suitColor);

        Paint lapelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        lapelPaint.setColor(Color.parseColor("#0B0F19"));

        float cx = w * 0.5f;
        float collarHalf = w * 0.16f;
        float shoulderW = w * 0.52f;
        float dropY = h * 1.05f;

        // Inner White V-Shirt
        Path shirt = new Path();
        shirt.moveTo(cx - collarHalf * 0.9f, neckY);
        shirt.lineTo(cx + collarHalf * 0.9f, neckY);
        shirt.lineTo(cx + collarHalf * 1.3f, dropY);
        shirt.lineTo(cx - collarHalf * 1.3f, dropY);
        shirt.close();
        c.drawPath(shirt, shirtPaint);

        // Tie for Mens Suits (modes 1 & 2)
        if (suitMode == 1 || suitMode == 2) {
            Paint tiePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            tiePaint.setColor(tieColor);
            Path tie = new Path();
            tie.moveTo(cx - w * 0.032f, neckY + h * 0.02f);
            tie.lineTo(cx + w * 0.032f, neckY + h * 0.02f);
            tie.lineTo(cx + w * 0.048f, dropY);
            tie.lineTo(cx - w * 0.048f, dropY);
            tie.close();
            c.drawPath(tie, tiePaint);
        }

        // Left & Right Suit Jackets + Shoulders
        Path leftJacket = new Path();
        leftJacket.moveTo(cx - collarHalf, neckY - h * 0.01f);
        leftJacket.quadTo(cx - shoulderW * 0.72f, neckY + h * 0.04f, -w * 0.05f, h * 0.88f);
        leftJacket.lineTo(-w * 0.05f, dropY);
        leftJacket.lineTo(cx - (suitMode == 3 ? w * 0.08f : w * 0.02f), dropY);
        leftJacket.close();
        c.drawPath(leftJacket, suitPaint);

        Path rightJacket = new Path();
        rightJacket.moveTo(cx + collarHalf, neckY - h * 0.01f);
        rightJacket.quadTo(cx + shoulderW * 0.72f, neckY + h * 0.04f, w * 1.05f, h * 0.88f);
        rightJacket.lineTo(w * 1.05f, dropY);
        rightJacket.lineTo(cx + (suitMode == 3 ? w * 0.08f : w * 0.02f), dropY);
        rightJacket.close();
        c.drawPath(rightJacket, suitPaint);

        // Clean collar lapel highlight
        lapelPaint.setStyle(Paint.Style.STROKE);
        lapelPaint.setStrokeWidth(Math.max(2f, w * 0.008f));
        c.drawLine(cx - collarHalf, neckY, cx - w * 0.03f, h * 0.94f, lapelPaint);
        c.drawLine(cx + collarHalf, neckY, cx + w * 0.03f, h * 0.94f, lapelPaint);
    }

    /**
     * Border flood-fill background replacement protecting central face + chest oval.
     */
    public static Bitmap replaceBackground(Bitmap src, int targetColor, int tolerance) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] pixels = new int[w * h];
        src.getPixels(pixels, 0, w, 0, 0, w, h);

        int[] cornerIdx = new int[]{
                2 * w + 2,
                2 * w + Math.max(2, w - 3),
                Math.round(h * 0.25f) * w + 2,
                Math.round(h * 0.25f) * w + Math.max(2, w - 3)
        };
        int sumR = 0, sumG = 0, sumB = 0;
        for (int ci : cornerIdx) {
            int col = pixels[Math.max(0, Math.min(pixels.length - 1, ci))];
            sumR += Color.red(col);
            sumG += Color.green(col);
            sumB += Color.blue(col);
        }
        int bgR = sumR / 4, bgG = sumG / 4, bgB = sumB / 4;
        float tolSq = tolerance * tolerance * 3.2f;

        boolean[] visited = new boolean[w * h];
        ArrayDeque<Integer> q = new ArrayDeque<>();
        for (int x = 0; x < w; x += 2) {
            q.add(x);
            visited[x] = true;
        }
        for (int y = 0; y < h; y += 2) {
            int l = y * w;
            int r = y * w + (w - 1);
            if (!visited[l]) { q.add(l); visited[l] = true; }
            if (!visited[r]) { q.add(r); visited[r] = true; }
        }

        float pCx = w * 0.5f, pCy = h * 0.44f;
        float pRx = w * 0.24f, pRy = h * 0.30f;

        while (!q.isEmpty()) {
            int idx = q.poll();
            int x = idx % w;
            int y = idx / w;

            double ndx = (x - pCx) / pRx;
            double ndy = (y - pCy) / pRy;
            if (ndx * ndx + ndy * ndy < 1.0) continue;

            int col = pixels[idx];
            int dr = Color.red(col) - bgR;
            int dg = Color.green(col) - bgG;
            int db = Color.blue(col) - bgB;
            if (dr * dr + dg * dg + db * db > tolSq) continue;

            pixels[idx] = targetColor;

            int[] nb = new int[]{idx - 1, idx + 1, idx - w, idx + w};
            for (int n : nb) {
                if (n >= 0 && n < pixels.length && !visited[n]) {
                    visited[n] = true;
                    q.add(n);
                }
            }
        }

        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, w, 0, 0, w, h);
        return out;
    }

    /**
     * Compose 200 DPI A4 or 4x6 Print Sheet with configurable Photos-Per-Row & Row Count.
     */
    public static Bitmap composePrintSheet(
            Bitmap singlePhoto,
            float photoMmW,
            float photoMmH,
            boolean isA4,
            int photosPerRow,
            int rowsWanted,
            boolean cutLines
    ) {
        if (singlePhoto == null) return null;
        int dpi = 200;
        float sheetMmW = isA4 ? 210f : 152.4f;
        float sheetMmH = isA4 ? 297f : 101.6f;

        int sheetW = Math.round((sheetMmW / 25.4f) * dpi);
        int sheetH = Math.round((sheetMmH / 25.4f) * dpi);

        Bitmap sheet = Bitmap.createBitmap(sheetW, sheetH, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(sheet);
        c.drawColor(Color.WHITE);

        float photoW = (photoMmW / 25.4f) * dpi;
        float photoH = (photoMmH / 25.4f) * dpi;
        float gap = (3.5f / 25.4f) * dpi;
        float margin = (6f / 25.4f) * dpi;

        int cols = Math.max(1, photosPerRow);
        float usableW = sheetW - margin * 2f;
        float reqW = cols * photoW + (cols - 1) * gap;
        if (reqW > usableW) {
            float shrink = usableW / reqW;
            photoW *= shrink;
            photoH *= shrink;
            gap = Math.max(6f, gap * shrink);
        }

        int maxRowsFit = Math.max(1, (int) Math.floor((sheetH - margin * 2f + gap) / (photoH + gap)));
        int rows = (rowsWanted <= 0) ? maxRowsFit : Math.min(maxRowsFit, rowsWanted);

        float gridW = cols * photoW + (cols - 1) * gap;
        float startX = (sheetW - gridW) * 0.5f;
        float startY = margin + dpi * 0.08f;

        Paint borderPaint = new Paint();
        borderPaint.setColor(Color.parseColor("#CBD5E1"));
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(1.5f);

        Paint cutPaint = new Paint();
        cutPaint.setColor(Color.parseColor("#94A3B8"));
        cutPaint.setStyle(Paint.Style.STROKE);
        cutPaint.setStrokeWidth(1.2f);
        cutPaint.setPathEffect(new DashPathEffect(new float[]{6f, 6f}, 0f));

        Paint imgPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        int count = 0;
        for (int r = 0; r < rows; r++) {
            float py = startY + r * (photoH + gap);
            if (py + photoH > sheetH - margin) break;
            for (int col = 0; col < cols; col++) {
                float px = startX + col * (photoW + gap);
                RectF dst = new RectF(px, py, px + photoW, py + photoH);
                c.drawBitmap(singlePhoto, null, dst, imgPaint);
                c.drawRect(dst, borderPaint);

                if (cutLines) {
                    float mLen = Math.min(16f, gap * 0.5f);
                    c.drawLine(px - mLen, py, px, py, cutPaint);
                    c.drawLine(px, py - mLen, px, py, cutPaint);
                    c.drawLine(px + photoW, py, px + photoW + mLen, py, cutPaint);
                    c.drawLine(px + photoW, py - mLen, px + photoW, py, cutPaint);
                }
                count++;
            }
        }

        Paint footerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        footerPaint.setColor(Color.parseColor("#64748B"));
        footerPaint.setTextSize(dpi * 0.048f);
        c.drawText("camlab Print Studio | " + cols + " Photos/Row • " + count + " Total", margin, sheetH - dpi * 0.14f, footerPaint);
        return sheet;
    }

    /**
     * Document filter & optional border trim: 0=Original, 1=Magic Color, 2=B&W
     */
    public static Bitmap applyDocFilter(Bitmap src, int mode) {
        if (src == null) return null;
        if (mode == 0) return src;

        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint p = new Paint();
        ColorMatrix cm = new ColorMatrix();

        if (mode == 2) {
            // Crisp Black & White Document
            cm.setSaturation(0f);
            float contrast = 1.65f;
            float shift = (-0.5f * contrast + 0.5f) * 255f + 18f;
            ColorMatrix cMat = new ColorMatrix(new float[]{
                    contrast, 0, 0, 0, shift,
                    0, contrast, 0, 0, shift,
                    0, 0, contrast, 0, shift,
                    0, 0, 0, 1, 0
            });
            cm.postConcat(cMat);
        } else {
            // Magic Color: boost brightness & contrast for crisp white paper look
            cm.setSaturation(1.18f);
            float contrast = 1.32f;
            float shift = (-0.5f * contrast + 0.5f) * 255f + 22f;
            ColorMatrix cMat = new ColorMatrix(new float[]{
                    contrast, 0, 0, 0, shift,
                    0, contrast, 0, 0, shift,
                    0, 0, contrast, 0, shift,
                    0, 0, 0, 1, 0
            });
            cm.postConcat(cMat);
        }

        p.setColorFilter(new ColorMatrixColorFilter(cm));
        c.drawBitmap(src, 0, 0, p);
        return out;
    }
}

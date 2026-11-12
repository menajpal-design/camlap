package com.camlab.studio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.ExifInterface;
import android.net.Uri;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.face.FaceLandmark;
import com.google.mlkit.vision.segmentation.Segmentation;
import com.google.mlkit.vision.segmentation.SegmentationMask;
import com.google.mlkit.vision.segmentation.Segmenter;
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.Core;
import org.opencv.core.CvType;
import org.opencv.core.Mat;
import org.opencv.core.MatOfPoint;
import org.opencv.core.MatOfPoint2f;
import org.opencv.core.Point;
import org.opencv.core.Size;
import org.opencv.imgproc.Imgproc;

import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public final class NativeImageUtils {

    private static volatile boolean openCvReady = false;

    private NativeImageUtils() {}

    public static synchronized boolean ensureOpenCV() {
        if (!openCvReady) {
            try {
                openCvReady = OpenCVLoader.initLocal();
            } catch (Throwable ignored) {
                openCvReady = false;
            }
        }
        return openCvReady;
    }

    public static final class PortraitInfo {
        public boolean faceDetected;
        public boolean humanDetected;
        public float centerX;
        public float crownY;
        public float chinY;
        public float faceWidth;
        public float tiltDeg;
        public boolean isFemale;
        public String genderLabelBn = "ছেলে / পুরুষ";
        public String attireLabelBn = "সাধারণ পোশাক (স্যুট দিন)";
        public boolean needsSuit = true;
    }

    /**
     * Load image safely from Uri with EXIF orientation applied and OOM protection.
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

    public static Bitmap rotateBitmap(Bitmap src, float degrees) {
        if (src == null || Math.abs(degrees % 360f) < 0.2f) return src;
        Matrix m = new Matrix();
        m.postRotate(degrees);
        return Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
    }

    /**
     * AI Biometric Analyzer backed by Bundled Google ML Kit Neural Face Detector:
     * Accurately locates face bounding box, eyes, chin, head tilt, Male/Female hair cues, and attire.
     */
    public static PortraitInfo analyzePortrait(Bitmap src) {
        PortraitInfo info = new PortraitInfo();
        if (src == null) return info;

        int w = src.getWidth();
        int h = src.getHeight();
        float cx = w * 0.5f;
        float top = h * 0.16f;
        float bot = h * 0.62f;
        float faceW = w * 0.38f;

        try {
            FaceDetectorOptions opts = new FaceDetectorOptions.Builder()
                    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                    .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                    .setMinFaceSize(0.12f)
                    .build();
            FaceDetector detector = FaceDetection.getClient(opts);
            InputImage image = InputImage.fromBitmap(src, 0);
            List<Face> faces = Tasks.await(detector.process(image));
            detector.close();

            if (faces != null && !faces.isEmpty()) {
                Face best = faces.get(0);
                Rect bb = best.getBoundingBox();
                info.faceDetected = true;
                info.humanDetected = true;
                faceW = Math.max(40f, bb.width());
                cx = bb.exactCenterX();

                FaceLandmark leftEye = best.getLandmark(FaceLandmark.LEFT_EYE);
                FaceLandmark rightEye = best.getLandmark(FaceLandmark.RIGHT_EYE);
                if (leftEye != null && rightEye != null) {
                    cx = (leftEye.getPosition().x + rightEye.getPosition().x) * 0.5f;
                }

                // Neural box top is forehead/brow level; lift cleanly above hair crown (~28% of face height)
                float boxH = Math.max(40f, bb.height());
                top = Math.max(0f, bb.top - boxH * 0.26f);
                bot = Math.min(h, bb.bottom + boxH * 0.05f);
                info.tiltDeg = best.getHeadEulerAngleZ();
            }
        } catch (Exception ignored) {}

        // Dual-stage Human Detector: if neural face box wasn't triggered (e.g. far shot or sunglasses),
        // locate human silhouette bounds via ML Kit Selfie Segmentation.
        if (!info.faceDetected) {
            try {
                SelfieSegmenterOptions sOpts = new SelfieSegmenterOptions.Builder()
                        .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
                        .build();
                Segmenter seg = Segmentation.getClient(sOpts);
                SegmentationMask mask = Tasks.await(seg.process(InputImage.fromBitmap(src, 0)));
                seg.close();
                int mw = mask.getWidth(), mh = mask.getHeight();
                ByteBuffer buf = mask.getBuffer();
                buf.rewind();
                float[] conf = new float[mw * mh];
                buf.asFloatBuffer().get(conf);
                int minX = mw, maxX = -1, minY = mh, maxY = -1, fgCount = 0;
                for (int y = 0; y < mh; y++) {
                    for (int x = 0; x < mw; x++) {
                        if (conf[y * mw + x] > 0.55f) {
                            fgCount++;
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (fgCount > mw * mh * 0.05f && maxX > minX && maxY > minY) {
                    info.humanDetected = true;
                    float sx = (float) w / mw, sy = (float) h / mh;
                    cx = ((minX + maxX) * 0.5f) * sx;
                    top = Math.max(0f, minY * sy);
                    float humanH = (maxY - minY) * sy;
                    bot = Math.min(h, top + humanH * 0.44f);
                    faceW = Math.max(40f, (maxX - minX) * sx * 0.52f);
                }
            } catch (Exception ignored) {}
        }

        // Analyze downscaled copy for Male/Female side hair & Attire chest colors
        int sw = 240;
        float s = Math.min(1f, (float) sw / Math.max(w, h));
        int dw = Math.max(40, Math.round(w * s));
        int dh = Math.max(40, Math.round(h * s));
        Bitmap small = Bitmap.createScaledBitmap(src, dw, dh, true);
        int[] px = new int[dw * dh];
        small.getPixels(px, 0, dw, 0, 0, dw, dh);

        int bg = px[2 * dw + 2];
        int bgR = Color.red(bg), bgG = Color.green(bg), bgB = Color.blue(bg);

        float scx = cx * s, sfW = faceW * s, sTop = top * s, sChin = bot * s;
        int hairSide = 0, hairTot = 0;
        int sy1 = Math.max(0, Math.round(sTop + (sChin - sTop) * 0.45f));
        int sy2 = Math.min(dh - 1, Math.round(sChin + sfW * 0.34f));
        int lx1 = Math.max(0, Math.round(scx - sfW * 0.90f));
        int lx2 = Math.max(0, Math.round(scx - sfW * 0.50f));
        int rx1 = Math.min(dw - 1, Math.round(scx + sfW * 0.50f));
        int rx2 = Math.min(dw - 1, Math.round(scx + sfW * 0.90f));

        for (int y = sy1; y <= sy2; y += 2) {
            for (int x = lx1; x <= lx2; x += 2) {
                hairTot++;
                if (isDarkNonBg(px[y * dw + x], bgR, bgG, bgB)) hairSide++;
            }
            for (int x = rx1; x <= rx2; x += 2) {
                hairTot++;
                if (isDarkNonBg(px[y * dw + x], bgR, bgG, bgB)) hairSide++;
            }
        }
        info.isFemale = (hairSide / Math.max(1f, (float) hairTot)) > 0.32f;
        info.genderLabelBn = info.isFemale ? "মেয়ে / নারী" : "ছেলে / পুরুষ";

        int chestY1 = Math.min(dh - 2, Math.round(sChin + sfW * 0.16f));
        int chestY2 = Math.min(dh - 1, Math.round(sChin + sfW * 0.65f));
        int darkChest = 0, brightChest = 0, chestTot = 0;
        for (int y = chestY1; y <= chestY2; y += 2) {
            for (int x = Math.max(0, Math.round(scx - sfW * 0.7f)); x <= Math.min(dw - 1, Math.round(scx + sfW * 0.7f)); x += 2) {
                int col = px[y * dw + x];
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

        info.centerX = cx;
        info.crownY = top;
        info.chinY = bot;
        info.faceWidth = faceW;
        return info;
    }

    private static boolean isDarkNonBg(int col, int bgR, int bgG, int bgB) {
        int r = Color.red(col), g = Color.green(col), b = Color.blue(col);
        double lum = 0.299 * r + 0.587 * g + 0.114 * b;
        double distBg = Math.hypot(r - bgR, Math.hypot(g - bgG, b - bgB));
        return lum < 115 && distBg > 28;
    }

    /**
     * Hybrid AI Human Cutout: Google ML Kit Selfie Segmentation (raw high-res mask)
     * refined with OpenCV C++ GrabCut (GMM foreground/background graph-cut),
     * core face/neck protection, Gaussian alpha feathering & color-spill removal.
     * Returns transparent ARGB_8888 Bitmap containing ONLY the person.
     */
    public static Bitmap extractForegroundCutoutAI(Bitmap src, PortraitInfo info) {
        if (src == null) return null;
        int w = src.getWidth();
        int h = src.getHeight();
        float[] mlAlpha = new float[w * h];
        boolean hasMlMask = false;

        try {
            SelfieSegmenterOptions opts = new SelfieSegmenterOptions.Builder()
                    .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
                    .enableRawSizeMask()
                    .build();
            Segmenter segmenter = Segmentation.getClient(opts);
            SegmentationMask mask = Tasks.await(segmenter.process(InputImage.fromBitmap(src, 0)));
            segmenter.close();

            int mw = mask.getWidth();
            int mh = mask.getHeight();
            ByteBuffer buf = mask.getBuffer();
            buf.rewind();
            buf.order(ByteOrder.nativeOrder());
            float[] conf = new float[mw * mh];
            buf.asFloatBuffer().get(conf);

            float maxC = 0f;
            for (int i = 0; i < conf.length; i += Math.max(1, conf.length / 200)) {
                if (!Float.isNaN(conf[i]) && conf[i] <= 1.05f && conf[i] > maxC) maxC = conf[i];
            }
            if (maxC > 0.15f) {
                hasMlMask = true;
                for (int y = 0; y < h; y++) {
                    float fy = ((y + 0.5f) * mh / h) - 0.5f;
                    int y0 = Math.max(0, Math.min(mh - 1, (int) Math.floor(fy)));
                    int y1 = Math.max(0, Math.min(mh - 1, y0 + 1));
                    float wy = Math.max(0f, fy - y0);
                    for (int x = 0; x < w; x++) {
                        float fx = ((x + 0.5f) * mw / w) - 0.5f;
                        int x0 = Math.max(0, Math.min(mw - 1, (int) Math.floor(fx)));
                        int x1 = Math.max(0, Math.min(mw - 1, x0 + 1));
                        float wx = Math.max(0f, fx - x0);
                        float c00 = conf[y0 * mw + x0], c10 = conf[y0 * mw + x1];
                        float c01 = conf[y1 * mw + x0], c11 = conf[y1 * mw + x1];
                        float c = (c00 * (1f - wx) + c10 * wx) * (1f - wy) + (c01 * (1f - wx) + c11 * wx) * wy;
                        mlAlpha[y * w + x] = Math.max(0f, Math.min(1f, c));
                    }
                }
            }
        } catch (Exception ignored) {}

        // Stage 2: OpenCV C++ GrabCut refinement (either refines ML Kit mask or performs full Cutout from FaceBox)
        float[] finalAlpha = new float[w * h];
        if (hasMlMask) {
            System.arraycopy(mlAlpha, 0, finalAlpha, 0, mlAlpha.length);
        }

        if (ensureOpenCV()) {
            try {
                int maxGcDim = 340;
                float gcScale = Math.min(1f, (float) maxGcDim / Math.max(w, h));
                int gw = Math.max(48, Math.round(w * gcScale));
                int gh = Math.max(48, Math.round(h * gcScale));
                Bitmap smallBmp = Bitmap.createScaledBitmap(src, gw, gh, true);

                Mat rgba = new Mat();
                Utils.bitmapToMat(smallBmp, rgba);
                Mat rgb = new Mat();
                Imgproc.cvtColor(rgba, rgb, Imgproc.COLOR_RGBA2RGB);

                Mat gcMask = new Mat(gh, gw, CvType.CV_8UC1);
                byte[] gcBytes = new byte[gw * gh];

                float fCx = (info != null && info.humanDetected) ? info.centerX * gcScale : gw * 0.5f;
                float fW = (info != null && info.humanDetected) ? Math.max(16f, info.faceWidth * gcScale) : gw * 0.36f;
                float fTop = (info != null && info.humanDetected) ? info.crownY * gcScale : gh * 0.14f;
                float fChin = (info != null && info.humanDetected) ? info.chinY * gcScale : gh * 0.60f;
                float fCy = (fTop + fChin) * 0.50f;
                float fRx = Math.max(12f, fW * 0.36f);
                float fRy = Math.max(16f, (fChin - fTop) * 0.44f);

                for (int y = 0; y < gh; y++) {
                    int sy = Math.min(h - 1, Math.round(y / gcScale));
                    for (int x = 0; x < gw; x++) {
                        int sx = Math.min(w - 1, Math.round(x / gcScale));
                        float nx = (x - fCx) / fRx;
                        float ny = (y - fCy) / fRy;
                        boolean inFaceCore = (nx * nx + ny * ny) < 0.70f;
                        boolean inBodyCore = (y > fChin && Math.abs(x - fCx) < fW * 0.42f);
                        boolean outerMargin = (x < gw * 0.05f || x > gw * 0.95f || y < gh * 0.04f) && !inFaceCore && !inBodyCore;

                        if (inFaceCore) {
                            gcBytes[y * gw + x] = (byte) Imgproc.GC_FGD;
                        } else if (hasMlMask) {
                            float p = mlAlpha[sy * w + sx];
                            if (outerMargin && p < 0.45f) gcBytes[y * gw + x] = (byte) Imgproc.GC_BGD;
                            else if (p >= 0.85f) gcBytes[y * gw + x] = (byte) Imgproc.GC_FGD;
                            else if (p >= 0.52f || inBodyCore) gcBytes[y * gw + x] = (byte) Imgproc.GC_PR_FGD;
                            else if (p >= 0.20f) gcBytes[y * gw + x] = (byte) Imgproc.GC_PR_BGD;
                            else gcBytes[y * gw + x] = (byte) Imgproc.GC_BGD;
                        } else {
                            if (inBodyCore) gcBytes[y * gw + x] = (byte) Imgproc.GC_FGD;
                            else if (outerMargin) gcBytes[y * gw + x] = (byte) Imgproc.GC_BGD;
                            else if (Math.abs(x - fCx) < fW * 1.15f && y >= fTop * 0.85f) gcBytes[y * gw + x] = (byte) Imgproc.GC_PR_FGD;
                            else gcBytes[y * gw + x] = (byte) Imgproc.GC_PR_BGD;
                        }
                    }
                }
                gcMask.put(0, 0, gcBytes);

                Mat bgModel = new Mat();
                Mat fgModel = new Mat();
                Imgproc.grabCut(rgb, gcMask, new org.opencv.core.Rect(), bgModel, fgModel, 3, Imgproc.GC_INIT_WITH_MASK);
                gcMask.get(0, 0, gcBytes);

                // Upscale binary GrabCut result & merge cleanly with neural confidence
                float[] gcFloat = new float[gw * gh];
                for (int i = 0; i < gcBytes.length; i++) {
                    byte v = gcBytes[i];
                    gcFloat[i] = (v == Imgproc.GC_FGD || v == Imgproc.GC_PR_FGD) ? 1.0f : 0.0f;
                }
                Mat gcMat = new Mat(gh, gw, CvType.CV_32FC1);
                gcMat.put(0, 0, gcFloat);
                Mat gcUp = new Mat();
                Imgproc.resize(gcMat, gcUp, new Size(w, h), 0, 0, Imgproc.INTER_LINEAR);
                float[] gcFull = new float[w * h];
                gcUp.get(0, 0, gcFull);

                for (int i = 0; i < finalAlpha.length; i++) {
                    if (hasMlMask) {
                        // Crisp consensus: keep hair detail from ML Kit while removing stubborn background via GrabCut
                        float ml = mlAlpha[i];
                        float gc = gcFull[i];
                        finalAlpha[i] = (ml >= 0.72f) ? Math.max(ml, gc)
                                : (ml <= 0.30f && gc < 0.5f) ? 0f
                                : (ml * 0.55f + gc * 0.45f);
                    } else {
                        finalAlpha[i] = gcFull[i];
                    }
                }

                rgba.release(); rgb.release(); gcMask.release();
                bgModel.release(); fgModel.release(); gcMat.release(); gcUp.release();
            } catch (Exception ignored) {
                if (!hasMlMask) return replaceBackgroundFallbackCutout(src, info, 38);
            }
        } else if (!hasMlMask) {
            return replaceBackgroundFallbackCutout(src, info, 38);
        }

        // Reinforce face/neck core & apply smooth 5x5 Gaussian feathering on alpha matte
        if (info != null && info.humanDetected) {
            float fCx = info.centerX;
            float fRx = Math.max(24f, info.faceWidth * 0.36f);
            float fCy = (info.crownY + info.chinY) * 0.52f;
            float fRy = Math.max(30f, (info.chinY - info.crownY) * 0.44f);
            float neckTop = info.chinY - fRy * 0.12f;
            float chestHalf = Math.max(34f, info.faceWidth * 0.44f);
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    float nx = (x - fCx) / fRx;
                    float ny = (y - fCy) / fRy;
                    if (nx * nx + ny * ny < 0.72f || (y > neckTop && Math.abs(x - fCx) < chestHalf)) {
                        finalAlpha[y * w + x] = Math.max(finalAlpha[y * w + x], 0.96f);
                    }
                }
            }
        }

        if (ensureOpenCV()) {
            try {
                Mat matte = new Mat(h, w, CvType.CV_32FC1);
                matte.put(0, 0, finalAlpha);
                Imgproc.GaussianBlur(matte, matte, new Size(5, 5), 1.0);
                matte.get(0, 0, finalAlpha);
                matte.release();
            } catch (Exception ignored) {}
        }

        int[] pixels = new int[w * h];
        src.getPixels(pixels, 0, w, 0, 0, w, h);

        int c1 = pixels[Math.min(h - 1, 8) * w + Math.min(w - 1, 8)];
        int c2 = pixels[Math.min(h - 1, 8) * w + Math.max(0, w - 9)];
        int oldBgR = (Color.red(c1) + Color.red(c2)) / 2;
        int oldBgG = (Color.green(c1) + Color.green(c2)) / 2;
        int oldBgB = (Color.blue(c1) + Color.blue(c2)) / 2;

        for (int i = 0; i < pixels.length; i++) {
            float c = finalAlpha[i];
            if (c <= 0.36f) {
                pixels[i] = Color.TRANSPARENT;
            } else if (c >= 0.80f) {
                pixels[i] = Color.argb(255, Color.red(pixels[i]), Color.green(pixels[i]), Color.blue(pixels[i]));
            } else {
                float t = (c - 0.36f) / 0.44f;
                float alpha = t * t * (3f - 2f * t);
                int pCol = pixels[i];
                float spill = (1f - alpha) * 0.45f;
                float norm = Math.max(0.45f, 1f - spill);
                int fgR = Math.max(0, Math.min(255, Math.round((Color.red(pCol) - spill * oldBgR) / norm)));
                int fgG = Math.max(0, Math.min(255, Math.round((Color.green(pCol) - spill * oldBgG) / norm)));
                int fgB = Math.max(0, Math.min(255, Math.round((Color.blue(pCol) - spill * oldBgB) / norm)));
                pixels[i] = Color.argb(Math.round(alpha * 255f), fgR, fgG, fgB);
            }
        }

        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, w, 0, 0, w, h);
        return out;
    }

    public static Bitmap replaceBackgroundAI(Bitmap src, int targetColor) {
        return replaceBackgroundAI(src, null, targetColor);
    }

    public static Bitmap replaceBackgroundAI(Bitmap src, PortraitInfo info, int targetColor) {
        Bitmap cutout = extractForegroundCutoutAI(src, info);
        if (cutout == null) return src;
        Bitmap out = Bitmap.createBitmap(cutout.getWidth(), cutout.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        c.drawColor(targetColor);
        c.drawBitmap(cutout, 0f, 0f, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        return out;
    }

    private static Bitmap replaceBackgroundFallbackCutout(Bitmap src, PortraitInfo info, int tolerance) {
        int w = src.getWidth(), h = src.getHeight();
        int[] pixels = new int[w * h];
        src.getPixels(pixels, 0, w, 0, 0, w, h);
        int bg = pixels[2 * w + 2];
        int bgR = Color.red(bg), bgG = Color.green(bg), bgB = Color.blue(bg);
        float tolSq = tolerance * tolerance * 3.2f;

        float pCx = info != null && info.humanDetected ? info.centerX : w * 0.5f;
        float pCy = info != null && info.humanDetected ? (info.crownY + info.chinY) * 0.52f : h * 0.44f;
        float pRx = info != null && info.humanDetected ? Math.max(24f, info.faceWidth * 0.44f) : w * 0.24f;
        float pRy = info != null && info.humanDetected ? Math.max(30f, (info.chinY - info.crownY) * 0.52f) : h * 0.30f;

        boolean[] visited = new boolean[w * h];
        ArrayDeque<Integer> q = new ArrayDeque<>();
        for (int x = 0; x < w; x += 2) { q.add(x); visited[x] = true; }
        for (int y = 0; y < h; y += 2) {
            int l = y * w, r = y * w + (w - 1);
            if (!visited[l]) { q.add(l); visited[l] = true; }
            if (!visited[r]) { q.add(r); visited[r] = true; }
        }

        while (!q.isEmpty()) {
            int idx = q.poll();
            int x = idx % w, y = idx / w;
            if (Math.hypot((x - pCx) / pRx, (y - pCy) / pRy) < 1.0) continue;
            if (info != null && y > info.chinY && Math.abs(x - pCx) < pRx * 1.1f) continue;
            int col = pixels[idx];
            int dr = Color.red(col) - bgR, dg = Color.green(col) - bgG, db = Color.blue(col) - bgB;
            if (dr * dr + dg * dg + db * db > tolSq) continue;
            pixels[idx] = Color.TRANSPARENT;
            for (int n : new int[]{idx - 1, idx + 1, idx - w, idx + w}) {
                if (n >= 0 && n < pixels.length && !visited[n]) { visited[n] = true; q.add(n); }
            }
        }
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, w, 0, 0, w, h);
        return out;
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
        return renderPassportPhoto(src, null, info, targetW, targetH, userZoom, panX, panY, suitMode, bgColor, doReplaceBg);
    }

    public static Bitmap renderPassportPhoto(
            Bitmap src,
            Bitmap precomputedCutout,
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

        Bitmap working = doReplaceBg
                ? (precomputedCutout != null ? precomputedCutout : extractForegroundCutoutAI(src, info))
                : src;

        Bitmap out = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        if (doReplaceBg) {
            canvas.drawColor(bgColor);
        } else {
            // Match corner wall tone gently if zoomed out or landscape canvas widens past source
            canvas.drawColor(working.getPixel(Math.min(working.getWidth() - 1, 4), Math.min(working.getHeight() - 1, 4)));
        }

        float headH = Math.max(40f, info.chinY - info.crownY);
        float headRatio = targetW > targetH ? 0.58f : 0.54f;
        float fitScale = (targetH * headRatio) / headH;
        float minCoverW = (float) targetW / working.getWidth();
        float baseScale = doReplaceBg ? Math.max(fitScale, minCoverW * 0.72f) : Math.max(fitScale, minCoverW);
        float finalScale = baseScale * userZoom;

        float offsetX = (targetW * 0.5f) - (info.centerX * finalScale) + panX;
        float offsetY = (targetH * (targetW > targetH ? 0.08f : 0.11f)) - (info.crownY * finalScale) + panY;

        canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(finalScale, finalScale);
        canvas.drawBitmap(working, 0f, 0f, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        canvas.restore();

        if (suitMode > 0) {
            float renderedChinY = (info.chinY * finalScale) + offsetY;
            float neckY = Math.max(targetH * 0.58f, Math.min(targetH * 0.78f, renderedChinY + targetH * 0.045f));
            drawFormalSuit(canvas, targetW, targetH, neckY, suitMode);
        }

        return out;
    }

    private static void drawFormalSuit(Canvas c, int w, int h, float neckY, int suitMode) {
        int suitColor = suitMode == 2 ? Color.parseColor("#1E3A8A")
                : (suitMode == 3 ? Color.parseColor("#1F2937") : Color.parseColor("#111827"));
        int tieColor = suitMode == 2 ? Color.parseColor("#B91C1C") : Color.parseColor("#991B1B");

        Paint shirtPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        shirtPaint.setColor(Color.WHITE);
        Paint suitPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        suitPaint.setColor(suitColor);
        Paint lapelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        lapelPaint.setColor(Color.parseColor("#0B0F19"));
        lapelPaint.setStyle(Paint.Style.STROKE);
        lapelPaint.setStrokeWidth(Math.max(2f, w * 0.008f));

        float cx = w * 0.5f;
        float collarHalf = w * 0.16f;
        float shoulderW = w * 0.52f;
        float dropY = h * 1.05f;

        Path shirt = new Path();
        shirt.moveTo(cx - collarHalf * 0.9f, neckY);
        shirt.lineTo(cx + collarHalf * 0.9f, neckY);
        shirt.lineTo(cx + collarHalf * 1.3f, dropY);
        shirt.lineTo(cx - collarHalf * 1.3f, dropY);
        shirt.close();
        c.drawPath(shirt, shirtPaint);

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

        c.drawLine(cx - collarHalf, neckY, cx - w * 0.03f, h * 0.94f, lapelPaint);
        c.drawLine(cx + collarHalf, neckY, cx + w * 0.03f, h * 0.94f, lapelPaint);
    }

    /**
     * Real OpenCV C++ 4-Corner Document Edge Detection & Perspective Warp.
     */
    public static Bitmap autoPerspectiveCropDoc(Bitmap src) {
        if (src == null || !ensureOpenCV()) return src;
        try {
            Mat rgba = new Mat();
            Utils.bitmapToMat(src, rgba);

            double procW = 600.0;
            double ratio = Math.max(1.0, rgba.width() / procW);
            Mat small = new Mat();
            Imgproc.resize(rgba, small, new Size(rgba.width() / ratio, rgba.height() / ratio));

            Mat gray = new Mat();
            Imgproc.cvtColor(small, gray, Imgproc.COLOR_RGBA2GRAY);
            Imgproc.GaussianBlur(gray, gray, new Size(5, 5), 0);

            Mat edges = new Mat();
            Imgproc.Canny(gray, edges, 60, 180);
            Mat kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, new Size(5, 5));
            Imgproc.dilate(edges, edges, kernel);

            List<MatOfPoint> contours = new ArrayList<>();
            Imgproc.findContours(edges, contours, new Mat(), Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE);
            contours.sort((a, b) -> Double.compare(Imgproc.contourArea(b), Imgproc.contourArea(a)));

            double minArea = small.width() * small.height() * 0.18;
            Point[] bestQuad = null;

            for (int i = 0; i < Math.min(8, contours.size()); i++) {
                MatOfPoint2f c2f = new MatOfPoint2f(contours.get(i).toArray());
                double peri = Imgproc.arcLength(c2f, true);
                MatOfPoint2f approx = new MatOfPoint2f();
                Imgproc.approxPolyDP(c2f, approx, 0.02 * peri, true);
                if (approx.total() == 4 && Imgproc.contourArea(contours.get(i)) > minArea) {
                    Point[] pts = approx.toArray();
                    for (Point p : pts) { p.x *= ratio; p.y *= ratio; }
                    bestQuad = orderQuadPoints(pts);
                    break;
                }
            }

            if (bestQuad == null) return src;

            double wTop = Math.hypot(bestQuad[1].x - bestQuad[0].x, bestQuad[1].y - bestQuad[0].y);
            double wBot = Math.hypot(bestQuad[2].x - bestQuad[3].x, bestQuad[2].y - bestQuad[3].y);
            int targetW = Math.max(200, (int) Math.round(Math.max(wTop, wBot)));

            double hLeft = Math.hypot(bestQuad[3].x - bestQuad[0].x, bestQuad[3].y - bestQuad[0].y);
            double hRight = Math.hypot(bestQuad[2].x - bestQuad[1].x, bestQuad[2].y - bestQuad[1].y);
            int targetH = Math.max(200, (int) Math.round(Math.max(hLeft, hRight)));

            MatOfPoint2f srcMat = new MatOfPoint2f(bestQuad);
            MatOfPoint2f dstMat = new MatOfPoint2f(
                    new Point(0, 0),
                    new Point(targetW - 1, 0),
                    new Point(targetW - 1, targetH - 1),
                    new Point(0, targetH - 1)
            );

            Mat perspective = Imgproc.getPerspectiveTransform(srcMat, dstMat);
            Mat warped = new Mat();
            Imgproc.warpPerspective(rgba, warped, perspective, new Size(targetW, targetH));

            Bitmap out = Bitmap.createBitmap(warped.cols(), warped.rows(), Bitmap.Config.ARGB_8888);
            Utils.matToBitmap(warped, out);
            return out;
        } catch (Exception e) {
            return src;
        }
    }

    private static Point[] orderQuadPoints(Point[] pts) {
        Point[] sorted = new Point[4];
        Arrays.sort(pts, Comparator.comparingDouble(p -> p.x + p.y));
        sorted[0] = pts[0]; // Top-Left
        sorted[2] = pts[3]; // Bottom-Right
        Arrays.sort(pts, Comparator.comparingDouble(p -> p.y - p.x));
        sorted[1] = pts[0]; // Top-Right
        sorted[3] = pts[3]; // Bottom-Left
        return sorted;
    }

    /**
     * Real OpenCV Document Filters: 0=Original, 1=Magic Color, 2=Adaptive B&W
     */
    public static Bitmap applyDocFilter(Bitmap src, int mode) {
        if (src == null || mode == 0) return src;
        if (!ensureOpenCV()) return src;

        try {
            Mat rgba = new Mat();
            Utils.bitmapToMat(src, rgba);
            Mat dst = new Mat();

            if (mode == 2) {
                Mat gray = new Mat();
                Imgproc.cvtColor(rgba, gray, Imgproc.COLOR_RGBA2GRAY);
                Imgproc.adaptiveThreshold(gray, dst, 255, Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C, Imgproc.THRESH_BINARY, 25, 14);
                Imgproc.cvtColor(dst, dst, Imgproc.COLOR_GRAY2RGBA);
            } else {
                // Magic Color: enhance local lighting & text contrast cleanly
                Mat rgb = new Mat();
                Imgproc.cvtColor(rgba, rgb, Imgproc.COLOR_RGBA2RGB);
                Mat lab = new Mat();
                Imgproc.cvtColor(rgb, lab, Imgproc.COLOR_RGB2Lab);
                List<Mat> channels = new ArrayList<>();
                Core.split(lab, channels);
                Imgproc.createCLAHE(2.4, new Size(8, 8)).apply(channels.get(0), channels.get(0));
                Core.merge(channels, lab);
                Imgproc.cvtColor(lab, rgb, Imgproc.COLOR_Lab2RGB);
                rgb.convertTo(rgb, CvType.CV_8UC3, 1.15, 12);
                Imgproc.cvtColor(rgb, dst, Imgproc.COLOR_RGB2RGBA);
            }

            Bitmap out = Bitmap.createBitmap(dst.cols(), dst.rows(), Bitmap.Config.ARGB_8888);
            Utils.matToBitmap(dst, out);
            return out;
        } catch (Exception e) {
            return src;
        }
    }

    /**
     * Offline Bundled ML Kit OCR Text Extraction.
     */
    public static String extractTextOCR(Bitmap src) {
        if (src == null) return "";
        try {
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            Text result = Tasks.await(recognizer.process(InputImage.fromBitmap(src, 0)));
            recognizer.close();
            return result != null ? result.getText() : "";
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Compose 200 DPI Print Sheet with exact Custom Sheet dimensions (mm), Photo dimensions (mm),
     * configurable Photos-Per-Row & Row Count.
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
        return composePrintSheet(singlePhoto, photoMmW, photoMmH, isA4 ? 210f : 152.4f, isA4 ? 297f : 101.6f, photosPerRow, rowsWanted, cutLines);
    }

    public static Bitmap composePrintSheet(
            Bitmap singlePhoto,
            float photoMmW,
            float photoMmH,
            float sheetMmW,
            float sheetMmH,
            int photosPerRow,
            int rowsWanted,
            boolean cutLines
    ) {
        return composePrintSheet(singlePhoto, photoMmW, photoMmH, sheetMmW, sheetMmH, photosPerRow, rowsWanted, cutLines, false);
    }

    public static Bitmap composePrintSheet(
            Bitmap singlePhoto,
            float photoMmW,
            float photoMmH,
            float sheetMmW,
            float sheetMmH,
            int photosPerRow,
            int rowsWanted,
            boolean cutLines,
            boolean tileLandscapeOnSheet
    ) {
        if (singlePhoto == null) return null;
        int dpi = 200;
        sheetMmW = Math.max(40f, sheetMmW);
        sheetMmH = Math.max(40f, sheetMmH);

        Bitmap tileBmp = tileLandscapeOnSheet ? rotateBitmap(singlePhoto, 90f) : singlePhoto;
        float effPhotoMmW = tileLandscapeOnSheet ? photoMmH : photoMmW;
        float effPhotoMmH = tileLandscapeOnSheet ? photoMmW : photoMmH;

        int sheetW = Math.round((sheetMmW / 25.4f) * dpi);
        int sheetH = Math.round((sheetMmH / 25.4f) * dpi);

        Bitmap sheet = Bitmap.createBitmap(sheetW, sheetH, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(sheet);
        c.drawColor(Color.WHITE);

        float photoW = (effPhotoMmW / 25.4f) * dpi;
        float photoH = (effPhotoMmH / 25.4f) * dpi;
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
                c.drawBitmap(tileBmp, null, dst, imgPaint);
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
}

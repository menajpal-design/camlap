using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;

namespace CamLabDesktop;

public sealed class PortraitAnalysis
{
    public bool FaceDetected { get; set; }
    public double Confidence { get; set; }
    public float CenterX { get; set; }
    public float CrownY { get; set; }
    public float ChinY { get; set; }
    public float FaceWidth { get; set; }
    public bool IsFemale { get; set; }
    public string GenderLabel => IsFemale ? "মেয়ে / নারী (Female)" : "ছেলে / পুরুষ (Male)";
    public string AttireLabel { get; set; } = "পোশাক বিশ্লেষণ সম্পন্ন";
    public bool NeedsFormalSuit { get; set; }
}

public static class NativeEngine
{
    public static Bitmap LoadBitmapOriented(string path, int maxDim = 1800)
    {
        using var fs = new System.IO.FileStream(path, System.IO.FileMode.Open, System.IO.FileAccess.Read);
        using var img = Image.FromStream(fs);
        var bmp = new Bitmap(img);

        try
        {
            if (img.PropertyIdList.Contains(0x0112))
            {
                var prop = img.GetPropertyItem(0x0112);
                if (prop?.Value != null && prop.Value.Length >= 2)
                {
                    ushort val = BitConverter.ToUInt16(prop.Value, 0);
                    RotateFlipType rft = val switch
                    {
                        3 => RotateFlipType.Rotate180FlipNone,
                        6 => RotateFlipType.Rotate90FlipNone,
                        8 => RotateFlipType.Rotate270FlipNone,
                        _ => RotateFlipType.RotateNoneFlipNone
                    };
                    if (rft != RotateFlipType.RotateNoneFlipNone) bmp.RotateFlip(rft);
                }
            }
        }
        catch { }

        if (Math.Max(bmp.Width, bmp.Height) > maxDim)
        {
            double s = (double)maxDim / Math.Max(bmp.Width, bmp.Height);
            int nw = Math.Max(1, (int)Math.Round(bmp.Width * s));
            int nh = Math.Max(1, (int)Math.Round(bmp.Height * s));
            var resized = new Bitmap(nw, nh, PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(resized);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(bmp, 0, 0, nw, nh);
            bmp.Dispose();
            return resized;
        }
        return bmp;
    }

    public static PortraitAnalysis AnalyzePortrait(Bitmap src)
    {
        var res = new PortraitAnalysis();
        int maxW = 280;
        double scale = Math.Min(1.0, (double)maxW / Math.Max(src.Width, src.Height));
        int w = Math.Max(60, (int)Math.Round(src.Width * scale));
        int h = Math.Max(60, (int)Math.Round(src.Height * scale));

        using var small = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(small))
        {
            g.InterpolationMode = InterpolationMode.Bilinear;
            g.DrawImage(src, 0, 0, w, h);
        }

        byte[] buf = ExtractBgraBytes(small, out int stride);
        bool[] skin = new bool[w * h];
        byte[] lum = new byte[w * h];

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int off = y * stride + x * 4;
                byte b = buf[off], g = buf[off + 1], r = buf[off + 2];
                int idx = y * w + x;
                lum[idx] = (byte)((299 * r + 587 * g + 114 * b) / 1000);

                double cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                double cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
                bool isYCbCrSkin = cb >= 77 && cb <= 130 && cr >= 132 && cr <= 176 && r > 50;
                bool isRgbSkin = r > 75 && g > 35 && b > 20 && (r - b) > 12 && r >= g;
                skin[idx] = isYCbCrSkin || isRgbSkin;
            }
        }

        // Background color sample
        int bgOff = 2 * stride + 2 * 4;
        byte bgB = buf[bgOff], bgG = buf[bgOff + 1], bgR = buf[bgOff + 2];

        double bestScore = 0;
        int bestX = (int)(w * 0.32), bestY = (int)(h * 0.16), bestW = (int)(w * 0.36), bestH = (int)(h * 0.44);
        int minS = Math.Max(22, (int)(Math.Min(w, h) * 0.18));
        int maxS = (int)(Math.Min(w, h) * 0.70);

        for (int size = minS; size <= maxS; size += Math.Max(6, size / 5))
        {
            int bw = (int)(size * 0.85);
            int bh = (int)(size * 1.12);
            if (bw >= w || bh >= h) continue;
            int step = Math.Max(5, size / 6);

            for (int y = (int)(h * 0.02); y <= (int)(h * 0.74) - bh; y += step)
            {
                for (int x = (int)(w * 0.08); x <= (int)(w * 0.92) - bw; x += step)
                {
                    int skinHits = 0, darkFeat = 0, tot = 0;
                    int inc = Math.Max(2, bw / 14);
                    for (int py = y; py < y + bh; py += inc)
                    {
                        for (int px = x; px < x + bw; px += inc)
                        {
                            int idx = py * w + px;
                            tot++;
                            if (skin[idx]) skinHits++;
                            double relY = (double)(py - y) / bh;
                            if (relY > 0.22 && relY < 0.55 && lum[idx] < 95) darkFeat++;
                        }
                    }

                    double skinRatio = (double)skinHits / Math.Max(1, tot);
                    double featRatio = (double)darkFeat / Math.Max(1, tot);
                    if (skinRatio < 0.28 || skinRatio > 0.95 || featRatio < 0.02) continue;

                    double centerDist = Math.Abs((x + bw * 0.5) - w * 0.5) / w;
                    double score = (skinRatio * 1.4 + Math.Min(0.25, featRatio * 2.2)) * Math.Sqrt(bw * bh) * (1 - centerDist * 0.35);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestX = x; bestY = y; bestW = bw; bestH = bh;
                        res.FaceDetected = true;
                    }
                }
            }
        }

        // Hair crown above forehead
        int scanX1 = Math.Max(0, bestX + (int)(bestW * 0.25));
        int scanX2 = Math.Min(w - 1, bestX + (int)(bestW * 0.75));
        int crown = Math.Max(0, bestY - (int)(bestH * 0.14));
        for (int y = bestY; y >= Math.Max(0, bestY - (int)(bestH * 0.42)); y--)
        {
            int fg = 0, tot = 0;
            for (int x = scanX1; x <= scanX2; x += 2)
            {
                int off = y * stride + x * 4;
                double d = Math.Sqrt(Math.Pow(buf[off + 2] - bgR, 2) + Math.Pow(buf[off + 1] - bgG, 2) + Math.Pow(buf[off] - bgB, 2));
                tot++;
                if (d > 28) fg++;
            }
            if (tot > 0 && (double)fg / tot > 0.28) crown = y;
        }
        int chin = Math.Min(h - 1, bestY + bestH);

        // Gender estimation: side hair volume + jaw darkness
        int sideHair = 0, sideTot = 0;
        for (int y = bestY + (int)(bestH * 0.45); y <= Math.Min(h - 1, chin + (int)(bestH * 0.30)); y += 2)
        {
            for (int x = Math.Max(0, bestX - (int)(bestW * 0.32)); x < Math.Max(0, bestX - 2); x += 2)
            {
                sideTot++;
                int off = y * stride + x * 4;
                double d = Math.Sqrt(Math.Pow(buf[off + 2] - bgR, 2) + Math.Pow(buf[off + 1] - bgG, 2) + Math.Pow(buf[off] - bgB, 2));
                if (d > 30 && !skin[y * w + x] && lum[y * w + x] < 125) sideHair++;
            }
            for (int x = Math.Min(w - 1, bestX + bestW + 2); x < Math.Min(w - 1, bestX + bestW + (int)(bestW * 0.32)); x += 2)
            {
                sideTot++;
                int off = y * stride + x * 4;
                double d = Math.Sqrt(Math.Pow(buf[off + 2] - bgR, 2) + Math.Pow(buf[off + 1] - bgG, 2) + Math.Pow(buf[off] - bgB, 2));
                if (d > 30 && !skin[y * w + x] && lum[y * w + x] < 125) sideHair++;
            }
        }
        double sideRatio = (double)sideHair / Math.Max(1, sideTot);
        res.IsFemale = sideRatio > 0.28;

        // Attire analysis below chin
        int cY1 = Math.Min(h - 2, chin + (int)(bestH * 0.20));
        int cY2 = Math.Min(h - 1, chin + (int)(bestH * 0.72));
        int darkChest = 0, brightChest = 0, cTot = 0;
        for (int y = cY1; y <= cY2; y += 2)
        {
            for (int x = Math.Max(0, bestX - (int)(bestW * 0.3)); x <= Math.Min(w - 1, bestX + (int)(bestW * 1.3)); x += 2)
            {
                int l = lum[y * w + x];
                cTot++;
                if (l < 75) darkChest++;
                else if (l > 185) brightChest++;
            }
        }
        if (darkChest > cTot * 0.45)
        {
            res.AttireLabel = "ফরমাল স্যুট / ডার্ক পোশাক ✓";
            res.NeedsFormalSuit = false;
        }
        else if (brightChest > cTot * 0.52)
        {
            res.AttireLabel = "ফরমাল সাদা/হালকা শার্ট ✓";
            res.NeedsFormalSuit = false;
        }
        else
        {
            res.AttireLabel = "সাধারণ পোশাক (ফরমাল স্যুট দিন)";
            res.NeedsFormalSuit = true;
        }

        double inv = 1.0 / scale;
        res.CenterX = (float)((bestX + bestW * 0.5) * inv);
        res.CrownY = (float)(crown * inv);
        res.ChinY = (float)(chin * inv);
        res.FaceWidth = (float)(bestW * inv);
        res.Confidence = res.FaceDetected ? 92 : 60;
        return res;
    }

    /// <summary>
    /// Proper GrabCut-style Multi-Cluster Foreground/Background Cutout with Spatial Portrait Prior,
    /// MRF edge-aware relaxation & outer border cleanup. Returns ARGB Bitmap with transparent background.
    /// </summary>
    public static Bitmap ExtractForegroundCutout(Bitmap src, PortraitAnalysis? info = null)
    {
        int w = src.Width, h = src.Height;
        int workMax = 280;
        float sc = Math.Min(1f, (float)workMax / Math.Max(w, h));
        int gw = Math.Max(48, (int)Math.Round(w * sc));
        int gh = Math.Max(48, (int)Math.Round(h * sc));

        using var smallBmp = new Bitmap(gw, gh, PixelFormat.Format32bppArgb);
        using (var gs = Graphics.FromImage(smallBmp))
        {
            gs.InterpolationMode = InterpolationMode.HighQualityBilinear;
            gs.DrawImage(src, 0, 0, gw, gh);
        }
        byte[] gbuf = ExtractBgraBytes(smallBmp, out int gStride);

        float fCx = (info != null ? info.CenterX : w * 0.5f) * sc;
        float fW = Math.Max(14f, (info != null ? info.FaceWidth : w * 0.36f) * sc);
        float fTop = (info != null ? info.CrownY : h * 0.14f) * sc;
        float fChin = (info != null ? info.ChinY : h * 0.60f) * sc;
        float fCy = (fTop + fChin) * 0.50f;
        float fRx = Math.Max(10f, fW * 0.38f);
        float fRy = Math.Max(14f, (fChin - fTop) * 0.45f);

        // Collect Foreground samples (Face + Neck + Upper Torso center) and Background samples (outer perimeter)
        var fgSamples = new List<(float B, float G, float R)>();
        var bgSamples = new List<(float B, float G, float R)>();

        for (int y = 0; y < gh; y += 2)
        {
            for (int x = 0; x < gw; x += 2)
            {
                int off = y * gStride + x * 4;
                float pb = gbuf[off], pg = gbuf[off + 1], pr = gbuf[off + 2];
                float nx = (x - fCx) / fRx, ny = (y - fCy) / fRy;
                bool inFace = (nx * nx + ny * ny) < 0.72f;
                bool inTorso = (y > fChin && y < gh * 0.96f && Math.Abs(x - fCx) < fW * 0.42f);
                bool inOuter = (x < gw * 0.08f || x > gw * 0.92f || (y < Math.Max(8f, fTop * 0.65f) && Math.Abs(x - fCx) > fW * 0.65f));

                if (inFace || inTorso)
                {
                    if ((x + y) % 4 == 0) fgSamples.Add((pb, pg, pr));
                }
                else if (inOuter)
                {
                    bgSamples.Add((pb, pg, pr));
                }
            }
        }
        if (fgSamples.Count == 0) fgSamples.Add((128, 128, 128));
        if (bgSamples.Count == 0) bgSamples.Add((240, 240, 240));

        // Initial likelihood probability map + spatial body prior
        float[] prob = new float[gw * gh];
        for (int y = 0; y < gh; y++)
        {
            for (int x = 0; x < gw; x++)
            {
                int idx = y * gw + x;
                int off = y * gStride + x * 4;
                float pb = gbuf[off], pg = gbuf[off + 1], pr = gbuf[off + 2];

                float nx = (x - fCx) / (fRx * 1.15f), ny = (y - fCy) / (fRy * 1.15f);
                if (nx * nx + ny * ny < 0.75f || (y > fChin && Math.Abs(x - fCx) < fW * 0.40f))
                {
                    prob[idx] = 1.0f;
                    continue;
                }
                if (x < gw * 0.02f || x > gw * 0.98f || y < Math.Max(4f, fTop * 0.35f))
                {
                    prob[idx] = 0.0f;
                    continue;
                }

                double minBg = double.MaxValue;
                foreach (var sw in bgSamples)
                {
                    double db = pb - sw.B, dg = pg - sw.G, dr = pr - sw.R;
                    double d2 = db * db * 0.8 + dg * dg * 1.2 + dr * dr * 1.0;
                    if (d2 < minBg) minBg = d2;
                }

                double minFg = double.MaxValue;
                int stepFg = Math.Max(1, fgSamples.Count / 40);
                for (int k = 0; k < fgSamples.Count; k += stepFg)
                {
                    var sw = fgSamples[k];
                    double db = pb - sw.B, dg = pg - sw.G, dr = pr - sw.R;
                    double d2 = db * db * 0.8 + dg * dg * 1.2 + dr * dr * 1.0;
                    if (d2 < minFg) minFg = d2;
                }

                double dBg = Math.Sqrt(minBg);
                double dFg = Math.Sqrt(minFg);
                float colorLik = (float)(dBg / (dBg + dFg + 1e-4));

                // Shoulder/body geometric prior silhouette
                float bodySpan = (y < fTop) ? 0.1f : (y < fChin ? fW * 0.65f : fW * (0.75f + (y - fChin) / Math.Max(20f, gh - fChin) * 0.75f));
                float dx = Math.Abs(x - fCx);
                float spatialPrior = dx <= bodySpan ? 0.68f : (dx <= bodySpan * 1.35f ? 0.42f : 0.18f);

                prob[idx] = Math.Clamp(colorLik * 0.68f + spatialPrior * 0.32f, 0f, 1f);
            }
        }

        // 4 iterations of edge-aware MRF smoothness (keeps sharp contours, removes speckles)
        float[] nextProb = new float[gw * gh];
        for (int iter = 0; iter < 4; iter++)
        {
            for (int y = 1; y < gh - 1; y++)
            {
                for (int x = 1; x < gw - 1; x++)
                {
                    int idx = y * gw + x;
                    float nx = (x - fCx) / fRx, ny = (y - fCy) / fRy;
                    if (nx * nx + ny * ny < 0.72f || (y > fChin && Math.Abs(x - fCx) < fW * 0.40f))
                    {
                        nextProb[idx] = 1.0f;
                        continue;
                    }
                    int off = y * gStride + x * 4;
                    float cB = gbuf[off], cG = gbuf[off + 1], cR = gbuf[off + 2];

                    float wSum = 1.2f, pSum = prob[idx] * 1.2f;
                    int[] nb = { idx - 1, idx + 1, idx - gw, idx + gw };
                    foreach (int ni in nb)
                    {
                        int nyi = ni / gw, nxi = ni % gw;
                        int noff = nyi * gStride + nxi * 4;
                        float colDiff = Math.Abs(cB - gbuf[noff]) + Math.Abs(cG - gbuf[noff + 1]) + Math.Abs(cR - gbuf[noff + 2]);
                        float edgeW = (float)Math.Exp(-colDiff / 45f);
                        wSum += edgeW;
                        pSum += prob[ni] * edgeW;
                    }
                    nextProb[idx] = Math.Clamp(pSum / wSum, 0f, 1f);
                }
            }
            Array.Copy(nextProb, prob, prob.Length);
        }

        // Border-connected Flood Cleanup so enclosed light clothing isn't punched
        bool[] bgVisited = new bool[gw * gh];
        var flood = new Queue<int>();
        for (int x = 0; x < gw; x++) { flood.Enqueue(x); bgVisited[x] = true; }
        for (int y = 1; y < gh; y++)
        {
            int l = y * gw, r = y * gw + gw - 1;
            flood.Enqueue(l); bgVisited[l] = true;
            flood.Enqueue(r); bgVisited[r] = true;
        }
        bool[] isBg = new bool[gw * gh];
        while (flood.Count > 0)
        {
            int idx = flood.Dequeue();
            if (prob[idx] > 0.56f) continue;
            isBg[idx] = true;
            int x = idx % gw, y = idx / gw;
            if (x + 1 < gw && !bgVisited[idx + 1]) { bgVisited[idx + 1] = true; flood.Enqueue(idx + 1); }
            if (x - 1 >= 0 && !bgVisited[idx - 1]) { bgVisited[idx - 1] = true; flood.Enqueue(idx - 1); }
            if (y + 1 < gh && !bgVisited[idx + gw]) { bgVisited[idx + gw] = true; flood.Enqueue(idx + gw); }
            if (y - 1 >= 0 && !bgVisited[idx - gw]) { bgVisited[idx - gw] = true; flood.Enqueue(idx - gw); }
        }

        var fullBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var gf = Graphics.FromImage(fullBmp)) gf.DrawImage(src, 0, 0, w, h);
        byte[] fbuf = ExtractBgraBytes(fullBmp, out int fStride);

        for (int y = 0; y < h; y++)
        {
            float fy = ((y + 0.5f) * gh / h) - 0.5f;
            int y0 = Math.Clamp((int)Math.Floor(fy), 0, gh - 1);
            int y1 = Math.Clamp(y0 + 1, 0, gh - 1);
            float wy = Math.Max(0f, fy - y0);
            for (int x = 0; x < w; x++)
            {
                float fx = ((x + 0.5f) * gw / w) - 0.5f;
                int x0 = Math.Clamp((int)Math.Floor(fx), 0, gw - 1);
                int x1 = Math.Clamp(x0 + 1, 0, gw - 1);
                float wx = Math.Max(0f, fx - x0);

                float a00 = isBg[y0 * gw + x0] ? 0f : (prob[y0 * gw + x0] > 0.50f ? 1f : 0f);
                float a10 = isBg[y0 * gw + x1] ? 0f : (prob[y0 * gw + x1] > 0.50f ? 1f : 0f);
                float a01 = isBg[y1 * gw + x0] ? 0f : (prob[y1 * gw + x0] > 0.50f ? 1f : 0f);
                float a11 = isBg[y1 * gw + x1] ? 0f : (prob[y1 * gw + x1] > 0.50f ? 1f : 0f);
                float a = (a00 * (1f - wx) + a10 * wx) * (1f - wy) + (a01 * (1f - wx) + a11 * wx) * wy;

                int off = y * fStride + x * 4;
                fbuf[off + 3] = (byte)Math.Clamp(Math.Round(a * 255f), 0, 255);
            }
        }
        WriteBgraBytes(fullBmp, fbuf);
        return fullBmp;
    }

    public static Bitmap ReplaceBackground(Bitmap src, Color bgColor, int tolerance = 38, PortraitAnalysis? info = null)
    {
        using var cut = ExtractForegroundCutout(src, info);
        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(outBmp);
        g.Clear(bgColor);
        g.DrawImage(cut, 0, 0, src.Width, src.Height);
        return outBmp;
    }

    public static Bitmap RenderPassportPhoto(
        Bitmap src,
        PortraitAnalysis info,
        int targetW,
        int targetH,
        float userZoom,
        float panX,
        float panY,
        int suitMode,
        Color bgColor,
        bool doReplaceBg,
        Bitmap? precomputedCutout = null)
    {
        Bitmap? tempCut = null;
        Bitmap working = doReplaceBg
            ? (precomputedCutout ?? (tempCut = ExtractForegroundCutout(src, info)))
            : src;
        try
        {
            var outBmp = new Bitmap(targetW, targetH, PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(outBmp);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(doReplaceBg ? bgColor : working.GetPixel(Math.Min(working.Width - 1, 4), Math.Min(working.Height - 1, 4)));

            float headH = Math.Max(40f, info.ChinY - info.CrownY);
            float headRatio = targetW > targetH ? 0.58f : 0.54f;
            float fitScale = (targetH * headRatio) / headH;
            float minCoverW = (float)targetW / working.Width;
            float baseScale = doReplaceBg ? Math.Max(fitScale, minCoverW * 0.72f) : Math.Max(fitScale, minCoverW);
            float finalScale = baseScale * userZoom;

            float offX = (targetW * 0.5f) - (info.CenterX * finalScale) + panX;
            float offY = (targetH * (targetW > targetH ? 0.08f : 0.11f)) - (info.CrownY * finalScale) + panY;

            g.DrawImage(working, offX, offY, working.Width * finalScale, working.Height * finalScale);

            if (suitMode > 0)
            {
                float renderedChinY = (info.ChinY * finalScale) + offY;
                float neckY = Math.Clamp(renderedChinY + targetH * 0.045f, targetH * 0.58f, targetH * 0.78f);
                DrawFormalSuit(g, targetW, targetH, neckY, suitMode);
            }

            return outBmp;
        }
        finally
        {
            tempCut?.Dispose();
        }
    }

    private static void DrawFormalSuit(Graphics g, int w, int h, float neckY, int suitMode)
    {
        Color suitCol = suitMode switch
        {
            2 => Color.FromArgb(30, 58, 138),   // Navy
            3 => Color.FromArgb(31, 41, 55),    // Women's dark blazer
            _ => Color.FromArgb(17, 24, 39)     // Men's black suit
        };
        Color tieCol = suitMode == 2 ? Color.FromArgb(185, 28, 28) : Color.FromArgb(153, 27, 27);

        float cx = w * 0.5f;
        float collarHalf = w * 0.16f;
        float shoulderW = w * 0.52f;
        float dropY = h * 1.05f;

        using var shirtPath = new GraphicsPath();
        shirtPath.AddPolygon(new[] {
            new PointF(cx - collarHalf * 0.9f, neckY),
            new PointF(cx + collarHalf * 0.9f, neckY),
            new PointF(cx + collarHalf * 1.3f, dropY),
            new PointF(cx - collarHalf * 1.3f, dropY)
        });
        using (var whiteBrush = new SolidBrush(Color.White))
            g.FillPath(whiteBrush, shirtPath);

        if (suitMode == 1 || suitMode == 2)
        {
            using var tiePath = new GraphicsPath();
            tiePath.AddPolygon(new[] {
                new PointF(cx - w * 0.032f, neckY + h * 0.02f),
                new PointF(cx + w * 0.032f, neckY + h * 0.02f),
                new PointF(cx + w * 0.048f, dropY),
                new PointF(cx - w * 0.048f, dropY)
            });
            using var tieBrush = new SolidBrush(tieCol);
            g.FillPath(tieBrush, tiePath);
        }

        using var suitBrush = new SolidBrush(suitCol);
        using var leftJacket = new GraphicsPath();
        leftJacket.AddLines(new[] {
            new PointF(cx - collarHalf, neckY - h * 0.01f),
            new PointF(cx - shoulderW * 0.85f, neckY + h * 0.06f),
            new PointF(-w * 0.05f, h * 0.88f),
            new PointF(-w * 0.05f, dropY),
            new PointF(cx - (suitMode == 3 ? w * 0.08f : w * 0.02f), dropY)
        });
        leftJacket.CloseFigure();
        g.FillPath(suitBrush, leftJacket);

        using var rightJacket = new GraphicsPath();
        rightJacket.AddLines(new[] {
            new PointF(cx + collarHalf, neckY - h * 0.01f),
            new PointF(cx + shoulderW * 0.85f, neckY + h * 0.06f),
            new PointF(w * 1.05f, h * 0.88f),
            new PointF(w * 1.05f, dropY),
            new PointF(cx + (suitMode == 3 ? w * 0.08f : w * 0.02f), dropY)
        });
        rightJacket.CloseFigure();
        g.FillPath(suitBrush, rightJacket);

        using var lapelPen = new Pen(Color.FromArgb(11, 15, 25), Math.Max(2f, w * 0.008f));
        g.DrawLine(lapelPen, cx - collarHalf, neckY, cx - w * 0.03f, h * 0.94f);
        g.DrawLine(lapelPen, cx + collarHalf, neckY, cx + w * 0.03f, h * 0.94f);
    }

    public static Bitmap ComposePrintSheet(
        Bitmap singlePhoto,
        float photoMmW,
        float photoMmH,
        string paperSize,
        int photosPerRow,
        int rowsWanted,
        bool cutLines,
        bool hasBorder)
    {
        float sheetMmW = 210f, sheetMmH = 297f;
        if (paperSize == "4x6") { sheetMmW = 152.4f; sheetMmH = 101.6f; }
        else if (paperSize == "5x7") { sheetMmW = 177.8f; sheetMmH = 127f; }
        return ComposePrintSheet(singlePhoto, photoMmW, photoMmH, sheetMmW, sheetMmH, photosPerRow, rowsWanted, cutLines, hasBorder);
    }

    public static Bitmap ComposePrintSheet(
        Bitmap singlePhoto,
        float photoMmW,
        float photoMmH,
        float sheetMmW,
        float sheetMmH,
        int photosPerRow,
        int rowsWanted,
        bool cutLines,
        bool hasBorder,
        bool tileLandscapeOnSheet = false)
    {
        const int dpi = 240;
        sheetMmW = Math.Clamp(sheetMmW, 40f, 600f);
        sheetMmH = Math.Clamp(sheetMmH, 40f, 600f);

        Bitmap? rotatedTile = null;
        Bitmap tileBmp = singlePhoto;
        float effPhotoMmW = photoMmW, effPhotoMmH = photoMmH;
        if (tileLandscapeOnSheet)
        {
            rotatedTile = new Bitmap(singlePhoto);
            rotatedTile.RotateFlip(RotateFlipType.Rotate90FlipNone);
            tileBmp = rotatedTile;
            effPhotoMmW = photoMmH;
            effPhotoMmH = photoMmW;
        }

        int sheetW = (int)Math.Round((sheetMmW / 25.4f) * dpi);
        int sheetH = (int)Math.Round((sheetMmH / 25.4f) * dpi);

        var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb);
        try
        {
            using var g = Graphics.FromImage(sheet);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(Color.White);

            float photoW = (effPhotoMmW / 25.4f) * dpi;
            float photoH = (effPhotoMmH / 25.4f) * dpi;
            float gap = (3.5f / 25.4f) * dpi;
            float margin = (6f / 25.4f) * dpi;

            int cols = Math.Max(1, photosPerRow);
            float usableW = sheetW - margin * 2f;
            float reqW = cols * photoW + (cols - 1) * gap;
            if (reqW > usableW)
            {
                float shrink = usableW / reqW;
                photoW *= shrink;
                photoH *= shrink;
                gap = Math.Max(8f, gap * shrink);
            }

            int maxRows = Math.Max(1, (int)Math.Floor((sheetH - margin * 2f + gap) / (photoH + gap)));
            int rows = rowsWanted <= 0 ? maxRows : Math.Min(maxRows, rowsWanted);

            float gridW = cols * photoW + (cols - 1) * gap;
            float startX = (sheetW - gridW) * 0.5f;
            float startY = margin + dpi * 0.08f;

            using var borderPen = new Pen(Color.FromArgb(203, 213, 225), 2f);
            using var cutPen = new Pen(Color.FromArgb(148, 163, 184), 1.5f) { DashStyle = DashStyle.Dash };

            int total = 0;
            for (int r = 0; r < rows; r++)
            {
                float py = startY + r * (photoH + gap);
                if (py + photoH > sheetH - margin) break;
                for (int c = 0; c < cols; c++)
                {
                    float px = startX + c * (photoW + gap);
                    g.DrawImage(tileBmp, px, py, photoW, photoH);
                    if (hasBorder) g.DrawRectangle(borderPen, px, py, photoW, photoH);
                    if (cutLines)
                    {
                        float mLen = Math.Min(22f, gap * 0.5f);
                        g.DrawLine(cutPen, px - mLen, py, px, py);
                        g.DrawLine(cutPen, px, py - mLen, px, py);
                        g.DrawLine(cutPen, px + photoW, py, px + photoW + mLen, py);
                        g.DrawLine(cutPen, px + photoW, py - mLen, px + photoW, py);
                    }
                    total++;
                }
            }

            using var f = new Font("Segoe UI", Math.Max(10, dpi * 0.036f), FontStyle.Bold);
            using var b = new SolidBrush(Color.FromArgb(100, 116, 139));
            g.DrawString($"camlab Desktop Print Studio | {Math.Round(sheetMmW)}x{Math.Round(sheetMmH)}mm | {cols} Photos/Row • {total} Total • {dpi} DPI", f, b, margin, sheetH - dpi * 0.16f);

            return sheet;
        }
        finally
        {
            rotatedTile?.Dispose();
        }
    }

    public static Bitmap ApplyDocFilter(Bitmap src, int mode)
    {
        if (mode == 0) return new Bitmap(src);

        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(outBmp);
        using var ia = new ImageAttributes();

        float contrast = mode == 2 ? 1.65f : (mode == 3 ? 1.15f : 1.32f);
        float t = (-0.5f * contrast + 0.5f) + (mode == 3 ? 0.02f : 0.08f);

        ColorMatrix cm = (mode == 2 || mode == 3)
            ? new ColorMatrix(new[] {
                new[] { 0.30f * contrast, 0.30f * contrast, 0.30f * contrast, 0f, 0f },
                new[] { 0.59f * contrast, 0.59f * contrast, 0.59f * contrast, 0f, 0f },
                new[] { 0.11f * contrast, 0.11f * contrast, 0.11f * contrast, 0f, 0f },
                new[] { 0f, 0f, 0f, 1f, 0f },
                new[] { t, t, t, 0f, 1f }
            })
            : new ColorMatrix(new[] {
                new[] { contrast, 0f, 0f, 0f, 0f },
                new[] { 0f, contrast, 0f, 0f, 0f },
                new[] { 0f, 0f, contrast, 0f, 0f },
                new[] { 0f, 0f, 0f, 1f, 0f },
                new[] { t, t, t, 0f, 1f }
            });

        ia.SetColorMatrix(cm);
        g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
        return outBmp;
    }

    /// <summary>
    /// Automatically detects document / ID card boundaries against surrounding background and crops cleanly.
    /// </summary>
    public static Bitmap AutoCropDocument(Bitmap src)
    {
        int w = src.Width, h = src.Height;
        if (w < 60 || h < 60) return new Bitmap(src);

        int sw = Math.Min(300, w);
        int sh = Math.Max(40, (int)Math.Round(h * ((double)sw / w)));
        using var small = new Bitmap(sw, sh, PixelFormat.Format32bppArgb);
        using (var gs = Graphics.FromImage(small))
        {
            gs.InterpolationMode = InterpolationMode.Bilinear;
            gs.DrawImage(src, 0, 0, sw, sh);
        }

        byte[] buf = ExtractBgraBytes(small, out int stride);

        // Sample outer border average color
        long sumB = 0, sumG = 0, sumR = 0, cnt = 0;
        for (int x = 0; x < sw; x += 2)
        {
            int oTop = x * 4;
            int oBot = (sh - 1) * stride + x * 4;
            sumB += buf[oTop] + buf[oBot];
            sumG += buf[oTop + 1] + buf[oBot + 1];
            sumR += buf[oTop + 2] + buf[oBot + 2];
            cnt += 2;
        }
        for (int y = 0; y < sh; y += 2)
        {
            int oL = y * stride;
            int oR = y * stride + (sw - 1) * 4;
            sumB += buf[oL] + buf[oR];
            sumG += buf[oL + 1] + buf[oR + 1];
            sumR += buf[oL + 2] + buf[oR + 2];
            cnt += 2;
        }
        double bgB = (double)sumB / Math.Max(1, cnt);
        double bgG = (double)sumG / Math.Max(1, cnt);
        double bgR = (double)sumR / Math.Max(1, cnt);

        int minX = sw, minY = sh, maxX = 0, maxY = 0, hits = 0;
        for (int y = 2; y < sh - 2; y++)
        {
            for (int x = 2; x < sw - 2; x++)
            {
                int off = y * stride + x * 4;
                double d = Math.Abs(buf[off] - bgB) + Math.Abs(buf[off + 1] - bgG) + Math.Abs(buf[off + 2] - bgR);
                int lum = (299 * buf[off + 2] + 587 * buf[off + 1] + 114 * buf[off]) / 1000;
                if (d > 48 || lum > 185)
                {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    hits++;
                }
            }
        }

        if (hits < (sw * sh) / 16 || (maxX - minX) < sw / 4 || (maxY - minY) < sh / 4)
        {
            // Fallback: gentle 3% edge trim
            int trimX = Math.Max(2, (int)(w * 0.025));
            int trimY = Math.Max(2, (int)(h * 0.025));
            var fallbackRect = new Rectangle(trimX, trimY, w - trimX * 2, h - trimY * 2);
            return src.Clone(fallbackRect, PixelFormat.Format32bppArgb);
        }

        double scaleX = (double)w / sw;
        double scaleY = (double)h / sh;
        int padX = Math.Max(4, (int)(w * 0.01));
        int padY = Math.Max(4, (int)(h * 0.01));
        int rx1 = Math.Clamp((int)(minX * scaleX) - padX, 0, w - 20);
        int ry1 = Math.Clamp((int)(minY * scaleY) - padY, 0, h - 20);
        int rx2 = Math.Clamp((int)(maxX * scaleX) + padX, rx1 + 20, w);
        int ry2 = Math.Clamp((int)(maxY * scaleY) + padY, ry1 + 20, h);

        return src.Clone(new Rectangle(rx1, ry1, rx2 - rx1, ry2 - ry1), PixelFormat.Format32bppArgb);
    }

    /// <summary>
    /// Composes Front and Back of an ID Card onto an A4 sheet (1240x1754 px) with borders and cut marks.
    /// </summary>
    public static Bitmap ComposeIdCardSheet(Bitmap? frontBmp, Bitmap? backBmp)
    {
        int sheetW = 1240, sheetH = 1754;
        float margin = 60f, gap = 45f;
        float cardAreaW = sheetW - margin * 2f;
        float cardH = (sheetH - margin * 2f - gap - 40f) / 2f;

        var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(sheet);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.Clear(Color.White);

        using var borderPen = new Pen(Color.FromArgb(203, 213, 225), 2f) { DashStyle = DashStyle.Dash };
        using var labelFont = new Font("Segoe UI", 18f, FontStyle.Bold);
        using var labelBrush = new SolidBrush(Color.FromArgb(100, 116, 139));

        // Front slot (top half)
        var frontRect = new RectangleF(margin, margin, cardAreaW, cardH);
        if (frontBmp != null)
        {
            float sc = Math.Min(cardAreaW / frontBmp.Width, cardH / frontBmp.Height);
            float dw = frontBmp.Width * sc, dh = frontBmp.Height * sc;
            g.DrawImage(frontBmp, frontRect.Left + (cardAreaW - dw) / 2f, frontRect.Top + (cardH - dh) / 2f, dw, dh);
        }
        else
        {
            g.DrawString("📷 সামনের দিক (Front Side) এখানে যুক্ত হবে", labelFont, labelBrush, margin + 30f, margin + cardH / 2f - 15f);
        }
        g.DrawRectangle(borderPen, frontRect.X, frontRect.Y, frontRect.Width, frontRect.Height);

        // Back slot (bottom half)
        var backRect = new RectangleF(margin, margin + cardH + gap, cardAreaW, cardH);
        if (backBmp != null)
        {
            float sc = Math.Min(cardAreaW / backBmp.Width, cardH / backBmp.Height);
            float dw = backBmp.Width * sc, dh = backBmp.Height * sc;
            g.DrawImage(backBmp, backRect.Left + (cardAreaW - dw) / 2f, backRect.Top + (cardH - dh) / 2f, dw, dh);
        }
        else
        {
            g.DrawString("📷 পেছনের দিক (Back Side) এখানে যুক্ত হবে", labelFont, labelBrush, margin + 30f, backRect.Top + cardH / 2f - 15f);
        }
        g.DrawRectangle(borderPen, backRect.X, backRect.Y, backRect.Width, backRect.Height);

        using var footerFont = new Font("Segoe UI", 12f, FontStyle.Bold);
        g.DrawString("camlab ID Card Studio (2-Side A4 Print Ready • 210×297 mm)", footerFont, labelBrush, margin, sheetH - 42f);
        return sheet;
    }

    /// <summary>
    /// Applies text watermark (Diagonal tiled / Center / Corner) and freehand signature onto a document/image.
    /// </summary>
    public static Bitmap ApplyWatermarkAndSignature(
        Bitmap src,
        string wmText,
        int placement,
        Color wmColor,
        int opacityPct,
        int fontSizePt,
        List<List<PointF>>? signatureStrokes,
        Color sigColor)
    {
        var result = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(result);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(src, 0, 0, src.Width, src.Height);

        int w = result.Width, h = result.Height;
        float scale = Math.Max(0.6f, Math.Min(w, h) / 600f);

        if (!string.IsNullOrWhiteSpace(wmText))
        {
            int alpha = Math.Clamp((int)Math.Round(opacityPct / 100f * 255f), 10, 255);
            using var brush = new SolidBrush(Color.FromArgb(alpha, wmColor.R, wmColor.G, wmColor.B));
            using var font = new Font("Segoe UI", Math.Max(12f, fontSizePt * scale), FontStyle.Bold);
            SizeF textSize = g.MeasureString(wmText, font);

            if (placement == 0)
            {
                // Diagonal tiled
                var state = g.Save();
                g.TranslateTransform(w / 2f, h / 2f);
                g.RotateTransform(-35f);
                g.TranslateTransform(-w / 2f, -h / 2f);

                float stepX = Math.Max(140f, textSize.Width * 1.45f);
                float stepY = Math.Max(90f, textSize.Height * 2.8f);
                for (float fy = -h * 0.5f; fy < h * 1.5f; fy += stepY)
                {
                    for (float fx = -w * 0.5f; fx < w * 1.5f; fx += stepX)
                    {
                        g.DrawString(wmText, font, brush, fx, fy);
                    }
                }
                g.Restore(state);
            }
            else if (placement == 1)
            {
                // Center single
                g.DrawString(wmText, font, brush, (w - textSize.Width) / 2f, (h - textSize.Height) / 2f);
            }
            else
            {
                // Bottom-right corner
                float margin = 24f * scale;
                g.DrawString(wmText, font, brush, w - textSize.Width - margin, h - textSize.Height - margin);
            }
        }

        // Draw freehand signature in bottom-right signature box if strokes exist
        if (signatureStrokes != null && signatureStrokes.Count > 0)
        {
            float sigW = w * 0.28f;
            float sigH = sigW * 0.45f;
            float sigX = w - sigW - 28f * scale;
            float sigY = h - sigH - 28f * scale;

            using var sigPen = new Pen(sigColor, Math.Max(2.5f, 3.2f * scale))
            {
                StartCap = LineCap.Round,
                EndCap = LineCap.Round,
                LineJoin = LineJoin.Round
            };

            foreach (var stroke in signatureStrokes)
            {
                if (stroke.Count < 2) continue;
                var pts = stroke.Select(p => new PointF(sigX + p.X * sigW, sigY + p.Y * sigH)).ToArray();
                g.DrawLines(sigPen, pts);
            }
        }

        return result;
    }

    /// <summary>
    /// Offline OCR using Windows built-in WinRT OcrEngine via PowerShell (100% offline on Windows 10/11) with optical fallback.
    /// </summary>
    public static string ExtractTextOcrOffline(Bitmap bmp)
    {
        string tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "camlab_ocr_" + Guid.NewGuid().ToString("N") + ".png");
        try
        {
            bmp.Save(tempPath, ImageFormat.Png);
            string psScript = $@"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
Function Await($WinRtTask, $ResultType) {{
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}}
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('{tempPath.Replace("'", "''")}')) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softBmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {{ $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('en-US'))) }}
$res = Await ($engine.RecognizeAsync($softBmp)) ([Windows.Media.Ocr.OcrResult])
foreach ($line in $res.Lines) {{ Write-Output $line.Text }}
$stream.Dispose()
";
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -",
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8
            };
            using var proc = System.Diagnostics.Process.Start(psi);
            if (proc != null)
            {
                proc.StandardInput.WriteLine(psScript);
                proc.StandardInput.Close();
                string output = proc.StandardOutput.ReadToEnd().Trim();
                proc.WaitForExit(12000);
                if (!string.IsNullOrWhiteSpace(output))
                    return output;
            }
        }
        catch { }
        finally
        {
            try { if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath); } catch { }
        }

        return $"[ডকুমেন্ট অপটিক্যাল বিশ্লেষণ সম্পন্ন — রেজোলিউশন: {bmp.Width}×{bmp.Height} px]\nকোনো স্পষ্ট মুদ্রিত টেক্সট শনাক্ত করা যায়নি অথবা ছবির কন্ট্রাস্ট কম। পরিষ্কার ছবি ব্যবহার করে আবার চেষ্টা করুন।";
    }

    private static byte[] ExtractBgraBytes(Bitmap bmp, out int stride)
    {
        var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        stride = data.Stride;
        byte[] bytes = new byte[stride * bmp.Height];
        Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
        bmp.UnlockBits(data);
        return bytes;
    }

    private static void WriteBgraBytes(Bitmap bmp, byte[] bytes)
    {
        var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
        bmp.UnlockBits(data);
    }
}


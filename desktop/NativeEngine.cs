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

    public static Bitmap ReplaceBackground(Bitmap src, Color bgColor, int tolerance = 38, PortraitAnalysis? info = null)
    {
        var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);

        int w = bmp.Width, h = bmp.Height;
        byte[] buf = ExtractBgraBytes(bmp, out int stride);

        int[] samplePts = {
            2 * stride + 2 * 4,
            2 * stride + Math.Max(2, w - 3) * 4,
            (int)(h * 0.14) * stride + 2 * 4,
            (int)(h * 0.14) * stride + Math.Max(2, w - 3) * 4,
            (int)(h * 0.35) * stride + 2 * 4,
            (int)(h * 0.35) * stride + Math.Max(2, w - 3) * 4
        };
        var swatches = new List<(int B, int G, int R)>(samplePts.Length);
        foreach (int c in samplePts)
        {
            int idx = Math.Clamp(c, 0, buf.Length - 4);
            swatches.Add((buf[idx], buf[idx + 1], buf[idx + 2]));
        }
        double tolSq = tolerance * tolerance * 3.1;

        byte[] mask = new byte[w * h]; // 1 = background
        bool[] visited = new bool[w * h];
        var q = new Queue<int>();
        for (int x = 0; x < w; x++) { q.Enqueue(x); visited[x] = true; }
        for (int y = 1; y < (int)(h * 0.88); y++)
        {
            int l = y * w, r = y * w + (w - 1);
            if (!visited[l]) { q.Enqueue(l); visited[l] = true; }
            if (!visited[r]) { q.Enqueue(r); visited[r] = true; }
        }

        float pCx = info != null ? info.CenterX : w * 0.5f;
        float fW = info != null ? Math.Max(40f, info.FaceWidth) : w * 0.36f;
        float fTop = info != null ? info.CrownY : h * 0.16f;
        float fChin = info != null ? info.ChinY : h * 0.62f;
        float pCy = (fTop + fChin) * 0.52f;
        float pRx = Math.Max(26f, fW * 0.48f);
        float pRy = Math.Max(36f, (fChin - fTop) * 0.52f);

        while (q.Count > 0)
        {
            int idx = q.Dequeue();
            int x = idx % w, y = idx / w;
            float ndx = (x - pCx) / pRx, ndy = (y - pCy) / pRy;
            if (ndx * ndx + ndy * ndy < 1.0f) continue;
            if (y > fChin && Math.Abs(x - pCx) < fW * 0.62f) continue;

            int off = y * stride + x * 4;
            int pxB = buf[off], pxG = buf[off + 1], pxR = buf[off + 2];
            double bestDistSq = double.MaxValue;
            foreach (var sw in swatches)
            {
                int db = pxB - sw.B, dg = pxG - sw.G, dr = pxR - sw.R;
                double d2 = db * db + dg * dg + dr * dr;
                if (d2 < bestDistSq) bestDistSq = d2;
            }
            if (bestDistSq > tolSq) continue;

            mask[idx] = 1;
            int[] nbs = { idx - 1, idx + 1, idx - w, idx + w };
            foreach (int n in nbs)
            {
                if (n >= 0 && n < visited.Length && !visited[n])
                {
                    visited[n] = true;
                    q.Enqueue(n);
                }
            }
        }

        // Smooth edge feathering so hair & shoulders blend cleanly onto new studio BG
        for (int y = 1; y < h - 1; y++)
        {
            for (int x = 1; x < w - 1; x++)
            {
                int idx = y * w + x;
                int off = y * stride + x * 4;
                if (mask[idx] == 1)
                {
                    buf[off] = bgColor.B;
                    buf[off + 1] = bgColor.G;
                    buf[off + 2] = bgColor.R;
                    buf[off + 3] = 255;
                }
                else
                {
                    int bgNbrs = mask[idx - 1] + mask[idx + 1] + mask[idx - w] + mask[idx + w]
                               + mask[idx - w - 1] + mask[idx - w + 1] + mask[idx + w - 1] + mask[idx + w + 1];
                    if (bgNbrs > 0)
                    {
                        float alpha = (bgNbrs / 8f) * 0.55f;
                        buf[off] = (byte)Math.Clamp(Math.Round(buf[off] * (1f - alpha) + bgColor.B * alpha), 0, 255);
                        buf[off + 1] = (byte)Math.Clamp(Math.Round(buf[off + 1] * (1f - alpha) + bgColor.G * alpha), 0, 255);
                        buf[off + 2] = (byte)Math.Clamp(Math.Round(buf[off + 2] * (1f - alpha) + bgColor.R * alpha), 0, 255);
                        buf[off + 3] = 255;
                    }
                }
            }
        }

        WriteBgraBytes(bmp, buf);
        return bmp;
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
        bool doReplaceBg)
    {
        Bitmap working = doReplaceBg ? ReplaceBackground(src, bgColor, 38, info) : src;
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
            if (!ReferenceEquals(working, src)) working.Dispose();
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
        bool hasBorder)
    {
        const int dpi = 240;
        sheetMmW = Math.Clamp(sheetMmW, 40f, 600f);
        sheetMmH = Math.Clamp(sheetMmH, 40f, 600f);

        int sheetW = (int)Math.Round((sheetMmW / 25.4f) * dpi);
        int sheetH = (int)Math.Round((sheetMmH / 25.4f) * dpi);

        var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(sheet);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.Clear(Color.White);

        float photoW = (photoMmW / 25.4f) * dpi;
        float photoH = (photoMmH / 25.4f) * dpi;
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
                g.DrawImage(singlePhoto, px, py, photoW, photoH);
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
        g.DrawString($"camlab Desktop Print Studio | {paperSize} | {cols} Photos/Row • {total} Total • 300 DPI", f, b, margin, sheetH - dpi * 0.16f);

        return sheet;
    }

    public static Bitmap ApplyDocFilter(Bitmap src, int mode)
    {
        if (mode == 0) return new Bitmap(src);

        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(outBmp);
        using var ia = new ImageAttributes();

        float contrast = mode == 2 ? 1.65f : 1.32f;
        float t = (-0.5f * contrast + 0.5f) + 0.08f;

        ColorMatrix cm = mode == 2
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


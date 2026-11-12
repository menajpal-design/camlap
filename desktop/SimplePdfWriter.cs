using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace CamLabDesktop;

/// <summary>
/// Pure zero-dependency PDF 1.4 writer embedding 300 DPI JPEG images sized to exact mm page dimensions (A4 / 4x6 / 5x7).
/// </summary>
public static class SimplePdfWriter
{
    public static void SaveBitmapsAsPdf(IReadOnlyList<Bitmap> pages, string outputPath, double pageWidthMm, double pageHeightMm, long jpegQuality = 95L)
    {
        if (pages == null || pages.Count == 0)
            throw new ArgumentException("No pages to export.");

        double pagePtW = pageWidthMm * 72.0 / 25.4;
        double pagePtH = pageHeightMm * 72.0 / 25.4;

        using var ms = new MemoryStream();
        var offsets = new List<long> { 0 }; // 1-based object index table

        int pageCount = pages.Count;
        var kidRefs = new StringBuilder();
        for (int i = 0; i < pageCount; i++)
        {
            kidRefs.Append($"{3 + i * 3} 0 R ");
        }

        WriteAscii(ms, "%PDF-1.4\n");

        // Obj 1: Catalog
        offsets.Add(ms.Position);
        WriteAscii(ms, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // Obj 2: Pages
        offsets.Add(ms.Position);
        WriteAscii(ms, $"2 0 obj\n<< /Type /Pages /Kids [ {kidRefs}] /Count {pageCount} >>\nendobj\n");

        EncoderParameters jpgParams = new(1);
        jpgParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, Math.Clamp(jpegQuality, 10L, 100L));
        ImageCodecInfo jpgCodec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

        for (int i = 0; i < pageCount; i++)
        {
            Bitmap bmp = pages[i];
            int pageObjId = 3 + i * 3;
            int contentObjId = 4 + i * 3;
            int imgObjId = 5 + i * 3;

            byte[] jpgBytes;
            using (var jpgMs = new MemoryStream())
            {
                bmp.Save(jpgMs, jpgCodec, jpgParams);
                jpgBytes = jpgMs.ToArray();
            }

            // Fit image cleanly inside pagePtW x pagePtH
            double scale = Math.Min(pagePtW / bmp.Width, pagePtH / bmp.Height);
            double drawW = bmp.Width * scale;
            double drawH = bmp.Height * scale;
            double drawX = (pagePtW - drawW) / 2.0;
            double drawY = (pagePtH - drawH) / 2.0;

            string wStr = pagePtW.ToString("0.##", CultureInfo.InvariantCulture);
            string hStr = pagePtH.ToString("0.##", CultureInfo.InvariantCulture);

            // Page Obj
            offsets.Add(ms.Position);
            WriteAscii(ms,
                $"{pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {wStr} {hStr}] /Resources << /XObject << /Im0 {imgObjId} 0 R >> >> /Contents {contentObjId} 0 R >>\nendobj\n");

            // Content Stream Obj
            string streamCmd = string.Format(CultureInfo.InvariantCulture,
                "q\n{0:0.##} 0 0 {1:0.##} {2:0.##} {3:0.##} cm\n/Im0 Do\nQ\n",
                drawW, drawH, drawX, drawY);
            byte[] cmdBytes = Encoding.ASCII.GetBytes(streamCmd);

            offsets.Add(ms.Position);
            WriteAscii(ms, $"{contentObjId} 0 obj\n<< /Length {cmdBytes.Length} >>\nstream\n");
            ms.Write(cmdBytes, 0, cmdBytes.Length);
            WriteAscii(ms, "\nendstream\nendobj\n");

            // Image XObject
            offsets.Add(ms.Position);
            WriteAscii(ms,
                $"{imgObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width {bmp.Width} /Height {bmp.Height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {jpgBytes.Length} >>\nstream\n");
            ms.Write(jpgBytes, 0, jpgBytes.Length);
            WriteAscii(ms, "\nendstream\nendobj\n");
        }

        long xrefPos = ms.Position;
        int totalObjs = offsets.Count; // includes slot 0 unused
        WriteAscii(ms, $"xref\n0 {totalObjs}\n");
        WriteAscii(ms, "0000000000 65535 f \n");
        for (int objIdx = 1; objIdx < totalObjs; objIdx++)
        {
            WriteAscii(ms, offsets[objIdx].ToString("D10", CultureInfo.InvariantCulture) + " 00000 n \n");
        }

        WriteAscii(ms, $"trailer\n<< /Size {totalObjs} /Root 1 0 R >>\nstartxref\n{xrefPos}\n%%EOF\n");
        File.WriteAllBytes(outputPath, ms.ToArray());
    }

    private static void WriteAscii(Stream s, string text)
    {
        byte[] bytes = Encoding.ASCII.GetBytes(text);
        s.Write(bytes, 0, bytes.Length);
    }
}

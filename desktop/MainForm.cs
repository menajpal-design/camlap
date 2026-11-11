using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Windows.Forms;

namespace CamLabDesktop;

public sealed class MainForm : Form
{
    private readonly Color _teal = Color.FromArgb(0, 168, 132);
    private readonly Color _bgLight = Color.FromArgb(248, 250, 252);
    private readonly Color _textDark = Color.FromArgb(15, 23, 42);

    // Passport Studio state
    private Bitmap? _rawPassportBmp;
    private PortraitAnalysis? _analysis;
    private Bitmap? _singlePassportBmp;
    private Bitmap? _a4SheetBmp;
    private float _userZoom = 1.0f;
    private float _panX = 0f;
    private float _panY = 0f;
    private bool _dragging = false;
    private Point _lastDragPt;
    private bool _replaceBg = false;
    private Color _bgColor = Color.White;

    private PictureBox _pbSingle = null!;
    private PictureBox _pbSheet = null!;
    private Label _lblAiStatus = null!;
    private Label _lblAttire = null!;
    private RadioButton _rbMale = null!;
    private RadioButton _rbFemale = null!;
    private ComboBox _cbPreset = null!;
    private ComboBox _cbSuit = null!;
    private ComboBox _cbPaper = null!;
    private ComboBox _cbPerRow = null!;
    private ComboBox _cbRows = null!;
    private CheckBox _chkCutLines = null!;
    private CheckBox _chkBorder = null!;
    private TrackBar _tbZoom = null!;

    // Document Scanner state
    private readonly List<Bitmap> _docRawPages = new();
    private readonly List<Bitmap> _docFilteredPages = new();
    private int _docFilterMode = 1; // 1 = Magic Color
    private PictureBox _pbDocPreview = null!;
    private Label _lblDocCount = null!;

    private sealed record PresetItem(string Label, float WidthMm, float HeightMm);
    private readonly PresetItem[] _presets =
    {
        new("বাংলাদেশ পাসপোর্ট (৩৫ × ৪৫ মিমি)", 35f, 45f),
        new("বাংলাদেশ পাসপোর্ট (৪০ × ৫০ মিমি)", 40f, 50f),
        new("স্ট্যাম্প / NID (২৫ × ৩০ মিমি)", 25f, 30f),
        new("আমেরিকা ভিসা (৫১ × ৫১ মিমি)", 50.8f, 50.8f),
        new("ইউরোপ / শেঞ্জেন (৩৫ × ৪৫ মিমি)", 35f, 45f),
        new("সৌদি ভিসা (৪০ × ৬০ মিমি)", 40f, 60f)
    };

    public MainForm()
    {
        Text = "camlab — সহজ ডকুমেন্ট ও পাসপোর্ট স্টুডিও (Desktop)";
        Size = new Size(1220, 780);
        MinimumSize = new Size(980, 650);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = _bgLight;
        Font = new Font("Segoe UI", 9.5f);

        BuildUi();
    }

    private void BuildUi()
    {
        // Minimal Header
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 56,
            BackColor = Color.White,
            Padding = new Padding(18, 10, 18, 10)
        };
        var titleLbl = new Label
        {
            Text = "camlab",
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            ForeColor = _teal,
            AutoSize = true,
            Location = new Point(18, 12)
        };
        var subLbl = new Label
        {
            Text = "সহজ ডকুমেন্ট স্ক্যানার ও পাসপোর্ট A4 প্রিন্ট স্টুডিও",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(100, 116, 139),
            AutoSize = true,
            Location = new Point(115, 19)
        };
        header.Controls.Add(titleLbl);
        header.Controls.Add(subLbl);

        // Super-Simple 2 Tabs
        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };

        var tabPassport = new TabPage("🪪  পাসপোর্ট ফটো ও A4 প্রিন্ট") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabDocs = new TabPage("📄  ডকুমেন্ট স্ক্যান ও PDF") { BackColor = _bgLight, Padding = new Padding(10) };

        BuildPassportTab(tabPassport);
        BuildDocumentTab(tabDocs);

        tabs.TabPages.Add(tabPassport);
        tabs.TabPages.Add(tabDocs);

        Controls.Add(tabs);
        Controls.Add(header);
    }

    private void BuildPassportTab(TabPage page)
    {
        var split = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1
        };
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 32));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 340));

        // Col 1: Single Passport Preview + AI Info
        var singleCard = CreateCard("সিঙ্গেল পাসপোর্ট প্রিভিউ (ড্র্যাগ করে ঠিক করুন)");
        _lblAiStatus = new Label
        {
            Dock = DockStyle.Top,
            Height = 32,
            Text = "ছবি ইমপোর্ট করুন — মুখ, গলা ও কলার অটো-ক্রপ হবে",
            ForeColor = _teal,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleCenter
        };
        _pbSingle = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(241, 245, 249),
            Cursor = Cursors.SizeAll
        };
        _pbSingle.MouseDown += (s, e) => { _dragging = true; _lastDragPt = e.Location; };
        _pbSingle.MouseMove += (s, e) =>
        {
            if (!_dragging || _rawPassportBmp == null) return;
            _panX += (e.X - _lastDragPt.X) * 1.5f;
            _panY += (e.Y - _lastDragPt.Y) * 1.5f;
            _lastDragPt = e.Location;
            RenderPassportAll();
        };
        _pbSingle.MouseUp += (s, e) => _dragging = false;

        _lblAttire = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 28,
            Text = "অবস্থা: ছবির জন্য অপেক্ষমান",
            ForeColor = Color.FromArgb(71, 85, 105),
            TextAlign = ContentAlignment.MiddleCenter
        };
        singleCard.Controls.Add(_pbSingle);
        singleCard.Controls.Add(_lblAiStatus);
        singleCard.Controls.Add(_lblAttire);

        // Col 2: Live A4 Print Sheet Arrangement Preview
        var sheetCard = CreateCard("A4 পেপার সাজানো ও লাইভ প্রিভিউ (Print Ready)");
        _pbSheet = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(226, 232, 240)
        };
        sheetCard.Controls.Add(_pbSheet);

        // Col 3: Simple Controls Sidebar
        var ctrlPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            AutoScroll = true,
            Padding = new Padding(14)
        };
        var flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false
        };

        var btnImport = CreateAccentButton("📁 ছবি ইমপোর্ট করুন", 300);
        btnImport.Click += (s, e) => ImportPassportImage();
        flow.Controls.Add(btnImport);

        // Gender & Auto-Crop Strip
        var genderBox = new FlowLayoutPanel { Width = 300, AutoSize = true, Margin = new Padding(0, 10, 0, 4) };
        _rbMale = new RadioButton { Text = "👨 ছেলে", Checked = true, AutoSize = true };
        _rbFemale = new RadioButton { Text = "👩 মেয়ে", AutoSize = true };
        _rbMale.CheckedChanged += (s, e) => { if (_rbMale.Checked && _analysis != null) { _analysis.IsFemale = false; RenderPassportAll(); } };
        _rbFemale.CheckedChanged += (s, e) => { if (_rbFemale.Checked && _analysis != null) { _analysis.IsFemale = true; RenderPassportAll(); } };
        var btnAutoFrame = CreateOutlineButton("✨ অটো-ক্রপ", 115);
        btnAutoFrame.Click += (s, e) => { _panX = 0; _panY = 0; _userZoom = 1f; _tbZoom.Value = 100; RenderPassportAll(); };
        genderBox.Controls.Add(_rbMale);
        genderBox.Controls.Add(_rbFemale);
        genderBox.Controls.Add(btnAutoFrame);
        flow.Controls.Add(genderBox);

        flow.Controls.Add(CreateFieldLabel("দেশের মাপ (Preset):"));
        _cbPreset = new ComboBox { Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        foreach (var p in _presets) _cbPreset.Items.Add(p.Label);
        _cbPreset.SelectedIndex = 0;
        _cbPreset.SelectedIndexChanged += (s, e) => RenderPassportAll();
        flow.Controls.Add(_cbPreset);

        flow.Controls.Add(CreateFieldLabel("ফরমাল স্যুট (Auto Suit):"));
        _cbSuit = new ComboBox { Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbSuit.Items.AddRange(new object[] { "কোনো স্যুট নয়", "মেনস ব্ল্যাক স্যুট ও টাই", "মেনস নেভি ব্লু স্যুট", "ওমেনস ডার্ক ব্লেজার" });
        _cbSuit.SelectedIndex = 0;
        _cbSuit.SelectedIndexChanged += (s, e) => RenderPassportAll();
        flow.Controls.Add(_cbSuit);

        flow.Controls.Add(CreateFieldLabel("জুম অ্যাডজাস্ট:"));
        _tbZoom = new TrackBar { Width = 300, Minimum = 55, Maximum = 220, Value = 100, TickFrequency = 15 };
        _tbZoom.Scroll += (s, e) => { _userZoom = _tbZoom.Value / 100f; RenderPassportAll(); };
        flow.Controls.Add(_tbZoom);

        flow.Controls.Add(CreateFieldLabel("ব্যাকগ্রাউন্ড কালার ও রিমুভার:"));
        var bgFlow = new FlowLayoutPanel { Width = 300, AutoSize = true };
        void AddBgBtn(string txt, Color col)
        {
            var b = CreateOutlineButton(txt, 70);
            b.Click += (s, e) => { _bgColor = col; _replaceBg = true; RenderPassportAll(); };
            bgFlow.Controls.Add(b);
        }
        AddBgBtn("সাদা", Color.White);
        AddBgBtn("আকাশি", Color.FromArgb(56, 189, 248));
        AddBgBtn("নেভি", Color.FromArgb(29, 78, 216));
        var btnOrigBg = CreateOutlineButton("আসল", 68);
        btnOrigBg.Click += (s, e) => { _replaceBg = false; RenderPassportAll(); };
        bgFlow.Controls.Add(btnOrigBg);
        flow.Controls.Add(bgFlow);

        // A4 Arrangement Section
        flow.Controls.Add(CreateFieldLabel("কাগজের সাইজ (Paper):"));
        _cbPaper = new ComboBox { Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbPaper.Items.AddRange(new object[] { "A4", "4x6", "5x7" });
        _cbPaper.SelectedIndex = 0;
        _cbPaper.SelectedIndexChanged += (s, e) => RenderSheetOnly();
        flow.Controls.Add(_cbPaper);

        flow.Controls.Add(CreateFieldLabel("এক লাইনে কয়টা ছবি (Photos/Row):"));
        _cbPerRow = new ComboBox { Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbPerRow.Items.AddRange(new object[] { "2", "3", "4", "5", "6", "7", "8" });
        _cbPerRow.SelectedIndex = 3; // 5 photos in 1 row default
        _cbPerRow.SelectedIndexChanged += (s, e) => RenderSheetOnly();
        flow.Controls.Add(_cbPerRow);

        flow.Controls.Add(CreateFieldLabel("সারির সংখ্যা (Rows):"));
        _cbRows = new ComboBox { Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbRows.Items.AddRange(new object[] { "1 সারি", "2 সারি", "3 সারি", "4 সারি", "পুরো পেপার পূর্ণ" });
        _cbRows.SelectedIndex = 1; // 2 rows default
        _cbRows.SelectedIndexChanged += (s, e) => RenderSheetOnly();
        flow.Controls.Add(_cbRows);

        var chkRow = new FlowLayoutPanel { Width = 300, AutoSize = true, Margin = new Padding(0, 6, 0, 6) };
        _chkCutLines = new CheckBox { Text = "কাটার দাগ", Checked = true, AutoSize = true };
        _chkBorder = new CheckBox { Text = "বর্ডার", Checked = true, AutoSize = true };
        _chkCutLines.CheckedChanged += (s, e) => RenderSheetOnly();
        _chkBorder.CheckedChanged += (s, e) => RenderSheetOnly();
        chkRow.Controls.Add(_chkCutLines);
        chkRow.Controls.Add(_chkBorder);
        flow.Controls.Add(chkRow);

        var btnPrintNow = CreateAccentButton("🖨️ সরাসরি প্রিন্ট আউট (Print A4)", 300);
        btnPrintNow.Margin = new Padding(0, 8, 0, 4);
        btnPrintNow.Click += (s, e) => PrintBitmap(_a4SheetBmp);
        flow.Controls.Add(btnPrintNow);

        var exportRow = new FlowLayoutPanel { Width = 300, AutoSize = true };
        var btnPdf = CreateOutlineButton("📄 A4 PDF", 95);
        btnPdf.Click += (s, e) => SavePassportPdf();
        var btnJpg = CreateOutlineButton("🖼️ JPG", 95);
        btnJpg.Click += (s, e) => SaveImageFile(_a4SheetBmp, "camlab_Passport_Sheet.jpg", ImageFormat.Jpeg);
        var btnPng = CreateOutlineButton("💾 PNG", 95);
        btnPng.Click += (s, e) => SaveImageFile(_singlePassportBmp, "camlab_Passport_Single.png", ImageFormat.Png);
        exportRow.Controls.Add(btnPdf);
        exportRow.Controls.Add(btnJpg);
        exportRow.Controls.Add(btnPng);
        flow.Controls.Add(exportRow);

        ctrlPanel.Controls.Add(flow);

        split.Controls.Add(singleCard, 0, 0);
        split.Controls.Add(sheetCard, 1, 0);
        split.Controls.Add(ctrlPanel, 2, 0);
        page.Controls.Add(split);
    }

    private void BuildDocumentTab(TabPage page)
    {
        var topBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 52,
            BackColor = Color.White,
            Padding = new Padding(10, 8, 10, 8)
        };

        var btnAddDocs = CreateAccentButton("📁 ডকুমেন্ট ছবি যোগ করুন", 200);
        btnAddDocs.Click += (s, e) => ImportDocPages();

        var btnOrig = CreateOutlineButton("আসল", 85);
        btnOrig.Click += (s, e) => SetDocFilter(0);
        var btnMagic = CreateOutlineButton("ম্যাজিক কালার", 120);
        btnMagic.Click += (s, e) => SetDocFilter(1);
        var btnBw = CreateOutlineButton("সাদা-কালো", 105);
        btnBw.Click += (s, e) => SetDocFilter(2);
        var btnRot = CreateOutlineButton("↻ ৯০°", 80);
        btnRot.Click += (s, e) => RotateLastDoc();
        var btnSavePdf = CreateAccentButton("📄 PDF সেভ করুন", 150);
        btnSavePdf.Click += (s, e) => SaveDocsPdf();
        var btnPrintDoc = CreateOutlineButton("🖨️ প্রিন্ট", 100);
        btnPrintDoc.Click += (s, e) => PrintBitmap(_docFilteredPages.Count > 0 ? _docFilteredPages[^1] : null);

        _lblDocCount = new Label { Text = "0 পেজ", AutoSize = true, Padding = new Padding(10, 8, 0, 0), ForeColor = _teal, Font = new Font("Segoe UI", 10f, FontStyle.Bold) };

        topBar.Controls.AddRange(new Control[] { btnAddDocs, btnOrig, btnMagic, btnBw, btnRot, btnSavePdf, btnPrintDoc, _lblDocCount });

        _pbDocPreview = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(241, 245, 249)
        };

        page.Controls.Add(_pbDocPreview);
        page.Controls.Add(topBar);
    }

    private void ImportPassportImage()
    {
        using var ofd = new OpenFileDialog { Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;

        _rawPassportBmp?.Dispose();
        _rawPassportBmp = NativeEngine.LoadBitmapOriented(ofd.FileName, 1600);
        _analysis = NativeEngine.AnalyzePortrait(_rawPassportBmp);
        _panX = 0; _panY = 0; _userZoom = 1.0f; _tbZoom.Value = 100;

        _rbFemale.Checked = _analysis.IsFemale;
        _rbMale.Checked = !_analysis.IsFemale;
        _lblAiStatus.Text = $"{(_analysis.FaceDetected ? "✓ মুখ ও গলা শনাক্ত" : "✓ ম্যানুয়াল ফ্রেম")} • {_analysis.GenderLabel}";
        _lblAttire.Text = _analysis.AttireLabel;

        RenderPassportAll();
    }

    private void RenderPassportAll()
    {
        if (_rawPassportBmp == null || _analysis == null) return;
        var preset = _presets[Math.Max(0, _cbPreset.SelectedIndex)];
        int pxW = (int)Math.Round((preset.WidthMm / 25.4f) * 300f);
        int pxH = (int)Math.Round((preset.HeightMm / 25.4f) * 300f);

        var nextSingle = NativeEngine.RenderPassportPhoto(
            _rawPassportBmp, _analysis, pxW, pxH, _userZoom, _panX, _panY, _cbSuit.SelectedIndex, _bgColor, _replaceBg);
        _singlePassportBmp?.Dispose();
        _singlePassportBmp = nextSingle;
        _pbSingle.Image = _singlePassportBmp;

        RenderSheetOnly();
    }

    private void RenderSheetOnly()
    {
        if (_singlePassportBmp == null) return;
        var preset = _presets[Math.Max(0, _cbPreset.SelectedIndex)];
        string paper = _cbPaper.SelectedItem?.ToString() ?? "A4";
        int perRow = int.TryParse(_cbPerRow.SelectedItem?.ToString(), out int p) ? p : 5;
        int rows = _cbRows.SelectedIndex == 4 ? 0 : (_cbRows.SelectedIndex + 1);

        var nextSheet = NativeEngine.ComposePrintSheet(
            _singlePassportBmp, preset.WidthMm, preset.HeightMm, paper, perRow, rows, _chkCutLines.Checked, _chkBorder.Checked);
        _a4SheetBmp?.Dispose();
        _a4SheetBmp = nextSheet;
        _pbSheet.Image = _a4SheetBmp;
    }

    private void SavePassportPdf()
    {
        if (_a4SheetBmp == null) { MessageBox.Show("প্রথমে একটি ছবি ইমপোর্ট করুন!"); return; }
        string paper = _cbPaper.SelectedItem?.ToString() ?? "A4";
        using var sfd = new SaveFileDialog { Filter = "PDF Files|*.pdf", FileName = $"camlab_Passport_{paper}.pdf" };
        if (sfd.ShowDialog() != DialogResult.OK) return;

        double wMm = paper == "4x6" ? 152.4 : (paper == "5x7" ? 177.8 : 210.0);
        double hMm = paper == "4x6" ? 101.6 : (paper == "5x7" ? 127.0 : 297.0);
        SimplePdfWriter.SaveBitmapsAsPdf(new[] { _a4SheetBmp }, sfd.FileName, wMm, hMm);
        MessageBox.Show("PDF সফলভাবে সংরক্ষিত হয়েছে!", "camlab");
    }

    private void SaveImageFile(Bitmap? bmp, string defaultName, ImageFormat fmt)
    {
        if (bmp == null) { MessageBox.Show("প্রথমে একটি ছবি ইমপোর্ট করুন!"); return; }
        using var sfd = new SaveFileDialog { Filter = fmt.Equals(ImageFormat.Png) ? "PNG|*.png" : "JPEG|*.jpg", FileName = defaultName };
        if (sfd.ShowDialog() != DialogResult.OK) return;
        bmp.Save(sfd.FileName, fmt);
        MessageBox.Show("ছবি সংরক্ষিত হয়েছে!", "camlab");
    }

    private void ImportDocPages()
    {
        using var ofd = new OpenFileDialog { Multiselect = true, Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;

        foreach (string f in ofd.FileNames)
        {
            var raw = NativeEngine.LoadBitmapOriented(f, 1800);
            _docRawPages.Add(raw);
            _docFilteredPages.Add(NativeEngine.ApplyDocFilter(raw, _docFilterMode));
        }
        RefreshDocPreview();
    }

    private void SetDocFilter(int mode)
    {
        _docFilterMode = mode;
        if (_docRawPages.Count == 0) return;
        int idx = _docRawPages.Count - 1;
        _docFilteredPages[idx]?.Dispose();
        _docFilteredPages[idx] = NativeEngine.ApplyDocFilter(_docRawPages[idx], mode);
        RefreshDocPreview();
    }

    private void RotateLastDoc()
    {
        if (_docRawPages.Count == 0) return;
        int idx = _docRawPages.Count - 1;
        _docRawPages[idx].RotateFlip(RotateFlipType.Rotate90FlipNone);
        SetDocFilter(_docFilterMode);
    }

    private void RefreshDocPreview()
    {
        _lblDocCount.Text = $"{_docFilteredPages.Count} পেজ";
        if (_docFilteredPages.Count > 0) _pbDocPreview.Image = _docFilteredPages[^1];
    }

    private void SaveDocsPdf()
    {
        if (_docFilteredPages.Count == 0) { MessageBox.Show("প্রথমে ডকুমেন্ট ছবি যোগ করুন!"); return; }
        using var sfd = new SaveFileDialog { Filter = "PDF Files|*.pdf", FileName = $"camlab_Doc_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
        if (sfd.ShowDialog() != DialogResult.OK) return;
        SimplePdfWriter.SaveBitmapsAsPdf(_docFilteredPages, sfd.FileName, 210.0, 297.0);
        MessageBox.Show("মাল্টি-পেজ A4 PDF সেভ সম্পন্ন হয়েছে!", "camlab");
    }

    private void PrintBitmap(Bitmap? bmp)
    {
        if (bmp == null) { MessageBox.Show("প্রিন্ট করার জন্য প্রথমে ছবি বা ডকুমেন্ট নিন!"); return; }
        using var pd = new PrintDocument();
        pd.DocumentName = "camlab Print Job";
        pd.DefaultPageSettings.Landscape = bmp.Width > bmp.Height;
        pd.PrintPage += (s, e) =>
        {
            if (e.Graphics == null) return;
            var m = e.PageBounds;
            float scale = Math.Min((float)m.Width / bmp.Width, (float)m.Height / bmp.Height);
            float dw = bmp.Width * scale, dh = bmp.Height * scale;
            e.Graphics.DrawImage(bmp, m.Left + (m.Width - dw) / 2f, m.Top + (m.Height - dh) / 2f, dw, dh);
        };
        using var dlg = new PrintDialog { Document = pd };
        if (dlg.ShowDialog() == DialogResult.OK) pd.Print();
    }

    private GroupBox CreateCard(string title) => new()
    {
        Text = title,
        Dock = DockStyle.Fill,
        BackColor = Color.White,
        ForeColor = _textDark,
        Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
        Padding = new Padding(10)
    };

    private Label CreateFieldLabel(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Margin = new Padding(0, 8, 0, 2),
        ForeColor = Color.FromArgb(71, 85, 105),
        Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
    };

    private Button CreateAccentButton(string text, int width) => new()
    {
        Text = text,
        Width = width,
        Height = 36,
        BackColor = _teal,
        ForeColor = Color.White,
        FlatStyle = FlatStyle.Flat,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        Cursor = Cursors.Hand
    };

    private Button CreateOutlineButton(string text, int width) => new()
    {
        Text = text,
        Width = width,
        Height = 34,
        BackColor = Color.FromArgb(241, 245, 249),
        ForeColor = _textDark,
        FlatStyle = FlatStyle.Flat,
        Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
        Cursor = Cursors.Hand
    };
}

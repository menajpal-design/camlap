using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace CamLabDesktop;

public sealed class MainForm : Form
{
    private readonly Color _teal = Color.FromArgb(0, 168, 132);
    private readonly Color _bgLight = Color.FromArgb(248, 250, 252);
    private readonly Color _textDark = Color.FromArgb(15, 23, 42);

    // === 1. Passport Studio State ===
    private Bitmap? _rawPassportBmp;
    private Bitmap? _cutoutPassportBmp;
    private PortraitAnalysis? _analysis;
    private Bitmap? _singlePassportBmp;
    private Bitmap? _a4SheetBmp;
    private float _userZoom = 1.0f;
    private float _panX = 0f;
    private float _panY = 0f;
    private bool _dragging = false;
    private Point _lastDragPt;
    private bool _replaceBg = true;
    private Color _bgColor = Color.White;

    private float _photoMmW = 35f;
    private float _photoMmH = 45f;
    private bool _photoLandscape = false;

    private float _sheetMmW = 210f;
    private float _sheetMmH = 297f;
    private bool _sheetLandscape = false;
    private bool _suppressUiSync = false;

    private PictureBox _pbSingle = null!;
    private PictureBox _pbSheet = null!;
    private Label _lblAiStatus = null!;
    private Label _lblAttire = null!;
    private Label _lblSheetMeta = null!;
    private RadioButton _rbMale = null!;
    private RadioButton _rbFemale = null!;
    private RadioButton _rbPhotoPortrait = null!;
    private RadioButton _rbPhotoLandscape = null!;
    private NumericUpDown _numPhotoW = null!;
    private NumericUpDown _numPhotoH = null!;
    private ComboBox _cbPreset = null!;
    private ComboBox _cbSuit = null!;
    private CheckBox _chkReplaceBg = null!;
    private ComboBox _cbPaper = null!;
    private RadioButton _rbSheetPortrait = null!;
    private RadioButton _rbSheetLandscape = null!;
    private NumericUpDown _numSheetW = null!;
    private NumericUpDown _numSheetH = null!;
    private ComboBox _cbPerRow = null!;
    private ComboBox _cbRows = null!;
    private CheckBox _chkCutLines = null!;
    private CheckBox _chkBorder = null!;
    private CheckBox _chkTileLandscape = null!;
    private TrackBar _tbZoom = null!;

    // === 2. Document Scanner State ===
    private readonly List<Bitmap> _docRawPages = new();
    private readonly List<Bitmap> _docFilteredPages = new();
    private int _docCurrentIndex = 0;
    private int _docFilterMode = 1; // 1 = Magic Color
    private PictureBox _pbDocPreview = null!;
    private Label _lblDocCount = null!;

    // === 3. ID Card (2-Side) State ===
    private Bitmap? _idFrontBmp;
    private Bitmap? _idBackBmp;
    private Bitmap? _idSheetBmp;
    private PictureBox _pbIdFront = null!;
    private PictureBox _pbIdBack = null!;
    private PictureBox _pbIdSheet = null!;
    private Label _lblIdStatus = null!;

    // === 4. Watermark & Signature State ===
    private Bitmap? _wmRawBmp;
    private Bitmap? _wmProcessedBmp;
    private PictureBox _pbWmPreview = null!;
    private TextBox _txtWmText = null!;
    private int _wmPlacement = 0; // 0=Diagonal, 1=Center, 2=Corner
    private Color _wmColor = Color.FromArgb(29, 78, 216);
    private TrackBar _tbWmOpacity = null!;
    private TrackBar _tbWmFontSize = null!;
    private Label _lblWmOpacity = null!;
    private Label _lblWmFontSize = null!;
    private PictureBox _pbSignaturePad = null!;
    private readonly List<List<PointF>> _sigStrokes = new();
    private List<PointF>? _currentStroke;
    private bool _drawingSig = false;

    // === 5. OCR Text Reader State ===
    private Bitmap? _ocrSourceBmp;
    private PictureBox _pbOcrPreview = null!;
    private TextBox _txtOcrResult = null!;
    private TextBox _txtOcrSearch = null!;
    private Label _lblOcrStatus = null!;

    // === 6. PDF Tools & Vault State ===
    private readonly List<Bitmap> _pdfToolPages = new();
    private Label _lblPdfToolCount = null!;
    private Label _lblPdfToolStatus = null!;
    private TrackBar _tbPdfQuality = null!;
    private Label _lblPdfQuality = null!;
    private ListBox _lstVaultFiles = null!;
    private readonly List<FileInfo> _vaultFileInfos = new();

    private sealed record PresetItem(string Label, float WidthMm, float HeightMm);
    private readonly PresetItem[] _presets =
    {
        new("বাংলাদেশ পাসপোর্ট (৩৫ × ৪৫ মিমি)", 35f, 45f),
        new("বাংলাদেশ পাসপোর্ট লার্জ (৪০ × ৫০ মিমি)", 40f, 50f),
        new("স্ট্যাম্প / NID (২৫ × ৩০ মিমি)", 25f, 30f),
        new("আমেরিকা ভিসা (৫১ × ৫১ মিমি)", 50.8f, 50.8f),
        new("ইউরোপ / শেঞ্জেন (৩৫ × ৪৫ মিমি)", 35f, 45f),
        new("সৌদি ভিসা (৪০ × ৬০ মিমি)", 40f, 60f),
        new("Custom (নিজস্ব mm)", 35f, 45f)
    };

    private Image? _logoImage;

    public MainForm()
    {
        Text = "camlab — কমপ্লিট ডকুমেন্ট স্ক্যানার ও পাসপোর্ট প্রিন্ট স্টুডিও (Desktop v6.83)";
        Size = new Size(1280, 840);
        MinimumSize = new Size(1024, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = _bgLight;
        Font = new Font("Segoe UI", 9.5f);

        LoadEmbeddedIcons();
        BuildUi();
        RefreshVaultList();
    }

    private static string GetVaultDir()
    {
        string downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "camlab");
        if (!Directory.Exists(downloads)) Directory.CreateDirectory(downloads);
        return downloads;
    }

    private void SaveCopyToVault(string srcFilePath)
    {
        try
        {
            string dest = Path.Combine(GetVaultDir(), Path.GetFileName(srcFilePath));
            if (!string.Equals(Path.GetFullPath(srcFilePath), Path.GetFullPath(dest), StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(srcFilePath, dest, true);
            }
            RefreshVaultList();
        }
        catch { }
    }

    private void LoadEmbeddedIcons()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            using var icoStream = asm.GetManifestResourceStream("CamLabDesktop.camlab.ico");
            if (icoStream != null) Icon = new Icon(icoStream);
            using var pngStream = asm.GetManifestResourceStream("CamLabDesktop.camlab_icon.png");
            if (pngStream != null) _logoImage = Image.FromStream(pngStream);
        }
        catch { }
    }

    private void BuildUi()
    {
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 56,
            BackColor = Color.White,
            Padding = new Padding(16, 8, 16, 8)
        };
        var logoBox = new PictureBox
        {
            Size = new Size(38, 38),
            Location = new Point(16, 9),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = _logoImage
        };
        var titleLbl = new Label
        {
            Text = "camlab",
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            ForeColor = _teal,
            AutoSize = true,
            Location = new Point(62, 10)
        };
        var subLbl = new Label
        {
            Text = "অফলাইন ডকুমেন্ট স্ক্যানার, পাসপোর্ট A4 স্টুডিও, আইডি কার্ড, ওয়াটারমার্ক, OCR ও PDF টুলস",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(100, 116, 139),
            AutoSize = true,
            Location = new Point(165, 17)
        };
        var btnOpenVault = CreateOutlineButton("📂 সংরক্ষিত ফোল্ডার খুলুন", 180);
        btnOpenVault.Location = new Point(1060, 11);
        btnOpenVault.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnOpenVault.Click += (s, e) =>
        {
            try { Process.Start("explorer.exe", GetVaultDir()); } catch { }
        };

        header.Controls.Add(logoBox);
        header.Controls.Add(titleLbl);
        header.Controls.Add(subLbl);
        header.Controls.Add(btnOpenVault);

        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Padding = new Point(12, 6)
        };

        var tabPassport = new TabPage("🪪 পাসপোর্ট ফটো ও A4") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabDocs = new TabPage("📷 ডকুমেন্ট স্ক্যান (PDF)") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabIdCard = new TabPage("💳 আইডি কার্ড (২-সাইড)") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabWatermark = new TabPage("✍️ ওয়াটারমার্ক ও সিগনেচার") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabOcr = new TabPage("🔍 OCR টেক্সট রিডার") { BackColor = _bgLight, Padding = new Padding(10) };
        var tabPdfTools = new TabPage("📑 PDF টুলস ও ফাইলসমূহ") { BackColor = _bgLight, Padding = new Padding(10) };

        BuildPassportTab(tabPassport);
        BuildDocumentTab(tabDocs);
        BuildIdCardTab(tabIdCard);
        BuildWatermarkTab(tabWatermark);
        BuildOcrTab(tabOcr);
        BuildPdfToolsTab(tabPdfTools);

        tabs.TabPages.AddRange(new[] { tabPassport, tabDocs, tabIdCard, tabWatermark, tabOcr, tabPdfTools });

        Controls.Add(tabs);
        Controls.Add(header);
    }

    // =========================================================================
    // TAB 1: PASSPORT STUDIO & A4 PRINT
    // =========================================================================
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
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 345));

        var singleCard = CreateCard("সিঙ্গেল পাসপোর্ট প্রিভিউ (মাউস দিয়ে ড্র্যাগ করুন)");
        _lblAiStatus = new Label
        {
            Dock = DockStyle.Top,
            Height = 32,
            Text = "ছবি ইমপোর্ট করুন — মুখ, গলা ও ব্যাকগ্রাউন্ড অটো প্রসেস হবে",
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

        var sheetCard = CreateCard("মূল পেপার সাজানো ও লাইভ প্রিভিউ (Print Ready)");
        _lblSheetMeta = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 26,
            Text = "পেজ: 210×297 mm (সোজা) • ছবি: 35×45 mm (সোজা)",
            ForeColor = Color.FromArgb(71, 85, 105),
            TextAlign = ContentAlignment.MiddleCenter
        };
        _pbSheet = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(226, 232, 240)
        };
        sheetCard.Controls.Add(_pbSheet);
        sheetCard.Controls.Add(_lblSheetMeta);

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

        var btnImport = CreateAccentButton("📁 ছবি ইমপোর্ট করুন", 304);
        btnImport.Click += (s, e) => ImportPassportImage();
        flow.Controls.Add(btnImport);

        var genderBox = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 8, 0, 4) };
        _rbMale = new RadioButton { Text = "👨 ছেলে", Checked = true, AutoSize = true };
        _rbFemale = new RadioButton { Text = "👩 মেয়ে", AutoSize = true };
        _rbMale.CheckedChanged += (s, e) => { if (_rbMale.Checked && _analysis != null) { _analysis.IsFemale = false; RenderPassportAll(); } };
        _rbFemale.CheckedChanged += (s, e) => { if (_rbFemale.Checked && _analysis != null) { _analysis.IsFemale = true; RenderPassportAll(); } };
        var btnRotatePhoto = CreateOutlineButton("↻ ৯০°", 68);
        btnRotatePhoto.Click += (s, e) => RotatePassportPhoto();
        var btnAutoFrame = CreateOutlineButton("✨ রিসেট", 84);
        btnAutoFrame.Click += (s, e) => { _panX = 0; _panY = 0; _userZoom = 1f; _tbZoom.Value = 100; RenderPassportAll(); };
        genderBox.Controls.AddRange(new Control[] { _rbMale, _rbFemale, btnRotatePhoto, btnAutoFrame });
        flow.Controls.Add(genderBox);

        flow.Controls.Add(CreateFieldLabel("🪪 পাসপোর্ট ছবির সাইজ (Preset & mm):"));
        _cbPreset = new ComboBox { Width = 304, DropDownStyle = ComboBoxStyle.DropDownList };
        foreach (var p in _presets) _cbPreset.Items.Add(p.Label);
        _cbPreset.SelectedIndex = 0;
        _cbPreset.SelectedIndexChanged += (s, e) =>
        {
            int idx = _cbPreset.SelectedIndex;
            if (idx >= 0 && idx < _presets.Length - 1)
            {
                var pr = _presets[idx];
                _photoMmW = _photoLandscape ? Math.Max(pr.WidthMm, pr.HeightMm) : Math.Min(pr.WidthMm, pr.HeightMm);
                _photoMmH = _photoLandscape ? Math.Min(pr.WidthMm, pr.HeightMm) : Math.Max(pr.WidthMm, pr.HeightMm);
                SyncDimensionControls();
                RenderPassportAll();
            }
        };
        flow.Controls.Add(_cbPreset);

        var photoOrRow = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 4, 0, 2) };
        _rbPhotoPortrait = new RadioButton { Text = "🧍 ছবি সোজা (Portrait)", Checked = true, AutoSize = true };
        _rbPhotoLandscape = new RadioButton { Text = "🖼️ ল্যান্ডস্কিপ", AutoSize = true };
        _rbPhotoPortrait.CheckedChanged += (s, e) => { if (!_suppressUiSync && _rbPhotoPortrait.Checked) SetPhotoOrientation(false); };
        _rbPhotoLandscape.CheckedChanged += (s, e) => { if (!_suppressUiSync && _rbPhotoLandscape.Checked) SetPhotoOrientation(true); };
        photoOrRow.Controls.AddRange(new Control[] { _rbPhotoPortrait, _rbPhotoLandscape });
        flow.Controls.Add(photoOrRow);

        var photoMmRow = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 2, 0, 4) };
        _numPhotoW = new NumericUpDown { Width = 80, Minimum = 12, Maximum = 250, DecimalPlaces = 1, Value = 35 };
        _numPhotoH = new NumericUpDown { Width = 80, Minimum = 12, Maximum = 250, DecimalPlaces = 1, Value = 45 };
        var btnApplyPhotoMm = CreateOutlineButton("ছবি mm সেট", 104);
        btnApplyPhotoMm.Click += (s, e) =>
        {
            _photoMmW = (float)_numPhotoW.Value;
            _photoMmH = (float)_numPhotoH.Value;
            _photoLandscape = _photoMmW > _photoMmH;
            SyncDimensionControls();
            RenderPassportAll();
        };
        photoMmRow.Controls.AddRange(new Control[] { _numPhotoW, new Label { Text = "×", AutoSize = true, Padding = new Padding(2, 6, 2, 0) }, _numPhotoH, btnApplyPhotoMm });
        flow.Controls.Add(photoMmRow);

        flow.Controls.Add(CreateFieldLabel("👔 ফরমাল স্যুট ও পোশাক (Auto Suit):"));
        _cbSuit = new ComboBox { Width = 304, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbSuit.Items.AddRange(new object[] { "কোনো স্যুট নয়", "মেনস ব্ল্যাক স্যুট ও টাই", "মেনস নেভি ব্লু স্যুট", "ওমেনস ডার্ক ব্লেজার" });
        _cbSuit.SelectedIndex = 0;
        _cbSuit.SelectedIndexChanged += (s, e) => RenderPassportAll();
        flow.Controls.Add(_cbSuit);

        flow.Controls.Add(CreateFieldLabel("🔍 জুম অ্যাডজাস্ট:"));
        _tbZoom = new TrackBar { Width = 304, Minimum = 50, Maximum = 240, Value = 100, TickFrequency = 15 };
        _tbZoom.Scroll += (s, e) => { _userZoom = _tbZoom.Value / 100f; RenderPassportAll(); };
        flow.Controls.Add(_tbZoom);

        flow.Controls.Add(CreateFieldLabel("🎨 AI ব্যাকগ্রাউন্ড রিমুভার ও কালার:"));
        _chkReplaceBg = new CheckBox
        {
            Text = "✨ অটো ব্যাকগ্রাউন্ড রিমুভ সক্রিয়",
            Checked = true,
            AutoSize = true,
            ForeColor = _teal,
            Margin = new Padding(0, 2, 0, 4)
        };
        _chkReplaceBg.CheckedChanged += (s, e) => { _replaceBg = _chkReplaceBg.Checked; RenderPassportAll(); };
        flow.Controls.Add(_chkReplaceBg);

        var bgFlow = new FlowLayoutPanel { Width = 304, AutoSize = true };
        void AddBgBtn(string txt, Color col)
        {
            var b = CreateOutlineButton(txt, 70);
            b.Click += (s, e) => { _bgColor = col; _replaceBg = true; _chkReplaceBg.Checked = true; RenderPassportAll(); };
            bgFlow.Controls.Add(b);
        }
        AddBgBtn("⬜ সাদা", Color.White);
        AddBgBtn("🟦 আকাশি", Color.FromArgb(56, 189, 248));
        AddBgBtn("🔵 নেভি", Color.FromArgb(29, 78, 216));
        var btnOrigBg = CreateOutlineButton("আসল", 68);
        btnOrigBg.Click += (s, e) => { _replaceBg = false; _chkReplaceBg.Checked = false; RenderPassportAll(); };
        bgFlow.Controls.Add(btnOrigBg);
        flow.Controls.Add(bgFlow);

        flow.Controls.Add(CreateFieldLabel("📄 মূল পেপার সাইজ ও দিক (Custom Sheet):"));
        _cbPaper = new ComboBox { Width = 304, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbPaper.Items.AddRange(new object[] { "A4 (210×297 mm)", "4x6 (102×152 mm)", "5x7 (127×178 mm)", "Legal (216×356 mm)", "Custom (কাস্টম পেজ mm)" });
        _cbPaper.SelectedIndex = 0;
        _cbPaper.SelectedIndexChanged += (s, e) =>
        {
            if (_suppressUiSync) return;
            float[][] papers = { new[] { 210f, 297f }, new[] { 101.6f, 152.4f }, new[] { 127f, 177.8f }, new[] { 215.9f, 355.6f } };
            int idx = _cbPaper.SelectedIndex;
            if (idx >= 0 && idx < papers.Length)
            {
                _sheetMmW = _sheetLandscape ? Math.Max(papers[idx][0], papers[idx][1]) : Math.Min(papers[idx][0], papers[idx][1]);
                _sheetMmH = _sheetLandscape ? Math.Min(papers[idx][0], papers[idx][1]) : Math.Max(papers[idx][0], papers[idx][1]);
                SyncDimensionControls();
                RenderSheetOnly();
            }
        };
        flow.Controls.Add(_cbPaper);

        var sheetOrRow = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 4, 0, 2) };
        _rbSheetPortrait = new RadioButton { Text = "📄 পেজ সোজা (Portrait)", Checked = true, AutoSize = true };
        _rbSheetLandscape = new RadioButton { Text = "📐 ল্যান্ডস্কিপ", AutoSize = true };
        _rbSheetPortrait.CheckedChanged += (s, e) => { if (!_suppressUiSync && _rbSheetPortrait.Checked) SetSheetOrientation(false); };
        _rbSheetLandscape.CheckedChanged += (s, e) => { if (!_suppressUiSync && _rbSheetLandscape.Checked) SetSheetOrientation(true); };
        sheetOrRow.Controls.AddRange(new Control[] { _rbSheetPortrait, _rbSheetLandscape });
        flow.Controls.Add(sheetOrRow);

        var sheetMmRow = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 2, 0, 4) };
        _numSheetW = new NumericUpDown { Width = 80, Minimum = 40, Maximum = 600, DecimalPlaces = 1, Value = 210 };
        _numSheetH = new NumericUpDown { Width = 80, Minimum = 40, Maximum = 600, DecimalPlaces = 1, Value = 297 };
        var btnApplySheetMm = CreateOutlineButton("পেজ mm সেট", 104);
        btnApplySheetMm.Click += (s, e) =>
        {
            _sheetMmW = (float)_numSheetW.Value;
            _sheetMmH = (float)_numSheetH.Value;
            _sheetLandscape = _sheetMmW > _sheetMmH;
            SyncDimensionControls();
            RenderSheetOnly();
        };
        sheetMmRow.Controls.AddRange(new Control[] { _numSheetW, new Label { Text = "×", AutoSize = true, Padding = new Padding(2, 6, 2, 0) }, _numSheetH, btnApplySheetMm });
        flow.Controls.Add(sheetMmRow);

        flow.Controls.Add(CreateFieldLabel("এক লাইনে কয়টা ছবি (Photos/Row):"));
        _cbPerRow = new ComboBox { Width = 304, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbPerRow.Items.AddRange(new object[] { "2", "3", "4", "5", "6", "7", "8" });
        _cbPerRow.SelectedIndex = 3;
        _cbPerRow.SelectedIndexChanged += (s, e) => RenderSheetOnly();
        flow.Controls.Add(_cbPerRow);

        flow.Controls.Add(CreateFieldLabel("সারির সংখ্যা (Rows):"));
        _cbRows = new ComboBox { Width = 304, DropDownStyle = ComboBoxStyle.DropDownList };
        _cbRows.Items.AddRange(new object[] { "1 সারি", "2 সারি", "3 সারি", "4 সারি", "5 সারি", "পুরো পেপার পূর্ণ" });
        _cbRows.SelectedIndex = 1;
        _cbRows.SelectedIndexChanged += (s, e) => RenderSheetOnly();
        flow.Controls.Add(_cbRows);

        var chkRow = new FlowLayoutPanel { Width = 304, AutoSize = true, Margin = new Padding(0, 4, 0, 4) };
        _chkCutLines = new CheckBox { Text = "কাটার দাগ", Checked = true, AutoSize = true };
        _chkBorder = new CheckBox { Text = "বর্ডার", Checked = true, AutoSize = true };
        _chkCutLines.CheckedChanged += (s, e) => RenderSheetOnly();
        _chkBorder.CheckedChanged += (s, e) => RenderSheetOnly();
        chkRow.Controls.AddRange(new Control[] { _chkCutLines, _chkBorder });
        flow.Controls.Add(chkRow);

        _chkTileLandscape = new CheckBox
        {
            Text = "📐 শিটে ছবি ল্যান্ডস্কিপ (৯০° শায়িত — Portrait A4-এ ৪টি/লাইন)",
            Checked = false,
            AutoSize = false,
            Width = 304,
            Height = 36
        };
        _chkTileLandscape.CheckedChanged += (s, e) =>
        {
            if (_chkTileLandscape.Checked && _cbPerRow.SelectedIndex == 3) _cbPerRow.SelectedIndex = 2;
            else if (!_chkTileLandscape.Checked && _cbPerRow.SelectedIndex == 2) _cbPerRow.SelectedIndex = 3;
            RenderSheetOnly();
        };
        flow.Controls.Add(_chkTileLandscape);

        var btnPrintNow = CreateAccentButton("🖨️ সরাসরি প্রিন্ট আউট (Print A4)", 304);
        btnPrintNow.Margin = new Padding(0, 8, 0, 4);
        btnPrintNow.Click += (s, e) => PrintBitmap(_a4SheetBmp);
        flow.Controls.Add(btnPrintNow);

        var exportRow = new FlowLayoutPanel { Width = 304, AutoSize = true };
        var btnPdf = CreateOutlineButton("📄 A4 PDF", 96);
        btnPdf.Click += (s, e) => SavePassportPdf();
        var btnJpg = CreateOutlineButton("🖼️ JPG", 96);
        btnJpg.Click += (s, e) => SaveImageFile(_a4SheetBmp, "camlab_Passport_Sheet.jpg", ImageFormat.Jpeg);
        var btnPng = CreateOutlineButton("💾 PNG", 96);
        btnPng.Click += (s, e) => SaveImageFile(_singlePassportBmp, "camlab_Passport_Single.png", ImageFormat.Png);
        exportRow.Controls.AddRange(new Control[] { btnPdf, btnJpg, btnPng });
        flow.Controls.Add(exportRow);

        ctrlPanel.Controls.Add(flow);

        split.Controls.Add(singleCard, 0, 0);
        split.Controls.Add(sheetCard, 1, 0);
        split.Controls.Add(ctrlPanel, 2, 0);
        page.Controls.Add(split);
    }

    // =========================================================================
    // TAB 2: DOCUMENT SCANNER & PDF
    // =========================================================================
    private void BuildDocumentTab(TabPage page)
    {
        var topBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 94,
            BackColor = Color.White,
            Padding = new Padding(10, 6, 10, 6)
        };

        var btnAddDocs = CreateAccentButton("📁 ছবি যোগ করুন", 130);
        btnAddDocs.Click += (s, e) => ImportDocPages();

        var btnAutoCrop = CreateOutlineButton("✂️ অটো ক্রপ", 92);
        btnAutoCrop.Click += (s, e) => AutoCropCurrentDoc();

        var btnBookSplit = CreateOutlineButton("📖 বুক স্প্লিট", 104);
        btnBookSplit.Click += (s, e) => SplitBookCurrentDoc();

        var btnEraser = CreateOutlineButton("🧹 ইরেজার", 86);
        btnEraser.Click += (s, e) => SmartEraseCurrentDoc();

        var btnOrig = CreateOutlineButton("আসল", 60);
        btnOrig.Click += (s, e) => SetDocFilter(0);
        var btnMagic = CreateOutlineButton("✨ ম্যাজিক", 88);
        btnMagic.Click += (s, e) => SetDocFilter(1);
        var btnBw = CreateOutlineButton("B&W", 58);
        btnBw.Click += (s, e) => SetDocFilter(2);
        var btnBw2 = CreateOutlineButton("B&W2", 62);
        btnBw2.Click += (s, e) => SetDocFilter(4);
        var btnGray = CreateOutlineButton("গ্রে", 56);
        btnGray.Click += (s, e) => SetDocFilter(3);
        var btnLight = CreateOutlineButton("উজ্জ্বল", 64);
        btnLight.Click += (s, e) => SetDocFilter(5);
        var btnRot = CreateOutlineButton("↻ ৯০°", 64);
        btnRot.Click += (s, e) => RotateCurrentDoc();

        var btnPrev = CreateOutlineButton("◀", 38);
        btnPrev.Click += (s, e) => { if (_docCurrentIndex > 0) { _docCurrentIndex--; RefreshDocPreview(); } };
        var btnNext = CreateOutlineButton("▶", 38);
        btnNext.Click += (s, e) => { if (_docCurrentIndex < _docFilteredPages.Count - 1) { _docCurrentIndex++; RefreshDocPreview(); } };
        var btnDel = CreateOutlineButton("🗑️", 42);
        btnDel.Click += (s, e) => DeleteCurrentDocPage();

        var btnSavePdf = CreateAccentButton("📄 PDF সেভ করুন", 132);
        btnSavePdf.Click += (s, e) => SaveDocsPdf();
        var btnLongImg = CreateOutlineButton("🖼️ লং ইমেজ", 98);
        btnLongImg.Click += (s, e) => SaveDocsLongImage();
        var btnPrintDoc = CreateOutlineButton("🖨️ প্রিন্ট", 80);
        btnPrintDoc.Click += (s, e) => PrintBitmap(_docFilteredPages.Count > 0 ? _docFilteredPages[_docCurrentIndex] : null);

        _lblDocCount = new Label { Text = "0 পেজ", AutoSize = true, Padding = new Padding(8, 8, 0, 0), ForeColor = _teal, Font = new Font("Segoe UI", 10f, FontStyle.Bold) };

        topBar.Controls.AddRange(new Control[]
        {
            btnAddDocs, btnAutoCrop, btnBookSplit, btnEraser, btnOrig, btnMagic, btnBw, btnBw2, btnGray, btnLight, btnRot,
            btnPrev, btnNext, btnDel, btnSavePdf, btnLongImg, btnPrintDoc, _lblDocCount
        });

        _pbDocPreview = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(241, 245, 249)
        };

        page.Controls.Add(_pbDocPreview);
        page.Controls.Add(topBar);
    }

    private void SplitBookCurrentDoc()
    {
        if (_docRawPages.Count == 0) { MessageBox.Show("আগে একটি বইয়ের পেজ যোগ করুন!"); return; }
        var halves = NativeEngine.SplitBookPages(_docRawPages[_docCurrentIndex]);
        if (halves.Length == 2)
        {
            _docRawPages[_docCurrentIndex].Dispose();
            _docFilteredPages[_docCurrentIndex].Dispose();
            _docRawPages[_docCurrentIndex] = halves[0];
            _docFilteredPages[_docCurrentIndex] = NativeEngine.ApplyDocFilter(halves[0], _docFilterMode);
            _docRawPages.Insert(_docCurrentIndex + 1, halves[1]);
            _docFilteredPages.Insert(_docCurrentIndex + 1, NativeEngine.ApplyDocFilter(halves[1], _docFilterMode));
            RefreshDocPreview();
            MessageBox.Show("📖 বইয়ের বাম ও ডান পেজ ২ ভাগে আলাদা করা হয়েছে!", "camlab");
        }
    }

    private void SmartEraseCurrentDoc()
    {
        if (_docFilteredPages.Count == 0) { MessageBox.Show("আগে একটি ডকুমেন্ট যোগ করুন!"); return; }
        var cleaned = NativeEngine.SmartEraseClean(_docFilteredPages[_docCurrentIndex]);
        _docFilteredPages[_docCurrentIndex].Dispose();
        _docFilteredPages[_docCurrentIndex] = cleaned;
        RefreshDocPreview();
    }

    private void SaveDocsLongImage()
    {
        if (_docFilteredPages.Count == 0) { MessageBox.Show("প্রথমে ডকুমেন্ট ছবি যোগ করুন!"); return; }
        using var stitched = NativeEngine.StitchLongImage(_docFilteredPages);
        SaveImageFile(stitched, $"camlab_LongImage_{DateTime.Now:yyyyMMdd_HHmm}.jpg", ImageFormat.Jpeg);
    }

    // =========================================================================
    // TAB 3: ID CARD (2-SIDE A4)
    // =========================================================================
    private void BuildIdCardTab(TabPage page)
    {
        var split = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1
        };
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));

        var leftCol = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2
        };
        leftCol.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        leftCol.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        // Front Card Box
        var frontCard = CreateCard("📷 সামনের দিক (Front Side)");
        var frontBar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(4) };
        var btnFrontImp = CreateAccentButton("📁 সামনের ছবি নিন", 160);
        btnFrontImp.Click += (s, e) => ImportIdCardSide(true);
        var btnFrontCrop = CreateOutlineButton("✂️ অটো ক্রপ", 105);
        btnFrontCrop.Click += (s, e) => { if (_idFrontBmp != null) { _idFrontBmp = NativeEngine.AutoCropDocument(_idFrontBmp); _pbIdFront.Image = _idFrontBmp; RefreshIdCardSheet(); } };
        var btnFrontRot = CreateOutlineButton("↻ ৯০°", 75);
        btnFrontRot.Click += (s, e) => { if (_idFrontBmp != null) { _idFrontBmp.RotateFlip(RotateFlipType.Rotate90FlipNone); _pbIdFront.Image = _idFrontBmp; RefreshIdCardSheet(); } };
        frontBar.Controls.AddRange(new Control[] { btnFrontImp, btnFrontCrop, btnFrontRot });
        _pbIdFront = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.FromArgb(241, 245, 249) };
        frontCard.Controls.Add(_pbIdFront);
        frontCard.Controls.Add(frontBar);

        // Back Card Box
        var backCard = CreateCard("📷 পেছনের দিক (Back Side)");
        var backBar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(4) };
        var btnBackImp = CreateAccentButton("📁 পেছনের ছবি নিন", 160);
        btnBackImp.Click += (s, e) => ImportIdCardSide(false);
        var btnBackCrop = CreateOutlineButton("✂️ অটো ক্রপ", 105);
        btnBackCrop.Click += (s, e) => { if (_idBackBmp != null) { _idBackBmp = NativeEngine.AutoCropDocument(_idBackBmp); _pbIdBack.Image = _idBackBmp; RefreshIdCardSheet(); } };
        var btnBackRot = CreateOutlineButton("↻ ৯০°", 75);
        btnBackRot.Click += (s, e) => { if (_idBackBmp != null) { _idBackBmp.RotateFlip(RotateFlipType.Rotate90FlipNone); _pbIdBack.Image = _idBackBmp; RefreshIdCardSheet(); } };
        backBar.Controls.AddRange(new Control[] { btnBackImp, btnBackCrop, btnBackRot });
        _pbIdBack = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.FromArgb(241, 245, 249) };
        backCard.Controls.Add(_pbIdBack);
        backCard.Controls.Add(backBar);

        leftCol.Controls.Add(frontCard, 0, 0);
        leftCol.Controls.Add(backCard, 0, 1);

        // Right Column: A4 Sheet Preview + Export
        var rightCard = CreateCard("📄 A4 শিট প্রিভিউ (২-সাইড প্রিন্ট রেডি)");
        var rightBottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 52, Padding = new Padding(8) };
        var btnIdPdf = CreateAccentButton("📄 A4 PDF সংরক্ষণ করুন", 190);
        btnIdPdf.Click += (s, e) =>
        {
            if (_idSheetBmp == null) RefreshIdCardSheet();
            if (_idSheetBmp == null) return;
            using var sfd = new SaveFileDialog { Filter = "PDF Files|*.pdf", FileName = $"camlab_IDCard_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            SimplePdfWriter.SaveBitmapsAsPdf(new[] { _idSheetBmp }, sfd.FileName, 210.0, 297.0);
            SaveCopyToVault(sfd.FileName);
            MessageBox.Show("✅ আইডি কার্ড A4 PDF সংরক্ষিত হয়েছে!", "camlab");
        };
        var btnIdJpg = CreateOutlineButton("🖼️ JPG সংরক্ষণ", 130);
        btnIdJpg.Click += (s, e) =>
        {
            if (_idSheetBmp == null) RefreshIdCardSheet();
            SaveImageFile(_idSheetBmp, "camlab_IDCard_A4.jpg", ImageFormat.Jpeg);
        };
        var btnIdPrint = CreateOutlineButton("🖨️ সরাসরি প্রিন্ট", 130);
        btnIdPrint.Click += (s, e) =>
        {
            if (_idSheetBmp == null) RefreshIdCardSheet();
            PrintBitmap(_idSheetBmp);
        };
        _lblIdStatus = new Label { Text = "সামনের ও পেছনের ছবি যোগ করুন", AutoSize = true, Padding = new Padding(8, 10, 0, 0), ForeColor = _teal };
        rightBottom.Controls.AddRange(new Control[] { btnIdPdf, btnIdJpg, btnIdPrint, _lblIdStatus });

        _pbIdSheet = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.FromArgb(226, 232, 240) };
        rightCard.Controls.Add(_pbIdSheet);
        rightCard.Controls.Add(rightBottom);

        split.Controls.Add(leftCol, 0, 0);
        split.Controls.Add(rightCard, 1, 0);
        page.Controls.Add(split);

        RefreshIdCardSheet();
    }

    private void ImportIdCardSide(bool isFront)
    {
        using var ofd = new OpenFileDialog { Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;
        var loaded = NativeEngine.LoadBitmapOriented(ofd.FileName, 1800);
        var cropped = NativeEngine.AutoCropDocument(loaded);
        loaded.Dispose();
        var filtered = NativeEngine.ApplyDocFilter(cropped, 1);
        cropped.Dispose();

        if (isFront)
        {
            _idFrontBmp?.Dispose();
            _idFrontBmp = filtered;
            _pbIdFront.Image = _idFrontBmp;
        }
        else
        {
            _idBackBmp?.Dispose();
            _idBackBmp = filtered;
            _pbIdBack.Image = _idBackBmp;
        }
        RefreshIdCardSheet();
    }

    private void RefreshIdCardSheet()
    {
        var next = NativeEngine.ComposeIdCardSheet(_idFrontBmp, _idBackBmp);
        _idSheetBmp?.Dispose();
        _idSheetBmp = next;
        if (_pbIdSheet != null) _pbIdSheet.Image = _idSheetBmp;
        int cnt = (_idFrontBmp != null ? 1 : 0) + (_idBackBmp != null ? 1 : 0);
        if (_lblIdStatus != null) _lblIdStatus.Text = $"সেট করা হয়েছে: {cnt}/২ দিক";
    }

    // =========================================================================
    // TAB 4: WATERMARK & SIGNATURE STUDIO
    // =========================================================================
    private void BuildWatermarkTab(TabPage page)
    {
        var split = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1
        };
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 360));

        var previewCard = CreateCard("🖼️ ওয়াটারমার্ক ও সিগনেচার লাইভ প্রিভিউ");
        _pbWmPreview = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(241, 245, 249)
        };
        previewCard.Controls.Add(_pbWmPreview);

        var ctrlPanel = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, AutoScroll = true, Padding = new Padding(14) };
        var flow = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };

        var btnImp = CreateAccentButton("📁 ছবি / ডকুমেন্ট ইমপোর্ট করুন", 315);
        btnImp.Click += (s, e) =>
        {
            using var ofd = new OpenFileDialog { Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
            if (ofd.ShowDialog() != DialogResult.OK) return;
            _wmRawBmp?.Dispose();
            _wmRawBmp = NativeEngine.LoadBitmapOriented(ofd.FileName, 2000);
            UpdateWatermarkPreview();
        };
        flow.Controls.Add(btnImp);

        flow.Controls.Add(CreateFieldLabel("✍️ ওয়াটারমার্কের টেক্সট:"));
        _txtWmText = new TextBox { Width = 315, Text = "CONFIDENTIAL • camlab", Font = new Font("Segoe UI", 10f) };
        _txtWmText.TextChanged += (s, e) => UpdateWatermarkPreview();
        flow.Controls.Add(_txtWmText);

        flow.Controls.Add(CreateFieldLabel("📍 অবস্থান (Placement):"));
        var placeRow = new FlowLayoutPanel { Width = 315, AutoSize = true };
        var btnDiag = CreateOutlineButton("↗ তির্যক", 98);
        btnDiag.Click += (s, e) => { _wmPlacement = 0; UpdateWatermarkPreview(); };
        var btnCenter = CreateOutlineButton("⊕ মাঝখানে", 102);
        btnCenter.Click += (s, e) => { _wmPlacement = 1; UpdateWatermarkPreview(); };
        var btnCorner = CreateOutlineButton("↘ কোণে", 98);
        btnCorner.Click += (s, e) => { _wmPlacement = 2; UpdateWatermarkPreview(); };
        placeRow.Controls.AddRange(new Control[] { btnDiag, btnCenter, btnCorner });
        flow.Controls.Add(placeRow);

        flow.Controls.Add(CreateFieldLabel("🎨 ওয়াটারমার্কের রং:"));
        var colRow = new FlowLayoutPanel { Width = 315, AutoSize = true };
        void AddWmCol(string label, Color c)
        {
            var b = CreateOutlineButton(label, 74);
            b.Click += (s, e) => { _wmColor = c; UpdateWatermarkPreview(); };
            colRow.Controls.Add(b);
        }
        AddWmCol("🔵 নীল", Color.FromArgb(29, 78, 216));
        AddWmCol("🔴 লাল", Color.FromArgb(220, 38, 38));
        AddWmCol("⬛ কালো", Color.Black);
        AddWmCol("⬜ সাদা", Color.White);
        flow.Controls.Add(colRow);

        _lblWmOpacity = CreateFieldLabel("অস্বচ্ছতা (Opacity): 45%");
        flow.Controls.Add(_lblWmOpacity);
        _tbWmOpacity = new TrackBar { Width = 315, Minimum = 10, Maximum = 100, Value = 45, TickFrequency = 10 };
        _tbWmOpacity.Scroll += (s, e) => { _lblWmOpacity.Text = $"অস্বচ্ছতা (Opacity): {_tbWmOpacity.Value}%"; UpdateWatermarkPreview(); };
        flow.Controls.Add(_tbWmOpacity);

        _lblWmFontSize = CreateFieldLabel("ফন্ট সাইজ: 32 pt");
        flow.Controls.Add(_lblWmFontSize);
        _tbWmFontSize = new TrackBar { Width = 315, Minimum = 14, Maximum = 90, Value = 32, TickFrequency = 10 };
        _tbWmFontSize.Scroll += (s, e) => { _lblWmFontSize.Text = $"ফন্ট সাইজ: {_tbWmFontSize.Value} pt"; UpdateWatermarkPreview(); };
        flow.Controls.Add(_tbWmFontSize);

        flow.Controls.Add(CreateFieldLabel("✒️ মাউস দিয়ে ডিজিটাল সিগনেচার আঁকুন:"));
        _pbSignaturePad = new PictureBox
        {
            Width = 315,
            Height = 110,
            BackColor = Color.FromArgb(248, 250, 252),
            BorderStyle = BorderStyle.FixedSingle,
            Cursor = Cursors.Cross
        };
        _pbSignaturePad.Paint += (s, e) =>
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(15, 23, 42), 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            foreach (var stroke in _sigStrokes)
            {
                if (stroke.Count < 2) continue;
                var pts = stroke.Select(p => new PointF(p.X * _pbSignaturePad.Width, p.Y * _pbSignaturePad.Height)).ToArray();
                e.Graphics.DrawLines(pen, pts);
            }
        };
        _pbSignaturePad.MouseDown += (s, e) =>
        {
            _drawingSig = true;
            _currentStroke = new List<PointF> { new((float)e.X / _pbSignaturePad.Width, (float)e.Y / _pbSignaturePad.Height) };
            _sigStrokes.Add(_currentStroke);
        };
        _pbSignaturePad.MouseMove += (s, e) =>
        {
            if (!_drawingSig || _currentStroke == null) return;
            float nx = Math.Clamp((float)e.X / _pbSignaturePad.Width, 0f, 1f);
            float ny = Math.Clamp((float)e.Y / _pbSignaturePad.Height, 0f, 1f);
            _currentStroke.Add(new PointF(nx, ny));
            _pbSignaturePad.Invalidate();
        };
        _pbSignaturePad.MouseUp += (s, e) =>
        {
            _drawingSig = false;
            UpdateWatermarkPreview();
        };
        flow.Controls.Add(_pbSignaturePad);

        var btnClearSig = CreateOutlineButton("🗑️ সিগনেচার মুছুন", 315);
        btnClearSig.Click += (s, e) => { _sigStrokes.Clear(); _pbSignaturePad.Invalidate(); UpdateWatermarkPreview(); };
        flow.Controls.Add(btnClearSig);

        flow.Controls.Add(CreateFieldLabel("💮 অফিশিয়াল সিল ও স্মার্ট ইরেজার:"));
        var stampRow = new FlowLayoutPanel { Width = 315, AutoSize = true };
        void AddStampBtn(string txt, string stampKey)
        {
            var b = CreateOutlineButton(txt, 98);
            b.Click += (s, e) =>
            {
                if (_wmRawBmp == null) { MessageBox.Show("প্রথমে ছবি ইমপোর্ট করুন!"); return; }
                var next = NativeEngine.DrawOfficialStamp(_wmRawBmp, stampKey);
                _wmRawBmp.Dispose();
                _wmRawBmp = next;
                UpdateWatermarkPreview();
            };
            stampRow.Controls.Add(b);
        }
        AddStampBtn("✅ APPROVED", "APPROVED");
        AddStampBtn("🛡️ VERIFIED", "VERIFIED");
        AddStampBtn("💳 PAID", "PAID");
        flow.Controls.Add(stampRow);

        var btnWmEraser = CreateOutlineButton("🧹 স্মার্ট ইরেজার (দাগ ও ছায়া পরিষ্কার)", 315);
        btnWmEraser.Click += (s, e) =>
        {
            if (_wmRawBmp == null) { MessageBox.Show("প্রথমে ছবি ইমপোর্ট করুন!"); return; }
            var cleaned = NativeEngine.SmartEraseClean(_wmRawBmp);
            _wmRawBmp.Dispose();
            _wmRawBmp = cleaned;
            UpdateWatermarkPreview();
        };
        flow.Controls.Add(btnWmEraser);

        var expRow = new FlowLayoutPanel { Width = 315, AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        var btnWmPdf = CreateAccentButton("📄 PDF সেভ", 102);
        btnWmPdf.Click += (s, e) =>
        {
            if (_wmProcessedBmp == null) { MessageBox.Show("প্রথমে ছবি ইমপোর্ট করুন!"); return; }
            using var sfd = new SaveFileDialog { Filter = "PDF|*.pdf", FileName = $"camlab_Watermarked_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            SimplePdfWriter.SaveBitmapsAsPdf(new[] { _wmProcessedBmp }, sfd.FileName, 210.0, 297.0);
            SaveCopyToVault(sfd.FileName);
            MessageBox.Show("✅ ওয়াটারমার্ক PDF সংরক্ষিত হয়েছে!", "camlab");
        };
        var btnWmJpg = CreateOutlineButton("🖼️ JPG সেভ", 102);
        btnWmJpg.Click += (s, e) => SaveImageFile(_wmProcessedBmp, "camlab_Watermarked.jpg", ImageFormat.Jpeg);
        var btnWmPrint = CreateOutlineButton("🖨️ প্রিন্ট", 96);
        btnWmPrint.Click += (s, e) => PrintBitmap(_wmProcessedBmp);
        expRow.Controls.AddRange(new Control[] { btnWmPdf, btnWmJpg, btnWmPrint });
        flow.Controls.Add(expRow);

        ctrlPanel.Controls.Add(flow);
        split.Controls.Add(previewCard, 0, 0);
        split.Controls.Add(ctrlPanel, 1, 0);
        page.Controls.Add(split);
    }

    private void UpdateWatermarkPreview()
    {
        if (_wmRawBmp == null) return;
        var next = NativeEngine.ApplyWatermarkAndSignature(
            _wmRawBmp,
            _txtWmText.Text,
            _wmPlacement,
            _wmColor,
            _tbWmOpacity.Value,
            _tbWmFontSize.Value,
            _sigStrokes,
            Color.FromArgb(15, 23, 42));
        _wmProcessedBmp?.Dispose();
        _wmProcessedBmp = next;
        _pbWmPreview.Image = _wmProcessedBmp;
    }

    // =========================================================================
    // TAB 5: OCR TEXT READER
    // =========================================================================
    private void BuildOcrTab(TabPage page)
    {
        var topBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 54,
            BackColor = Color.White,
            Padding = new Padding(10, 8, 10, 8)
        };

        var btnOcrImp = CreateAccentButton("📁 ছবি ইমপোর্ট করুন", 175);
        btnOcrImp.Click += (s, e) => ImportAndRunOcr();

        var btnOcrRun = CreateOutlineButton("🔍 পুনরায় OCR চালান", 155);
        btnOcrRun.Click += (s, e) => RunOcrNow();

        var btnOcrCopy = CreateAccentButton("📋 টেক্সট কপি করুন", 150);
        btnOcrCopy.Click += (s, e) =>
        {
            if (string.IsNullOrWhiteSpace(_txtOcrResult.Text)) return;
            Clipboard.SetText(_txtOcrResult.Text);
            MessageBox.Show("✅ টেক্সট ক্লিপবোর্ডে কপি করা হয়েছে!", "camlab");
        };

        var btnOcrTxt = CreateOutlineButton("💾 TXT সেভ", 92);
        btnOcrTxt.Click += (s, e) =>
        {
            if (string.IsNullOrWhiteSpace(_txtOcrResult.Text)) return;
            using var sfd = new SaveFileDialog { Filter = "Text File|*.txt", FileName = $"camlab_OCR_{DateTime.Now:yyyyMMdd_HHmm}.txt" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            File.WriteAllText(sfd.FileName, _txtOcrResult.Text, Encoding.UTF8);
            SaveCopyToVault(sfd.FileName);
            MessageBox.Show("✅ TXT ফাইল সংরক্ষিত হয়েছে!", "camlab");
        };

        var btnOcrDoc = CreateOutlineButton("📝 Word (.doc)", 110);
        btnOcrDoc.Click += (s, e) =>
        {
            if (string.IsNullOrWhiteSpace(_txtOcrResult.Text)) return;
            using var sfd = new SaveFileDialog { Filter = "Word Document|*.doc", FileName = $"camlab_Word_{DateTime.Now:yyyyMMdd_HHmm}.doc" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            string safeBody = System.Net.WebUtility.HtmlEncode(_txtOcrResult.Text).Replace("\n", "<br/>");
            string html = $"<html><head><meta charset='utf-8'></head><body style='font-family:Segoe UI,Arial;padding:24pt;'><h2 style='color:#00896C;'>camlab OCR Document</h2><p>{safeBody}</p></body></html>";
            File.WriteAllText(sfd.FileName, html, Encoding.UTF8);
            SaveCopyToVault(sfd.FileName);
            MessageBox.Show("✅ Word (.doc) ফাইল সংরক্ষিত হয়েছে!", "camlab");
        };

        var btnOcrCsv = CreateOutlineButton("📊 Excel (.csv)", 110);
        btnOcrCsv.Click += (s, e) =>
        {
            if (string.IsNullOrWhiteSpace(_txtOcrResult.Text)) return;
            using var sfd = new SaveFileDialog { Filter = "CSV Spreadsheet|*.csv", FileName = $"camlab_Excel_{DateTime.Now:yyyyMMdd_HHmm}.csv" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            var sb = new StringBuilder("\uFEFFRow,Text\n");
            int r = 1;
            foreach (var line in _txtOcrResult.Text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
                sb.Append(r++).Append(",\"").Append(line.Replace("\"", "\"\"")).AppendLine("\"");
            File.WriteAllText(sfd.FileName, sb.ToString(), Encoding.UTF8);
            SaveCopyToVault(sfd.FileName);
            MessageBox.Show("✅ Excel (.csv) ফাইল সংরক্ষিত হয়েছে!", "camlab");
        };

        var btnOcrQr = CreateOutlineButton("🏁 QR তৈরি", 92);
        btnOcrQr.Click += (s, e) =>
        {
            string txt = string.IsNullOrWhiteSpace(_txtOcrResult.Text) ? _txtOcrSearch.Text : _txtOcrResult.Text;
            var qr = NativeEngine.GenerateQrBitmap(txt, 600);
            _ocrSourceBmp?.Dispose();
            _ocrSourceBmp = qr;
            _pbOcrPreview.Image = _ocrSourceBmp;
            SaveImageFile(qr, $"camlab_QR_{DateTime.Now:yyyyMMdd_HHmm}.png", ImageFormat.Png);
        };

        _txtOcrSearch = new TextBox { Width = 140, PlaceholderText = "টেক্সটে খুঁজুন...", Font = new Font("Segoe UI", 10f), Margin = new Padding(8, 4, 4, 0) };
        var btnFind = CreateOutlineButton("🔍 খুঁজুন", 74);
        btnFind.Click += (s, e) =>
        {
            string q = _txtOcrSearch.Text.Trim();
            if (string.IsNullOrEmpty(q) || string.IsNullOrEmpty(_txtOcrResult.Text)) return;
            int idx = _txtOcrResult.Text.IndexOf(q, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                _txtOcrResult.Focus();
                _txtOcrResult.Select(idx, q.Length);
                _txtOcrResult.ScrollToCaret();
            }
            else MessageBox.Show($"\"{q}\" পাওয়া যায়নি।", "camlab");
        };

        _lblOcrStatus = new Label { Text = "অফলাইন OCR, Word, Excel ও QR জেনারেটর", AutoSize = true, Padding = new Padding(8, 8, 0, 0), ForeColor = _teal };

        topBar.Controls.AddRange(new Control[] { btnOcrImp, btnOcrRun, btnOcrCopy, btnOcrTxt, btnOcrDoc, btnOcrCsv, btnOcrQr, _txtOcrSearch, btnFind, _lblOcrStatus });

        var split = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));

        var imgCard = CreateCard("🖼️ সোর্স ডকুমেন্ট / ছবি");
        _pbOcrPreview = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.FromArgb(241, 245, 249) };
        imgCard.Controls.Add(_pbOcrPreview);

        var txtCard = CreateCard("📝 এক্সট্র্যাক্ট করা টেক্সট (এডিট ও কপি করা যাবে)");
        _txtOcrResult = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            Font = new Font("Segoe UI", 11f),
            BackColor = Color.White
        };
        txtCard.Controls.Add(_txtOcrResult);

        split.Controls.Add(imgCard, 0, 0);
        split.Controls.Add(txtCard, 1, 0);

        page.Controls.Add(split);
        page.Controls.Add(topBar);
    }

    private void ImportAndRunOcr()
    {
        using var ofd = new OpenFileDialog { Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;
        _ocrSourceBmp?.Dispose();
        _ocrSourceBmp = NativeEngine.LoadBitmapOriented(ofd.FileName, 2000);
        _pbOcrPreview.Image = _ocrSourceBmp;
        RunOcrNow();
    }

    private async void RunOcrNow()
    {
        if (_ocrSourceBmp == null) { MessageBox.Show("প্রথমে একটি ছবি ইমপোর্ট করুন!"); return; }
        _lblOcrStatus.Text = "⏳ অফলাইন OCR চলছে...";
        var bmpCopy = new Bitmap(_ocrSourceBmp);
        string text = await Task.Run(() =>
        {
            try { return NativeEngine.ExtractTextOcrOffline(bmpCopy); }
            finally { bmpCopy.Dispose(); }
        });
        _txtOcrResult.Text = text;
        int words = string.IsNullOrWhiteSpace(text) ? 0 : text.Split(new[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Length;
        _lblOcrStatus.Text = $"✅ OCR সম্পন্ন ({words} শব্দ)";
    }

    // =========================================================================
    // TAB 6: PDF TOOLS & SAVED FILES VAULT
    // =========================================================================
    private void BuildPdfToolsTab(TabPage page)
    {
        var split = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));

        // Left: PDF Merge & Compress Tools
        var toolsCard = CreateCard("📑 মাল্টি-ইমেজ PDF মার্জার ও কম্প্রেসর");
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(12), AutoScroll = true };

        var btnAddImgs = CreateAccentButton("📂 একাধিক ছবি নির্বাচন করুন (Add Pages)", 340);
        btnAddImgs.Click += (s, e) =>
        {
            using var ofd = new OpenFileDialog { Multiselect = true, Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
            if (ofd.ShowDialog() != DialogResult.OK) return;
            foreach (string f in ofd.FileNames)
            {
                var bmp = NativeEngine.LoadBitmapOriented(f, 1800);
                _pdfToolPages.Add(bmp);
            }
            _lblPdfToolCount.Text = $"নির্বাচিত পেজ সংখ্যা: {_pdfToolPages.Count} টি";
            _lblPdfToolStatus.Text = $"✅ {ofd.FileNames.Length} টি নতুন পেজ যুক্ত হয়েছে।";
        };
        flow.Controls.Add(btnAddImgs);

        _lblPdfToolCount = new Label { Text = "নির্বাচিত পেজ সংখ্যা: 0 টি", AutoSize = true, Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = _teal, Margin = new Padding(0, 12, 0, 8) };
        flow.Controls.Add(_lblPdfToolCount);

        var btnClearPages = CreateOutlineButton("🗑️ সব পেজ ক্লিয়ার করুন", 200);
        btnClearPages.Click += (s, e) =>
        {
            foreach (var b in _pdfToolPages) b.Dispose();
            _pdfToolPages.Clear();
            _lblPdfToolCount.Text = "নির্বাচিত পেজ সংখ্যা: 0 টি";
            _lblPdfToolStatus.Text = "সব পেজ সরানো হয়েছে।";
        };
        flow.Controls.Add(btnClearPages);

        flow.Controls.Add(CreateFieldLabel("📑 একত্রিত হাই-কোয়ালিটি PDF তৈরি:"));
        var btnMerge = CreateAccentButton("📑 মার্জ করে এক ফাইলে PDF সেভ করুন", 340);
        btnMerge.Click += (s, e) =>
        {
            if (_pdfToolPages.Count == 0) { MessageBox.Show("প্রথমে ছবি যোগ করুন!"); return; }
            using var sfd = new SaveFileDialog { Filter = "PDF|*.pdf", FileName = $"camlab_Merged_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            SimplePdfWriter.SaveBitmapsAsPdf(_pdfToolPages, sfd.FileName, 210.0, 297.0, 92L);
            SaveCopyToVault(sfd.FileName);
            long kb = new FileInfo(sfd.FileName).Length / 1024;
            _lblPdfToolStatus.Text = $"✅ মার্জড PDF তৈরি হয়েছে ({kb} KB)";
            MessageBox.Show($"✅ {_pdfToolPages.Count} পেজের PDF সেভ হয়েছে ({kb} KB)!", "camlab");
        };
        flow.Controls.Add(btnMerge);

        _lblPdfQuality = CreateFieldLabel("🗜️ PDF কম্প্রেশন কোয়ালিটি: 65%");
        flow.Controls.Add(_lblPdfQuality);
        _tbPdfQuality = new TrackBar { Width = 340, Minimum = 15, Maximum = 95, Value = 65, TickFrequency = 10 };
        _tbPdfQuality.Scroll += (s, e) => _lblPdfQuality.Text = $"🗜️ PDF কম্প্রেশন কোয়ালিটি: {_tbPdfQuality.Value}%";
        flow.Controls.Add(_tbPdfQuality);

        var btnCompress = CreateOutlineButton("🗜️ কম্প্রেস করে ছোট সাইজের PDF সেভ করুন", 340);
        btnCompress.Click += (s, e) =>
        {
            if (_pdfToolPages.Count == 0) { MessageBox.Show("প্রথমে ছবি যোগ করুন!"); return; }
            using var sfd = new SaveFileDialog { Filter = "PDF|*.pdf", FileName = $"camlab_Compressed_{_tbPdfQuality.Value}pct_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
            if (sfd.ShowDialog() != DialogResult.OK) return;
            SimplePdfWriter.SaveBitmapsAsPdf(_pdfToolPages, sfd.FileName, 210.0, 297.0, _tbPdfQuality.Value);
            SaveCopyToVault(sfd.FileName);
            long kb = new FileInfo(sfd.FileName).Length / 1024;
            _lblPdfToolStatus.Text = $"✅ কম্প্রেসড PDF তৈরি হয়েছে ({kb} KB • {_tbPdfQuality.Value}% গুণমান)";
            MessageBox.Show($"✅ কম্প্রেসড PDF সংরক্ষিত হয়েছে ({kb} KB)!", "camlab");
        };
        flow.Controls.Add(btnCompress);

        var extraToolsRow = new FlowLayoutPanel { Width = 340, AutoSize = true, Margin = new Padding(0, 8, 0, 0) };
        var btnStitchTool = CreateOutlineButton("🖼️ লং ইমেজ স্টিচ", 164);
        btnStitchTool.Click += (s, e) =>
        {
            if (_pdfToolPages.Count == 0) { MessageBox.Show("প্রথমে ছবি যোগ করুন!"); return; }
            using var longImg = NativeEngine.StitchLongImage(_pdfToolPages);
            SaveImageFile(longImg, $"camlab_LongStitch_{DateTime.Now:yyyyMMdd_HHmm}.jpg", ImageFormat.Jpeg);
        };
        var btnSplitTool = CreateOutlineButton("✂️ আলাদা PDF স্প্লিট", 164);
        btnSplitTool.Click += (s, e) =>
        {
            if (_pdfToolPages.Count == 0) { MessageBox.Show("প্রথমে ছবি যোগ করুন!"); return; }
            string vault = GetVaultDir();
            for (int i = 0; i < _pdfToolPages.Count; i++)
            {
                string path = Path.Combine(vault, $"camlab_Split_P{i + 1}_{DateTime.Now:HHmmss}.pdf");
                SimplePdfWriter.SaveBitmapsAsPdf(new[] { _pdfToolPages[i] }, path, 210.0, 297.0, 90L);
            }
            RefreshVaultList();
            MessageBox.Show($"✅ {_pdfToolPages.Count}টি আলাদা PDF ফাইল সংরক্ষিত হয়েছে!", "camlab");
        };
        extraToolsRow.Controls.AddRange(new Control[] { btnStitchTool, btnSplitTool });
        flow.Controls.Add(extraToolsRow);

        _lblPdfToolStatus = new Label { Text = "একাধিক ছবি একসাথে একটি PDF-এ মার্জ বা কম্প্রেস করুন।", AutoSize = true, ForeColor = Color.FromArgb(100, 116, 139), Margin = new Padding(0, 14, 0, 0) };
        flow.Controls.Add(_lblPdfToolStatus);
        toolsCard.Controls.Add(flow);

        // Right: Saved Files Vault (Downloads/camlab)
        var vaultCard = CreateCard("📁 সংরক্ষিত ফাইলসমূহ (Downloads\\camlab)");
        var vaultBar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(6) };
        var btnOpenSel = CreateAccentButton("📂 ফাইল খুলুন", 130);
        btnOpenSel.Click += (s, e) => OpenSelectedVaultFile();
        var btnRefreshVault = CreateOutlineButton("🔄 রিফ্রেশ", 95);
        btnRefreshVault.Click += (s, e) => RefreshVaultList();
        var btnDelVault = CreateOutlineButton("🗑️ মুছুন", 90);
        btnDelVault.Click += (s, e) => DeleteSelectedVaultFile();
        vaultBar.Controls.AddRange(new Control[] { btnOpenSel, btnRefreshVault, btnDelVault });

        _lstVaultFiles = new ListBox
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 10f),
            IntegralHeight = false
        };
        _lstVaultFiles.DoubleClick += (s, e) => OpenSelectedVaultFile();

        vaultCard.Controls.Add(_lstVaultFiles);
        vaultCard.Controls.Add(vaultBar);

        split.Controls.Add(toolsCard, 0, 0);
        split.Controls.Add(vaultCard, 1, 0);
        page.Controls.Add(split);
    }

    private void RefreshVaultList()
    {
        if (_lstVaultFiles == null) return;
        _lstVaultFiles.Items.Clear();
        _vaultFileInfos.Clear();
        try
        {
            var dir = new DirectoryInfo(GetVaultDir());
            var files = dir.GetFiles().OrderByDescending(f => f.LastWriteTime).Take(50).ToArray();
            foreach (var f in files)
            {
                _vaultFileInfos.Add(f);
                long kb = Math.Max(1, f.Length / 1024);
                _lstVaultFiles.Items.Add($"📄 {f.Name}   ({kb} KB • {f.LastWriteTime:dd MMM hh:mm tt})");
            }
        }
        catch { }
    }

    private void OpenSelectedVaultFile()
    {
        int idx = _lstVaultFiles.SelectedIndex;
        if (idx < 0 || idx >= _vaultFileInfos.Count) return;
        try
        {
            Process.Start(new ProcessStartInfo(_vaultFileInfos[idx].FullName) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show("ফাইল খোলা যায়নি: " + ex.Message);
        }
    }

    private void DeleteSelectedVaultFile()
    {
        int idx = _lstVaultFiles.SelectedIndex;
        if (idx < 0 || idx >= _vaultFileInfos.Count) return;
        var f = _vaultFileInfos[idx];
        if (MessageBox.Show($"{f.Name} মুছে ফেলতে চান?", "camlab", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
        {
            try { f.Delete(); } catch { }
            RefreshVaultList();
        }
    }

    // =========================================================================
    // SHARED HELPERS & HANDLERS
    // =========================================================================
    private void SyncDimensionControls()
    {
        _suppressUiSync = true;
        _numPhotoW.Value = (decimal)Math.Clamp(_photoMmW, 12f, 250f);
        _numPhotoH.Value = (decimal)Math.Clamp(_photoMmH, 12f, 250f);
        _rbPhotoPortrait.Checked = !_photoLandscape;
        _rbPhotoLandscape.Checked = _photoLandscape;

        _numSheetW.Value = (decimal)Math.Clamp(_sheetMmW, 40f, 600f);
        _numSheetH.Value = (decimal)Math.Clamp(_sheetMmH, 40f, 600f);
        _rbSheetPortrait.Checked = !_sheetLandscape;
        _rbSheetLandscape.Checked = _sheetLandscape;
        _lblSheetMeta.Text = $"পেজ: {_sheetMmW:0.#}×{_sheetMmH:0.#} mm ({(_sheetLandscape ? "ল্যান্ডস্কিপ" : "সোজা")})  •  ছবি: {_photoMmW:0.#}×{_photoMmH:0.#} mm ({(_photoLandscape ? "ল্যান্ডস্কিপ" : "সোজা")})";
        _suppressUiSync = false;
    }

    private void SetPhotoOrientation(bool landscape)
    {
        float minD = Math.Min(_photoMmW, _photoMmH);
        float maxD = Math.Max(_photoMmW, _photoMmH);
        _photoLandscape = landscape;
        if (Math.Abs(minD - maxD) >= 0.5f)
        {
            _photoMmW = landscape ? maxD : minD;
            _photoMmH = landscape ? minD : maxD;
        }
        SyncDimensionControls();
        RenderPassportAll();
    }

    private void SetSheetOrientation(bool landscape)
    {
        float minD = Math.Min(_sheetMmW, _sheetMmH);
        float maxD = Math.Max(_sheetMmW, _sheetMmH);
        _sheetLandscape = landscape;
        if (Math.Abs(minD - maxD) >= 0.5f)
        {
            _sheetMmW = landscape ? maxD : minD;
            _sheetMmH = landscape ? minD : maxD;
        }
        SyncDimensionControls();
        RenderSheetOnly();
    }

    private void RotatePassportPhoto()
    {
        if (_rawPassportBmp == null) return;
        _rawPassportBmp.RotateFlip(RotateFlipType.Rotate90FlipNone);
        _analysis = NativeEngine.AnalyzePortrait(_rawPassportBmp);
        _cutoutPassportBmp?.Dispose();
        _cutoutPassportBmp = NativeEngine.ExtractForegroundCutout(_rawPassportBmp, _analysis);
        _panX = 0; _panY = 0;
        RenderPassportAll();
    }

    private void ImportPassportImage()
    {
        using var ofd = new OpenFileDialog { Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;

        _rawPassportBmp?.Dispose();
        _rawPassportBmp = NativeEngine.LoadBitmapOriented(ofd.FileName, 1600);
        _analysis = NativeEngine.AnalyzePortrait(_rawPassportBmp);
        _cutoutPassportBmp?.Dispose();
        _cutoutPassportBmp = NativeEngine.ExtractForegroundCutout(_rawPassportBmp, _analysis);
        _panX = 0; _panY = 0; _userZoom = 1.0f; _tbZoom.Value = 100;

        _rbFemale.Checked = _analysis.IsFemale;
        _rbMale.Checked = !_analysis.IsFemale;
        _lblAiStatus.Text = $"{(_analysis.FaceDetected ? "✓ হিউমান ও মুখ শনাক্ত" : "✓ ম্যানুয়াল ফ্রেম")} • {_analysis.GenderLabel}";
        _lblAttire.Text = _analysis.AttireLabel;

        RenderPassportAll();
    }

    private void RenderPassportAll()
    {
        if (_rawPassportBmp == null || _analysis == null) return;
        int pxW = Math.Max(150, (int)Math.Round((_photoMmW / 25.4f) * 300f));
        int pxH = Math.Max(150, (int)Math.Round((_photoMmH / 25.4f) * 300f));

        var nextSingle = NativeEngine.RenderPassportPhoto(
            _rawPassportBmp, _analysis, pxW, pxH, _userZoom, _panX, _panY, _cbSuit.SelectedIndex, _bgColor, _replaceBg, _cutoutPassportBmp);
        _singlePassportBmp?.Dispose();
        _singlePassportBmp = nextSingle;
        _pbSingle.Image = _singlePassportBmp;

        RenderSheetOnly();
    }

    private void RenderSheetOnly()
    {
        if (_singlePassportBmp == null) return;
        int perRow = int.TryParse(_cbPerRow.SelectedItem?.ToString(), out int p) ? p : 5;
        int rows = _cbRows.SelectedIndex == 5 ? 0 : (_cbRows.SelectedIndex + 1);

        var nextSheet = NativeEngine.ComposePrintSheet(
            _singlePassportBmp, _photoMmW, _photoMmH, _sheetMmW, _sheetMmH, perRow, rows, _chkCutLines.Checked, _chkBorder.Checked, _chkTileLandscape.Checked);
        _a4SheetBmp?.Dispose();
        _a4SheetBmp = nextSheet;
        _pbSheet.Image = _a4SheetBmp;
    }

    private void SavePassportPdf()
    {
        if (_a4SheetBmp == null) { MessageBox.Show("প্রথমে একটি ছবি ইমপোর্ট করুন!"); return; }
        using var sfd = new SaveFileDialog { Filter = "PDF Files|*.pdf", FileName = $"camlab_Passport_{Math.Round(_sheetMmW)}x{Math.Round(_sheetMmH)}mm.pdf" };
        if (sfd.ShowDialog() != DialogResult.OK) return;

        SimplePdfWriter.SaveBitmapsAsPdf(new[] { _a4SheetBmp }, sfd.FileName, _sheetMmW, _sheetMmH);
        SaveCopyToVault(sfd.FileName);
        MessageBox.Show("✅ PDF সফলভাবে সংরক্ষিত হয়েছে!", "camlab");
    }

    private void SaveImageFile(Bitmap? bmp, string defaultName, ImageFormat fmt)
    {
        if (bmp == null) { MessageBox.Show("প্রথমে একটি ছবি ইমপোর্ট করুন!"); return; }
        using var sfd = new SaveFileDialog { Filter = fmt.Equals(ImageFormat.Png) ? "PNG|*.png" : "JPEG|*.jpg", FileName = defaultName };
        if (sfd.ShowDialog() != DialogResult.OK) return;
        bmp.Save(sfd.FileName, fmt);
        SaveCopyToVault(sfd.FileName);
        MessageBox.Show("✅ ছবি সংরক্ষিত হয়েছে!", "camlab");
    }

    private void ImportDocPages()
    {
        using var ofd = new OpenFileDialog { Multiselect = true, Filter = "Images|*.jpg;*.jpeg;*.png;*.bmp;*.webp" };
        if (ofd.ShowDialog() != DialogResult.OK) return;

        foreach (string f in ofd.FileNames)
        {
            var raw = NativeEngine.LoadBitmapOriented(f, 1800);
            _docRawPages.Add(raw);
            _docFilteredPages.Add(NativeEngine.ApplyDocFilter(raw, _docFilterMode));
            _docCurrentIndex = _docFilteredPages.Count - 1;
        }
        RefreshDocPreview();
    }

    private void AutoCropCurrentDoc()
    {
        if (_docRawPages.Count == 0) return;
        var cropped = NativeEngine.AutoCropDocument(_docRawPages[_docCurrentIndex]);
        _docRawPages[_docCurrentIndex].Dispose();
        _docRawPages[_docCurrentIndex] = cropped;
        SetDocFilter(_docFilterMode);
    }

    private void SetDocFilter(int mode)
    {
        _docFilterMode = mode;
        if (_docRawPages.Count == 0) return;
        _docFilteredPages[_docCurrentIndex]?.Dispose();
        _docFilteredPages[_docCurrentIndex] = NativeEngine.ApplyDocFilter(_docRawPages[_docCurrentIndex], mode);
        RefreshDocPreview();
    }

    private void RotateCurrentDoc()
    {
        if (_docRawPages.Count == 0) return;
        _docRawPages[_docCurrentIndex].RotateFlip(RotateFlipType.Rotate90FlipNone);
        SetDocFilter(_docFilterMode);
    }

    private void DeleteCurrentDocPage()
    {
        if (_docRawPages.Count == 0) return;
        _docRawPages[_docCurrentIndex].Dispose();
        _docFilteredPages[_docCurrentIndex].Dispose();
        _docRawPages.RemoveAt(_docCurrentIndex);
        _docFilteredPages.RemoveAt(_docCurrentIndex);
        if (_docCurrentIndex >= _docFilteredPages.Count) _docCurrentIndex = Math.Max(0, _docFilteredPages.Count - 1);
        RefreshDocPreview();
    }

    private void RefreshDocPreview()
    {
        if (_docFilteredPages.Count == 0)
        {
            _lblDocCount.Text = "0 পেজ";
            _pbDocPreview.Image = null;
        }
        else
        {
            _docCurrentIndex = Math.Clamp(_docCurrentIndex, 0, _docFilteredPages.Count - 1);
            _lblDocCount.Text = $"পেজ {_docCurrentIndex + 1}/{_docFilteredPages.Count}";
            _pbDocPreview.Image = _docFilteredPages[_docCurrentIndex];
        }
    }

    private void SaveDocsPdf()
    {
        if (_docFilteredPages.Count == 0) { MessageBox.Show("প্রথমে ডকুমেন্ট ছবি যোগ করুন!"); return; }
        using var sfd = new SaveFileDialog { Filter = "PDF Files|*.pdf", FileName = $"camlab_Doc_{DateTime.Now:yyyyMMdd_HHmm}.pdf" };
        if (sfd.ShowDialog() != DialogResult.OK) return;
        SimplePdfWriter.SaveBitmapsAsPdf(_docFilteredPages, sfd.FileName, 210.0, 297.0);
        SaveCopyToVault(sfd.FileName);
        MessageBox.Show("✅ মাল্টি-পেজ A4 PDF সেভ সম্পন্ন হয়েছে!", "camlab");
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

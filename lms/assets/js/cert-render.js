/* =========================================================
   ANSHA MONTESSORI LMS — CERTIFICATE & MARKSHEET RENDERER
   Pure rendering functions shared by:
     - lms/admin/marksheets.html  (generate + save)
     - lms/verify.html            (public QR-scan view + re-download)

   Dependencies (must be loaded BEFORE this file):
     - jsPDF  (window.jspdf.jsPDF)
     - qrious (window.QRious)
   ========================================================= */

/* ── LMS root path ──────────────────────────────────────────
   Works for both deploy modes used by this project:
     - Repo-root publish (local dev):  /lms/admin/foo.html   → /lms/
     - lms/ as site root  (Netlify):   /admin/foo.html       → /
   Detected by walking up from the current page rather than
   hard-coding a "/lms/" segment.                            */
var LMS_ROOT = (function () {
  try {
    var p = window.location.pathname;
    // Inside an admin/teacher/student subfolder → root is the parent.
    var m = p.match(/^(.*\/)(admin|teacher|student)\//);
    if (m) return m[1];
    // Otherwise we're at the LMS root level (verify.html, index.html, ...).
    return p.replace(/[^/]*$/, '') || '/';
  } catch (e) { return '/'; }
})();

/* ── Where the QR code points (single source of truth) ─────
   Change this ONE line when the custom domain is set up.    */
var VERIFY_BASE_URL = (function () {
  // Same-origin verify page — works on Netlify, custom domain, localhost
  // without needing a build-time replace.
  try {
    return window.location.origin + LMS_ROOT + 'verify.html';
  } catch (e) {
    return 'https://radiant-naiad-98e62b.netlify.app/lms/verify.html';
  }
})();

/* ── Course catalogue ──────────────────────────────────────
   Add new courses by extending this object. Each course
   declares whether it has a per-subject marksheet, the cert
   number prefix, the cert template image, and the subject
   list used on the marksheet.                                */
var COURSES = {
  'AMD': {
    code: 'AMD',
    name: 'Advance Montessori Diploma',
    fullName: 'ADVANCE MONTESSORI DIPLOMA',
    certPrefix: 'IW/AMD',
    hasMarks: false,
    template: 'assets/certificates/cert-amd-template.jpg',  // resolved against LMS_ROOT
    subjects: []
  },
  'MTE-PP': {
    code: 'MTE-PP',
    name: 'Diploma in Montessori Teacher Education (Pre-Primary)',
    fullName: 'Diploma in Montessori Teacher Education (Pre-Primary)',
    certPrefix: 'IW/MTE-PP',
    hasMarks: true,
    template: 'assets/certificates/cert-amd-template.jpg',  // resolved against LMS_ROOT
    subjects: [
      { code: 'MTE-01', name: 'Communicative English & Computer Fundamentals', max: 100 },
      { code: 'MTE-02', name: 'Child Psychology & Development',                max: 100 },
      { code: 'MTE-03', name: 'Montessori Teaching Methods & Aids',            max: 100 },
      { code: 'MTE-04', name: 'School & Personal Management',                  max: 100 },
      { code: 'MTE-05', name: 'Health, Nutrition & Physical Education',        max: 100 },
      { code: 'MTE-06', name: 'General Knowledge & Moral Science',             max: 100 },
      { code: 'MTE-07', name: 'Practical (Apparatus Demonstration)',           max: 100 }
    ]
  }
};

/* ── Grading scale (per the marksheet template) ─────────── */
function calculateDivision(percentage) {
  if (percentage <= 39)  return 'FAIL';
  if (percentage === 40) return 'THIRD CLASS';
  if (percentage <= 59)  return 'SECOND CLASS';
  if (percentage <= 79)  return 'FIRST CLASS';
  return 'DISTINCTION';
}

/* ── Number-to-words for DOB (lightweight, India-friendly) ── */
function numberToWords(n) {
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
              'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen',
              'Eighteen','Nineteen'];
  var tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function below100(x) {
    if (x < 20) return ones[x];
    return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
  }
  function below1000(x) {
    if (x < 100) return below100(x);
    return ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + below100(x % 100) : '');
  }
  if (n === 0) return 'Zero';
  var thousands = Math.floor(n / 1000);
  var rest      = n % 1000;
  var parts = [];
  if (thousands) parts.push(below1000(thousands) + ' Thousand');
  if (rest)      parts.push(below1000(rest));
  return parts.join(' ');
}

function dobToWords(isoDate) {
  if (!isoDate) return '';
  // isoDate: YYYY-MM-DD
  var parts = String(isoDate).split('-');
  if (parts.length !== 3) return '';
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  var months = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
  if (!y || !m || !d) return '';
  return numberToWords(d) + ' ' + months[m - 1] + ' ' + numberToWords(y);
}

function formatDateDDMMYYYY(isoDate) {
  if (!isoDate) return '';
  var parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

/* ── QR code → data URL ────────────────────────────────── */
function qrDataURL(text, size) {
  if (typeof QRious === 'undefined') {
    console.warn('QRious not loaded — QR code skipped');
    return null;
  }
  var qr = new QRious({
    value: text,
    size: size || 200,
    level: 'H',
    background: '#ffffff',
    foreground: '#000000'
  });
  return qr.toDataURL('image/png');
}

function buildVerifyURL(certNo) {
  return VERIFY_BASE_URL + '?cert=' + encodeURIComponent(certNo);
}

/* ─────────────────────────────────────────────────────────
   CERTIFICATE OF COMPLETION (image overlay)
   Layout coordinates target an A4-landscape JPG (842×595 pt).
   Adjust the COORDS block once the template image is dropped
   in if any text lands in the wrong spot.
   ───────────────────────────────────────────────────────── */
var CERT_COORDS = {
  pageW: 842,
  pageH: 595,
  // Big gold cursive name in the centre
  nameY:        273,
  nameMaxWidth: 520,
  nameSize:     44,
  nameColor:    [184, 134, 11],   // #B8860B-ish gold (overrides if you prefer navy)
  // Bottom-left detail block (after the printed labels)
  detailLabelX: 138,              // x of the value (right of "Certificate No. :")
  certNoY:      438,
  issueDateY:   460,
  studentIdY:   482,
  placeY:       504,
  // Centre "Duration: ___ to ___" line
  durationY:    372,
  // QR code (small square, bottom-left under labels)
  qrX: 66, qrY: 522, qrSize: 56
};

function resolveAsset(relPath) {
  // Treat templates as root-relative under LMS_ROOT so the same code works
  // from /lms/admin/* and /lms/verify.html alike.
  if (/^https?:/.test(relPath) || relPath.charAt(0) === '/') return relPath;
  return LMS_ROOT + relPath;
}

function loadImageDataURL(url) {
  var fullURL = resolveAsset(url);
  return fetch(fullURL + '?t=' + Date.now()).then(function (r) {
    if (!r.ok) throw new Error('Template not found at ' + fullURL + ' (' + r.status + ')');
    return r.blob();
  }).then(function (blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
}

/* Build a Certificate of Completion PDF.
   record: {
     courseCode, studentFullName, certificateNo, issueDate, enrollmentNo,
     centreCity, durationFrom, durationTo
   }                                                                       */
function buildCertificatePDF(record) {
  var course = COURSES[record.courseCode];
  if (!course) return Promise.reject(new Error('Unknown course: ' + record.courseCode));

  return loadImageDataURL(course.template).then(function (imgData) {
    var jsPDF = window.jspdf.jsPDF;
    var pdf   = new jsPDF({ orientation: 'landscape', unit: 'pt',
                            format: [CERT_COORDS.pageW, CERT_COORDS.pageH] });
    pdf.addImage(imgData, 'JPEG', 0, 0, CERT_COORDS.pageW, CERT_COORDS.pageH);

    // Name (gold, large, auto-shrink to fit)
    pdf.setTextColor.apply(pdf, CERT_COORDS.nameColor);
    pdf.setFont('times', 'italic');
    var fs = CERT_COORDS.nameSize;
    pdf.setFontSize(fs);
    var name = record.studentFullName || '';
    var tw = pdf.getTextWidth(name);
    while (tw > CERT_COORDS.nameMaxWidth && fs > 22) {
      fs--; pdf.setFontSize(fs); tw = pdf.getTextWidth(name);
    }
    pdf.text(name, CERT_COORDS.pageW / 2, CERT_COORDS.nameY, { align: 'center' });

    // Detail block — navy
    pdf.setTextColor(2, 49, 106);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(record.certificateNo || '',  CERT_COORDS.detailLabelX, CERT_COORDS.certNoY);
    pdf.text(formatDateDDMMYYYY(record.issueDate) || '',
                                          CERT_COORDS.detailLabelX, CERT_COORDS.issueDateY);
    pdf.text(record.enrollmentNo || record.studentId || '',
                                          CERT_COORDS.detailLabelX, CERT_COORDS.studentIdY);
    pdf.text(record.centreCity || 'Chennai, Tamil Nadu',
                                          CERT_COORDS.detailLabelX, CERT_COORDS.placeY);

    // Duration line — centre
    pdf.setFontSize(11);
    var durFrom = formatDateDDMMYYYY(record.durationFrom);
    var durTo   = formatDateDDMMYYYY(record.durationTo);
    if (durFrom || durTo) {
      pdf.text('Duration: ' + (durFrom || '____') + '   to   ' + (durTo || '____'),
               CERT_COORDS.pageW / 2, CERT_COORDS.durationY, { align: 'center' });
    }

    // QR code → verification URL
    var qrURL = qrDataURL(buildVerifyURL(record.certificateNo), 256);
    if (qrURL) {
      pdf.addImage(qrURL, 'PNG',
        CERT_COORDS.qrX, CERT_COORDS.qrY,
        CERT_COORDS.qrSize, CERT_COORDS.qrSize);
    }

    return pdf.output('blob');
  });
}

/* ─────────────────────────────────────────────────────────
   STATEMENT OF MARKS (table-based, A4 portrait)
   Drawn from scratch with jsPDF — no template image needed.
   ───────────────────────────────────────────────────────── */
function buildMarksheetPDF(record) {
  var course = COURSES[record.courseCode];
  if (!course) return Promise.reject(new Error('Unknown course: ' + record.courseCode));
  if (!course.hasMarks) {
    return Promise.reject(new Error(course.name + ' does not have a marksheet — generate certificate only.'));
  }

  var jsPDF = window.jspdf.jsPDF;
  var pdf   = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  var W = pdf.internal.pageSize.getWidth();   // 595
  var H = pdf.internal.pageSize.getHeight();  // 842

  var margin = 36;
  var navy   = [2, 49, 106];
  var gold   = [184, 134, 11];
  var grey   = [110, 110, 110];

  // ── Border ────────────────────────────────────────────
  pdf.setDrawColor.apply(pdf, navy);
  pdf.setLineWidth(1.5);
  pdf.rect(margin / 2, margin / 2, W - margin, H - margin);
  pdf.setLineWidth(0.5);
  pdf.rect(margin / 2 + 4, margin / 2 + 4, W - margin - 8, H - margin - 8);

  var y = margin + 10;

  // ── Header: institution names ──────────────────────────
  pdf.setTextColor.apply(pdf, navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('INSPIREWAY EDUCATIONAL SERVICES PRIVATE LIMITED', W / 2, y, { align: 'center' });
  y += 18;
  pdf.setTextColor.apply(pdf, gold);
  pdf.setFontSize(15);
  pdf.text('Ansha Montessori Teacher Training Institute', W / 2, y, { align: 'center' });
  y += 14;
  pdf.setTextColor.apply(pdf, grey);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('No. 9a Samiyar Garden, Kasturibai Nagar, Tambaram West, Chennai 600045   |   Tel: +91 9876543210   |   Email: info@inspireway.in',
           W / 2, y, { align: 'center' });
  y += 10;
  pdf.setDrawColor.apply(pdf, navy);
  pdf.setLineWidth(0.8);
  pdf.line(margin, y, W - margin, y);
  y += 18;

  // ── Title ──────────────────────────────────────────────
  pdf.setTextColor.apply(pdf, navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('STATEMENT OF MARKS', W / 2, y, { align: 'center' });
  y += 16;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(11);
  pdf.text(course.name, W / 2, y, { align: 'center' });
  y += 18;

  // ── Identity strip (4 columns) ─────────────────────────
  var stripCols = [
    { label: 'Enrollment No.',  value: record.enrollmentNo  || '—' },
    { label: 'Roll No.',        value: record.rollNo         || '—' },
    { label: 'Centre Code',     value: record.centreCode     || '—' },
    { label: 'Certificate No.', value: record.certificateNo  || '—' }
  ];
  var colW = (W - margin * 2) / stripCols.length;
  pdf.setFillColor(245, 247, 250);
  pdf.rect(margin, y, W - margin * 2, 36, 'F');
  pdf.setDrawColor(200, 210, 220);
  for (var i = 0; i <= stripCols.length; i++) {
    pdf.line(margin + colW * i, y, margin + colW * i, y + 36);
  }
  pdf.line(margin, y, W - margin, y);
  pdf.line(margin, y + 36, W - margin, y + 36);
  pdf.line(margin, y + 16, W - margin, y + 16);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor.apply(pdf, navy);
  for (var j = 0; j < stripCols.length; j++) {
    pdf.text(stripCols[j].label, margin + colW * j + colW / 2, y + 11, { align: 'center' });
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(20, 20, 20);
  for (var k = 0; k < stripCols.length; k++) {
    pdf.text(String(stripCols[k].value), margin + colW * k + colW / 2, y + 28, { align: 'center' });
  }
  y += 50;

  // ── Personal info table (2 columns: label / value) ────
  var infoRows = [
    ['This is to certify that', record.studentFullName || '—'],
    ['Daughter / Son of',       (record.fatherName || '—') + ' and ' + (record.motherName || '—')],
    ['Date of Birth',           record.dateOfBirth
                                  ? formatDateDDMMYYYY(record.dateOfBirth) + ' (' + dobToWords(record.dateOfBirth) + ')'
                                  : '—'],
    ['Has completed',           course.name + (record.duration ? ' — ' + record.duration : '')],
    ['Examination Held',        record.examinationHeld || '—'],
    ['Centre',                  'Ansha Montessori Teacher Training Institute, ' + (record.centreCity || 'Chennai')],
    ['Division Awarded',        record.divisionAwarded || '—']
  ];
  var infoLabelW = 150;
  var infoRowH   = 22;
  pdf.setDrawColor(200, 210, 220);
  for (var r = 0; r < infoRows.length; r++) {
    pdf.rect(margin, y, infoLabelW, infoRowH);
    pdf.rect(margin + infoLabelW, y, W - margin * 2 - infoLabelW, infoRowH);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor.apply(pdf, navy);
    pdf.text(infoRows[r][0], margin + 8, y + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(20, 20, 20);
    var val = String(infoRows[r][1]);
    var maxW = W - margin * 2 - infoLabelW - 16;
    var lines = pdf.splitTextToSize(val, maxW);
    pdf.text(lines[0] || '', margin + infoLabelW + 8, y + 14);
    y += infoRowH;
  }
  y += 10;

  // ── "Marks obtained..." preamble ──────────────────────
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9);
  pdf.setTextColor(60, 60, 60);
  pdf.text('Marks obtained by the candidate, subject-wise, are as under:', margin, y);
  y += 14;

  // ── Subjects table ─────────────────────────────────────
  var subjCols = [
    { key: 'idx',       label: '#',          w: 26  },
    { key: 'subject',   label: 'Subject',    w: 200 },
    { key: 'code',      label: 'Code',       w: 60  },
    { key: 'max',       label: 'Max',        w: 45  },
    { key: 'theory',    label: 'Theory',     w: 60  },
    { key: 'practical', label: 'Practical',  w: 60  },
    { key: 'total',     label: 'Total',      w: 70  }
  ];
  var totalSubjW = 0; subjCols.forEach(function (c) { totalSubjW += c.w; });
  var startX = margin + ((W - margin * 2) - totalSubjW) / 2;

  // Header row
  pdf.setFillColor.apply(pdf, navy);
  pdf.rect(startX, y, totalSubjW, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  var cx = startX;
  for (var c = 0; c < subjCols.length; c++) {
    pdf.text(subjCols[c].label, cx + subjCols[c].w / 2, y + 14, { align: 'center' });
    cx += subjCols[c].w;
  }
  y += 22;

  // Body rows — pull from record.marks (array) keyed by subject code
  var marksByCode = {};
  (record.marks || []).forEach(function (m) { marksByCode[m.code] = m; });

  pdf.setDrawColor(200, 210, 220);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(20, 20, 20);
  var grandTheory = 0, grandPractical = 0, grandTotal = 0, grandMax = 0;

  for (var s = 0; s < course.subjects.length; s++) {
    var subj = course.subjects[s];
    var entry = marksByCode[subj.code] || {};
    var theory    = (entry.theory    != null && entry.theory    !== '') ? entry.theory    : '';
    var practical = (entry.practical != null && entry.practical !== '') ? entry.practical : '';
    var total     = (entry.total     != null && entry.total     !== '')
                      ? entry.total
                      : (theory !== '' || practical !== '' ? (Number(theory || 0) + Number(practical || 0)) : '');

    if (total !== '')     grandTotal     += Number(total);
    if (theory !== '')    grandTheory    += Number(theory);
    if (practical !== '') grandPractical += Number(practical);
    grandMax += subj.max;

    var rowH = 22;
    pdf.rect(startX, y, totalSubjW, rowH);
    var ix = startX;
    for (var col = 0; col < subjCols.length; col++) {
      pdf.line(ix, y, ix, y + rowH);
      ix += subjCols[col].w;
    }
    pdf.line(W - margin - (W - margin * 2 - totalSubjW) / 2, y,
             W - margin - (W - margin * 2 - totalSubjW) / 2, y + rowH);

    var v = {
      idx: String(s + 1), subject: subj.name, code: subj.code,
      max: String(subj.max),
      theory:    theory    === '' ? '—' : String(theory),
      practical: practical === '' ? '—' : String(practical),
      total:     total     === '' ? '—' : String(total)
    };
    var px = startX;
    for (var col2 = 0; col2 < subjCols.length; col2++) {
      var key = subjCols[col2].key;
      var align = (key === 'subject') ? 'left' : 'center';
      var tx = (align === 'left') ? px + 6 : px + subjCols[col2].w / 2;
      // wrap subject name if needed
      var lines = pdf.splitTextToSize(v[key], subjCols[col2].w - 8);
      pdf.text(lines[0] || '', tx, y + 14, { align: align });
      px += subjCols[col2].w;
    }
    y += rowH;
  }

  // Grand total row
  pdf.setFillColor(240, 244, 250);
  pdf.rect(startX, y, totalSubjW, 24, 'F');
  pdf.rect(startX, y, totalSubjW, 24);
  var ix2 = startX;
  for (var col3 = 0; col3 < subjCols.length; col3++) {
    pdf.line(ix2, y, ix2, y + 24);
    ix2 += subjCols[col3].w;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor.apply(pdf, navy);
  // Span first 3 columns visually with the label
  var gtLabelW = subjCols[0].w + subjCols[1].w + subjCols[2].w;
  pdf.text('GRAND TOTAL & RESULT', startX + gtLabelW / 2, y + 15, { align: 'center' });
  // Max
  pdf.text(String(record.grandTotalMax || grandMax),
           startX + gtLabelW + subjCols[3].w / 2, y + 15, { align: 'center' });
  // Theory / Practical / Total grand sums
  pdf.text(String(grandTheory || '—'),
           startX + gtLabelW + subjCols[3].w + subjCols[4].w / 2, y + 15, { align: 'center' });
  pdf.text(String(grandPractical || '—'),
           startX + gtLabelW + subjCols[3].w + subjCols[4].w + subjCols[5].w / 2, y + 15, { align: 'center' });
  pdf.text(String(record.grandTotal || grandTotal || '—'),
           startX + gtLabelW + subjCols[3].w + subjCols[4].w + subjCols[5].w + subjCols[6].w / 2, y + 15, { align: 'center' });
  y += 32;

  // ── Grading scale ──────────────────────────────────────
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);
  pdf.text('Grading Scale: AA = Absent  |  ≤39% = Fail  |  40% = Third Class  |  41–59% = Second Class  |  60–79% = First Class  |  ≥80% = Distinction',
           W / 2, y, { align: 'center' });
  y += 22;

  // ── Signature block (3 columns) + QR (left) ───────────
  var sigY = y;
  var sigColW = (W - margin * 2 - 100) / 3;  // leave 100pt for QR on the left
  var qrSize = 80;

  // QR code on the left
  var qrURL = qrDataURL(buildVerifyURL(record.certificateNo), 280);
  if (qrURL) {
    pdf.addImage(qrURL, 'PNG', margin, sigY, qrSize, qrSize);
    pdf.setFontSize(7);
    pdf.setTextColor.apply(pdf, grey);
    pdf.text('Scan to verify', margin + qrSize / 2, sigY + qrSize + 9, { align: 'center' });
  }

  var sigStartX = margin + 100;
  var sigs = [
    { line1: 'Principal',                line2: 'Ansha Montessori Teacher',  line3: 'Training Institute' },
    { line1: 'Director',                 line2: 'Inspireway Educational',     line3: 'Services Pvt. Ltd.' },
    { line1: 'Controller of Examinations', line2: '(Authorised Signatory)',  line3: '' }
  ];
  pdf.setDrawColor(120, 130, 140);
  pdf.setLineWidth(0.5);
  for (var sg = 0; sg < sigs.length; sg++) {
    var sx = sigStartX + sigColW * sg;
    pdf.line(sx + 10, sigY + 50, sx + sigColW - 10, sigY + 50);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor.apply(pdf, navy);
    pdf.text(sigs[sg].line1, sx + sigColW / 2, sigY + 64, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(60, 60, 60);
    pdf.text(sigs[sg].line2, sx + sigColW / 2, sigY + 76, { align: 'center' });
    if (sigs[sg].line3) {
      pdf.text(sigs[sg].line3, sx + sigColW / 2, sigY + 86, { align: 'center' });
    }
  }
  y = sigY + qrSize + 18;

  // ── Place / Date ───────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor.apply(pdf, navy);
  pdf.text('Place:', margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(20, 20, 20);
  pdf.text(record.place || record.centreCity || 'Chennai', margin + 32, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor.apply(pdf, navy);
  pdf.text('Date:', margin + 240, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(20, 20, 20);
  pdf.text(formatDateDDMMYYYY(record.issueDate) || '—', margin + 270, y);
  y += 16;

  // ── Disclaimer ─────────────────────────────────────────
  pdf.setDrawColor(200, 210, 220);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, W - margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(80, 80, 80);
  var disclaimer = 'Disclaimer: This Statement of Marks is issued by Ansha Montessori Teacher Training Institute, a programme operated by Inspireway Educational Services Private Limited, on the institute’s own authority. It certifies completion of an in-house training programme. This document is not affiliated with, recognised by, or issued under the authority of NCTE, NCVET, NSDC, any State Government, the Government of India, or any statutory examining body, unless an explicit accreditation is printed alongside this seal. Verification: scan the QR code or contact the institute quoting the Certificate No.';
  var dLines = pdf.splitTextToSize(disclaimer, W - margin * 2);
  pdf.text(dLines, margin, y);

  return Promise.resolve(pdf.output('blob'));
}

/* ── Helper: download a Blob with a friendly filename ─── */
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}
function safeFilename(name) {
  return String(name || 'student').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
}

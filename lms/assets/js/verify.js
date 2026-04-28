/* =========================================================
   ANSHA MONTESSORI LMS — PUBLIC VERIFICATION PAGE
   No login required. Reads ?cert= from URL, queries the
   student_certificates table, displays read-only details,
   and offers PDF download (re-rendered on demand).
   ========================================================= */

(function () {

/* ── Read cert no from query string ─────────────────────── */
function getQueryParam(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

var certNo = getQueryParam('cert');

/* ── Supabase client (anon key, public access) ─────────── */
var SUPA_URL = 'https://twzcefikdychhsjwjekf.supabase.co';
var SUPA_KEY = 'sb_publishable_GijBRmulhuyIp3bigyhMUw_hVmQiB0y';
var sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);

var card = document.getElementById('v-card');

/* ── Render helpers ─────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderState(cls, icon, title, msg, extra) {
  card.innerHTML =
    '<div class="v-state ' + cls + '">' +
      '<div class="icon">' + icon + '</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(msg) + '</p>' +
      (extra || '') +
    '</div>';
}

function renderSearchPrompt() {
  renderState('warn', '🔎', 'Enter a Certificate Number',
    'Scan the QR code on a certificate, or paste the certificate number below.',
    '<div style="margin-top:18px;">' +
      '<form onsubmit="window._verifySearch(event)" class="v-search-box">' +
        '<input type="text" id="v-input" placeholder="e.g. IW/AMD/2026/0001" required>' +
        '<button class="v-btn v-btn-primary" type="submit">Verify</button>' +
      '</form>' +
    '</div>');
}

window._verifySearch = function (e) {
  e.preventDefault();
  var v = document.getElementById('v-input').value.trim();
  if (!v) return;
  window.location.search = '?cert=' + encodeURIComponent(v);
};

function renderRecord(row) {
  var statusOK = row.status === 'active';
  var courseLabel = row.course_name || row.course_code || '—';
  var div = (row.division_awarded || '').toLowerCase();
  var divClass = div.includes('distinction') ? 'dist'
              : div.includes('first')        ? 'first'
              : div.includes('second')       ? 'second'
              : div.includes('third')        ? 'third'
              : div.includes('fail')         ? 'fail'
              : '';

  var html = '';
  html +=
    '<div class="v-state ' + (statusOK ? 'ok' : 'warn') + '">' +
      '<div class="icon">' + (statusOK ? '✅' : '⚠️') + '</div>' +
      '<h2>' + (statusOK ? 'Certificate Verified' : 'Certificate Revoked') + '</h2>' +
      '<p>This document is ' +
        '<span class="badge-status ' + (statusOK ? 'badge-active' : 'badge-revoked') + '">' +
        (statusOK ? 'Active' : 'Revoked') + '</span> in the registry.</p>' +
    '</div>';

  html += '<div class="v-divider"></div>';

  html += '<div class="v-section-title">Certificate Details</div>';
  html += '<div class="v-row">';
  html += field('Certificate No.', row.certificate_no);
  html += field('Course',          courseLabel);
  html += field('Issue Date',      formatDateDDMMYYYY(row.issue_date));
  html += field('Place',           row.place);
  html += '</div>';

  html += '<div class="v-section-title">Student</div>';
  html += '<div class="v-row">';
  html += field('Full Name',       row.student_full_name);
  html += field('Father / Mother', [row.father_name, row.mother_name].filter(Boolean).join(' / '));
  html += field('Date of Birth',   formatDateDDMMYYYY(row.date_of_birth));
  html += field('Enrollment No.',  row.enrollment_no);
  html += field('Roll No.',        row.roll_no);
  html += field('Centre Code',     row.centre_code);
  html += field('Centre City',     row.centre_city);
  html += '</div>';

  if (row.duration_from || row.duration_to || row.examination_held) {
    html += '<div class="v-section-title">Programme</div>';
    html += '<div class="v-row">';
    html += field('Duration From',     formatDateDDMMYYYY(row.duration_from));
    html += field('Duration To',       formatDateDDMMYYYY(row.duration_to));
    html += field('Examination Held',  row.examination_held);
    html += '</div>';
  }

  // Marks (if present)
  if (Array.isArray(row.marks) && row.marks.length && row.grand_total_max) {
    html += '<div class="v-section-title">Statement of Marks</div>';
    html += '<table class="v-marks"><thead><tr>' +
              '<th>#</th><th>Subject</th><th>Code</th>' +
              '<th class="center">Max</th><th class="center">Theory</th>' +
              '<th class="center">Practical</th><th class="center">Total</th>' +
            '</tr></thead><tbody>';
    row.marks.forEach(function (m, i) {
      html += '<tr>' +
        '<td class="center">' + (i + 1) + '</td>' +
        '<td>' + esc(m.subject) + '</td>' +
        '<td>' + esc(m.code) + '</td>' +
        '<td class="center">' + esc(m.max) + '</td>' +
        '<td class="center">' + (m.theory != null ? esc(m.theory) : '—') + '</td>' +
        '<td class="center">' + (m.practical != null ? esc(m.practical) : '—') + '</td>' +
        '<td class="center">' + (m.total != null ? esc(m.total) : '—') + '</td>' +
      '</tr>';
    });
    var pct = row.grand_total_max
      ? ((row.grand_total / row.grand_total_max) * 100).toFixed(2)
      : null;
    html += '</tbody><tfoot>' +
      '<tr><td colspan="3" style="text-align:right">Grand Total</td>' +
      '<td class="center">' + esc(row.grand_total_max || '—') + '</td>' +
      '<td colspan="2" class="center">' + (pct != null ? pct + '%' : '—') + '</td>' +
      '<td class="center">' + esc(row.grand_total || '—') + '</td></tr>';
    if (row.division_awarded) {
      html += '<tr><td colspan="6" style="text-align:right">Division Awarded</td>' +
        '<td class="center"><span class="badge-div ' + divClass + '">' +
        esc(row.division_awarded) + '</span></td></tr>';
    }
    html += '</tfoot></table>';
  }

  // Actions
  html += '<div class="v-actions">' +
    '<button class="v-btn v-btn-primary"   onclick="window._dlCert()">⬇️ Download Certificate</button>' +
    (Array.isArray(row.marks) && row.marks.length
      ? '<button class="v-btn v-btn-primary" onclick="window._dlMarks()">⬇️ Download Marksheet</button>'
      : '') +
    '<button class="v-btn v-btn-secondary" onclick="window.print()">🖨️ Print</button>' +
  '</div>';

  card.innerHTML = html;
  window._currentRow = row;
}

function field(label, value) {
  return '<div class="v-field">' +
    '<label>' + esc(label) + '</label>' +
    '<div class="val">' + (value ? esc(value) : '<span style="color:#cbd5e1">—</span>') + '</div>' +
  '</div>';
}

/* ── Re-render PDFs on demand from the public row ─────── */
function rowToRecord(row) {
  return {
    courseCode:       row.course_code,
    courseName:       row.course_name,
    certificateNo:    row.certificate_no,
    enrollmentNo:     row.enrollment_no || '',
    rollNo:           row.roll_no       || '',
    centreCode:       row.centre_code   || '',
    centreCity:       row.centre_city   || '',
    studentFullName:  row.student_full_name,
    fatherName:       row.father_name   || '',
    motherName:       row.mother_name   || '',
    dateOfBirth:      row.date_of_birth || '',
    durationFrom:     row.duration_from || '',
    durationTo:       row.duration_to   || '',
    examinationHeld:  row.examination_held || '',
    issueDate:        row.issue_date    || '',
    place:            row.place         || '',
    marks:            row.marks         || [],
    grandTotal:       row.grand_total,
    grandTotalMax:    row.grand_total_max,
    divisionAwarded:  row.division_awarded
  };
}

window._dlCert = function () {
  if (!window._currentRow) return;
  var rec = rowToRecord(window._currentRow);
  buildCertificatePDF(rec).then(function (blob) {
    downloadBlob(blob, 'Certificate_' + safeFilename(rec.studentFullName) + '_' +
                 rec.certificateNo.replace(/\//g, '-') + '.pdf');
  }).catch(function (e) { alert('Could not regenerate PDF: ' + e.message); });
};

window._dlMarks = function () {
  if (!window._currentRow) return;
  var rec = rowToRecord(window._currentRow);
  buildMarksheetPDF(rec).then(function (blob) {
    downloadBlob(blob, 'Marksheet_' + safeFilename(rec.studentFullName) + '_' +
                 rec.certificateNo.replace(/\//g, '-') + '.pdf');
  }).catch(function (e) { alert('Could not regenerate PDF: ' + e.message); });
};

/* ── Init ─────────────────────────────────────────────── */
if (!certNo) {
  renderSearchPrompt();
} else {
  sb.from('student_certificates')
    .select('*')
    .eq('certificate_no', certNo)
    .maybeSingle()
    .then(function (res) {
      if (res.error) {
        renderState('error', '❌', 'Lookup failed',
          'We could not reach the registry. Please try again. ' +
          '(' + (res.error.message || 'unknown error') + ')');
        return;
      }
      if (!res.data) {
        renderState('error', '❓', 'Certificate not found',
          'No record matches “' + certNo + '”. The QR code may be invalid, or the certificate has been removed.');
        return;
      }
      renderRecord(res.data);
    })
    .catch(function (e) {
      renderState('error', '❌', 'Lookup failed', e.message || 'Network error.');
    });
}

})();

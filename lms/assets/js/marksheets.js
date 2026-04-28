/* =========================================================
   ANSHA MONTESSORI LMS — MARKSHEETS ADMIN PAGE LOGIC
   Uses cert-render.js for the actual PDF rendering.
   ========================================================= */

(function () {

/* ── Auth gate: admin or teacher only ──────────────────── */
var session = null;
try { session = getSession(); } catch (e) {}
if (!session || !['admin', 'teacher'].includes(session.role)) {
  window.location.href = '../index.html';
  return;
}

/* ── Sidebar + header name ────────────────────────────── */
try {
  document.getElementById('sidebar').innerHTML = buildSidebar(session);
  setActiveNav();
  var userEl = document.getElementById('user-name');
  if (userEl) userEl.textContent = session.name || session.email || '';
} catch (e) { console.warn('Sidebar init failed:', e); }

/* ── Today as default issue date ──────────────────────── */
(function setDefaultIssueDate() {
  var el = document.getElementById('f-issue-date');
  if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
})();

/* ── Course change → rebuild marks table ──────────────── */
var courseSel = document.getElementById('f-course');
courseSel.addEventListener('change', renderMarksTable);
renderMarksTable();

function getCurrentCourse() {
  return COURSES[courseSel.value];
}

function renderMarksTable() {
  var course = getCurrentCourse();
  var body = document.getElementById('marks-body');
  var card = document.getElementById('marks-card');
  var btnMs = document.getElementById('btn-preview-ms');
  if (!course.hasMarks) {
    card.style.display = 'none';
    if (btnMs) btnMs.disabled = true;
    return;
  }
  card.style.display = '';
  if (btnMs) btnMs.disabled = false;

  body.innerHTML = course.subjects.map(function (s, i) {
    return '<tr data-code="' + s.code + '">' +
      '<td class="col-num">' + (i + 1) + '</td>' +
      '<td>' + s.name + '</td>' +
      '<td class="col-code">' + s.code + '</td>' +
      '<td class="col-mark" style="text-align:center">' + s.max + '</td>' +
      '<td class="col-mark"><input type="number" min="0" max="' + s.max + '" class="m-theory"    oninput="window._recalcMarks()"></td>' +
      '<td class="col-mark"><input type="number" min="0" max="' + s.max + '" class="m-practical" oninput="window._recalcMarks()"></td>' +
      '<td class="col-mark"><input type="number" min="0" max="' + s.max + '" class="m-total"     oninput="window._recalcMarks(true)"></td>' +
    '</tr>';
  }).join('');
  recalcMarks();
}

function recalcMarks(manualTotalEdited) {
  var course = getCurrentCourse();
  if (!course.hasMarks) return;
  var rows = document.querySelectorAll('#marks-body tr');
  var grandTheory = 0, grandPractical = 0, grandTotal = 0, grandMax = 0, hasAny = false;
  rows.forEach(function (row) {
    var code = row.dataset.code;
    var subj = course.subjects.find(function (s) { return s.code === code; });
    grandMax += subj ? subj.max : 0;
    var t = parseFloat(row.querySelector('.m-theory').value);
    var p = parseFloat(row.querySelector('.m-practical').value);
    var totalIn = row.querySelector('.m-total');
    var manualTotal = parseFloat(totalIn.value);
    var rowTotal;
    if (!manualTotalEdited && (!isNaN(t) || !isNaN(p))) {
      rowTotal = (isNaN(t) ? 0 : t) + (isNaN(p) ? 0 : p);
      totalIn.value = rowTotal;
    } else {
      rowTotal = isNaN(manualTotal) ? 0 : manualTotal;
    }
    if (!isNaN(t)) { grandTheory    += t; hasAny = true; }
    if (!isNaN(p)) { grandPractical += p; hasAny = true; }
    if (rowTotal)  { grandTotal     += rowTotal; }
  });
  document.getElementById('gt-max').textContent       = grandMax || '—';
  document.getElementById('gt-theory').textContent    = grandTheory    ? grandTheory    : '—';
  document.getElementById('gt-practical').textContent = grandPractical ? grandPractical : '—';
  document.getElementById('gt-total').textContent     = grandTotal     ? grandTotal     : '—';

  if (hasAny && grandMax > 0) {
    var pct = (grandTotal / grandMax) * 100;
    var div = calculateDivision(pct);
    document.getElementById('gt-division').textContent =
      pct.toFixed(2) + '% — ' + div;
  } else {
    document.getElementById('gt-division').textContent = '—';
  }
}
window._recalcMarks = recalcMarks;

/* ── Read form into a record object ───────────────────── */
function readForm() {
  var courseCode = courseSel.value;
  var course     = COURSES[courseCode];

  var marks = [];
  if (course.hasMarks) {
    document.querySelectorAll('#marks-body tr').forEach(function (row) {
      var code = row.dataset.code;
      var subj = course.subjects.find(function (s) { return s.code === code; });
      var t = parseFloat(row.querySelector('.m-theory').value);
      var p = parseFloat(row.querySelector('.m-practical').value);
      var T = parseFloat(row.querySelector('.m-total').value);
      marks.push({
        code: code, subject: subj ? subj.name : code, max: subj ? subj.max : 100,
        theory:    isNaN(t) ? null : t,
        practical: isNaN(p) ? null : p,
        total:     isNaN(T) ? null : T
      });
    });
  }

  var grandTotal = 0, grandMax = 0;
  marks.forEach(function (m) {
    if (m.total != null) grandTotal += m.total;
    grandMax += m.max || 0;
  });
  var pct = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;
  var division = course.hasMarks && grandMax ? calculateDivision(pct) : null;

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  return {
    courseCode:        courseCode,
    courseName:        course.name,
    certificateNo:     val('f-cert-no'),
    enrollmentNo:      val('f-enrollment'),
    rollNo:            val('f-roll'),
    centreCode:        val('f-centre-code'),
    centreCity:        val('f-centre-city'),
    studentFullName:   val('f-name'),
    fatherName:        val('f-father'),
    motherName:        val('f-mother'),
    dateOfBirth:       val('f-dob'),
    durationFrom:      val('f-from'),
    durationTo:        val('f-to'),
    examinationHeld:   val('f-exam-held'),
    issueDate:         val('f-issue-date') || new Date().toISOString().slice(0, 10),
    place:             val('f-place'),
    marks:             marks,
    grandTotal:        grandTotal || null,
    grandTotalMax:     grandMax || null,
    divisionAwarded:   division
  };
}

function setStatus(msg, cls) {
  var el = document.getElementById('action-status');
  el.textContent = msg || '';
  el.className   = 'status-msg ' + (cls || '');
}

/* ── Auto-generate cert no (per course / per year) ─────
   Format: {prefix}/{YYYY}/{NNNN}                          */
function nextCertificateNo(courseCode) {
  var prefix = COURSES[courseCode].certPrefix;
  var year   = new Date().getFullYear();
  return _sb.from('student_certificates')
    .select('certificate_no')
    .eq('course_code', courseCode)
    .like('certificate_no', prefix + '/' + year + '/%')
    .order('certificate_no', { ascending: false })
    .limit(1)
    .then(function (res) {
      var seq = 1;
      if (res.data && res.data.length) {
        var last = res.data[0].certificate_no;
        var n    = parseInt(String(last).split('/').pop(), 10);
        if (!isNaN(n)) seq = n + 1;
      }
      return prefix + '/' + year + '/' + String(seq).padStart(4, '0');
    });
}

/* ── Validate before generating ───────────────────────── */
function validateRecord(rec, requireMarks) {
  if (!rec.studentFullName) return 'Student name is required.';
  if (!rec.certificateNo)   return 'Certificate number is required (or click Save and we will auto-generate).';
  if (requireMarks) {
    var anyMark = rec.marks.some(function (m) {
      return m.theory != null || m.practical != null || m.total != null;
    });
    if (!anyMark) return 'Enter at least some marks before previewing the marksheet.';
  }
  return null;
}

/* ── Preview Certificate ──────────────────────────────── */
window.onPreviewCert = function () {
  var rec = readForm();
  var err = validateRecord(rec, false);
  if (err && !rec.certificateNo) {
    // Auto-generate cert number for preview
    rec.certificateNo = COURSES[rec.courseCode].certPrefix + '/' +
                        new Date().getFullYear() + '/PREVIEW';
  } else if (err) {
    return setStatus('⚠️ ' + err, 'err');
  }

  setStatus('Generating preview…', '');
  buildCertificatePDF(rec).then(function (blob) {
    showPreview(blob, '🎓 Certificate — ' + rec.studentFullName,
      'Certificate_' + safeFilename(rec.studentFullName) + '.pdf');
    setStatus('✅ Preview ready.', 'ok');
  }).catch(function (e) {
    setStatus('❌ ' + e.message, 'err');
  });
};

/* ── Preview Marksheet ────────────────────────────────── */
window.onPreviewMarksheet = function () {
  var rec = readForm();
  var err = validateRecord(rec, true);
  if (err && !rec.certificateNo) {
    rec.certificateNo = COURSES[rec.courseCode].certPrefix + '/' +
                        new Date().getFullYear() + '/PREVIEW';
  } else if (err) {
    return setStatus('⚠️ ' + err, 'err');
  }
  setStatus('Generating marksheet…', '');
  buildMarksheetPDF(rec).then(function (blob) {
    showPreview(blob, '📊 Marksheet — ' + rec.studentFullName,
      'Marksheet_' + safeFilename(rec.studentFullName) + '.pdf');
    setStatus('✅ Marksheet ready.', 'ok');
  }).catch(function (e) {
    setStatus('❌ ' + e.message, 'err');
  });
};

function showPreview(blob, title, filename) {
  var url = URL.createObjectURL(blob);
  document.getElementById('preview-frame').src = url;
  document.getElementById('preview-title').textContent = title;
  document.getElementById('preview-modal').style.display = 'flex';
  document.getElementById('preview-dl-btn').onclick = function () {
    downloadBlob(blob, filename);
  };
}
window.closePreviewModal = function () {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-frame').src = '';
};

/* ── Save & Download ─────────────────────────────────── */
window.onSaveAndDownload = async function () {
  var rec = readForm();
  if (!rec.studentFullName) return setStatus('⚠️ Student name is required.', 'err');

  setStatus('Saving…', '');
  try {
    if (!rec.certificateNo) {
      rec.certificateNo = await nextCertificateNo(rec.courseCode);
      document.getElementById('f-cert-no').value = rec.certificateNo;
    }

    // Save to Supabase
    var row = recordToRow(rec);
    var ins = await _sb.from('student_certificates')
      .upsert(row, { onConflict: 'certificate_no' })
      .select()
      .maybeSingle();
    if (ins.error) throw ins.error;

    setStatus('✅ Saved. Generating PDFs…', 'ok');

    // Generate certificate
    var certBlob = await buildCertificatePDF(rec);
    downloadBlob(certBlob, 'Certificate_' + safeFilename(rec.studentFullName) + '_' +
                 rec.certificateNo.replace(/\//g, '-') + '.pdf');

    // Generate marksheet (only if course has marks AND any marks entered)
    if (COURSES[rec.courseCode].hasMarks) {
      var anyMark = rec.marks.some(function (m) {
        return m.theory != null || m.practical != null || m.total != null;
      });
      if (anyMark) {
        var msBlob = await buildMarksheetPDF(rec);
        downloadBlob(msBlob, 'Marksheet_' + safeFilename(rec.studentFullName) + '_' +
                     rec.certificateNo.replace(/\//g, '-') + '.pdf');
      }
    }

    setStatus('✅ Saved + downloaded. Verify URL: ' + buildVerifyURL(rec.certificateNo), 'ok');
    loadRecords();
  } catch (e) {
    console.error(e);
    setStatus('❌ ' + (e.message || 'Save failed'), 'err');
  }
};

function recordToRow(rec) {
  return {
    certificate_no:    rec.certificateNo,
    course_code:       rec.courseCode,
    course_name:       rec.courseName,
    student_full_name: rec.studentFullName,
    father_name:       rec.fatherName    || null,
    mother_name:       rec.motherName    || null,
    date_of_birth:     rec.dateOfBirth   || null,
    enrollment_no:     rec.enrollmentNo  || null,
    roll_no:           rec.rollNo        || null,
    centre_code:       rec.centreCode    || null,
    centre_city:       rec.centreCity    || null,
    duration_from:     rec.durationFrom  || null,
    duration_to:       rec.durationTo    || null,
    examination_held:  rec.examinationHeld || null,
    issue_date:        rec.issueDate     || null,
    place:             rec.place         || null,
    marks:             rec.marks,
    grand_total:       rec.grandTotal    || null,
    grand_total_max:   rec.grandTotalMax || null,
    division_awarded:  rec.divisionAwarded || null,
    status:            'active'
  };
}

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

window.onReset = function () {
  document.getElementById('f-cert-no').value = '';
  document.getElementById('f-enrollment').value = '';
  document.getElementById('f-roll').value = '';
  document.getElementById('f-name').value = '';
  document.getElementById('f-father').value = '';
  document.getElementById('f-mother').value = '';
  document.getElementById('f-dob').value = '';
  document.getElementById('f-from').value = '';
  document.getElementById('f-to').value = '';
  document.getElementById('f-exam-held').value = '';
  renderMarksTable();
  setStatus('Form reset.', 'ok');
};

/* ── Excel template download ──────────────────────────── */
window.onDownloadTemplate = function () {
  var course = getCurrentCourse();
  var headers = [
    'certificate_no', 'enrollment_no', 'roll_no', 'centre_code', 'centre_city',
    'student_full_name', 'father_name', 'mother_name', 'date_of_birth',
    'duration_from', 'duration_to', 'examination_held', 'issue_date', 'place'
  ];
  if (course.hasMarks) {
    course.subjects.forEach(function (s) {
      headers.push(s.code + '_theory');
      headers.push(s.code + '_practical');
      headers.push(s.code + '_total');
    });
  }
  var sample = {};
  sample['certificate_no']    = '';
  sample['enrollment_no']     = 'AMD2026-001';
  sample['roll_no']           = '01';
  sample['centre_code']       = 'AMTI-CHN';
  sample['centre_city']       = 'Chennai';
  sample['student_full_name'] = 'Priya Sharma';
  sample['father_name']       = 'Ramesh Sharma';
  sample['mother_name']       = 'Lakshmi Sharma';
  sample['date_of_birth']     = '1995-08-12';
  sample['duration_from']     = '2025-06-01';
  sample['duration_to']       = '2026-05-31';
  sample['examination_held']  = 'Apr-2026';
  sample['issue_date']        = new Date().toISOString().slice(0, 10);
  sample['place']             = 'Chennai, Tamil Nadu';
  if (course.hasMarks) {
    course.subjects.forEach(function (s) {
      sample[s.code + '_theory']    = 70;
      sample[s.code + '_practical'] = 20;
      sample[s.code + '_total']     = 90;
    });
  }
  var data = [headers, headers.map(function (h) { return sample[h]; })];

  var ws = XLSX.utils.aoa_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, course.code);
  XLSX.writeFile(wb, 'Marksheet_Template_' + course.code + '.xlsx');
};

/* ── Excel upload (bulk) ──────────────────────────────── */
window.onExcelUpload = function (event) {
  var file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  setStatus('Parsing ' + file.name + '…', '');
  var reader = new FileReader();
  reader.onload = async function (e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) return setStatus('Excel file is empty.', 'err');

      var courseCode = courseSel.value;
      var course     = COURSES[courseCode];

      // Build records
      var recs = rows.map(function (r) {
        var marks = [];
        if (course.hasMarks) {
          course.subjects.forEach(function (s) {
            marks.push({
              code: s.code, subject: s.name, max: s.max,
              theory:    r[s.code + '_theory']    !== '' ? Number(r[s.code + '_theory'])    : null,
              practical: r[s.code + '_practical'] !== '' ? Number(r[s.code + '_practical']) : null,
              total:     r[s.code + '_total']     !== '' ? Number(r[s.code + '_total'])     : null
            });
          });
        }
        var grandTotal = 0, grandMax = 0;
        marks.forEach(function (m) {
          if (m.total != null) grandTotal += m.total;
          grandMax += m.max || 0;
        });
        var pct = grandMax ? (grandTotal / grandMax) * 100 : 0;
        return {
          courseCode:       courseCode,
          courseName:       course.name,
          certificateNo:    r.certificate_no || '',
          enrollmentNo:     r.enrollment_no || '',
          rollNo:           r.roll_no || '',
          centreCode:       r.centre_code || 'AMTI-CHN',
          centreCity:       r.centre_city || 'Chennai',
          studentFullName:  r.student_full_name,
          fatherName:       r.father_name || '',
          motherName:       r.mother_name || '',
          dateOfBirth:      formatExcelDate(r.date_of_birth),
          durationFrom:     formatExcelDate(r.duration_from),
          durationTo:       formatExcelDate(r.duration_to),
          examinationHeld:  r.examination_held || '',
          issueDate:        formatExcelDate(r.issue_date) || new Date().toISOString().slice(0, 10),
          place:            r.place || 'Chennai, Tamil Nadu',
          marks:            marks,
          grandTotal:       grandTotal || null,
          grandTotalMax:    grandMax   || null,
          divisionAwarded:  course.hasMarks && grandMax ? calculateDivision(pct) : null
        };
      }).filter(function (r) { return r.studentFullName; });

      if (!recs.length) return setStatus('No valid student rows found (check student_full_name column).', 'err');

      setStatus('Saving ' + recs.length + ' record(s)…', '');

      // Auto-fill missing cert numbers
      for (var i = 0; i < recs.length; i++) {
        if (!recs[i].certificateNo) {
          recs[i].certificateNo = await nextCertificateNo(recs[i].courseCode);
        }
      }

      // Bulk upsert
      var rowsForDB = recs.map(recordToRow);
      var ins = await _sb.from('student_certificates')
        .upsert(rowsForDB, { onConflict: 'certificate_no' })
        .select();
      if (ins.error) throw ins.error;

      setStatus('✅ Imported ' + recs.length + ' record(s). Generating PDFs…', 'ok');

      // Generate PDFs sequentially (avoid stalling UI)
      for (var j = 0; j < recs.length; j++) {
        var rec = recs[j];
        try {
          var certBlob = await buildCertificatePDF(rec);
          downloadBlob(certBlob, 'Certificate_' + safeFilename(rec.studentFullName) + '_' +
                       rec.certificateNo.replace(/\//g, '-') + '.pdf');
          if (course.hasMarks) {
            var msBlob = await buildMarksheetPDF(rec);
            downloadBlob(msBlob, 'Marksheet_' + safeFilename(rec.studentFullName) + '_' +
                         rec.certificateNo.replace(/\//g, '-') + '.pdf');
          }
          // small gap so the browser doesn't choke on simultaneous downloads
          await new Promise(function (res) { setTimeout(res, 250); });
        } catch (e2) {
          console.warn('Failed for ' + rec.studentFullName, e2);
        }
      }

      setStatus('✅ Done — ' + recs.length + ' student(s) processed.', 'ok');
      loadRecords();
    } catch (err) {
      console.error(err);
      setStatus('❌ ' + (err.message || 'Excel import failed'), 'err');
    }
  };
  reader.readAsArrayBuffer(file);
};

function formatExcelDate(v) {
  if (!v) return '';
  // Excel sometimes parses dates as numbers (serial) when read with default opts.
  // We used defval:'' so dates may come as ISO strings or Date objects.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  var s = String(v).trim();
  // If already ISO YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  var m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  return s;
}

/* ── Saved records list ──────────────────────────────── */
async function loadRecords() {
  var wrap = document.getElementById('records-wrap');
  var cnt  = document.getElementById('rec-count');
  try {
    var res = await _sb.from('student_certificates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (res.error) throw res.error;
    var rows = res.data || [];
    cnt.textContent = rows.length ? '(' + rows.length + ')' : '';

    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="icon">📜</div><p>Records will appear here once saved.</p></div>';
      return;
    }
    wrap.innerHTML = '<div style="overflow-x:auto"><table class="records-table"><thead><tr>' +
      '<th>Certificate No.</th><th>Student</th><th>Course</th><th>Division</th><th>Issued</th><th>Verify</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        var courseBadge = r.course_code === 'AMD'
          ? '<span class="badge amd">AMD</span>'
          : '<span class="badge mte">MTE-PP</span>';
        var div = (r.division_awarded || '').toLowerCase();
        var divBadge = '';
        if (div.includes('distinction'))   divBadge = '<span class="badge dist">Distinction</span>';
        else if (div.includes('first'))    divBadge = '<span class="badge first">First</span>';
        else if (div.includes('second'))   divBadge = '<span class="badge second">Second</span>';
        else if (div.includes('third'))    divBadge = '<span class="badge third">Third</span>';
        else if (div.includes('fail'))     divBadge = '<span class="badge fail">Fail</span>';
        else                               divBadge = '—';

        var verifyURL = buildVerifyURL(r.certificate_no);
        return '<tr>' +
          '<td><strong>' + esc(r.certificate_no) + '</strong></td>' +
          '<td>' + esc(r.student_full_name) + '<br><small style="color:var(--gray-400)">' + esc(r.enrollment_no || '') + '</small></td>' +
          '<td>' + courseBadge + '</td>' +
          '<td>' + divBadge + '</td>' +
          '<td>' + esc(r.issue_date || '') + '</td>' +
          '<td><a class="verify-link" href="' + verifyURL + '" target="_blank">Open ↗</a></td>' +
          '<td>' +
            '<button class="btn btn-secondary" style="padding:6px 10px;font-size:0.74rem" onclick="window._reCert(\'' + r.id + '\')">🎓 Cert</button> ' +
            '<button class="btn btn-secondary" style="padding:6px 10px;font-size:0.74rem" onclick="window._reMs(\'' + r.id + '\')">📊 Marks</button> ' +
            '<button class="btn btn-danger"    style="padding:6px 10px;font-size:0.74rem" onclick="window._delRec(\'' + r.id + '\',\'' + esc(r.certificate_no) + '\')">🗑</button>' +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';

    // Stash rows for handlers
    window._recordCache = {};
    rows.forEach(function (r) { window._recordCache[r.id] = r; });
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Could not load records: ' +
      esc(e.message || 'unknown error') +
      '<br><small>Make sure the <code>student_certificates</code> table is created (see lms/create_student_certificates_table.sql).</small></p></div>';
  }
}

window._reCert = function (id) {
  var row = window._recordCache && window._recordCache[id]; if (!row) return;
  var rec = rowToRecord(row);
  buildCertificatePDF(rec).then(function (blob) {
    downloadBlob(blob, 'Certificate_' + safeFilename(rec.studentFullName) + '_' +
                 rec.certificateNo.replace(/\//g, '-') + '.pdf');
  }).catch(function (e) { alert('❌ ' + e.message); });
};
window._reMs = function (id) {
  var row = window._recordCache && window._recordCache[id]; if (!row) return;
  if (!COURSES[row.course_code] || !COURSES[row.course_code].hasMarks) {
    return alert('This course has no marksheet (certificate-only).');
  }
  var rec = rowToRecord(row);
  buildMarksheetPDF(rec).then(function (blob) {
    downloadBlob(blob, 'Marksheet_' + safeFilename(rec.studentFullName) + '_' +
                 rec.certificateNo.replace(/\//g, '-') + '.pdf');
  }).catch(function (e) { alert('❌ ' + e.message); });
};
window._delRec = async function (id, certNo) {
  if (!confirm('Delete record ' + certNo + '?\n\nThis is permanent — the QR-verify link will stop working.')) return;
  try {
    var res = await _sb.from('student_certificates').delete().eq('id', id);
    if (res.error) throw res.error;
    loadRecords();
    setStatus('🗑 Deleted ' + certNo, 'ok');
  } catch (e) { alert('❌ ' + e.message); }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Init ─────────────────────────────────────────────── */
loadRecords();

})();

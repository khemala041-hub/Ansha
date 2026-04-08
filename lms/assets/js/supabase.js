/* =========================================================
   ANSHA MONTESSORI LMS — SUPABASE.JS
   Supabase client + async helpers + write-through sync
   ========================================================= */

const SUPA_URL = 'https://twzcefikdychhsjwjekf.supabase.co';
const SUPA_KEY = 'sb_publishable_GijBRmulhuyIp3bigyhMUw_hVmQiB0y';
const _sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);

/* ── loginAsync: try Supabase first, fall back to local ─── */
async function loginAsync(credential, password, role) {
  // 1. Try Supabase
  try {
    const r = await sbLogin(credential, password, role);
    if (r.success) return r;
  } catch (e) { /* network error — fall through to local */ }

  // 2. Fall back to local localStorage login
  const localResult = login(credential, password, role);
  return localResult;
}

/* ── Supabase Login ─────────────────────────────────────── */
async function sbLogin(credential, password, role) {
  const isEmail = credential.includes('@');
  let q = _sb.from('users').select('*')
    .eq('password', password)
    .eq('role', role)
    .eq('is_active', true);
  q = isEmail ? q.eq('email', credential) : q.eq('username', credential);
  const { data, error } = await q.maybeSingle();
  if (error || !data) {
    // Supabase returned no match — try local as fallback
    const localResult = login(credential, password, role);
    return localResult;
  }
  const user = {
    id: data.id, name: data.name, email: data.email || '',
    username: data.username, role: data.role, avatar: data.avatar || '👩‍🎓',
    isActive: data.is_active
  };
  setSession(user);
  sbSyncToLocal(data.id, role).catch(console.error);
  return { success: true, user };
}

/* ── Sync Supabase → localStorage after login ───────────── */
async function sbSyncToLocal(userId, role) {
  if (role === 'student') {
    const [{ data: enr }, { data: prog }, { data: subs }, { data: fees }] = await Promise.all([
      _sb.from('enrollments').select('*').eq('student_id', userId),
      _sb.from('progress').select('*').eq('student_id', userId),
      _sb.from('submissions').select('*').eq('student_id', userId),
      _sb.from('fees').select('*').eq('student_id', userId)
    ]);
    if (enr)  dbSet(DB.ENROLLMENTS, enr.map(_enrToLocal));
    if (prog) dbSet(DB.PROGRESS,    prog.map(_progToLocal));
    if (subs) dbSet(DB.SUBMISSIONS, subs.map(_subToLocal));
    if (fees) dbSet(DB.PAYMENTS,    fees.map(_feeToLocal));
  }

  if (role === 'admin') {
    const [{ data: students }, { data: teachers }, { data: enr }, { data: fees }, { data: exp }] = await Promise.all([
      _sb.from('users').select('*').eq('role', 'student').eq('is_active', true),
      _sb.from('users').select('*').eq('role', 'teacher').eq('is_active', true),
      _sb.from('enrollments').select('*'),
      _sb.from('fees').select('*'),
      _sb.from('expenses').select('*')
    ]);
    const admins  = dbGet(DB.USERS).filter(u => u.role === 'admin');
    const localById = Object.fromEntries(dbGet(DB.USERS).map(u => [u.id, u]));
    // Never restore locally-deleted students even if Supabase still has them
    const deletedIds = new Set(JSON.parse(localStorage.getItem('lms_deleted_users') || '[]'));
    const allUsers = [
      ...admins,
      ...(students || []).filter(u => !deletedIds.has(u.id)).map(u => _userToLocal(u, localById[u.id])),
      ...(teachers || []).filter(u => !deletedIds.has(u.id)).map(u => _userToLocal(u, localById[u.id]))
    ];
    dbSet(DB.USERS, allUsers);
    // Safe merge helper — local data always wins; remote only adds missing items
    function safeMerge(remote, localKey) {
      if (!remote || remote.length === 0) return;
      const local = dbGet(localKey);
      const localIds = new Set(local.map(r => r.id));
      // Only add remote items that don't already exist locally (local wins on conflict)
      const newFromRemote = remote.filter(r => !localIds.has(r.id));
      if (newFromRemote.length > 0) dbSet(localKey, [...local, ...newFromRemote]);
    }
    safeMerge(enr  ? enr.map(_enrToLocal)  : [], DB.ENROLLMENTS);
    safeMerge(fees ? fees.map(_feeToLocal) : [], DB.PAYMENTS);
    safeMerge(exp  ? exp.map(_expToLocal)  : [], DB.EXPENSES);
  }

  if (role === 'teacher') {
    const [{ data: subs }, { data: enr }, { data: students }] = await Promise.all([
      _sb.from('submissions').select('*'),
      _sb.from('enrollments').select('*'),
      _sb.from('users').select('*').eq('role', 'student')
    ]);
    if (subs)     dbSet(DB.SUBMISSIONS, subs.map(_subToLocal));
    if (enr)      dbSet(DB.ENROLLMENTS, enr.map(_enrToLocal));
    if (students) {
      const others = dbGet(DB.USERS).filter(u => u.role !== 'student');
      const localById = Object.fromEntries(dbGet(DB.USERS).map(u => [u.id, u]));
      dbSet(DB.USERS, [...others, ...students.map(u => _userToLocal(u, localById[u.id]))]);
    }
  }
}

/* ── Data mappers ────────────────────────────────────────── */
function _userToLocal(u, existingLocal) {
  // Preserve enrollmentNo from localStorage if Supabase doesn't have it yet
  const existingEnrollmentNo = existingLocal?.enrollmentNo || '';
  return {
    id: u.id, name: u.name, email: u.email || '', username: u.username,
    password: u.password, role: u.role, avatar: u.avatar || '👩‍🎓',
    phone: u.phone || '', dob: u.dob || '', gender: u.gender || '',
    cnic: u.cnic || '', address: u.address || '',
    fatherName: u.fathers_name || '', createdAt: u.created_at,
    enrollmentNo: u.enrollment_no || existingEnrollmentNo
  };
}
function _enrToLocal(e) {
  return {
    id: e.id, studentId: e.student_id, courseId: e.course_id,
    enrolledAt: e.enrolled_at, progress: e.progress || 0,
    status: e.status || 'active', feeStatus: e.fee_status || 'pending'
  };
}
function _progToLocal(p) {
  return { id: p.id, studentId: p.student_id, lessonId: p.lesson_id, completed: p.completed, completedAt: p.completed_at };
}
function _subToLocal(s) {
  return {
    id: s.id, type: s.type, studentId: s.student_id,
    quizId: s.quiz_id, assignmentId: s.assignment_id,
    score: s.score, total: s.total, percentage: s.percentage,
    answers: s.answers, answer: s.answer, marks: s.marks,
    feedback: s.feedback, submittedAt: s.submitted_at, gradedAt: s.graded_at
  };
}
function _feeToLocal(f) {
  return {
    id: f.id, studentId: f.student_id, courseId: f.course_id,
    amount: f.amount, dueDate: f.due_date, paidDate: f.paid_date,
    status: f.status, description: f.description, createdAt: f.created_at
  };
}
function _expToLocal(e) {
  return { id: e.id, category: e.category, amount: e.amount, description: e.description, paidTo: e.paid_to || '', date: e.date, createdAt: e.created_at };
}

/* ── Write-through: called fire-and-forget from data.js ─── */
function sbPushEnrollment(e) {
  _sb.from('enrollments').upsert({
    id: e.id, student_id: e.studentId, course_id: e.courseId,
    progress: e.progress || 0, status: e.status || 'active',
    fee_status: e.feeStatus || 'pending'
  }, { onConflict: 'id' }).then(null, console.error);
}

function sbPushProgress(p) {
  _sb.from('progress').upsert({
    id: p.id, student_id: p.studentId, lesson_id: p.lessonId,
    completed: p.completed, completed_at: p.completedAt
  }, { onConflict: 'student_id,lesson_id' }).then(null, console.error);
}

function sbPushSubmission(s) {
  _sb.from('submissions').upsert({
    id: s.id, type: s.type, student_id: s.studentId,
    quiz_id: s.quizId || null, assignment_id: s.assignmentId || null,
    score: s.score ?? null, total: s.total ?? null, percentage: s.percentage ?? null,
    answers: s.answers || null, answer: s.answer || null,
    marks: s.marks ?? null, feedback: s.feedback || null,
    submitted_at: s.submittedAt, graded_at: s.gradedAt || null
  }, { onConflict: 'id' }).then(null, console.error);
}

function sbPushFee(f) {
  _sb.from('fees').upsert({
    id: f.id, student_id: f.studentId, course_id: f.courseId || null,
    amount: f.amount, due_date: f.dueDate || null,
    paid_date: f.paidDate || null, status: f.status || 'pending',
    description: f.description || null
  }, { onConflict: 'id' }).then(null, console.error);
}

function sbPushExpense(e) {
  _sb.from('expenses').upsert({
    id: e.id, category: e.category, amount: e.amount,
    description: e.description || null,
    paid_to: e.paidTo || null,
    date: e.date || new Date().toISOString().split('T')[0]
  }, { onConflict: 'id' }).then(null, console.error);
}

function sbDeleteExpense(id) {
  _sb.from('expenses').delete().eq('id', id).then(null, console.error);
}

/* ── Create student account in Supabase ─────────────────── */
async function sbCreateStudent(student) {
  const { data, error } = await _sb.from('users').insert({
    name: student.name,
    fathers_name: student.fatherName || null,
    email: student.email || null,
    username: student.username,
    password: student.password,
    role: 'student',
    avatar: student.avatar || '👩‍🎓',
    phone: student.phone || null,
    dob: student.dob || null,
    gender: student.gender || null,
    cnic: student.cnic || null,
    address: student.address || null,
    is_active: true
  }).select().maybeSingle();
  return { data, error };
}

/* ── Fetch all students (admin use) ─────────────────────── */
async function sbGetStudents() {
  const { data } = await _sb.from('users').select('*').eq('role', 'student').eq('is_active', true).order('name');
  return (data || []).map(_userToLocal);
}

/* ── Recordings sync ─────────────────────────────────────── */
async function sbPushRecording(rec) {
  return _sb.from('recordings').upsert({
    id: rec.id, course_id: rec.courseId || null,
    title: rec.title, drive_url: rec.driveUrl,
    session_date: rec.date || null, description: rec.description || null
  }, { onConflict: 'id' });
}

async function sbDeleteRecording(id) {
  return _sb.from('recordings').delete().eq('id', id);
}

async function sbSyncRecordingsToLocal() {
  try {
    const { data, error } = await _sb.from('recordings')
      .select('*').order('session_date', { ascending: false });
    if (error || !data || !data.length) return false;
    const recs = data.map(r => ({
      id: r.id, courseId: r.course_id, title: r.title,
      driveUrl: r.drive_url, date: r.session_date, description: r.description
    }));
    // Merge: keep local-only entries not yet in Supabase
    const remoteIds = new Set(recs.map(r => r.id));
    const localOnly = (JSON.parse(localStorage.getItem('lms_recordings') || '[]'))
      .filter(r => !remoteIds.has(r.id));
    localStorage.setItem('lms_recordings', JSON.stringify([...recs, ...localOnly]));
    return true;
  } catch (e) { return false; }
}

/* ── Push all local seeded recordings to Supabase (admin only, once) ── */
async function sbSeedRecordingsToSupabase() {
  if (localStorage.getItem('lms_recordings_sb_seeded_v2')) return;
  const recs = JSON.parse(localStorage.getItem('lms_recordings') || '[]');
  if (!recs.length) return;
  const rows = recs.map(r => ({
    id: r.id, course_id: r.courseId || null,
    title: r.title, drive_url: r.driveUrl,
    session_date: r.date || null, description: r.description || null
  }));
  const { error } = await _sb.from('recordings').upsert(rows, { onConflict: 'id' });
  if (!error) {
    localStorage.setItem('lms_recordings_sb_seeded_v2', 'true');
    console.log('✅ Seeded ' + recs.length + ' recordings to Supabase');
  }
}

/* ── Assessment Results sync ─────────────────────────────── */
async function sbPushAssessmentResult(r) {
  return _sb.from('assessment_results').upsert({
    id: r.id, student_id: r.studentId, assessment_id: r.assessmentId,
    score: r.score, remarks: r.remarks || null,
    recorded_at: r.recordedAt || new Date().toISOString(),
    recorded_by: r.recordedBy || null
  }, { onConflict: 'id' });
}

async function sbDeleteAssessmentResult(id) {
  return _sb.from('assessment_results').delete().eq('id', id);
}

async function sbSyncAssessmentResultsToLocal(studentId) {
  try {
    let q = _sb.from('assessment_results').select('*');
    if (studentId) q = q.eq('student_id', studentId);
    const { data, error } = await q;
    if (error || !data || !data.length) return false;
    const results = data.map(r => ({
      id: r.id, studentId: r.student_id, assessmentId: r.assessment_id,
      score: r.score, remarks: r.remarks, recordedAt: r.recorded_at, recordedBy: r.recorded_by
    }));
    const remoteIds = new Set(results.map(r => r.id));
    const localOnly = dbGet(DB.ASSESSMENT_RESULTS).filter(r => !remoteIds.has(r.id));
    dbSet(DB.ASSESSMENT_RESULTS, [...results, ...localOnly]);
    return true;
  } catch (e) { return false; }
}

/* ── Ensure extra admin accounts exist in Supabase ──────── */
(async function sbEnsureAdmins() {
  const admins = [
    { id: 'admin-syed',   name: 'Syed',   email: 'syed@ansha.edu',   username: 'syed@ansha.edu',   password: 'Great786', role: 'admin', avatar: '👨‍💼', is_active: true },
    { id: 'admin-hemala', name: 'Hemala', email: 'hemala@ansha.edu', username: 'hemala@ansha.edu', password: 'Great786', role: 'admin', avatar: '👩‍💼', is_active: true },
    { id: 'admin-reema',  name: 'Reema',  email: 'reema@ansha.edu',  username: 'reema@ansha.edu',  password: 'Great786', role: 'admin', avatar: '👩‍💼', is_active: true },
  ];
  try {
    await _sb.from('users').upsert(admins, { onConflict: 'id' });
  } catch(e) { /* will use localStorage fallback */ }
})();

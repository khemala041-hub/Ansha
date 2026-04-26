/* =========================================================
   ANSHA MONTESSORI LMS — DATA.JS
   LocalStorage CRUD helpers + Seed Data
   ========================================================= */

const DB = {
  USERS:         'lms_users',
  COURSES:       'lms_courses',
  LESSONS:       'lms_lessons',
  QUIZZES:       'lms_quizzes',
  ASSIGNMENTS:   'lms_assignments',
  SUBMISSIONS:   'lms_submissions',
  ENROLLMENTS:   'lms_enrollments',
  PROGRESS:      'lms_progress',
  SESSION:       'lms_session',
  NOTICES:       'lms_notices',
  ADMISSIONS:    'lms_admissions',
  PAYMENTS:      'lms_payments',
  EXPENSES:      'lms_expenses',
  NOTIFICATIONS:       'lms_notifications',
  ATTENDANCE:          'lms_attendance',
  RATINGS:             'lms_ratings',
  DISCUSSIONS:         'lms_discussions',
  SCHEDULE:            'lms_schedule',
  ASSESSMENTS:         'lms_assessments',
  ASSESSMENT_RESULTS:  'lms_assessment_results',
};

/* ---- Generic CRUD ---- */
function dbGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}
function dbSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function dbGetOne(key, id) {
  return dbGet(key).find(x => x.id === id) || null;
}
function dbSave(key, item) {
  const list = dbGet(key);
  const idx = list.findIndex(x => x.id === item.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.push(item);
  dbSet(key, list);
  return item;
}
function dbDelete(key, id) {
  dbSet(key, dbGet(key).filter(x => x.id !== id));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- Session ---- */
function getSession() {
  try { return JSON.parse(localStorage.getItem(DB.SESSION)); }
  catch { return null; }
}
function setSession(user) {
  localStorage.setItem(DB.SESSION, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(DB.SESSION);
}

/* ---- User helpers ---- */
function findUserByEmail(email) {
  return dbGet(DB.USERS).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}
function getUsersByRole(role) {
  return dbGet(DB.USERS).filter(u => u.role === role);
}

/* ---- Enrollment Number helpers ---- */
function getNextEnrollmentNo() {
  const users = dbGet(DB.USERS);
  let maxNum = 0;
  users.forEach(u => {
    if (u.enrollmentNo) {
      const match = u.enrollmentNo.match(/(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
  });
  return `ANSHA-2026-${String(maxNum + 1).padStart(3, '0')}`;
}

/* ---- Enrollment helpers ---- */
function getEnrollment(studentId, courseId) {
  return dbGet(DB.ENROLLMENTS).find(e => e.studentId === studentId && e.courseId === courseId) || null;
}
function getStudentEnrollments(studentId) {
  return dbGet(DB.ENROLLMENTS).filter(e => e.studentId === studentId);
}
function getCourseEnrollments(courseId) {
  return dbGet(DB.ENROLLMENTS).filter(e => e.courseId === courseId);
}
function enrollStudent(studentId, courseId) {
  if (getEnrollment(studentId, courseId)) return null;
  const enrollment = {
    id: genId(), studentId, courseId,
    enrolledAt: new Date().toISOString(),
    progress: 0, status: 'active', feeStatus: 'pending'
  };
  dbSave(DB.ENROLLMENTS, enrollment);
  if (window.sbPushEnrollment) sbPushEnrollment(enrollment);
  return enrollment;
}

/* ---- Fee Plan helper ---- */
function computeFeeSchedule(studentId, courseId) {
  const enrollment = getEnrollment(studentId, courseId);
  const course = dbGetOne(DB.COURSES, courseId);
  if (!enrollment || !course) return null;
  const feePlan = enrollment.feePlan || { type: 'full', totalFee: course.fee || 0 };
  const totalFee = feePlan.totalFee || course.fee || 0;

  // Excel-imported fee data: use stored values directly
  if (feePlan.excelImport) {
    const paidAmt = feePlan.paidAmount || 0;
    const balance = feePlan.balance != null ? feePlan.balance : Math.max(0, totalFee - paidAmt);
    const schedule = [];
    if (paidAmt > 0) schedule.push({ no: 1, amount: paidAmt, status: 'paid', paidAt: null, receiptNo: null });
    if (balance > 0) schedule.push({ no: paidAmt > 0 ? 2 : 1, amount: balance, status: 'pending' });
    if (!schedule.length) schedule.push({ no: 1, amount: totalFee, status: 'paid', paidAt: null, receiptNo: null });
    return { feePlan, totalFee, paidAmt, balance, numInstall: schedule.length, schedule };
  }

  const payments = dbGet(DB.PAYMENTS)
    .filter(p => p.studentId === studentId && p.courseId === courseId)
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
  const numInstall = feePlan.type === '2x' ? 2 : feePlan.type === '4x' ? 4 : 1;
  const installAmt = numInstall > 1 ? Math.round(totalFee / numInstall) : totalFee;
  const paidAmt = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, totalFee - paidAmt);
  const schedule = [];
  for (let i = 1; i <= numInstall; i++) {
    const pmtSeq = payments[i - 1] || null;
    if (pmtSeq) {
      schedule.push({ no: i, amount: pmtSeq.amount, status: 'paid', paidAt: pmtSeq.paidAt, receiptNo: pmtSeq.receiptNo, paymentId: pmtSeq.id });
    } else {
      schedule.push({ no: i, amount: installAmt, status: 'pending' });
    }
  }
  return { feePlan, totalFee, paidAmt, balance, numInstall, schedule };
}

/* ---- Progress helpers ---- */
function markLessonComplete(studentId, lessonId) {
  const existing = dbGet(DB.PROGRESS).find(p => p.studentId === studentId && p.lessonId === lessonId);
  if (existing) return;
  const prog = { id: genId(), studentId, lessonId, completed: true, completedAt: new Date().toISOString() };
  dbSave(DB.PROGRESS, prog);
  if (window.sbPushProgress) sbPushProgress(prog);

  // Recalculate course progress
  const lesson = dbGetOne(DB.LESSONS, lessonId);
  if (!lesson) return;
  const courseLessons = dbGet(DB.LESSONS).filter(l => l.courseId === lesson.courseId);
  const completedLessons = dbGet(DB.PROGRESS).filter(p =>
    p.studentId === studentId &&
    courseLessons.some(cl => cl.id === p.lessonId)
  );
  const progress = courseLessons.length > 0
    ? Math.round((completedLessons.length / courseLessons.length) * 100)
    : 0;
  const enrollment = getEnrollment(studentId, lesson.courseId);
  if (enrollment) {
    enrollment.progress = progress;
    if (progress === 100) enrollment.status = 'completed';
    dbSave(DB.ENROLLMENTS, enrollment);
    if (window.sbPushEnrollment) sbPushEnrollment(enrollment);
  }
}
function isLessonCompleted(studentId, lessonId) {
  return dbGet(DB.PROGRESS).some(p => p.studentId === studentId && p.lessonId === lessonId);
}

/* ---- Quiz Submissions ---- */
function saveQuizResult(studentId, quizId, score, total, answers) {
  const existing = getQuizResult(studentId, quizId);
  const sub = {
    id: existing ? existing.id : genId(),
    type: 'quiz', quizId, studentId,
    score, total, percentage: Math.round((score / total) * 100),
    answers, submittedAt: new Date().toISOString()
  };
  dbSave(DB.SUBMISSIONS, sub);
  if (window.sbPushSubmission) sbPushSubmission(sub);
  return sub;
}
function getQuizResult(studentId, quizId) {
  return dbGet(DB.SUBMISSIONS).find(s => s.type === 'quiz' && s.studentId === studentId && s.quizId === quizId) || null;
}

/* ---- Assignment Submissions ---- */
function submitAssignment(studentId, assignmentId, answer) {
  const existing = dbGet(DB.SUBMISSIONS).find(s => s.type === 'assignment' && s.studentId === studentId && s.assignmentId === assignmentId);
  if (existing) {
    existing.answer = answer; existing.submittedAt = new Date().toISOString();
    dbSave(DB.SUBMISSIONS, existing);
    if (window.sbPushSubmission) sbPushSubmission(existing);
    return existing;
  }
  const sub = { id: genId(), type: 'assignment', assignmentId, studentId, answer, marks: null, feedback: '', submittedAt: new Date().toISOString() };
  dbSave(DB.SUBMISSIONS, sub);
  if (window.sbPushSubmission) sbPushSubmission(sub);
  return sub;
}
function gradeAssignment(submissionId, marks, feedback) {
  const sub = dbGetOne(DB.SUBMISSIONS, submissionId);
  if (!sub) return null;
  sub.marks = marks; sub.feedback = feedback; sub.gradedAt = new Date().toISOString();
  dbSave(DB.SUBMISSIONS, sub);
  if (window.sbPushSubmission) sbPushSubmission(sub);
  return sub;
}

/* ---- Notification helpers ---- */
function addNotification(userId, message, type = 'info', link = '') {
  const notif = { id: genId(), userId, message, type, link, read: false, createdAt: new Date().toISOString() };
  dbSave(DB.NOTIFICATIONS, notif);
  return notif;
}
function getNotifications(userId) {
  return dbGet(DB.NOTIFICATIONS).filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function markNotificationRead(id) {
  const n = dbGetOne(DB.NOTIFICATIONS, id);
  if (n) { n.read = true; dbSave(DB.NOTIFICATIONS, n); }
}
function markAllNotificationsRead(userId) {
  const list = dbGet(DB.NOTIFICATIONS).map(n => n.userId === userId ? { ...n, read: true } : n);
  dbSet(DB.NOTIFICATIONS, list);
}
function getUnreadCount(userId) {
  return dbGet(DB.NOTIFICATIONS).filter(n => n.userId === userId && !n.read).length;
}

/* ---- Attendance helpers ---- */
function saveAttendance(courseId, date, records) {
  // records = [{ studentId, status: 'present'|'absent'|'late' }]
  const id = `att_${courseId}_${date}`;
  const att = { id, courseId, date, records, markedAt: new Date().toISOString() };
  dbSave(DB.ATTENDANCE, att);
  return att;
}
function getAttendance(courseId, date) {
  return dbGetOne(DB.ATTENDANCE, `att_${courseId}_${date}`);
}
function getStudentAttendance(studentId, courseId) {
  return dbGet(DB.ATTENDANCE)
    .filter(a => a.courseId === courseId)
    .map(a => ({ date: a.date, record: a.records.find(r => r.studentId === studentId) }))
    .filter(a => a.record);
}
function getCourseAttendanceSummary(courseId) {
  const all = dbGet(DB.ATTENDANCE).filter(a => a.courseId === courseId);
  const students = getUsersByRole('student');
  return students.map(s => {
    const records = all.flatMap(a => a.records.filter(r => r.studentId === s.id));
    const present = records.filter(r => r.status === 'present').length;
    const late    = records.filter(r => r.status === 'late').length;
    const total   = records.length;
    return { student: s, present, late, absent: total - present - late, total };
  }).filter(x => x.total > 0);
}

/* ---- Rating helpers ---- */
function saveCourseRating(studentId, courseId, stars, review) {
  const id = `rate_${studentId}_${courseId}`;
  const rating = { id, studentId, courseId, stars, review, createdAt: new Date().toISOString() };
  dbSave(DB.RATINGS, rating);
  return rating;
}
function getCourseRatings(courseId) {
  return dbGet(DB.RATINGS).filter(r => r.courseId === courseId);
}
function getStudentRating(studentId, courseId) {
  return dbGetOne(DB.RATINGS, `rate_${studentId}_${courseId}`);
}
function getCourseAvgRating(courseId) {
  const ratings = getCourseRatings(courseId);
  if (!ratings.length) return 0;
  return (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1);
}

/* ---- Discussion helpers ---- */
function addDiscussionPost(lessonId, userId, text, parentId = null) {
  const post = { id: genId(), lessonId, userId, text, parentId, likes: 0, createdAt: new Date().toISOString() };
  dbSave(DB.DISCUSSIONS, post);
  return post;
}
function getLessonDiscussion(lessonId) {
  return dbGet(DB.DISCUSSIONS).filter(d => d.lessonId === lessonId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
function likeDiscussionPost(postId) {
  const post = dbGetOne(DB.DISCUSSIONS, postId);
  if (post) { post.likes = (post.likes || 0) + 1; dbSave(DB.DISCUSSIONS, post); }
}

/* ---- Schedule helpers ---- */
function saveScheduleSession(session) {
  if (!session.id) session.id = genId();
  dbSave(DB.SCHEDULE, session);
  return session;
}
function getScheduleSessions(courseId) {
  return courseId
    ? dbGet(DB.SCHEDULE).filter(s => s.courseId === courseId)
    : dbGet(DB.SCHEDULE);
}
function deleteScheduleSession(id) {
  dbDelete(DB.SCHEDULE, id);
}

/* =============================================
   SEED DATA
   ============================================= */
function initSeedData() {
  if (localStorage.getItem('lms_seeded')) { patchNewCourses(); return; }

  /* --- Users --- */
  const users = [
    {
      id: 'u1', name: 'Admin User', email: 'admin@ansha.edu', password: 'admin123',
      role: 'admin', avatar: '👨‍💼', phone: '+91-98765-43210', createdAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'u2', name: 'Fatima Malik', email: 'fatima@ansha.edu', password: 'teacher123',
      role: 'teacher', avatar: '👩‍🏫', phone: '+91-98765-43211',
      qualification: 'M.Ed Montessori', experience: '8 years', createdAt: '2024-01-05T00:00:00Z'
    },
    {
      id: 'u3', name: 'Zainab Ahmed', email: 'zainab@ansha.edu', password: 'teacher123',
      role: 'teacher', avatar: '👩‍🏫', phone: '+91-98765-43212',
      qualification: 'B.Ed, TEFL Certified', experience: '5 years', createdAt: '2024-01-08T00:00:00Z'
    },
    {
      id: 'u4', name: 'Ayesha Khan', email: 'ayesha@student.edu', password: 'student123',
      role: 'student', avatar: '👩‍🎓', phone: '+91-98765-43213',
      dob: '2000-05-15', cnic: '35202-1234567-8', gender: 'Female',
      address: 'House 12, Street 4, Gulberg, Lahore',
      fatherName: 'Muhammad Khan', guardianPhone: '+91-98765-43214',
      createdAt: '2024-02-01T00:00:00Z'
    }
  ];
  dbSet(DB.USERS, users);

  /* --- Courses --- */
  const courses = [
    {
      id: 'c1', title: 'Advance Montessori Teacher Training',
      category: 'montessori', teacherId: 'u2',
      description: 'A comprehensive training program covering the philosophy, principles, and practical implementation of the Montessori method for early childhood education. Become a certified Montessori educator.',
      duration: '6 Months', level: 'Advanced', icon: '🏫', color: '#1a7a7a',
      modules: ['Montessori Philosophy & Principles', 'Prepared Environment', 'Sensorial Materials', 'Language & Literacy', 'Mathematics in Montessori', 'Practical Life Activities'],
      maxStudents: 25, fee: 25000, createdAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'c2', title: 'Spoken English',
      category: 'language', teacherId: 'u3',
      description: 'Develop fluency, confidence, and effective communication skills in English. Perfect for educators who want to teach in English-medium schools or improve their communication abilities.',
      duration: '3 Months', level: 'All Levels', icon: '🗣️', color: '#7c3aed',
      modules: ['Foundation & Basics', 'Pronunciation & Phonetics', 'Conversational English', 'Classroom English for Teachers'],
      maxStudents: 20, fee: 8000, createdAt: '2024-01-20T00:00:00Z'
    },
    {
      id: 'c3', title: 'Phonics Training',
      category: 'phonics', teacherId: 'u2',
      description: 'Master the art of teaching phonics to young learners. Learn systematic phonics instruction methods, phonemic awareness activities, and how to help children become confident readers.',
      duration: '2 Months', level: 'Intermediate', icon: '📖', color: '#d97706',
      modules: ['Phonemic Awareness', 'Letter-Sound Correspondence', 'Blending & Segmenting', 'Teaching Reading with Phonics'],
      maxStudents: 20, fee: 6000, createdAt: '2024-01-25T00:00:00Z'
    },
    {
      id: 'c4', title: 'Child Psychology',
      category: 'psychology', teacherId: 'u3',
      description: 'Understand child development, behavior, and learning patterns. This course equips teachers with psychological insights to create nurturing, supportive classrooms and handle diverse learner needs.',
      duration: '4 Months', level: 'Intermediate', icon: '🧠', color: '#db2777',
      modules: ['Child Development Stages', 'Cognitive Development', 'Emotional & Social Development', 'Learning Disabilities & Special Needs', 'Classroom Behavior Management'],
      maxStudents: 25, fee: 10000, createdAt: '2024-02-01T00:00:00Z'
    },
    {
      id: 'c5', title: 'Phonics A–Z: Letter-by-Letter Reference',
      category: 'phonics', teacherId: 'u2',
      description: 'A standalone interactive reference for teacher trainees — every English letter A through Z with its IPA sound, example words, articulation cue, and classroom-ready trainer tip. Includes a 29-slide playful rainbow training deck to download.',
      duration: '4 Weeks', level: 'All Levels', icon: '🔤', color: '#e11d48',
      modules: ['A – I', 'J – R', 'S – Z', 'Course Deck'],
      maxStudents: 30, fee: 3500, createdAt: '2024-03-10T00:00:00Z'
    },
    {
      id: 'c6', title: 'Storytelling for Young Minds',
      category: 'storytelling', teacherId: 'u3',
      description: 'A teacher-training module on the art of storytelling for Montessori Casa children aged 3–5. Four original value stories (kindness, sharing, patience, courage), voice & body craft, props & the story basket, and a four-week practice plan.',
      duration: '6 Weeks', level: 'All Levels', icon: '📖', color: '#8A3C32',
      modules: ['Introduction', 'Foundations', 'The Craft', 'The Instrument', 'Value Stories', 'Delivery', 'Practice', 'Course Deck'],
      maxStudents: 25, fee: 4500, createdAt: '2024-03-15T00:00:00Z'
    }
  ];
  dbSet(DB.COURSES, courses);

  /* --- Lessons --- */
  const lessons = [
    // Montessori (c1)
    { id: 'l1', courseId: 'c1', module: 'Montessori Philosophy & Principles', title: 'Introduction to Montessori Method', type: 'video', url: 'https://www.youtube.com/embed/kfLLQCEB5sg', duration: '18 min', order: 1 },
    { id: 'l2', courseId: 'c1', module: 'Montessori Philosophy & Principles', title: 'Core Principles of Dr. Maria Montessori', type: 'text', content: '<h3>Core Principles</h3><p>The Montessori method is based on six core principles:</p><ol><li><strong>Respect for the child</strong> — treating children as capable individuals</li><li><strong>The absorbent mind</strong> — children absorb knowledge effortlessly from 0-6 years</li><li><strong>Sensitive periods</strong> — windows of opportunity for optimal learning</li><li><strong>The prepared environment</strong> — a carefully organized learning space</li><li><strong>Auto-education</strong> — children naturally desire to learn</li><li><strong>The role of the teacher</strong> — guide and observer, not lecturer</li></ol>', duration: '15 min', order: 2 },
    { id: 'l3', courseId: 'c1', module: 'Prepared Environment', title: 'Setting Up a Montessori Classroom', type: 'video', url: 'https://www.youtube.com/embed/9X68dm92HVI', duration: '22 min', order: 3 },
    { id: 'l4', courseId: 'c1', module: 'Sensorial Materials', title: 'Introduction to Sensorial Materials', type: 'video', url: 'https://www.youtube.com/embed/0z0M5DPfLT8', duration: '20 min', order: 4 },
    // Spoken English (c2)
    { id: 'l5', courseId: 'c2', module: 'Foundation & Basics', title: 'Fundamentals of English Communication', type: 'video', url: 'https://www.youtube.com/embed/yyNPlDL3GBs', duration: '25 min', order: 1 },
    { id: 'l6', courseId: 'c2', module: 'Pronunciation & Phonetics', title: 'English Pronunciation Guide', type: 'text', content: '<h3>English Pronunciation Basics</h3><p>Good pronunciation is key to effective communication. Here are essential tips:</p><ul><li><strong>Vowel sounds</strong>: English has 12 pure vowels and 8 diphthongs</li><li><strong>Consonant clusters</strong>: Practice blending consonants (str-, spr-, -nds)</li><li><strong>Word stress</strong>: Know which syllable to stress in multi-syllable words</li><li><strong>Sentence rhythm</strong>: English has a stress-timed rhythm</li><li><strong>Intonation</strong>: Rising intonation for questions, falling for statements</li></ul><h4>Daily Practice Tips:</h4><p>Record yourself speaking, listen back, and compare with native speakers. Practice tongue twisters daily for articulation improvement.</p>', duration: '20 min', order: 2 },
    { id: 'l7', courseId: 'c2', module: 'Conversational English', title: 'Building Conversation Skills', type: 'video', url: 'https://www.youtube.com/embed/sW5QObM5CHA', duration: '30 min', order: 3 },
    // Phonics (c3)
    { id: 'l8', courseId: 'c3', module: 'Phonemic Awareness', title: 'What is Phonemic Awareness?', type: 'video', url: 'https://www.youtube.com/embed/d0GNqEbMGZY', duration: '15 min', order: 1 },
    { id: 'l9', courseId: 'c3', module: 'Letter-Sound Correspondence', title: 'Teaching Letter Sounds A-Z', type: 'text', content: '<h3>Teaching Letter-Sound Correspondence</h3><p>Letter-sound correspondence is the understanding that letters represent sounds in spoken words. Here is how to teach it effectively:</p><h4>Sequence of Introduction:</h4><ol><li>Start with high-frequency letters: a, m, s, t, i, p</li><li>Introduce consonants before complex vowels</li><li>Use multisensory approaches (see, hear, touch, write)</li><li>Practice daily for 5-10 minutes</li></ol><h4>Multisensory Activities:</h4><ul><li>Sandpaper letters for tactile learning</li><li>Air writing for kinesthetic practice</li><li>Songs and rhymes for auditory reinforcement</li><li>Picture cards for visual association</li></ul>', duration: '18 min', order: 2 },
    { id: 'l10', courseId: 'c3', module: 'Blending & Segmenting', title: 'Blending Sounds into Words', type: 'video', url: 'https://www.youtube.com/embed/RPTqBCdR1L4', duration: '20 min', order: 3 },
    // Child Psychology (c4)
    { id: 'l11', courseId: 'c4', module: 'Child Development Stages', title: "Piaget's Stages of Cognitive Development", type: 'video', url: 'https://www.youtube.com/embed/TRF27F2bn-A', duration: '22 min', order: 1 },
    { id: 'l12', courseId: 'c4', module: 'Cognitive Development', title: 'Understanding How Children Learn', type: 'text', content: '<h3>How Children Learn</h3><p>Understanding the cognitive processes in children helps educators create more effective learning experiences.</p><h4>Key Learning Theories:</h4><ul><li><strong>Constructivism (Piaget)</strong>: Children build knowledge through active exploration</li><li><strong>Social Learning (Vygotsky)</strong>: Learning happens through social interaction and the Zone of Proximal Development (ZPD)</li><li><strong>Behaviorism (Skinner)</strong>: Learning through reinforcement and reward</li><li><strong>Multiple Intelligences (Gardner)</strong>: 8 types of intelligence beyond IQ</li></ul><h4>Practical Implications:</h4><p>Use hands-on activities, collaborative projects, positive reinforcement, and varied teaching strategies to accommodate different learning styles.</p>', duration: '25 min', order: 2 },
    { id: 'l13', courseId: 'c4', module: 'Emotional & Social Development', title: 'Emotional Intelligence in Children', type: 'video', url: 'https://www.youtube.com/embed/Y7m9eNoB3NU', duration: '18 min', order: 3 },
    // Course Books (PDF only)
    { id: 'lb1', courseId: 'c1', module: 'Course Books', title: 'AMT-001: Pre-School Management', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 10, pdf: 'assets/pdfs/amt-001-preschool-management.pdf' },
    { id: 'lb2', courseId: 'c4', module: 'Course Books', title: 'AMT-002: Foundations of Educational Psychology', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 10, pdf: 'assets/pdfs/amt-002-educational-psychology.pdf' },
    { id: 'lb3', courseId: 'c1', module: 'Course Books', title: 'AMT-003: Montessori Philosophy and Method', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 11, pdf: 'assets/pdfs/amt-003-montessori-philosophy.pdf' },
    { id: 'lb4', courseId: 'c1', module: 'Course Books', title: 'AMT-004: Pre-School Education', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 12, pdf: 'assets/pdfs/amt-004-preschool-education.pdf' },
    // --- New: Phonics A–Z + Storytelling lessons ---
    { id: 'lphx1', courseId: 'c5', module: 'A – I', title: "Letter Aa — Apple", type: 'text', content: "<h3>Aa  ·  /æ/</h3><p><strong>Example words:</strong> <strong>A</strong>pple · <strong>A</strong>nt · <strong>A</strong>stronaut</p><p><strong>Articulation cue:</strong> Open mouth wide, tongue rests low and flat.</p><p><strong>Trainer's tip:</strong> Short /a/. Use sandpaper letters; trace with finger while voicing the sound.</p>", duration: '3 min', order: 1 },
    { id: 'lphx2', courseId: 'c5', module: 'A – I', title: "Letter Bb — Ball", type: 'text', content: "<h3>Bb  ·  /b/</h3><p><strong>Example words:</strong> <strong>B</strong>all · <strong>B</strong>ear · <strong>B</strong>alloon</p><p><strong>Articulation cue:</strong> Press both lips together, release with a puff of voice.</p><p><strong>Trainer's tip:</strong> Voiced consonant. Pair with /p/ later to teach voiced vs. unvoiced pairs.</p>", duration: '3 min', order: 2 },
    { id: 'lphx3', courseId: 'c5', module: 'A – I', title: "Letter Cc — Cat", type: 'text', content: "<h3>Cc  ·  /k/</h3><p><strong>Example words:</strong> <strong>C</strong>at · <strong>C</strong>up · <strong>C</strong>arrot</p><p><strong>Articulation cue:</strong> Back of tongue rises to soft palate, brief puff.</p><p><strong>Trainer's tip:</strong> Hard C. Introduce soft C (/s/) only after the hard sound is secure.</p>", duration: '3 min', order: 3 },
    { id: 'lphx4', courseId: 'c5', module: 'A – I', title: "Letter Dd — Dog", type: 'text', content: "<h3>Dd  ·  /d/</h3><p><strong>Example words:</strong> <strong>D</strong>og · <strong>D</strong>rum · <strong>D</strong>uck</p><p><strong>Articulation cue:</strong> Tongue tip taps behind top teeth, released with voice.</p><p><strong>Trainer's tip:</strong> Voiced pair to /t/. Place child's hand on throat to feel vibration.</p>", duration: '3 min', order: 4 },
    { id: 'lphx5', courseId: 'c5', module: 'A – I', title: "Letter Ee — Egg", type: 'text', content: "<h3>Ee  ·  /ɛ/</h3><p><strong>Example words:</strong> <strong>E</strong>gg · <strong>E</strong>lephant · <strong>E</strong>lbow</p><p><strong>Articulation cue:</strong> Mouth slightly open, tongue mid-front, lips relaxed.</p><p><strong>Trainer's tip:</strong> Short /e/. Practise with echo games: teacher says /e/, child repeats.</p>", duration: '3 min', order: 5 },
    { id: 'lphx6', courseId: 'c5', module: 'A – I', title: "Letter Ff — Fish", type: 'text', content: "<h3>Ff  ·  /f/</h3><p><strong>Example words:</strong> <strong>F</strong>ish · <strong>F</strong>rog · <strong>F</strong>eather</p><p><strong>Articulation cue:</strong> Upper teeth touch lower lip, air flows through — no voice.</p><p><strong>Trainer's tip:</strong> Unvoiced fricative. Use paper-blowing to feel the airflow.</p>", duration: '3 min', order: 6 },
    { id: 'lphx7', courseId: 'c5', module: 'A – I', title: "Letter Gg — Goat", type: 'text', content: "<h3>Gg  ·  /g/</h3><p><strong>Example words:</strong> <strong>G</strong>oat · <strong>G</strong>arden · <strong>G</strong>rape</p><p><strong>Articulation cue:</strong> Back of tongue lifts to soft palate, releases with voice.</p><p><strong>Trainer's tip:</strong> Hard G. Defer soft G (/dʒ/) until the child is confident.</p>", duration: '3 min', order: 7 },
    { id: 'lphx8', courseId: 'c5', module: 'A – I', title: "Letter Hh — Hat", type: 'text', content: "<h3>Hh  ·  /h/</h3><p><strong>Example words:</strong> <strong>H</strong>at · <strong>H</strong>orse · <strong>H</strong>ouse</p><p><strong>Articulation cue:</strong> Mouth open, warm breath flows out — no tongue movement.</p><p><strong>Trainer's tip:</strong> Like fogging a mirror. Have child exhale onto their hand to feel the sound.</p>", duration: '3 min', order: 8 },
    { id: 'lphx9', courseId: 'c5', module: 'A – I', title: "Letter Ii — Igloo", type: 'text', content: "<h3>Ii  ·  /ɪ/</h3><p><strong>Example words:</strong> <strong>I</strong>gloo · <strong>I</strong>nk · <strong>I</strong>nsect</p><p><strong>Articulation cue:</strong> Mouth slightly open, tongue high-front, lips relaxed.</p><p><strong>Trainer's tip:</strong> Short /i/. Contrast with long /iː/ later (as in 'ice').</p>", duration: '3 min', order: 9 },
    { id: 'lphx10', courseId: 'c5', module: 'J – R', title: "Letter Jj — Jug", type: 'text', content: "<h3>Jj  ·  /dʒ/</h3><p><strong>Example words:</strong> <strong>J</strong>ug · <strong>J</strong>am · <strong>J</strong>et</p><p><strong>Articulation cue:</strong> Tongue starts at ridge behind teeth, lips slightly rounded.</p><p><strong>Trainer's tip:</strong> Always voiced. Use 'juicy' words to make the sound memorable.</p>", duration: '3 min', order: 10 },
    { id: 'lphx11', courseId: 'c5', module: 'J – R', title: "Letter Kk — Kite", type: 'text', content: "<h3>Kk  ·  /k/</h3><p><strong>Example words:</strong> <strong>K</strong>ite · <strong>K</strong>ing · <strong>K</strong>ey</p><p><strong>Articulation cue:</strong> Back of tongue lifts to soft palate, unvoiced puff.</p><p><strong>Trainer's tip:</strong> Same sound as hard C. Teach K after C to build the bridge.</p>", duration: '3 min', order: 11 },
    { id: 'lphx12', courseId: 'c5', module: 'J – R', title: "Letter Ll — Lion", type: 'text', content: "<h3>Ll  ·  /l/</h3><p><strong>Example words:</strong> <strong>L</strong>ion · <strong>L</strong>eaf · <strong>L</strong>amp</p><p><strong>Articulation cue:</strong> Tongue tip touches ridge behind top teeth, voice flows on sides.</p><p><strong>Trainer's tip:</strong> Show child tongue placement in a mirror; a lateral sound.</p>", duration: '3 min', order: 12 },
    { id: 'lphx13', courseId: 'c5', module: 'J – R', title: "Letter Mm — Monkey", type: 'text', content: "<h3>Mm  ·  /m/</h3><p><strong>Example words:</strong> <strong>M</strong>onkey · <strong>M</strong>oon · <strong>M</strong>ouse</p><p><strong>Articulation cue:</strong> Lips pressed together, humming through the nose.</p><p><strong>Trainer's tip:</strong> Nasal, continuous sound. Perfect for stretching: mmmmm.</p>", duration: '3 min', order: 13 },
    { id: 'lphx14', courseId: 'c5', module: 'J – R', title: "Letter Nn — Nest", type: 'text', content: "<h3>Nn  ·  /n/</h3><p><strong>Example words:</strong> <strong>N</strong>est · <strong>N</strong>et · <strong>N</strong>ose</p><p><strong>Articulation cue:</strong> Tongue tip touches ridge behind top teeth, humming through nose.</p><p><strong>Trainer's tip:</strong> Another nasal. Contrast with /m/: lips closed vs. lips open.</p>", duration: '3 min', order: 14 },
    { id: 'lphx15', courseId: 'c5', module: 'J – R', title: "Letter Oo — Octopus", type: 'text', content: "<h3>Oo  ·  /ɒ/</h3><p><strong>Example words:</strong> <strong>O</strong>ctopus · <strong>O</strong>range · <strong>O</strong>live</p><p><strong>Articulation cue:</strong> Mouth open and rounded, tongue low.</p><p><strong>Trainer's tip:</strong> Short /o/. Build muscle memory with circle-shaped object sorting.</p>", duration: '3 min', order: 15 },
    { id: 'lphx16', courseId: 'c5', module: 'J – R', title: "Letter Pp — Pig", type: 'text', content: "<h3>Pp  ·  /p/</h3><p><strong>Example words:</strong> <strong>P</strong>ig · <strong>P</strong>en · <strong>P</strong>umpkin</p><p><strong>Articulation cue:</strong> Press both lips together, release with a puff — no voice.</p><p><strong>Trainer's tip:</strong> Unvoiced pair to /b/. Hold a tissue — /p/ moves it, /b/ doesn't.</p>", duration: '3 min', order: 16 },
    { id: 'lphx17', courseId: 'c5', module: 'J – R', title: "Letter Qq — Queen", type: 'text', content: "<h3>Qq  ·  /kw/</h3><p><strong>Example words:</strong> <strong>Q</strong>ueen · <strong>Q</strong>uilt · <strong>Q</strong>uail</p><p><strong>Articulation cue:</strong> Back of tongue lifts, lips round: two blended sounds — /k/ + /w/.</p><p><strong>Trainer's tip:</strong> Q is almost always followed by U. Teach 'qu' as a unit.</p>", duration: '3 min', order: 17 },
    { id: 'lphx18', courseId: 'c5', module: 'J – R', title: "Letter Rr — Rabbit", type: 'text', content: "<h3>Rr  ·  /r/</h3><p><strong>Example words:</strong> <strong>R</strong>abbit · <strong>R</strong>ed · <strong>R</strong>ainbow</p><p><strong>Articulation cue:</strong> Tongue curls back slightly, lips round, voice flows.</p><p><strong>Trainer's tip:</strong> Can be tricky. Use growling games: 'rrrrrr' like a lion.</p>", duration: '3 min', order: 18 },
    { id: 'lphx19', courseId: 'c5', module: 'S – Z', title: "Letter Ss — Sun", type: 'text', content: "<h3>Ss  ·  /s/</h3><p><strong>Example words:</strong> <strong>S</strong>un · <strong>S</strong>nake · <strong>S</strong>tar</p><p><strong>Articulation cue:</strong> Tongue near ridge, teeth nearly closed, air hisses out.</p><p><strong>Trainer's tip:</strong> Unvoiced. Use snake play: sssssss. Pair with /z/ later.</p>", duration: '3 min', order: 19 },
    { id: 'lphx20', courseId: 'c5', module: 'S – Z', title: "Letter Tt — Tiger", type: 'text', content: "<h3>Tt  ·  /t/</h3><p><strong>Example words:</strong> <strong>T</strong>iger · <strong>T</strong>ree · <strong>T</strong>rain</p><p><strong>Articulation cue:</strong> Tongue tip taps ridge behind top teeth, unvoiced puff.</p><p><strong>Trainer's tip:</strong> Pair with /d/. Clapping rhythm helps internalise the crisp sound.</p>", duration: '3 min', order: 20 },
    { id: 'lphx21', courseId: 'c5', module: 'S – Z', title: "Letter Uu — Umbrella", type: 'text', content: "<h3>Uu  ·  /ʌ/</h3><p><strong>Example words:</strong> <strong>U</strong>mbrella · <strong>U</strong>ncle · <strong>U</strong>p</p><p><strong>Articulation cue:</strong> Mouth relaxed, slightly open, tongue mid-central.</p><p><strong>Trainer's tip:</strong> Short /u/. Often confused with /a/ — isolate with matched word pairs.</p>", duration: '3 min', order: 21 },
    { id: 'lphx22', courseId: 'c5', module: 'S – Z', title: "Letter Vv — Van", type: 'text', content: "<h3>Vv  ·  /v/</h3><p><strong>Example words:</strong> <strong>V</strong>an · <strong>V</strong>iolin · <strong>V</strong>ase</p><p><strong>Articulation cue:</strong> Upper teeth touch lower lip, air flows with voice.</p><p><strong>Trainer's tip:</strong> Voiced pair to /f/. Hand on throat to feel the difference.</p>", duration: '3 min', order: 22 },
    { id: 'lphx23', courseId: 'c5', module: 'S – Z', title: "Letter Ww — Water", type: 'text', content: "<h3>Ww  ·  /w/</h3><p><strong>Example words:</strong> <strong>W</strong>ater · <strong>W</strong>olf · <strong>W</strong>eb</p><p><strong>Articulation cue:</strong> Lips tightly rounded, glide to next vowel.</p><p><strong>Trainer's tip:</strong> Glide consonant. Always precedes a vowel; practise 'wa', 'we', 'wi'.</p>", duration: '3 min', order: 23 },
    { id: 'lphx24', courseId: 'c5', module: 'S – Z', title: "Letter Xx — Fox", type: 'text', content: "<h3>Xx  ·  /ks/</h3><p><strong>Example words:</strong> <strong>F</strong>ox · <strong>B</strong>ox · <strong>S</strong>ix</p><p><strong>Articulation cue:</strong> Blend of /k/ + /s/ — brief puff then hiss.</p><p><strong>Trainer's tip:</strong> X usually ends words. Teach the sound first, spelling later.</p>", duration: '3 min', order: 24 },
    { id: 'lphx25', courseId: 'c5', module: 'S – Z', title: "Letter Yy — Yo-yo", type: 'text', content: "<h3>Yy  ·  /j/</h3><p><strong>Example words:</strong> <strong>Y</strong>o-yo · <strong>Y</strong>ellow · <strong>Y</strong>ak</p><p><strong>Articulation cue:</strong> Tongue high-front, lips spread, glide into vowel.</p><p><strong>Trainer's tip:</strong> At the start of words it's /j/. End of words, often /iː/ as in 'happy'.</p>", duration: '3 min', order: 25 },
    { id: 'lphx26', courseId: 'c5', module: 'S – Z', title: "Letter Zz — Zebra", type: 'text', content: "<h3>Zz  ·  /z/</h3><p><strong>Example words:</strong> <strong>Z</strong>ebra · <strong>Z</strong>ip · <strong>Z</strong>oo</p><p><strong>Articulation cue:</strong> Tongue near ridge, teeth nearly closed, voice buzzes out.</p><p><strong>Trainer's tip:</strong> Voiced pair to /s/. Bee-buzzing games make it stick: zzzzzz.</p>", duration: '3 min', order: 26 },
    { id: 'lphx_deck', courseId: 'c5', module: 'Course Deck', title: 'Phonics A–Z — Full Slide Deck', type: 'text', content: '<p>Download the full 29-slide training deck with rainbow letter design, A–Z overview, and trainer guide.</p>', duration: '', order: 100, pdf: 'assets/decks/Phonics_A_to_Z_Teacher_Training.pptx' },
    { id: 'lstr1', courseId: 'c6', module: 'Introduction', title: "Welcome & course overview", type: 'text', content: "<h3>The Art of Storytelling for Young Minds</h3><p>An 18-lesson training module for Ansha Casa guides teaching children aged 3–5. You will learn how to prepare, structure, voice, and tell stories that quietly plant Montessori values: kindness, sharing, patience, and courage.</p><p><em>Download the slide deck at the end of the course for a printable reference.</em></p>", duration: '5 min', order: 1 },
    { id: 'lstr2', courseId: 'c6', module: 'Foundations', title: "Why stories matter at 3–5", type: 'text', content: "<h3>The developing mind at 3–5</h3><ul><li><strong>1000+ new words a year</strong> — ages 3–5 is the language explosion.</li><li><strong>90% brain growth by 5</strong> — most neural architecture is set.</li><li><strong>Rhythm before meaning</strong> — children absorb cadence long before words.</li><li><strong>Seeds that bloom later</strong> — a value told at 3 may surface at 13.</li></ul>", duration: '5 min', order: 2 },
    { id: 'lstr3', courseId: 'c6', module: 'Foundations', title: "The storyteller's mindset", type: 'text', content: "<h3>You are the gardener — not the flower</h3><ol><li>The story serves the child — you are the messenger.</li><li>Calm is the first gift — your breath sets the tempo.</li><li>Less expression, more intention — soft voice reaches further than loud.</li><li>Trust the silence — children think during your pauses.</li></ol>", duration: '5 min', order: 3 },
    { id: 'lstr4', courseId: 'c6', module: 'The Craft', title: "Five principles of Casa-age storytelling", type: 'text', content: "<h3>Every story should pass these five tests</h3><ol><li><strong>Short enough</strong> — 3 to 5 minutes maximum.</li><li><strong>Concrete</strong> — real animals, real objects. Defer metaphor.</li><li><strong>Repetitive</strong> — a refrain they can echo by the third telling.</li><li><strong>Emotionally safe</strong> — no fear, no sudden loss, no wicked villains.</li><li><strong>One seed, one value</strong> — a single lesson, never two at once.</li></ol>", duration: '5 min', order: 4 },
    { id: 'lstr5', courseId: 'c6', module: 'The Craft', title: "Preparing the space & yourself", type: 'text', content: "<h3>Before you begin</h3><h4>The space</h4><ul><li>Soft warm light, no overhead glare</li><li>A circle of floor cushions on a natural rug</li><li>A small low basket for your story props</li><li>Empty walls in the child's line of sight</li></ul><h4>Yourself</h4><ul><li>Three slow breaths before you sit</li><li>Release the morning's events — arrive here</li><li>Let your eyes meet each child, one by one</li><li>Begin only when your body is still</li></ul>", duration: '5 min', order: 5 },
    { id: 'lstr6', courseId: 'c6', module: 'The Craft', title: "Anatomy of a story", type: 'text', content: "<h3>A simple, reliable shape</h3><ol><li><strong>Opening phrase</strong> — the same one every time: \"Once in a little wooden house...\"</li><li><strong>One character</strong> — one protagonist only.</li><li><strong>One small problem</strong> — a lost mitten, a cold bird.</li><li><strong>One or two events + a refrain</strong> — a repeating phrase children echo.</li><li><strong>Closing phrase</strong> — \"And that is the story of...\"</li></ol>", duration: '5 min', order: 6 },
    { id: 'lstr7', courseId: 'c6', module: 'The Instrument', title: "Voice — pace, pause, volume", type: 'text', content: "<h3>Your three tools</h3><p><strong>Pace:</strong> slower than you think. Count silently one-two-three after each sentence.</p><p><strong>Pause:</strong> 2–3 seconds before a surprise; longer at the end. Do not fear the quiet.</p><p><strong>Volume:</strong> soften for a secret, warm for love, never loud or sharp. Whisper the most important line.</p>", duration: '5 min', order: 7 },
    { id: 'lstr8', courseId: 'c6', module: 'The Instrument', title: "Body & gesture", type: 'text', content: "<h3>Your stillness is the frame</h3><ul><li>Sit at the children's level — feet tucked, spine long.</li><li>Small, slow gestures — a hand that rises once means more than ten flourishes.</li><li>Let your face carry the story, not your arms.</li><li>Use stillness as a tool — freeze before the important moment.</li></ul>", duration: '5 min', order: 8 },
    { id: 'lstr9', courseId: 'c6', module: 'The Instrument', title: "Story props & materials", type: 'text', content: "<h3>The Montessori story basket</h3><ul><li><strong>Small wooden animals</strong> — hand-carved, unpainted.</li><li><strong>Natural objects</strong> — pine cones, stones, shells, dried leaves.</li><li><strong>Peg dolls</strong> — simple, faceless figures for family stories.</li><li><strong>Cloth backdrops</strong> — green for meadow, blue for sea, brown for earth.</li></ul><h4>How to use</h4><ol><li>Reveal one object at a time — slowly.</li><li>Place each on the cloth with reverence.</li><li>Leave everything in view until the story ends.</li><li>Let children look, never let them grab.</li></ol>", duration: '5 min', order: 9 },
    { id: 'lstr10', courseId: 'c6', module: 'Value Stories', title: "KINDNESS — The Sparrow and the Bread", type: 'text', content: "<h3>The Sparrow and the Bread</h3><p><em>A little girl · A hungry sparrow</em></p><p>On a cold winter morning, a sparrow lands at a little girl's window. She is eating a small piece of bread — her whole breakfast. She looks at the bird. She looks at her bread. She opens the window. The sparrow's eyes grow wide. She breaks the bread in two and gives half.</p><p><strong>Refrain:</strong> \"Not all who are small need little.\"</p><p><strong>When to tell it:</strong> when you notice a child closing off from others. Do not mention them by name.</p>", duration: '5 min', order: 10 },
    { id: 'lstr11', courseId: 'c6', module: 'Value Stories', title: "SHARING — Two Spoons", type: 'text', content: "<h3>Two Spoons</h3><p><em>Two children · One bowl of warm porridge</em></p><p>Two little children sat by a bowl. There was only one spoon on the shelf. The first child reached for it. The second child reached for it. They pulled. They frowned. Then the first child said, \"One for you.\" She ate. \"One for me.\" She passed the spoon. The porridge was gone before they knew it.</p><p><strong>Refrain:</strong> \"One for you, one for me.\"</p><p><strong>When to tell it:</strong> after a sharing disagreement has passed — not in the middle of one.</p>", duration: '5 min', order: 11 },
    { id: 'lstr12', courseId: 'c6', module: 'Value Stories', title: "PATIENCE — The Little Seed Who Waited", type: 'text', content: "<h3>The Little Seed Who Waited</h3><p><em>A small brown seed · The rain · The sun</em></p><p>Deep in the dark earth, a little seed woke up. It was cold. It was damp. It wanted to see the sun. But the seed waited. The rain came. The seed waited. The cold came. Still, the seed waited. One morning — a tiny green shoot. And then, the sun.</p><p><strong>Refrain:</strong> \"Still, still, the seed waits.\"</p><p><strong>When to tell it:</strong> pair this with a real seed-and-soil activity in the week that follows.</p>", duration: '5 min', order: 12 },
    { id: 'lstr13', courseId: 'c6', module: 'Value Stories', title: "COURAGE — The Quiet Bear", type: 'text', content: "<h3>The Quiet Bear</h3><p><em>A small brown bear · A wide cool river</em></p><p>A small bear lived by a river. Every day he walked to the bank. Every day the river looked too big. One morning, without knowing why, he placed one paw on the cool water. Then another. Then — he was swimming. The river was no smaller. But the bear was braver.</p><p><strong>Refrain:</strong> \"One small step today.\"</p><p><strong>When to tell it:</strong> when you see a child hesitating before a new work they wish to try.</p>", duration: '5 min', order: 13 },
    { id: 'lstr14', courseId: 'c6', module: 'Delivery', title: "Repetition & participation", type: 'text', content: "<h3>The magic of the refrain</h3><ul><li>Repeat a phrase three times per story.</li><li>Tell the same story 3–5 times across weeks.</li><li>Invite echo, never quizzing: \"Say it with me.\"</li><li>Celebrate every small voice — a whisper, a nod, a look.</li></ul>", duration: '5 min', order: 14 },
    { id: 'lstr15', courseId: 'c6', module: 'Delivery', title: "What to avoid — always", type: 'text', content: "<h3>Six things we do not bring into the circle</h3><ol><li>Scary villains & dark imagery.</li><li>Too many characters — one is best.</li><li>Abstract morals — show, never preach.</li><li>Over-acting & theatrics — whispers are louder.</li><li>Quizzing the child after.</li><li>Rushed endings — never hurry the last line.</li></ol>", duration: '5 min', order: 15 },
    { id: 'lstr16', courseId: 'c6', module: 'Delivery', title: "After the story — the afterglow", type: 'text', content: "<h3>How to end</h3><ol><li>Breathe together — ten slow seconds.</li><li>Do not quiz — trust the seed has been planted.</li><li>Listen, don't correct — every reading is valid.</li><li>Leave the props visible for a day or two.</li><li>Re-tell later — a week, a month, a year.</li></ol>", duration: '5 min', order: 16 },
    { id: 'lstr17', courseId: 'c6', module: 'Practice', title: "Build your story collection", type: 'text', content: "<h3>The teacher's journal</h3><ol><li>Keep a small notebook — one story per page.</li><li>Collect 10 stories per Montessori value.</li><li>Practice aloud, never in your head.</li><li>Share with colleagues — exchange monthly.</li><li>Retire any story that no longer serves the child.</li></ol>", duration: '5 min', order: 17 },
    { id: 'lstr18', courseId: 'c6', module: 'Practice', title: "Your four-week practice plan", type: 'text', content: "<h3>Plant one story. Tend it for four weeks.</h3><ul><li><strong>Week 01:</strong> Choose one value, one story. Write it in five sentences.</li><li><strong>Week 02:</strong> Tell it three times. Observe the room.</li><li><strong>Week 03:</strong> Add a single prop.</li><li><strong>Week 04:</strong> Teach a colleague.</li></ul>", duration: '5 min', order: 18 },
    { id: 'lstr_deck', courseId: 'c6', module: 'Course Deck', title: 'Storytelling — Full Slide Deck', type: 'text', content: '<p>Download the full 18-slide training deck with four Montessori value stories and a four-week practice plan.</p>', duration: '', order: 100, pdf: 'assets/decks/Storytelling_for_Young_Minds.pptx' },
  ];
  dbSet(DB.LESSONS, lessons);

  /* --- Quizzes --- */
  const quizzes = [
    {
      id: 'q1', courseId: 'c1', title: 'Advance Montessori Teacher Training — Assessment',
      timeLimit: 30, passMark: 60,
      questions: [
        { id: 'qq1',  text: 'Who developed the Montessori method of education?', options: ['Friedrich Froebel', 'Maria Montessori', 'Jean Piaget', 'John Dewey'], correct: 1 },
        { id: 'qq2',  text: 'In which year was Dr. Maria Montessori born?', options: ['1860', '1870', '1880', '1890'], correct: 1 },
        { id: 'qq3',  text: 'What age range is considered the "absorbent mind" period?', options: ['0-3 years only', '3-6 years only', '0-6 years', '6-12 years'], correct: 2 },
        { id: 'qq4',  text: 'What are "sensitive periods" in Montessori education?', options: ['Times when children are emotionally sensitive', 'Windows of opportunity for optimal learning', 'Periods when children need more sleep', 'Times for sensory play only'], correct: 1 },
        { id: 'qq5',  text: 'In the Montessori method, what is the primary role of the teacher?', options: ['Direct instructor and lecturer', 'Guide and observer', 'Disciplinarian', 'Entertainer'], correct: 1 },
        { id: 'qq6',  text: 'Which of these is a key characteristic of the Montessori prepared environment?', options: ['Teacher-centered layout', 'Fixed desks facing the board', 'Child-sized, accessible materials', 'Lots of colourful wall decorations'], correct: 2 },
        { id: 'qq7',  text: 'What does "auto-education" mean in Montessori philosophy?', options: ['Learning through technology', 'Children naturally desire to learn and teach themselves', 'Self-discipline through punishment', 'Memorising lessons independently'], correct: 1 },
        { id: 'qq8',  text: 'Which area is NOT typically part of a Montessori classroom?', options: ['Practical Life', 'Sensorial', 'Competitive sports arena', 'Language'], correct: 2 },
        { id: 'qq9',  text: 'The sensitive period for ORDER in children is strongest during:', options: ['Birth to 6 years', '6 to 9 years', '9 to 12 years', '12 to 15 years'], correct: 0 },
        { id: 'qq10', text: 'What is the purpose of Montessori sensorial materials?', options: ['Teach children to read', 'Refine and develop the five senses', 'Improve mathematics skills', 'Develop social skills'], correct: 1 },
        { id: 'qq11', text: 'The "Three Period Lesson" in Montessori is used to:', options: ['Plan a day in three sections', 'Introduce, recognise and recall new vocabulary/concepts', 'Divide children into three ability groups', 'Teach three subjects simultaneously'], correct: 1 },
        { id: 'qq12', text: 'In a Montessori pre-school, mixed age grouping means:', options: ['Children of different nationalities', 'Children aged 3-6 learn together in one classroom', 'Boys and girls are mixed', 'Different subjects taught at the same time'], correct: 1 },
        { id: 'qq13', text: 'Which principle states that children pass through stages where they are highly sensitive to certain stimuli?', options: ['Prepared Environment', 'Absorbent Mind', 'Sensitive Periods', 'Freedom within Limits'], correct: 2 },
        { id: 'qq14', text: 'What is the correct term for the Montessori concept of "freedom within limits"?', options: ['Children do whatever they want', 'Children choose activities within a structured, respectful boundary', 'No rules in the classroom', 'Only teachers decide activities'], correct: 1 },
        { id: 'qq15', text: 'Practical Life activities in Montessori help children develop:', options: ['Advanced mathematics', 'Independence, coordination and concentration', 'Reading and writing only', 'Computer skills'], correct: 1 },
        { id: 'qq16', text: 'The Montessori Pink Tower is primarily a __ material.', options: ['Language', 'Mathematics', 'Sensorial', 'Practical Life'], correct: 2 },
        { id: 'qq17', text: 'According to Montessori, what should a teacher do when a child is deeply concentrating?', options: ['Interrupt to check understanding', 'Praise loudly to encourage others', 'Observe quietly and not disturb', 'Move the child to a group activity'], correct: 2 },
        { id: 'qq18', text: 'Which document outlines the daily management and administration of a Montessori pre-school?', options: ['Lesson plan', 'School prospectus', 'Pre-school management handbook', 'Observation journal'], correct: 2 },
        { id: 'qq19', text: 'Parent–teacher communication in a Montessori school is best described as:', options: ['Formal reports twice a year', 'Ongoing, collaborative partnership', 'Only when a problem arises', 'Not encouraged'], correct: 1 },
        { id: 'qq20', text: 'Which of the following best describes "normalisation" in Montessori?', options: ['Teaching children to behave normally', 'A state of deep focus, self-discipline and joy in work', 'Giving all children the same tasks', 'Standardised test performance'], correct: 1 },
      ]
    },
    {
      id: 'q2', courseId: 'c2', title: 'Spoken English — Assessment',
      timeLimit: 30, passMark: 60,
      questions: [
        { id: 'qq21', text: 'Which sentence uses correct subject-verb agreement?', options: ['The children was playing.', 'The children were playing.', 'The children is playing.', 'The children be playing.'], correct: 1 },
        { id: 'qq22', text: 'What is the correct form? "She ___ to school every day."', options: ['go', 'goes', 'going', 'gone'], correct: 1 },
        { id: 'qq23', text: 'Which word is a conjunction?', options: ['Quickly', 'Beautiful', 'Because', 'Table'], correct: 2 },
        { id: 'qq24', text: 'Rising intonation is typically used for:', options: ['Statements', 'Yes/No questions', 'Commands', 'Exclamations'], correct: 1 },
        { id: 'qq25', text: 'Which is an example of active voice?', options: ['The book was read by Sara.', 'Sara read the book.', 'The book is being read.', 'The book had been read.'], correct: 1 },
        { id: 'qq26', text: 'Which tense is used for an action happening right now?', options: ['Simple Past', 'Present Perfect', 'Present Continuous', 'Past Continuous'], correct: 2 },
        { id: 'qq27', text: 'What is a "diphthong"?', options: ['A silent letter', 'A combination of two vowel sounds in one syllable', 'A type of consonant cluster', 'A punctuation mark'], correct: 1 },
        { id: 'qq28', text: 'Which sentence is grammatically correct?', options: ['I am agree with you.', 'I agree with you.', 'I agreeing with you.', 'I does agree with you.'], correct: 1 },
        { id: 'qq29', text: 'The word "beautiful" is an example of a/an:', options: ['Noun', 'Verb', 'Adjective', 'Adverb'], correct: 2 },
        { id: 'qq30', text: 'Classroom English for teachers includes phrases like:', options: ['"Open your books to page 10."', '"Ye karo."', '"Go home now."', '"I do not know."'], correct: 0 },
        { id: 'qq31', text: 'Which is the correct question form?', options: ['Where you are going?', 'Where are you going?', 'Where going are you?', 'You are going where?'], correct: 1 },
        { id: 'qq32', text: 'Stress-timed rhythm means:', options: ['All syllables take equal time', 'Stressed syllables occur at regular intervals', 'Only nouns are stressed', 'Verbs are never stressed'], correct: 1 },
        { id: 'qq33', text: 'Which is the best way to improve English pronunciation?', options: ['Only reading silently', 'Recording yourself and comparing with native speakers', 'Memorising dictionary definitions', 'Avoiding difficult words'], correct: 1 },
        { id: 'qq34', text: '"I have been teaching for five years." This sentence is in:', options: ['Simple Present', 'Present Perfect Continuous', 'Past Perfect', 'Future Continuous'], correct: 1 },
        { id: 'qq35', text: 'Which word is spelled correctly?', options: ['Recieve', 'Recive', 'Receive', 'Receeve'], correct: 2 },
        { id: 'qq36', text: 'The plural of "child" is:', options: ['Childs', 'Childes', 'Children', 'Childrens'], correct: 2 },
        { id: 'qq37', text: 'Which sentence uses the correct article?', options: ['She is a honest woman.', 'She is an honest woman.', 'She is the honest woman.', 'She is honest woman.'], correct: 1 },
        { id: 'qq38', text: 'To speak fluently means:', options: ['Speaking very loudly', 'Speaking smoothly and naturally without long pauses', 'Using very complex vocabulary', 'Speaking with a foreign accent'], correct: 1 },
        { id: 'qq39', text: '"Could you please repeat that?" is an example of:', options: ['A command', 'A polite request', 'A statement', 'A greeting'], correct: 1 },
        { id: 'qq40', text: 'Which is NOT a good strategy for building conversation skills?', options: ['Practising with a partner', 'Listening actively', 'Avoiding eye contact', 'Using open-ended questions'], correct: 2 },
      ]
    },
    {
      id: 'q3', courseId: 'c3', title: 'Phonics Training — Assessment',
      timeLimit: 30, passMark: 60,
      questions: [
        { id: 'qq41', text: 'Phonemic awareness is the ability to:', options: ['Recognize letters of the alphabet', 'Hear and manipulate sounds in spoken words', 'Read words silently', 'Write sentences correctly'], correct: 1 },
        { id: 'qq42', text: 'Which word has a short vowel sound?', options: ['cake', 'bite', 'cat', 'hope'], correct: 2 },
        { id: 'qq43', text: 'Blending means:', options: ['Breaking words into sounds', 'Putting sounds together to form words', 'Rhyming words', 'Spelling words'], correct: 1 },
        { id: 'qq44', text: 'The "ch" in "chair" is an example of:', options: ['A single phoneme', 'A digraph', 'A blend', 'A diphthong'], correct: 1 },
        { id: 'qq45', text: 'Which approach is BEST for phonics instruction?', options: ['Memorising whole words only', 'Systematic, sequential phonics teaching', 'Random letter introduction', 'Visual-only methods'], correct: 1 },
        { id: 'qq46', text: 'How many phonemes (sounds) does the word "ship" have?', options: ['2', '3', '4', '5'], correct: 1 },
        { id: 'qq47', text: 'Segmenting means:', options: ['Joining sounds to make a word', 'Breaking a word into its individual sounds', 'Counting syllables', 'Identifying rhyming words'], correct: 1 },
        { id: 'qq48', text: 'Which letters make the "f" sound in the word "phone"?', options: ['p and h', 'Only p', 'Only h', 'f and e'], correct: 0 },
        { id: 'qq49', text: 'The "silent e" rule means:', options: ['The letter e is never pronounced', 'A final e makes the preceding vowel say its long sound', 'All words ending in e are silent', 'The e changes the consonant sound'], correct: 1 },
        { id: 'qq50', text: 'Which is a CVC (consonant-vowel-consonant) word?', options: ['street', 'play', 'cat', 'bright'], correct: 2 },
        { id: 'qq51', text: 'Sandpaper letters are used in phonics to provide:', options: ['Visual learning only', 'Tactile (touch) learning of letter shapes and sounds', 'Auditory learning through songs', 'Colour-based learning'], correct: 1 },
        { id: 'qq52', text: 'Which is an example of a consonant blend?', options: ['sh', 'ch', 'th', 'st'], correct: 3 },
        { id: 'qq53', text: 'The "oa" in "boat" is an example of:', options: ['A consonant digraph', 'A vowel digraph', 'A blend', 'A silent letter'], correct: 1 },
        { id: 'qq54', text: 'Which sequence is recommended when introducing letters to young learners?', options: ['A to Z in alphabetical order', 'Start with high-frequency letters like s, a, t, i, p, n', 'Start with capital letters', 'Start with vowels only'], correct: 1 },
        { id: 'qq55', text: 'Rhyming helps children develop:', options: ['Mathematical thinking', 'Phonological awareness', 'Writing speed', 'Social skills'], correct: 1 },
        { id: 'qq56', text: 'How many syllables does the word "important" have?', options: ['2', '3', '4', '5'], correct: 1 },
        { id: 'qq57', text: 'Which activity best supports phonemic awareness in young children?', options: ['Copying sentences', 'Singing songs with rhymes and word play', 'Reading silently', 'Memorising spelling lists'], correct: 1 },
        { id: 'qq58', text: 'The term "decodable text" refers to:', options: ['Encrypted secret messages', 'Books where most words can be sounded out using learned phonics rules', 'Picture-only books', 'Stories above the child\'s reading level'], correct: 1 },
        { id: 'qq59', text: 'Which is a long vowel sound?', options: ['The "a" in "cat"', 'The "i" in "sit"', 'The "o" in "note"', 'The "u" in "cup"'], correct: 2 },
        { id: 'qq60', text: 'Multisensory phonics teaching means:', options: ['Teaching through sight only', 'Using seeing, hearing and touch together to reinforce learning', 'Using only audio recordings', 'Teaching through games only'], correct: 1 },
      ]
    },
    {
      id: 'q4', courseId: 'c4', title: 'Child Psychology — Assessment',
      timeLimit: 30, passMark: 60,
      questions: [
        { id: 'qq61', text: "According to Piaget, what stage do most pre-school children (ages 2-7) belong to?", options: ['Sensorimotor', 'Preoperational', 'Concrete Operational', 'Formal Operational'], correct: 1 },
        { id: 'qq62', text: "Vygotsky's Zone of Proximal Development (ZPD) refers to:", options: ['What a child can do alone', 'What a child cannot do even with help', 'The gap between what a child can do alone vs. with guidance', 'A physical development stage'], correct: 2 },
        { id: 'qq63', text: 'Which theorist proposed 8 types of multiple intelligences?', options: ['Sigmund Freud', 'Erik Erikson', 'Howard Gardner', 'B.F. Skinner'], correct: 2 },
        { id: 'qq64', text: 'Attachment theory was primarily developed by:', options: ['Jean Piaget', 'John Bowlby', 'Lev Vygotsky', 'Abraham Maslow'], correct: 1 },
        { id: 'qq65', text: 'Which is a sign of healthy social-emotional development in a 4-year-old?', options: ['Preferring to always play alone', 'Showing empathy and sharing toys', 'Having no emotional reactions', 'Following rules perfectly'], correct: 1 },
        { id: 'qq66', text: 'Erik Erikson\'s theory focuses on:', options: ['Cognitive stages of development', 'Psychosocial stages across the lifespan', 'Language acquisition', 'Behavioural conditioning'], correct: 1 },
        { id: 'qq67', text: 'Which of the following is an example of fine motor development in a 3-year-old?', options: ['Running and jumping', 'Holding a pencil and drawing', 'Climbing stairs', 'Kicking a ball'], correct: 1 },
        { id: 'qq68', text: 'Scaffolding in education (based on Vygotsky) means:', options: ['Building physical structures in school', 'Providing temporary support to help a child reach the next level', 'Testing children frequently', 'Letting children learn entirely on their own'], correct: 1 },
        { id: 'qq69', text: 'Which behaviour management strategy is most effective for young children?', options: ['Punishment and isolation', 'Positive reinforcement and praise', 'Ignoring all behaviour', 'Strict physical discipline'], correct: 1 },
        { id: 'qq70', text: 'A child with ADHD (Attention Deficit Hyperactivity Disorder) typically shows:', options: ['Extreme shyness and social withdrawal', 'Difficulty concentrating, impulsivity and hyperactivity', 'Complete disinterest in all activities', 'Exceptional memory for all subjects'], correct: 1 },
        { id: 'qq71', text: 'According to Maslow\'s Hierarchy of Needs, which need must be met first?', options: ['Self-esteem', 'Love and belonging', 'Physiological needs (food, water, shelter)', 'Self-actualisation'], correct: 2 },
        { id: 'qq72', text: 'The Sensorimotor stage (Piaget) covers the age range of:', options: ['0-2 years', '2-7 years', '7-11 years', '12+ years'], correct: 0 },
        { id: 'qq73', text: 'Object permanence is the understanding that:', options: ['Objects have weight', 'Objects continue to exist even when out of sight', 'Objects can be dangerous', 'Objects have names'], correct: 1 },
        { id: 'qq74', text: 'Which is an appropriate strategy to support a child with learning difficulties?', options: ['Excluding them from group activities', 'Providing individualised support and modified tasks', 'Expecting them to keep up with peers without support', 'Reducing their school hours'], correct: 1 },
        { id: 'qq75', text: 'Play is important for child development because:', options: ['It wastes learning time', 'It develops cognitive, social, emotional and physical skills simultaneously', 'It only develops physical skills', 'It is a reward for good behaviour'], correct: 1 },
        { id: 'qq76', text: 'Which theorist introduced the concept of "classical conditioning"?', options: ['B.F. Skinner', 'Ivan Pavlov', 'Jean Piaget', 'Abraham Maslow'], correct: 1 },
        { id: 'qq77', text: 'Language development in children is fastest during:', options: ['0-5 years', '6-10 years', '10-15 years', '15-18 years'], correct: 0 },
        { id: 'qq78', text: 'A child who is described as having "secure attachment" will:', options: ['Refuse to separate from parents at all', 'Explore confidently knowing their caregiver is available', 'Show no attachment to any adult', 'Be aggressive towards other children'], correct: 1 },
        { id: 'qq79', text: 'Which of the following describes parallel play?', options: ['Two children playing the same game together', 'Children playing near each other but independently', 'A child playing alone in isolation', 'A teacher directing a group game'], correct: 1 },
        { id: 'qq80', text: 'The goal of child psychology in education is to:', options: ['Diagnose and label all children', 'Understand child behaviour and development to create better learning experiences', 'Eliminate all classroom problems', 'Replace parents in the child\'s life'], correct: 1 },
      ]
    }
  ];
  dbSet(DB.QUIZZES, quizzes);

  /* --- Assignments --- */
  const assignments = [
    { id: 'a1', courseId: 'c1', title: 'Describe a Prepared Montessori Environment', description: 'Write a detailed description (300-500 words) of how you would set up a prepared environment for a 3-6 year old Montessori classroom. Include the areas you would create, materials you would provide, and how the arrangement promotes independence and learning.', dueDate: '2026-04-01', maxMarks: 20, teacherId: 'u2' },
    { id: 'a2', courseId: 'c2', title: 'Self-Introduction Speech', description: 'Write a 2-minute self-introduction speech in English (150-200 words). Focus on clear pronunciation, proper grammar, and confident delivery. Include your name, background, why you are taking this course, and your goals.', dueDate: '2026-04-05', maxMarks: 15, teacherId: 'u3' },
    { id: 'a3', courseId: 'c3', title: 'Phonics Lesson Plan', description: 'Create a detailed lesson plan for teaching the letter sound "S" to a group of 5-year-olds. Include: learning objectives, materials needed, introduction activity, main teaching activity, practice activity, assessment method, and accommodations for different learners.', dueDate: '2026-04-10', maxMarks: 25, teacherId: 'u2' },
    { id: 'a4', courseId: 'c4', title: 'Child Observation Report', description: 'Observe a child aged 3-7 years for 30 minutes in a natural setting (home, classroom, or playground). Write a structured observation report (400-600 words) documenting: physical, cognitive, social, and emotional behaviors observed. Relate your observations to the developmental theories covered in class.', dueDate: '2026-04-15', maxMarks: 30, teacherId: 'u3' },
  ];
  dbSet(DB.ASSIGNMENTS, assignments);

  /* --- Enrollments --- */
  const enrollments = [
    { id: 'e1', studentId: 'u4', courseId: 'c1', enrolledAt: '2024-02-05T00:00:00Z', progress: 50, status: 'active', feeStatus: 'paid' },
    { id: 'e2', studentId: 'u4', courseId: 'c3', enrolledAt: '2024-02-05T00:00:00Z', progress: 33, status: 'active', feeStatus: 'pending' },
  ];
  dbSet(DB.ENROLLMENTS, enrollments);

  /* --- Progress --- */
  const progress = [
    { id: 'p1', studentId: 'u4', lessonId: 'l1', completed: true, completedAt: '2024-02-10T00:00:00Z' },
    { id: 'p2', studentId: 'u4', lessonId: 'l2', completed: true, completedAt: '2024-02-12T00:00:00Z' },
    { id: 'p3', studentId: 'u4', lessonId: 'l8', completed: true, completedAt: '2024-02-14T00:00:00Z' },
  ];
  dbSet(DB.PROGRESS, progress);

  /* --- Notices --- */
  const notices = [
    { id: 'n1', title: 'Welcome to Ansha Montessori LMS!', body: 'We are delighted to launch our new online learning platform. All students can now access course materials, quizzes, and assignments from anywhere.', type: 'info', date: '2024-03-01T00:00:00Z' },
    { id: 'n2', title: 'New Course: Child Psychology Batch Starting', body: 'A new batch for Child Psychology course is starting on April 1st. Limited seats available — enroll now to secure your spot.', type: 'urgent', date: '2024-03-05T00:00:00Z' },
    { id: 'n3', title: 'Assignment Submission Reminder', body: 'Please ensure all assignments are submitted before the due date. Late submissions may result in reduced marks.', type: 'normal', date: '2024-03-08T00:00:00Z' },
  ];
  dbSet(DB.NOTICES, notices);

  /* --- Admissions --- */
  const admissions = [
    {
      id: 'adm1', studentName: 'Ayesha Khan', fatherName: 'Muhammad Khan',
      dob: '2000-05-15', cnic: '35202-1234567-8', gender: 'Female',
      phone: '+91-98765-43213', email: 'ayesha@student.edu',
      address: 'House 12, Street 4, Gulberg, Lahore',
      course: 'c1', appliedAt: '2024-01-28T00:00:00Z',
      status: 'approved', notes: 'Excellent academic background', linkedUserId: 'u4'
    },
    {
      id: 'adm2', studentName: 'Sara Riaz', fatherName: 'Riaz Ahmed',
      dob: '1999-11-20', cnic: '35202-7654321-0', gender: 'Female',
      phone: '+91-98765-43215', email: 'sara.riaz@gmail.com',
      address: 'House 5, Model Town, Lahore',
      course: 'c2', appliedAt: '2024-02-10T00:00:00Z',
      status: 'pending', notes: '', linkedUserId: null
    },
  ];
  dbSet(DB.ADMISSIONS, admissions);

  /* --- Payments --- */
  const payments = [
    {
      id: 'pay1', studentId: 'u4', courseId: 'c1', amount: 15000,
      method: 'cash', receiptNo: 'RCP-001',
      paidAt: '2024-02-06T00:00:00Z', notes: 'Full payment received'
    },
  ];
  dbSet(DB.PAYMENTS, payments);

  /* --- Expenses --- */
  const expenses = [
    { id: 'exp1', category: 'salary', description: 'Teacher Salary — Fatima Malik (Feb)', amount: 25000, date: '2024-02-28', paidTo: 'Fatima Malik' },
    { id: 'exp2', category: 'salary', description: 'Teacher Salary — Zainab Ahmed (Feb)', amount: 20000, date: '2024-02-28', paidTo: 'Zainab Ahmed' },
    { id: 'exp3', category: 'utilities', description: 'Electricity Bill — February', amount: 4500, date: '2024-02-20', paidTo: 'LESCO' },
    { id: 'exp4', category: 'supplies', description: 'Stationery & Montessori Materials', amount: 8000, date: '2024-02-15', paidTo: 'Al-Noor Traders' },
    { id: 'exp5', category: 'rent', description: 'Office Rent — February', amount: 15000, date: '2024-02-01', paidTo: 'Landlord' },
  ];
  dbSet(DB.EXPENSES, expenses);

  localStorage.setItem('lms_seeded', 'true');
  console.log('✅ Ansha Montessori LMS: Seed data initialized');
}

// Auto-init on load
initSeedData();

/* =============================================
   LIVE CLASS SCHEDULE SEED
   Runs independently so existing users also get sessions
   ============================================= */
function initScheduleSeed() {
  if (localStorage.getItem('lms_schedule_v2')) return;

  // Generate Saturdays and Tuesdays for 3 months from 2026-03-28
  const sessions = [];
  const meetLink = 'https://meet.google.com/zia-ejyh-kvj';
  const courseId  = 'c1'; // Advance Montessori Teacher Training
  const title     = 'Advance Montessori Diploma — Live Class';
  const start     = new Date('2026-03-28');

  // Generate next 14 Saturdays (day=6) and 14 Tuesdays (day=2)
  for (let week = 0; week < 14; week++) {
    // Saturday
    const sat = new Date(start);
    sat.setDate(start.getDate() + week * 7);
    sessions.push({
      id:       `lc_sat_${week}`,
      courseId,
      title,
      date:     sat.toISOString().split('T')[0],
      time:     '19:00',
      duration: 60,
      platform: 'Google Meet',
      link:     meetLink,
      description: 'Weekly Saturday live class — 7:00 PM to 8:00 PM IST',
      createdBy: 'u1',
      createdAt: new Date().toISOString(),
    });

    // Tuesday (3 days after Saturday)
    const tue = new Date(sat);
    tue.setDate(sat.getDate() + 3);
    sessions.push({
      id:       `lc_tue_${week}`,
      courseId,
      title,
      date:     tue.toISOString().split('T')[0],
      time:     '19:00',
      duration: 60,
      platform: 'Google Meet',
      link:     meetLink,
      description: 'Weekly Tuesday live class — 7:00 PM to 8:00 PM IST',
      createdBy: 'u1',
      createdAt: new Date().toISOString(),
    });
  }

  // Merge: keep any manually added sessions, add seeded ones
  const existing = dbGet(DB.SCHEDULE);
  const existingIds = existing.map(s => s.id);
  sessions.forEach(s => {
    if (!existingIds.includes(s.id)) dbSave(DB.SCHEDULE, s);
  });

  localStorage.setItem('lms_schedule_v2', 'true');
  console.log('✅ Live class schedule seeded (28 sessions: Sat + Tue for 14 weeks)');
}
initScheduleSeed();

/* ---- Migration: upgrade quizzes to 20-question assessments ---- */
(function migrateQuizzes() {
  const quizzes = dbGet(DB.QUIZZES);
  const q1 = quizzes.find(q => q.id === 'q1');
  if (q1 && q1.questions.length < 20) {
    // Replace all quizzes with full assessments — reload seed quizzes
    localStorage.removeItem('lms_seeded');
    const keep = { users: localStorage.getItem('lms_users'), enrollments: localStorage.getItem('lms_enrollments'), payments: localStorage.getItem('lms_payments'), expenses: localStorage.getItem('lms_expenses'), progress: localStorage.getItem('lms_progress'), submissions: localStorage.getItem('lms_submissions') };
    initSeedData();
    Object.entries(keep).forEach(([k, v]) => { if (v) localStorage.setItem('lms_' + k.replace('lms_',''), v); });
  }
})();

/* ---- Migration: update Montessori course fee to 25000 ---- */
(function migrateCourseFees() {
  const courses = dbGet(DB.COURSES);
  const c1 = courses.find(c => c.id === 'c1');
  if (c1 && c1.fee !== 25000) {
    c1.fee = 25000;
    localStorage.setItem('lms_courses', JSON.stringify(courses));
  }
})();

/* ---- Migration: add course books if not present ---- */
(function migrateBooks() {
  const books = [
    { id: 'lb1', courseId: 'c1', module: 'Course Books', title: 'AMT-001: Pre-School Management', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 10, pdf: 'assets/pdfs/amt-001-preschool-management.pdf' },
    { id: 'lb2', courseId: 'c4', module: 'Course Books', title: 'AMT-002: Foundations of Educational Psychology', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 10, pdf: 'assets/pdfs/amt-002-educational-psychology.pdf' },
    { id: 'lb3', courseId: 'c1', module: 'Course Books', title: 'AMT-003: Montessori Philosophy and Method', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 11, pdf: 'assets/pdfs/amt-003-montessori-philosophy.pdf' },
    { id: 'lb4', courseId: 'c1', module: 'Course Books', title: 'AMT-004: Pre-School Education', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 12, pdf: 'assets/pdfs/amt-004-preschool-education.pdf' },
    { id: 'lb5', courseId: 'c1', module: 'Course Books', title: 'AMT-005: Preschool Administration and Management', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 13, pdf: 'assets/pdfs/preschool-admin-management.pdf' },
    { id: 'lb6', courseId: 'c1', module: 'Course Books', title: 'AMT-006: NCF-ECCE — National Curriculum Framework for Early Childhood Care & Education', type: 'text', content: '<p>Download the full course book below.</p>', duration: '', order: 14, pdf: 'assets/pdfs/ncf-ecce-mwcd-goi.pdf' },
  ];
  const existing = dbGet(DB.LESSONS).map(l => l.id);
  books.forEach(b => { if (!existing.includes(b.id)) dbSave(DB.LESSONS, b); });
})();

/* ---- Migration: seed Montessori class recordings ---- */
(function migrateRecordings() {
  const existing = JSON.parse(localStorage.getItem('lms_recordings') || '[]');
  // Check if our seeded recordings are already present
  if (existing.some(r => r.id === 'mr1')) return;

  const seed = [
    { id:'mr1',  courseId:'c1', title:'Montessori 1',  date:'2025-05-17', driveUrl:'https://drive.google.com/file/d/1e6iXW8abfIVp7nOzP-MfdQR6FkPxQWzP/view', description:'Montessori Teacher Training — Session 1' },
    { id:'mr2',  courseId:'c1', title:'Montessori 2',  date:'2025-05-31', driveUrl:'https://drive.google.com/file/d/1TTYAQKNV4QztyRvpHz9ZMdXNLgJ4Mu2N/view', description:'Montessori Teacher Training — Session 2' },
    { id:'mr3',  courseId:'c1', title:'Montessori 3',  date:'2025-06-10', driveUrl:'https://drive.google.com/file/d/1r7yZB47ouL0KrRcw_Tekgq5_KhE2sX6j/view', description:'Montessori Teacher Training — Session 3' },
    { id:'mr4',  courseId:'c1', title:'Montessori 4',  date:'2025-10-07', driveUrl:'https://drive.google.com/file/d/117XDVJBnvSCTgg-SZPqoRZHTKraLRrW4/view', description:'Montessori Teacher Training — Session 4' },
    { id:'mr5',  courseId:'c1', title:'Montessori 5',  date:'2025-10-07', driveUrl:'https://drive.google.com/file/d/16ISoJskccyoKvK9cPvFU5TfpT2kVnQdK/view', description:'Montessori Teacher Training — Session 5' },
    { id:'mr6',  courseId:'c1', title:'Montessori 6',  date:'2025-10-18', driveUrl:'https://drive.google.com/file/d/1Bfpr2PpV7QCTfWVx14qdO0dE4Wj7ewgy/view', description:'Montessori Teacher Training — Session 6' },
    { id:'mr7',  courseId:'c1', title:'Montessori 7',  date:'2025-10-21', driveUrl:'https://drive.google.com/file/d/1hRFvvMHVmgkgqYDPwOnk_4ruH_zUuNm9/view', description:'Montessori Teacher Training — Session 7' },
    { id:'mr8',  courseId:'c1', title:'Montessori 8',  date:'2025-10-25', driveUrl:'https://drive.google.com/file/d/1XhWDlmY9CpzPdrNOVXFFee841uPnmHI6/view', description:'Montessori Teacher Training — Session 8' },
    { id:'mr9',  courseId:'c1', title:'Montessori 9',  date:'2025-10-28', driveUrl:'https://drive.google.com/file/d/1bbg4G_skgWycpO6mtoAoR41stf8R5XNB/view', description:'Montessori Teacher Training — Session 9' },
    { id:'mr10', courseId:'c1', title:'Montessori 10', date:'2025-11-01', driveUrl:'https://drive.google.com/file/d/1_tqt1wBVZf4pmWRopAGAcVhJ84HutKjz/view', description:'Montessori Teacher Training — Session 10' },
    { id:'mr11', courseId:'c1', title:'Montessori 11', date:'2025-11-08', driveUrl:'https://drive.google.com/file/d/1UeyYhouf6zvkGh0KhZ5OUzsnYHYxqeVz/view', description:'Montessori Teacher Training — Session 11' },
    { id:'mr12', courseId:'c1', title:'Montessori 12', date:'2025-11-11', driveUrl:'https://drive.google.com/file/d/1kXEWaZcZ63vjG1LUEH-2qbf9wfWaDKIZ/view', description:'Montessori Teacher Training — Session 12' },
    { id:'mr13', courseId:'c1', title:'Montessori 13', date:'2025-11-18', driveUrl:'https://drive.google.com/file/d/16lZrwSZ1_Re_m0CBViNjp3I9Ub-_Waix/view', description:'Montessori Teacher Training — Session 13' },
    { id:'mr14', courseId:'c1', title:'Montessori 14', date:'2025-11-22', driveUrl:'https://drive.google.com/file/d/1BpIvZFfvmQbuCMuqiYbVk7zpqqmNHKt1/view', description:'Montessori Teacher Training — Session 14' },
    { id:'mr15', courseId:'c1', title:'Montessori 15', date:'2025-11-23', driveUrl:'https://drive.google.com/file/d/1E0p_bMm7tbQWekdQQRakRVuIGyO1hsp0/view', description:'Montessori Teacher Training — Session 15' },
    { id:'mr16', courseId:'c1', title:'Montessori 16', date:'2025-11-25', driveUrl:'https://drive.google.com/file/d/1ttWb3DYdy2SPIDJyqGuIen46BHrALH_K/view', description:'Montessori Teacher Training — Session 16' },
    { id:'mr17', courseId:'c1', title:'Montessori 17', date:'2025-11-29', driveUrl:'https://drive.google.com/file/d/13ssxO57QskSV_7p2MlpYlquqph11FVnF/view', description:'Montessori Teacher Training — Session 17' },
    { id:'mr18', courseId:'c1', title:'Montessori 18', date:'2025-12-02', driveUrl:'https://drive.google.com/file/d/1jEJNxmUb8qf5cVx20QMO1cHfhDF06_3-/view', description:'Montessori Teacher Training — Session 18' },
    { id:'mr19', courseId:'c1', title:'Montessori 19', date:'2025-12-09', driveUrl:'https://drive.google.com/file/d/1twjBDn_cW7VYKq9n8Pz66boN6T3SGams/view', description:'Montessori Teacher Training — Session 19' },
    { id:'mr20', courseId:'c1', title:'Montessori 20', date:'2025-12-09', driveUrl:'https://drive.google.com/file/d/1Qp5eSyxnCci6bVOQtcn0O5xWKGpehoV-/view', description:'Montessori Teacher Training — Session 20' },
    { id:'mr21', courseId:'c1', title:'Montessori 21', date:'2025-12-16', driveUrl:'https://drive.google.com/file/d/1psZnxvUgH89WG1dpEzNwg3TndLLEhVqj/view', description:'Montessori Teacher Training — Session 21' },
    { id:'mr22', courseId:'c1', title:'Montessori 22', date:'2025-12-20', driveUrl:'https://drive.google.com/file/d/11Jt84HlawXfKT8bPGT3CzvFsJJquLird/view', description:'Montessori Teacher Training — Session 22' },
    { id:'mr23', courseId:'c1', title:'Montessori 23', date:'2025-12-23', driveUrl:'https://drive.google.com/file/d/1kRkXI3SSiyTuDaisY-3VXUqcpybbmJ-o/view', description:'Montessori Teacher Training — Session 23' },
    { id:'mr24', courseId:'c1', title:'Montessori 24', date:'2025-12-27', driveUrl:'https://drive.google.com/file/d/18FohGWGxeaSF9RQpsET12IRUzsyLAuiT/view', description:'Montessori Teacher Training — Session 24' },
    { id:'mr25', courseId:'c1', title:'Montessori 25', date:'2025-12-30', driveUrl:'https://drive.google.com/file/d/1f6xWges40ZVIyKlRkmpScMkvDeGPLSOl/view', description:'Montessori Teacher Training — Session 25' },
    { id:'mr26', courseId:'c1', title:'Montessori 26', date:'2025-12-30', driveUrl:'https://drive.google.com/file/d/1eAxaU0VJG62WA_YU8vD47M6bUoQMhtvs/view', description:'Montessori Teacher Training — Session 26' },
    { id:'mr27', courseId:'c1', title:'Montessori 27', date:'2026-01-06', driveUrl:'https://drive.google.com/file/d/1dHkJflmfe84RDqhfRIYLc8ikzLVU17GZ/view', description:'Montessori Teacher Training — Session 27' },
    { id:'mr28', courseId:'c1', title:'Montessori 28', date:'2026-01-17', driveUrl:'https://drive.google.com/file/d/1mwvl74wqrAnoga81-nXtTDpBgOpJg8jT/view', description:'Montessori Teacher Training — Session 28' },
    { id:'mr29', courseId:'c1', title:'Montessori 29', date:'2026-03-14', driveUrl:'https://drive.google.com/file/d/1va9FJn5Q8zGSGuxvemwiY44pIik4PXNP/view', description:'Montessori Teacher Training — Session 29' },
    { id:'mr30', courseId:'c1', title:'Montessori 30', date:'2026-03-15', driveUrl:'https://drive.google.com/file/d/1rtH2C93z-4TlOBvzN0J4gjeVvDOU3U4y/view', description:'Montessori Teacher Training — Session 30' },
    { id:'mr31', courseId:'c1', title:'Montessori 31', date:'2026-03-17', driveUrl:'https://drive.google.com/file/d/1KAQEOq2_T19NIkzcTvpwQdvgVfm6zrpJ/view', description:'Montessori Teacher Training — Session 31' },
    { id:'mr32', courseId:'c1', title:'Montessori 32', date:'2026-03-22', driveUrl:'https://drive.google.com/file/d/1Y8ZVhVKSednRxRNQvf0fJuC6uLybV_jw/view', description:'Montessori Teacher Training — Session 32' },
    { id:'mr33', courseId:'c1', title:'Montessori 33', date:'2026-03-24', driveUrl:'https://drive.google.com/file/d/12MLstBuGL9psmvZSW7v0AstpkurD2izk/view', description:'Montessori Teacher Training — Session 33' },
    { id:'mr34', courseId:'c1', title:'Montessori 34', date:'2026-03-25', driveUrl:'https://drive.google.com/file/d/1MmkRtZA3wp5UOejwHDi57nAGDttWJ4DR/view', description:'Montessori Teacher Training — Session 34' },
    { id:'cp1',  courseId:'c4', title:'Child Psychology — Live Class', date:'2026-03-26', driveUrl:'https://drive.google.com/file/d/176j_Utq25GWpvzdyuhjXtikls6-RnXXy/view', description:'Child Psychology — Live Class Recording' },
  ];

  // Merge: keep any manually added recordings, then add seeded ones that aren't already there
  const existingIds = existing.map(r => r.id);
  const merged = [...existing, ...seed.filter(r => !existingIds.includes(r.id))];
  localStorage.setItem('lms_recordings', JSON.stringify(merged));
  console.log('✅ Seeded 35 class recordings (Montessori 1–34 + Child Psychology)');
})();


/* ---- Migration: add extra admin accounts ---- */
(function migrateAdminAccounts() {
  const admins = [
    { id: 'admin-syed',   name: 'Syed',   email: 'syed@ansha.edu',   username: 'syed@ansha.edu',   password: 'Great786', role: 'admin', avatar: '👨‍💼', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'admin-hemala', name: 'Hemala', email: 'hemala@ansha.edu', username: 'hemala@ansha.edu', password: 'Great786', role: 'admin', avatar: '👩‍💼', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'admin-reema',  name: 'Reema',  email: 'reema@ansha.edu',  username: 'reema@ansha.edu',  password: 'Great786', role: 'admin', avatar: '👩‍💼', createdAt: '2026-01-01T00:00:00Z' },
  ];
  const users = dbGet(DB.USERS);
  let changed = false;
  admins.forEach(a => {
    if (!users.find(u => u.id === a.id || u.email === a.email)) {
      users.push(a);
      changed = true;
    }
  });
  if (changed) dbSet(DB.USERS, users);
})();

/* ---- Migration: assign enrollment numbers to all students without one ---- */
(function migrateEnrollmentNumbers() {
  const users = dbGet(DB.USERS);
  const toAssign = users
    .filter(u => u.role === 'student' && !u.enrollmentNo)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  if (!toAssign.length) return;

  // Find highest existing number so we never overwrite
  let maxNum = 0;
  users.forEach(u => {
    if (u.enrollmentNo) {
      const m = u.enrollmentNo.match(/(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
  });

  toAssign.forEach((s, i) => {
    s.enrollmentNo = `ANSHA-2026-${String(maxNum + i + 1).padStart(3, '0')}`;
  });

  dbSet(DB.USERS, users);
  console.log(`✅ Enrollment numbers assigned to ${toAssign.length} students`);
})();

/* ---- Migration: set username = full email for students who have short username ---- */
(function migrateUsernamesToEmail() {
  const users = dbGet(DB.USERS);
  let changed = 0;
  users.forEach(u => {
    if (u.role === 'student' && u.email && !(u.username || '').includes('@')) {
      u.username = u.email;
      changed++;
    }
  });
  if (changed > 0) { dbSet(DB.USERS, users); console.log(`✅ Updated ${changed} student usernames to full email`); }
})();

/* ---- Migration: set default feePlan for existing enrollments ---- */
(function migrateFeeePlans() {
  const enrollments = dbGet(DB.ENROLLMENTS);
  const courses = dbGet(DB.COURSES);
  let changed = false;
  enrollments.forEach(e => {
    if (!e.feePlan) {
      const c = courses.find(x => x.id === e.courseId);
      e.feePlan = { type: 'full', totalFee: c ? (c.fee || 0) : 0 };
      changed = true;
    }
  });
  if (changed) { dbSet(DB.ENROLLMENTS, enrollments); }
})();

/* ---- Migration: ensure core lessons are always present (fixes "empty lessons" on returning browsers) ---- */
(function migrateLessons() {
  const coreLessons = [
    { id: 'l1',  courseId: 'c1', module: 'Montessori Philosophy & Principles', title: 'Introduction to Montessori Method', type: 'video', url: 'https://www.youtube.com/embed/kfLLQCEB5sg', duration: '18 min', order: 1 },
    { id: 'l2',  courseId: 'c1', module: 'Montessori Philosophy & Principles', title: 'Core Principles of Dr. Maria Montessori', type: 'text', content: '<h3>Core Principles</h3><p>The Montessori method is based on six core principles:</p><ol><li><strong>Respect for the child</strong></li><li><strong>The absorbent mind</strong></li><li><strong>Sensitive periods</strong></li><li><strong>The prepared environment</strong></li><li><strong>Auto-education</strong></li><li><strong>The role of the teacher</strong></li></ol>', duration: '15 min', order: 2 },
    { id: 'l3',  courseId: 'c1', module: 'Prepared Environment', title: 'Setting Up a Montessori Classroom', type: 'video', url: 'https://www.youtube.com/embed/9X68dm92HVI', duration: '22 min', order: 3 },
    { id: 'l4',  courseId: 'c1', module: 'Sensorial Materials', title: 'Introduction to Sensorial Materials', type: 'video', url: 'https://www.youtube.com/embed/0z0M5DPfLT8', duration: '20 min', order: 4 },
    { id: 'l5',  courseId: 'c2', module: 'Foundation & Basics', title: 'Fundamentals of English Communication', type: 'video', url: 'https://www.youtube.com/embed/yyNPlDL3GBs', duration: '25 min', order: 1 },
    { id: 'l6',  courseId: 'c2', module: 'Pronunciation & Phonetics', title: 'English Pronunciation Guide', type: 'text', content: '<h3>English Pronunciation Basics</h3><p>Good pronunciation is key to effective communication.</p>', duration: '20 min', order: 2 },
    { id: 'l7',  courseId: 'c2', module: 'Conversational English', title: 'Building Conversation Skills', type: 'video', url: 'https://www.youtube.com/embed/sW5QObM5CHA', duration: '30 min', order: 3 },
    { id: 'l8',  courseId: 'c3', module: 'Phonemic Awareness', title: 'What is Phonemic Awareness?', type: 'video', url: 'https://www.youtube.com/embed/d0GNqEbMGZY', duration: '15 min', order: 1 },
    { id: 'l9',  courseId: 'c3', module: 'Letter-Sound Correspondence', title: 'Teaching Letter Sounds A-Z', type: 'text', content: '<h3>Letter-Sound Correspondence</h3><p>Understanding that letters represent sounds in spoken words.</p>', duration: '18 min', order: 2 },
    { id: 'l10', courseId: 'c3', module: 'Blending & Segmenting', title: 'Blending Sounds into Words', type: 'video', url: 'https://www.youtube.com/embed/RPTqBCdR1L4', duration: '20 min', order: 3 },
    { id: 'l11', courseId: 'c4', module: 'Child Development Stages', title: "Piaget's Stages of Cognitive Development", type: 'video', url: 'https://www.youtube.com/embed/TRF27F2bn-A', duration: '22 min', order: 1 },
    { id: 'l12', courseId: 'c4', module: 'Cognitive Development', title: 'Understanding How Children Learn', type: 'text', content: '<h3>How Children Learn</h3><p>Children build knowledge through active exploration and social interaction.</p>', duration: '25 min', order: 2 },
    { id: 'l13', courseId: 'c4', module: 'Emotional & Social Development', title: 'Emotional Intelligence in Children', type: 'video', url: 'https://www.youtube.com/embed/Y7m9eNoB3NU', duration: '18 min', order: 3 },
  ];
  const existing = new Set(dbGet(DB.LESSONS).map(l => l.id));
  const toAdd = coreLessons.filter(l => !existing.has(l.id));
  if (toAdd.length) {
    dbSet(DB.LESSONS, [...dbGet(DB.LESSONS), ...toAdd]);
    console.log(`[migrate] Added ${toAdd.length} missing core lessons`);
  }
})();

/* ---- Auto-attendance helper: called when student watches a recording ---- */
function autoMarkAttendance(studentId, courseId, sessionDate) {
  if (!studentId || !courseId || !sessionDate) return;
  const date = sessionDate.split('T')[0]; // normalise to YYYY-MM-DD
  const existing = getAttendance(courseId, date);
  if (existing) {
    // Update or add this student's record
    const idx = existing.records.findIndex(r => r.studentId === studentId);
    if (idx >= 0) {
      if (existing.records[idx].status !== 'present') {
        existing.records[idx].status = 'present';
        existing.records[idx].autoMarked = true;
        dbSave(DB.ATTENDANCE, existing);
      }
    } else {
      existing.records.push({ studentId, status: 'present', autoMarked: true });
      dbSave(DB.ATTENDANCE, existing);
    }
  } else {
    saveAttendance(courseId, date, [{ studentId, status: 'present', autoMarked: true }]);
  }
}

/* ---- Assessment helpers ---- */
function getAssessmentResult(studentId, assessmentId) {
  return dbGet(DB.ASSESSMENT_RESULTS).find(r => r.studentId === studentId && r.assessmentId === assessmentId) || null;
}
function getStudentAssessmentResults(studentId) {
  return dbGet(DB.ASSESSMENT_RESULTS).filter(r => r.studentId === studentId);
}
function getAssessmentResults(assessmentId) {
  return dbGet(DB.ASSESSMENT_RESULTS).filter(r => r.assessmentId === assessmentId);
}

/* ---- Seed default assessments ---- */
(function initAssessmentSeed() {
  // v5 key so existing users get all 7 assessments
  if (localStorage.getItem('lms_assessments_seeded_v5')) return;
  const seed = [
    { id:'asmt1', title:'Montessori Diploma Assessment', courseId:'c1', maxScore:100, description:'Advance Montessori Diploma — Knowledge Assessment',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLScOQqEo3Zme2MbFJ3JrP3k7GEx1Mp73nyp6SQ70yV91xOHB4A/viewform?usp=header' },
    { id:'asmt2', title:'Skinner Assessment', courseId:'c1', maxScore:100, description:'Skinner Behavioural Theory — Assessment',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLScM2iud9Q7De4qyA_wOrjRs9xFCrKBeKPDAU2bRr8FO7g03Mw/viewform?usp=header' },
    { id:'asmt3', title:'Assessment 3', courseId:'c1', maxScore:100, description:'Assessment 3',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLSf0wAGEzd_k3drtNyk8eReT4kyvULhBJOcqfgx8FDePOENaqw/viewform?usp=header' },
    { id:'asmt4', title:'Assessment 4', courseId:'c1', maxScore:100, description:'Assessment 4',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLSedN-ZMExMzxwYwpozVV6rGna9LjJHOguuhQKq_JBFc0pkdZw/viewform?usp=sharing' },
    { id:'asmt5', title:'Assessment 5', courseId:'c1', maxScore:100, description:'Assessment 5',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLSdmNmq5yGzt6oCRS-MTzQRdKlcUH46CWxmkdn9lk6D7bpHT2Q/viewform?usp=header' },
    { id:'asmt6', title:'Assessment 6', courseId:'c1', maxScore:100, description:'Assessment 6',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLSeN0mZWagDLHd-4nqOG6i65ZxFEkVwrInZzm587AXej3OUeQQ/viewform?usp=header' },
    { id:'asmt7', title:'Assessment 7', courseId:'c1', maxScore:100, description:'Assessment 7',
      formUrl:'https://docs.google.com/forms/d/e/1FAIpQLScVmOUdkMfcFDAu5BvN1DQRSCM9dAloPhWJPbXLdK5ayRfKug/viewform?usp=header' },
  ];
  const existingIds = dbGet(DB.ASSESSMENTS).map(a => a.id);
  seed.filter(a => !existingIds.includes(a.id)).forEach(a => dbSave(DB.ASSESSMENTS, { ...a, createdAt: new Date().toISOString() }));
  localStorage.setItem('lms_assessments_seeded_v5', 'true');
})();

/* ---- Migration: import 2026 batch fee data from Excel summary ---- */
(function migrateExcelFees() {
  // M=Montessori(c1) E=Spoken English(c2) P=Phonics(c3) C=Child Psychology(c4)
  // Format: [phone, courseKey, totalFee, paid, paymentMethod]
  const COURSE_MAP = { M:'c1', E:'c2', P:'c3', C:'c4' };
  const DATA = [
    ['8098374095','M',15000,5000,'Shakila Gpay'],
    ['9884254499','M',15000,5000,'Shakila Gpay'],
    ['9092383093','M',17000,2000,'Shakila Gpay'],
    ['7667974557','M',17000,2000,'Shakila Gpay'],
    ['9789149605','M',15000,10000,'Shakila Gpay'],
    ['7550267136','M',16000,5000,'Shakila Gpay'],
    ['9952730497','M',16000,3500,'Shakila Gpay'],
    ['9363380358','M',16000,4000,'Shakila Gpay'],
    ['7695859500','M',20000,12000,'Shakila Gpay'],
    ['8148132927','M',15000,3000,'Shakila Gpay'],
    ['6374013597','M',20000,12000,'Shakila Gpay'],
    ['9361534098','M',18000,3000,'Shakila Gpay'],
    ['7448782834','M',18000,15000,'Shakila Gpay'],
    ['9384657151','M',20000,5000,'Shakila Gpay'],
    ['9952927518','M',20000,2000,'Shakila Gpay'],
    ['9080042424','M',20000,4000,'Shakila Gpay'],
    ['7200645996','M',25000,2000,'Shakila Gpay'],
    ['9940287620','M',20000,4000,'Shakila Gpay'],
    ['6383409883','M',20000,2000,'Shakila Gpay'],
    ['7395897003','M',18000,2000,'Shakila Gpay'],
    ['7358448105','M',20000,20000,'Shakila Gpay'],
    ['7358837672','M',24000,2000,'Shakila Gpay'],
    ['9626882152','M',25000,10000,'Shakila Gpay'],
    ['6383949793','M',20000,1000,'Shakila Gpay'],
    ['8111031208','M',18000,1000,'Shakila Gpay'],
    ['8904346857','M',25000,2000,'Shakila Gpay'],
    ['6383348268','M',25000,5000,'Shakila Gpay'],
    ['9962417217','M',24000,2000,'Shakila Gpay'],
    ['8754343732','M',21000,2000,'Shakila Gpay'],
    ['9962886078','M',20000,7000,'Shakila Gpay'],
    ['9952793350','M',21000,3000,'Shakila Gpay'],
    ['7200622419','M',25000,2000,'Shakila Gpay'],
    ['8778906801','M',20000,3000,'Shakila Gpay'],
    ['9600061263','M',20000,3000,'Shakila Gpay'],
    ['9940380533','M',20000,3000,'Shakila Gpay'],
    ['9884760943','M',15000,5000,'Shakila Gpay'],
    ['7010146665','M',10000,5000,'Shakila Gpay'],
    ['8220413819','M',15000,2000,'Shakila Gpay'],
    ['7358597986','M',15000,5000,'Shakila Gpay'],
    ['9344992798','M',15000,2000,'Shakila Gpay'],
    ['6385523969','M',15000,15000,'Shakila Gpay'],
    ['9941539386','M',15000,5000,'Shakila Gpay'],
    ['9500099910','M',23000,11000,'Shakila Gpay'],
    ['9360720510','M',15000,5000,'Shakila Gpay'],
    ['7448378330','M',15000,8000,'Shakila Gpay'],
    ['8072301913','M',15000,5000,'Shakila Gpay'],
    ['9994213892','M',15000,5000,'Shakila Gpay'],
    ['9884868081','M',22000,3000,'Shakila Gpay'],
    ['8248284166','M',15000,5000,'Shakila Gpay'],
    ['8925142711','M',22000,7000,'Shakila Gpay'],
    ['8870420555','M',25000,15000,'Shakila Gpay'],
    ['9042473898','M',18000,3000,'Shakila Gpay'],
    ['6385858172','M',20000,5000,'Shakila Gpay'],
    ['9790581527','M',20000,3000,'Shakila Gpay'],
    ['9514043003','M',18000,2000,'Shakila Gpay'],
    ['9345401934','M',25000,14500,'Shakila Gpay'],
    ['6385791416','M',25000,2000,'Shakila Gpay'],
    ['8667287987','M',20000,2000,'Shakila Gpay'],
    ['7092514925','M',20000,3000,'Shakila Gpay'],
    ['9566733051','M',25000,5000,'Shakila Gpay'],
    ['9003749511','M',20000,4000,'Shakila Gpay'],
    ['9884935391','M',20000,3000,'Shakila Gpay'],
    ['9244400789','M',25000,3000,'Shakila Gpay'],
    ['9884684230','M',18000,9000,'Shakila Gpay'],
    ['9840738140','M',18000,6000,'Shakila Gpay'],
    ['9500862729','M',25000,10000,'Shakila Gpay'],
    ['7094160068','M',18000,7000,'Shakila Gpay'],
    ['9994454410','M',25000,5000,'Shakila Gpay'],
    ['8870088260','M',20000,3000,'Shakila Gpay'],
    ['8220880446','M',20000,3000,'Shakila Gpay'],
    ['6383595636','M',20000,3000,'Shakila Gpay'],
    ['9003368005','M',20000,3000,'Shakila Gpay'],
    ['9962462683','M',20000,4000,'Shakila Gpay'],
    ['9843672552','M',25000,5000,'Shakila Gpay'],
    ['7338791096','M',25000,5000,'Shakila Gpay'],
    ['7305065957','M',20000,2000,'Shakila Gpay'],
    ['9176034348','M',21000,21000,'Shakila Gpay'],
    ['8838650737','M',30000,7000,'Shakila Gpay'],
    ['9597596317','M',20000,5000,'Shakila Gpay'],
    ['8807987384','M',20000,4000,'Shakila Gpay'],
    ['8778603440','M',15000,4000,'Shakila Gpay'],
    ['9840118372','M',15000,5000,'Shakila Gpay'],
    ['6374018808','M',20000,5000,'Shakila Gpay'],
    ['9790432034','M',15000,3000,'Shakila Gpay'],
    ['9789053210','M',20000,5000,'Shakila Gpay'],
    ['8668049394','M',20000,3000,'Shakila Gpay'],
    ['7339454461','M',20000,5000,'Shakila Gpay'],
    ['8248708162','M',20000,2000,'Shakila Gpay'],
    ['7010964116','M',20000,4000,'Shakila Gpay'],
    ['9500099910','E',4000,2000,'Shakila Gpay'],
    ['6379377738','E',4000,1000,'Shakila Gpay'],
    ['7349460625','E',4000,1000,'Shakila Gpay'],
    ['8189802440','P',4000,1000,'Shakila Gpay'],
    ['9486386923','P',4000,2000,'Shakila Gpay'],
    ['9952051542','P',4000,2000,'Shakila Gpay'],
    ['6383595636','P',4000,2000,'Shakila Gpay'],
    ['9962383951','P',4000,2000,'Shakila Gpay'],
    ['8463902563','P',4000,2000,'Shakila Gpay'],
    ['9962531886','P',4000,2000,'Shakila Gpay'],
    ['9080791811','P',4000,2000,'Shakila Gpay'],
    ['7502246329','P',4500,2000,'Shakila Gpay'],
    ['7871930221','C',9000,2000,'Shakila Gpay'],
    ['9123510557','C',9000,3000,'Shakila Gpay'],
    ['9345144966','C',9000,3000,'Shakila Gpay'],
    ['7812883158','C',9000,2000,'Shakila Gpay'],
    ['7418082019','C',9000,2000,'Shakila Gpay'],
    ['9787008121','C',9000,2000,'Shakila Gpay'],
    ['9042930788','C',9000,2000,'Shakila Gpay'],
    ['9487081050','C',9000,3000,'Shakila Gpay'],
    ['8754884872','C',9000,3000,'Shakila Gpay'],
    ['9444263675','C',9000,3000,'Shakila Gpay'],
  ];

  // Build lookup: normalize phone to last 10 digits, map to {courseId, totalFee, paid, balance, paymentMethod}
  const lookup = {};
  DATA.forEach(([rawPhone, courseKey, totalFee, paid, paymentMethod]) => {
    const phone = rawPhone.replace(/\D/g,'').slice(-10);
    if (phone.length !== 10) return;
    const courseId = COURSE_MAP[courseKey];
    if (!lookup[phone]) lookup[phone] = [];
    lookup[phone].push({ courseId, totalFee, paid, balance: totalFee - paid, paymentMethod });
  });

  const users = dbGet(DB.USERS);
  const enrollments = dbGet(DB.ENROLLMENTS);
  let changed = 0;
  users.forEach(u => {
    if (u.role !== 'student') return;
    const phone = (u.phone || '').replace(/\D/g,'').slice(-10);
    if (!phone || !lookup[phone]) return;
    enrollments.filter(e => e.studentId === u.id).forEach(e => {
      if (e.feePlan && e.feePlan.excelImport) return; // already applied
      const rec = lookup[phone].find(r => r.courseId === e.courseId) || lookup[phone][0];
      if (!rec) return;
      e.feePlan = {
        type: 'full',
        totalFee: rec.totalFee,
        paidAmount: rec.paid,
        balance: rec.balance,
        paymentMethod: rec.paymentMethod,
        nextDueDate: '2026-06-05',
        excelImport: true
      };
      changed++;
    });
  });
  if (changed) {
    dbSet(DB.ENROLLMENTS, enrollments);
    console.log(`✅ Excel fee data applied to ${changed} enrollments`);
  }
})();

/* =============================================
   PATCH — ensure Phonics A–Z + Storytelling
   courses & lessons exist for users who were
   seeded before these courses were added.
   ============================================= */
function patchNewCourses() {
  try {
    const courses = dbGet(DB.COURSES) || [];
    const lessons = dbGet(DB.LESSONS) || [];
    let touched = false;

    if (!courses.find(c => c.id === 'c5')) {
      courses.push({
        id: 'c5', title: 'Phonics A–Z: Letter-by-Letter Reference',
        category: 'phonics', teacherId: 'u2',
        description: 'A standalone interactive reference for teacher trainees — every English letter A through Z with its IPA sound, example words, articulation cue, and classroom-ready trainer tip. Includes a 29-slide playful rainbow training deck to download.',
        duration: '4 Weeks', level: 'All Levels', icon: '🔤', color: '#e11d48',
        modules: ['A – I', 'J – R', 'S – Z', 'Course Deck'],
        maxStudents: 30, fee: 3500, createdAt: new Date().toISOString()
      });
      touched = true;
    }
    if (!courses.find(c => c.id === 'c6')) {
      courses.push({
        id: 'c6', title: 'Storytelling for Young Minds',
        category: 'storytelling', teacherId: 'u3',
        description: 'A teacher-training module on the art of storytelling for Montessori Casa children aged 3–5. Four original value stories (kindness, sharing, patience, courage), voice & body craft, props & the story basket, and a four-week practice plan.',
        duration: '6 Weeks', level: 'All Levels', icon: '📖', color: '#8A3C32',
        modules: ['Introduction', 'Foundations', 'The Craft', 'The Instrument', 'Value Stories', 'Delivery', 'Practice', 'Course Deck'],
        maxStudents: 25, fee: 4500, createdAt: new Date().toISOString()
      });
      touched = true;
    }

    // Helper — only add a lesson if its id is not already present
    function addLessonIfMissing(l) {
      if (!lessons.find(x => x.id === l.id)) { lessons.push(l); touched = true; }
    }

    // Phonics letter lessons (c5)
    const PHX = [
      ['A','/æ/',['Apple','Ant','Astronaut'],'Open mouth wide, tongue rests low and flat.','Short /a/. Use sandpaper letters; trace with finger while voicing the sound.'],
      ['B','/b/',['Ball','Bear','Balloon'],'Press both lips together, release with a puff of voice.','Voiced consonant. Pair with /p/ later to teach voiced vs. unvoiced pairs.'],
      ['C','/k/',['Cat','Cup','Carrot'],'Back of tongue rises to soft palate, brief puff.','Hard C. Introduce soft C (/s/) only after the hard sound is secure.'],
      ['D','/d/',['Dog','Drum','Duck'],'Tongue tip taps behind top teeth, released with voice.','Voiced pair to /t/. Place child\'s hand on throat to feel vibration.'],
      ['E','/ɛ/',['Egg','Elephant','Elbow'],'Mouth slightly open, tongue mid-front, lips relaxed.','Short /e/. Practise with echo games: teacher says /e/, child repeats.'],
      ['F','/f/',['Fish','Frog','Feather'],'Upper teeth touch lower lip, air flows through — no voice.','Unvoiced fricative. Use paper-blowing to feel the airflow.'],
      ['G','/g/',['Goat','Garden','Grape'],'Back of tongue lifts to soft palate, releases with voice.','Hard G. Defer soft G (/dʒ/) until the child is confident.'],
      ['H','/h/',['Hat','Horse','House'],'Mouth open, warm breath flows out — no tongue movement.','Like fogging a mirror. Have child exhale onto their hand to feel the sound.'],
      ['I','/ɪ/',['Igloo','Ink','Insect'],'Mouth slightly open, tongue high-front, lips relaxed.','Short /i/. Contrast with long /iː/ later (as in \'ice\').'],
      ['J','/dʒ/',['Jug','Jam','Jet'],'Tongue starts at ridge behind teeth, lips slightly rounded.','Always voiced. Use \'juicy\' words to make the sound memorable.'],
      ['K','/k/',['Kite','King','Key'],'Back of tongue lifts to soft palate, unvoiced puff.','Same sound as hard C. Teach K after C to build the bridge.'],
      ['L','/l/',['Lion','Leaf','Lamp'],'Tongue tip touches ridge behind top teeth, voice flows on sides.','Show child tongue placement in a mirror; a lateral sound.'],
      ['M','/m/',['Monkey','Moon','Mouse'],'Lips pressed together, humming through the nose.','Nasal, continuous sound. Perfect for stretching: mmmmm.'],
      ['N','/n/',['Nest','Net','Nose'],'Tongue tip touches ridge behind top teeth, humming through nose.','Another nasal. Contrast with /m/: lips closed vs. lips open.'],
      ['O','/ɒ/',['Octopus','Orange','Olive'],'Mouth open and rounded, tongue low.','Short /o/. Build muscle memory with circle-shaped object sorting.'],
      ['P','/p/',['Pig','Pen','Pumpkin'],'Press both lips together, release with a puff — no voice.','Unvoiced pair to /b/. Hold a tissue — /p/ moves it, /b/ doesn\'t.'],
      ['Q','/kw/',['Queen','Quilt','Quail'],'Back of tongue lifts, lips round: two blended sounds — /k/ + /w/.','Q is almost always followed by U. Teach \'qu\' as a unit.'],
      ['R','/r/',['Rabbit','Red','Rainbow'],'Tongue curls back slightly, lips round, voice flows.','Can be tricky. Use growling games: \'rrrrrr\' like a lion.'],
      ['S','/s/',['Sun','Snake','Star'],'Tongue near ridge, teeth nearly closed, air hisses out.','Unvoiced. Use snake play: sssssss. Pair with /z/ later.'],
      ['T','/t/',['Tiger','Tree','Train'],'Tongue tip taps ridge behind top teeth, unvoiced puff.','Pair with /d/. Clapping rhythm helps internalise the crisp sound.'],
      ['U','/ʌ/',['Umbrella','Uncle','Up'],'Mouth relaxed, slightly open, tongue mid-central.','Short /u/. Often confused with /a/ — isolate with matched word pairs.'],
      ['V','/v/',['Van','Violin','Vase'],'Upper teeth touch lower lip, air flows with voice.','Voiced pair to /f/. Hand on throat to feel the difference.'],
      ['W','/w/',['Water','Wolf','Web'],'Lips tightly rounded, glide to next vowel.','Glide consonant. Always precedes a vowel; practise \'wa\', \'we\', \'wi\'.'],
      ['X','/ks/',['Fox','Box','Six'],'Blend of /k/ + /s/ — brief puff then hiss.','X usually ends words. Teach the sound first, spelling later.'],
      ['Y','/j/',['Yo-yo','Yellow','Yak'],'Tongue high-front, lips spread, glide into vowel.','At the start of words it\'s /j/. End of words, often /iː/ as in \'happy\'.'],
      ['Z','/z/',['Zebra','Zip','Zoo'],'Tongue near ridge, teeth nearly closed, voice buzzes out.','Voiced pair to /s/. Bee-buzzing games make it stick: zzzzzz.']
    ];
    PHX.forEach((p, i) => {
      const [L, ipa, words, mouth, tip] = p;
      const moduleName = i < 9 ? 'A – I' : i < 18 ? 'J – R' : 'S – Z';
      const wordsHtml = words.map(w => `<strong>${w[0]}</strong>${w.slice(1)}`).join(' · ');
      const content = `<h3>${L}${L.toLowerCase()}  ·  ${ipa}</h3>`
        + `<p><strong>Example words:</strong> ${wordsHtml}</p>`
        + `<p><strong>Articulation cue:</strong> ${mouth}</p>`
        + `<p><strong>Trainer's tip:</strong> ${tip}</p>`;
      addLessonIfMissing({
        id: 'lphx' + (i + 1), courseId: 'c5', module: moduleName,
        title: `Letter ${L}${L.toLowerCase()} — ${words[0]}`,
        type: 'text', content: content, duration: '3 min', order: i + 1
      });
    });
    addLessonIfMissing({
      id: 'lphx_deck', courseId: 'c5', module: 'Course Deck',
      title: 'Phonics A–Z — Full Slide Deck',
      type: 'text',
      content: '<p>Download the full 29-slide training deck with rainbow letter design, A–Z overview, and trainer guide.</p>',
      duration: '', order: 100,
      pdf: 'assets/decks/Phonics_A_to_Z_Teacher_Training.pptx'
    });

    // Storytelling lessons (c6)
    const STR = [
      ['Introduction',   'Welcome & course overview',                '<h3>The Art of Storytelling for Young Minds</h3><p>An 18-lesson training module for Ansha Casa guides teaching children aged 3–5. You will learn how to prepare, structure, voice, and tell stories that quietly plant Montessori values: kindness, sharing, patience, and courage.</p><p><em>Download the slide deck at the end of the course for a printable reference.</em></p>'],
      ['Foundations',    'Why stories matter at 3–5',                '<h3>The developing mind at 3–5</h3><ul><li><strong>1000+ new words a year</strong> — ages 3–5 is the language explosion.</li><li><strong>90% brain growth by 5</strong> — most neural architecture is set.</li><li><strong>Rhythm before meaning</strong> — children absorb cadence long before words.</li><li><strong>Seeds that bloom later</strong> — a value told at 3 may surface at 13.</li></ul>'],
      ['Foundations',    'The storyteller\'s mindset',               '<h3>You are the gardener — not the flower</h3><ol><li>The story serves the child — you are the messenger.</li><li>Calm is the first gift — your breath sets the tempo.</li><li>Less expression, more intention — soft voice reaches further than loud.</li><li>Trust the silence — children think during your pauses.</li></ol>'],
      ['The Craft',      'Five principles of Casa-age storytelling', '<h3>Every story should pass these five tests</h3><ol><li><strong>Short enough</strong> — 3 to 5 minutes maximum.</li><li><strong>Concrete</strong> — real animals, real objects. Defer metaphor.</li><li><strong>Repetitive</strong> — a refrain they can echo by the third telling.</li><li><strong>Emotionally safe</strong> — no fear, no sudden loss, no wicked villains.</li><li><strong>One seed, one value</strong> — a single lesson, never two at once.</li></ol>'],
      ['The Craft',      'Preparing the space & yourself',           '<h3>Before you begin</h3><h4>The space</h4><ul><li>Soft warm light, no overhead glare</li><li>A circle of floor cushions on a natural rug</li><li>A small low basket for your story props</li><li>Empty walls in the child\'s line of sight</li></ul><h4>Yourself</h4><ul><li>Three slow breaths before you sit</li><li>Release the morning\'s events — arrive here</li><li>Let your eyes meet each child, one by one</li><li>Begin only when your body is still</li></ul>'],
      ['The Craft',      'Anatomy of a story',                       '<h3>A simple, reliable shape</h3><ol><li><strong>Opening phrase</strong> — the same one every time.</li><li><strong>One character</strong> — one protagonist only.</li><li><strong>One small problem</strong> — a lost mitten, a cold bird.</li><li><strong>One or two events + a refrain</strong> — a repeating phrase children echo.</li><li><strong>Closing phrase</strong> — "And that is the story of..."</li></ol>'],
      ['The Instrument', 'Voice — pace, pause, volume',              '<h3>Your three tools</h3><p><strong>Pace:</strong> slower than you think. Count silently one-two-three after each sentence.</p><p><strong>Pause:</strong> 2–3 seconds before a surprise; longer at the end.</p><p><strong>Volume:</strong> soften for a secret, warm for love, never loud. Whisper the most important line.</p>'],
      ['The Instrument', 'Body & gesture',                           '<h3>Your stillness is the frame</h3><ul><li>Sit at the children\'s level — feet tucked, spine long.</li><li>Small, slow gestures.</li><li>Let your face carry the story, not your arms.</li><li>Freeze before the important moment.</li></ul>'],
      ['The Instrument', 'Story props & materials',                  '<h3>The Montessori story basket</h3><ul><li>Small wooden animals — hand-carved, unpainted.</li><li>Natural objects — pine cones, stones, shells.</li><li>Peg dolls — simple, faceless figures.</li><li>Cloth backdrops — green for meadow, blue for sea.</li></ul><h4>How to use</h4><ol><li>Reveal one object at a time — slowly.</li><li>Place each on the cloth with reverence.</li><li>Leave everything in view until the story ends.</li></ol>'],
      ['Value Stories',  'KINDNESS — The Sparrow and the Bread',     '<h3>The Sparrow and the Bread</h3><p><em>A little girl · A hungry sparrow</em></p><p>On a cold winter morning, a sparrow lands at a little girl\'s window. She is eating a small piece of bread — her whole breakfast. She looks at the bird. She looks at her bread. She opens the window. She breaks the bread in two and gives half.</p><p><strong>Refrain:</strong> "Not all who are small need little."</p><p><strong>When to tell it:</strong> when you notice a child closing off from others.</p>'],
      ['Value Stories',  'SHARING — Two Spoons',                     '<h3>Two Spoons</h3><p><em>Two children · One bowl of warm porridge</em></p><p>Two little children sat by a bowl. There was only one spoon on the shelf. They pulled. They frowned. Then the first child said, "One for you." She ate. "One for me." She passed the spoon.</p><p><strong>Refrain:</strong> "One for you, one for me."</p><p><strong>When to tell it:</strong> after a sharing disagreement has passed.</p>'],
      ['Value Stories',  'PATIENCE — The Little Seed Who Waited',    '<h3>The Little Seed Who Waited</h3><p><em>A small brown seed · The rain · The sun</em></p><p>Deep in the dark earth, a little seed woke up. It wanted to see the sun. But the seed waited. The rain came. The seed waited. Still, the seed waited. One morning — a tiny green shoot. And then, the sun.</p><p><strong>Refrain:</strong> "Still, still, the seed waits."</p><p><strong>When to tell it:</strong> pair with a real seed-and-soil activity.</p>'],
      ['Value Stories',  'COURAGE — The Quiet Bear',                 '<h3>The Quiet Bear</h3><p><em>A small brown bear · A wide cool river</em></p><p>A small bear lived by a river. Every day he walked to the bank. Every day the river looked too big. One morning he placed one paw on the cool water. Then another. Then — he was swimming.</p><p><strong>Refrain:</strong> "One small step today."</p><p><strong>When to tell it:</strong> when a child hesitates before a new work.</p>'],
      ['Delivery',       'Repetition & participation',               '<h3>The magic of the refrain</h3><ul><li>Repeat a phrase three times per story.</li><li>Tell the same story 3–5 times across weeks.</li><li>Invite echo, never quizzing: "Say it with me."</li><li>Celebrate every small voice.</li></ul>'],
      ['Delivery',       'What to avoid — always',                   '<h3>Six things we do not bring into the circle</h3><ol><li>Scary villains & dark imagery.</li><li>Too many characters.</li><li>Abstract morals.</li><li>Over-acting & theatrics.</li><li>Quizzing the child after.</li><li>Rushed endings.</li></ol>'],
      ['Delivery',       'After the story — the afterglow',          '<h3>How to end</h3><ol><li>Breathe together — ten slow seconds.</li><li>Do not quiz.</li><li>Listen, don\'t correct.</li><li>Leave the props visible for a day.</li><li>Re-tell later.</li></ol>'],
      ['Practice',       'Build your story collection',              '<h3>The teacher\'s journal</h3><ol><li>Keep a small notebook.</li><li>Collect 10 stories per Montessori value.</li><li>Practice aloud, never in your head.</li><li>Share with colleagues — exchange monthly.</li><li>Retire any story that no longer serves.</li></ol>'],
      ['Practice',       'Your four-week practice plan',             '<h3>Plant one story. Tend it for four weeks.</h3><ul><li><strong>Week 01:</strong> Choose one value, one story.</li><li><strong>Week 02:</strong> Tell it three times.</li><li><strong>Week 03:</strong> Add a single prop.</li><li><strong>Week 04:</strong> Teach a colleague.</li></ul>']
    ];
    STR.forEach((row, i) => {
      addLessonIfMissing({
        id: 'lstr' + (i + 1), courseId: 'c6', module: row[0],
        title: row[1], type: 'text', content: row[2],
        duration: '5 min', order: i + 1
      });
    });
    addLessonIfMissing({
      id: 'lstr_deck', courseId: 'c6', module: 'Course Deck',
      title: 'Storytelling — Full Slide Deck',
      type: 'text',
      content: '<p>Download the full 18-slide training deck with four Montessori value stories and a four-week practice plan.</p>',
      duration: '', order: 100,
      pdf: 'assets/decks/Storytelling_for_Young_Minds.pptx'
    });

    if (touched) {
      dbSet(DB.COURSES, courses);
      dbSet(DB.LESSONS, lessons);
      console.log('✅ Patched: Phonics A–Z + Storytelling courses added');
    }
  } catch (err) {
    console.error('patchNewCourses failed:', err);
  }
}

/* =========================================================
   ANSHA MONTESSORI LMS — UTILS.JS
   General utilities: dates, toasts, modals, formatting
   ========================================================= */

/* ---- PWA: Service Worker + Install Prompt ---- */
(function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/lms/sw.js').catch(() => {});
  }
  let _deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstall = e;
    // Show install button if present
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'inline-flex';
  });
  window.addEventListener('appinstalled', () => {
    _deferredInstall = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
    showToast('App installed! 🎉', 'success');
  });
  window._triggerInstall = () => {
    if (!_deferredInstall) return;
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(() => { _deferredInstall = null; });
  };
})();

// Load Font Awesome 6
(function () {
  if (document.querySelector('link[href*="font-awesome"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.crossOrigin = 'anonymous';
  l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  document.head.appendChild(l);
})();

/* ---- Date helpers ---- */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}
function isOverdue(dateStr) {
  return dateStr && new Date(dateStr) < new Date();
}

/* ---- Toast notifications ---- */
function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ---- Confirm dialog ---- */
function showConfirm(message, onConfirm, title = 'Confirm Action') {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop active';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--gray-600)">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
        <button class="btn btn-danger" id="confirm-yes">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#confirm-yes').onclick = () => {
    backdrop.remove();
    onConfirm();
  };
}

/* ---- Modal helpers ---- */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}
function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
}
// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) closeAllModals();
});

/* ---- String helpers ---- */
function truncate(str, n = 80) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

/* ---- Avatar helper ---- */
function avatarHtml(user, size = '') {
  return `<div class="avatar ${size}" style="background:var(--primary-light);color:var(--primary);">${user.avatar || getInitials(user.name)}</div>`;
}

/* ---- Badge helpers ---- */
function roleBadge(role) {
  const map = { admin: 'badge-info', teacher: 'badge-primary', student: 'badge-accent' };
  return `<span class="badge ${map[role] || 'badge-gray'}">${capitalize(role)}</span>`;
}
function statusBadge(status) {
  const map = { active: 'badge-success', completed: 'badge-primary', inactive: 'badge-gray', pending: 'badge-warning', paid: 'badge-success', unpaid: 'badge-danger' };
  return `<span class="badge ${map[status] || 'badge-gray'}">${capitalize(status)}</span>`;
}
function progressBar(pct, color = '') {
  const c = pct >= 100 ? 'success' : pct >= 50 ? '' : 'accent';
  return `<div class="flex items-center gap-2">
    <div class="progress flex-1"><div class="progress-bar ${color || c}" style="width:${pct}%"></div></div>
    <span class="text-xs text-muted">${pct}%</span>
  </div>`;
}

/* ---- Search/filter ---- */
function filterTable(inputId, tableId, colIndices) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase();
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
      const text = colIndices
        ? colIndices.map(i => row.cells[i]?.textContent || '').join(' ').toLowerCase()
        : row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  });
}

/* ---- Dark Mode ---- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('lms_theme', theme);
}
function toggleDarkMode() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  _updateDarkToggleIcon();
}
function _updateDarkToggleIcon() {
  const btn = document.getElementById('dark-toggle-btn');
  if (btn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}
(function initTheme() {
  const saved = localStorage.getItem('lms_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

/* ---- Notification Bell ---- */
function renderNotifDropdown(userId) {
  const wrapper = document.getElementById('notif-wrapper');
  if (!wrapper || typeof dbGet === 'undefined') return;
  const notifications = getNotifications(userId);
  const unread = notifications.filter(n => !n.read).length;

  const badge = document.getElementById('notif-badge');
  if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? 'flex' : 'none'; }

  const body = document.getElementById('notif-dropdown-body');
  if (!body) return;
  if (!notifications.length) {
    body.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell" style="font-size:2rem;margin-bottom:8px;display:block;"></i>No notifications yet</div>';
    return;
  }
  const iconMap = { info: '📘', success: '✅', warning: '⚠️', danger: '🔔' };
  body.innerHTML = notifications.slice(0, 20).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="readNotif('${n.id}','${userId}','${n.link || ''}')">
      <div class="notif-item-icon ${n.type || 'info'}">${iconMap[n.type] || '📘'}</div>
      <div class="notif-item-text">
        <p>${n.message}</p>
        <span>${daysAgo(n.createdAt)}</span>
      </div>
    </div>`).join('');
}
function readNotif(id, userId, link) {
  markNotificationRead(id);
  renderNotifDropdown(userId);
  if (link) window.location.href = link;
}
function toggleNotifDropdown(userId) {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  const open = dd.classList.toggle('open');
  if (open) renderNotifDropdown(userId);
}
function _closeNotifOnOutsideClick(e) {
  const wrapper = document.getElementById('notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.remove('open');
  }
}

/* ---- Sidebar active state ---- */
function setActiveNav() {
  const page = window.location.pathname.split('/').pop().replace('.html', '');
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    if (href.includes(page)) item.classList.add('active');
  });
}

/* ---- Build sidebar HTML ---- */
function buildSidebar(user) {
  const adminNav = `
    <div class="nav-section-title">Main</div>
    <a href="dashboard.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-gauge-high"></i></span> Dashboard</a>
    <a href="teachers.html"     class="nav-item"><span class="nav-icon"><i class="fa-solid fa-chalkboard-user"></i></span> Teachers</a>
    <div class="nav-section-title">Students</div>
    <a href="students.html"     class="nav-item"><span class="nav-icon"><i class="fa-solid fa-users"></i></span> Manage Students</a>
    <a href="student-info.html" class="nav-item"><span class="nav-icon"><i class="fa-solid fa-id-card"></i></span> Student Information</a>
    <a href="admission.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-file-circle-plus"></i></span> Admission</a>
    <a href="attendance.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-clipboard-check"></i></span> Attendance</a>
    <div class="nav-section-title">Academic</div>
    <a href="courses.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-book-open"></i></span> Courses</a>
    <a href="lessons.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-video"></i></span> Lessons & PDFs</a>
    <a href="recordings.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-circle-play"></i></span> Class Recordings</a>
    <a href="schedule.html"     class="nav-item"><span class="nav-icon"><i class="fa-solid fa-calendar-days"></i></span> Live Classes</a>
    <a href="results.html"             class="nav-item"><span class="nav-icon"><i class="fa-solid fa-trophy"></i></span> Exam Results</a>
    <a href="assessment-results.html"  class="nav-item"><span class="nav-icon"><i class="fa-solid fa-clipboard-question"></i></span> Assessment Results</a>
    <a href="leaderboard.html"  class="nav-item"><span class="nav-icon"><i class="fa-solid fa-ranking-star"></i></span> Leaderboard</a>
    <a href="gradebook.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-book-bookmark"></i></span> Grade Book</a>
    <div class="nav-section-title">Finance</div>
    <a href="payment.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-receipt"></i></span> Payment</a>
    <a href="expenses.html"     class="nav-item"><span class="nav-icon"><i class="fa-solid fa-arrow-trend-down"></i></span> Expenses</a>
    <a href="profit-loss.html"  class="nav-item"><span class="nav-icon"><i class="fa-solid fa-chart-line"></i></span> Profit & Loss</a>
    <div class="nav-section-title">System</div>
    <a href="reports.html"          class="nav-item"><span class="nav-icon"><i class="fa-solid fa-file-chart-column"></i></span> Reports</a>
    <a href="feedback-report.html"  class="nav-item"><span class="nav-icon"><i class="fa-solid fa-star-half-stroke"></i></span> Feedback Report</a>
    <a href="webinar-report.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-microphone"></i></span> Webinar Report</a>
    <a href="backup.html"           class="nav-item"><span class="nav-icon"><i class="fa-solid fa-database"></i></span> Backup & Restore</a>`;

  const teacherNav = `
    <div class="nav-section-title">Main</div>
    <a href="dashboard.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-gauge-high"></i></span> Dashboard</a>
    <a href="courses.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-book-open"></i></span> My Courses</a>
    <div class="nav-section-title">Content</div>
    <a href="lessons.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-video"></i></span> Lessons</a>
    <a href="quizzes.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-circle-question"></i></span> Quizzes</a>
    <a href="assignments.html"  class="nav-item"><span class="nav-icon"><i class="fa-solid fa-file-lines"></i></span> Assignments</a>
    <a href="attendance.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-clipboard-check"></i></span> Attendance</a>`;

  const studentNav = `
    <div class="nav-section-title">Main</div>
    <a href="dashboard.html" class="nav-item"><span class="nav-icon"><i class="fa-solid fa-house"></i></span> Dashboard</a>
    <a href="courses.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-compass"></i></span> Browse Courses</a>
    <div class="nav-section-title">My Learning</div>
    <a href="my-courses.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-graduation-cap"></i></span> My Courses</a>
    <a href="calendar.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-calendar-days"></i></span> My Calendar</a>
    <a href="schedule.html"      class="nav-item"><span class="nav-icon"><i class="fa-solid fa-video"></i></span> Live Classes</a>
    <a href="recordings.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-circle-play"></i></span> Class Recordings</a>
    <a href="assignments.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-file-lines"></i></span> Assignments</a>
    <a href="assessment.html"    class="nav-item"><span class="nav-icon"><i class="fa-solid fa-clipboard-question"></i></span> Assessment</a>
    <a href="results.html"       class="nav-item"><span class="nav-icon"><i class="fa-solid fa-trophy"></i></span> My Results</a>
    <a href="gradebook.html"     class="nav-item"><span class="nav-icon"><i class="fa-solid fa-book-bookmark"></i></span> Grade Report</a>
    <a href="leaderboard.html"   class="nav-item"><span class="nav-icon"><i class="fa-solid fa-ranking-star"></i></span> Leaderboard</a>
    <a href="profile.html"       class="nav-item"><span class="nav-icon"><i class="fa-solid fa-user-circle"></i></span> Profile & Certs</a>`;

  const navMap = { admin: adminNav, teacher: teacherNav, student: studentNav };

  return `
    <div class="sidebar-logo">
      <div class="logo-icon"><i class="fa-solid fa-school"></i></div>
      <div class="logo-text">
        <h2>Ansha Montessori</h2>
        <p>Teacher Training Institute</p>
      </div>
    </div>
    <div class="sidebar-user">
      <div class="avatar" style="background:var(--primary-light);color:var(--primary);">${user.avatar || getInitials(user.name)}</div>
      <div class="user-info">
        <div class="user-name">${user.name}</div>
        <div class="user-role">${user.role}</div>
      </div>
    </div>
    <nav class="sidebar-nav">${navMap[user.role] || ''}</nav>
    <div class="sidebar-footer">
      <button class="logout-btn" onclick="logout()">
        <i class="fa-solid fa-right-from-bracket"></i> Logout
      </button>
      <div style="font-size:0.68rem;color:#94a3b8;text-align:center;margin-top:10px;line-height:1.5;padding:0 8px;">
        © 2026 Inspireway Education Services<br>Private Limited
      </div>
    </div>`;
}

function initPage(role) {
  const user = requireAuth(role);
  if (!user) return null;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) { sidebar.innerHTML = buildSidebar(user); setActiveNav(); }
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = user.name;
  _initMobileNav(sidebar);
  _initHeaderControls(user);
  _injectBackButton();
  return user;
}

function _injectBackButton() {
  const headerLeft = document.querySelector('.header-left');
  if (!headerLeft) return;
  // Don't show back button on dashboard pages
  const page = location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') return;
  if (document.getElementById('global-back-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'global-back-btn';
  btn.title = 'Go Back';
  btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
  btn.style.cssText = 'background:none;border:1.5px solid #e2e8f0;border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b;font-size:.9rem;flex-shrink:0;transition:all .15s;';
  btn.onmouseover = () => { btn.style.background='#f1f5f9'; btn.style.color='#1e293b'; };
  btn.onmouseout  = () => { btn.style.background='none';    btn.style.color='#64748b'; };
  btn.onclick = () => history.length > 1 ? history.back() : location.href='dashboard.html';
  headerLeft.prepend(btn);
}

function _initHeaderControls(user) {
  const headerRight = document.querySelector('.header-right');
  if (!headerRight) return;

  // Inject PWA install button (hidden until browser fires beforeinstallprompt)
  if (!document.getElementById('pwa-install-btn')) {
    const installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.className = 'btn btn-outline btn-sm';
    installBtn.title = 'Install App';
    installBtn.style.display = 'none';
    installBtn.innerHTML = '<i class="fa-solid fa-download"></i> Install App';
    installBtn.onclick = () => window._triggerInstall();
    headerRight.prepend(installBtn);
  }

  // Inject dark mode toggle
  if (!document.getElementById('dark-toggle-btn')) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'dark-toggle-btn';
    toggleBtn.className = 'dark-toggle';
    toggleBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    toggleBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    toggleBtn.onclick = toggleDarkMode;
    headerRight.prepend(toggleBtn);
  }

  // Inject notification bell
  if (!document.getElementById('notif-wrapper') && typeof getNotifications !== 'undefined') {
    const unread = getUnreadCount(user.id);
    const wrapper = document.createElement('div');
    wrapper.id = 'notif-wrapper';
    wrapper.className = 'notif-wrapper';
    wrapper.innerHTML = `
      <button class="notif-btn" id="notif-bell-btn" onclick="toggleNotifDropdown('${user.id}')" title="Notifications">
        <i class="fa-solid fa-bell"></i>
        <span class="notif-badge" id="notif-badge" style="display:${unread ? 'flex' : 'none'}">${unread || ''}</span>
      </button>
      <div class="notif-dropdown" id="notif-dropdown">
        <div class="notif-dropdown-header">
          <h4>Notifications</h4>
          <button class="btn btn-ghost btn-sm" onclick="markAllNotificationsRead('${user.id}');renderNotifDropdown('${user.id}')">Mark all read</button>
        </div>
        <div class="notif-dropdown-body" id="notif-dropdown-body"></div>
        <div class="notif-dropdown-footer"><a href="#">View all</a></div>
      </div>`;
    // Insert before dark toggle
    const darkBtn = document.getElementById('dark-toggle-btn');
    headerRight.insertBefore(wrapper, darkBtn);
    document.addEventListener('click', _closeNotifOnOutsideClick);
  }
}

/* ---- Mobile sidebar toggle ---- */
function _initMobileNav(sidebar) {
  // Inject hamburger into .header-left
  const headerLeft = document.querySelector('.header-left');
  if (headerLeft && !document.getElementById('hamburger-btn')) {
    const btn = document.createElement('button');
    btn.id = 'hamburger-btn';
    btn.className = 'hamburger-btn';
    btn.setAttribute('aria-label', 'Toggle menu');
    btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    btn.onclick = toggleSidebar;
    headerLeft.prepend(btn);
  }
  // Inject overlay
  if (!document.getElementById('sidebar-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'sidebar-overlay';
    ov.className = 'sidebar-overlay';
    ov.onclick = closeSidebar;
    document.body.appendChild(ov);
  }
  // Auto-close sidebar on nav click (mobile)
  if (sidebar) {
    sidebar.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); });
    });
  }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('active', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
}

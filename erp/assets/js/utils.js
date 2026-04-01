/* ================================================================
   UTILITIES — Sidebar, Toast, Modals, Common Functions
   ================================================================ */

/* ---------- Toast ---------- */
function showToast(msg, type = 'info') {
  const icons = { success:'✅', danger:'❌', warning:'⚠️', info:'ℹ️' };
  const c = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div'); el.id = 'toast-container';
    document.body.appendChild(el); return el;
  })();
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------- Modal ---------- */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* ---------- Sidebar ---------- */
function buildSidebar(activePage) {
  const session = getSession();
  if (!session) return;
  const branchId = getCurrentBranchId();
  const branch = getBranchById(branchId);
  const isSA = session.role === 'superadmin';

  const nav = [
    { section: 'Main' },
    { page:'dashboard',  icon:'📊', label:'Dashboard',         href:'dashboard.html' },
    { page:'branches',   icon:'🏫', label:'Branch Management', href:'branches.html', superOnly: true },
    { section: 'Students' },
    { page:'students',   icon:'👧', label:'All Students',      href:'students.html' },
    { page:'admission',  icon:'📋', label:'New Admission',     href:'admission.html' },
    { page:'attendance', icon:'✅', label:'Attendance',        href:'attendance.html' },
    { section: 'Staff & HR' },
    { page:'staff',      icon:'👩‍🏫', label:'Staff Management',  href:'staff.html' },
    { page:'payroll',    icon:'💰', label:'Payroll',            href:'payroll.html' },
    { section: 'Finance' },
    { page:'fees',       icon:'🧾', label:'Fees Collection',   href:'fees.html' },
    { page:'finance',    icon:'📈', label:'Income & Expenses',  href:'finance.html' },
    { section: 'Operations' },
    { page:'transport',  icon:'🚌', label:'Transport',         href:'transport.html' },
    { page:'cctv',       icon:'📹', label:'CCTV Monitor',      href:'cctv.html' },
    { page:'programs',   icon:'📚', label:'Programs',          href:'programs.html' },
    { section: 'System' },
    { page:'backup',     icon:'💾', label:'Backup & Restore',  href:'backup.html' },
  ];

  const branchOptions = BRANCHES.map(b =>
    `<option value="${b.id}" ${b.id === branchId ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  const navHTML = nav.map(item => {
    if (item.section) return `<div class="nav-section-title">${item.section}</div>`;
    if (item.superOnly && !isSA) return '';
    const isActive = activePage === item.page;
    return `<li class="nav-item"><a href="${item.href}" class="${isActive ? 'active' : ''}">
      <span class="nav-icon">${item.icon}</span> ${item.label}
    </a></li>`;
  }).join('');

  const sidebarHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">🌟</div>
      <div class="logo-text">
        <h1>Ansha Shine</h1>
        <p>Kids School ERP</p>
      </div>
    </div>
    ${isSA ? `<div class="sidebar-branch">
      <label>Active Branch</label>
      <select onchange="setActiveBranch(this.value)">${branchOptions}</select>
    </div>` : `<div class="sidebar-branch">
      <label>Branch</label>
      <div style="color:#fff;font-size:13px;font-weight:600;">${branch?.name || 'My Branch'}</div>
    </div>`}
    <nav class="sidebar-nav">
      <ul>${navHTML}</ul>
    </nav>
    <div style="padding:14px 22px;border-top:1px solid rgba(255,255,255,0.08);margin-top:auto;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar avatar-sm av-orange">${session.avatar}</div>
        <div style="flex:1;min-width:0;">
          <div style="color:#fff;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${session.name}</div>
          <div style="color:rgba(255,255,255,0.45);font-size:11px;">${session.role === 'superadmin' ? 'Super Admin' : 'Branch Admin'}</div>
        </div>
        <button onclick="logout()" title="Logout" style="color:rgba(255,255,255,0.5);font-size:16px;background:none;border:none;cursor:pointer;">🚪</button>
      </div>
    </div>`;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = sidebarHTML;

  const header = document.getElementById('header-branch');
  if (header) header.textContent = branch?.name || 'All Branches';

  const headerUser = document.getElementById('header-user-name');
  if (headerUser) headerUser.textContent = session.name;
  const headerRole = document.getElementById('header-user-role');
  if (headerRole) headerRole.textContent = session.role === 'superadmin' ? 'Super Admin' : 'Branch Admin';
  const headerAvatar = document.getElementById('header-avatar');
  if (headerAvatar) headerAvatar.textContent = session.avatar;

  // Sidebar toggle
  document.querySelector('.header-toggle')?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Clock
  const clockEl = document.getElementById('header-clock');
  if (clockEl) {
    const tick = () => { clockEl.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }); };
    tick(); setInterval(tick, 60000);
  }
  const dateEl = document.getElementById('header-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

/* ---------- Nav Submenu Toggle ---------- */
function initSubmenus() {
  document.querySelectorAll('.nav-has-sub').forEach(item => {
    item.querySelector('a')?.addEventListener('click', e => {
      e.preventDefault();
      item.classList.toggle('open');
      item.querySelector('.nav-submenu')?.classList.toggle('open');
    });
  });
}

/* ---------- Table Search ---------- */
function tableSearch(inputId, tableId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

/* ---------- Confirm Dialog ---------- */
function confirmAction(msg, cb) {
  if (confirm(msg)) cb();
}

/* ---------- Print ---------- */
function printSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Print</title><style>body{font-family:sans-serif;padding:20px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f5f5f5;}</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); w.print();
}

/* ---------- Export CSV ---------- */
function exportCSV(data, filename) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

/* ---------- Generate Receipt No ---------- */
function generateReceiptNo() {
  return 'RCP-' + Date.now().toString().slice(-8);
}

/* ---------- Status Badge HTML ---------- */
function statusBadge(status) {
  const map = {
    active:   'badge-green',  inactive: 'badge-gray',
    paid:     'badge-green',  partial:  'badge-yellow',
    pending:  'badge-red',    waived:   'badge-purple',
    online:   'badge-green',  offline:  'badge-red',
    setup:    'badge-yellow', planned:  'badge-blue',
    P: 'badge-green',  A: 'badge-red',  L: 'badge-yellow',  H: 'badge-blue',
  };
  const labels = { active:'Active', inactive:'Inactive', paid:'Paid', partial:'Partial', pending:'Pending', waived:'Waived', online:'Online', offline:'Offline', setup:'Setup', planned:'Planned', P:'Present', A:'Absent', L:'Leave', H:'Holiday' };
  return `<span class="badge ${map[status]||'badge-gray'}">${labels[status]||status}</span>`;
}

/* ---------- Confirm Delete ---------- */
function deleteRow(btn, msg='Are you sure you want to delete this record?') {
  if (confirm(msg)) {
    btn.closest('tr')?.remove();
    showToast('Record deleted successfully', 'success');
  }
}

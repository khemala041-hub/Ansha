/* ================================================================
   AUTH & SESSION MANAGEMENT
   ================================================================ */

const SESSION_KEY = 'asks_erp_session';

function login(email, password) {
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === password);
  if (!user) return { success: false, message: 'Invalid email or password. Please try again.' };
  const session = { userId: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId, avatar: user.avatar, loginAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, user, session };
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

function getSession() {
  const s = localStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}

function requireAuth(allowedRoles) {
  const session = getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return session;
}

function isSuperAdmin() {
  const s = getSession();
  return s && s.role === 'superadmin';
}

function getCurrentBranchId() {
  const s = getSession();
  if (!s) return null;
  if (s.role === 'superadmin') {
    return localStorage.getItem('asks_active_branch') || 'B001';
  }
  return s.branchId;
}

function setActiveBranch(branchId) {
  localStorage.setItem('asks_active_branch', branchId);
  window.location.reload();
}

/* ================================================================
   ANSHA SHINE KIDS SCHOOL — ERP DATA LAYER
   Sample data (1 record each) + localStorage persistence
   Backup/Restore reads and writes via localStorage keys.
   ================================================================ */

/* ---- Data version — bump this to wipe old localStorage on next load ---- */
const _DATA_VERSION = '5.0';
(function _resetIfVersionChanged() {
  if (localStorage.getItem('asks_erp_version') !== _DATA_VERSION) {
    const keep = ['asks_erp_session', 'asks_erp_backup_history', 'asks_active_branch'];
    const saved = {};
    keep.forEach(k => { const v = localStorage.getItem(k); if (v) saved[k] = v; });
    localStorage.clear();
    Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v));
    localStorage.setItem('asks_erp_version', _DATA_VERSION);
  }
})();

/* ---- localStorage persistence helper ---- */
function _loadStored(key, defaults) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : defaults;
  } catch { return defaults; }
}

/* ---- Persist a mutable array back to localStorage + Supabase ---- */
function _saveStored(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  if (window.supabasePush) supabasePush(key, arr);
}

/* ---------- BRANCHES ---------- */
const _DEFAULT_BRANCHES = [
  { id:'B001', name:'Tambaram West',  addr:'No# 1A, Sundaram Colony 3rd St, Near Anchaneyar Kovil, Tambaram West, Chennai 600 045', phone:'860 861 2233', email:'tambaram@anshashinekidsschool.com',  adminId:'U002', status:'active',  est:'2015', students:0, staff:0 },
  { id:'B002', name:'Mudichur',       addr:'Dhanalaxmi St, South Laxmi Nager, Opp Nayara Petrol Bunk, Chennai 600 048',             phone:'984 172 6893', email:'mudichur@anshashinekidsschool.com',   adminId:'U003', status:'active',  est:'2017', students:0, staff:0 },
  { id:'B003', name:'Padapai',        addr:'Ozur Amman Kovil St, Athencherry, Opp. Annai Sagaya Mary Church, Padapai 601 301',       phone:'936 771 2344', email:'padappai@anshashinekidsschool.com',   adminId:'U004', status:'active',  est:'2018', students:0, staff:0 },
  { id:'B004', name:'Pallavakkam',    addr:'Periyar Nager Junction, Pallavakam, Chennai 600 041',                                    phone:'944 492 1124', email:'pallavakam@anshashinekidsschool.com',  adminId:'U005', status:'active',  est:'2019', students:0, staff:0 },
  { id:'B005', name:'Mannivakkam',    addr:'Shanmuga Nagar, Mannivakkam, Chennai 600 048',                                           phone:'843 811 1248', email:'mannivakkam@anshashinekidsschool.com', adminId:'U006', status:'active',  est:'2019', students:0, staff:0 },
  { id:'B006', name:'Kanathur',       addr:'ECR Main Road, Kanathur, Chennai 603 112',                                               phone:'98842 81223',  email:'kanathur@anshashinekidsschool.com',    adminId:'U007', status:'active',  est:'2020', students:0, staff:0 },
  { id:'B007', name:'Mappedu',        addr:'Near Mappedu Bus Stop, Mappedu, Thiruvallur 602 105',                                    phone:'90031 44556',  email:'mappedu@anshashinekidsschool.com',     adminId:'U008', status:'active',  est:'2021', students:0, staff:0 },
  { id:'B008', name:'Porur',          addr:'Arcot Road, Porur, Chennai 600 116',                                                     phone:'99401 22334',  email:'porur@anshashinekidsschool.com',       adminId:null,   status:'setup',  est:'2024', students:0, staff:0 },
  { id:'B009', name:'Tambaram East',  addr:'GST Road, Tambaram East, Chennai 600 059',                                               phone:'',             email:'',                                     adminId:null,   status:'setup',  est:'2024', students:0, staff:0 },
  { id:'B010', name:'Chromepet',      addr:'Chromepet Main Road, Chennai 600 044',                                                   phone:'',             email:'',                                     adminId:null,   status:'planned',est:'2025', students:0, staff:0 },
];
const BRANCHES = _loadStored('asks_erp_branches', _DEFAULT_BRANCHES);

/* ---------- PROGRAMS (static config — not backed up separately) ---------- */
const PROGRAMS = [
  { id:'PR01', code:'DC',  name:'Day Care',         ageGroup:'6 months – 3 yrs', duration:'Full Day (8am–6pm)',  monthlyFee:2500, color:'#7D3C98', icon:'🍼' },
  { id:'PR02', code:'NUR', name:'Nursery',           ageGroup:'2.5 – 3.5 yrs',   duration:'Half / Full Day',     monthlyFee:3000, color:'#E65100', icon:'🌱' },
  { id:'PR03', code:'PKG', name:'Pre KG',            ageGroup:'3.5 – 4.5 yrs',   duration:'Full Day (8am–1pm)',  monthlyFee:3500, color:'#1565C0', icon:'📚' },
  { id:'PR04', code:'LKG', name:'LKG',               ageGroup:'4.5 – 5.5 yrs',   duration:'Full Day (8am–1pm)',  monthlyFee:4000, color:'#1A7A4A', icon:'🎨' },
  { id:'PR05', code:'UKG', name:'UKG',               ageGroup:'5.5 – 6.5 yrs',   duration:'Full Day (8am–1pm)',  monthlyFee:4500, color:'#B7950B', icon:'⭐' },
  { id:'PR06', code:'SC',  name:'Summer Camp',       ageGroup:'3 – 8 yrs',        duration:'May–June (4 wks)',    monthlyFee:5000, color:'#C62828', icon:'☀️' },
  { id:'PR07', code:'AS',  name:'After School Care', ageGroup:'5 – 10 yrs',       duration:'3pm – 6pm',          monthlyFee:2000, color:'#00838F', icon:'🏃' },
];

/* ---------- USERS / ADMINS (static — passwords never exported) ---------- */
const USERS = [
  { id:'U001', name:'Super Admin',    email:'admin@anshashinekidsschool.com',     pass:'Admin@123',  role:'superadmin', branchId:null,   phone:'860 861 2200', avatar:'SA' },
  { id:'U002', name:'Priya Devi',     email:'tambaram@anshashinekidsschool.com',  pass:'Branch@123', role:'admin',      branchId:'B001', phone:'860 861 2233', avatar:'PD' },
  { id:'U003', name:'Kavitha Rajan',  email:'mudichur@anshashinekidsschool.com',  pass:'Branch@123', role:'admin',      branchId:'B002', phone:'984 172 6893', avatar:'KR' },
  { id:'U004', name:'Sunita Kumari',  email:'padappai@anshashinekidsschool.com',  pass:'Branch@123', role:'admin',      branchId:'B003', phone:'936 771 2344', avatar:'SK' },
  { id:'U005', name:'Meena Lakshmi',  email:'pallavakam@anshashinekidsschool.com',pass:'Branch@123', role:'admin',      branchId:'B004', phone:'944 492 1124', avatar:'ML' },
  { id:'U006', name:'Radha Mani',     email:'mannivakkam@anshashinekidsschool.com',pass:'Branch@123',role:'admin',      branchId:'B005', phone:'843 811 1248', avatar:'RM' },
  { id:'U007', name:'Sujatha Nair',   email:'kanathur@anshashinekidsschool.com',  pass:'Branch@123', role:'admin',      branchId:'B006', phone:'98842 81223',  avatar:'SN' },
  { id:'U008', name:'Anitha Bose',    email:'mappedu@anshashinekidsschool.com',   pass:'Branch@123', role:'admin',      branchId:'B007', phone:'90031 44556',  avatar:'AB' },
];

/* ---------- STAFF ---------- */
const STAFF = _loadStored('asks_erp_staff', []);

/* ---------- STUDENTS (1 sample record per branch) ---------- */
const STUDENTS = _loadStored('asks_erp_students', [
  { id:'ST0001', branchId:'B001', admNo:'ASKS/B001/2026-01', name:'Sample Student', gender:'M', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'O+', parentName:'Parent Name', parentPhone:'9600000001', parentEmail:'parent@example.com', address:'Tambaram West, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0002', branchId:'B002', admNo:'ASKS/B002/2026-01', name:'Sample Student', gender:'F', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'A+', parentName:'Parent Name', parentPhone:'9600000002', parentEmail:'parent2@example.com', address:'Mudichur, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0003', branchId:'B003', admNo:'ASKS/B003/2026-01', name:'Sample Student', gender:'M', dob:'2021-04-01', program:'PKG', programName:'Pre KG', section:'A', bloodGroup:'B+', parentName:'Parent Name', parentPhone:'9600000003', parentEmail:'parent3@example.com', address:'Padapai, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3500, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0004', branchId:'B004', admNo:'ASKS/B004/2026-01', name:'Sample Student', gender:'F', dob:'2020-04-01', program:'LKG', programName:'LKG', section:'A', bloodGroup:'O+', parentName:'Parent Name', parentPhone:'9600000004', parentEmail:'parent4@example.com', address:'Pallavakkam, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:4000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0005', branchId:'B005', admNo:'ASKS/B005/2026-01', name:'Sample Student', gender:'M', dob:'2020-04-01', program:'LKG', programName:'LKG', section:'A', bloodGroup:'A+', parentName:'Parent Name', parentPhone:'9600000005', parentEmail:'parent5@example.com', address:'Mannivakkam, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:4000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0006', branchId:'B006', admNo:'ASKS/B006/2026-01', name:'Sample Student', gender:'F', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'B+', parentName:'Parent Name', parentPhone:'9600000006', parentEmail:'parent6@example.com', address:'Kanathur, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0007', branchId:'B007', admNo:'ASKS/B007/2026-01', name:'Sample Student', gender:'M', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'O+', parentName:'Parent Name', parentPhone:'9600000007', parentEmail:'parent7@example.com', address:'Mappedu, Thiruvallur', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0008', branchId:'B008', admNo:'ASKS/B008/2026-01', name:'Sample Student', gender:'F', dob:'2021-04-01', program:'DC',  programName:'Day Care', section:'A', bloodGroup:'A+', parentName:'Parent Name', parentPhone:'9600000008', parentEmail:'parent8@example.com', address:'Porur, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:2500, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0009', branchId:'B009', admNo:'ASKS/B009/2026-01', name:'Sample Student', gender:'M', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'O+', parentName:'Parent Name', parentPhone:'9600000009', parentEmail:'parent9@example.com', address:'Tambaram East, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
  { id:'ST0010', branchId:'B010', admNo:'ASKS/B010/2026-01', name:'Sample Student', gender:'F', dob:'2021-04-01', program:'NUR', programName:'Nursery', section:'A', bloodGroup:'B+', parentName:'Parent Name', parentPhone:'9600000010', parentEmail:'parent10@example.com', address:'Chromepet, Chennai', admDate:'2026-04-01', status:'active', monthlyFee:3000, transport:'', feeStatus:'pending', photoInit:'SS' },
]);

/* ---------- TRANSPORT ROUTES ---------- */
const TRANSPORT_ROUTES = _loadStored('asks_erp_routes', []);

/* ---------- FEES ---------- */
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const FEE_RECORDS = _loadStored('asks_erp_fees', []);

/* ---------- FINANCE / LEDGER ---------- */
const LEDGER = _loadStored('asks_erp_ledger', []);

/* ---------- CCTV CAMERAS (static config) ---------- */
const CCTV_CAMERAS = [
  { id:'CAM01', branchId:'B001', name:'Main Entrance',    location:'Gate',         status:'online',  resolution:'1080p', icon:'🚪' },
  { id:'CAM02', branchId:'B001', name:'Nursery Room',     location:'Classroom-1',  status:'online',  resolution:'1080p', icon:'🍼' },
  { id:'CAM03', branchId:'B001', name:'PreKG Classroom',  location:'Classroom-2',  status:'online',  resolution:'1080p', icon:'📚' },
  { id:'CAM04', branchId:'B001', name:'LKG Classroom',    location:'Classroom-3',  status:'online',  resolution:'720p',  icon:'🎨' },
  { id:'CAM05', branchId:'B001', name:'UKG Classroom',    location:'Classroom-4',  status:'online',  resolution:'720p',  icon:'⭐' },
  { id:'CAM06', branchId:'B001', name:'Day Care Room',    location:'Daycare',      status:'online',  resolution:'1080p', icon:'🛏️' },
  { id:'CAM07', branchId:'B001', name:'Play Area',        location:'Outdoor',      status:'online',  resolution:'720p',  icon:'🛝' },
  { id:'CAM08', branchId:'B001', name:'Cafeteria',        location:'Ground Floor', status:'offline', resolution:'720p',  icon:'🍽️' },
  { id:'CAM09', branchId:'B001', name:'Corridor North',   location:'1st Floor',    status:'online',  resolution:'720p',  icon:'🚶' },
  { id:'CAM10', branchId:'B001', name:'Admin Office',     location:'Office',       status:'online',  resolution:'1080p', icon:'🖥️' },
  { id:'CAM11', branchId:'B001', name:'Parking Lot',      location:'Exterior',     status:'online',  resolution:'720p',  icon:'🚗' },
  { id:'CAM12', branchId:'B001', name:'After School Room',location:'Classroom-5',  status:'offline', resolution:'1080p', icon:'🏃' },
];

/* ---------- ATTENDANCE ---------- */
const TODAY = new Date().toISOString().split('T')[0];
const ATTENDANCE_DATA = {};

/* ---------- HELPER FUNCTIONS ---------- */
function getBranchById(id)       { return BRANCHES.find(b => b.id === id); }
function getUserByEmail(email)   { return USERS.find(u => u.email.toLowerCase() === email.toLowerCase()); }
function getStudentsByBranch(bid){ return STUDENTS.filter(s => s.branchId === bid); }
function getStaffByBranch(bid)   { return STAFF.filter(s => s.branchId === bid); }
function getProgramByCode(code)  { return PROGRAMS.find(p => p.code === code); }
function getFeesByBranch(bid)    { return FEE_RECORDS.filter(f => f.branchId === bid); }
function getLedgerByBranch(bid)  { return LEDGER.filter(l => l.branchId === bid); }
function getCamerasByBranch(bid) { return CCTV_CAMERAS.filter(c => c.branchId === bid); }
function getRoutesByBranch(bid)  { return TRANSPORT_ROUTES.filter(r => r.branchId === bid); }

function currencyINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}
function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtAge(dob) {
  if (!dob) return '–';
  const today = new Date(), birth = new Date(dob);
  let y = today.getFullYear() - birth.getFullYear();
  let m = today.getMonth() - birth.getMonth();
  if (m < 0) { y--; m += 12; }
  return `${y}y ${m}m`;
}

/* ---------- ATTENDANCE PERSISTENCE ---------- */
function saveAttendance(studentId, status) {
  const key = `asks_att_${TODAY}`;
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  stored[studentId] = status;
  localStorage.setItem(key, JSON.stringify(stored));
  if (window.supabasePushAttendance) supabasePushAttendance(TODAY, stored);
}
function getTodayAttendance() {
  const key = `asks_att_${TODAY}`;
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  return { ...ATTENDANCE_DATA, ...stored };
}

/* ---------- BRANCH & SUMMARY ---------- */
function getBranchSummary(branchId) {
  const students     = getStudentsByBranch(branchId);
  const staff        = getStaffByBranch(branchId);
  const fees         = getFeesByBranch(branchId);
  const todayAtt     = getTodayAttendance();
  const presentToday = Object.values(todayAtt).filter(v => v === 'P').length;
  const totalFees    = fees.reduce((a, f) => a + f.totalFee, 0);
  const collectedFees= fees.reduce((a, f) => a + f.paidAmount, 0);
  return { students: students.length, staff: staff.length, presentToday, totalFees, collectedFees, pendingFees: totalFees - collectedFees };
}

function getAllBranchesSummary() {
  return {
    totalBranches:   BRANCHES.filter(b => b.status === 'active').length,
    totalStudents:   STUDENTS.length,
    totalStaff:      STAFF.length,
    activeBranches:  BRANCHES.filter(b => b.status === 'active').length,
    setupBranches:   BRANCHES.filter(b => b.status === 'setup').length,
    plannedBranches: BRANCHES.filter(b => b.status === 'planned').length,
  };
}

/* ---------- NEXT ID HELPERS ---------- */
function nextStudentId() {
  const ids = STUDENTS.map(s => parseInt(s.id.replace('ST', ''), 10)).filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return 'ST' + String(max + 1).padStart(4, '0');
}
function nextStaffId() {
  const ids = STAFF.map(s => parseInt(s.id.replace('S', ''), 10)).filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return 'S' + String(max + 1).padStart(3, '0');
}
function nextFeeId() {
  const ids = FEE_RECORDS.map(f => parseInt(f.id.replace('F', ''), 10)).filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return 'F' + String(max + 1).padStart(4, '0');
}
function nextLedgerId() {
  const ids = LEDGER.map(l => parseInt(l.id.replace('L', ''), 10)).filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return 'L' + String(max + 1).padStart(3, '0');
}
function nextRouteId() {
  const ids = TRANSPORT_ROUTES.map(r => parseInt(r.id.replace('R', ''), 10)).filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return 'R' + String(max + 1).padStart(3, '0');
}

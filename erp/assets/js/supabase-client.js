/* ================================================================
   SUPABASE INTEGRATION — Ansha Shine Kids School ERP
   Single table approach: erp_data (key TEXT, value JSONB)
   ================================================================ */

const SUPABASE_URL = 'https://wtcumlqwapqqkbjpjoco.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rOJdCtFChg6_FHm1hrQd1w_UcBC_m1T';

let _sb = null;
function _getSB() {
  if (!_sb && window.supabase) {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _sb;
}

/* Map localStorage keys → Supabase erp_data keys
   NOTE: branches excluded — config is in code, not Supabase */
const LS_TO_SB = {
  'asks_erp_students': 'students',
  'asks_erp_staff':    'staff',
  'asks_erp_fees':     'fee_records',
  'asks_erp_ledger':   'ledger',
  'asks_erp_routes':   'transport_routes',
};
const SB_TO_LS = Object.fromEntries(Object.entries(LS_TO_SB).map(([k,v]) => [v,k]));

/* ---- Push array to Supabase (fire-and-forget) ---- */
async function supabasePush(lsKey, arr) {
  const sb = _getSB();
  if (!sb || !Array.isArray(arr)) return;
  const sbKey = LS_TO_SB[lsKey];
  if (!sbKey) return;
  try {
    const { error } = await sb.from('erp_data').upsert(
      { key: sbKey, value: arr, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) console.warn('[Supabase Push]', sbKey, error.message);
  } catch(e) {
    console.warn('[Supabase Push Error]', lsKey, e);
  }
}

/* ---- Push attendance to Supabase ---- */
async function supabasePushAttendance(date, attendanceObj) {
  const sb = _getSB();
  if (!sb) return;
  try {
    const { error } = await sb.from('erp_data').upsert(
      { key: 'att_' + date, value: attendanceObj, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) console.warn('[Supabase Attendance]', error.message);
  } catch(e) {
    console.warn('[Supabase Attendance Error]', e);
  }
}

/* ---- Pull all data from Supabase → localStorage ---- */
async function syncFromSupabase() {
  const sb = _getSB();
  if (!sb) return false;
  try {
    const { data, error } = await sb.from('erp_data').select('key, value');
    if (error) throw error;
    if (!data || data.length === 0) return false;

    let updated = false;
    data.forEach(row => {
      if (SB_TO_LS[row.key]) {
        localStorage.setItem(SB_TO_LS[row.key], JSON.stringify(row.value));
        updated = true;
      } else if (row.key.startsWith('att_')) {
        const date = row.key.replace('att_', '');
        localStorage.setItem('asks_att_' + date, JSON.stringify(row.value));
        updated = true;
      }
    });
    return updated;
  } catch(e) {
    console.warn('[Supabase Sync Error]', e);
    return false;
  }
}

/* ---- Push ALL current localStorage data to Supabase (full backup) ---- */
async function pushAllToSupabase() {
  const sb = _getSB();
  if (!sb) return false;
  try {
    const rows = [];
    const now = new Date().toISOString();

    Object.entries(LS_TO_SB).forEach(([lsKey, sbKey]) => {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        try { rows.push({ key: sbKey, value: JSON.parse(raw), updated_at: now }); } catch {}
      }
    });

    // Attendance
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i);
      if (lsKey && lsKey.startsWith('asks_att_')) {
        const date = lsKey.replace('asks_att_', '');
        try {
          rows.push({ key: 'att_' + date, value: JSON.parse(localStorage.getItem(lsKey)), updated_at: now });
        } catch {}
      }
    }

    if (rows.length === 0) return false;
    const { error } = await sb.from('erp_data').upsert(rows, { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch(e) {
    console.warn('[Supabase Full Push Error]', e);
    return false;
  }
}

/* ---- Background sync on every page load ---- */
document.addEventListener('DOMContentLoaded', () => {
  if (_getSB()) syncFromSupabase(); // silent background sync
});

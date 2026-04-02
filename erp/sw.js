/* ================================================================
   SERVICE WORKER — Ansha Shine Kids School ERP
   Caches app shell for offline use
   ================================================================ */

const CACHE_NAME   = 'ansha-erp-v3';
const OFFLINE_URL  = '/erp/offline.html';

const APP_SHELL = [
  '/erp/',
  '/erp/index.html',
  '/erp/dashboard.html',
  '/erp/students.html',
  '/erp/staff.html',
  '/erp/attendance.html',
  '/erp/fees.html',
  '/erp/finance.html',
  '/erp/admission.html',
  '/erp/transport.html',
  '/erp/branches.html',
  '/erp/payroll.html',
  '/erp/programs.html',
  '/erp/cctv.html',
  '/erp/backup.html',
  '/erp/assets/css/style.css',
  '/erp/assets/js/data.js',
  '/erp/assets/js/auth.js',
  '/erp/assets/js/utils.js',
  '/erp/assets/js/supabase-client.js',
  '/erp/offline.html',
];

/* ---- Install: cache app shell ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ---- Activate: clean old caches ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---- Fetch: serve from cache, fallback to network ---- */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

/* ================================================================
   SERVICE WORKER — Ansha Shine Kids School ERP
   Caches app shell for offline use
   ================================================================ */

const CACHE_NAME   = 'ansha-erp-v5';
const OFFLINE_URL  = '/offline.html';

const APP_SHELL = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/students.html',
  '/staff.html',
  '/attendance.html',
  '/fees.html',
  '/finance.html',
  '/admission.html',
  '/transport.html',
  '/branches.html',
  '/payroll.html',
  '/programs.html',
  '/cctv.html',
  '/backup.html',
  '/assets/css/style.css',
  '/assets/js/data.js',
  '/assets/js/auth.js',
  '/assets/js/utils.js',
  '/assets/js/supabase-client.js',
  '/offline.html',
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

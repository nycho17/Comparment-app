/**
 * CPT Quick Lookup - Service Worker (Operational)
 * - App shell: cache-first for fast loads/offline
 * - Data JSON (/data/*.json): network-first (always fetch latest), fallback to cache when offline
 */
const APP_CACHE = 'cpt-app-v8';
const DATA_CACHE = 'cpt-data-v8';

const APP_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === APP_CACHE || k === DATA_CACHE) ? null : caches.delete(k)));
    self.clients.claim();
  })());
});

// Allow page to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const isDataJson = url.pathname.includes('/data/') && url.pathname.endsWith('.json');

  event.respondWith((async () => {
    if (isDataJson) {
      // DATA: network-first (always try to get latest)
      try {
        // bypass HTTP cache as much as possible
        const networkReq = new Request(req, { cache: 'no-store' });
        const resp = await fetch(networkReq);
        // cache latest for offline use
        const cache = await caches.open(DATA_CACHE);
        cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || new Response('Offline (no cached data)', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }

    // APP SHELL & STATIC: cache-first, then network
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const resp = await fetch(req);
      // Cache app/static assets (not data) for next time
      const cache = await caches.open(APP_CACHE);
      cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      // Offline fallback
      const fallback = await caches.match('./index.html');
      return fallback || new Response('Offline', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

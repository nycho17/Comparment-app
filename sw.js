const CACHE_NAME = 'cpt-quick-v5';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './data/comp_list.json',
  './data/comp_detail.json',
  './data/segments.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE_NAME)?null:caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const resp = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, resp.clone());
      return resp;
    } catch (e) {
      const fallback = await caches.match('./index.html');
      return fallback || new Response('Offline', {status: 200, headers:{'Content-Type':'text/plain'}});
    }
  })());
});


self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

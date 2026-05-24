// CEOZEN — Service Worker (PWA installable)
const CACHE = 'ceozen-v1';
const OFFLINE_URLS = ['/login'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Ne cache que les requêtes GET
  if (e.request.method !== 'GET') return;
  // Ne touche pas aux requêtes Supabase / API
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

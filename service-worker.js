const CACHE_NAME = 'motorsport-cal-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './f1.ics',
  './motogp.ics',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-512.svg',
  './apple-touch-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          const requestUrl = new URL(event.request.url);
          const isSameOrigin = requestUrl.origin === self.location.origin;

          if (isSameOrigin) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse));
          }

          return networkResponse;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

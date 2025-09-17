const cacheName = 'runlog-cache-v10';
const assetsToCache = [
  '.',
  'index.html',
  'offline.html',
  'styles.css',
  'main.esc.js',
  'main.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith((async () => {
    const { request } = event;
    if (request.mode === 'navigate') {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          return networkResponse;
        }
      } catch (err) {
        const cachedPage = await caches.match('index.html');
        if (cachedPage) return cachedPage;
      }
      const offlinePage = await caches.match('offline.html');
      return offlinePage || new Response('', { status: 503, statusText: 'Offline' });
    }

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const networkResponse = await fetch(request);
      if (
        networkResponse &&
        networkResponse.ok &&
        request.url.startsWith(self.location.origin)
      ) {
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (err) {
      if (request.destination === 'document') {
        const offlinePage = await caches.match('offline.html');
        if (offlinePage) return offlinePage;
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});

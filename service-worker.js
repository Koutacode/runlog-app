const cacheName = 'runlog-cache-v11';
const assetsToCache = [
  '.',
  'index.html',
  'offline.html',
  'styles.css',
  'main.esc.js',
  'main.js',
  'app-enhancements.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

const backgroundDbName = 'runlog-background-state';
const backgroundDbVersion = 1;
const backgroundStoreName = 'state';
const defaultSyncEndpoint = '/api/runlog/sync';

function openBackgroundDb() {
  if (!self.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(backgroundDbName, backgroundDbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(backgroundStoreName)) {
        db.createObjectStore(backgroundStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBackgroundState(key, value) {
  const db = await openBackgroundDb().catch(() => null);
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(backgroundStoreName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(backgroundStoreName).put(value, key);
  }).catch((error) => {
    console.warn('Failed to store background state', error);
  });
}

async function getBackgroundState(key) {
  const db = await openBackgroundDb().catch(() => null);
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(backgroundStoreName, 'readonly');
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(backgroundStoreName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    console.warn('Failed to read background state', error);
    return null;
  });
}

async function storeBackgroundState(state) {
  if (!state || typeof state !== 'object') return;
  const tasks = [];
  tasks.push(putBackgroundState('routes', state.routes || []));
  tasks.push(putBackgroundState('activeDraft', state.activeDraft || null));
  tasks.push(putBackgroundState('syncQueue', state.syncQueue || []));
  tasks.push(putBackgroundState('timestamp', state.timestamp || Date.now()));
  await Promise.all(tasks);
}

async function loadBackgroundState() {
  const [routes, activeDraft, syncQueue, timestamp] = await Promise.all([
    getBackgroundState('routes'),
    getBackgroundState('activeDraft'),
    getBackgroundState('syncQueue'),
    getBackgroundState('timestamp'),
  ]);
  return {
    routes: Array.isArray(routes) ? routes : [],
    activeDraft: activeDraft || null,
    syncQueue: Array.isArray(syncQueue) ? syncQueue : [],
    timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
  };
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach((client) => {
    try {
      client.postMessage({ namespace: 'runlog-bg', ...message });
    } catch (error) {
      console.warn('Failed to notify client', error);
    }
  });
}

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

async function processSyncQueue() {
  const state = await loadBackgroundState();
  const queue = Array.isArray(state.syncQueue) ? state.syncQueue : [];
  if (!queue.length) {
    return;
  }
  let lastError = null;
  let index = 0;
  for (; index < queue.length; index += 1) {
    const task = queue[index];
    const endpoint = typeof task?.endpoint === 'string' && task.endpoint ? task.endpoint : defaultSyncEndpoint;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(task),
        keepalive: true,
      });
      if (!response || !response.ok) {
        throw new Error(`Sync failed with status ${response ? response.status : 'unknown'}`);
      }
    } catch (error) {
      lastError = error;
      break;
    }
  }
  if (index >= queue.length) {
    await putBackgroundState('syncQueue', []);
    await notifyClients({ type: 'SYNC_COMPLETE', processed: queue.length });
    return;
  }
  const remaining = queue.slice(index);
  await putBackgroundState('syncQueue', remaining);
  await notifyClients({
    type: 'SYNC_ERROR',
    remaining: remaining.length,
    error: lastError ? (lastError.message || String(lastError)) : 'Sync failed',
  });
  throw lastError || new Error('Sync incomplete');
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.namespace !== 'runlog-bg') return;
  if (data.type === 'STATE_UPDATE') {
    event.waitUntil(storeBackgroundState(data.state || {}));
    return;
  }
  if (data.type === 'STATE_REQUEST') {
    event.waitUntil((async () => {
      const state = await loadBackgroundState();
      const response = {
        namespace: 'runlog-bg',
        type: 'STATE_RESPONSE',
        requestId: data.requestId || null,
        state,
      };
      try {
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage(response);
        } else {
          const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
          clients.forEach((client) => client.postMessage(response));
        }
      } catch (error) {
        console.warn('Failed to respond to state request', error);
      }
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'runlog-route-sync') {
    event.waitUntil(processSyncQueue());
  }
});

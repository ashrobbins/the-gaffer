/* The Gaffer's service worker. (Cache lookups ignore the Vary header: module scripts send an Origin header that the stored copies did not.)
    The build fills in PRECACHE and VERSION, so everything the game needs is stored on the
   first visit and the game then runs with no connection. Saves live in IndexedDB and never go near the network. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `gaffer-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gaffer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Pages: try the network so a new version is picked up, and fall back to the stored copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(new URL('./', self.registration.scope).href, copy));
          return response;
        })
        .catch(() => caches.match(new URL('./', self.registration.scope).href, { ignoreVary: true }).then((hit) => hit ?? caches.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true }))),
    );
    return;
  }

  // Everything else is a built file with a fingerprint in its name or an icon: the stored copy is always right.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

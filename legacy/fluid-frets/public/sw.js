/*
 * Fluid Frets service worker: makes the app work offline after the first visit.
 *  - Pages (navigations): network first, falling back to the last cached copy.
 *  - Everything else from this site: cache first. Built files have hashed names, so a cached one is
 *    never stale; a new release simply asks for new names.
 * Requests to other origins are never touched. Bump CACHE to drop everything cached so far.
 */
const CACHE = 'fluid-frets-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const remember = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(remember)
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then(remember)),
  );
});

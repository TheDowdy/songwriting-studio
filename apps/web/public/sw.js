/*
 * Songwriting Studio service worker: makes the app work offline after the first visit.
 *  - Install: precaches the app shell eagerly — index.html and the built JS/CSS it references —
 *    so the very first visit is already offline-capable, not just visits after something else
 *    happened to fetch them (PLAN.md §7 Phase 9).
 *  - Everything else (the guitar samples included) is a runtime cache, filled lazily the first
 *    time each is actually requested: pages (navigations) go network-first, falling back to the
 *    last cached copy; everything else is cache-first. Built files have hashed names, so a cached
 *    one is never stale; a new release simply asks for new names.
 * Requests to other origins are never touched. Bump CACHE to drop everything cached so far.
 */
const CACHE = 'songwriting-studio-v1';
const SHELL_URL = './';

/** Fetches `SHELL_URL` and every same-origin script/stylesheet it references (Vite's hashed
 *  build output, thanks to `base: './'` in vite.config.ts), so they're all cached before install
 *  finishes — not just the shell page itself. A file that fails to fetch is skipped rather than
 *  failing the whole install; the runtime cache below still picks it up on first real use. */
async function precacheShell(cache) {
  const shellResponse = await fetch(SHELL_URL);
  if (!shellResponse.ok) return;
  const html = await shellResponse.clone().text();
  await cache.put(SHELL_URL, shellResponse);
  const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  await Promise.all(
    refs.map((url) =>
      fetch(url)
        .then((r) => (r.ok ? cache.put(url, r) : null))
        .catch(() => {
          // Offline or a flaky first load: the runtime cache-first handler below still catches
          // this file the first time it's actually requested.
        }),
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(precacheShell).then(() => self.skipWaiting()));
});

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
        .catch(() => caches.match(request).then((hit) => hit || caches.match(SHELL_URL))),
    );
    return;
  }
  // Runtime cache, lazy: a guitar sample (or anything else) not precached above is fetched once
  // here and kept from then on.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then(remember)));
});

const CACHE_NAME = 'kh-shell-v2';

// The worker's scope is the app's base ("/" or e.g. "/v1/"), so every
// app-relative path below is built from it rather than hardcoded to "/".
const BASE = new URL(self.registration.scope).pathname;

// A service worker doesn't control the page that triggered its own
// install/activate — that page's initial navigation request already
// completed before the worker existed, so it's never seen by the fetch
// handler below. Without this, the shell would only get cached starting
// from the user's *second* visit. Precaching '/' here explicitly closes
// that gap so offline works from the first visit onward.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(BASE).then((res) => (res.ok ? cache.put(BASE, res) : null)).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE) || url.pathname.startsWith(`${BASE}api/`) || url.pathname.startsWith(`${BASE}uploads/`)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(BASE, res.clone()));
          return res;
        })
        .catch(() => caches.match(BASE).then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Vite's build output (/assets/*.js, *.css, and any imported image) is
  // content-hashed — a given URL's bytes never change once built — so
  // cache-first is safe and avoids a network round-trip on every load.
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else static (icon.png, manifest.json, ...) is served from a
  // fixed, non-hashed URL that *can* change content on a later deploy, so
  // prefer the network and only fall back to the cache when offline —
  // cache-first here previously meant a changed favicon never reached
  // browsers with an already-installed service worker.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

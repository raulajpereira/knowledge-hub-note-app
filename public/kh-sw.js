/* KnowledgeHub service worker.
   1. Web Push: shows the bell's notifications on this device and, on a click,
      focuses an open window of the app on the item (or opens one).
   2. Offline (reading): the app's pages and the data of Notas / Tarefas are
      always fetched from the network first; a copy is kept on this device and
      shown when there is no connection. The app's own build files are kept
      too. Nothing is cached for other sites, and "Terminar sessão" clears it
      all (message 'kh-clear'). Edits made offline are queued by the page
      (src/lib/client/offline.ts), not here.
   Registered by the app shell (src/lib/client/offline.ts) and by
   Definições › Notificações › "Neste dispositivo" (src/lib/client/push.ts). */
const V = 'v1';
const STATIC = `kh-static-${V}`;
const PAGES = `kh-pages-${V}`;
const DATA = `kh-data-${V}`;
const base = () => new URL(self.registration.scope).pathname.replace(/\/$/, '');
// the data kept for reading offline (GET only, this app's API)
const DATA_RE =
  /\/api\/v1\/(notes(\/[0-9a-f-]{36})?|notes\/daily|folders|tasks(\/[0-9a-f-]{36})?|me\/counts|views|home|links)(\?|$)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES, DATA]);
      for (const k of await caches.keys()) if (k.startsWith('kh-') && !keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('message', (e) => {
  if (e.data === 'kh-clear')
    e.waitUntil(
      (async () => {
        for (const k of await caches.keys()) if (k.startsWith('kh-')) await caches.delete(k);
      })(),
    );
});

/** a page load's headers, saying it is one (Sec-Fetch-Dest can't be set from here) */
function navHeaders(req) {
  const h = new Headers(req.headers);
  h.set('x-kh-nav', '1');
  return h;
}

/** network first; a good answer is copied to `cache`; offline, the copy (marked) */
async function networkFirst(req, cache, key) {
  try {
    // a page load is fetched again (with x-kh-nav: Sec-Fetch-Dest can't be set
    // from here); a redirect is handed back as it came and the browser follows
    // it (to /login, to the chosen start page… even on another host name)
    const res = await fetch(
      req.mode === 'navigate'
        ? new Request(req.url, { credentials: 'include', redirect: 'manual', headers: navHeaders(req) })
        : req,
    );
    if (res.type === 'opaqueredirect' || res.redirected) return res;
    if (res.ok && res.type === 'basic') {
      const c = await caches.open(cache);
      await c.put(key || req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await caches.match(key || req, { cacheName: cache });
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('x-kh-offline', '1');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
    }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const b = base();
  // the build's files never change under the same name: the copy first
  if (url.pathname.startsWith(`${b}/_next/static/`)) {
    e.respondWith(
      caches.match(req, { cacheName: STATIC }).then(
        (hit) =>
          hit ||
          fetch(req).then(async (res) => {
            if (res.ok) await (await caches.open(STATIC)).put(req, res.clone());
            return res;
          }),
      ),
    );
    return;
  }
  // the app's pages (a full load, or a client navigation's RSC payload)
  if (url.pathname === `${b}/app` || url.pathname.startsWith(`${b}/app/`)) {
    // prefetches are partial payloads: never kept (nor served) as a page
    if (req.headers.get('Next-Router-Prefetch')) return;
    const rsc = req.headers.get('RSC') === '1';
    if (req.mode === 'navigate' || rsc) {
      // one copy per page and kind (the ?query of a page doesn't change its HTML much)
      const key = new Request(`${url.origin}${url.pathname}${rsc ? '?__rsc' : ''}`);
      e.respondWith(
        networkFirst(req, PAGES, key).catch(async () => {
          // never seen offline: the Início (if kept), else the browser's error
          const home = await caches.match(new Request(`${url.origin}${b}/app`), { cacheName: PAGES });
          return home || Response.error();
        }),
      );
    }
    return;
  }
  if (DATA_RE.test(url.pathname + url.search)) e.respondWith(networkFirst(req, DATA));
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const base = new URL(self.registration.scope).pathname.replace(/\/$/, '');
  e.waitUntil(
    self.registration.showNotification(d.title || 'KnowledgeHub', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: `${base}/apple-icon.png`,
      data: { url: d.url || `${base}/app` },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  // only addresses of this app
  if (url.origin !== self.location.origin) return;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === url.origin && 'focus' in w) {
          await w.focus();
          if ('navigate' in w) return w.navigate(url.href);
          return;
        }
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});

/* KnowledgeHub service worker: Web Push only (no caching, no offline). It
   shows the bell's notifications on this device and, on a click, focuses an
   open window of the app on the item (or opens one). Registered by
   Definições › Notificações › "Neste dispositivo" (src/lib/client/push.ts). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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

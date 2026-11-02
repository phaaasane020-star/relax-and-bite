// Relax&Bite notifications for vendors, riders and admins (browsers).
// Only shows notifications; it doesn't cache pages or work offline.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = { title: 'Relax&Bite', body: '', url: '/', tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch (e) {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: msg.tag,
      renotify: Boolean(msg.tag),
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: msg.url },
    }),
  );
});

// Tapping it opens the panel (or brings an open one to the front)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

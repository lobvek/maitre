// Service worker de Maitre: recibe las notificaciones del personal y abre la pantalla de sala.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Maitre', body: 'Aviso de una mesa', url: '/sala', tag: 'maitre' };
  try { data = { ...data, ...event.data.json() }; } catch { /* texto plano */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, renotify: true, icon: '/assets/icon-192.png', badge: '/assets/icon-192.png',
    vibrate: [200, 100, 200, 100, 400], data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/sala';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes(url));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});

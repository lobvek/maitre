// Service worker de Maitre: recibe las notificaciones del personal y abre la pantalla de sala.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Pantalla de espera propia.
// Cuando el servidor está arrancando (o no hay red), el navegador enseñaría la página
// del proveedor de hosting. Desde la app instalada eso da la sensación de que Maitre se
// ha roto. Preferimos decir la verdad con nuestra cara: está arrancando, espera.
const ESPERA = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Maitre</title>
<style>body{margin:0;height:100dvh;display:grid;place-items:center;background:#F8F1E1;color:#5A351D;
font:500 16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
.p{width:38px;height:38px;border:3px solid #D6DCB9;border-top-color:#646B41;border-radius:50%;
margin:0 auto 18px;animation:g 1s linear infinite}@keyframes g{to{transform:rotate(360deg)}}
h1{font-size:19px;margin:0 0 6px}p{margin:0;color:#847F70;font-size:14px;max-width:300px}
button{margin-top:22px;padding:12px 22px;min-height:44px;border:0;border-radius:999px;
background:#646B41;color:#fff;font:600 15px system-ui;cursor:pointer}</style></head><body>
<div><div class="p"></div><h1>Maitre está arrancando</h1>
<p>Tarda unos segundos si hacía rato que nadie entraba. No pierdes nada: vuelve a intentarlo.</p>
<button onclick="location.reload()">Reintentar</button></div>
<script>setTimeout(()=>location.reload(),6000)</script></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.status >= 500) throw new Error('arrancando');
      return res;
    } catch {
      return new Response(ESPERA, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});

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

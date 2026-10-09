// Service worker de Maitre: recibe las notificaciones del personal y abre la pantalla de sala.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Pantalla de espera propia.
// Cuando el servidor está arrancando (o no hay red), el navegador enseñaría la página
// del proveedor de hosting. Desde la app instalada eso da la sensación de que Maitre se
// ha roto. Preferimos decir la verdad con nuestra cara: está arrancando, espera.
const ESPERA = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Maitre</title>
<style>
 /* Las fuentes propias si el navegador aún las tiene guardadas (se cachean una semana);
    si no, la del sistema. Nunca bloquean: esta pantalla tiene que salir ya. */
 @font-face{font-family:Fraunces;src:url(/assets/fonts/fraunces-latin-600.woff2) format('woff2');font-weight:600;font-display:swap}
 @font-face{font-family:Figtree;src:url(/assets/fonts/figtree-latin-500.woff2) format('woff2');font-weight:500;font-display:swap}
 :root{--g900:#2C3021;--ink3:#847F70;--coffee:#5A351D;--cream:#F8F1E1;--line:#E3DCCA;--brand:#646B41}
 body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--cream);color:var(--g900);
  font:500 16px/1.5 Figtree,system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
 svg{width:168px;height:auto}
 h1{font-family:Fraunces,Georgia,serif;font-size:21px;font-weight:600;letter-spacing:-.02em;margin:16px 0 6px}
 p{margin:0;color:var(--ink3);font-size:14px;max-width:290px;margin-inline:auto}
 button{margin-top:24px;padding:12px 24px;min-height:44px;border:0;border-radius:999px;
  background:var(--brand);color:#fff;font:600 15px Figtree,system-ui;cursor:pointer}
 .moka-pot{animation:tilt 2.4s cubic-bezier(.25,.46,.45,.94) infinite;transform-origin:50px 60px}
 @keyframes tilt{0%,100%{transform:rotate(26deg)}45%{transform:rotate(33deg)}}
 .moka-fill{animation:fill 2.4s cubic-bezier(.25,.46,.45,.94) infinite}
 @keyframes fill{0%,10%{width:0}80%,100%{width:84px}}
 .moka-stream{animation:stream 2.4s linear infinite}
 @keyframes stream{0%,8%{opacity:0}14%,76%{opacity:1}84%,100%{opacity:0}}
 .moka-steam{animation:steam 2.4s cubic-bezier(.25,.46,.45,.94) infinite;transform-origin:35px 12px}
 @keyframes steam{0%,100%{opacity:0;transform:translateY(2px)}40%{opacity:.55;transform:translateY(-3px)}}
 @media (prefers-reduced-motion:reduce){*{animation:none!important}.moka-fill{width:84px}}
</style></head><body><div>
<svg viewBox="0 0 168 142" role="img" aria-label="Cargando">
 <g class="moka-steam" stroke="#847F70" stroke-width="2.4" stroke-linecap="round" fill="none">
  <path d="M30 16c2.5-3 2.5-6 0-9"/><path d="M40 12c2.5-3 2.5-6 0-9"/></g>
 <g class="moka-pot" fill="none" stroke="#2C3021" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
  <path d="M30 32c-12 4-17 8-17 14s5 10 17 15"/>
  <path d="M70 26l12 6-12 6z" fill="#2C3021"/>
  <path d="M35 92h30l5-32H30z" fill="#CFCAC0"/>
  <path d="M30 56h42" stroke-width="4"/>
  <path d="M36 22h28l6 34H30z" fill="#EFEDE6"/>
  <path d="M41 22l1-7h16l1 7z" fill="#2C3021"/>
  <circle cx="50" cy="11" r="4.5" fill="#2C3021"/></g>
 <path class="moka-stream" d="M91 52c-2 9 2 15 0 22v34" stroke="#5A351D" stroke-width="5" stroke-linecap="round" fill="none"/>
 <rect x="36" y="112" width="112" height="15" rx="7.5" fill="#fff" stroke="#E3DCCA" stroke-width="1.8"/>
 <clipPath id="c"><rect x="36" y="112" width="112" height="15" rx="7.5"/></clipPath>
 <rect class="moka-fill" x="36" y="112" height="15" width="0" fill="#5A351D" clip-path="url(#c)"/>
</svg>
<h1>Poniendo la cafetera</h1>
<p>Maitre está arrancando. Tarda unos segundos si hacía rato que nadie entraba.</p>
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

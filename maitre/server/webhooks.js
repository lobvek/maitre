// Salida hacia el TPV del local (o hacia un middleware tipo Make/Zapier).
// Cada evento se manda firmado con HMAC-SHA256 para que el receptor pueda verificar
// que viene de Maitre. Es la vía de integración de la fase 1: mientras no exista
// conector nativo con cada TPV, cualquiera puede consumir estos eventos.
import { createHmac } from 'node:crypto';

const TIMEOUT_MS = 4000;

export function sign(secret, body) {
  return createHmac('sha256', String(secret || '')).update(body).digest('hex');
}

/** Envía el evento sin bloquear la respuesta al cliente. Los fallos solo se registran. */
export function notify(venue, event, data) {
  if (!venue?.webhook_url) return false;
  const body = JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    venue: { id: venue.id, slug: venue.slug, name: venue.name },
    data,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  fetch(venue.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Maitre-Event': event,
      'X-Maitre-Signature': `sha256=${sign(venue.webhook_secret, body)}`,
    },
    body,
    signal: controller.signal,
  })
    .then((res) => { if (!res.ok) console.error(`[maitre] webhook ${event} → ${res.status}`); })
    .catch((err) => console.error(`[maitre] webhook ${event} falló: ${err.message}`))
    .finally(() => clearTimeout(timer));
  return true;
}

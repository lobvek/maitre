// Avisos al personal fuera de la pantalla de sala: notificación en el móvil (Web Push) y Telegram.
// Un bar del plan Mesa sin tablet se entera igual de que la mesa 7 llama al camarero.
import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { all, run, insert, get, DATA_DIR } from './db.js';

// --- Web Push ------------------------------------------------------------------
let vapid;
export function vapidKeys() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const file = resolve(DATA_DIR, 'vapid.json');
    if (existsSync(file)) vapid = JSON.parse(readFileSync(file, 'utf8'));
    else { vapid = webpush.generateVAPIDKeys(); try { writeFileSync(file, JSON.stringify(vapid)); } catch { /* memoria */ } }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hola@maitre.app', vapid.publicKey, vapid.privateKey);
  return vapid;
}

export function subscribe(venueId, userId, subscription, userAgent = '') {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh) throw new Error('Suscripción no válida.');
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', subscription.endpoint);
  return insert('push_subscriptions', {
    venue_id: venueId, user_id: userId, endpoint: subscription.endpoint,
    keys: JSON.stringify(subscription.keys), user_agent: String(userAgent).slice(0, 200),
  });
}

export const unsubscribe = (endpoint) => run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
export const subscriptionCount = (venueId) => get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE venue_id = ?', venueId).n;

async function sendPush(venueId, payload) {
  vapidKeys();
  const subs = all('SELECT * FROM push_subscriptions WHERE venue_id = ?', venueId);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 120 });
      sent++;
    } catch (err) {
      // 404/410: el móvil se dio de baja o desinstaló; se limpia y punto.
      if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subscriptions WHERE id = ?', s.id);
      else console.error('[maitre] push', err.statusCode || err.message);
    }
  }));
  return sent;
}

// --- Telegram ------------------------------------------------------------------
export const telegramReady = () => !!process.env.MAITRE_TELEGRAM_BOT_TOKEN;

export async function sendTelegram(chatId, text) {
  if (!telegramReady() || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${process.env.MAITRE_TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) console.error('[maitre] telegram', res.status, (await res.text()).slice(0, 120));
  return res.ok;
}

// --- Entrada única ---------------------------------------------------------------
/** Avisa al personal del local por todos los canales que tenga configurados. No bloquea. */
export function notifyStaff(venue, { title, body, url = '/sala', tag = 'maitre' }) {
  const jobs = [sendPush(venue.id, { title, body, url, tag })];
  if (venue.telegram_chat_id) jobs.push(sendTelegram(venue.telegram_chat_id, `<b>${title}</b>\n${body}`));
  Promise.allSettled(jobs).catch(() => {});
}

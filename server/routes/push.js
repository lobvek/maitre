// Notificaciones en el móvil del personal (Web Push). Sin app: se activa desde la pantalla de sala.
import { Router } from 'express';
import { requireAuth, requireVenue } from '../auth.js';
import { vapidKeys, subscribe, unsubscribe, subscriptionCount, notifyStaff, sendTelegram, telegramReady } from '../notify.js';
import { bad, ok } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireVenue);

router.get('/key', (req, res) => res.json({
  key: vapidKeys().publicKey,
  subscriptions: subscriptionCount(req.venue.id),
  telegram: telegramReady(),
}));

router.post('/subscribe', (req, res) => {
  try {
    subscribe(req.venue.id, req.user.id, req.body.subscription, req.headers['user-agent']);
    res.json({ ok: true, subscriptions: subscriptionCount(req.venue.id) });
  } catch (err) { bad(res, err.message); }
});

router.post('/unsubscribe', (req, res) => {
  if (req.body.endpoint) unsubscribe(String(req.body.endpoint));
  ok(res);
});

/** Manda un aviso de prueba a todos los canales del local. */
router.post('/test', (req, res) => {
  notifyStaff(req.venue, { title: `${req.venue.name} · prueba`, body: 'Así llegará el aviso cuando una mesa llame o pida.', tag: 'test' });
  ok(res);
});

router.post('/telegram-test', async (req, res) => {
  if (!telegramReady()) return bad(res, 'Maitre aún no tiene configurado el bot de Telegram (MAITRE_TELEGRAM_BOT_TOKEN).', 409);
  const chat = String(req.body.chat_id || req.venue.telegram_chat_id || '').trim();
  if (!chat) return bad(res, 'Falta el identificador del chat.');
  const sent = await sendTelegram(chat, `<b>${req.venue.name}</b>\nMaitre conectado. Aquí llegarán los avisos de las mesas.`);
  if (!sent) return bad(res, 'Telegram no ha aceptado el mensaje. Comprueba el identificador y que el bot esté en el grupo.', 502);
  ok(res);
});

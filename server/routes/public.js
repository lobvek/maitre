// API pública del comensal. Sin registro, sin cookies de seguimiento: solo un id de sesión
// anónimo generado en el móvil para poder enseñarle el estado de SU pedido (punto 3.8: datos mínimos).
import { Router } from 'express';
import { all, get, insert, run } from '../db.js';
import { hasFeature, effectivePlan } from '../plans.js';
import { subscribe, tableChannel, venueChannel, publish } from '../realtime.js';
import { createOrder, hydrateOrder, tableBill, settlePayment } from '../orders-core.js';
import { canChargeOnline, resolveMode, createCheckout, isSandbox } from '../payments.js';
import { notifyStaff } from '../notify.js';
import { qrPng } from '../qr.js';
import { bad, ok, i18n, parseJson, nowSql, uuid, ALLERGENS, TAGS } from '../utils.js';

export const router = Router();

/** Resuelve local + mesa. tableToken 'preview' = carta de escaparate, sin pedidos. */
function resolve(req, res, next) {
  const venue = get('SELECT * FROM venues WHERE slug = ?', String(req.params.slug || '').toLowerCase());
  if (!venue) return res.status(404).json({ error: 'not_found', message: 'Este local no existe o ha cambiado de dirección.' });
  if (venue.status === 'suspended') return res.status(423).json({ error: 'suspended', message: 'Carta no disponible temporalmente.' });
  req.pubVenue = venue;
  const tok = req.params.token;
  if (tok && tok !== 'preview') {
    const table = get('SELECT * FROM tables WHERE token = ? AND venue_id = ?', tok, venue.id);
    if (!table) return res.status(404).json({ error: 'table_not_found', message: 'Este QR ya no es válido. Avisa al personal.' });
    if (!table.active) return res.status(410).json({ error: 'table_inactive', message: 'Mesa fuera de servicio.' });
    req.pubTable = table;
  }
  next();
}

/**
 * Quién puede pedir desde este QR. Un QR grabado en madera es estático: si alguien le hace
 * una foto podría pedir desde su casa. Cada local elige cómo se protege:
 *  - open     cualquiera con el QR (el más cómodo, el menos protegido)
 *  - occupied solo si el personal ha marcado la mesa como ocupada al sentar a los clientes
 *  - code     hay que teclear el código del turno, que el personal ve en la pantalla de sala
 *
 * Y, por encima de todas, el horario: fuera de las horas de servicio no se pide. No cuesta
 * nada al personal y se lleva por delante el caso de quien guardó la foto del QR y prueba
 * a pedir desde el sofá un martes a las tres de la mañana.
 */
export function fueraDeHorario(venue, ahora = new Date()) {
  const desde = (venue.order_from || '').trim();
  const hasta = (venue.order_to || '').trim();
  if (!/^\d{2}:\d{2}$/.test(desde) || !/^\d{2}:\d{2}$/.test(hasta) || desde === hasta) return false;
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const n = ahora.getHours() * 60 + ahora.getMinutes();
  const a = min(desde); const b = min(hasta);
  // Si cierra antes de abrir, el turno cruza la medianoche (20:00 → 02:00).
  return a < b ? (n < a || n >= b) : (n < a && n >= b);
}

function checkGate(venue, table, body) {
  const gate = venue.order_gate || 'open';
  if (fueraDeHorario(venue)) {
    return { error: `Ahora mismo no se pueden hacer pedidos. El servicio es de ${venue.order_from} a ${venue.order_to}.`, code: 'closed_now' };
  }
  if (gate === 'occupied' && table.status !== 'occupied') {
    return { error: 'Esta mesa aún no está abierta. Avisa al personal y te la abren en un segundo.', code: 'table_closed' };
  }
  if (gate === 'code') {
    const given = String(body?.code || '').trim().toUpperCase();
    if (!venue.order_code) return null;               // el local aún no ha generado código
    if (given !== venue.order_code.toUpperCase()) {
      return { error: 'Pide al personal el código de la mesa para poder pedir.', code: 'code_required' };
    }
  }
  return null;
}

// Freno sencillo contra el pedido repetido o automatizado desde una misma mesa o móvil.
const recent = new Map();
function throttle(key, ms) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 600000) recent.delete(k);
  if (recent.has(key) && now - recent.get(key) < ms) return true;
  recent.set(key, now);
  return false;
}

const minutes = (hhmm) => {
  if (!hhmm || !String(hhmm).includes(':')) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/** ¿La categoría se muestra ahora? (horarios tipo desayunos 08:00-12:00) */
function categoryVisible(cat, now = new Date()) {
  const days = parseJson(cat.days, [0, 1, 2, 3, 4, 5, 6]);
  if (Array.isArray(days) && days.length && !days.includes(now.getDay())) return false;
  const from = minutes(cat.available_from), to = minutes(cat.available_to);
  if (from == null || to == null) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  return from <= to ? cur >= from && cur <= to : cur >= from || cur <= to;
}

/** QR de la carta de escaparate de un local. Público: apunta a una página ya pública. */
router.get('/:slug/qr.png', resolve, async (req, res) => {
  const url = `${process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`}/m/${req.pubVenue.slug}`;
  const png = await qrPng(url, { size: Math.min(Math.max(parseInt(req.query.size, 10) || 320, 120), 1200) });
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(png);
});

/** GET /api/public/:slug/:token — todo lo que necesita la carta móvil en una sola llamada. */
router.get('/:slug/:token', resolve, (req, res) => {
  const venue = req.pubVenue;
  const lang = ['es', 'ca', 'en', 'fr', 'de'].includes(req.query.lang) ? req.query.lang : venue.locale;
  const plan = effectivePlan(venue);
  const toggles = parseJson(venue.features, {});
  const showAll = req.query.all === '1';

  const categories = all('SELECT * FROM categories WHERE venue_id = ? AND active = 1 ORDER BY sort, id', venue.id)
    .filter((c) => showAll || categoryVisible(c))
    .map((c) => ({ id: c.id, name: i18n(c.name, lang), description: i18n(c.description, lang) }));

  const items = all(
    `SELECT * FROM items WHERE venue_id = ? AND active = 1 AND (category_id IS NULL OR category_id IN
     (SELECT id FROM categories WHERE venue_id = ? AND active = 1)) ORDER BY sort, id`, venue.id, venue.id)
    .filter((i) => categories.some((c) => c.id === i.category_id) || !i.category_id)
    .map((i) => ({
      id: i.id,
      category_id: i.category_id,
      name: i18n(i.name, lang),
      description: i18n(i.description, lang),
      price_cents: i.price_cents,
      image_path: i.image_path,
      allergens: parseJson(i.allergens, []),
      tags: parseJson(i.tags, []),
      kcal: i.kcal,
      suggests: hasFeature(venue, 'upsell') ? parseJson(i.suggests, []) : [],
      available: !!i.available,
      option_groups: all('SELECT * FROM option_groups WHERE item_id = ? ORDER BY sort, id', i.id).map((g) => ({
        id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select,
        options: all('SELECT id, name, price_delta_cents, available FROM options WHERE group_id = ? ORDER BY sort, id', g.id),
      })),
    }));

  res.json({
    venue: {
      slug: venue.slug, name: venue.name, logo_path: venue.logo_path, brand_color: venue.brand_color,
      currency: venue.currency, locale: venue.locale, languages: parseJson(venue.languages, ['es']),
      wifi_ssid: venue.wifi_ssid, wifi_password: venue.wifi_password, service_note: venue.service_note,
      city: venue.city, address: venue.address,
    },
    table: req.pubTable ? { id: req.pubTable.id, name: req.pubTable.name, token: req.pubTable.token } : null,
    preview: !req.pubTable,
    categories,
    items,
    catalog: { allergens: ALLERGENS, tags: TAGS },
    can_order: !!req.pubTable && hasFeature(venue, 'orders') && toggles.orders !== false && !fueraDeHorario(venue),
    gate: {
      mode: venue.order_gate || 'open',
      closed_now: fueraDeHorario(venue),
      hours: venue.order_from && venue.order_to ? `${venue.order_from}–${venue.order_to}` : '',
      needs_code: (venue.order_gate === 'code') && !!venue.order_code,
      table_open: req.pubTable ? req.pubTable.status === 'occupied' : false,
    },
    payment: {
      online: canChargeOnline(venue),
      required: venue.payment_mode === 'online_required' && canChargeOnline(venue),
      sandbox: isSandbox(),
    },
    can_call: !!req.pubTable && hasFeature(venue, 'calls') && toggles.calls !== false,
    ask_guest_name: !!toggles.guest_name,
    can_review: hasFeature(venue, 'reviews') && toggles.reviews !== false,
    allow_notes: toggles.notes !== false,
    plan: plan.id,
    lang,
  });
});

/** Registra el escaneo (embudo del panel de analítica). */
router.post('/:slug/:token/scan', resolve, (req, res) => {
  if (!req.pubTable) return res.json({ session_id: req.body?.session_id || uuid() });
  const sessionId = String(req.body?.session_id || '').slice(0, 40) || uuid();
  insert('scans', {
    venue_id: req.pubVenue.id, table_id: req.pubTable.id, session_id: sessionId,
    source: req.body?.source === 'nfc' ? 'nfc' : 'qr',
  });
  res.json({ session_id: sessionId });
});

/** Pedido desde la mesa. */
router.post('/:slug/:token/order', resolve, (req, res) => {
  const venue = req.pubVenue;
  if (!req.pubTable) return bad(res, 'Escanea el QR de tu mesa para poder pedir.', 403);
  const toggles = parseJson(venue.features, {});
  if (!hasFeature(venue, 'orders') || toggles.orders === false) {
    return bad(res, 'Este local no acepta pedidos desde la mesa. Avisa al personal.', 403);
  }
  const bloqueo = checkGate(venue, req.pubTable, req.body);
  if (bloqueo) return res.status(403).json({ error: bloqueo.code, message: bloqueo.error });

  // Nunca por IP: en el wifi del local todos los comensales comparten la misma IP pública.
  const sessionKey = req.body?.session_id ? `s:${req.body.session_id}` : `t:${req.pubTable.id}`;
  if (throttle(sessionKey, 10000)) {
    return bad(res, 'Acabas de enviar un pedido. Espera unos segundos antes del siguiente.', 429);
  }
  const sinAceptar = get(
    `SELECT COUNT(*) AS n FROM orders WHERE table_id = ? AND status = 'new'`, req.pubTable.id).n;
  if (sinAceptar >= 6) {
    return bad(res, 'Esta mesa tiene varios pedidos sin atender. Avisa al personal.', 429);
  }

  const mode = resolveMode(venue, req.body?.payment_mode);
  const out = createOrder(venue, {
    tableId: req.pubTable.id,
    lines: req.body?.lines,
    guestName: req.body?.guest_name || '',
    note: req.body?.note || '',
    sessionId: String(req.body?.session_id || '').slice(0, 40),
    channel: 'qr',
    lang: req.query.lang || venue.locale,
    pay: mode === 'online',
  });
  if (out.error) return bad(res, out.error);
  res.status(201).json({
    ...out.order,
    payment_mode: mode,
    checkout: mode === 'online' ? createCheckout(venue, out.order, req.pubTable.token) : null,
  });
});

/**
 * Resultado del cobro. Con el proveedor de pruebas lo confirma la propia pantalla de
 * simulación; con una pasarela real este endpoint se sustituye por su webhook firmado.
 */
router.post('/:slug/:token/pay', resolve, (req, res) => {
  if (!isSandbox()) return bad(res, 'El resultado del pago lo confirma la pasarela.', 409);
  if (!req.pubTable) return bad(res, 'Escanea el QR de tu mesa.', 403);
  const orderId = Number(req.body?.order_id);
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ? AND table_id = ?',
    orderId, req.pubVenue.id, req.pubTable.id);
  if (!order) return bad(res, 'Pedido no encontrado.', 404);
  // Solo quien hizo el pedido desde ese móvil puede cerrar su cobro.
  if (order.session_id && order.session_id !== String(req.body?.session_id || '')) {
    return bad(res, 'Este pedido pertenece a otra sesión.', 403);
  }
  const out = settlePayment(req.pubVenue, order.id, {
    ok: req.body?.result !== 'ko',
    ref: req.body?.reference || '',
  });
  if (out.error) return bad(res, out.error, out.code || 400);
  res.json({ ...out.order, failed: !!out.failed });
});

/** Reseña tras el servicio + opt-in (fase 1 del estudio: fidelización ligera, después del consumo). */
router.post('/:slug/:token/review', resolve, (req, res) => {
  const venue = req.pubVenue;
  if (!req.pubTable) return bad(res, 'Escanea el QR de tu mesa.', 403);
  const toggles = parseJson(venue.features, {});
  if (!hasFeature(venue, 'reviews') || toggles.reviews === false) return bad(res, 'Las reseñas no están activadas.', 403);
  const rating = Math.round(Number(req.body?.rating));
  if (!(rating >= 1 && rating <= 5)) return bad(res, 'La valoración va de 1 a 5.');
  const sessionId = String(req.body?.session_id || '').slice(0, 40);
  if (sessionId && get('SELECT id FROM reviews WHERE table_id = ? AND session_id = ?', req.pubTable.id, sessionId)) {
    return bad(res, 'Ya nos has valorado. ¡Gracias!', 409);
  }
  const optin = !!req.body?.optin;
  const email = optin ? String(req.body?.email || '').trim().toLowerCase().slice(0, 120) : '';
  if (optin && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Escribe un email válido para recibir las novedades.');
  const orderId = Number(req.body?.order_id) || null;
  if (orderId && !get('SELECT id FROM orders WHERE id = ? AND venue_id = ?', orderId, venue.id)) return bad(res, 'Pedido no encontrado.', 404);
  const id = insert('reviews', {
    venue_id: venue.id, order_id: orderId, table_id: req.pubTable.id, session_id: sessionId,
    rating, comment: String(req.body?.comment || '').slice(0, 300), email, optin: optin ? 1 : 0,
  });
  publish(venueChannel(venue.id), 'review.created', { id, rating, table_name: req.pubTable.name });
  res.status(201).json({ ok: true, id });
});

/** Estado de un pedido concreto, para la pantalla de confirmación. */
router.get('/:slug/:token/order/:id', resolve, (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(req.params.id), req.pubVenue.id);
  if (!order) return bad(res, 'Pedido no encontrado.', 404);
  res.json(hydrateOrder(order));
});

/** Aviso al personal: camarero, cuenta, agua o ayuda. */
router.post('/:slug/:token/call', resolve, (req, res) => {
  const venue = req.pubVenue;
  if (!req.pubTable) return bad(res, 'Escanea el QR de tu mesa.', 403);
  const toggles = parseJson(venue.features, {});
  if (!hasFeature(venue, 'calls') || toggles.calls === false) return bad(res, 'El aviso al personal no está activado.', 403);
  const type = ['waiter', 'bill', 'water', 'help'].includes(req.body?.type) ? req.body.type : 'waiter';
  const recent = get(
    `SELECT id FROM calls WHERE table_id = ? AND type = ? AND status = 'open'`, req.pubTable.id, type);
  if (recent) return res.json({ ...get('SELECT * FROM calls WHERE id = ?', recent.id), duplicate: true });
  // Un aviso ya está en marcha: no hace falta abrir uno de otro tipo cada dos segundos.
  if (throttle(`c:${req.pubTable.id}`, 6000)) return bad(res, 'Ya hemos avisado. Llegan enseguida.', 429);
  const id = insert('calls', {
    venue_id: venue.id, table_id: req.pubTable.id, type,
    note: String(req.body?.note || '').slice(0, 140),
    session_id: String(req.body?.session_id || '').slice(0, 40),
  });
  const call = { ...get('SELECT * FROM calls WHERE id = ?', id), table_name: req.pubTable.name };
  publish(venueChannel(venue.id), 'call.created', call);
  const motivo = { waiter: 'llama al camarero', bill: 'pide la cuenta', water: 'pide agua', help: 'tiene una duda' }[type];
  notifyStaff(venue, { title: `Mesa ${req.pubTable.name} ${motivo}`, body: call.note || 'Aviso desde la carta', tag: `call-${req.pubTable.id}` });
  res.status(201).json(call);
});

/** Estado de los pedidos de esta sesión + cuenta de la mesa. */
router.get('/:slug/:token/orders', resolve, (req, res) => {
  if (!req.pubTable) return res.json({ orders: [], bill: null });
  const sessionId = String(req.query.session_id || '');
  const mine = sessionId
    ? all(`SELECT * FROM orders WHERE venue_id = ? AND table_id = ? AND session_id = ? ORDER BY id DESC LIMIT 20`,
      req.pubVenue.id, req.pubTable.id, sessionId).map(hydrateOrder)
    : [];
  const calls = sessionId
    ? all(`SELECT * FROM calls WHERE table_id = ? AND session_id = ? ORDER BY id DESC LIMIT 5`, req.pubTable.id, sessionId)
    : [];
  res.json({ orders: mine, calls, bill: tableBill(req.pubVenue, req.pubTable.id) });
});

/** Canal SSE de la mesa: el comensal ve cómo avanza su pedido. */
router.get('/:slug/:token/stream', resolve, (req, res) => {
  if (!req.pubTable) return bad(res, 'Sin mesa.', 400);
  subscribe(tableChannel(req.pubTable.token), res);
});

export { categoryVisible };

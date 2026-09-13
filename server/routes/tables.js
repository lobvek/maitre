// Zonas, mesas, tokens, QR y estado de sala. Incluye la hoja de cuñas de madera.
import { Router } from 'express';
import { all, get, insert, update, run, audit, tx, makeQrCode } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { effectivePlan, requireFeature } from '../plans.js';
import { qrPng, qrSvg, tableUrl } from '../qr.js';
import { publish, venueChannel } from '../realtime.js';
import { bad, ok, token, nowSql } from '../utils.js';

export const router = Router();

export function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

/**
 * Lo que se graba en la madera es /q/CÓDIGO, no la URL de la mesa: si cambia el dominio,
 * el token o hasta el local al que pertenece la pieza, no hay que regrabar nada.
 */
const qrUrl = (req, t) => `${baseUrl(req).replace(/\/$/, '')}/q/${t.qr_code}`;

router.use(requireAuth, requireVenue);

/** Estado completo de la sala: zonas, mesas, pedidos abiertos y avisos. */
router.get('/', (req, res) => {
  const zones = all('SELECT * FROM zones WHERE venue_id = ? ORDER BY sort, id', req.venue.id);
  const tables = all(`
    SELECT t.*, z.name AS zone_name,
      (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.status IN ('new','accepted','preparing','served')
        AND o.payment_status NOT IN ('pending','failed')) AS open_orders,
      (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.table_id = t.id
        AND o.status IN ('new','accepted','preparing','served') AND o.payment_status = 'unpaid') AS open_total_cents,
      (SELECT COUNT(*) FROM calls c WHERE c.table_id = t.id AND c.status = 'open') AS open_calls,
      (SELECT MAX(o.created_at) FROM orders o WHERE o.table_id = t.id) AS last_order_at,
      (SELECT GROUP_CONCAT(m.name) FROM tables m WHERE m.merged_into = t.id) AS merged_names,
      (SELECT p.name FROM tables p WHERE p.id = t.merged_into) AS merged_into_name
    FROM tables t LEFT JOIN zones z ON z.id = t.zone_id
    WHERE t.venue_id = ? ORDER BY t.sort, CAST(t.name AS INTEGER), t.name`, req.venue.id);
  res.json({
    zones,
    tables: tables.map((t) => ({ ...t, url: tableUrl(baseUrl(req), req.venue.slug, t.token), qr_url: qrUrl(req, t) })),
    limit: effectivePlan(req.venue).max_tables,
  });
});

router.post('/zones', requireRole('manager'), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return bad(res, 'La zona necesita un nombre.');
  const max = get('SELECT COALESCE(MAX(sort),0) AS m FROM zones WHERE venue_id = ?', req.venue.id).m;
  const id = insert('zones', { venue_id: req.venue.id, name, sort: max + 1 });
  res.status(201).json(get('SELECT * FROM zones WHERE id = ?', id));
});

router.patch('/zones/:id', requireRole('manager'), (req, res) => {
  const z = get('SELECT * FROM zones WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!z) return bad(res, 'Zona no encontrada.', 404);
  update('zones', z.id, { name: req.body.name !== undefined ? String(req.body.name) : undefined });
  res.json(get('SELECT * FROM zones WHERE id = ?', z.id));
});

router.delete('/zones/:id', requireRole('manager'), (req, res) => {
  const z = get('SELECT * FROM zones WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!z) return bad(res, 'Zona no encontrada.', 404);
  run('DELETE FROM zones WHERE id = ?', z.id);
  ok(res);
});

const countTables = (venueId) => get('SELECT COUNT(*) AS n FROM tables WHERE venue_id = ? AND active = 1', venueId).n;

router.post('/', requireRole('manager'), (req, res) => {
  const plan = effectivePlan(req.venue);
  const qty = Math.min(Math.max(parseInt(req.body.quantity, 10) || 1, 1), 50);
  if (countTables(req.venue.id) + qty > plan.max_tables) {
    return res.status(402).json({
      error: 'plan_limit',
      message: `Tu plan ${plan.name} admite ${plan.max_tables} mesas. Sube de plan para añadir más.`,
      limit: plan.max_tables,
    });
  }
  const created = tx(() => {
    const out = [];
    let start = parseInt(req.body.start_number, 10);
    if (!Number.isFinite(start)) {
      const nums = all('SELECT name FROM tables WHERE venue_id = ?', req.venue.id)
        .map((t) => parseInt(t.name, 10)).filter(Number.isFinite);
      start = (nums.length ? Math.max(...nums) : 0) + 1;
    }
    for (let i = 0; i < qty; i++) {
      const name = qty === 1 && req.body.name ? String(req.body.name).slice(0, 20) : String(start + i);
      const max = get('SELECT COALESCE(MAX(sort),0) AS m FROM tables WHERE venue_id = ?', req.venue.id).m;
      const id = insert('tables', {
        venue_id: req.venue.id,
        zone_id: req.body.zone_id ? Number(req.body.zone_id) : null,
        name, seats: Number(req.body.seats) || 2, token: token(6), sort: max + 1, qr_code: makeQrCode(),
      });
      out.push(get('SELECT * FROM tables WHERE id = ?', id));
    }
    return out;
  });
  audit(req.venue.id, req.user.id, 'tables.created', 'table', '', { qty });
  res.status(201).json(created.map((t) => ({ ...t, url: tableUrl(baseUrl(req), req.venue.slug, t.token) })));
});

const ownTable = (req) => get('SELECT * FROM tables WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);

router.patch('/:id', (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  const patch = {};
  // Cambiar de estado lo puede hacer cualquier rol (es operativa de sala); editar la mesa, no.
  if (req.body.status !== undefined) {
    if (!['free', 'occupied', 'reserved', 'cleaning'].includes(req.body.status)) return bad(res, 'Estado no válido.');
    patch.status = req.body.status;
    patch.status_changed_at = nowSql();
  }
  const structural = ['name', 'seats', 'zone_id', 'active', 'nfc_uid', 'sort']
    .some((k) => req.body[k] !== undefined);
  if (structural) {
    if (!['manager', 'owner', 'superadmin'].includes(req.user.role)) return bad(res, 'Tu rol no permite editar la mesa.', 403);
    if (req.body.name !== undefined) patch.name = String(req.body.name).slice(0, 20);
    if (req.body.seats !== undefined) patch.seats = Number(req.body.seats) || 2;
    if (req.body.zone_id !== undefined) patch.zone_id = req.body.zone_id ? Number(req.body.zone_id) : null;
    if (req.body.active !== undefined) patch.active = req.body.active ? 1 : 0;
    if (req.body.nfc_uid !== undefined) patch.nfc_uid = String(req.body.nfc_uid).slice(0, 40) || null;
    if (req.body.lot !== undefined) patch.lot = String(req.body.lot).slice(0, 30);
    if (req.body.sort !== undefined) patch.sort = Number(req.body.sort) || 0;
  }
  update('tables', t.id, patch);
  const fresh = get('SELECT * FROM tables WHERE id = ?', t.id);
  publish(venueChannel(req.venue.id), 'table.updated', fresh);
  res.json({ ...fresh, url: tableUrl(baseUrl(req), req.venue.slug, fresh.token) });
});

router.delete('/:id', requireRole('manager'), (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  run('DELETE FROM tables WHERE id = ?', t.id);
  audit(req.venue.id, req.user.id, 'tables.deleted', 'table', t.id);
  ok(res);
});

/** Regenera el token de la mesa: caducan los enlaces compartidos, la cuña grabada sigue valiendo. */
router.post('/:id/rotate', requireRole('manager'), (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  const fresh = token(6);
  update('tables', t.id, { token: fresh });
  audit(req.venue.id, req.user.id, 'tables.token_rotated', 'table', t.id);
  res.json({ token: fresh, url: tableUrl(baseUrl(req), req.venue.slug, fresh) });
});

router.get('/:id/qr.png', async (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  const png = await qrPng(qrUrl(req, t), {
    size: Math.min(Math.max(parseInt(req.query.size, 10) || 720, 120), 2000),
    dark: /^#[0-9a-f]{6}$/i.test(req.query.dark || '') ? req.query.dark : '#1a1a1a',
  });
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `inline; filename="qr-mesa-${t.name}.png"`);
  res.send(png);
});

router.get('/:id/qr.svg', async (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  res.set('Content-Type', 'image/svg+xml');
  res.send(await qrSvg(qrUrl(req, t)));
});

/** Datos para la hoja imprimible de cuñas (logo + nº de mesa + QR + "Reservado"). */
router.get('/print', async (req, res) => {
  const tables = all('SELECT * FROM tables WHERE venue_id = ? AND active = 1 ORDER BY sort, CAST(name AS INTEGER)', req.venue.id);
  const out = [];
  for (const t of tables) {
    const url = qrUrl(req, t);
    out.push({ id: t.id, name: t.name, url, qr_code: t.qr_code, lot: t.lot, svg: await qrSvg(url, { margin: 0 }) });
  }
  res.json({ venue: { name: req.venue.name, logo_path: req.venue.logo_path, brand_color: req.venue.brand_color }, tables: out });
});

/** Cambio de mesa: se lleva todo lo abierto a otra mesa (comensales que se mudan). */
router.post('/:id/move', (req, res) => {
  const from = ownTable(req);
  const to = get('SELECT * FROM tables WHERE id = ? AND venue_id = ?', Number(req.body.to), req.venue.id);
  if (!from || !to) return bad(res, 'Mesa no encontrada.', 404);
  if (from.id === to.id) return bad(res, 'Es la misma mesa.');
  const movidos = run(
    `UPDATE orders SET table_id = ? WHERE table_id = ? AND venue_id = ?
       AND status IN ('new','accepted','preparing','served')`, to.id, from.id, req.venue.id).changes;
  run(`UPDATE calls SET table_id = ? WHERE table_id = ? AND status = 'open'`, to.id, from.id);
  const now = nowSql();
  update('tables', to.id, { status: 'occupied', status_changed_at: now });
  update('tables', from.id, { status: 'cleaning', status_changed_at: now });
  audit(req.venue.id, req.user.id, 'tables.moved', 'table', from.id, { to: to.name, orders: Number(movidos) });
  publish(venueChannel(req.venue.id), 'tables.changed', { from: from.id, to: to.id });
  res.json({ ok: true, moved: Number(movidos), from: from.name, to: to.name });
});

/** Unir mesas: la cuenta de las hijas pasa a cobrarse en la principal. */
router.post('/:id/merge', (req, res) => {
  const child = ownTable(req);
  const parent = get('SELECT * FROM tables WHERE id = ? AND venue_id = ?', Number(req.body.into), req.venue.id);
  if (!child || !parent) return bad(res, 'Mesa no encontrada.', 404);
  if (child.id === parent.id) return bad(res, 'No puedes unir una mesa consigo misma.');
  if (parent.merged_into) return bad(res, `La mesa ${parent.name} ya está unida a otra. Únelas a la principal.`, 409);
  if (get('SELECT COUNT(*) AS n FROM tables WHERE merged_into = ?', child.id).n) {
    return bad(res, `La mesa ${child.name} ya tiene mesas unidas a ella.`, 409);
  }
  const now = nowSql();
  update('tables', child.id, { merged_into: parent.id, status: 'occupied', status_changed_at: now });
  update('tables', parent.id, { status: 'occupied', status_changed_at: now });
  audit(req.venue.id, req.user.id, 'tables.merged', 'table', child.id, { into: parent.name });
  publish(venueChannel(req.venue.id), 'tables.changed', { merged: child.id, into: parent.id });
  res.json({ ok: true, table: child.name, into: parent.name });
});

router.post('/:id/unmerge', (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  run('UPDATE tables SET merged_into = NULL WHERE id = ? OR merged_into = ?', t.id, t.id);
  audit(req.venue.id, req.user.id, 'tables.unmerged', 'table', t.id);
  publish(venueChannel(req.venue.id), 'tables.changed', { unmerged: t.id });
  res.json({ ok: true });
});

/** Vincula un UID de NFC a la mesa (fase 2 del plan: limpieza/reposición por NFC). */
router.post('/:id/nfc', requireRole('manager'), requireFeature('tables'), (req, res) => {
  const t = ownTable(req);
  if (!t) return bad(res, 'Mesa no encontrada.', 404);
  const uid = String(req.body.uid || '').trim().slice(0, 40);
  if (!uid) return bad(res, 'Falta el UID de la etiqueta.');
  if (get('SELECT id FROM tables WHERE nfc_uid = ? AND id != ?', uid, t.id)) return bad(res, 'Ese UID ya está en uso.', 409);
  update('tables', t.id, { nfc_uid: uid });
  ok(res);
});

// Panel de sala: pedidos en vivo, avisos, cuenta por mesa y pedido manual del personal.
import { Router } from 'express';
import { all, get, insert, update, run, audit } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { requireFeature } from '../plans.js';
import { publish, venueChannel, tableChannel, subscribe } from '../realtime.js';
import { createOrder, setOrderStatus, hydrateOrder, tableBill, priceLines, totals, OPEN_STATUSES, nextStatus, VISIBLE_TO_STAFF } from '../orders-core.js';
import { bad, ok, nowSql, euros, i18n, parseJson } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireVenue);

/** Canal SSE del local: pedidos y avisos en tiempo real. */
router.get('/stream', (req, res) => subscribe(venueChannel(req.venue.id), res));

/** GET /api/orders?scope=open|today|all&status=&table= */
router.get('/', (req, res) => {
  const params = [req.venue.id];
  // Un pedido a medio pagar todavía no existe para el local.
  let where = `o.venue_id = ? AND o.${VISIBLE_TO_STAFF}`;
  const scope = req.query.scope || 'open';
  if (scope === 'open') where += ` AND o.status IN (${OPEN_STATUSES.map(() => '?').join(',')})`, params.push(...OPEN_STATUSES);
  else if (scope === 'today') where += ` AND date(o.created_at) = date('now','localtime')`;
  if (req.query.status) { where += ' AND o.status = ?'; params.push(req.query.status); }
  if (req.query.table) { where += ' AND o.table_id = ?'; params.push(Number(req.query.table)); }
  if (req.query.from) { where += ' AND date(o.created_at) >= date(?)'; params.push(req.query.from); }
  if (req.query.to) { where += ' AND date(o.created_at) <= date(?)'; params.push(req.query.to); }
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = all(`SELECT o.* FROM orders o WHERE ${where} ORDER BY o.id DESC LIMIT ${limit}`, ...params);
  res.json(rows.map(hydrateOrder));
});

router.get('/pending-calls', (req, res) => {
  res.json(all(`SELECT c.*, t.name AS table_name FROM calls c LEFT JOIN tables t ON t.id = c.table_id
                WHERE c.venue_id = ? AND c.status = 'open' ORDER BY c.id`, req.venue.id));
});

/** Exportación contable de pedidos. */
router.get('/export.csv', requireRole('manager'), requireFeature('export'), (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || '2999-12-31';
  const rows = all(`SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id
                    WHERE o.venue_id = ? AND date(o.created_at) BETWEEN date(?) AND date(?) ORDER BY o.id`,
    req.venue.id, from, to);
  const out = [['codigo', 'fecha', 'mesa', 'canal', 'estado', 'articulos', 'base', 'iva', 'total', 'pago']];
  for (const o of rows) {
    const items = all('SELECT * FROM order_items WHERE order_id = ?', o.id);
    out.push([o.code, o.created_at, o.table_name || '', o.channel, o.status,
      items.map((i) => `${i.qty}x ${i.name}`).join(' | '),
      euros(o.subtotal_cents), euros(o.tax_cents), euros(o.total_cents), o.payment_method || '']);
  }
  const csv = out.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="pedidos-${req.venue.slug}.csv"`);
  res.send('﻿' + csv);
});

router.get('/:id', (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!o) return bad(res, 'Pedido no encontrado.', 404);
  res.json(hydrateOrder(o));
});

/** Avanza al siguiente estado o fija uno concreto. */
router.patch('/:id/status', (req, res) => {
  const current = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!current) return bad(res, 'Pedido no encontrado.', 404);
  const status = req.body.status || nextStatus(current.status);
  if (!status) return bad(res, 'El pedido ya está cerrado.');
  if (status === 'cancelled' && !['manager', 'owner', 'superadmin'].includes(req.user.role)) {
    return bad(res, 'Solo un responsable puede cancelar un pedido.', 403);
  }
  const out = setOrderStatus(req.venue, current.id, status, {
    userId: req.user.id, paymentMethod: req.body.payment_method, reason: req.body.reason,
  });
  if (out.error) return bad(res, out.error, out.code || 400);
  audit(req.venue.id, req.user.id, `order.${status}`, 'order', current.id);
  res.json(out.order);
});

/** Pedido tomado por el personal (flujo alternativo del punto 3.8). */
router.post('/', requireFeature('orders'), (req, res) => {
  const out = createOrder(req.venue, {
    tableId: Number(req.body.table_id) || null,
    lines: req.body.lines,
    guestName: req.body.guest_name || '',
    note: req.body.note || '',
    channel: 'staff',
    lang: req.venue.locale,
  });
  if (out.error) return bad(res, out.error);
  audit(req.venue.id, req.user.id, 'order.created_by_staff', 'order', out.order.id);
  res.status(201).json(out.order);
});

/** Añade líneas a un pedido abierto (rondas siguientes). */
router.post('/:id/items', requireFeature('orders'), (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!order) return bad(res, 'Pedido no encontrado.', 404);
  if (!OPEN_STATUSES.includes(order.status)) return bad(res, 'El pedido ya está cerrado.', 409);
  const priced = priceLines(req.venue, req.body.lines, req.venue.locale);
  if (priced.errors.length) return bad(res, priced.errors.join(' '));
  for (const l of priced.lines) {
    insert('order_items', {
      order_id: order.id, item_id: l.item_id, name: l.name, qty: l.qty,
      unit_price_cents: l.unit_price_cents, options: JSON.stringify(l.options),
      note: l.note, line_total_cents: l.line_total_cents,
    });
  }
  const allLines = all('SELECT * FROM order_items WHERE order_id = ?', order.id)
    .map((li) => ({ ...li, tax_rate: req.venue.tax_rate }));
  update('orders', order.id, totals(req.venue, allLines));
  const fresh = hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id));
  publish(venueChannel(req.venue.id), 'order.updated', fresh);
  res.json(fresh);
});

router.delete('/:id/items/:lineId', requireRole('manager'), (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!order) return bad(res, 'Pedido no encontrado.', 404);
  const line = get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', Number(req.params.lineId), order.id);
  if (!line) return bad(res, 'Línea no encontrada.', 404);
  run('DELETE FROM order_items WHERE id = ?', line.id);
  const allLines = all('SELECT * FROM order_items WHERE order_id = ?', order.id)
    .map((li) => ({ ...li, tax_rate: req.venue.tax_rate }));
  update('orders', order.id, totals(req.venue, allLines));
  const fresh = hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id));
  publish(venueChannel(req.venue.id), 'order.updated', fresh);
  audit(req.venue.id, req.user.id, 'order.line_removed', 'order', order.id, { line: line.name });
  res.json(fresh);
});

/** Cuenta abierta de una mesa. */
router.get('/table/:tableId/bill', (req, res) => {
  const table = get('SELECT * FROM tables WHERE id = ? AND venue_id = ?', Number(req.params.tableId), req.venue.id);
  if (!table) return bad(res, 'Mesa no encontrada.', 404);
  res.json({ table, ...tableBill(req.venue, table.id) });
});

/** Cobra de golpe todo lo abierto en la mesa. */
router.post('/table/:tableId/close', (req, res) => {
  const table = get('SELECT * FROM tables WHERE id = ? AND venue_id = ?', Number(req.params.tableId), req.venue.id);
  if (!table) return bad(res, 'Mesa no encontrada.', 404);
  const bill = tableBill(req.venue, table.id);
  // Se cobra lo pendiente y se cierran también los pedidos que ya venían pagados desde el móvil.
  const abiertos = all(
    `SELECT id, payment_status FROM orders WHERE venue_id = ? AND table_id = ?
       AND status IN ('new','accepted','preparing','served') AND payment_status NOT IN ('pending','failed')`,
    req.venue.id, table.id);
  for (const o of abiertos) {
    setOrderStatus(req.venue, o.id, 'paid', {
      userId: req.user.id,
      paymentMethod: o.payment_status === 'paid' ? undefined : (req.body.payment_method || 'cash'),
    });
  }
  run(`UPDATE calls SET status = 'done', resolved_at = ?, resolved_by = ? WHERE table_id = ? AND status = 'open'`,
    nowSql(), req.user.id, table.id);
  run(`UPDATE tables SET status = 'cleaning', status_changed_at = ? WHERE id = ?`, nowSql(), table.id);
  audit(req.venue.id, req.user.id, 'table.closed', 'table', table.id, { total: euros(bill.total_cents) });
  publish(venueChannel(req.venue.id), 'table.updated', get('SELECT * FROM tables WHERE id = ?', table.id));
  res.json({ ok: true, charged_cents: bill.total_cents, orders: bill.orders.length });
});

/** Marca un aviso como atendido. */
router.patch('/calls/:id', (req, res) => {
  const call = get('SELECT * FROM calls WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!call) return bad(res, 'Aviso no encontrado.', 404);
  update('calls', call.id, { status: 'done', resolved_at: nowSql(), resolved_by: req.user.id });
  const fresh = get('SELECT * FROM calls WHERE id = ?', call.id);
  publish(venueChannel(req.venue.id), 'call.updated', fresh);
  const table = call.table_id ? get('SELECT token FROM tables WHERE id = ?', call.table_id) : null;
  if (table) publish(tableChannel(table.token), 'call.updated', fresh);
  res.json(fresh);
});



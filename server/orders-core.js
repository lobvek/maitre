// Lógica compartida de pedidos: precios, impuestos, creación y cambios de estado.
// La usan tanto la carta pública (comensal) como el panel de sala (personal).
import { all, get, insert, update, run, tx } from './db.js';
import { publish, venueChannel, tableChannel } from './realtime.js';
import { notify } from './webhooks.js';
import { notifyStaff } from './notify.js';
import { i18n, parseJson, nowSql, orderCode } from './utils.js';

export const STATUSES = ['new', 'accepted', 'preparing', 'served', 'paid', 'cancelled'];
export const OPEN_STATUSES = ['new', 'accepted', 'preparing', 'served'];
const NEXT = { new: 'accepted', accepted: 'preparing', preparing: 'served', served: 'paid' };

export const nextStatus = (status) => NEXT[status] || null;

/**
 * Valida las líneas contra la carta real y calcula precios.
 * Nunca se confía en el precio que envía el cliente.
 */
export function priceLines(venue, rawLines, lang = 'es') {
  const lines = [];
  const errors = [];
  for (const raw of rawLines || []) {
    const item = get('SELECT * FROM items WHERE id = ? AND venue_id = ?', Number(raw.item_id), venue.id);
    if (!item) { errors.push(`Producto ${raw.item_id} no existe.`); continue; }
    if (!item.active || !item.available) { errors.push(`${i18n(item.name, lang)} no está disponible ahora mismo.`); continue; }
    const qty = Math.min(Math.max(parseInt(raw.qty, 10) || 1, 1), 50);

    const chosen = [];
    let delta = 0;
    const groups = all('SELECT * FROM option_groups WHERE item_id = ? ORDER BY sort, id', item.id);
    const ids = (raw.option_ids || []).map(Number);
    for (const g of groups) {
      const opts = all('SELECT * FROM options WHERE group_id = ?', g.id);
      const picked = opts.filter((o) => ids.includes(o.id));
      if (picked.length < g.min_select) { errors.push(`${i18n(item.name, lang)}: elige al menos ${g.min_select} en «${g.name}».`); continue; }
      if (picked.length > g.max_select) { errors.push(`${i18n(item.name, lang)}: máximo ${g.max_select} en «${g.name}».`); continue; }
      for (const o of picked) {
        if (!o.available) { errors.push(`«${o.name}» no está disponible.`); continue; }
        delta += o.price_delta_cents;
        chosen.push({ id: o.id, name: o.name, price_delta_cents: o.price_delta_cents, group: g.name });
      }
    }

    const unit = item.price_cents + delta;
    const cat = item.category_id ? get('SELECT station FROM categories WHERE id = ?', item.category_id) : null;
    lines.push({
      item_id: item.id,
      station: cat?.station || '',
      name: i18n(item.name, lang),
      qty,
      unit_price_cents: unit,
      line_total_cents: unit * qty,
      options: chosen,
      note: String(raw.note || '').slice(0, 140),
      tax_rate: item.tax_rate ?? venue.tax_rate,
    });
  }
  return { lines, errors };
}

/** Totales con IVA incluido o añadido, según la configuración del local. */
export function totals(venue, lines) {
  const included = !!venue.prices_include_tax;
  let subtotal = 0, tax = 0, total = 0;
  for (const l of lines) {
    const rate = (l.tax_rate ?? venue.tax_rate) / 10000;
    if (included) {
      const t = Math.round(l.line_total_cents - l.line_total_cents / (1 + rate));
      tax += t; subtotal += l.line_total_cents - t; total += l.line_total_cents;
    } else {
      const t = Math.round(l.line_total_cents * rate);
      tax += t; subtotal += l.line_total_cents; total += l.line_total_cents + t;
    }
  }
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: total };
}

/**
 * Filtro común: el local solo ve pedidos ya pagados o que se pagan en la mesa.
 * Un cobro pendiente o rechazado no debe llegar nunca a la cocina.
 */
export const VISIBLE_TO_STAFF = `payment_status NOT IN ('pending','failed')`;

export function hydrateOrder(order) {
  if (!order) return null;
  const items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', order.id)
    .map((li) => ({ ...li, options: parseJson(li.options, []) }));
  const table = order.table_id ? get('SELECT id, name, zone_id FROM tables WHERE id = ?', order.table_id) : null;
  return { ...order, items, table_name: table?.name || '—', item_count: items.reduce((n, li) => n + li.qty, 0) };
}

/**
 * Crea el pedido. Con `pay: true` queda pendiente de cobro y NO se manda a barra:
 * la cocina solo ve pedidos ya pagados o que se pagan en el local.
 */
export function createOrder(venue, { tableId, lines, guestName = '', note = '', sessionId = '', channel = 'qr', lang = 'es', pay = false }) {
  const priced = priceLines(venue, lines, lang);
  if (priced.errors.length) return { error: priced.errors.join(' ') };
  if (!priced.lines.length) return { error: 'El pedido está vacío.' };
  const sums = totals(venue, priced.lines);

  const order = tx(() => {
    const seq = get('SELECT COUNT(*) AS n FROM orders WHERE venue_id = ?', venue.id).n + 1;
    const id = insert('orders', {
      venue_id: venue.id,
      table_id: tableId || null,
      code: orderCode(seq),
      status: 'new',
      channel,
      guest_name: String(guestName).slice(0, 60),
      note: String(note).slice(0, 300),
      session_id: sessionId,
      payment_status: pay ? 'pending' : 'unpaid',
      ...sums,
    });
    for (const l of priced.lines) {
      insert('order_items', {
        order_id: id, item_id: l.item_id, name: l.name, qty: l.qty, station: l.station || '',
        unit_price_cents: l.unit_price_cents, options: JSON.stringify(l.options),
        note: l.note, line_total_cents: l.line_total_cents,
      });
    }
    if (tableId && !pay) run(`UPDATE tables SET status = 'occupied', status_changed_at = ? WHERE id = ? AND status = 'free'`, nowSql(), tableId);
    return hydrateOrder(get('SELECT * FROM orders WHERE id = ?', id));
  });

  if (!pay) announce(venue, order, 'order.created');
  return { order };
}

/** Manda el pedido a las pantallas del local y al móvil de la mesa. */
function announce(venue, order, event) {
  publish(venueChannel(venue.id), event, order);
  const table = order.table_id ? get('SELECT token FROM tables WHERE id = ?', order.table_id) : null;
  if (table) publish(tableChannel(table.token), event, order);
  notify(venue, event, order);
  if (event === 'order.created') {
    const resumen = order.items.map((li) => `${li.qty}× ${li.name}`).join(', ');
    notifyStaff(venue, { title: `Pedido nuevo · mesa ${order.table_name}`, body: resumen.slice(0, 140), tag: `order-${order.id}` });
  }
}

/**
 * Resultado del cobro online. Solo cuando el pago entra se avisa a barra:
 * así el local nunca prepara algo que no se ha pagado.
 */
export function settlePayment(venue, orderId, { ok, ref = '', method = 'card' }) {
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(orderId), venue.id);
  if (!order) return { error: 'Pedido no encontrado.', code: 404 };
  if (order.payment_status === 'paid') return { order: hydrateOrder(order), already: true };
  if (order.payment_status !== 'pending' && order.payment_status !== 'failed') {
    return { error: 'Este pedido no está pendiente de cobro.', code: 409 };
  }
  if (!ok) {
    update('orders', order.id, { payment_status: 'failed', payment_ref: String(ref).slice(0, 60) });
    return { order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id)), failed: true };
  }
  const now = nowSql();
  update('orders', order.id, {
    payment_status: 'paid', payment_method: method, payment_ref: String(ref).slice(0, 60), paid_at: now,
  });
  if (order.table_id) {
    run(`UPDATE tables SET status = 'occupied', status_changed_at = ? WHERE id = ? AND status = 'free'`, now, order.table_id);
  }
  const fresh = hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id));
  announce(venue, fresh, 'order.created');
  return { order: fresh };
}

/** Descarta los pedidos que se quedaron a medias en la pasarela. */
export function expirePendingPayments(minutes = 30) {
  const res = run(
    `UPDATE orders SET status = 'cancelled', cancelled_reason = 'Pago no completado', closed_at = datetime('now')
     WHERE payment_status IN ('pending','failed') AND status = 'new'
       AND created_at < datetime('now', ?)`, `-${Math.max(1, minutes)} minutes`);
  return Number(res.changes);
}

export function setOrderStatus(venue, orderId, status, { userId = null, paymentMethod = null, reason = '' } = {}) {
  const order = get('SELECT * FROM orders WHERE id = ? AND venue_id = ?', Number(orderId), venue.id);
  if (!order) return { error: 'Pedido no encontrado.', code: 404 };
  if (!STATUSES.includes(status)) return { error: 'Estado no válido.' };
  if (order.status === 'paid' && status !== 'paid') return { error: 'Un pedido cobrado ya no se puede modificar.', code: 409 };

  const patch = { status };
  const now = nowSql();
  if (status === 'accepted' && !order.accepted_at) patch.accepted_at = now;
  if (status === 'served') patch.served_at = now;
  if (status === 'paid') {
    patch.paid_at = order.paid_at || now;
    patch.closed_at = now;
    if (order.payment_status !== 'paid') patch.payment_method = paymentMethod || 'cash';
    patch.payment_status = 'paid';
  }
  if (status === 'cancelled') { patch.closed_at = now; patch.cancelled_reason = String(reason).slice(0, 200); }
  update('orders', order.id, patch);

  // Si la mesa se queda sin pedidos abiertos, pasa a limpieza.
  if (['paid', 'cancelled'].includes(status) && order.table_id) {
    const open = get(
      `SELECT COUNT(*) AS n FROM orders WHERE table_id = ? AND status IN ('new','accepted','preparing','served')`,
      order.table_id).n;
    if (!open) run(`UPDATE tables SET status = 'cleaning', status_changed_at = ? WHERE id = ?`, now, order.table_id);
  }

  const fresh = hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id));
  announce(venue, fresh, 'order.updated');
  return { order: fresh };
}

/** Cuenta abierta de una mesa: todos los pedidos no cobrados. */
export function tableBill(venue, tableId) {
  // Una mesa unida a otra no tiene cuenta propia: se cobra en la principal.
  const mesa = get('SELECT id, merged_into FROM tables WHERE id = ? AND venue_id = ?', Number(tableId), venue.id);
  const principal = mesa?.merged_into || Number(tableId);
  // Si hay mesas unidas a esta, su consumo entra en la misma cuenta.
  const ids = [principal, ...all('SELECT id FROM tables WHERE merged_into = ?', principal).map((t) => t.id)];
  const orders = all(
    `SELECT * FROM orders WHERE venue_id = ? AND table_id IN (${ids.map(() => '?').join(',')})
       AND status IN ('new','accepted','preparing','served')
       AND payment_status != 'paid' ORDER BY id`, venue.id, ...ids).map(hydrateOrder);
  const sum = (k) => orders.reduce((n, o) => n + o[k], 0);
  return {
    orders,
    table_ids: ids,
    billed_at_table: mesa?.merged_into ? principal : null,
    subtotal_cents: sum('subtotal_cents'),
    tax_cents: sum('tax_cents'),
    total_cents: sum('total_cents'),
  };
}

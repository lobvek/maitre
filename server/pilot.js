// Cuadro de mando del piloto de 30 días (estudio competitivo, tablas 10 y 12).
// El piloto es un experimento comercial, no un regalo: objetivo elegido, línea base,
// revisión semanal y decisión explícita al final. Aquí se calculan las métricas de uso,
// valor y calidad a partir de los datos reales del local.
import { all, get } from './db.js';
import { parseJson } from './utils.js';

const day = (d) => new Date(d).toISOString().slice(0, 10);

/** Reglas de éxito del día 30 según el estudio. */
export const SUCCESS = {
  adoption_pct: 20,     // ≥20% de las mesas usan pedido o llamada
  ticket_lift_pct: 5,   // +5% de ticket medio frente a la línea base
  lost_orders: 0,       // 0 pedidos perdidos
};

export function pilotReport(venue, now = new Date()) {
  const pilot = parseJson(venue.pilot, {});
  const start = pilot.start || (venue.plan_since || venue.created_at || '').slice(0, 10) || day(now);
  const end = pilot.decision_date || day(new Date(Date.parse(start) + 30 * 86400000));
  const v = venue.id;
  const inRange = `venue_id = ? AND date(created_at) BETWEEN date(?) AND date(?)`;
  const args = [v, start, end];

  const tables = get('SELECT COUNT(*) AS n FROM tables WHERE venue_id = ? AND active = 1', v).n || 1;
  const scanned = get(`SELECT COUNT(DISTINCT table_id) AS n FROM scans WHERE ${inRange}`, ...args).n;
  const usedOrder = get(`SELECT COUNT(DISTINCT table_id) AS n FROM orders WHERE ${inRange} AND channel = 'qr'`, ...args).n;
  const usedCall = get(`SELECT COUNT(DISTINCT table_id) AS n FROM calls WHERE ${inRange}`, ...args).n;
  const usedAny = get(
    `SELECT COUNT(*) AS n FROM (SELECT table_id FROM orders WHERE ${inRange} AND channel = 'qr'
      UNION SELECT table_id FROM calls WHERE ${inRange})`, ...args, ...args).n;

  const orders = get(`SELECT COUNT(*) AS n, COALESCE(AVG(total_cents),0) AS ticket FROM orders
    WHERE ${inRange} AND status IN ('served','paid')`, ...args);
  const qrOrders = get(`SELECT COUNT(*) AS n FROM orders WHERE ${inRange} AND channel = 'qr'`, ...args).n;
  const accept = get(`SELECT AVG((julianday(accepted_at) - julianday(created_at)) * 1440) AS m
    FROM orders WHERE ${inRange} AND accepted_at IS NOT NULL`, ...args).m;
  const lost = get(`SELECT COUNT(*) AS n FROM orders WHERE ${inRange} AND (
      (status = 'cancelled' AND cancelled_reason NOT LIKE 'Pago no completado%')
      OR (status = 'new' AND payment_status != 'pending' AND created_at < datetime('now', '-30 minutes')))`, ...args).n;
  const duplicated = get(`SELECT COUNT(*) AS n FROM (
      SELECT table_id, session_id, COUNT(*) c FROM orders WHERE ${inRange} AND session_id != ''
      GROUP BY table_id, session_id, strftime('%Y-%m-%d %H:%M', created_at) HAVING c > 1)`, ...args).n;

  // Retención semana 4: ¿en la cuarta semana sigue habiendo uso desde el móvil?
  const w4start = day(new Date(Date.parse(start) + 21 * 86400000));
  const w4end = day(new Date(Date.parse(start) + 28 * 86400000));
  const week4 = get(`SELECT COUNT(*) AS n FROM orders WHERE venue_id = ? AND channel = 'qr'
    AND date(created_at) BETWEEN date(?) AND date(?)`, v, w4start, w4end).n;
  const week1 = get(`SELECT COUNT(*) AS n FROM orders WHERE venue_id = ? AND channel = 'qr'
    AND date(created_at) BETWEEN date(?) AND date(?, '+7 days')`, v, start, start).n;

  const reviews = get(`SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg,
    SUM(optin) AS optins FROM reviews WHERE ${inRange}`, ...args);

  const baseTicket = Number(pilot.baseline_ticket_cents) || 0;
  const ticket = Math.round(orders.ticket);
  const ticketLift = baseTicket ? Math.round(((ticket - baseTicket) / baseTicket) * 1000) / 10 : null;
  const adoption = Math.round((usedAny / tables) * 100);
  const daysLeft = Math.max(0, Math.ceil((Date.parse(end) - now.getTime()) / 86400000));

  const checks = [
    { id: 'adoption', label: `≥${SUCCESS.adoption_pct}% de mesas usan pedido o llamada`, value: `${adoption}%`, ok: adoption >= SUCCESS.adoption_pct },
    { id: 'ticket', label: `+${SUCCESS.ticket_lift_pct}% de ticket frente a la línea base`, value: ticketLift == null ? 'sin línea base' : `${ticketLift > 0 ? '+' : ''}${ticketLift}%`, ok: ticketLift != null && ticketLift >= SUCCESS.ticket_lift_pct },
    { id: 'lost', label: '0 pedidos perdidos', value: String(lost), ok: lost === SUCCESS.lost_orders },
    { id: 'retention', label: 'Uso en la semana 4', value: `${week4} pedidos QR`, ok: week4 > 0 || daysLeft > 7 },
  ];

  return {
    pilot: {
      objective: pilot.objective || '',
      start, decision_date: end, days_left: daysLeft,
      baseline_ticket_cents: baseTicket,
      baseline_wait_minutes: Number(pilot.baseline_wait_minutes) || null,
      deposit_cents: Number(pilot.deposit_cents) || 0,
      responsible: pilot.responsible || '',
      notes: pilot.notes || '',
      weekly: Array.isArray(pilot.weekly) ? pilot.weekly : [],
    },
    usage: {
      tables, tables_scanned: scanned, tables_ordered: usedOrder, tables_called: usedCall,
      scan_pct: Math.round((scanned / tables) * 100),
      adoption_pct: adoption,
      qr_orders: qrOrders,
      week1_qr_orders: week1, week4_qr_orders: week4,
    },
    value: {
      orders: orders.n, ticket_cents: ticket, baseline_ticket_cents: baseTicket, ticket_lift_pct: ticketLift,
      accept_minutes: accept ? Math.round(accept * 10) / 10 : null,
      reviews: reviews.n, rating: reviews.n ? Math.round(reviews.avg * 10) / 10 : null, optins: reviews.optins || 0,
    },
    quality: { lost_orders: lost, duplicated_orders: duplicated },
    checks,
    passed: checks.filter((c) => c.ok).length,
  };
}

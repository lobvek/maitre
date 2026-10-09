// Analítica del local (plan Pro): ventas, ticket medio, horas punta, embudo QR→pedido.
import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { requireFeature } from '../plans.js';

export const router = Router();
// La analítica es información de negocio: queda fuera del alcance del personal de sala.
router.use(requireAuth, requireVenue, requireRole('manager'), requireFeature('analytics'));

const range = (req) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return [from, to];
};

const PAID = `status IN ('served','paid')`;

router.get('/summary', (req, res) => {
  const [from, to] = range(req);
  const v = req.venue.id;
  const inRange = `venue_id = ? AND date(created_at) BETWEEN date(?) AND date(?)`;
  const args = [v, from, to];

  const totals = get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue_cents,
      COALESCE(SUM(tax_cents),0) AS tax_cents,
      COALESCE(AVG(total_cents),0) AS avg_ticket_cents
    FROM orders WHERE ${inRange} AND ${PAID}`, ...args);

  const cancelled = get(`SELECT COUNT(*) AS n FROM orders WHERE ${inRange} AND status = 'cancelled'`, ...args).n;
  const scans = get(`SELECT COUNT(*) AS n, COUNT(DISTINCT session_id) AS sessions FROM scans WHERE ${inRange}`, ...args);
  const ordering_sessions = get(
    `SELECT COUNT(DISTINCT session_id) AS n FROM orders WHERE ${inRange} AND session_id != ''`, ...args).n;

  const byDay = all(`SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue_cents
    FROM orders WHERE ${inRange} AND ${PAID} GROUP BY day ORDER BY day`, ...args);

  const byHour = all(`SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS orders,
      COALESCE(SUM(total_cents),0) AS revenue_cents
    FROM orders WHERE ${inRange} AND ${PAID} GROUP BY hour ORDER BY hour`, ...args);

  const topItems = all(`SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.line_total_cents) AS revenue_cents
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.venue_id = ? AND date(o.created_at) BETWEEN date(?) AND date(?) AND o.${PAID}
    GROUP BY oi.name ORDER BY qty DESC LIMIT 15`, ...args);

  const byCategory = all(`SELECT COALESCE(c.name, '{"es":"Sin categoría"}') AS category,
      SUM(oi.qty) AS qty, SUM(oi.line_total_cents) AS revenue_cents
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    LEFT JOIN items i ON i.id = oi.item_id LEFT JOIN categories c ON c.id = i.category_id
    WHERE o.venue_id = ? AND date(o.created_at) BETWEEN date(?) AND date(?) AND o.${PAID}
    GROUP BY category ORDER BY revenue_cents DESC`, ...args);

  const byChannel = all(`SELECT channel, COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue_cents
    FROM orders WHERE ${inRange} AND ${PAID} GROUP BY channel`, ...args);

  const byTable = all(`SELECT t.name AS table_name, COUNT(o.id) AS orders, COALESCE(SUM(o.total_cents),0) AS revenue_cents
    FROM orders o JOIN tables t ON t.id = o.table_id
    WHERE o.venue_id = ? AND date(o.created_at) BETWEEN date(?) AND date(?) AND o.${PAID}
    GROUP BY t.id ORDER BY revenue_cents DESC LIMIT 12`, ...args);

  const times = get(`SELECT
      AVG(CASE WHEN accepted_at IS NOT NULL THEN (julianday(accepted_at)-julianday(created_at))*1440 END) AS accept_min,
      AVG(CASE WHEN served_at IS NOT NULL THEN (julianday(served_at)-julianday(created_at))*1440 END) AS serve_min
    FROM orders WHERE ${inRange}`, ...args);

  const calls = get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
      AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*1440 END) AS avg_min
    FROM calls WHERE ${inRange}`, ...args);

  const callsByType = all(`SELECT type, COUNT(*) AS n FROM calls WHERE ${inRange} GROUP BY type`, ...args);
  const reviews = get(`SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg, COALESCE(SUM(optin),0) AS optins
    FROM reviews WHERE ${inRange}`, ...args);
  const lastReviews = all(`SELECT r.rating, r.comment, r.created_at, t.name AS table_name FROM reviews r
    LEFT JOIN tables t ON t.id = r.table_id WHERE r.${inRange} AND r.comment != '' ORDER BY r.id DESC LIMIT 8`, ...args);

  res.json({
    range: { from, to },
    kpis: {
      orders: totals.orders,
      revenue_cents: totals.revenue_cents,
      tax_cents: totals.tax_cents,
      avg_ticket_cents: Math.round(totals.avg_ticket_cents),
      cancelled,
      scans: scans.n,
      scan_sessions: scans.sessions,
      ordering_sessions,
      conversion: scans.sessions ? Math.round((ordering_sessions / scans.sessions) * 1000) / 10 : 0,
      accept_minutes: times.accept_min ? Math.round(times.accept_min * 10) / 10 : null,
      serve_minutes: times.serve_min ? Math.round(times.serve_min * 10) / 10 : null,
      calls: calls.total,
      calls_open: calls.open || 0,
      calls_avg_minutes: calls.avg_min ? Math.round(calls.avg_min * 10) / 10 : null,
      reviews: reviews.n,
      rating: reviews.n ? Math.round(reviews.avg * 10) / 10 : null,
      optins: reviews.optins,
    },
    last_reviews: lastReviews,
    by_day: byDay,
    by_hour: byHour,
    top_items: topItems,
    by_category: byCategory,
    by_channel: byChannel,
    by_table: byTable,
    calls_by_type: callsByType,
  });
});

/** Rentabilidad estimada por producto (usa el coste/escandallo si está informado). */
router.get('/margins', (req, res) => {
  const [from, to] = range(req);
  res.json(all(`SELECT i.id, i.name, i.price_cents, i.cost_cents,
      COALESCE(SUM(oi.qty),0) AS qty, COALESCE(SUM(oi.line_total_cents),0) AS revenue_cents
    FROM items i
    LEFT JOIN order_items oi ON oi.item_id = i.id
    LEFT JOIN orders o ON o.id = oi.order_id AND date(o.created_at) BETWEEN date(?) AND date(?) AND o.${PAID}
    WHERE i.venue_id = ? GROUP BY i.id ORDER BY revenue_cents DESC`, from, to, req.venue.id)
    .map((r) => ({
      ...r,
      margin_cents: r.price_cents - (r.cost_cents || 0),
      margin_pct: r.price_cents ? Math.round(((r.price_cents - (r.cost_cents || 0)) / r.price_cents) * 1000) / 10 : null,
      profit_cents: (r.price_cents - (r.cost_cents || 0)) * r.qty,
    })));
});

/**
 * GET /api/analytics/group — la foto de toda la marca, local a local.
 * Es lo que pide el jefe de una franquicia: no el detalle de un bar, sino cuál va bien
 * y cuál se ha quedado atrás esta semana.
 */
router.get('/group', (req, res) => {
  if (!req.user.group_id) return res.status(403).json({ error: 'forbidden', message: 'Esta cuenta no lleva un grupo.' });
  const [from, to] = range(req);
  const locales = all('SELECT id, name, city FROM venues WHERE group_id = ? ORDER BY name', req.user.group_id);
  const filas = locales.map((v) => {
    const k = get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue_cents
                   FROM orders WHERE venue_id = ? AND ${PAID} AND date(created_at) BETWEEN ? AND ?`, v.id, from, to);
    const qr = get(`SELECT COUNT(*) AS n FROM orders WHERE venue_id = ? AND channel = 'qr' AND ${PAID}
                    AND date(created_at) BETWEEN ? AND ?`, v.id, from, to).n;
    const esperas = get(`SELECT AVG((julianday(accepted_at) - julianday(created_at)) * 1440) AS m
                         FROM orders WHERE venue_id = ? AND accepted_at IS NOT NULL
                         AND date(created_at) BETWEEN ? AND ?`, v.id, from, to).m;
    return {
      ...v,
      orders: k.orders,
      revenue_cents: k.revenue_cents,
      avg_ticket_cents: k.orders ? Math.round(k.revenue_cents / k.orders) : 0,
      qr_pct: k.orders ? Math.round((qr / k.orders) * 100) : 0,
      accept_minutes: esperas === null ? null : Math.round(esperas * 10) / 10,
    };
  });
  res.json({
    range: { from, to },
    venues: filas,
    total: {
      orders: filas.reduce((n, f) => n + f.orders, 0),
      revenue_cents: filas.reduce((n, f) => n + f.revenue_cents, 0),
    },
  });
});

// Suscripción del local: cambio de plan, historial y facturas.
// El cobro real se delega a un proveedor autorizado (punto 3.8: no se almacenan tarjetas).
// Aquí queda el adaptador; en modo demo la suscripción se activa sin pasarela.
import { Router } from 'express';
import { all, get, insert, update, audit } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { PLANS, SELF_SERVICE, effectivePlan, trialDaysLeft } from '../plans.js';
import { bad, ok, addDays, euros, nowSql } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireVenue, requireRole('manager'));

router.get('/', (req, res) => {
  const venue = get('SELECT * FROM venues WHERE id = ?', req.venue.id);
  const plan = effectivePlan(venue);
  const events = all('SELECT * FROM billing_events WHERE venue_id = ? ORDER BY id DESC LIMIT 50', venue.id);
  const tables = get('SELECT COUNT(*) AS n FROM tables WHERE venue_id = ? AND active = 1', venue.id).n;
  res.json({
    plan: venue.plan,
    effective_plan: plan.id,
    trial_ends_at: venue.trial_ends_at,
    trial_days_left: trialDaysLeft(venue),
    tables_used: tables,
    max_tables: plan.max_tables,
    plans: Object.values(PLANS).filter((p) => p.id !== 'paused' && p.id !== 'trial'),
    plan_until: venue.plan_until,
    events,
    tax_rate_pct: 21,
  });
});

/** POST /api/billing/plan { plan: 'mesa'|'servicio'|'conectado' } — Fundadores lo asigna Maitre. */
router.post('/plan', requireRole('owner'), (req, res) => {
  const target = String(req.body.plan || '');
  if (!SELF_SERVICE.includes(target)) return bad(res, 'Plan no válido.');
  const venue = get('SELECT * FROM venues WHERE id = ?', req.venue.id);
  const tables = get('SELECT COUNT(*) AS n FROM tables WHERE venue_id = ? AND active = 1', venue.id).n;
  if (tables > PLANS[target].max_tables) {
    return bad(res, `Tienes ${tables} mesas y el plan ${PLANS[target].name} admite ${PLANS[target].max_tables}.`, 409);
  }
  update('venues', venue.id, { plan: target, plan_since: nowSql(), plan_until: null, status: 'active' });
  const net = PLANS[target].price_cents;
  const tax = Math.round(net * 0.21);
  insert('billing_events', {
    venue_id: venue.id, type: 'plan_changed', plan: target, amount_cents: net, tax_cents: tax,
    period_start: new Date().toISOString().slice(0, 10), period_end: addDays(30).slice(0, 10),
    reference: `MTR-${venue.id}-${Date.now().toString(36).toUpperCase()}`,
    note: `Alta de plan ${PLANS[target].name} · ${euros(net)} € + IVA`,
  });
  audit(venue.id, req.user.id, 'billing.plan_changed', 'venue', venue.id, { plan: target });
  res.json({ ok: true, plan: target });
});

router.post('/cancel', requireRole('owner'), (req, res) => {
  update('venues', req.venue.id, { plan: 'paused' });
  insert('billing_events', {
    venue_id: req.venue.id, type: 'cancelled', plan: 'paused', status: 'cancelled',
    note: String(req.body.reason || '').slice(0, 200),
  });
  audit(req.venue.id, req.user.id, 'billing.cancelled');
  ok(res);
});

/** Factura en HTML lista para imprimir o guardar en PDF desde el navegador. */
router.get('/invoice/:id', (req, res) => {
  const ev = get('SELECT * FROM billing_events WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!ev) return bad(res, 'Documento no encontrado.', 404);
  const v = req.venue;
  const total = (ev.amount_cents || 0) + (ev.tax_cents || 0);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="es"><meta charset="utf-8">
<title>Factura ${ev.reference || ev.id} · Maitre</title>
<style>body{font:14px/1.6 system-ui,sans-serif;max-width:740px;margin:40px auto;padding:0 24px;color:#222}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:28px 0}
th,td{padding:10px;border-bottom:1px solid #e5e5e5;text-align:left}td:last-child,th:last-child{text-align:right}
.tot{font-weight:600;font-size:16px}.muted{color:#777}header{display:flex;justify-content:space-between;gap:24px}
@media print{body{margin:0}}</style>
<header><div><h1>Maitre</h1><div class="muted">Marc Simón Socías · NIF 53297246J<br>
Carrer de Vitòria 11, Sant Cugat del Vallès 08195</div></div>
<div style="text-align:right"><strong>Factura ${ev.reference || `MTR-${ev.id}`}</strong><br>
<span class="muted">${ev.created_at}</span></div></header>
<p><strong>Cliente:</strong> ${v.legal_name || v.name}${v.nif ? ` · NIF ${v.nif}` : ''}<br>
<span class="muted">${[v.address, v.city].filter(Boolean).join(', ')}</span></p>
<table><tr><th>Concepto</th><th>Importe</th></tr>
<tr><td>Suscripción Maitre — plan ${PLANS[ev.plan]?.name || ev.plan}<br>
<span class="muted">${ev.period_start || ''} — ${ev.period_end || ''}</span></td><td>${euros(ev.amount_cents)} €</td></tr>
<tr><td>IVA 21%</td><td>${euros(ev.tax_cents)} €</td></tr>
<tr class="tot"><td>Total</td><td>${euros(total)} €</td></tr></table>
<p class="muted">Documento generado por Maitre. Operación exenta de retención. Este software no almacena datos de tarjetas.</p>
</html>`);
});

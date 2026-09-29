// Panel del operador de Maitre (superadmin): cartera de locales, MRR y seguimiento
// de los hitos del plan de empresa (12 locales en el mes 6, 35 en el 12, 70 en el 18).
import { Router } from 'express';
import { all, get, update, insert, run, audit, tx } from '../db.js';
import { requireAuth, requireSuperadmin, hashPassword } from '../auth.js';
import { slugify, token, addDays } from '../utils.js';
import { makeQrCode } from '../db.js';
import { PLANS, effectivePlan } from '../plans.js';
import { pilotReport } from '../pilot.js';
import { bad, ok, nowSql } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireSuperadmin);

const MILESTONES = [
  { month: 6, target: 12, label: 'Conversión y primeras referencias' },
  { month: 12, target: 35, label: 'Onboarding repetible' },
  { month: 18, target: 70, label: 'Escala comercial inicial' },
];
const BREAKEVEN_VENUES = 45;

router.get('/overview', (_req, res) => {
  const venues = all('SELECT * FROM venues ORDER BY id');
  let mrr = 0, paying = 0, trials = 0, pilots = 0, demos = 0;
  for (const v of venues) {
    const plan = effectivePlan(v);
    if (v.status !== 'active') continue;
    if (v.is_demo) { demos++; }
    if (v.plan === 'trial' && !v.is_demo) trials++;
    if (v.is_pilot && !v.is_demo) pilots++;
    if (v.is_demo) continue;
    if (['mesa', 'servicio', 'founders'].includes(v.plan)) { mrr += PLANS[v.plan].price_cents; paying++; }
  }
  const activity = get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS gmv_cents
    FROM orders WHERE date(created_at) >= date('now','-30 day')`);
  res.json({
    kpis: {
      venues: venues.filter((v) => !v.is_demo).length,
      demos,
      paying, trials, pilots,
      mrr_cents: mrr,
      arr_cents: mrr * 12,
      arpa_cents: paying ? Math.round(mrr / paying) : 0,
      breakeven_venues: BREAKEVEN_VENUES,
      breakeven_pct: Math.min(100, Math.round((paying / BREAKEVEN_VENUES) * 100)),
      orders_30d: activity.orders,
      gmv_30d_cents: activity.gmv_cents,
    },
    milestones: MILESTONES.map((m) => ({ ...m, reached: paying >= m.target })),
    signups_by_month: all(`SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS n
                           FROM venues GROUP BY month ORDER BY month`),
  });
});

router.get('/venues', (req, res) => {
  const q = `%${String(req.query.q || '').toLowerCase()}%`;
  const rows = all(`SELECT v.*,
      (SELECT COUNT(*) FROM tables t WHERE t.venue_id = v.id) AS tables,
      (SELECT COUNT(*) FROM items i WHERE i.venue_id = v.id) AS items,
      (SELECT COUNT(*) FROM orders o WHERE o.venue_id = v.id) AS orders,
      (SELECT COUNT(*) FROM orders o WHERE o.venue_id = v.id AND date(o.created_at) >= date('now','-7 day')) AS orders_7d,
      (SELECT MAX(o.created_at) FROM orders o WHERE o.venue_id = v.id) AS last_order_at,
      (SELECT u.email FROM users u WHERE u.venue_id = v.id AND u.role = 'owner' LIMIT 1) AS owner_email
    FROM venues v WHERE lower(v.name) LIKE ? OR lower(v.slug) LIKE ? OR lower(v.city) LIKE ?
    ORDER BY v.id DESC`, q, q, q);
  res.json(rows.map((v) => ({ ...v, effective_plan: effectivePlan(v).id, mrr_cents: PLANS[v.plan]?.price_cents || 0 })));
});

router.patch('/venues/:id', (req, res) => {
  const v = get('SELECT * FROM venues WHERE id = ?', Number(req.params.id));
  if (!v) return bad(res, 'Local no encontrado.', 404);
  const patch = {};
  if (req.body.is_demo !== undefined) patch.is_demo = req.body.is_demo ? 1 : 0;
  if (req.body.beta !== undefined) {
    const f = JSON.parse(v.features || '{}');
    for (const [k, on] of Object.entries(req.body.beta)) f[`beta_${k}`] = !!on;
    patch.features = JSON.stringify(f);
  }
  if (req.body.plan && ['trial', 'mesa', 'servicio', 'founders', 'paused'].includes(req.body.plan)) {
    patch.plan = req.body.plan;
    patch.plan_since = nowSql();
    // Fundadores: plan Servicio a 19 € durante 24 meses; después pasa al precio público.
    patch.plan_until = req.body.plan === 'founders' ? addDays(PLANS.founders.months * 30) : null;
  }
  if (req.body.pilot !== undefined) {
    const actual = JSON.parse(v.pilot || '{}');
    patch.pilot = JSON.stringify({ ...actual, ...req.body.pilot });
  }
  if (req.body.status && ['active', 'suspended', 'churned'].includes(req.body.status)) patch.status = req.body.status;
  if (req.body.is_pilot !== undefined) patch.is_pilot = req.body.is_pilot ? 1 : 0;
  if (req.body.extend_trial_days) patch.trial_ends_at = addDays(Number(req.body.extend_trial_days) || 30);
  update('venues', v.id, patch);
  audit(v.id, req.user.id, 'admin.venue_updated', 'venue', v.id, patch);
  res.json(get('SELECT * FROM venues WHERE id = ?', v.id));
});

/**
 * POST /api/admin/venues — da de alta un local de verdad para un piloto.
 * Limpio: sin datos de muestra, con su dueño y sus mesas listas.
 */
router.post('/venues', (req, res) => {
  const { name, email, password, city = '', address = '', tables = 12, owner_name = '' } = req.body || {};
  if (!name || !email || !password) return bad(res, 'Hacen falta nombre del local, email y contraseña.');
  if (String(password).length < 8) return bad(res, 'La contraseña debe tener al menos 8 caracteres.');
  const mail = String(email).trim().toLowerCase();
  if (get('SELECT id FROM users WHERE email = ?', mail)) return bad(res, 'Ya existe una cuenta con ese email.', 409);

  let slug = slugify(name), n = 1;
  while (get('SELECT id FROM venues WHERE slug = ?', slug)) slug = `${slugify(name)}-${++n}`;

  const out = tx(() => {
    const venueId = insert('venues', {
      slug, name: String(name).trim(), city: String(city).trim(), address: String(address).trim(),
      email: mail, plan: 'trial', plan_since: nowSql(), trial_ends_at: addDays(30),
      is_pilot: 1, is_demo: 0, onboarding_step: 1,
      features: JSON.stringify({ calls: true, orders: true, notes: true }),
      pilot: JSON.stringify({ start: new Date().toISOString().slice(0, 10), decision_date: addDays(30).slice(0, 10) }),
    });
    insert('users', {
      venue_id: venueId, email: mail, password_hash: hashPassword(password),
      name: String(owner_name).trim() || 'Responsable', role: 'owner',
    });
    const zona = insert('zones', { venue_id: venueId, name: 'Sala', sort: 0 });
    const cuantas = Math.min(Math.max(parseInt(tables, 10) || 12, 1), 80);
    for (let i = 1; i <= cuantas; i++) {
      insert('tables', { venue_id: venueId, zone_id: zona, name: String(i), seats: 2,
        token: token(6), sort: i, qr_code: makeQrCode() });
    }
    audit(venueId, req.user.id, 'admin.venue_created', 'venue', venueId, { slug, piloto: true });
    return venueId;
  });
  res.status(201).json(get('SELECT * FROM venues WHERE id = ?', out));
});

/** Cuadro de mando del piloto (tabla 10 y 12 del estudio): uso, valor y calidad. */
router.get('/venues/:id/pilot', (req, res) => {
  const v = get('SELECT * FROM venues WHERE id = ?', Number(req.params.id));
  if (!v) return bad(res, 'Local no encontrado.', 404);
  res.json(pilotReport(v));
});

router.get('/leads', (_req, res) => res.json(all('SELECT * FROM leads ORDER BY id DESC LIMIT 300')));

router.patch('/leads/:id', (req, res) => {
  const lead = get('SELECT * FROM leads WHERE id = ?', Number(req.params.id));
  if (!lead) return bad(res, 'Contacto no encontrado.', 404);
  if (req.body.status && ['new', 'contacted', 'pilot', 'won', 'lost'].includes(req.body.status)) {
    update('leads', lead.id, { status: req.body.status });
  }
  res.json(get('SELECT * FROM leads WHERE id = ?', lead.id));
});

router.get('/audit', (_req, res) => {
  res.json(all(`SELECT a.*, v.name AS venue_name, u.email AS user_email FROM audit_log a
                LEFT JOIN venues v ON v.id = a.venue_id LEFT JOIN users u ON u.id = a.user_id
                ORDER BY a.id DESC LIMIT 300`));
});

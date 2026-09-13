// Alta de local, login, sesión y equipo.
import { Router } from 'express';
import { get, all, insert, update, run, audit, tx, makeQrCode } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth, requireRole, requireVenue } from '../auth.js';
import { effectivePlan, trialDaysLeft, PLANS } from '../plans.js';
import { slugify, token, addDays, bad, ok } from '../utils.js';

export const router = Router();

const publicVenue = (venue) => {
  if (!venue) return null;
  const plan = effectivePlan(venue);
  return {
    ...venue,
    languages: JSON.parse(venue.languages || '["es"]'),
    features: JSON.parse(venue.features || '{}'),
    effective_plan: plan.id,
    plan_features: plan.features,
    max_tables: plan.max_tables,
    trial_days_left: venue.plan === 'trial' ? trialDaysLeft(venue) : 0,
    pilot: JSON.parse(venue.pilot || '{}'),
  };
};

/** POST /api/auth/signup — alta self-service de un local (3.7 del plan). */
router.post('/signup', (req, res) => {
  const { venue_name, name, email, password, city = '', phone = '', tables = 0 } = req.body || {};
  if (!venue_name || !email || !password) return bad(res, 'Faltan nombre del local, email o contraseña.');
  if (String(password).length < 8) return bad(res, 'La contraseña debe tener al menos 8 caracteres.');
  const mail = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad(res, 'Email no válido.');
  if (get('SELECT id FROM users WHERE email = ?', mail)) return bad(res, 'Ya existe una cuenta con ese email.', 409);

  let slug = slugify(venue_name);
  let n = 1;
  while (get('SELECT id FROM venues WHERE slug = ?', slug)) slug = `${slugify(venue_name)}-${++n}`;

  const out = tx(() => {
    const venueId = insert('venues', {
      slug,
      name: String(venue_name).trim(),
      city: String(city).trim(),
      phone: String(phone).trim(),
      email: mail,
      plan: 'trial',
      plan_since: new Date().toISOString().slice(0, 19).replace('T', ' '),
      trial_ends_at: addDays(30),
      features: JSON.stringify({ calls: true, orders: true, guest_name: false, notes: true }),
      onboarding_step: 1,
    });
    const userId = insert('users', {
      venue_id: venueId,
      email: mail,
      password_hash: hashPassword(password),
      name: String(name || '').trim() || 'Responsable',
      role: 'owner',
    });
    const zoneId = insert('zones', { venue_id: venueId, name: 'Sala', sort: 0 });
    const count = Math.min(Math.max(parseInt(tables, 10) || 4, 1), 40);
    for (let i = 1; i <= count; i++) {
      insert('tables', { venue_id: venueId, zone_id: zoneId, name: String(i), seats: 2, token: token(6), sort: i, qr_code: makeQrCode() });
    }
    insert('billing_events', {
      venue_id: venueId, type: 'trial_started', plan: 'trial',
      period_start: new Date().toISOString().slice(0, 10), period_end: addDays(30).slice(0, 10),
      note: 'Prueba de 30 días',
    });
    audit(venueId, userId, 'venue.created', 'venue', venueId, { slug });
    return { venueId, userId };
  });

  const user = get('SELECT * FROM users WHERE id = ?', out.userId);
  createSession(res, user, req.headers['user-agent']);
  const venue = get('SELECT * FROM venues WHERE id = ?', out.venueId);
  res.status(201).json({ user: { ...user, password_hash: undefined }, venue: publicVenue(venue) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE email = ? AND active = 1', String(email || '').trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Email o contraseña incorrectos.' });
  }
  createSession(res, user, req.headers['user-agent']);
  const venue = user.venue_id ? get('SELECT * FROM venues WHERE id = ?', user.venue_id) : null;
  audit(user.venue_id, user.id, 'auth.login');
  res.json({ user: { ...user, password_hash: undefined }, venue: publicVenue(venue) });
});

router.post('/logout', (req, res) => { destroySession(req, res); ok(res); });

/** GET /api/auth/me — estado de sesión para el front. */
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    user: req.user,
    venue: publicVenue(req.venue),
    plans: Object.values(PLANS).filter((p) => p.id !== 'paused'),
  });
});

router.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current, row.password_hash)) return bad(res, 'La contraseña actual no es correcta.', 403);
  if (String(next || '').length < 8) return bad(res, 'La nueva contraseña debe tener al menos 8 caracteres.');
  update('users', req.user.id, { password_hash: hashPassword(next) });
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, req.sessionToken);
  audit(req.user.venue_id, req.user.id, 'auth.password_changed');
  ok(res);
});

// --- Equipo ------------------------------------------------------------------
router.get('/team', requireAuth, requireVenue, (req, res) => {
  res.json(all(
    `SELECT id, email, name, role, active, pin, last_login_at, created_at
     FROM users WHERE venue_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name`,
    req.venue.id));
});

router.post('/team', requireAuth, requireVenue, requireRole('owner'), (req, res) => {
  const { email, name, password, role = 'staff', pin = '' } = req.body || {};
  if (!['manager', 'staff'].includes(role)) return bad(res, 'Rol no válido (manager o staff).');
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || String(password || '').length < 8) return bad(res, 'Email y contraseña de al menos 8 caracteres.');
  if (get('SELECT id FROM users WHERE email = ?', mail)) return bad(res, 'Ese email ya está en uso.', 409);
  const id = insert('users', {
    venue_id: req.venue.id, email: mail, password_hash: hashPassword(password),
    name: String(name || '').trim() || mail.split('@')[0], role, pin: String(pin).slice(0, 6) || null,
  });
  audit(req.venue.id, req.user.id, 'team.created', 'user', id, { role });
  res.status(201).json(get('SELECT id, email, name, role, active, pin FROM users WHERE id = ?', id));
});

router.patch('/team/:id', requireAuth, requireVenue, requireRole('owner'), (req, res) => {
  const target = get('SELECT * FROM users WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!target) return bad(res, 'Usuario no encontrado.', 404);
  if (target.role === 'owner' && req.body.role && req.body.role !== 'owner') {
    return bad(res, 'No puedes degradar al propietario.');
  }
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.role !== undefined && ['manager', 'staff'].includes(req.body.role)) patch.role = req.body.role;
  if (req.body.active !== undefined) patch.active = req.body.active ? 1 : 0;
  if (req.body.pin !== undefined) patch.pin = String(req.body.pin).slice(0, 6) || null;
  if (req.body.password) {
    if (String(req.body.password).length < 8) return bad(res, 'Contraseña demasiado corta.');
    patch.password_hash = hashPassword(req.body.password);
  }
  update('users', target.id, patch);
  audit(req.venue.id, req.user.id, 'team.updated', 'user', target.id, patch.role ? { role: patch.role } : {});
  res.json(get('SELECT id, email, name, role, active, pin FROM users WHERE id = ?', target.id));
});

router.delete('/team/:id', requireAuth, requireVenue, requireRole('owner'), (req, res) => {
  const target = get('SELECT * FROM users WHERE id = ? AND venue_id = ?', Number(req.params.id), req.venue.id);
  if (!target) return bad(res, 'Usuario no encontrado.', 404);
  if (target.role === 'owner') return bad(res, 'No se puede eliminar al propietario.');
  run('DELETE FROM users WHERE id = ?', target.id);
  audit(req.venue.id, req.user.id, 'team.deleted', 'user', target.id);
  ok(res);
});

export { publicVenue };

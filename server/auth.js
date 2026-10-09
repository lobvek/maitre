// Autenticación propia: scrypt + sesiones en BD con cookie httpOnly.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, run, insert, update } from './db.js';
import { token, addDays } from './utils.js';

const COOKIE = 'maitre_sid';
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const calc = scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return calc.length === known.length && timingSafeEqual(calc, known);
}

export function createSession(res, user, userAgent = '') {
  const t = token(24);
  insert('sessions', {
    token: t,
    user_id: user.id,
    expires_at: addDays(SESSION_DAYS),
    user_agent: String(userAgent).slice(0, 200),
  });
  update('users', user.id, { last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  res.cookie(COOKIE, t, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86400000,
    secure: process.env.NODE_ENV === 'production',
  });
  return t;
}

export function destroySession(req, res) {
  const t = req.cookies?.[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token = ?', t);
  res.clearCookie(COOKIE);
}

/** Carga req.user y req.venue si hay sesión válida. Nunca bloquea. */
export function loadUser(req, _res, next) {
  const t = req.cookies?.[COOKIE];
  if (t) {
    const row = get(
      `SELECT u.*, s.expires_at, s.active_venue_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`, t);
    if (row) {
      const { password_hash, expires_at, active_venue_id, ...user } = row;
      req.user = user;
      req.sessionToken = t;
      // Quien manda en un grupo de locales puede estar mirando cualquiera de ellos.
      // El local activo vive en la sesión; si no cuadra, se cae al local de casa.
      if (user.group_id && active_venue_id) {
        req.venue = get('SELECT * FROM venues WHERE id = ? AND group_id = ?', active_venue_id, user.group_id);
      }
      if (!req.venue && user.venue_id) req.venue = get('SELECT * FROM venues WHERE id = ?', user.venue_id);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: 'Inicia sesión para continuar.' });
  next();
}

const RANK = { staff: 1, manager: 2, owner: 3, superadmin: 4 };

/** requireRole('manager') deja pasar a manager, owner y superadmin. */
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if ((RANK[req.user.role] || 0) < (RANK[minRole] || 99)) {
      return res.status(403).json({ error: 'forbidden', message: 'Tu rol no permite esta acción.' });
    }
    next();
  };
}

export function requireVenue(req, res, next) {
  if (!req.venue) return res.status(400).json({ error: 'no_venue', message: 'Esta cuenta no tiene local asignado.' });
  if (req.venue.status === 'suspended') {
    return res.status(423).json({ error: 'suspended', message: 'Local suspendido. Contacta con Maitre.' });
  }
  next();
}

export const requireSuperadmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'forbidden' });
  next();
};

/** Parser de cookies minimalista (evita una dependencia más). */
export function cookieParser(req, res, next) {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
}

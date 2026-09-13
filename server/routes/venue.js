// Ajustes del local: marca, idiomas, impuestos, funciones activadas, subida de logo.
import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get, update, audit, all } from '../db.js';
import { UPLOAD_DIR } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { publicVenue } from './auth.js';
import { bad, ok, token, ALLERGENS, TAGS } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireVenue);

router.get('/', (req, res) => res.json(publicVenue(get('SELECT * FROM venues WHERE id = ?', req.venue.id))));

const EDITABLE = [
  'name', 'legal_name', 'nif', 'address', 'city', 'phone', 'email', 'brand_color',
  'currency', 'locale', 'timezone', 'wifi_ssid', 'wifi_password', 'service_note',
];

router.patch('/', requireRole('manager'), (req, res) => {
  const patch = {};
  for (const key of EDITABLE) if (req.body[key] !== undefined) patch[key] = String(req.body[key]).slice(0, 200);
  if (req.body.tax_rate !== undefined) {
    const t = Math.round(Number(req.body.tax_rate) * 100);
    if (!Number.isFinite(t) || t < 0 || t > 5000) return bad(res, 'IVA fuera de rango (0-50%).');
    patch.tax_rate = t;
  }
  if (req.body.prices_include_tax !== undefined) patch.prices_include_tax = req.body.prices_include_tax ? 1 : 0;
  if (req.body.languages !== undefined) {
    const langs = (Array.isArray(req.body.languages) ? req.body.languages : ['es'])
      .filter((l) => ['es', 'ca', 'en', 'fr', 'de'].includes(l));
    patch.languages = JSON.stringify(langs.length ? langs : ['es']);
  }
  if (req.body.features !== undefined) {
    const current = JSON.parse(req.venue.features || '{}');
    patch.features = JSON.stringify({ ...current, ...req.body.features });
  }
  if (req.body.payment_mode !== undefined) {
    if (!['venue', 'online_optional', 'online_required'].includes(req.body.payment_mode)) {
      return bad(res, 'Modo de cobro no válido.');
    }
    patch.payment_mode = req.body.payment_mode;
  }
  if (req.body.payment_account !== undefined) patch.payment_account = String(req.body.payment_account).slice(0, 80);
  if (req.body.order_gate !== undefined) {
    if (!['open', 'occupied', 'code'].includes(req.body.order_gate)) return bad(res, 'Modo de acceso no válido.');
    patch.order_gate = req.body.order_gate;
    if (req.body.order_gate === 'code' && !req.venue.order_code) patch.order_code = newShiftCode();
  }
  if (req.body.telegram_chat_id !== undefined) patch.telegram_chat_id = String(req.body.telegram_chat_id).trim().slice(0, 40);
  if (req.body.webhook_url !== undefined) {
    const url = String(req.body.webhook_url).trim();
    if (url && !/^https?:\/\//i.test(url)) return bad(res, 'La URL del webhook debe empezar por http:// o https://');
    patch.webhook_url = url.slice(0, 300);
    if (url && !req.venue.webhook_secret) patch.webhook_secret = token(16);
  }
  if (req.body.onboarding_step !== undefined) patch.onboarding_step = Number(req.body.onboarding_step) || 0;
  if (req.body.brand_color && !/^#[0-9a-fA-F]{6}$/.test(req.body.brand_color)) return bad(res, 'Color no válido.');
  update('venues', req.venue.id, patch);
  audit(req.venue.id, req.user.id, 'venue.updated', 'venue', req.venue.id, Object.keys(patch));
  res.json(publicVenue(get('SELECT * FROM venues WHERE id = ?', req.venue.id)));
});

/** POST /api/venue/logo — cuerpo binario crudo (sin multipart, sin dependencias). */
router.post('/logo', requireRole('manager'), (req, res) => {
  const type = req.headers['content-type'] || '';
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type.split(';')[0]];
  if (!ext) return bad(res, 'Formato no admitido. Usa PNG, JPG, WEBP o SVG.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Archivo vacío.');
  if (req.body.length > 2_000_000) return bad(res, 'El logo no puede superar 2 MB.');
  const filename = `logo-${req.venue.id}-${token(4)}.${ext}`;
  writeFileSync(resolve(UPLOAD_DIR, filename), req.body);
  update('venues', req.venue.id, { logo_path: `/uploads/${filename}` });
  audit(req.venue.id, req.user.id, 'venue.logo_updated');
  res.json({ logo_path: `/uploads/${filename}` });
});

router.delete('/logo', requireRole('manager'), (req, res) => {
  update('venues', req.venue.id, { logo_path: null });
  ok(res);
});

/** Código del turno para pedir desde la mesa: corto, fácil de cantar en voz alta. */
function newShiftCode() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return letras[Math.floor(Math.random() * letras.length)] + String(Math.floor(100 + Math.random() * 900));
}

/** POST /api/venue/order-code — renueva el código (cambio de turno, código filtrado…). */
router.post('/order-code', requireRole('staff'), (req, res) => {
  const code = newShiftCode();
  update('venues', req.venue.id, { order_code: code });
  audit(req.venue.id, req.user.id, 'venue.order_code_rotated');
  res.json({ order_code: code });
});

/** Catálogos fijos que usa el front (alérgenos UE y etiquetas). */
router.get('/catalog', (_req, res) => res.json({ allergens: ALLERGENS, tags: TAGS }));

router.get('/audit', requireRole('manager'), (req, res) => {
  res.json(all(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.venue_id = ? ORDER BY a.id DESC LIMIT 200`, req.venue.id));
});

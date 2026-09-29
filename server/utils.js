import { randomBytes, randomUUID } from 'node:crypto';

export const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export function addDays(days, from = new Date()) {
  const d = new Date(from.getTime() + days * 86400000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export const token = (bytes = 9) => randomBytes(bytes).toString('base64url');
export const uuid = () => randomUUID();

export function slugify(str, fallback = 'local') {
  const s = String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || fallback;
}

/** Texto i18n: acepta JSON {"es":"..."} o texto plano heredado. */
export function i18n(value, lang = 'es', fallback = 'es') {
  if (value == null) return '';
  if (typeof value === 'object') return value[lang] || value[fallback] || Object.values(value)[0] || '';
  const s = String(value);
  if (s.startsWith('{')) {
    try { return i18n(JSON.parse(s), lang, fallback); } catch { return s; }
  }
  return s;
}

export function parseJson(value, def) {
  if (value == null) return def;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return def; }
}

/** Normaliza un campo i18n de entrada a JSON string. */
export function toI18n(value, lang = 'es') {
  if (value == null) return JSON.stringify({});
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (s.startsWith('{')) { try { return JSON.stringify(JSON.parse(s)); } catch { /* texto */ } }
  return JSON.stringify({ [lang]: s });
}

export const cents = (v) => Math.round(Number(v) * 100) || 0;
export const euros = (c) => (Number(c || 0) / 100).toFixed(2);

export function money(c, currency = 'EUR', locale = 'es-ES') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(c || 0) / 100);
}

/** Código corto y legible para el ticket: A-7F3 */
export function orderCode(seq) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return `${letters[seq % letters.length]}${String(seq).padStart(3, '0')}`;
}

/**
 * Los 14 alérgenos de declaración obligatoria en la UE. Se muestran como
 * etiqueta de texto con su abreviatura: más legible y más serio que un emoji.
 */
export const ALLERGENS = [
  { id: 'gluten', label: 'Gluten', short: 'GLU' },
  { id: 'crustaceans', label: 'Crustáceos', short: 'CRU' },
  { id: 'eggs', label: 'Huevos', short: 'HUE' },
  { id: 'fish', label: 'Pescado', short: 'PES' },
  { id: 'peanuts', label: 'Cacahuetes', short: 'CAC' },
  { id: 'soy', label: 'Soja', short: 'SOJ' },
  { id: 'milk', label: 'Lácteos', short: 'LAC' },
  { id: 'nuts', label: 'Frutos de cáscara', short: 'FRU' },
  { id: 'celery', label: 'Apio', short: 'API' },
  { id: 'mustard', label: 'Mostaza', short: 'MOS' },
  { id: 'sesame', label: 'Sésamo', short: 'SES' },
  { id: 'sulphites', label: 'Sulfitos', short: 'SUL' },
  { id: 'lupin', label: 'Altramuces', short: 'ALT' },
  { id: 'molluscs', label: 'Moluscos', short: 'MOL' },
];

/** Etiquetas de dieta. `icon` es el nombre de un icono del juego propio. */
export const TAGS = [
  { id: 'vegetarian', label: 'Vegetariano', icon: 'leaf' },
  { id: 'vegan', label: 'Vegano', icon: 'leaf' },
  { id: 'gluten_free', label: 'Sin gluten', icon: 'wheat' },
  { id: 'spicy', label: 'Picante', icon: 'flame' },
  { id: 'house', label: 'De la casa', icon: 'star' },
  { id: 'new', label: 'Novedad', icon: 'sparkle' },
];

export function ok(res, data) { return res.json(data ?? { ok: true }); }
export function bad(res, message, code = 400, extra = {}) {
  return res.status(code).json({ error: 'bad_request', message, ...extra });
}

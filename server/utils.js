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
/** Idiomas en los que servimos la carta del comensal. */
export const IDIOMAS_CARTA = ['es', 'ca', 'en', 'fr', 'de', 'it'];

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

/*
 * Los catorce alérgenos y las etiquetas de dieta, en los idiomas que servimos.
 * Es obligación legal informar de los alérgenos, así que esto no puede quedarse
 * en castellano cuando el comensal está leyendo la carta en alemán.
 * Las siglas cortas también cambian: GLU en español, GLU en inglés, pero LAC/MILK sí.
 */
const CATALOGO = {
  ca: {
    a: { gluten: ['Gluten', 'GLU'], crustaceans: ['Crustacis', 'CRU'], eggs: ['Ous', 'OUS'], fish: ['Peix', 'PEI'],
      peanuts: ['Cacauets', 'CAC'], soy: ['Soja', 'SOJ'], milk: ['Lactis', 'LAC'], nuts: ['Fruits de closca', 'FRU'],
      celery: ['Api', 'API'], mustard: ['Mostassa', 'MOS'], sesame: ['Sèsam', 'SES'], sulphites: ['Sulfits', 'SUL'],
      lupin: ['Tramussos', 'TRA'], molluscs: ['Mol·luscs', 'MOL'] },
    t: { vegetarian: 'Vegetarià', vegan: 'Vegà', gluten_free: 'Sense gluten', spicy: 'Picant', house: 'De la casa', new: 'Novetat' },
  },
  en: {
    a: { gluten: ['Gluten', 'GLU'], crustaceans: ['Crustaceans', 'CRU'], eggs: ['Eggs', 'EGG'], fish: ['Fish', 'FSH'],
      peanuts: ['Peanuts', 'PNT'], soy: ['Soy', 'SOY'], milk: ['Milk', 'MLK'], nuts: ['Tree nuts', 'NUT'],
      celery: ['Celery', 'CEL'], mustard: ['Mustard', 'MUS'], sesame: ['Sesame', 'SES'], sulphites: ['Sulphites', 'SUL'],
      lupin: ['Lupin', 'LUP'], molluscs: ['Molluscs', 'MOL'] },
    t: { vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten free', spicy: 'Spicy', house: 'House special', new: 'New' },
  },
  fr: {
    a: { gluten: ['Gluten', 'GLU'], crustaceans: ['Crustacés', 'CRU'], eggs: ['Œufs', 'OEU'], fish: ['Poisson', 'POI'],
      peanuts: ['Arachides', 'ARA'], soy: ['Soja', 'SOJ'], milk: ['Lait', 'LAI'], nuts: ['Fruits à coque', 'FRC'],
      celery: ['Céleri', 'CEL'], mustard: ['Moutarde', 'MOU'], sesame: ['Sésame', 'SES'], sulphites: ['Sulfites', 'SUL'],
      lupin: ['Lupin', 'LUP'], molluscs: ['Mollusques', 'MOL'] },
    t: { vegetarian: 'Végétarien', vegan: 'Végan', gluten_free: 'Sans gluten', spicy: 'Épicé', house: 'Spécialité maison', new: 'Nouveauté' },
  },
  de: {
    a: { gluten: ['Gluten', 'GLU'], crustaceans: ['Krebstiere', 'KRE'], eggs: ['Eier', 'EIE'], fish: ['Fisch', 'FIS'],
      peanuts: ['Erdnüsse', 'ERD'], soy: ['Soja', 'SOJ'], milk: ['Milch', 'MIL'], nuts: ['Schalenfrüchte', 'SCH'],
      celery: ['Sellerie', 'SEL'], mustard: ['Senf', 'SEN'], sesame: ['Sesam', 'SES'], sulphites: ['Sulfite', 'SUL'],
      lupin: ['Lupinen', 'LUP'], molluscs: ['Weichtiere', 'WEI'] },
    t: { vegetarian: 'Vegetarisch', vegan: 'Vegan', gluten_free: 'Glutenfrei', spicy: 'Scharf', house: 'Hausspezialität', new: 'Neu' },
  },
  it: {
    a: { gluten: ['Glutine', 'GLU'], crustaceans: ['Crostacei', 'CRO'], eggs: ['Uova', 'UOV'], fish: ['Pesce', 'PES'],
      peanuts: ['Arachidi', 'ARA'], soy: ['Soia', 'SOI'], milk: ['Latte', 'LAT'], nuts: ['Frutta a guscio', 'FRU'],
      celery: ['Sedano', 'SED'], mustard: ['Senape', 'SEN'], sesame: ['Sesamo', 'SES'], sulphites: ['Solfiti', 'SOL'],
      lupin: ['Lupini', 'LUP'], molluscs: ['Molluschi', 'MOL'] },
    t: { vegetarian: 'Vegetariano', vegan: 'Vegano', gluten_free: 'Senza glutine', spicy: 'Piccante', house: 'Della casa', new: 'Novità' },
  },
};

/** Los alérgenos en el idioma del comensal. Informar de esto es obligación legal. */
export function allergensIn(lang = 'es') {
  const dic = CATALOGO[lang]?.a;
  if (!dic) return ALLERGENS;
  return ALLERGENS.map((a) => ({ ...a, label: dic[a.id]?.[0] || a.label, short: dic[a.id]?.[1] || a.short }));
}

/** Las etiquetas de dieta en el idioma del comensal. */
export function tagsIn(lang = 'es') {
  const dic = CATALOGO[lang]?.t;
  if (!dic) return TAGS;
  return TAGS.map((x) => ({ ...x, label: dic[x.id] || x.label }));
}

export function ok(res, data) { return res.json(data ?? { ok: true }); }
export function bad(res, message, code = 400, extra = {}) {
  return res.status(code).json({ error: 'bad_request', message, ...extra });
}

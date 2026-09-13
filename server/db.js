// Capa de datos de Maitre. SQLite integrado en Node (node:sqlite), sin dependencias nativas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');
export const DATA_DIR = process.env.MAITRE_DATA_DIR || resolve(ROOT, 'data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT DEFAULT '',
  nif TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  logo_path TEXT,
  brand_color TEXT DEFAULT '#8a5a2b',
  currency TEXT DEFAULT 'EUR',
  locale TEXT DEFAULT 'es',
  languages TEXT DEFAULT '["es"]',
  timezone TEXT DEFAULT 'Europe/Madrid',
  tax_rate INTEGER DEFAULT 1000,            -- por diez mil: 1000 = 10%
  prices_include_tax INTEGER DEFAULT 1,
  wifi_ssid TEXT DEFAULT '',
  wifi_password TEXT DEFAULT '',
  service_note TEXT DEFAULT '',
  features TEXT DEFAULT '{}',               -- toggles del local (aviso al personal, pedidos...)
  payment_mode TEXT NOT NULL DEFAULT 'venue', -- venue | online_optional | online_required
  payment_account TEXT DEFAULT '',           -- id de la cuenta del local en la pasarela
  order_gate TEXT NOT NULL DEFAULT 'open',   -- open | occupied | code (quién puede pedir)
  order_code TEXT DEFAULT '',                -- código de turno cuando order_gate = 'code'
  webhook_url TEXT DEFAULT '',               -- integración con TPV / middleware
  webhook_secret TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'trial',       -- trial | mesa | servicio | conectado | founders | paused
  plan_since TEXT,
  plan_until TEXT,                          -- fin de la oferta Fundadores
  pilot TEXT DEFAULT '{}',                  -- diseño del piloto: objetivo, baseline, fechas, depósito
  trial_ends_at TEXT,
  is_pilot INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended | churned
  onboarding_step INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'owner',       -- superadmin | owner | manager | staff
  pin TEXT,                                 -- acceso rápido en sala
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  seats INTEGER DEFAULT 2,
  token TEXT NOT NULL UNIQUE,
  nfc_uid TEXT,
  status TEXT NOT NULL DEFAULT 'free',      -- free | occupied | reserved | cleaning
  status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  merged_into INTEGER REFERENCES tables(id) ON DELETE SET NULL,  -- mesas unidas: cuenta conjunta
  qr_code TEXT UNIQUE,                      -- código permanente grabado en la madera (/q/:code)
  lot TEXT DEFAULT '',                      -- lote de fabricación de la cuña
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                       -- JSON i18n {"es":"...","ca":"..."}
  description TEXT DEFAULT '{}',
  sort INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  available_from TEXT,                      -- "08:00"
  available_to TEXT,                        -- "12:30"
  days TEXT DEFAULT '[0,1,2,3,4,5,6]',
  station TEXT DEFAULT ''                   -- barra | cocina | '' (sin separar)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                       -- JSON i18n
  description TEXT DEFAULT '{}',            -- JSON i18n
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  tax_rate INTEGER,                         -- null = hereda del local
  image_path TEXT,
  allergens TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',                   -- vegan, vegetarian, spicy, gluten_free, house, new
  kcal INTEGER,
  sku TEXT DEFAULT '',
  suggests TEXT DEFAULT '[]',               -- ids de productos que se sugieren con este (upselling)
  available INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS option_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',       -- new|accepted|preparing|served|paid|cancelled
  channel TEXT NOT NULL DEFAULT 'qr',       -- qr | staff
  guest_name TEXT DEFAULT '',
  note TEXT DEFAULT '',
  session_id TEXT DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,                      -- cash | card | app
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | pending | paid | failed
  payment_ref TEXT DEFAULT '',              -- referencia de la pasarela
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  served_at TEXT,
  closed_at TEXT,
  cancelled_reason TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  station TEXT DEFAULT '',                  -- copia de la categoría: barra o cocina
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  options TEXT DEFAULT '[]',                -- snapshot [{name, price_delta_cents}]
  note TEXT DEFAULT '',
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'    -- pending | served | void
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'waiter',      -- waiter | bill | water | help
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',      -- open | done
  session_id TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  session_id TEXT DEFAULT '',
  source TEXT DEFAULT 'qr',                 -- qr | nfc | link
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS billing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                       -- trial_started | plan_changed | invoice | cancelled
  plan TEXT,
  amount_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  status TEXT DEFAULT 'paid',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  session_id TEXT DEFAULT '',
  rating INTEGER NOT NULL,                  -- 1..5
  comment TEXT DEFAULT '',
  email TEXT DEFAULT '',                    -- solo si el cliente acepta el opt-in
  optin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  venue_name TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  tables INTEGER DEFAULT 0,
  plan_interest TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',       -- new | contacted | pilot | won | lost
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_venue ON items(venue_id, category_id);
CREATE INDEX IF NOT EXISTS idx_orders_venue ON orders(venue_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_calls_venue ON calls(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_tables_venue ON tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_scans_venue ON scans(venue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id, created_at);
`;

/** Columnas añadidas después de la primera versión. Se aplican si faltan. */
const MIGRATIONS = [
  ['venues', 'payment_mode', "TEXT NOT NULL DEFAULT 'venue'"],
  ['venues', 'payment_account', "TEXT DEFAULT ''"],
  ['orders', 'payment_status', "TEXT NOT NULL DEFAULT 'unpaid'"],
  ['orders', 'payment_ref', "TEXT DEFAULT ''"],
  ['venues', 'order_gate', "TEXT NOT NULL DEFAULT 'open'"],
  ['venues', 'order_code', "TEXT DEFAULT ''"],
  ['venues', 'webhook_url', "TEXT DEFAULT ''"],
  ['venues', 'webhook_secret', "TEXT DEFAULT ''"],
  ['categories', 'station', "TEXT DEFAULT ''"],
  ['tables', 'merged_into', 'INTEGER'],
  ['order_items', 'station', "TEXT DEFAULT ''"],
  ['venues', 'plan_until', 'TEXT'],
  ['venues', 'pilot', "TEXT DEFAULT '{}'"],
  ['tables', 'qr_code', 'TEXT'],
  ['tables', 'lot', "TEXT DEFAULT ''"],
  ['items', 'suggests', "TEXT DEFAULT '[]'"],
];

function migrate(database) {
  for (const [table, column, type] of MIGRATIONS) {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  // Los pedidos anteriores al cobro online se cerraron cobrando en el local.
  database.exec(`UPDATE orders SET payment_status = 'paid' WHERE status = 'paid' AND payment_status != 'paid'`);
  // Planes de la primera hipótesis de precios → arquitectura del estudio competitivo.
  database.exec(`UPDATE venues SET plan = 'mesa' WHERE plan = 'basic'`);
  database.exec(`UPDATE venues SET plan = 'servicio' WHERE plan = 'pro'`);
  // Cada mesa recibe un código permanente para la madera.
  const sinCodigo = database.prepare('SELECT id FROM tables WHERE qr_code IS NULL').all();
  const upd = database.prepare('UPDATE tables SET qr_code = ? WHERE id = ?');
  for (const t of sinCodigo) upd.run(makeQrCode(), t.id);
}

/** Código corto y legible para grabar: 6 caracteres sin ambigüedades (sin 0/O, 1/I). */
export function makeQrCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

let db;

export function getDb() {
  if (db) return db;
  const file = process.env.MAITRE_DB || resolve(DATA_DIR, 'maitre.db');
  if (file !== ':memory:') {
    mkdirSync(DATA_DIR, { recursive: true });
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Cierra y olvida la conexión (usado por los tests). */
export function closeDb() {
  if (db) { db.close(); db = undefined; }
}

// --- Helpers de consulta -----------------------------------------------------
export const all = (sql, ...params) => getDb().prepare(sql).all(...params);
export const get = (sql, ...params) => getDb().prepare(sql).get(...params);
export const run = (sql, ...params) => getDb().prepare(sql).run(...params);

/** INSERT desde un objeto plano. Devuelve el id nuevo. */
export function insert(table, data) {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const res = getDb().prepare(sql).run(...keys.map((k) => data[k]));
  return Number(res.lastInsertRowid);
}

/** UPDATE parcial por id. Ignora claves undefined. */
export function update(table, id, data, extraWhere = '', ...extraParams) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (!entries.length) return 0;
  const sql = `UPDATE ${table} SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=?${extraWhere ? ' AND ' + extraWhere : ''}`;
  const res = getDb().prepare(sql).run(...entries.map(([, v]) => v), id, ...extraParams);
  return Number(res.changes);
}

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function audit(venueId, userId, action, entity = '', entityId = '', meta = {}) {
  insert('audit_log', {
    venue_id: venueId ?? null,
    user_id: userId ?? null,
    action,
    entity,
    entity_id: String(entityId),
    meta: JSON.stringify(meta),
  });
}

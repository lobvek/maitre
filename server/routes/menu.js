// Gestor de carta: categorías, productos, grupos de opciones, import/export CSV.
import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { all, get, insert, update, run, audit, tx, UPLOAD_DIR } from '../db.js';
import { requireAuth, requireRole, requireVenue } from '../auth.js';
import { requireFeature } from '../plans.js';
import { bad, ok, toI18n, i18n, parseJson, token, cents, euros } from '../utils.js';

export const router = Router();
router.use(requireAuth, requireVenue);

const owns = (table, id, venueId) => get(`SELECT * FROM ${table} WHERE id = ? AND venue_id = ?`, Number(id), venueId);

// --- Categorías --------------------------------------------------------------
router.get('/categories', (req, res) => {
  res.json(all('SELECT * FROM categories WHERE venue_id = ? ORDER BY sort, id', req.venue.id)
    .map((c) => ({ ...c, name: parseJson(c.name, {}), description: parseJson(c.description, {}), days: parseJson(c.days, [0, 1, 2, 3, 4, 5, 6]) })));
});

const hasText = (v) => typeof v === 'string' ? v.trim() !== '' : !!v && Object.values(v).some((x) => String(x).trim());

router.post('/categories', requireRole('manager'), (req, res) => {
  if (!hasText(req.body.name)) return bad(res, 'La categoría necesita un nombre.');
  const max = get('SELECT COALESCE(MAX(sort), 0) AS m FROM categories WHERE venue_id = ?', req.venue.id).m;
  const id = insert('categories', {
    venue_id: req.venue.id,
    name: toI18n(req.body.name, req.venue.locale),
    description: toI18n(req.body.description ?? '', req.venue.locale),
    sort: max + 1,
    available_from: req.body.available_from || null,
    available_to: req.body.available_to || null,
    days: JSON.stringify(req.body.days || [0, 1, 2, 3, 4, 5, 6]),
    station: ['barra', 'cocina'].includes(req.body.station) ? req.body.station : '',
  });
  audit(req.venue.id, req.user.id, 'menu.category_created', 'category', id);
  res.status(201).json(get('SELECT * FROM categories WHERE id = ?', id));
});

router.patch('/categories/:id', requireRole('manager'), (req, res) => {
  const cat = owns('categories', req.params.id, req.venue.id);
  if (!cat) return bad(res, 'Categoría no encontrada.', 404);
  const patch = {};
  if (req.body.name !== undefined) patch.name = toI18n(req.body.name, req.venue.locale);
  if (req.body.description !== undefined) patch.description = toI18n(req.body.description, req.venue.locale);
  if (req.body.active !== undefined) patch.active = req.body.active ? 1 : 0;
  if (req.body.sort !== undefined) patch.sort = Number(req.body.sort) || 0;
  if (req.body.available_from !== undefined) patch.available_from = req.body.available_from || null;
  if (req.body.available_to !== undefined) patch.available_to = req.body.available_to || null;
  if (req.body.days !== undefined) patch.days = JSON.stringify(req.body.days);
  if (req.body.station !== undefined) {
    patch.station = ['barra', 'cocina'].includes(req.body.station) ? req.body.station : '';
  }
  update('categories', cat.id, patch);
  res.json(get('SELECT * FROM categories WHERE id = ?', cat.id));
});

router.delete('/categories/:id', requireRole('manager'), (req, res) => {
  const cat = owns('categories', req.params.id, req.venue.id);
  if (!cat) return bad(res, 'Categoría no encontrada.', 404);
  const items = get('SELECT COUNT(*) AS n FROM items WHERE category_id = ?', cat.id).n;
  if (items && !req.query.force) return bad(res, `La categoría tiene ${items} productos. Muévelos o usa force=1.`, 409, { items });
  run('DELETE FROM items WHERE category_id = ?', cat.id);
  run('DELETE FROM categories WHERE id = ?', cat.id);
  audit(req.venue.id, req.user.id, 'menu.category_deleted', 'category', cat.id);
  ok(res);
});

/** POST /api/menu/categories/reorder — [{id, sort}] */
router.post('/categories/reorder', requireRole('manager'), (req, res) => {
  const list = Array.isArray(req.body.order) ? req.body.order : [];
  tx(() => list.forEach((row, idx) => run('UPDATE categories SET sort = ? WHERE id = ? AND venue_id = ?',
    Number(row.sort ?? idx), Number(row.id), req.venue.id)));
  ok(res);
});

// --- Productos ---------------------------------------------------------------
const hydrateItem = (it) => ({
  ...it,
  name: parseJson(it.name, {}),
  description: parseJson(it.description, {}),
  allergens: parseJson(it.allergens, []),
  tags: parseJson(it.tags, []),
  suggests: parseJson(it.suggests, []),
  option_groups: all('SELECT * FROM option_groups WHERE item_id = ? ORDER BY sort, id', it.id)
    .map((g) => ({ ...g, options: all('SELECT * FROM options WHERE group_id = ? ORDER BY sort, id', g.id) })),
});

router.get('/items', (req, res) => {
  const where = req.query.category ? ' AND category_id = ?' : '';
  const params = req.query.category ? [req.venue.id, Number(req.query.category)] : [req.venue.id];
  res.json(all(`SELECT * FROM items WHERE venue_id = ?${where} ORDER BY sort, id`, ...params).map(hydrateItem));
});

router.get('/items/:id', (req, res) => {
  const it = owns('items', req.params.id, req.venue.id);
  if (!it) return bad(res, 'Producto no encontrado.', 404);
  res.json(hydrateItem(it));
});

function itemPatch(body, venue) {
  const patch = {};
  if (body.name !== undefined) patch.name = toI18n(body.name, venue.locale);
  if (body.description !== undefined) patch.description = toI18n(body.description, venue.locale);
  if (body.price !== undefined) patch.price_cents = cents(body.price);
  if (body.price_cents !== undefined) patch.price_cents = Math.round(Number(body.price_cents)) || 0;
  if (body.cost !== undefined) patch.cost_cents = cents(body.cost);
  if (body.tax_rate !== undefined) patch.tax_rate = body.tax_rate === null ? null : Math.round(Number(body.tax_rate) * 100);
  if (body.category_id !== undefined) patch.category_id = Number(body.category_id) || null;
  if (body.allergens !== undefined) patch.allergens = JSON.stringify(body.allergens || []);
  if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags || []);
  if (body.suggests !== undefined) {
    patch.suggests = JSON.stringify((Array.isArray(body.suggests) ? body.suggests : []).map(Number).filter(Boolean).slice(0, 4));
  }
  if (body.kcal !== undefined) patch.kcal = body.kcal === null || body.kcal === '' ? null : Number(body.kcal);
  if (body.sku !== undefined) patch.sku = String(body.sku).slice(0, 40);
  if (body.available !== undefined) patch.available = body.available ? 1 : 0;
  if (body.active !== undefined) patch.active = body.active ? 1 : 0;
  if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
  return patch;
}

router.post('/items', requireRole('manager'), (req, res) => {
  if (!hasText(req.body.name)) return bad(res, 'El producto necesita un nombre.');
  const max = get('SELECT COALESCE(MAX(sort), 0) AS m FROM items WHERE venue_id = ?', req.venue.id).m;
  const id = insert('items', { venue_id: req.venue.id, sort: max + 1, ...itemPatch(req.body, req.venue) });
  audit(req.venue.id, req.user.id, 'menu.item_created', 'item', id);
  res.status(201).json(hydrateItem(get('SELECT * FROM items WHERE id = ?', id)));
});

router.patch('/items/:id', requireRole('staff'), (req, res) => {
  const it = owns('items', req.params.id, req.venue.id);
  if (!it) return bad(res, 'Producto no encontrado.', 404);
  // El personal de sala solo puede marcar agotados; el resto exige manager.
  const patch = itemPatch(req.body, req.venue);
  if (req.user.role === 'staff') {
    const allowed = { available: patch.available };
    if (allowed.available === undefined) return bad(res, 'Tu rol solo puede marcar disponibilidad.', 403);
    update('items', it.id, allowed);
  } else {
    update('items', it.id, patch);
  }
  res.json(hydrateItem(get('SELECT * FROM items WHERE id = ?', it.id)));
});

router.delete('/items/:id', requireRole('manager'), (req, res) => {
  const it = owns('items', req.params.id, req.venue.id);
  if (!it) return bad(res, 'Producto no encontrado.', 404);
  run('DELETE FROM items WHERE id = ?', it.id);
  audit(req.venue.id, req.user.id, 'menu.item_deleted', 'item', it.id);
  ok(res);
});

router.post('/items/reorder', requireRole('manager'), (req, res) => {
  const list = Array.isArray(req.body.order) ? req.body.order : [];
  tx(() => list.forEach((row, idx) => run('UPDATE items SET sort = ?, category_id = COALESCE(?, category_id) WHERE id = ? AND venue_id = ?',
    Number(row.sort ?? idx), row.category_id ?? null, Number(row.id), req.venue.id)));
  ok(res);
});

/** Foto del producto (binario crudo). */
router.post('/items/:id/image', requireRole('manager'), (req, res) => {
  const it = owns('items', req.params.id, req.venue.id);
  if (!it) return bad(res, 'Producto no encontrado.', 404);
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[(req.headers['content-type'] || '').split(';')[0]];
  if (!ext) return bad(res, 'Usa PNG, JPG o WEBP.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Archivo vacío.');
  if (req.body.length > 3_000_000) return bad(res, 'La imagen no puede superar 3 MB.');
  const filename = `item-${it.id}-${token(4)}.${ext}`;
  writeFileSync(resolve(UPLOAD_DIR, filename), req.body);
  update('items', it.id, { image_path: `/uploads/${filename}` });
  res.json({ image_path: `/uploads/${filename}` });
});

// --- Grupos de opciones (Pro) ------------------------------------------------
router.post('/items/:id/groups', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const it = owns('items', req.params.id, req.venue.id);
  if (!it) return bad(res, 'Producto no encontrado.', 404);
  const id = insert('option_groups', {
    item_id: it.id,
    name: String(req.body.name || 'Opciones').slice(0, 60),
    min_select: Number(req.body.min_select) || 0,
    max_select: Number(req.body.max_select) || 1,
    sort: Number(req.body.sort) || 0,
  });
  res.status(201).json(get('SELECT * FROM option_groups WHERE id = ?', id));
});

const groupOfVenue = (groupId, venueId) => get(
  `SELECT g.* FROM option_groups g JOIN items i ON i.id = g.item_id WHERE g.id = ? AND i.venue_id = ?`,
  Number(groupId), venueId);

router.patch('/groups/:id', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const g = groupOfVenue(req.params.id, req.venue.id);
  if (!g) return bad(res, 'Grupo no encontrado.', 404);
  update('option_groups', g.id, {
    name: req.body.name !== undefined ? String(req.body.name) : undefined,
    min_select: req.body.min_select !== undefined ? Number(req.body.min_select) : undefined,
    max_select: req.body.max_select !== undefined ? Number(req.body.max_select) : undefined,
  });
  res.json(get('SELECT * FROM option_groups WHERE id = ?', g.id));
});

router.delete('/groups/:id', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const g = groupOfVenue(req.params.id, req.venue.id);
  if (!g) return bad(res, 'Grupo no encontrado.', 404);
  run('DELETE FROM option_groups WHERE id = ?', g.id);
  ok(res);
});

router.post('/groups/:id/options', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const g = groupOfVenue(req.params.id, req.venue.id);
  if (!g) return bad(res, 'Grupo no encontrado.', 404);
  const id = insert('options', {
    group_id: g.id,
    name: String(req.body.name || '').slice(0, 60) || 'Opción',
    price_delta_cents: req.body.price_delta !== undefined ? cents(req.body.price_delta) : Number(req.body.price_delta_cents) || 0,
    sort: Number(req.body.sort) || 0,
  });
  res.status(201).json(get('SELECT * FROM options WHERE id = ?', id));
});

router.patch('/options/:id', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const opt = get(`SELECT o.* FROM options o JOIN option_groups g ON g.id = o.group_id
                   JOIN items i ON i.id = g.item_id WHERE o.id = ? AND i.venue_id = ?`,
    Number(req.params.id), req.venue.id);
  if (!opt) return bad(res, 'Opción no encontrada.', 404);
  update('options', opt.id, {
    name: req.body.name !== undefined ? String(req.body.name) : undefined,
    price_delta_cents: req.body.price_delta !== undefined ? cents(req.body.price_delta) : undefined,
    available: req.body.available !== undefined ? (req.body.available ? 1 : 0) : undefined,
  });
  res.json(get('SELECT * FROM options WHERE id = ?', opt.id));
});

router.delete('/options/:id', requireRole('manager'), requireFeature('modifiers'), (req, res) => {
  const opt = get(`SELECT o.* FROM options o JOIN option_groups g ON g.id = o.group_id
                   JOIN items i ON i.id = g.item_id WHERE o.id = ? AND i.venue_id = ?`,
    Number(req.params.id), req.venue.id);
  if (!opt) return bad(res, 'Opción no encontrada.', 404);
  run('DELETE FROM options WHERE id = ?', opt.id);
  ok(res);
});

// --- Import / export CSV -----------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

/** POST /api/menu/import — CSV: categoria,producto,descripcion,precio,alergenos,etiquetas */
router.post('/import', requireRole('manager'), (req, res) => {
  const text = typeof req.body === 'string' ? req.body : (req.body?.csv || '');
  if (!text.trim()) return bad(res, 'CSV vacío.');
  const rows = parseCsv(text.trim());
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (...names) => header.findIndex((h) => names.includes(h));
  const cCat = idx('categoria', 'categoría', 'category');
  const cName = idx('producto', 'nombre', 'name', 'item');
  const cDesc = idx('descripcion', 'descripción', 'description');
  const cPrice = idx('precio', 'price');
  const cAll = idx('alergenos', 'alérgenos', 'allergens');
  const cTags = idx('etiquetas', 'tags');
  if (cName < 0 || cPrice < 0) return bad(res, 'El CSV necesita al menos las columnas "producto" y "precio".');

  const result = tx(() => {
    const cache = new Map();
    let created = 0, catsCreated = 0;
    for (const row of rows.slice(1)) {
      const catName = (cCat >= 0 ? row[cCat] : '').trim() || 'Carta';
      let catId = cache.get(catName.toLowerCase());
      if (!catId) {
        const existing = all('SELECT * FROM categories WHERE venue_id = ?', req.venue.id)
          .find((c) => i18n(c.name, req.venue.locale).toLowerCase() === catName.toLowerCase());
        if (existing) catId = existing.id;
        else {
          const max = get('SELECT COALESCE(MAX(sort),0) AS m FROM categories WHERE venue_id = ?', req.venue.id).m;
          catId = insert('categories', { venue_id: req.venue.id, name: toI18n(catName, req.venue.locale), sort: max + 1 });
          catsCreated++;
        }
        cache.set(catName.toLowerCase(), catId);
      }
      const name = (row[cName] || '').trim();
      if (!name) continue;
      const price = cents(String(row[cPrice] || '0').replace(',', '.').replace(/[^\d.]/g, ''));
      const max = get('SELECT COALESCE(MAX(sort),0) AS m FROM items WHERE venue_id = ?', req.venue.id).m;
      insert('items', {
        venue_id: req.venue.id, category_id: catId, name: toI18n(name, req.venue.locale),
        description: toI18n((cDesc >= 0 ? row[cDesc] : '').trim(), req.venue.locale),
        price_cents: price, sort: max + 1,
        allergens: JSON.stringify((cAll >= 0 ? row[cAll] : '').split(/[|,]/).map((s) => s.trim()).filter(Boolean)),
        tags: JSON.stringify((cTags >= 0 ? row[cTags] : '').split(/[|,]/).map((s) => s.trim()).filter(Boolean)),
      });
      created++;
    }
    return { created, catsCreated };
  });
  audit(req.venue.id, req.user.id, 'menu.imported', 'menu', '', result);
  res.json({ ...result, message: `${result.created} productos importados en ${result.catsCreated} categorías nuevas.` });
});

router.get('/export.csv', requireRole('manager'), (req, res) => {
  const lang = req.venue.locale;
  const rows = [['categoria', 'producto', 'descripcion', 'precio', 'alergenos', 'etiquetas', 'disponible']];
  for (const it of all(`SELECT i.*, c.name AS cat FROM items i LEFT JOIN categories c ON c.id = i.category_id
                        WHERE i.venue_id = ? ORDER BY c.sort, i.sort`, req.venue.id)) {
    rows.push([
      i18n(it.cat, lang), i18n(it.name, lang), i18n(it.description, lang), euros(it.price_cents),
      parseJson(it.allergens, []).join('|'), parseJson(it.tags, []).join('|'), it.available ? 'si' : 'no',
    ]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="carta-${req.venue.slug}.csv"`);
  res.send('﻿' + csv);
});

export { parseCsv };

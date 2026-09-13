// Datos de demostración: el operador de Maitre y dos locales piloto, como en el plan de empresa.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, all, get, insert, run, update, DATA_DIR, makeQrCode } from './db.js';
import { hashPassword } from './auth.js';
import { token, addDays, toI18n, orderCode } from './utils.js';
import { totals } from './orders-core.js';

const reset = process.argv.includes('--reset');
if (reset) {
  for (const f of ['maitre.db', 'maitre.db-wal', 'maitre.db-shm']) {
    try { rmSync(resolve(DATA_DIR, f)); } catch { /* no existía */ }
  }
}
const db = getDb();

const CARTA_ANCORA = [
  ['Para picar', [
    ['Pan con tomate', 'Pan de payés, tomate maduro y aceite de Siurana', 3.5, ['gluten'], ['vegetarian', 'house']],
    ['Bravas de la casa', 'Con salsa picante y alioli suave', 6.9, ['eggs'], ['vegetarian', 'spicy']],
    ['Croquetas de jamón (6 u.)', 'Hechas cada mañana', 8.5, ['gluten', 'milk', 'eggs'], ['house']],
    ['Anchoas del Cantábrico', '5 filetes 00 sobre cristal', 12.9, ['fish'], []],
    ['Hummus de remolacha', 'Con crudités y pan plano', 7.2, ['sesame', 'gluten'], ['vegan']],
  ]],
  ['Bocadillos', [
    ['Bikini trufado', 'Jamón, queso y trufa', 7.5, ['gluten', 'milk'], ['house']],
    ['Bocadillo de calamares', 'Con alioli de lima', 8.9, ['gluten', 'molluscs', 'eggs'], []],
    ['Vegetal de temporada', 'Escalivada, queso de cabra y rúcula', 7.9, ['gluten', 'milk'], ['vegetarian']],
  ]],
  ['Platos', [
    ['Arroz del senyoret', 'Mínimo 2 personas, precio por persona', 18.5, ['crustaceans', 'fish', 'molluscs'], ['house']],
    ['Entrecot a la brasa', 'Con patatas y pimientos de padrón', 21.0, [], []],
    ['Bacalao confitado', 'Con samfaina y aceite de romero', 17.5, ['fish'], []],
    ['Risotto de setas', 'Con parmesano curado 24 meses', 14.5, ['milk', 'sulphites'], ['vegetarian']],
  ]],
  ['Bebidas', [
    ['Caña Estrella', '25 cl', 2.6, ['gluten', 'sulphites'], []],
    ['Vermut de la casa', 'Con hielo, oliva y naranja', 3.9, ['sulphites'], ['house']],
    ['Copa de vino tinto', 'D.O. Montsant', 3.8, ['sulphites'], []],
    ['Agua mineral 50 cl', '', 2.2, [], ['vegan']],
    ['Refresco', 'Cola, naranja o limón', 2.8, [], []],
  ]],
  ['Cafés y postres', [
    ['Café solo', '', 1.6, [], ['vegan']],
    ['Cortado', '', 1.8, ['milk'], ['vegetarian']],
    ['Crema catalana', 'Quemada al momento', 5.5, ['milk', 'eggs'], ['vegetarian', 'house']],
    ['Coulant de chocolate', 'Con helado de vainilla', 6.5, ['milk', 'eggs', 'gluten'], ['vegetarian']],
  ]],
];

const CARTA_VITORIA = [
  ['Desayunos', [
    ['Tostada con aguacate', 'Pan de masa madre, huevo poché y sésamo', 7.5, ['gluten', 'eggs', 'sesame'], ['vegetarian']],
    ['Croissant a la plancha', 'Con mantequilla y mermelada', 3.2, ['gluten', 'milk'], ['vegetarian']],
    ['Bol de yogur y frutas', 'Granola casera', 5.9, ['milk', 'nuts'], ['vegetarian']],
  ]],
  ['Cafetería', [
    ['Flat white', '', 2.6, ['milk'], []],
    ['Café con leche', '', 1.9, ['milk'], []],
    ['Matcha latte', 'Con bebida de avena', 3.6, [], ['vegan']],
    ['Zumo de naranja natural', '', 3.2, [], ['vegan']],
  ]],
  ['Comidas', [
    ['Ensalada César', 'Pollo, parmesano y picatostes', 11.5, ['gluten', 'milk', 'eggs', 'fish'], []],
    ['Poke de salmón', 'Arroz, edamame, aguacate y mango', 13.9, ['fish', 'soy', 'sesame'], []],
    ['Menú del día', 'Primero, segundo, bebida y postre', 14.5, [], ['house']],
  ]],
];

function seedVenue({ slug, name, city, address, plan, isPilot, color, carta, tables, ownerEmail, ownerName, staff = [], pilot = {} }) {
  let venue = get('SELECT * FROM venues WHERE slug = ?', slug);
  if (venue) { console.log(`  · ${name} ya existía (id ${venue.id}), se omite`); return venue; }

  const venueId = insert('venues', {
    slug, name, city, address, legal_name: `${name} SCP`, nif: 'B0000000' + Math.floor(Math.random() * 9),
    email: ownerEmail, phone: '93 000 00 00', brand_color: color,
    plan, plan_since: addDays(-40), trial_ends_at: addDays(plan === 'trial' ? 18 : -5),
    is_pilot: isPilot ? 1 : 0, onboarding_step: 5,
    plan_until: plan === 'founders' ? addDays(24 * 30) : null,
    pilot: JSON.stringify(pilot),
    tax_rate: 1000, prices_include_tax: 1,
    languages: JSON.stringify(['es', 'ca', 'en']),
    features: JSON.stringify({ calls: true, orders: true, guest_name: true, notes: true }),
    wifi_ssid: `${slug}-wifi`, wifi_password: 'hola1234',
    service_note: 'Los pedidos llegan directamente a barra. Si necesitas algo, usa el botón de aviso.',
  });

  insert('users', {
    venue_id: venueId, email: ownerEmail, password_hash: hashPassword('maitre2026'),
    name: ownerName, role: 'owner',
  });
  for (const s of staff) {
    insert('users', {
      venue_id: venueId, email: s.email, password_hash: hashPassword('maitre2026'),
      name: s.name, role: s.role, pin: s.pin,
    });
  }

  const salaId = insert('zones', { venue_id: venueId, name: 'Sala', sort: 0 });
  const terrazaId = insert('zones', { venue_id: venueId, name: 'Terraza', sort: 1 });
  const tableIds = [];
  for (let i = 1; i <= tables; i++) {
    tableIds.push(insert('tables', {
      venue_id: venueId, zone_id: i > tables - 4 ? terrazaId : salaId,
      name: String(i), seats: i % 3 === 0 ? 4 : 2, token: token(6), sort: i,
      qr_code: makeQrCode(), lot: `L2609-${slug.slice(0, 3).toUpperCase()}`,
    }));
  }

  const itemIds = [];
    const BARRA = ['Bebidas', 'Cafés y postres', 'Cafetería'];
  carta.forEach(([catName, productos], ci) => {
    const catId = insert('categories', {
      venue_id: venueId, name: toI18n(catName), sort: ci,
      station: BARRA.includes(catName) ? 'barra' : 'cocina',
      ...(catName === 'Desayunos' ? { available_from: '07:30', available_to: '12:30' } : {}),
    });
    productos.forEach(([nombre, desc, precio, alergenos, tags], ii) => {
      itemIds.push(insert('items', {
        venue_id: venueId, category_id: catId,
        name: toI18n(nombre), description: toI18n(desc),
        price_cents: Math.round(precio * 100),
        cost_cents: Math.round(precio * 100 * (0.28 + Math.random() * 0.14)),
        allergens: JSON.stringify(alergenos), tags: JSON.stringify(tags),
        sort: ii, sku: `${slug.slice(0, 3).toUpperCase()}-${ci}${ii}`,
      }));
    });
  });

  // Un grupo de opciones de ejemplo en el primer café.
  const cafe = all('SELECT * FROM items WHERE venue_id = ?', venueId).find((i) => /caf|flat|latte/i.test(i.name));
  if (cafe) {
    const g = insert('option_groups', { item_id: cafe.id, name: 'Leche', min_select: 1, max_select: 1 });
    insert('options', { group_id: g, name: 'Entera', price_delta_cents: 0, sort: 0 });
    insert('options', { group_id: g, name: 'Sin lactosa', price_delta_cents: 0, sort: 1 });
    insert('options', { group_id: g, name: 'Avena', price_delta_cents: 30, sort: 2 });
    const g2 = insert('option_groups', { item_id: cafe.id, name: 'Extras', min_select: 0, max_select: 2 });
    insert('options', { group_id: g2, name: 'Doble de café', price_delta_cents: 50, sort: 0 });
    insert('options', { group_id: g2, name: 'Sirope de vainilla', price_delta_cents: 40, sort: 1 });
  }

  // Upselling: qué se sugiere con qué.
  const porNombre = (re) => all('SELECT * FROM items WHERE venue_id = ?', venueId).find((i) => re.test(i.name));
  const pares = [[/bravas/i, [/caña/i, /vermut/i]], [/entrecot/i, [/vino/i, /agua/i]], [/tostada con aguacate/i, [/flat white|zumo/i]], [/poke/i, [/agua/i]]];
  for (const [re, sugs] of pares) {
    const base = porNombre(re);
    if (!base) continue;
    const ids = sugs.map((r) => porNombre(r)?.id).filter(Boolean);
    if (ids.length) update('items', base.id, { suggests: JSON.stringify(ids) });
  }

  const carne = porNombre(/entrecot|entrecô/i);
  if (carne) {
    const g = insert('option_groups', { item_id: carne.id, name: 'Punto de la carne', min_select: 1, max_select: 1 });
    ['Poco hecho', 'Al punto', 'Al punto pasado', 'Muy hecho'].forEach((n, i) =>
      insert('options', { group_id: g, name: n, price_delta_cents: 0, sort: i }));
    const g2 = insert('option_groups', { item_id: carne.id, name: 'Guarnición', min_select: 1, max_select: 1 });
    [['Patatas fritas', 0], ['Ensalada', 0], ['Pimientos de padrón', 150]].forEach(([n, p], i) =>
      insert('options', { group_id: g2, name: n, price_delta_cents: p, sort: i }));
  }

  insert('billing_events', {
    venue_id: venueId, type: 'trial_started', plan: 'trial',
    period_start: addDays(-40).slice(0, 10), period_end: addDays(-10).slice(0, 10), note: 'Piloto de 30 días',
  });
  if (plan !== 'trial') {
    const precio = { mesa: 1900, servicio: 3900, conectado: 6900, founders: 1900 }[plan] || 0;
    insert('billing_events', {
      venue_id: venueId, type: 'plan_changed', plan, amount_cents: precio,
      tax_cents: Math.round(precio * 0.21),
      period_start: addDays(-10).slice(0, 10), period_end: addDays(20).slice(0, 10),
      reference: `MTR-${venueId}-0001`, note: plan === 'founders' ? 'Conversión tras el piloto · oferta Fundadores (24 meses)' : 'Conversión tras el piloto',
    });
  }

  venue = get('SELECT * FROM venues WHERE id = ?', venueId);
  seedHistory(venue, tableIds, itemIds);
  console.log(`  · ${name}: ${tables} mesas, ${itemIds.length} productos`);
  return venue;
}

/** A qué estación (barra o cocina) va cada producto, según su categoría. */
const stationOf = (item) =>
  (item.category_id ? get('SELECT station FROM categories WHERE id = ?', item.category_id)?.station : '') || '';

/** Historial realista de 45 días para que la analítica tenga algo que enseñar. */
function seedHistory(venue, tableIds, itemIds) {
  const items = itemIds.map((id) => get('SELECT * FROM items WHERE id = ?', id));
  let seq = 0;
  for (let d = 45; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const weekend = [5, 6].includes(date.getDay());
    const orders = Math.round((weekend ? 14 : 8) * (0.6 + Math.random() * 0.9));
    for (let o = 0; o < orders; o++) {
      const hour = [12, 13, 13, 14, 14, 15, 19, 20, 21, 21, 22, 9, 10, 11][Math.floor(Math.random() * 14)];
      const created = new Date(date);
      created.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
      const createdSql = created.toISOString().slice(0, 19).replace('T', ' ');
      const tableId = tableIds[Math.floor(Math.random() * tableIds.length)];
      const lines = [];
      const n = 1 + Math.floor(Math.random() * 4);
      for (let l = 0; l < n; l++) {
        const it = items[Math.floor(Math.random() * items.length)];
        const qty = 1 + Math.floor(Math.random() * 2);
        lines.push({
          item_id: it.id, name: JSON.parse(it.name).es, qty, station: stationOf(it),
          unit_price_cents: it.price_cents, line_total_cents: it.price_cents * qty,
          options: [], note: '', tax_rate: venue.tax_rate,
        });
      }
      const sums = totals(venue, lines);
      const isScan = Math.random() > 0.35;
      const sessionId = `seed-${venue.id}-${d}-${o}`;
      const orderId = insert('orders', {
        venue_id: venue.id, table_id: tableId, code: orderCode(++seq),
        status: 'paid', channel: isScan ? 'qr' : 'staff',
        session_id: isScan ? sessionId : '',
        guest_name: '', note: '', ...sums,
        payment_method: Math.random() > 0.4 ? 'card' : 'cash',
        created_at: createdSql,
        accepted_at: new Date(created.getTime() + 90000).toISOString().slice(0, 19).replace('T', ' '),
        served_at: new Date(created.getTime() + 9 * 60000).toISOString().slice(0, 19).replace('T', ' '),
        paid_at: new Date(created.getTime() + 42 * 60000).toISOString().slice(0, 19).replace('T', ' '),
        closed_at: new Date(created.getTime() + 42 * 60000).toISOString().slice(0, 19).replace('T', ' '),
      });
      for (const l of lines) {
        insert('order_items', {
          order_id: orderId, item_id: l.item_id, name: l.name, qty: l.qty, station: l.station,
          unit_price_cents: l.unit_price_cents, options: '[]', line_total_cents: l.line_total_cents, status: 'served',
        });
      }
      if (isScan) {
        insert('scans', { venue_id: venue.id, table_id: tableId, session_id: sessionId, created_at: createdSql });
        // Escaneos que miran la carta y no piden: el embudo real no es del 100%.
        for (let s = 0; s < Math.floor(Math.random() * 3); s++) {
          insert('scans', { venue_id: venue.id, table_id: tableId, session_id: `${sessionId}-x${s}`, created_at: createdSql });
        }
      }
      if (isScan && Math.random() > 0.8) {
        const comentarios = ['Rápido y fácil', 'Muy cómodo pedir desde la mesa', '', 'Las bravas, brutales', '', 'Tardó un poco la bebida', ''];
        insert('reviews', {
          venue_id: venue.id, order_id: orderId, table_id: tableId, session_id: sessionId,
          rating: [5, 5, 4, 5, 4, 3, 5][Math.floor(Math.random() * 7)],
          comment: comentarios[Math.floor(Math.random() * comentarios.length)],
          email: Math.random() > 0.6 ? `cliente${d}${o}@example.com` : '', optin: Math.random() > 0.6 ? 1 : 0,
          created_at: createdSql,
        });
      }
      if (Math.random() > 0.75) {
        const type = ['waiter', 'bill', 'water'][Math.floor(Math.random() * 3)];
        insert('calls', {
          venue_id: venue.id, table_id: tableId, type, status: 'done', created_at: createdSql,
          resolved_at: new Date(created.getTime() + 3 * 60000).toISOString().slice(0, 19).replace('T', ' '),
        });
      }
    }
  }
}

console.log('\nSembrando datos de demostración de Maitre…');

if (!get('SELECT id FROM users WHERE role = ?', 'superadmin')) {
  insert('users', {
    venue_id: null, email: 'marc@maitre.app', password_hash: hashPassword('maitre2026'),
    name: 'Marc Simón', role: 'superadmin',
  });
  console.log('  · Operador Maitre: marc@maitre.app / maitre2026');
}

const ancora = seedVenue({
  slug: 'bar-lancora', name: "Bar L'Àncora", city: 'Sant Cugat del Vallès',
  address: 'Plaça d\'Octavià 4', plan: 'founders', isPilot: true, color: '#1f6f5c',
  pilot: {
    objective: 'ticket', start: addDays(-40).slice(0, 10), decision_date: addDays(-10).slice(0, 10),
    baseline_ticket_cents: 2650, baseline_wait_minutes: 11, deposit_cents: 9800, responsible: 'Rosa Puig',
    notes: 'Convertido a Fundadores el día 30. Pidieron separar barra y cocina.',
    weekly: [
      { week: 1, note: 'Formación 40 min. Dudas con el aviso de cuenta.' },
      { week: 2, note: 'Terraza usa el pedido más que la sala.' },
      { week: 3, note: 'Sin incidencias. Piden agotados rápidos.' },
      { week: 4, note: 'Deciden quedarse. Oferta Fundadores.' },
    ],
  },
  carta: CARTA_ANCORA, tables: 14, ownerEmail: 'ancora@maitre.app', ownerName: 'Rosa Puig',
  staff: [
    { email: 'sala.ancora@maitre.app', name: 'Iu Martí', role: 'staff', pin: '1234' },
    { email: 'encargado.ancora@maitre.app', name: 'Nadia Roca', role: 'manager', pin: '4321' },
  ],
});

const vitoria = seedVenue({
  slug: 'cafe-vitoria', name: 'Cafè Vitòria', city: 'Sant Cugat del Vallès',
  address: 'Carrer de Vitòria 11', plan: 'trial', isPilot: true, color: '#b4531f',
  carta: CARTA_VITORIA, tables: 9, ownerEmail: 'vitoria@maitre.app', ownerName: 'Joan Serra',
  pilot: {
    objective: 'tiempo', start: addDays(-12).slice(0, 10), decision_date: addDays(18).slice(0, 10),
    baseline_ticket_cents: 890, baseline_wait_minutes: 7, deposit_cents: 6300, responsible: 'Joan Serra',
    notes: 'Cafetería de especialidad. Objetivo: reducir la espera en el mostrador en hora punta.',
    weekly: [{ week: 1, note: 'Arranque limpio. Los desayunos concentran el uso.' }],
  },
  staff: [{ email: 'sala.vitoria@maitre.app', name: 'Berta Lloret', role: 'staff', pin: '2468' }],
});

// Un par de pedidos vivos para que la pantalla de sala arranque con contenido.
for (const venue of [ancora, vitoria]) {
  if (get('SELECT COUNT(*) AS n FROM orders WHERE venue_id = ? AND status != ?', venue.id, 'paid').n) continue;
  const tables = all('SELECT * FROM tables WHERE venue_id = ? LIMIT 3', venue.id);
  // Un pedido de cocina y otro de barra, para que la pantalla de sala enseñe las dos estaciones.
  const todos = all('SELECT * FROM items WHERE venue_id = ?', venue.id);
  const deCocina = todos.filter((i) => stationOf(i) === 'cocina');
  const deBarra = todos.filter((i) => stationOf(i) === 'barra');
  const seq = get('SELECT COUNT(*) AS n FROM orders WHERE venue_id = ?', venue.id).n;
  ['new', 'preparing'].forEach((status, i) => {
    const fuente = i === 0 ? deCocina : (deBarra.length ? deBarra : deCocina);
    const lines = fuente.slice(0, 2).map((it) => ({
      item_id: it.id, name: JSON.parse(it.name).es, qty: 1 + i, station: stationOf(it),
      unit_price_cents: it.price_cents, line_total_cents: it.price_cents * (1 + i), tax_rate: venue.tax_rate,
    }));
    const sums = totals(venue, lines);
    const id = insert('orders', {
      venue_id: venue.id, table_id: tables[i].id, code: orderCode(seq + i + 1),
      status, channel: 'qr', session_id: `demo-live-${i}`, guest_name: i ? 'Marta' : '', ...sums,
    });
    lines.forEach((l) => insert('order_items', {
      order_id: id, item_id: l.item_id, name: l.name, qty: l.qty, station: l.station,
      unit_price_cents: l.unit_price_cents, options: '[]', line_total_cents: l.line_total_cents,
    }));
    run(`UPDATE tables SET status = 'occupied' WHERE id = ?`, tables[i].id);
  });
  insert('calls', { venue_id: venue.id, table_id: tables[2].id, type: 'bill', status: 'open' });
}

if (!get('SELECT COUNT(*) AS n FROM leads').n) {
  for (const l of [
    ['Laia Ferrer', 'Can Ferrer', 'laia@canferrer.cat', 'Rubí', 22, 'servicio'],
    ['Óscar Ruiz', 'Taberna 33', 'oscar@taberna33.es', 'Terrassa', 14, 'mesa'],
    ['Nuria Camps', 'Vermuteria Camps', 'nuria@camps.cat', 'Sabadell', 9, 'servicio'],
  ]) {
    insert('leads', { name: l[0], venue_name: l[1], email: l[2], city: l[3], tables: l[4], plan_interest: l[5] });
  }
}

const stats = {
  locales: get('SELECT COUNT(*) AS n FROM venues').n,
  mesas: get('SELECT COUNT(*) AS n FROM tables').n,
  productos: get('SELECT COUNT(*) AS n FROM items').n,
  pedidos: get('SELECT COUNT(*) AS n FROM orders').n,
};
console.log(`\nListo: ${stats.locales} locales, ${stats.mesas} mesas, ${stats.productos} productos, ${stats.pedidos} pedidos.`);
console.log('\nAccesos de prueba (contraseña: maitre2026)');
console.log('  Operador Maitre  marc@maitre.app');
console.log('  Local Fundadores ancora@maitre.app');
console.log('  Local en piloto  vitoria@maitre.app');
console.log('  Camarero         sala.ancora@maitre.app\n');
for (const v of all('SELECT * FROM venues')) {
  const t = get('SELECT * FROM tables WHERE venue_id = ? ORDER BY sort LIMIT 1', v.id);
  console.log(`  Carta de ${v.name}: /m/${v.slug}/${t.token}`);
}
console.log('');

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signup } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });

/** Abre una función en preparación para un local, como haría Maitre desde su consola. */
async function abrirBeta(venueId, clave) {
  const { hashPassword } = await import('../server/auth.js');
  const { insert, get } = await import('../server/db.js');
  const correo = 'beta-op@maitre.test';
  if (!get('SELECT id FROM users WHERE email = ?', correo)) {
    insert('users', { venue_id: null, email: correo, password_hash: hashPassword('contrasena123'), name: 'Op', role: 'superadmin' });
  }
  const antes = srv.jar.cookie;
  await srv.request('/api/auth/login', { method: 'POST', body: { email: correo, password: 'contrasena123' } });
  await srv.request(`/api/admin/venues/${venueId}`, { method: 'PATCH', body: { beta: { [clave]: true } } });
  srv.jar.cookie = antes;   // devuelve la sesión al dueño del local
}
after(async () => { await srv.close(); });

describe('cuentas', () => {
  test('el alta crea local, mesas y prueba de 30 días', async () => {
    const { status, data } = await signup(srv.request, { venue_name: 'Bar de Prueba' });
    assert.equal(status, 201);
    assert.equal(data.venue.slug, 'bar-de-prueba');
    assert.equal(data.venue.effective_plan, 'trial');
    assert.equal(data.user.role, 'owner');
    const tables = await srv.request('/api/tables');
    assert.equal(tables.data.tables.length, 4);
    assert.ok(tables.data.tables[0].url.includes('/m/bar-de-prueba/'));
  });

  test('rechaza contraseñas cortas y emails repetidos', async () => {
    const corta = await signup(srv.request, { password: '123' });
    assert.equal(corta.status, 400);
    const uno = await signup(srv.request, { email: 'repe@test.dev' });
    assert.equal(uno.status, 201);
    const dos = await signup(srv.request, { email: 'repe@test.dev' });
    assert.equal(dos.status, 409);
  });

  test('el login falla con contraseña incorrecta', async () => {
    const { payload } = await signup(srv.request);
    const mal = await srv.request('/api/auth/login', { method: 'POST', body: { email: payload.email, password: 'otra' } });
    assert.equal(mal.status, 401);
    const bien = await srv.request('/api/auth/login', { method: 'POST', body: { email: payload.email, password: payload.password } });
    assert.equal(bien.status, 200);
  });

  test('sin sesión no se accede al panel', async () => {
    const res = await srv.request('/api/venue', { cookies: false });
    assert.equal(res.status, 401);
  });
});

describe('aislamiento entre locales', () => {
  test('un local no puede leer ni tocar la carta de otro', async () => {
    await signup(srv.request, { venue_name: 'Local A' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Bebidas A' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Secreto', price: 3, category_id: cat.data.id } });

    await signup(srv.request, { venue_name: 'Local B' });   // la cookie pasa a ser la de B
    const listado = await srv.request('/api/menu/items');
    assert.equal(listado.data.length, 0);
    const leer = await srv.request(`/api/menu/items/${item.data.id}`);
    assert.equal(leer.status, 404);
    const borrar = await srv.request(`/api/menu/items/${item.data.id}`, { method: 'DELETE' });
    assert.equal(borrar.status, 404);
  });
});

describe('carta', () => {
  test('crea categorías, productos y opciones con precio', async () => {
    await signup(srv.request, { venue_name: 'Carta Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Cafés' } });
    const item = await srv.request('/api/menu/items', {
      method: 'POST',
      body: { name: 'Café', price: 1.6, category_id: cat.data.id, allergens: ['milk'], tags: ['vegan'] },
    });
    assert.equal(item.data.price_cents, 160);
    assert.deepEqual(item.data.allergens, ['milk']);

    const grupo = await srv.request(`/api/menu/items/${item.data.id}/groups`, {
      method: 'POST', body: { name: 'Leche', min_select: 1, max_select: 1 },
    });
    assert.equal(grupo.status, 201);
    const opt = await srv.request(`/api/menu/groups/${grupo.data.id}/options`, {
      method: 'POST', body: { name: 'Avena', price_delta: 0.3 },
    });
    assert.equal(opt.data.price_delta_cents, 30);

    const full = await srv.request(`/api/menu/items/${item.data.id}`);
    assert.equal(full.data.option_groups[0].options[0].name, 'Avena');
  });

  test('importa y exporta CSV', async () => {
    await signup(srv.request, { venue_name: 'CSV Test' });
    const csv = 'categoria,producto,descripcion,precio,alergenos\nTapas,Bravas,Con salsa,6.90,eggs\nTapas,Pan,,3.50,gluten';
    const imp = await srv.request('/api/menu/import', { method: 'POST', body: csv, headers: { 'Content-Type': 'text/csv' } });
    assert.equal(imp.data.created, 2);
    const items = await srv.request('/api/menu/items');
    assert.equal(items.data.length, 2);
    assert.equal(items.data.find((i) => i.name.es === 'Bravas').price_cents, 690);
    const exp = await srv.request('/api/menu/export.csv');
    assert.match(exp.data, /Bravas/);
  });
});

describe('pedidos desde la mesa', () => {
  async function localConCarta(nombre = 'Pedidos Test') {
    const { data: alta } = await signup(srv.request, { venue_name: nombre });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: cat.data.id } });
    const tables = await srv.request('/api/tables');
    return { venue: alta.venue, item: item.data, table: tables.data.tables[0] };
  }

  test('el precio lo pone el servidor, nunca el cliente', async () => {
    const { venue, item, table } = await localConCarta('Precio Test');
    const res = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false,
      body: { lines: [{ item_id: item.id, qty: 2, unit_price_cents: 1, price_cents: 1 }], session_id: 's1' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.total_cents, 520);
    assert.equal(res.data.items[0].unit_price_cents, 260);
  });

  test('el IVA incluido se desglosa correctamente', async () => {
    const { venue, item, table } = await localConCarta('IVA Test');
    const res = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }] },
    });
    // 2,60 € con IVA del 10% incluido → base 2,36 € + 0,24 € de IVA
    assert.equal(res.data.total_cents, 260);
    assert.equal(res.data.tax_cents, 24);
    assert.equal(res.data.subtotal_cents, 236);
    assert.equal(res.data.subtotal_cents + res.data.tax_cents, res.data.total_cents);
  });

  test('rechaza productos agotados y tokens de mesa inválidos', async () => {
    const { venue, item, table } = await localConCarta('Agotado Test');
    await srv.request(`/api/menu/items/${item.id}`, { method: 'PATCH', body: { available: false } });
    const agotado = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }] },
    });
    assert.equal(agotado.status, 400);
    assert.match(agotado.data.message, /no está disponible/);

    const falso = await srv.request(`/api/public/${venue.slug}/token-inventado/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }] },
    });
    assert.equal(falso.status, 404);
  });

  test('el ciclo del pedido avanza y deja la mesa en limpieza', async () => {
    const { venue, item, table } = await localConCarta('Ciclo Test');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }] },
    });
    const ocupada = await srv.request('/api/tables');
    assert.equal(ocupada.data.tables.find((t) => t.id === table.id).status, 'occupied');

    for (const esperado of ['accepted', 'preparing', 'served']) {
      const r = await srv.request(`/api/orders/${pedido.data.id}/status`, { method: 'PATCH' });
      assert.equal(r.data.status, esperado);
    }
    const cobrado = await srv.request(`/api/orders/${pedido.data.id}/status`, {
      method: 'PATCH', body: { status: 'paid', payment_method: 'card' },
    });
    assert.equal(cobrado.data.status, 'paid');
    const limpieza = await srv.request('/api/tables');
    assert.equal(limpieza.data.tables.find((t) => t.id === table.id).status, 'cleaning');
  });

  test('el aviso al personal no se duplica', async () => {
    const { venue, table } = await localConCarta('Aviso Test');
    const uno = await srv.request(`/api/public/${venue.slug}/${table.token}/call`, {
      method: 'POST', cookies: false, body: { type: 'bill' },
    });
    assert.equal(uno.status, 201);
    const dos = await srv.request(`/api/public/${venue.slug}/${table.token}/call`, {
      method: 'POST', cookies: false, body: { type: 'bill' },
    });
    assert.equal(dos.data.duplicate, true);
    const pendientes = await srv.request('/api/orders/pending-calls');
    assert.equal(pendientes.data.length, 1);
  });
});

describe('planes', () => {
  test('el plan Mesa permite pedir pero no tiene analítica', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Basico Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Agua', price: 2, category_id: cat.data.id } });
    const tables = await srv.request('/api/tables');
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'mesa' } });

    const analitica = await srv.request('/api/analytics/summary');
    assert.equal(analitica.status, 402);

    const carta = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}`, { cookies: false });
    assert.equal(carta.data.can_order, true);
    assert.equal(carta.data.can_call, true);

    const pedido = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.data.id, qty: 1 }] },
    });
    assert.equal(pedido.status, 201);

    // Lo que sí queda para Servicio: mover mesas, encargados con permisos.
    const t2 = tables.data.tables[1];
    const mover = await srv.request(`/api/tables/${t2.id}/move`, { method: 'POST', body: { to: tables.data.tables[0].id } });
    assert.equal(mover.status, 402);
    const encargado = await srv.request('/api/auth/team', { method: 'POST', body: { email: 'enc@mesa.dev', password: 'contrasena123', role: 'manager' } });
    assert.equal(encargado.status, 402);
    const sala = await srv.request('/api/auth/team', { method: 'POST', body: { email: 'sala@mesa.dev', password: 'contrasena123', role: 'staff' } });
    assert.equal(sala.status, 201);
  });

  test('el límite de mesas del plan se respeta', async () => {
    await signup(srv.request, { venue_name: 'Limite Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'mesa' } });
    const res = await srv.request('/api/tables', { method: 'POST', body: { quantity: 50 } });
    assert.equal(res.status, 402);
    assert.equal(res.data.limit, 40);
  });

  test('el plan Servicio desbloquea la analítica', async () => {
    await signup(srv.request, { venue_name: 'Servicio Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    const res = await srv.request('/api/analytics/summary');
    assert.equal(res.status, 200);
    assert.ok('kpis' in res.data);
  });
});

describe('roles', () => {
  test('el personal de sala solo cambia disponibilidad, no precios', async () => {
    await signup(srv.request, { venue_name: 'Roles Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Tapa', price: 5, category_id: cat.data.id } });
    await srv.request('/api/auth/team', {
      method: 'POST', body: { email: 'camarero@test.dev', password: 'contrasena123', name: 'Iu', role: 'staff' },
    });
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'camarero@test.dev', password: 'contrasena123' } });

    const agota = await srv.request(`/api/menu/items/${item.data.id}`, { method: 'PATCH', body: { available: false } });
    assert.equal(agota.status, 200);
    assert.equal(agota.data.available, 0);

    const sube = await srv.request(`/api/menu/items/${item.data.id}`, { method: 'PATCH', body: { price: 99 } });
    assert.equal(sube.status, 403);

    const equipo = await srv.request('/api/auth/team', {
      method: 'POST', body: { email: 'otro@test.dev', password: 'contrasena123', role: 'staff' },
    });
    assert.equal(equipo.status, 403);
  });
});

describe('mesas y QR', () => {
  test('genera el PNG del QR y regenera el token', async () => {
    await signup(srv.request, { venue_name: 'QR Test' });
    const tables = await srv.request('/api/tables');
    const t = tables.data.tables[0];
    const png = await fetch(`${srv.base}/api/tables/${t.id}/qr.png`, { headers: { Cookie: srv.jar.cookie } });
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.ok((await png.arrayBuffer()).byteLength > 500);

    const rot = await srv.request(`/api/tables/${t.id}/rotate`, { method: 'POST' });
    assert.notEqual(rot.data.token, t.token);
    const viejo = await srv.request(`/api/public/qr-test/${t.token}`, { cookies: false });
    assert.equal(viejo.status, 404);
  });
});

describe('horarios de la carta', () => {
  test('una categoría fuera de su horario no se muestra al comensal', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Horario Test' });
    const siempre = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Tapa', price: 4, category_id: siempre.data.id } });

    // Una franja de un minuto que ya ha pasado hoy: nunca coincide con "ahora".
    const pasada = new Date(Date.now() - 3600000);
    const hh = String(pasada.getHours()).padStart(2, '0');
    const desayunos = await srv.request('/api/menu/categories', {
      method: 'POST', body: { name: 'Desayunos', available_from: `${hh}:00`, available_to: `${hh}:01` },
    });
    await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Tostada', price: 3, category_id: desayunos.data.id } });

    const tables = await srv.request('/api/tables');
    const carta = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}`, { cookies: false });
    const nombres = carta.data.categories.map((c) => c.name);
    assert.ok(nombres.includes('Carta'));
    assert.ok(!nombres.includes('Desayunos'));
    assert.ok(!carta.data.items.some((i) => i.name === 'Tostada'));

    // Con ?all=1 (vista previa del panel) sí aparece todo.
    const previa = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}?all=1`, { cookies: false });
    assert.ok(previa.data.categories.map((c) => c.name).includes('Desayunos'));
  });
});

describe('permisos por rol', () => {
  test('el personal de sala no ve analítica ni facturación', async () => {
    await signup(srv.request, { venue_name: 'Permisos Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    await srv.request('/api/auth/team', {
      method: 'POST', body: { email: 'sala@permisos.dev', password: 'contrasena123', role: 'staff' },
    });
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'sala@permisos.dev', password: 'contrasena123' } });

    assert.equal((await srv.request('/api/orders')).status, 200);
    assert.equal((await srv.request('/api/analytics/summary')).status, 403);
    assert.equal((await srv.request('/api/billing')).status, 403);
    assert.equal((await srv.request('/api/admin/overview')).status, 403);
    assert.equal((await srv.request('/api/venue', { method: 'PATCH', body: { name: 'Otro' } })).status, 403);
  });
});

describe('cobro del pedido antes de mandarlo a barra', () => {
  async function localConCobro(modo) {
    const { data: alta } = await signup(srv.request, { venue_name: `Cobro ${modo}` });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    await abrirBeta(alta.venue.id, 'payments');
    await srv.request('/api/venue', { method: 'PATCH', body: { payment_mode: modo } });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: cat.data.id } });
    const tables = await srv.request('/api/tables');
    return { venue: alta.venue, item: item.data, table: tables.data.tables[0] };
  }

  test('el pedido sin pagar no llega al local hasta que entra el pago', async () => {
    const { venue, item, table } = await localConCobro('online_required');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 2 }], session_id: 'movil-1' },
    });
    assert.equal(pedido.data.payment_status, 'pending');
    assert.ok(pedido.data.checkout.url.includes(`/pagar/${venue.slug}/`));

    // Ni en la pantalla de sala ni ocupando la mesa.
    assert.equal((await srv.request('/api/orders?scope=open')).data.filter((o) => o.id === pedido.data.id).length, 0);
    assert.equal((await srv.request('/api/tables')).data.tables.find((t) => t.id === table.id).status, 'free');

    const pagado = await srv.request(`/api/public/${venue.slug}/${table.token}/pay`, {
      method: 'POST', cookies: false, body: { order_id: pedido.data.id, session_id: 'movil-1', result: 'ok' },
    });
    assert.equal(pagado.data.payment_status, 'paid');
    assert.equal(pagado.data.payment_method, 'card');

    const enSala = (await srv.request('/api/orders?scope=open')).data.find((o) => o.id === pedido.data.id);
    assert.ok(enSala, 'el pedido pagado sí aparece en sala');
    assert.equal((await srv.request('/api/tables')).data.tables.find((t) => t.id === table.id).status, 'occupied');

    // Y ya no se vuelve a cobrar en la cuenta de la mesa.
    const cuenta = await srv.request(`/api/orders/table/${table.id}/bill`);
    assert.equal(cuenta.data.total_cents, 0);
  });

  test('un pago rechazado deja el pedido fuera de la cocina y se puede reintentar', async () => {
    const { venue, item, table } = await localConCobro('online_required');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }], session_id: 'movil-2' },
    });
    const fallo = await srv.request(`/api/public/${venue.slug}/${table.token}/pay`, {
      method: 'POST', cookies: false, body: { order_id: pedido.data.id, session_id: 'movil-2', result: 'ko' },
    });
    assert.equal(fallo.data.payment_status, 'failed');
    assert.equal((await srv.request('/api/orders?scope=open')).data.filter((o) => o.id === pedido.data.id).length, 0);

    const reintento = await srv.request(`/api/public/${venue.slug}/${table.token}/pay`, {
      method: 'POST', cookies: false, body: { order_id: pedido.data.id, session_id: 'movil-2', result: 'ok' },
    });
    assert.equal(reintento.data.payment_status, 'paid');
  });

  test('otro móvil no puede cerrar el pago de un pedido ajeno', async () => {
    const { venue, item, table } = await localConCobro('online_required');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }], session_id: 'movil-mio' },
    });
    const intruso = await srv.request(`/api/public/${venue.slug}/${table.token}/pay`, {
      method: 'POST', cookies: false, body: { order_id: pedido.data.id, session_id: 'movil-ajeno', result: 'ok' },
    });
    assert.equal(intruso.status, 403);
  });

  test('con cobro obligatorio no vale pedir «pago en el local»', async () => {
    const { venue, item, table } = await localConCobro('online_required');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }], payment_mode: 'venue' },
    });
    assert.equal(pedido.data.payment_mode, 'online');
    assert.equal(pedido.data.payment_status, 'pending');
  });

  test('si el local cobra en barra, el pedido entra directo aunque el móvil pida pagar', async () => {
    const { venue, item, table } = await localConCobro('venue');
    const pedido = await srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }], payment_mode: 'online' },
    });
    assert.equal(pedido.data.payment_mode, 'venue');
    assert.equal(pedido.data.payment_status, 'unpaid');
    assert.equal(pedido.data.checkout, null);
    assert.equal((await srv.request('/api/orders?scope=open')).data.filter((o) => o.id === pedido.data.id).length, 1);
    const cuenta = await srv.request(`/api/orders/table/${table.id}/bill`);
    assert.equal(cuenta.data.total_cents, 260);
  });

  test('el local elige el modo de cobro y la carta lo refleja', async () => {
    const { venue, table } = await localConCobro('online_optional');
    const carta = await srv.request(`/api/public/${venue.slug}/${table.token}`, { cookies: false });
    assert.equal(carta.data.payment.online, true);
    assert.equal(carta.data.payment.required, false);

    const malo = await srv.request('/api/venue', { method: 'PATCH', body: { payment_mode: 'gratis_total' } });
    assert.equal(malo.status, 400);
  });

  test('sin la función abierta, el cobro con el móvil no se puede activar por la cara', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Beta Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    await srv.request('/api/venue', { method: 'PATCH', body: { payment_mode: 'online_required' } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const carta = await srv.request(`/api/public/${alta.venue.slug}/${t.token}`, { cookies: false });
    assert.equal(carta.data.payment.online, false, 'está en preparación, no se vende');

    // Y el local no puede abrírsela él mismo tocando sus propios ajustes.
    await srv.request('/api/venue', { method: 'PATCH', body: { features: { beta_payments: true } } });
    const otra = await srv.request(`/api/public/${alta.venue.slug}/${t.token}`, { cookies: false });
    assert.equal(otra.data.payment.online, false, 'la función en preparación solo la abre Maitre');
  });
});

describe('quién puede pedir desde el QR', () => {
  async function local(gate) {
    const { data: alta } = await signup(srv.request, { venue_name: `Puerta ${gate}` });
    await srv.request('/api/venue', { method: 'PATCH', body: { order_gate: gate } });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta', station: 'cocina' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Tapa', price: 5, category_id: cat.data.id } });
    const tables = await srv.request('/api/tables');
    return { venue: alta.venue, item: item.data, table: tables.data.tables[0] };
  }
  const pedir = (venue, table, extra = {}) => srv.request(`/api/public/${venue.slug}/${table.token}/order`, {
    method: 'POST', cookies: false, body: { lines: [{ item_id: extra.item, qty: 1 }], session_id: extra.session || `s${Math.random()}`, ...extra.body },
  });

  test('con «solo mesas abiertas» hay que abrir la mesa antes', async () => {
    const { venue, item, table } = await local('occupied');
    const cerrada = await pedir(venue, table, { item: item.id });
    assert.equal(cerrada.status, 403);
    assert.equal(cerrada.data.error, 'table_closed');

    await srv.request(`/api/tables/${table.id}`, { method: 'PATCH', body: { status: 'occupied' } });
    const abierta = await pedir(venue, table, { item: item.id });
    assert.equal(abierta.status, 201);
  });

  test('con código de turno hace falta el código correcto', async () => {
    const { venue, item, table } = await local('code');
    const code = (await srv.request('/api/venue/order-code', { method: 'POST' })).data.order_code;
    assert.match(code, /^[A-Z]\d{3}$/);

    const sinCodigo = await pedir(venue, table, { item: item.id });
    assert.equal(sinCodigo.data.error, 'code_required');
    const malCodigo = await pedir(venue, table, { item: item.id, body: { code: 'Z999' } });
    assert.equal(malCodigo.data.error, 'code_required');
    const bien = await pedir(venue, table, { item: item.id, body: { code: code.toLowerCase() } });
    assert.equal(bien.status, 201);
  });

  test('la misma sesión no puede disparar pedidos en cadena', async () => {
    const { venue, item, table } = await local('open');
    const uno = await pedir(venue, table, { item: item.id, session: 'spam' });
    assert.equal(uno.status, 201);
    const dos = await pedir(venue, table, { item: item.id, session: 'spam' });
    assert.equal(dos.status, 429);
  });
});

describe('barra y cocina', () => {
  test('cada línea guarda su estación para separar comandas', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Estaciones Test' });
    const bebidas = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Bebidas', station: 'barra' } });
    const platos = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Platos', station: 'cocina' } });
    const cana = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: bebidas.data.id } });
    const tapa = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Bravas', price: 6.9, category_id: platos.data.id } });
    const tables = await srv.request('/api/tables');

    const pedido = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}/order`, {
      method: 'POST', cookies: false,
      body: { lines: [{ item_id: cana.data.id, qty: 2 }, { item_id: tapa.data.id, qty: 1 }] },
    });
    const estaciones = Object.fromEntries(pedido.data.items.map((li) => [li.name, li.station]));
    assert.equal(estaciones['Caña'], 'barra');
    assert.equal(estaciones['Bravas'], 'cocina');
  });
});

describe('gestión de mesas', () => {
  async function conDosMesas(nombre) {
    const { data: alta } = await signup(srv.request, { venue_name: nombre, tables: 2 });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: cat.data.id } });
    const t = (await srv.request('/api/tables')).data.tables;
    return { venue: alta.venue, item: item.data, a: t[0], b: t[1] };
  }

  test('cambiar de mesa se lleva la cuenta a la mesa nueva', async () => {
    const { venue, item, a, b } = await conDosMesas('Cambio Test');
    await srv.request(`/api/public/${venue.slug}/${a.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 2 }] },
    });
    const r = await srv.request(`/api/tables/${a.id}/move`, { method: 'POST', body: { to: b.id } });
    assert.equal(r.data.moved, 1);
    assert.equal((await srv.request(`/api/orders/table/${a.id}/bill`)).data.total_cents, 0);
    assert.equal((await srv.request(`/api/orders/table/${b.id}/bill`)).data.total_cents, 520);
    const mesas = (await srv.request('/api/tables')).data.tables;
    assert.equal(mesas.find((t) => t.id === b.id).status, 'occupied');
  });

  test('unir mesas junta la cuenta en la principal', async () => {
    const { venue, item, a, b } = await conDosMesas('Union Test');
    await srv.request(`/api/public/${venue.slug}/${a.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 1 }] },
    });
    await srv.request(`/api/public/${venue.slug}/${b.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.id, qty: 3 }] },
    });
    await srv.request(`/api/tables/${b.id}/merge`, { method: 'POST', body: { into: a.id } });

    const cuenta = await srv.request(`/api/orders/table/${a.id}/bill`);
    assert.equal(cuenta.data.total_cents, 260 + 780);
    assert.equal(cuenta.data.orders.length, 2);

    await srv.request(`/api/tables/${a.id}/unmerge`, { method: 'POST' });
    assert.equal((await srv.request(`/api/orders/table/${a.id}/bill`)).data.total_cents, 260);
  });
});

describe('integración con TPV', () => {
  test('la firma del webhook se calcula con la clave del local', async () => {
    const { sign } = await import('../server/webhooks.js');
    const cuerpo = JSON.stringify({ event: 'order.created' });
    assert.equal(sign('clave', cuerpo), sign('clave', cuerpo));
    assert.notEqual(sign('clave', cuerpo), sign('otra', cuerpo));
    assert.match(sign('clave', cuerpo), /^[0-9a-f]{64}$/);
  });

  test('solo se admiten URLs http(s) y se genera clave de firma', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Webhook Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    await abrirBeta(alta.venue.id, 'integrations');
    const malo = await srv.request('/api/venue', { method: 'PATCH', body: { webhook_url: 'javascript:alert(1)' } });
    assert.equal(malo.status, 400);
    const bueno = await srv.request('/api/venue', { method: 'PATCH', body: { webhook_url: 'https://tpv.example.com/hook' } });
    assert.equal(bueno.status, 200);
    assert.ok(bueno.data.webhook_secret.length >= 16);
  });
});


describe('arquitectura de precios del estudio', () => {
  test('el piloto arranca con el plan Servicio y Fundadores no es autocontratable', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Precios Test' });
    assert.equal(alta.venue.effective_plan, 'trial');
    assert.ok(alta.venue.plan_features.includes('orders'));
    assert.ok(!alta.venue.plan_features.includes('payments'));
    const f = await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'founders' } });
    assert.equal(f.status, 400);
    const b = await srv.request('/api/billing');
    assert.deepEqual(b.data.plans.map((p) => p.id), ['mesa', 'servicio', 'grupo', 'founders']);
    const g = await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'grupo' } });
    assert.equal(g.status, 400, 'el plan de grupo se negocia, no se contrata solo');
    assert.ok(b.data.plans.find((p) => p.id === 'mesa').features.includes('orders'));
    assert.ok(!b.data.plans.find((p) => p.id === 'mesa').features.includes('analytics'));
    assert.equal(b.data.plans.find((p) => p.id === 'servicio').price_cents, 3900);
  });

  test('solo se venden los planes cuyas funciones existen de verdad', async () => {
    const { PLANS, ROADMAP, SELF_SERVICE } = await import('../server/plans.js');
    assert.deepEqual(SELF_SERVICE, ['mesa', 'servicio']);
    for (const id of SELF_SERVICE) {
      for (const f of PLANS[id].features) {
        assert.ok(!ROADMAP.includes(f), `${f} está en preparación y no puede venderse en el plan ${id}`);
      }
    }
  });
});

describe('cuña con QR administrable', () => {
  test('la madera lleva un código permanente que sobrevive a caducar enlaces', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'QR Permanente' });
    const t = (await srv.request('/api/tables')).data.tables[0];
    assert.match(t.qr_code, /^[A-Z2-9]{6}$/);
    assert.ok(t.qr_url.endsWith(`/q/${t.qr_code}`));

    await srv.request(`/api/tables/${t.id}/rotate`, { method: 'POST' });
    const res = await fetch(`${srv.base}/q/${t.qr_code}`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const nuevo = (await srv.request('/api/tables')).data.tables[0];
    assert.ok(res.headers.get('location').endsWith(`/m/${alta.venue.slug}/${nuevo.token}`));
    assert.notEqual(nuevo.token, t.token);
  });
});

describe('fase 1: sugerencias y reseñas', () => {
  test('las sugerencias solo salen si el plan las incluye', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Upsell Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const bravas = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Bravas', price: 6.9, category_id: cat.data.id } });
    const cana = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: cat.data.id } });
    await srv.request(`/api/menu/items/${bravas.data.id}`, { method: 'PATCH', body: { suggests: [cana.data.id] } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const conPlan = await srv.request(`/api/public/${alta.venue.slug}/${t.token}`, { cookies: false });
    assert.deepEqual(conPlan.data.items.find((i) => i.name === 'Bravas').suggests, [cana.data.id]);
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'mesa' } });
    const sinPlan = await srv.request(`/api/public/${alta.venue.slug}/${t.token}`, { cookies: false });
    assert.deepEqual(sinPlan.data.items.find((i) => i.name === 'Bravas').suggests, []);
  });

  test('la reseña es posterior al servicio, una por sesión, y el email solo con opt-in', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Reseña Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'local' } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const base = `/api/public/${alta.venue.slug}/${t.token}`;
    const mal = await srv.request(`${base}/review`, { method: 'POST', cookies: false, body: { rating: 9 } });
    assert.equal(mal.status, 400);
    const ok = await srv.request(`${base}/review`, { method: 'POST', cookies: false, body: { rating: 5, comment: 'Genial', session_id: 'r1', optin: true, email: 'ana@example.com' } });
    assert.equal(ok.status, 201);
    const repe = await srv.request(`${base}/review`, { method: 'POST', cookies: false, body: { rating: 4, session_id: 'r1' } });
    assert.equal(repe.status, 409);
    const sinMail = await srv.request(`${base}/review`, { method: 'POST', cookies: false, body: { rating: 4, session_id: 'r2', optin: false, email: 'no-guardar@example.com' } });
    assert.equal(sinMail.status, 201);
    const a = await srv.request('/api/analytics/summary');
    assert.equal(a.data.kpis.reviews, 2);
    assert.equal(a.data.kpis.optins, 1);
  });
});

describe('cuadro de mando del piloto', () => {
  test('el operador ve uso, valor y calidad del piloto frente a los criterios de éxito', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Piloto Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Menú', price: 12, category_id: cat.data.id } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    await srv.request(`/api/public/${alta.venue.slug}/${t.token}/scan`, { method: 'POST', cookies: false, body: { session_id: 'p1' } });
    await srv.request(`/api/public/${alta.venue.slug}/${t.token}/order`, { method: 'POST', cookies: false, body: { lines: [{ item_id: item.data.id, qty: 1 }], session_id: 'p1' } });

    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'marc@piloto.dev', password: 'contrasena123' } }); // no existe aún
    const { hashPassword } = await import('../server/auth.js');
    const { insert } = await import('../server/db.js');
    insert('users', { venue_id: null, email: 'op@piloto.dev', password_hash: hashPassword('contrasena123'), name: 'Op', role: 'superadmin' });
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'op@piloto.dev', password: 'contrasena123' } });

    await srv.request(`/api/admin/venues/${alta.venue.id}`, { method: 'PATCH', body: { is_pilot: true, pilot: { objective: 'ticket', baseline_ticket_cents: 1000 } } });
    const r = await srv.request(`/api/admin/venues/${alta.venue.id}/pilot`);
    assert.equal(r.status, 200);
    assert.equal(r.data.usage.tables_scanned, 1);
    assert.equal(r.data.usage.qr_orders, 1);
    assert.equal(r.data.quality.lost_orders, 0);
    assert.equal(r.data.checks.length, 4);
    assert.ok(r.data.checks.find((c) => c.id === 'lost').ok);

    const f = await srv.request(`/api/admin/venues/${alta.venue.id}`, { method: 'PATCH', body: { plan: 'founders' } });
    assert.equal(f.data.plan, 'founders');
    assert.ok(f.data.plan_until);
  });
});


describe('carta en varios idiomas', () => {
  test('el nombre se guarda por idioma y la carta pública lo sirve según ?lang', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Idiomas Test' });
    await srv.request('/api/venue', { method: 'PATCH', body: { languages: ['es', 'ca', 'en'] } });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: { es: 'Bebidas', ca: 'Begudes', en: 'Drinks' } } });
    await srv.request('/api/menu/items', { method: 'POST', body: {
      name: { es: 'Caña', ca: 'Canya', en: 'Draft beer' }, description: { es: '25 cl' }, price: 2.6, category_id: cat.data.id,
    } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const ca = await srv.request(`/api/public/${alta.venue.slug}/${t.token}?lang=ca`, { cookies: false });
    assert.equal(ca.data.categories[0].name, 'Begudes');
    assert.equal(ca.data.items[0].name, 'Canya');
    assert.equal(ca.data.items[0].description, '25 cl', 'sin traducción cae al idioma principal');
    const en = await srv.request(`/api/public/${alta.venue.slug}/${t.token}?lang=en`, { cookies: false });
    assert.equal(en.data.items[0].name, 'Draft beer');
  });
});

describe('avisos al personal en el móvil', () => {
  test('la clave pública existe y las suscripciones se guardan y se borran', async () => {
    await signup(srv.request, { venue_name: 'Push Test' });
    const k = await srv.request('/api/push/key');
    assert.equal(k.status, 200);
    assert.ok(k.data.key.length > 60);
    assert.equal(k.data.subscriptions, 0);

    const mala = await srv.request('/api/push/subscribe', { method: 'POST', body: { subscription: { endpoint: 'x' } } });
    assert.equal(mala.status, 400);

    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
    const ok = await srv.request('/api/push/subscribe', { method: 'POST', body: { subscription: sub } });
    assert.equal(ok.data.subscriptions, 1);
    const repe = await srv.request('/api/push/subscribe', { method: 'POST', body: { subscription: sub } });
    assert.equal(repe.data.subscriptions, 1, 'el mismo móvil no se duplica');

    await srv.request('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
    assert.equal((await srv.request('/api/push/key')).data.subscriptions, 0);
  });

  test('el local guarda su grupo de Telegram y sin bot configurado la prueba lo dice', async () => {
    await signup(srv.request, { venue_name: 'Telegram Test' });
    const v = await srv.request('/api/venue', { method: 'PATCH', body: { telegram_chat_id: '-100123' } });
    assert.equal(v.data.telegram_chat_id, '-100123');
    const t = await srv.request('/api/push/telegram-test', { method: 'POST' });
    assert.equal(t.status, 409);
  });
});

describe('que no lo metan dos camareros a la vez', () => {
  test('un pedido cogido queda bloqueado para el resto y se libera al avanzar', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'TPV Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Caña', price: 2.6, category_id: cat.data.id } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    await srv.request('/api/auth/team', { method: 'POST', body: { email: 'iu@tpv.dev', password: 'contrasena123', name: 'Iu', role: 'staff' } });
    await srv.request('/api/auth/team', { method: 'POST', body: { email: 'nadia@tpv.dev', password: 'contrasena123', name: 'Nadia', role: 'staff' } });
    const pedido = await srv.request(`/api/public/${alta.venue.slug}/${t.token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.data.id, qty: 1 }] },
    });

    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'iu@tpv.dev', password: 'contrasena123' } });
    const mio = await srv.request(`/api/orders/${pedido.data.id}/claim`, { method: 'POST' });
    assert.equal(mio.data.claimed_name, 'Iu');

    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'nadia@tpv.dev', password: 'contrasena123' } });
    const ajeno = await srv.request(`/api/orders/${pedido.data.id}/claim`, { method: 'POST' });
    assert.equal(ajeno.status, 409);
    assert.match(ajeno.data.message, /Iu ya lo está metiendo/);
    const soltar = await srv.request(`/api/orders/${pedido.data.id}/claim`, { method: 'POST', body: { release: true } });
    assert.equal(soltar.status, 403, 'un compañero no puede soltarle el pedido a otro');

    // Al marcarlo como metido (aceptado), la marca desaparece y queda libre.
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'iu@tpv.dev', password: 'contrasena123' } });
    const aceptado = await srv.request(`/api/orders/${pedido.data.id}/status`, { method: 'PATCH' });
    assert.equal(aceptado.data.status, 'accepted');
    assert.equal(aceptado.data.claimed_by, null);
  });

  test('las marcas olvidadas se sueltan solas', async () => {
    const { releaseStaleClaims } = await import('../server/orders-core.js');
    const { run, get } = await import('../server/db.js');
    const abierto = get(`SELECT id FROM orders WHERE status IN ('new','accepted') LIMIT 1`);
    run(`UPDATE orders SET claimed_by = 1, claimed_name = 'Olvidado', claimed_at = datetime('now','-20 minutes') WHERE id = ?`, abierto.id);
    assert.ok(releaseStaleClaims(5) >= 1);
    assert.equal(get('SELECT claimed_by FROM orders WHERE id = ?', abierto.id).claimed_by, null);
  });
});

describe('locales de muestra y locales de verdad', () => {
  test('Maitre crea un local de piloto limpio, y los de muestra no cuentan para el MRR', async () => {
    const { hashPassword } = await import('../server/auth.js');
    const { insert, get } = await import('../server/db.js');
    const correo = 'alta-op@maitre.test';
    if (!get('SELECT id FROM users WHERE email = ?', correo)) {
      insert('users', { venue_id: null, email: correo, password_hash: hashPassword('contrasena123'), name: 'Op', role: 'superadmin' });
    }
    await srv.request('/api/auth/login', { method: 'POST', body: { email: correo, password: 'contrasena123' } });

    const nuevo = await srv.request('/api/admin/venues', { method: 'POST', body: {
      name: 'Bar de la Plaça', email: 'plaza@piloto.test', password: 'contrasena123', city: 'Sant Cugat', tables: 9,
    } });
    assert.equal(nuevo.status, 201);
    assert.equal(nuevo.data.slug, 'bar-de-la-placa');
    assert.equal(nuevo.data.is_pilot, 1);
    assert.equal(nuevo.data.is_demo, 0);

    // Limpio: sus mesas listas, cero pedidos inventados.
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'plaza@piloto.test', password: 'contrasena123' } });
    const mesas = await srv.request('/api/tables');
    assert.equal(mesas.data.tables.length, 9);
    assert.ok(mesas.data.tables.every((t) => /^[A-Z2-9]{6}$/.test(t.qr_code)));
    assert.equal((await srv.request('/api/orders?scope=all')).data.length, 0);

    // Un local de muestra no suma al MRR del negocio.
    await srv.request('/api/auth/login', { method: 'POST', body: { email: correo, password: 'contrasena123' } });
    await srv.request(`/api/admin/venues/${nuevo.data.id}`, { method: 'PATCH', body: { plan: 'servicio' } });
    const conPago = (await srv.request('/api/admin/overview')).data.kpis.mrr_cents;
    await srv.request(`/api/admin/venues/${nuevo.data.id}`, { method: 'PATCH', body: { is_demo: true } });
    const sinDemo = (await srv.request('/api/admin/overview')).data.kpis.mrr_cents;
    assert.equal(conPago - sinDemo, 3900, 'al marcarlo de muestra deja de contar');
  });
});

describe('franquicias: un grupo de locales', () => {
  /** Entra como superadmin para hacer lo que solo hace Maitre, y devuelve la sesión. */
  async function comoOperador(fn) {
    const { hashPassword } = await import('../server/auth.js');
    const { insert, get } = await import('../server/db.js');
    const correo = 'grupo-op@maitre.test';
    if (!get('SELECT id FROM users WHERE email = ?', correo)) {
      insert('users', { venue_id: null, email: correo, password_hash: hashPassword('contrasena123'), name: 'Op', role: 'superadmin' });
    }
    const antes = srv.jar.cookie;
    await srv.request('/api/auth/login', { method: 'POST', body: { email: correo, password: 'contrasena123' } });
    const r = await fn();
    srv.jar.cookie = antes;
    return r;
  }

  test('el jefe ve sus locales y puede moverse entre ellos; un local ajeno no', async () => {
    const a = await signup(srv.request, { venue_name: 'Pizzeria Centro', email: 'jefe@grupo.test' });
    const b = await signup(srv.request, { venue_name: 'Pizzeria Norte', email: 'norte@grupo.test' });
    const ajeno = await signup(srv.request, { venue_name: 'Bar Suelto', email: 'suelto@grupo.test' });

    const grupo = await comoOperador(async () => {
      const g = await srv.request('/api/admin/groups', { method: 'POST', body: { name: 'Pizzerias Bona' } });
      for (const v of [a.data.venue.id, b.data.venue.id]) {
        await srv.request(`/api/admin/venues/${v}`, { method: 'PATCH', body: { group_id: g.data.id, plan: 'grupo' } });
      }
      await srv.request(`/api/admin/users/${a.data.user.id}/group`, { method: 'POST', body: { group_id: g.data.id } });
      return g.data;
    });
    assert.ok(grupo.id);

    // El jefe entra: ve los dos locales de su marca.
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'jefe@grupo.test', password: 'contrasena123' } });
    const me = await srv.request('/api/auth/me');
    assert.equal(me.data.group.name, 'Pizzerias Bona');
    assert.deepEqual(me.data.group.venues.map((v) => v.name).sort(), ['Pizzeria Centro', 'Pizzeria Norte']);
    assert.equal(me.data.venue.id, a.data.venue.id, 'arranca en su local de casa');

    // Cambia al otro local de la marca y el panel le sigue.
    const sw = await srv.request('/api/auth/venue', { method: 'POST', body: { venue_id: b.data.venue.id } });
    assert.equal(sw.status, 200);
    assert.equal((await srv.request('/api/auth/me')).data.venue.id, b.data.venue.id);
    assert.equal((await srv.request('/api/venue')).data.id, b.data.venue.id);

    // Un local que no es de su grupo queda fuera, aunque sepa el número.
    const fuera = await srv.request('/api/auth/venue', { method: 'POST', body: { venue_id: ajeno.data.venue.id } });
    assert.equal(fuera.status, 403);
    assert.equal((await srv.request('/api/auth/me')).data.venue.id, b.data.venue.id, 'sigue donde estaba');

    // La foto de la marca suma los dos locales.
    const g = await srv.request('/api/analytics/group');
    assert.equal(g.status, 200);
    assert.equal(g.data.venues.length, 2);

    // Y un dueño normal no tiene grupo ni puede pedir la foto de nadie.
    await srv.request('/api/auth/login', { method: 'POST', body: { email: 'suelto@grupo.test', password: 'contrasena123' } });
    assert.equal((await srv.request('/api/auth/me')).data.group, null);
    assert.equal((await srv.request('/api/analytics/group')).status, 403);
  });
});

describe('fuera de horario no se pide', () => {
  test('la carta se ve, pero el pedido se rechaza y el botón desaparece', async () => {
    const { fueraDeHorario } = await import('../server/routes/public.js');
    // La función, con horarios que cruzan la medianoche y sin horario.
    const a = (h, m = 0) => new Date(2026, 0, 1, h, m);
    assert.equal(fueraDeHorario({ order_from: '08:00', order_to: '23:00' }, a(12)), false);
    assert.equal(fueraDeHorario({ order_from: '08:00', order_to: '23:00' }, a(3)), true);
    assert.equal(fueraDeHorario({ order_from: '20:00', order_to: '02:00' }, a(1)), false, 'el turno cruza la medianoche');
    assert.equal(fueraDeHorario({ order_from: '20:00', order_to: '02:00' }, a(12)), true);
    assert.equal(fueraDeHorario({ order_from: '', order_to: '' }, a(4)), false, 'sin horario, siempre abierto');

    // Y de punta a punta: un local cerrado ahora mismo no acepta el pedido.
    const alta = await signup(srv.request, { venue_name: 'Bar Nocturno', email: 'noche@test.dev' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Bebidas' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { category_id: cat.data.id, name: 'Caña', price_cents: 250 } });
    const mesas = await srv.request('/api/tables');
    const t = mesas.data.tables[0];
    // Una franja de un minuto que ya pasó: para el servidor, está cerrado.
    const antes = new Date(Date.now() - 120 * 60000);
    const hh = String(antes.getHours()).padStart(2, '0');
    await srv.request('/api/venue', { method: 'PATCH', body: { order_from: `${hh}:00`, order_to: `${hh}:01` } });

    const url = `/api/public/${alta.data.venue.slug}/${t.token}`;
    const carta = await srv.request(url, { cookies: false });
    assert.equal(carta.data.can_order, false, 'el botón de pedir no sale');
    assert.equal(carta.data.gate.closed_now, true);
    const pedido = await srv.request(`${url}/order`, { method: 'POST', cookies: false, body: { items: [{ item_id: item.data.id, qty: 1 }] } });
    assert.equal(pedido.status, 403);
    assert.equal(pedido.data.error, 'closed_now');
    assert.match(pedido.data.message, /no se pueden hacer pedidos/);
  });
});

describe('la carta en varios idiomas', () => {
  test('la interfaz y los alérgenos cambian de idioma, y el panel dice qué falta', async () => {
    const alta = await signup(srv.request, { venue_name: 'Bar Idiomas', email: 'idiomas@test.dev' });
    await srv.request('/api/venue', { method: 'PATCH', body: { languages: ['es', 'en', 'de'] } });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: { es: 'Tapas', en: 'Small plates' } } });
    await srv.request('/api/menu/items', { method: 'POST', body: {
      category_id: cat.data.id, name: { es: 'Pan con tomate' }, description: { es: 'Con aceite de Siurana' },
      price_cents: 350, allergens: ['gluten', 'milk'],
    } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const url = `/api/public/${alta.data.venue.slug}/${t.token}`;

    // Los alérgenos son obligación legal: tienen que ir en el idioma que lee el comensal.
    const es = await srv.request(`${url}?lang=es`, { cookies: false });
    const en = await srv.request(`${url}?lang=en`, { cookies: false });
    const de = await srv.request(`${url}?lang=de`, { cookies: false });
    const alg = (d, id) => d.data.catalog.allergens.find((a) => a.id === id).label;
    assert.equal(alg(es, 'milk'), 'Lácteos');
    assert.equal(alg(en, 'milk'), 'Milk');
    assert.equal(alg(de, 'milk'), 'Milch');
    assert.equal(de.data.catalog.tags.find((x) => x.id === 'vegan').label, 'Vegan');

    // Lo que el local sí tradujo sale traducido; lo que no, cae al idioma de casa.
    assert.equal(en.data.categories[0].name, 'Small plates');
    assert.equal(en.data.items[0].name, 'Pan con tomate');

    // Y el panel lo dice con números, en vez de dejarlo en una sorpresa.
    const cob = await srv.request('/api/menu/i18n');
    const ingles = cob.data.coverage.find((c) => c.lang === 'en');
    assert.equal(ingles.total, 3, 'dos textos del plato y el nombre de la categoría');
    assert.equal(ingles.done, 1);
    assert.equal(ingles.pct, 33);
    assert.equal(cob.data.coverage.find((c) => c.lang === 'de').done, 0);

    // Sin clave de traductor configurada, se dice; no se falla en silencio.
    if (!process.env.MAITRE_DEEPL_KEY) {
      const r = await srv.request('/api/menu/translate', { method: 'POST' });
      assert.equal(r.status, 503);
      assert.match(r.data.message, /no está activada/);
    }
  });
});

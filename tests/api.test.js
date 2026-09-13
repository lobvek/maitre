import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signup } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
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
  test('el plan Mesa bloquea pedidos y analítica de servicio', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Basico Test' });
    const cat = await srv.request('/api/menu/categories', { method: 'POST', body: { name: 'Carta' } });
    const item = await srv.request('/api/menu/items', { method: 'POST', body: { name: 'Agua', price: 2, category_id: cat.data.id } });
    const tables = await srv.request('/api/tables');
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'mesa' } });

    const analitica = await srv.request('/api/analytics/summary');
    assert.equal(analitica.status, 402);

    const carta = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}`, { cookies: false });
    assert.equal(carta.data.can_order, false);
    assert.equal(carta.data.can_call, true);

    const pedido = await srv.request(`/api/public/${alta.venue.slug}/${tables.data.tables[0].token}/order`, {
      method: 'POST', cookies: false, body: { lines: [{ item_id: item.data.id, qty: 1 }] },
    });
    assert.equal(pedido.status, 403);
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
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'conectado' } });
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
    await signup(srv.request, { venue_name: 'Webhook Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'conectado' } });
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
    assert.deepEqual(b.data.plans.map((p) => p.id), ['mesa', 'servicio', 'conectado', 'founders']);
    assert.equal(b.data.plans.find((p) => p.id === 'servicio').price_cents, 3900);
  });

  test('el pago con el móvil solo entra con el plan Conectado', async () => {
    const { data: alta } = await signup(srv.request, { venue_name: 'Pago Plan Test' });
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'servicio' } });
    await srv.request('/api/venue', { method: 'PATCH', body: { payment_mode: 'online_required' } });
    const t = (await srv.request('/api/tables')).data.tables[0];
    const carta = await srv.request(`/api/public/${alta.venue.slug}/${t.token}`, { cookies: false });
    assert.equal(carta.data.payment.online, false);
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
    await srv.request('/api/billing/plan', { method: 'POST', body: { plan: 'conectado' } });
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

// Pantalla de sala: pedidos en vivo, avisos del comensal y estado de mesas.
import { api, money, esc, el, $, $$, toast, stream, modal, confirmDialog, icon, loader, soporteUrl } from '/js/core.js';
import { flip, haptic, ocupado, transicion } from '/js/motion.js';

const state = {
  me: null, orders: [], calls: [], tables: [], zones: [], tab: 'tickets',
  station: localStorage.getItem('maitre_station') || '',
  sound: localStorage.getItem('maitre_sound') !== '0',
};
const COLS = [
  { id: 'new', label: 'Nuevos', next: 'Aceptar' },
  { id: 'accepted', label: 'Aceptados', next: 'A cocina' },
  { id: 'preparing', label: 'En preparación', next: 'Servido' },
  { id: 'served', label: 'Servidos', next: 'Cobrar' },   // «Cerrar» si el pedido ya venía pagado
];

// Pitido sintetizado: sin ficheros de audio. El navegador no deja sonar nada hasta que
// alguien toca la pantalla, así que el contexto se crea una vez y se reactiva al primer toque.
let audioCtx;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

function beep(veces = 1) {
  if (!state.sound) return;
  const ctx = unlockAudio();
  if (!ctx) return;
  for (let i = 0; i < veces; i++) {
    const t0 = ctx.currentTime + i * 0.22;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, t0);
    o.frequency.setValueAtTime(1170, t0 + 0.1);
    o.type = 'sine';
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    o.start(t0); o.stop(t0 + 0.22);
  }
}

const can = (f) => state.me?.venue?.plan_features?.includes(f);

async function boot() {
  try { state.me = await api('/api/auth/me'); }
  catch { location.href = '/entrar?next=/sala'; return; }
  // Plan Mesa: pantalla de sala sencilla. Lo avanzado (barra/cocina, comandas, 86) es del plan Servicio.
  if (!can('kds')) {
    $('#station').classList.add('hidden');
    $('#agotados').classList.add('hidden');
    state.station = '';
  }
  $('#venue').textContent = state.me.venue?.name || 'Sala';
  document.title = `Sala · ${state.me.venue?.name || 'Maitre'}`;
  if (state.me.venue?.brand_color) document.documentElement.style.setProperty('--brand', state.me.venue.brand_color);
  await refresh();
  connect();
  setInterval(paint, 15000);
  // Fiabilidad (estudio, tabla 13): un pedido no puede perderse. Si lleva más de 3 min sin
  // aceptarse, la pantalla insiste cada 45 s hasta que alguien lo atiende.
  setInterval(() => {
    const olvidados = state.orders.filter((o) => o.status === 'new' && belongsHere(o) && mins(o.created_at) >= 3);
    if (olvidados.length) { beep(3); toast(`${olvidados.length} pedido(s) sin aceptar desde hace más de 3 min`, 'err'); }
  }, 45000);
  bindChrome();
  paintGate();
}

async function refresh() {
  const [orders, calls, tables] = await Promise.all([
    api('/api/orders?scope=open'), api('/api/orders/pending-calls'), api('/api/tables'),
  ]);
  state.orders = orders; state.calls = calls; state.tables = tables.tables; state.zones = tables.zones;
  paint();
}

function connect() {
  stream('/api/orders/stream', {
    onopen: () => { $('#dot').classList.remove('off'); $('#livetxt').textContent = 'en directo'; },
    onDead: () => { $('#dot').classList.add('off'); $('#livetxt').textContent = 'sesión caducada'; location.href = '/entrar?next=/sala'; },
    'order.created': (o) => { upsert(o); beep(2); toast(`Pedido nuevo · mesa ${o.table_name}`, 'ok'); paint(); },
    'order.updated': (o) => { upsert(o); paint(); },
    'call.created': (c) => { state.calls.unshift(c); beep(); toast(`Aviso de la mesa ${c.table_name || ''}`, 'ok'); paint(); },
    'call.updated': (c) => { state.calls = state.calls.filter((x) => x.id !== c.id); paint(); },
    'table.updated': () => api('/api/tables').then((r) => { state.tables = r.tables; paint(); }),
    'tables.changed': () => refresh(),
    'review.created': (r) => toast(`Mesa ${r.table_name} os ha valorado con ${'★'.repeat(r.rating)}`, 'ok'),
  });
  setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(() => {}); }, 60000);
}

function upsert(order) {
  const i = state.orders.findIndex((o) => o.id === order.id);
  const closed = ['paid', 'cancelled'].includes(order.status);
  if (i >= 0) closed ? state.orders.splice(i, 1) : (state.orders[i] = order);
  else if (!closed) state.orders.unshift(order);
}

const mins = (iso) => Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 60000);
/** La antigüedad en corto: «7 min», «3 h», «2 d». En barra nadie lee «14445 min». */
const edad = (m) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`);

/** Líneas del pedido que le tocan a esta estación (barra o cocina). */
function linesFor(order) {
  if (!state.station) return order.items;
  return order.items.filter((li) => (li.station || '') === state.station);
}
const belongsHere = (order) => !state.station || linesFor(order).length > 0;

/** Repinta moviendo los tickets de columna con animación (FLIP), no de un salto. */
function paint() {
  const tickets = [...document.querySelectorAll('.ticket[data-flip-id]')];
  if (tickets.length) return flip(tickets, pintarTodo);
  pintarTodo();
}

function pintarTodo() {
  // Avisos
  $('#calls').innerHTML = state.calls.map((c) => {
    const label = { waiter: icon('hand') + ' Camarero', bill: icon('receipt') + ' La cuenta',
      water: icon('drop') + ' Agua', help: icon('help') + ' Duda' }[c.type] || c.type;
    return `<div class="call"><strong>Mesa ${esc(c.table_name || '—')}</strong> ${label}
      <span class="muted">${edad(mins(c.created_at))}</span>
      <button class="btn sm green" data-call="${c.id}">Hecho</button></div>`;
  }).join('');
  $$('[data-call]').forEach((b) => b.onclick = async () => {
    await api(`/api/orders/calls/${b.dataset.call}`, { method: 'PATCH' });
    state.calls = state.calls.filter((c) => c.id !== Number(b.dataset.call));
    paint();
  });

  // Pedidos
  $('#tickets').innerHTML = COLS.map((col) => {
    const list = state.orders.filter((o) => o.status === col.id && belongsHere(o));
    return `<div class="col"><h2>${col.label}<span>${list.length}</span></h2>
      <div class="list">${list.map((o) => ticket(o, col)).join('') || '<div class="muted" style="font-size:13px;padding:6px">—</div>'}</div></div>`;
  }).join('');

  $$('[data-adv]').forEach((b) => b.onclick = () => ocupado(b, () => advance(Number(b.dataset.adv))));
  $$('[data-print]').forEach((b) => b.onclick = () => printTicket(state.orders.find((o) => o.id === Number(b.dataset.print))));
  $$('[data-claim]').forEach((b) => b.onclick = () => claim(Number(b.dataset.claim), false));
  $$('[data-release]').forEach((b) => b.onclick = () => claim(Number(b.dataset.release), true));
  $$('[data-cancel]').forEach((b) => b.onclick = () => cancelOrder(Number(b.dataset.cancel)));

  // Mesas
  $('#mesas').innerHTML = state.zones.map((z) => {
    const list = state.tables.filter((t) => t.zone_id === z.id);
    if (!list.length) return '';
    return `<h3 style="margin:18px 0 10px">${esc(z.name)}</h3><div class="mesas stagger">${list.map(mesa).join('')}</div>`;
  }).join('') + (() => {
    const loose = state.tables.filter((t) => !t.zone_id);
    return loose.length ? `<h3 style="margin:18px 0 10px">Sin zona</h3><div class="mesas">${loose.map(mesa).join('')}</div>` : '';
  })();
  $$('[data-mesa]').forEach((c) => c.onclick = () => openTable(Number(c.dataset.mesa)));
}

function ticket(o, col) {
  const age = mins(o.created_at);
  const cls = age > 15 ? 'bad' : age > 8 ? 'warn' : '';
  const mio = o.claimed_by && o.claimed_by === state.me.user.id;
  const deOtro = o.claimed_by && !mio;
  return `<div class="ticket ${age < 1 && o.status === 'new' ? 'new' : ''} ${age > 20 ? 'late' : ''} ${mio ? 'mine' : ''}" data-flip-id="o${o.id}">
    <header><span class="mesa">Mesa ${esc(o.table_name)}
      ${o.payment_status === 'paid' ? `<span class="tag green">${icon('check')}Pagado</span>` : ''}</span>
      <span class="clock ${cls}">${esc(o.code)} · ${edad(age)}</span></header>
    ${o.claimed_by ? `<div class="claimed">${icon('user')}${mio ? 'Lo estás metiendo tú' : esc(o.claimed_name) + ' lo está metiendo'}</div>` : ''}
    <ul>${linesFor(o).map((li) => `<li><b>${li.qty}×</b><span>${esc(li.name)}
      ${!state.station && li.station ? `<span class="st">${li.station === 'barra' ? 'barra' : 'cocina'}</span>` : ''}
      ${li.options?.length ? `<div class="opts">${esc(li.options.map((x) => x.name).join(', '))}</div>` : ''}
      ${li.note ? `<div class="opts"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-note"/></svg> ${esc(li.note)}</div>` : ''}</span></li>`).join('')}</ul>
    ${o.note ? `<div style="padding:0 12px 8px" class="opts"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-note"/></svg> ${esc(o.note)}</div>` : ''}
    ${o.guest_name ? `<div style="padding:0 12px 8px" class="opts"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-user"/></svg> ${esc(o.guest_name)}</div>` : ''}
    <footer><strong>${money(o.total_cents)}</strong><span class="grow"></span>
      ${can('kds') ? `<button class="btn sm ghost" data-print="${o.id}" title="Imprimir comanda">${icon('print')}</button>` : ''}
      <button class="btn sm ghost" data-cancel="${o.id}" title="Cancelar">${icon('x')}</button>
      ${o.status === 'new' && !o.claimed_by
        ? `<button class="btn sm" data-claim="${o.id}">Lo cojo yo</button>` : ''}
      ${mio ? `<button class="btn sm ghost" data-release="${o.id}" title="Soltarlo">${icon('refresh')}</button>` : ''}
      <button class="btn sm primary" data-adv="${o.id}" ${deOtro ? 'disabled title="Lo tiene ' + esc(o.claimed_name) + '"' : ''}>
        ${o.status === 'served' && o.payment_status === 'paid' ? 'Cerrar' : mio ? 'Metido en TPV' : col.next}</button></footer>
  </div>`;
}

function mesa(t) {
  const label = { free: 'Libre', occupied: 'Ocupada', reserved: 'Reservada', cleaning: 'Limpieza' }[t.status];
  return `<div class="mesa-card ${t.status}" data-mesa="${t.id}">
    <div class="n">${esc(t.name)}</div>
    <div style="font-size:12.5px" class="muted">${label} · ${t.seats}p</div>
    ${t.merged_names ? `<div class="tag blue" style="margin-top:6px">+ ${esc(t.merged_names)}</div>` : ''}
    ${t.merged_into_name ? `<div class="tag" style="margin-top:6px">unida a ${esc(t.merged_into_name)}</div>` : ''}
    ${t.open_orders ? `<div style="margin-top:6px"><span class="tag green">${t.open_orders} pedido${t.open_orders > 1 ? 's' : ''} · ${money(t.open_total_cents)}</span></div>` : ''}
    ${t.open_calls ? `<div style="margin-top:6px"><span class="tag amber"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-bell"/></svg> aviso</span></div>` : ''}
  </div>`;
}

/** Comanda en papel: solo las líneas de la estación que se está mirando. */
function printTicket(order) {
  if (!order) return;
  const lineas = linesFor(order);
  const titulo = state.station ? state.station.toUpperCase() : 'COMANDA';
  document.getElementById('printarea').innerHTML = `
    <h2 style="margin:0 0 4px">${esc(state.me.venue.name)}</h2>
    <div>${titulo} · Mesa ${esc(order.table_name)} · ${esc(order.code)}</div>
    <div>${new Date().toLocaleString('es-ES')}</div>
    <hr>
    ${lineas.map((li) => `<div><strong>${li.qty} x ${esc(li.name)}</strong>
      ${li.options?.length ? `<div>&nbsp;&nbsp;${esc(li.options.map((x) => x.name).join(', '))}</div>` : ''}
      ${li.note ? `<div>&nbsp;&nbsp;* ${esc(li.note)}</div>` : ''}</div>`).join('')}
    <hr>
    ${order.note ? `<div>Nota: ${esc(order.note)}</div>` : ''}
    <div>${order.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE DE COBRO'}</div>`;
  print();
}

/** Lista rápida de agotados («86»): marcar sin entrar a editar la carta. */
async function openAgotados() {
  const items = await api('/api/menu/items');
  const body = el('div', { html: `
    <input id="q" placeholder="Buscar producto…" style="margin-bottom:12px">
    <div id="lista" style="max-height:52vh;overflow:auto"></div>` });
  const nombre = (i) => i.name.es || Object.values(i.name)[0] || '';
  const draw = (filtro = '') => {
    body.querySelector('#lista').innerHTML = items
      .filter((i) => i.active && nombre(i).toLowerCase().includes(filtro.toLowerCase()))
      .map((i) => `<div class="spread" style="padding:8px 0;border-bottom:1px solid var(--line-2)">
        <span>${esc(nombre(i))}</span>
        <button class="btn sm ${i.available ? 'green' : 'danger'}" data-it="${i.id}">
          ${i.available ? 'Disponible' : 'Agotado'}</button></div>`).join('')
      || '<div class="muted" style="padding:10px">Sin resultados.</div>';
    body.querySelectorAll('[data-it]').forEach((b) => b.onclick = async () => {
      const it = items.find((x) => x.id === Number(b.dataset.it));
      const upd = await api(`/api/menu/items/${it.id}`, { method: 'PATCH', body: { available: !it.available } });
      it.available = upd.available;
      b.className = `btn sm ${it.available ? 'green' : 'danger'}`;
      b.textContent = it.available ? 'Disponible' : 'Agotado';
      toast(`${nombre(it)}: ${it.available ? 'disponible' : 'agotado'}`, 'ok');
    });
  };
  body.querySelector('#q').oninput = (e) => draw(e.target.value);
  draw();
  await modal({ title: 'Productos agotados', body, save: '', cancel: 'Cerrar' });
}

/** Marca (o suelta) un pedido como «lo estoy metiendo yo en el TPV». */
async function claim(id, release) {
  try {
    const o = await api(`/api/orders/${id}/claim`, { method: 'POST', body: { release } });
    haptic(release ? 8 : 18);
    upsert(o); paint();
    if (!release) toast('Es tuyo. Mételo en el TPV y dale a «Metido».', 'ok');
  } catch (err) { toast(err.message, 'err'); await refresh(); }
}

async function advance(id) {
  haptic(14);
  const o = state.orders.find((x) => x.id === id);
  // Si ya se pagó desde el móvil no hay nada que cobrar: solo se cierra.
  if (o?.status === 'served' && o.payment_status === 'paid') {
    await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status: 'paid' } });
    toast('Pedido cerrado (ya estaba pagado)', 'ok');
    await refresh();
    return;
  }
  if (o?.status === 'served') {
    const method = await modal({
      title: `Cobrar mesa ${o.table_name} · ${money(o.total_cents)}`,
      body: el('div', { html: `<div class="field"><label>Forma de pago</label>
        <select id="pm"><option value="card">Tarjeta</option><option value="cash">Efectivo</option><option value="app">App / otro</option></select></div>` }),
      save: 'Cobrar',
      onSave: (root) => root.querySelector('#pm').value,
    });
    if (!method) return;
    await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status: 'paid', payment_method: method } });
    toast('Pedido cobrado', 'ok');
  } else {
    await api(`/api/orders/${id}/status`, { method: 'PATCH' });
  }
  await refresh();
}

async function cancelOrder(id) {
  const ok = await confirmDialog('Cancelar pedido', '¿Seguro que quieres cancelar este pedido? Se avisará a la mesa.', 'Sí, cancelar');
  if (!ok) return;
  try {
    await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status: 'cancelled', reason: 'Cancelado en sala' } });
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
}

async function openTable(id) {
  const t = state.tables.find((x) => x.id === id);
  const bill = await api(`/api/orders/table/${id}/bill`);
  const body = el('div', { html: `
    ${bill.billed_at_table ? `<div class="notice info" style="margin-bottom:14px">Esta mesa está unida:
      la cuenta se cobra en la <strong>mesa ${esc(state.tables.find((x) => x.id === bill.billed_at_table)?.name || bill.billed_at_table)}</strong>.</div>` : ''}
    <div class="row wrap-row" style="margin-bottom:14px">
      ${['free', 'occupied', 'reserved', 'cleaning'].map((s) => `<button class="btn sm ${t.status === s ? 'primary' : ''}" data-st="${s}">
        ${({ free: 'Libre', occupied: 'Ocupada', reserved: 'Reservada', cleaning: 'Limpieza' })[s]}</button>`).join('')}
    </div>
    ${bill.orders.length ? `<table><tbody>
      ${bill.orders.flatMap((o) => o.items).map((li) => `<tr><td>${li.qty} × ${esc(li.name)}</td>
        <td class="num">${money(li.line_total_cents)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td class="num"><strong>${money(bill.total_cents)}</strong></td></tr>
    </tbody></table>
    <div class="row" style="margin-top:14px"><button class="btn green grow" id="close-table">Cobrar toda la mesa</button></div>`
      : '<div class="empty">Sin consumiciones abiertas.</div>'}
    ${can('tables') ? `<hr>
    <div class="row wrap-row">
      <select id="destino" style="width:auto">
        ${state.tables.filter((x) => x.id !== id).map((x) => `<option value="${x.id}">Mesa ${esc(x.name)}</option>`).join('')}
      </select>
      <button class="btn sm" id="mover">Cambiar de mesa</button>
      <button class="btn sm" id="unir">Unir a esa mesa</button>
      ${t.merged_into_name || t.merged_names ? '<button class="btn sm" id="separar">Separar mesas</button>' : ''}
    </div>
    <div class="help">«Cambiar de mesa» se lleva todo lo abierto. «Unir» hace que se cobre en una sola cuenta.</div>` : ''}
    <div class="fse" style="margin-top:16px">QR de la mesa: <span class="mono">${esc(t.url)}</span></div>` });

  const destino = () => Number(body.querySelector('#destino').value);
  const cerrar = () => document.querySelector('.modal-bg')?.remove();
  if (body.querySelector('#mover')) body.querySelector('#mover').onclick = async () => {
    const r = await api(`/api/tables/${id}/move`, { method: 'POST', body: { to: destino() } });
    cerrar(); toast(`${r.moved} pedido(s) movidos de la ${r.from} a la ${r.to}`, 'ok'); await refresh();
  };
  if (body.querySelector('#unir')) body.querySelector('#unir').onclick = async () => {
    try {
      const r = await api(`/api/tables/${id}/merge`, { method: 'POST', body: { into: destino() } });
      cerrar(); toast(`Mesa ${r.table} unida a la ${r.into}`, 'ok'); await refresh();
    } catch (err) { toast(err.message, 'err'); }
  };
  if (body.querySelector('#separar')) body.querySelector('#separar').onclick = async () => {
    await api(`/api/tables/${id}/unmerge`, { method: 'POST' });
    cerrar(); toast('Mesas separadas', 'ok'); await refresh();
  };

  body.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
    await api(`/api/tables/${id}`, { method: 'PATCH', body: { status: b.dataset.st } });
    body.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('primary', x === b));
    await refresh();
  });
  const closeBtn = body.querySelector('#close-table');
  if (closeBtn) closeBtn.onclick = async () => {
    const r = await api(`/api/orders/table/${id}/close`, { method: 'POST', body: { payment_method: 'card' } });
    toast(`Mesa cobrada: ${money(r.charged_cents)}`, 'ok');
    document.querySelector('.modal-bg')?.remove();
    await refresh();
  };
  await modal({ title: `Mesa ${t.name}`, body, save: 'Cerrar', cancel: '' });
}

async function newOrder() {
  const [menu, tables] = await Promise.all([api('/api/menu/items'), Promise.resolve(state.tables)]);
  const lines = [];
  const body = el('div', { html: `
    <div class="field"><label>Mesa</label><select id="table">
      ${tables.map((t) => `<option value="${t.id}">Mesa ${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Añadir producto</label><select id="pick">
      <option value="">— elige —</option>
      ${menu.filter((i) => i.active && i.available).map((i) => `<option value="${i.id}">${esc(i.name.es || Object.values(i.name)[0])} · ${money(i.price_cents)}</option>`).join('')}
    </select></div>
    <div id="lines"></div>` });
  const draw = () => {
    body.querySelector('#lines').innerHTML = lines.length
      ? `<table><tbody>${lines.map((l, i) => `<tr><td>${l.qty} × ${esc(l.name)}</td>
          <td class="num">${money(l.price * l.qty)}</td><td><button class="btn ghost sm" data-rm="${i}"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></td></tr>`).join('')}
        <tr><td><strong>Total</strong></td><td class="num"><strong>${money(lines.reduce((n, l) => n + l.price * l.qty, 0))}</strong></td><td></td></tr></tbody></table>`
      : '<div class="muted" style="font-size:13px">Sin líneas todavía.</div>';
    body.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { lines.splice(Number(b.dataset.rm), 1); draw(); });
  };
  body.querySelector('#pick').onchange = (e) => {
    const item = menu.find((i) => i.id === Number(e.target.value));
    if (!item) return;
    const existing = lines.find((l) => l.item_id === item.id);
    if (existing) existing.qty++;
    else lines.push({ item_id: item.id, name: item.name.es || Object.values(item.name)[0], price: item.price_cents, qty: 1 });
    e.target.value = ''; draw();
  };
  draw();
  const done = await modal({
    title: 'Pedido tomado en sala', body, save: 'Enviar a cocina',
    onSave: async (root) => {
      if (!lines.length) throw new Error('Añade al menos un producto.');
      return api('/api/orders', { method: 'POST', body: {
        table_id: Number(root.querySelector('#table').value),
        lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty })),
      } });
    },
  });
  if (done) { toast(`Pedido ${done.code} creado`, 'ok'); await refresh(); }
}

async function paintGate() {
  const v = state.me.venue;
  const box = $('#gate');
  if (v.order_gate === 'code') {
    box.innerHTML = `<span class="tag amber">Código de mesa: <strong id="code">${esc(v.order_code || '—')}</strong></span>
      <button class="btn ghost sm" id="rot" title="Generar otro código">↻</button>`;
    $('#rot').onclick = async () => {
      const r = await api('/api/venue/order-code', { method: 'POST' });
      v.order_code = r.order_code;
      $('#code').textContent = r.order_code;
      toast('Código nuevo: ' + r.order_code, 'ok');
    };
  } else if (v.order_gate === 'occupied') {
    box.innerHTML = '<span class="tag">Solo se pide en mesas abiertas</span>';
  } else {
    box.innerHTML = '';
  }
}

/** Notificaciones en este móvil: el camarero se entera con el teléfono en el bolsillo. */
async function setupPush() {
  const btn = $('#push');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { btn.classList.add('hidden'); return; }
  let reg;
  try { reg = await navigator.serviceWorker.register('/sw.js'); }
  catch (err) { console.warn('avisos no disponibles:', err.message); btn.classList.add('hidden'); return; }
  const paintBtn = async () => {
    const sub = await reg.pushManager.getSubscription();
    btn.innerHTML = icon('vibrate') + (sub ? ' Avisos activos' : ' Avisos');
    btn.classList.toggle('green', !!sub);
    return sub;
  };
  await paintBtn();
  btn.onclick = async () => {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
      await sub.unsubscribe(); await paintBtn(); toast('Avisos desactivados en este móvil'); return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Sin permiso no se pueden enviar avisos. En iPhone, añade la sala a la pantalla de inicio primero.', 'err');
    const { key } = await api('/api/push/key');
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const nueva = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: nueva.toJSON() } });
    await paintBtn();
    toast('Avisos activados. Te llega una prueba.', 'ok');
    api('/api/push/test', { method: 'POST' }).catch(() => {});
  };
}

function bindChrome() {
  setupPush().catch((e) => console.warn('push', e.message));
  $('#station').value = state.station;
  $('#station').onchange = (e) => {
    state.station = e.target.value;
    localStorage.setItem('maitre_station', state.station);
    paint();
  };
  $('#agotados').onclick = () => openAgotados().catch((e) => toast(e.message, 'err'));
  // Los navegadores no dejan sonar nada hasta que el usuario toca la pantalla.
  addEventListener('pointerdown', unlockAudio, { once: true });
  addEventListener('keydown', unlockAudio, { once: true });
  $$('.tabs button').forEach((b) => b.onclick = () => transicion(() => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    state.tab = b.dataset.tab;
    $('#tickets').classList.toggle('hidden', state.tab !== 'tickets');
    $('#mesas').classList.toggle('hidden', state.tab !== 'mesas');
  }));
  $('#sound').onclick = () => {
    state.sound = !state.sound;
    localStorage.setItem('maitre_sound', state.sound ? '1' : '0');
    $('#sound').innerHTML = icon(state.sound ? 'sound-on' : 'sound-off');
    if (state.sound) beep();
  };
  $('#sound').innerHTML = icon(state.sound ? 'sound-on' : 'sound-off');
  $('#ayuda').href = soporteUrl(`${state.me.venue?.name || 'un local'}, desde la pantalla de sala`);
  $('#new-order').onclick = () => newOrder().catch((e) => toast(e.message, 'err'));
}

boot();

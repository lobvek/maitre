// Carta del comensal: consultar, filtrar, pedir desde la mesa y avisar al personal.
import { api, money, esc, el, $, toast, stream, timeAgo, icon, loader, FSE_TEXT } from '/js/core.js';
import { arrastrable, volarAlCarrito, haptic, ocupado, MACRO } from '/js/motion.js';

const [, , slug, tableToken = 'preview'] = location.pathname.split('/');
const base = `/api/public/${encodeURIComponent(slug)}/${encodeURIComponent(tableToken)}`;

const T = {
  es: { menu: 'Carta', search: 'Buscar en la carta', cart: 'Mi pedido', send: 'Enviar pedido', call: 'Avisar', add: 'Añadir',
    total: 'Total', empty: 'Aún no has añadido nada.', filters: 'Filtros', note: 'Comentario para la cocina',
    yourOrders: 'Tus pedidos', bill: 'Cuenta de la mesa', close: 'Cerrar', allergensOff: 'Ocultar platos con', diet: 'Dieta',
    sent: 'Pedido enviado a la barra', called: 'El personal ya lo sabe', name: 'Tu nombre (opcional)', out: 'Agotado',
    payNow: 'Pagar y enviar', payVenue: 'Pagar en el local', confirmed: 'Pedido confirmado',
    payHint: 'Se cobra ahora; el pedido llega a la barra en cuanto se confirma el pago.',
    venueHint: 'Pagarás en el local al terminar.' },
  ca: { menu: 'Carta', search: 'Cerca a la carta', cart: 'La meva comanda', send: 'Enviar comanda', call: 'Avisar', add: 'Afegir',
    total: 'Total', empty: 'Encara no hi has afegit res.', filters: 'Filtres', note: 'Comentari per a la cuina',
    yourOrders: 'Les teves comandes', bill: 'Compte de la taula', close: 'Tancar', allergensOff: 'Amaga plats amb', diet: 'Dieta',
    sent: 'Comanda enviada a la barra', called: 'El personal ja ho sap', name: 'El teu nom (opcional)', out: 'Exhaurit',
    payNow: 'Pagar i enviar', payVenue: 'Pagar al local', confirmed: 'Comanda confirmada',
    payHint: 'Es cobra ara; la comanda arriba a la barra quan es confirma el pagament.',
    venueHint: 'Pagaràs al local en acabar.' },
  en: { menu: 'Menu', search: 'Search the menu', cart: 'My order', send: 'Send order', call: 'Call staff', add: 'Add',
    total: 'Total', empty: 'Nothing added yet.', filters: 'Filters', note: 'Note for the kitchen',
    yourOrders: 'Your orders', bill: 'Table bill', close: 'Close', allergensOff: 'Hide dishes with', diet: 'Diet',
    sent: 'Order sent to the bar', called: 'Staff have been notified', name: 'Your name (optional)', out: 'Sold out',
    payNow: 'Pay and send', payVenue: 'Pay at the venue', confirmed: 'Order confirmed',
    payHint: 'You pay now; the order reaches the bar once the payment clears.',
    venueHint: 'You will pay at the venue afterwards.' },
};

const state = {
  data: null,
  lang: localStorage.getItem('maitre_lang') || null,
  cart: JSON.parse(localStorage.getItem(`maitre_cart_${slug}_${tableToken}`) || '[]'),
  sessionId: localStorage.getItem(`maitre_sess_${slug}_${tableToken}`) || '',
  search: '',
  activeCat: null,
  hideAllergens: JSON.parse(localStorage.getItem('maitre_avoid') || '[]'),
  diet: null,
  orders: [],
  bill: null,
  tableCode: localStorage.getItem(`maitre_code_${slug}`) || '',
};
const t = (k) => (T[state.lang] || T.es)[k] || k;
const saveCart = () => localStorage.setItem(`maitre_cart_${slug}_${tableToken}`, JSON.stringify(state.cart));

// --- Carga ------------------------------------------------------------------
async function load() {
  const q = state.lang ? `?lang=${state.lang}` : '';
  try {
    state.data = await api(base + q);
  } catch (err) {
    $('#app').innerHTML = `<div class="empty" style="padding-top:80px"><span class="ico"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-ban"/></svg></span>
      <h2>${esc(err.message)}</h2><p class="muted">Pide ayuda al personal del local.</p></div>`;
    return;
  }
  state.lang = state.lang || state.data.lang;
  document.title = `${state.data.venue.name} · Carta`;
  document.documentElement.lang = state.lang;
  if (state.data.venue.brand_color) {
    document.documentElement.style.setProperty('--brand', state.data.venue.brand_color);
    document.documentElement.style.setProperty('--brand-soft', state.data.venue.brand_color + '1f');
  }
  if (!state.activeCat) state.activeCat = state.data.categories[0]?.id ?? null;

  if (state.data.table) {
    const { session_id } = await api(`${base}/scan`, { method: 'POST', body: { session_id: state.sessionId } });
    state.sessionId = session_id;
    localStorage.setItem(`maitre_sess_${slug}_${tableToken}`, session_id);
    await refreshOrders();
    const vuelta = new URLSearchParams(location.search).get('pedido');
    if (vuelta) {
      history.replaceState(null, '', location.pathname);
      try { showConfirmation(await api(`${base}/order/${Number(vuelta)}`)); } catch { /* pedido antiguo */ }
    }
    stream(`${base}/stream`, {
      'order.updated': (o) => { mergeOrder(o); render(); if (o.status === 'served') toast('Tu pedido está servido', 'ok'); },
      'order.created': () => refreshOrders().then(render),
      'call.updated': () => refreshOrders().then(render),
      // El móvil del comensal también se duerme mientras espera el pedido.
      onResync: () => refreshOrders().then(render).catch(() => {}),
    });
  }
  render();
}

function mergeOrder(order) {
  const i = state.orders.findIndex((o) => o.id === order.id);
  if (i >= 0) state.orders[i] = order;
  else if (order.session_id === state.sessionId) state.orders.unshift(order);
}

async function refreshOrders() {
  if (!state.data?.table) return;
  const r = await api(`${base}/orders?session_id=${encodeURIComponent(state.sessionId)}`);
  state.orders = r.orders || [];
  state.bill = r.bill || null;
}

// --- Filtros ----------------------------------------------------------------
function visibleItems(catId) {
  const q = state.search.trim().toLowerCase();
  return state.data.items.filter((i) => {
    if (catId != null && i.category_id !== catId) return false;
    if (q && !(`${i.name} ${i.description}`.toLowerCase().includes(q))) return false;
    if (state.hideAllergens.some((a) => i.allergens.includes(a))) return false;
    if (state.diet && !i.tags.includes(state.diet)) return false;
    return true;
  });
}

const cartCount = () => state.cart.reduce((n, l) => n + l.qty, 0);
const cartTotal = () => state.cart.reduce((n, l) => n + l.unit * l.qty, 0);

// --- Render -----------------------------------------------------------------
function render() {
  const d = state.data;
  const v = d.venue;
  const searching = state.search.trim().length > 0;
  const cats = searching ? d.categories.filter((c) => visibleItems(c.id).length) : d.categories;

  const logo = v.logo_path
    ? `<img class="m-logo" src="${esc(v.logo_path)}" alt="">`
    : `<div class="m-logo letter">${esc(v.name.trim()[0] || 'M')}</div>`;

  const langSwitch = v.languages.length > 1
    ? `<select id="lang" class="m-lang">
        ${v.languages.map((l) => `<option value="${l}" ${l === state.lang ? 'selected' : ''}>${l.toUpperCase()}</option>`).join('')}
       </select>` : '';

  const body = cats.map((c) => {
    const items = visibleItems(c.id);
    if (!items.length) return '';
    return `<h2 class="cat-title" id="cat-${c.id}">${esc(c.name)}</h2>
      ${c.description ? `<div class="cat-desc">${esc(c.description)}</div>` : ''}
      ${items.map(dishHtml).join('')}`;
  }).join('');

  const uncategorised = visibleItems(null).filter((i) => !i.category_id);

  $('#app').innerHTML = `
    <header class="m-head">
      <div class="m-top">
        ${logo}
        <div class="grow">
          <div class="m-name">${esc(v.name)}</div>
          <div class="m-table">${d.table ? `Mesa ${esc(d.table.name)}` : 'Carta'}${v.city ? ` · ${esc(v.city)}` : ''}</div>
        </div>
        ${langSwitch}
      </div>
      <div class="m-tools">
        <input class="m-search" id="search" placeholder="${t('search')}" value="${esc(state.search)}" autocomplete="off">
        <button class="btn sm" id="filters"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-burger"/></svg></button>
      </div>
      ${cats.length > 1 ? `<div class="m-cats">${cats.map((c) =>
        `<div class="m-cat ${c.id === state.activeCat ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</div>`).join('')}</div>` : ''}
    </header>

    <main>
      ${d.preview && self === top ? `<div class="notice info" style="margin:14px 0">Estás viendo la carta de escaparate. Escanea el QR de tu mesa para pedir.</div>` : ''}
      ${d.gate?.closed_now
        ? `<div class="notice warn" style="margin:14px 0">Ahora mismo no se puede pedir desde el móvil.
           El servicio es de <strong>${esc(d.gate.hours)}</strong>. La carta la puedes mirar igual.</div>` : ''}
      ${d.table && d.can_order && d.gate?.mode === 'occupied' && !d.gate.table_open
        ? `<div class="notice warn" style="margin:14px 0">Puedes mirar la carta con calma. Para pedir desde el móvil,
           el personal tiene que abrir la mesa: avísales y listo.</div>` : ''}
      ${activeOrdersHtml()}
      ${body || `<div class="empty"><span class="ico"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-search"/></svg></span>No hay platos que coincidan.</div>`}
      ${uncategorised.length ? `<h2 class="cat-title">Otros</h2>${uncategorised.map(dishHtml).join('')}` : ''}

      ${v.service_note ? `<div class="notice" style="margin-top:26px">${esc(v.service_note)}</div>` : ''}
      ${v.wifi_ssid ? `<div class="notice" style="margin-top:10px"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-wifi"/></svg> Wifi <strong>${esc(v.wifi_ssid)}</strong>${v.wifi_password ? ` · clave <strong>${esc(v.wifi_password)}</strong>` : ''}</div>` : ''}

      <footer>
        <a class="m-maitre" href="/" target="_blank" rel="noopener">
          Carta digital de <img src="/assets/logotipo.png" alt="Maitre"></a>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Sin registro ni cookies de seguimiento</div>
        <div class="fse" style="text-align:left">${FSE_TEXT}</div>
        <a href="/privacidad" class="muted" style="font-size:12px">Aviso de privacidad</a>
      </footer>
    </main>

    ${d.table ? `<div class="m-bar">
      ${d.can_call ? `<button class="btn" id="btn-call">${icon('bell')} ${t('call')}</button>` : ''}
      ${d.can_order ? `<button class="btn primary" id="btn-cart"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-receipt"/></svg> ${t('cart')}${cartCount() ? ` · <span class="badge-qty">${cartCount()}</span> ${money(cartTotal(), v.currency)}` : ''}</button>` : ''}
      ${!d.can_order && state.bill?.total_cents ? `<button class="btn" id="btn-bill">${t('bill')} · ${money(state.bill.total_cents, v.currency)}</button>` : ''}
    </div>` : ''}`;

  bind();
}

function dishHtml(i) {
  const cur = state.data.venue.currency;
  const algs = i.allergens.map((a) => {
    const f = state.data.catalog.allergens.find((x) => x.id === a);
    return f ? `<span class="alg" title="${esc(f.label)}">${esc(f.short)}</span>` : '';
  }).join('');
  const tags = i.tags.map((tg) => {
    const f = state.data.catalog.tags.find((x) => x.id === tg);
    return f ? `<span class="tag">${icon(f.icon)}${esc(f.label)}</span>` : '';
  }).join('');
  const inCart = state.cart.filter((l) => l.item_id === i.id).reduce((n, l) => n + l.qty, 0);
  return `<div class="dish ${i.available ? '' : 'out'}" data-item="${i.id}">
    <div class="dish-body">
      <div class="dish-name">${esc(i.name)} ${inCart ? `<span class="badge-qty">${inCart}</span>` : ''}</div>
      ${i.description ? `<div class="dish-desc">${esc(i.description)}</div>` : ''}
      <div class="dish-meta">
        <span class="dish-price">${money(i.price_cents, cur)}</span>
        ${!i.available ? `<span class="tag red">${icon('ban')}${t('out')}</span>` : ''}
        ${tags}
        ${algs}
        ${i.kcal ? `<span class="muted" style="font-size:12px">${i.kcal} kcal</span>` : ''}
      </div>
    </div>
    ${i.image_path ? `<img class="dish-img" src="${esc(i.image_path)}" alt="" loading="lazy">` : ''}
  </div>`;
}

function activeOrdersHtml() {
  const open = state.orders.filter((o) => !['paid', 'cancelled'].includes(o.status));
  const served = state.orders.find((o) => ['served', 'paid'].includes(o.status));
  const askReview = state.data.can_review && served && !localStorage.getItem(`maitre_reviewed_${slug}_${tableToken}`);
  const reviewCard = askReview ? `<div class="card" style="margin-top:14px;padding:14px">
    <strong>¿Qué tal ha ido?</strong>
    <div class="row" style="margin-top:8px;gap:6px" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button class="btn sm" data-star="${n}" style="font-size:18px;padding:6px 10px">☆</button>`).join('')}</div>
  </div>` : '';
  if (!open.length) return reviewCard;
  const steps = ['new', 'accepted', 'preparing', 'served'];
  const label = { new: 'Recibido', accepted: 'Aceptado', preparing: 'En preparación', served: 'Servido' };
  return open.map((o) => `<div class="card" style="margin-top:14px;padding:14px">
    <div class="spread"><strong>Pedido ${esc(o.code)}</strong><span class="muted" style="font-size:12.5px">hace ${timeAgo(o.created_at)}</span></div>
    <div class="track">${steps.map((s) => `<div class="${steps.indexOf(o.status) >= steps.indexOf(s) ? 'on' : ''}"></div>`).join('')}</div>
    <div class="spread"><span class="tag green">${label[o.status] || o.status}</span>
      <span>${o.item_count} art. · <strong>${money(o.total_cents, state.data.venue.currency)}</strong></span></div>
  </div>`).join('') + reviewCard;
}

function openReview(rating) {
  const served = state.orders.find((o) => ['served', 'paid'].includes(o.status));
  sheet(`<div class="sheet-head"><h3 style="margin:0">Gracias por valorar</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      <div style="font-size:26px;letter-spacing:4px;margin-bottom:12px">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
      <div class="field"><label>¿Algo que contarle al local? (opcional)</label><textarea id="rc" rows="2" maxlength="300"></textarea></div>
      <label class="row" style="font-weight:400"><input type="checkbox" id="optin"> <span>Quiero enterarme de las novedades de ${esc(state.data.venue.name)}</span></label>
      <div class="field hidden" id="mailf" style="margin-top:10px"><label>Tu email</label><input id="rm" type="email" placeholder="tu@email.com"></div>
      <p class="muted" style="font-size:12px;margin-top:12px">Solo el local recibe esta valoración. Tu email, únicamente si marcas la casilla.</p>
    </div>
    <div class="sheet-foot"><button class="btn primary grow" id="rs">Enviar</button></div>`, (bg, close) => {
    bg.querySelector('[data-close]').onclick = close;
    bg.querySelector('#optin').onchange = (e) => bg.querySelector('#mailf').classList.toggle('hidden', !e.target.checked);
    bg.querySelector('#rs').onclick = async () => {
      try {
        await api(`${base}/review`, { method: 'POST', body: {
          rating, comment: bg.querySelector('#rc').value, optin: bg.querySelector('#optin').checked,
          email: bg.querySelector('#rm').value, session_id: state.sessionId, order_id: served?.id,
        } });
        localStorage.setItem(`maitre_reviewed_${slug}_${tableToken}`, '1');
        close(); render(); toast('¡Gracias!', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  });
}

// --- Interacción -------------------------------------------------------------
function bind() {
  const d = state.data;
  const search = $('#search');
  if (search) search.oninput = (e) => {
    state.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos);
  };
  $('#lang') && ($('#lang').onchange = (e) => {
    state.lang = e.target.value; localStorage.setItem('maitre_lang', state.lang); load();
  });
  $('#filters') && ($('#filters').onclick = openFilters);
  document.querySelectorAll('.m-cat').forEach((c) => c.onclick = () => {
    state.activeCat = Number(c.dataset.cat);
    document.getElementById(`cat-${c.dataset.cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.m-cat').forEach((x) => x.classList.toggle('on', x === c));
  });
  document.querySelectorAll('.dish').forEach((el2) => el2.onclick = () => openDish(Number(el2.dataset.item)));
  $('#btn-cart') && ($('#btn-cart').onclick = openCart);
  $('#btn-call') && ($('#btn-call').onclick = openCall);
  $('#btn-bill') && ($('#btn-bill').onclick = openBill);
  document.querySelectorAll('[data-star]').forEach((b) => b.onclick = () => openReview(Number(b.dataset.star)));
}

function sheet(html, onMount) {
  const hoja = el('div', { class: 'sheet', html });
  const bg = el('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) cerrar(); } }, hoja);
  const cerrar = () => {
    hoja.style.transition = `transform .3s ${MACRO}`;
    hoja.style.transform = 'translateY(100%)';
    bg.style.transition = 'background .3s'; bg.style.background = 'rgba(35,36,28,0)';
    setTimeout(() => bg.remove(), 280);
  };
  document.body.append(bg);
  haptic(8);
  arrastrable(bg, hoja, () => bg.remove());     // se arrastra hacia abajo para cerrarla
  onMount?.(bg, cerrar);
  return bg;
}

function openDish(id) {
  const i = state.data.items.find((x) => x.id === id);
  if (!i || !state.data.can_order) return showInfo(i);
  if (!i.available) return toast(t('out'));
  let qty = 1;
  const cur = state.data.venue.currency;

  const groups = i.option_groups.map((g) => `
    <fieldset style="margin-bottom:14px"><legend>${esc(g.name)}${g.min_select ? ' *' : ''}
      ${g.max_select > 1 ? `<span class="muted"> (máx. ${g.max_select})</span>` : ''}</legend>
      ${g.options.map((o) => `<label class="opt">
        <input type="${g.max_select > 1 ? 'checkbox' : 'radio'}" name="g${g.id}" value="${o.id}" data-group="${g.id}"
          data-delta="${o.price_delta_cents}" ${o.available ? '' : 'disabled'}>
        <span class="grow">${esc(o.name)}${o.available ? '' : ' <span class="muted">(agotado)</span>'}</span>
        ${o.price_delta_cents ? `<span class="muted">+${money(o.price_delta_cents, cur)}</span>` : ''}
      </label>`).join('')}
    </fieldset>`).join('');

  sheet(`
    <div class="sheet-head">
      <div><h3 style="margin:0 0 4px">${esc(i.name)}</h3>
        <div class="muted" style="font-size:13.5px">${esc(i.description || '')}</div></div>
      <button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button>
    </div>
    <div class="sheet-body">
      ${i.image_path ? `<img src="${esc(i.image_path)}" style="width:100%;border-radius:12px;margin-bottom:14px" alt="">` : ''}
      ${allergenLine(i)}
      ${groups}
      ${state.data.allow_notes ? `<div class="field"><label>${t('note')}</label>
        <input id="note" placeholder="Sin cebolla, poco hecho…" maxlength="140"></div>` : ''}
    </div>
    <div class="sheet-foot">
      <div class="qty"><button data-q="-1" aria-label="Quitar uno">${icon('minus')}</button>
        <span id="q" class="tabular">1</span><button data-q="1" aria-label="Añadir uno">${icon('plus')}</button></div>
      <button class="btn primary grow" id="add">${t('add')} · <span id="sum">${money(i.price_cents, cur)}</span></button>
    </div>`, (bg, close) => {
    const sum = () => {
      const delta = [...bg.querySelectorAll('input:checked')].reduce((n, x) => n + Number(x.dataset.delta), 0);
      bg.querySelector('#sum').textContent = money((i.price_cents + delta) * qty, cur);
    };
    bg.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => {
      qty = Math.max(1, Math.min(20, qty + Number(b.dataset.q))); haptic(9);
      bg.querySelector('#q').textContent = qty; sum();
    });
    bg.querySelectorAll('input[type=checkbox]').forEach((c) => c.onchange = () => {
      const g = i.option_groups.find((x) => x.id === Number(c.dataset.group));
      const checked = [...bg.querySelectorAll(`input[data-group="${g.id}"]:checked`)];
      if (checked.length > g.max_select) { c.checked = false; toast(`Máximo ${g.max_select} en «${g.name}»`); }
      sum();
    });
    bg.querySelectorAll('input[type=radio]').forEach((c) => c.onchange = sum);
    bg.querySelector('[data-close]').onclick = close;
    bg.querySelector('#add').onclick = () => {
      for (const g of i.option_groups) {
        const checked = bg.querySelectorAll(`input[data-group="${g.id}"]:checked`).length;
        if (checked < g.min_select) return toast(`Elige ${g.min_select} en «${g.name}»`, 'err');
      }
      const picked = [...bg.querySelectorAll('input:checked')].map((x) => ({
        id: Number(x.value), name: x.parentElement.querySelector('span').textContent.trim(), delta: Number(x.dataset.delta),
      }));
      state.cart.push({
        item_id: i.id, name: i.name, qty,
        unit: i.price_cents + picked.reduce((n, o) => n + o.delta, 0),
        option_ids: picked.map((o) => o.id), option_names: picked.map((o) => o.name),
        note: bg.querySelector('#note')?.value.trim() || '',
      });
      const origen = bg.querySelector('#add');
      saveCart(); haptic(14); close(); render();
      volarAlCarrito(origen, $('#btn-cart'));
      toast(`${i.name} añadido`, 'ok');
      suggestAfter(i);
    };
  });
}

/** Upselling ligero: «¿Añades…?» solo con lo que el local ha vinculado a ese plato. */
function suggestAfter(item) {
  const sugs = (item.suggests || [])
    .map((id) => state.data.items.find((x) => x.id === id))
    .filter((x) => x && x.available && !state.cart.some((l) => l.item_id === x.id));
  if (!sugs.length) return;
  const cur = state.data.venue.currency;
  sheet(`<div class="sheet-head"><h3 style="margin:0">¿Añades algo con ${esc(item.name)}?</h3>
      <button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      ${sugs.map((x) => `<div class="line"><div class="grow"><strong>${esc(x.name)}</strong>
        ${x.description ? `<div class="muted" style="font-size:13px">${esc(x.description)}</div>` : ''}</div>
        <button class="btn sm primary" data-add="${x.id}">+ ${money(x.price_cents, cur)}</button></div>`).join('')}
    </div>
    <div class="sheet-foot"><button class="btn grow" data-close2>No, gracias</button></div>`, (bg, close) => {
    bg.querySelector('[data-close]').onclick = close;
    bg.querySelector('[data-close2]').onclick = close;
    bg.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const x = state.data.items.find((y) => y.id === Number(b.dataset.add));
      if (x.option_groups.length) { close(); openDish(x.id); return; }
      state.cart.push({ item_id: x.id, name: x.name, qty: 1, unit: x.price_cents, option_ids: [], option_names: [], note: '' });
      saveCart(); haptic(14); render();
      volarAlCarrito(b, $('#btn-cart'));
      b.disabled = true; b.textContent = 'Añadido';
    });
  });
}

function allergenLine(i) {
  if (!i.allergens.length) return '';
  const names = i.allergens.map((a) => state.data.catalog.allergens.find((x) => x.id === a)?.label || a).join(' · ');
  return `<div class="notice warn" style="margin-bottom:14px">${icon('alert')} Contiene: ${esc(names)}</div>`;
}

function showInfo(i) {
  if (!i) return;
  sheet(`<div class="sheet-head"><h3 style="margin:0">${esc(i.name)}</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      ${i.image_path ? `<img src="${esc(i.image_path)}" style="width:100%;border-radius:12px;margin-bottom:14px" alt="">` : ''}
      <p>${esc(i.description || '')}</p>
      <p style="font-size:18px"><strong>${money(i.price_cents, state.data.venue.currency)}</strong></p>
      ${allergenLine(i)}
    </div>`, (bg, close) => bg.querySelector('[data-close]').onclick = close);
}

function openCart() {
  const cur = state.data.venue.currency;
  const draw = () => `
    <div class="sheet-head"><h3 style="margin:0">${t('cart')}</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      ${state.cart.length ? state.cart.map((l, idx) => `<div class="line">
        <div class="grow"><strong>${esc(l.name)}</strong>
          ${l.option_names.length ? `<div class="muted" style="font-size:13px">${esc(l.option_names.join(', '))}</div>` : ''}
          ${l.note ? `<div class="muted" style="font-size:13px"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-note"/></svg> ${esc(l.note)}</div>` : ''}
          <div class="qty" style="margin-top:8px;width:fit-content">
            <button data-line="${idx}" data-d="-1">${icon('minus')}</button>
            <span class="tabular">${l.qty}</span>
            <button data-line="${idx}" data-d="1">${icon('plus')}</button>
          </div>
        </div>
        <div class="right"><strong>${money(l.unit * l.qty, cur)}</strong>
          <div><button class="btn ghost sm" data-del="${idx}" style="color:var(--red)">Quitar</button></div></div>
      </div>`).join('') : `<div class="empty"><span class="ico"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-receipt"/></svg></span>${t('empty')}</div>`}
      ${state.data.ask_guest_name ? `<div class="field" style="margin-top:16px"><label>${t('name')}</label>
        <input id="guest" maxlength="40" value="${esc(localStorage.getItem('maitre_guest') || '')}"></div>` : ''}
      ${state.cart.length ? `<div class="field"><label>${t('note')}</label><input id="onote" maxlength="200" placeholder="Todo junto, gracias"></div>` : ''}
      ${state.cart.length && state.data.payment.online && !state.data.payment.required ? `
        <div class="field"><label>¿Cómo quieres pagarlo?</label>
          <label class="opt"><input type="radio" name="pm" value="online" checked>
            <span class="grow">${t('payNow')}<div class="muted" style="font-size:12.5px">${t('payHint')}</div></span></label>
          <label class="opt"><input type="radio" name="pm" value="venue">
            <span class="grow">${t('payVenue')}<div class="muted" style="font-size:12.5px">${t('venueHint')}</div></span></label>
        </div>` : ''}
      ${state.cart.length && state.data.payment.required ? `
        <div class="notice info">${t('payHint')}</div>` : ''}
    </div>
    ${state.cart.length ? `<div class="sheet-foot">
      <div class="grow"><div class="muted" style="font-size:12px">${t('total')}</div>
        <strong style="font-size:18px">${money(cartTotal(), cur)}</strong></div>
      <button class="btn primary lg" id="send">${state.data.payment.online ? t('payNow') : t('send')}</button>
    </div>` : ''}`;

  const bg = sheet(draw(), (bg2, close) => {
    const rebind = () => {
      bg2.querySelector('.sheet').innerHTML = draw();
      wire(bg2, close);
    };
    const wire = (root, closeFn) => {
      root.querySelector('[data-close]').onclick = closeFn;
      root.querySelectorAll('[data-line]').forEach((b) => b.onclick = () => {
        const l = state.cart[Number(b.dataset.line)];
        l.qty += Number(b.dataset.d); haptic(9);
        if (l.qty < 1) state.cart.splice(Number(b.dataset.line), 1);
        saveCart(); rebind(); render();
      });
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        state.cart.splice(Number(b.dataset.del), 1); saveCart(); rebind(); render();
      });
      const send = root.querySelector('#send');
      if (send) send.onclick = () => ocupado(send, async () => {
        const guest = root.querySelector('#guest')?.value.trim() || '';
        if (guest) localStorage.setItem('maitre_guest', guest);
        const modo = root.querySelector('input[name=pm]:checked')?.value
          || (state.data.payment.required ? 'online' : 'venue');
        try {
          const order = await api(`${base}/order`, { method: 'POST', body: {
            lines: state.cart.map((l) => ({ item_id: l.item_id, qty: l.qty, option_ids: l.option_ids, note: l.note })),
            session_id: state.sessionId, guest_name: guest, note: root.querySelector('#onote')?.value.trim() || '',
            payment_mode: modo, code: state.tableCode,
          } });
          state.cart = []; saveCart(); haptic(26);
          if (order.checkout) { location.href = order.checkout.url; return; }
          state.orders.unshift(order);
          closeFn(); render();
          showConfirmation(order);
        } catch (err) {
          if (err.data?.error === 'code_required') {
            const code = prompt('Pide al personal el código de la mesa y escríbelo aquí:');
            if (code) { state.tableCode = code.trim().toUpperCase(); localStorage.setItem(`maitre_code_${slug}`, state.tableCode); }
          } else if (err.data?.error === 'table_closed') {
            toast('Avisa al personal para que abra tu mesa y vuelve a enviarlo.', 'err');
          } else {
            toast(err.message, 'err');
          }
        }
      });
    };
    wire(bg2, close);
  });
  return bg;
}

/** Confirmación tras enviar (o pagar) el pedido: qué has pedido y qué pasa ahora. */
function showConfirmation(order) {
  const cur = state.data.venue.currency;
  const pagado = order.payment_status === 'paid';
  sheet(`
    <div class="sheet-head"><div>
      <h3 style="margin:0 0 2px">${t('confirmed')}</h3>
      <div class="muted" style="font-size:13.5px">Pedido ${esc(order.code)} · mesa ${esc(state.data.table?.name || '')}</div>
    </div><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      <div class="center" style="padding:6px 0 18px">
        <div style="font-size:42px;line-height:1">${pagado ? '<svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-check"/></svg>' : '<svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-send"/></svg>'}</div>
        <p class="muted" style="margin:10px 0 0;font-size:14px">
          ${pagado ? 'Pago confirmado. Ya lo están preparando.' : 'Enviado a la barra. Lo pagas en el local al terminar.'}
        </p>
      </div>
      ${order.items.map((li) => `<div class="line"><div class="grow">${li.qty} × ${esc(li.name)}
        ${li.options?.length ? `<div class="muted" style="font-size:12.5px">${esc(li.options.map((x) => x.name).join(', '))}</div>` : ''}</div>
        <div>${money(li.line_total_cents, cur)}</div></div>`).join('')}
      <div class="spread" style="margin-top:14px;font-size:17px">
        <strong>${t('total')}</strong>
        <strong>${money(order.total_cents, cur)}${pagado ? '' : ' · por pagar'}</strong></div>
      ${pagado ? `<div class="notice ok" style="margin-top:16px">Cobrado con tarjeta.
        Referencia <span class="mono">${esc(order.payment_ref || order.code)}</span>.</div>` : ''}
      <p class="muted" style="font-size:12.5px;margin-top:16px">
        Puedes seguir el estado en esta misma pantalla. Si necesitas algo, usa el botón de aviso.</p>
    </div>
    <div class="sheet-foot"><button class="btn grow" data-close2>Seguir viendo la carta</button></div>`,
    (bg, close) => {
      bg.querySelector('[data-close]').onclick = close;
      bg.querySelector('[data-close2]').onclick = close;
    });
}

function openCall() {
  const opts = [
    { type: 'waiter', ico: 'hand', label: 'Que venga alguien' },
    { type: 'bill', ico: 'receipt', label: 'La cuenta' },
    { type: 'water', ico: 'drop', label: 'Agua' },
    { type: 'help', ico: 'help', label: 'Una duda' },
  ];
  sheet(`<div class="sheet-head"><h3 style="margin:0">${t('call')}</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      <div class="grid g2" style="grid-template-columns:1fr 1fr">
        ${opts.map((o) => `<button class="callbtn" data-type="${o.type}">${icon(o.ico, 'i-lg')}${o.label}</button>`).join('')}
      </div>
      ${state.bill?.total_cents ? `<div class="notice" style="margin-top:16px">${t('bill')}:
        <strong>${money(state.bill.total_cents, state.data.venue.currency)}</strong></div>` : ''}
    </div>`, (bg, close) => {
    bg.querySelector('[data-close]').onclick = close;
    bg.querySelectorAll('[data-type]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await api(`${base}/call`, { method: 'POST', body: { type: b.dataset.type, session_id: state.sessionId } });
        haptic(22); close(); toast(r.duplicate ? 'Ya lo habías pedido, están en ello' : t('called'), 'ok');
      } catch (err) { toast(err.message, 'err'); b.disabled = false; }
    });
  });
}

function openBill() {
  const cur = state.data.venue.currency;
  const b = state.bill;
  sheet(`<div class="sheet-head"><h3 style="margin:0">${t('bill')}</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      ${b.orders.flatMap((o) => o.items).map((li) => `<div class="line">
        <div class="grow">${li.qty} × ${esc(li.name)}</div><div>${money(li.line_total_cents, cur)}</div></div>`).join('')}
      <div class="spread" style="margin-top:14px"><span class="muted">Base</span><span>${money(b.subtotal_cents, cur)}</span></div>
      <div class="spread"><span class="muted">IVA</span><span>${money(b.tax_cents, cur)}</span></div>
      <div class="spread" style="font-size:18px;margin-top:8px"><strong>${t('total')}</strong><strong>${money(b.total_cents, cur)}</strong></div>
      <p class="muted" style="font-size:12.5px;margin-top:14px">El cobro se realiza en el propio local. Esto es un resumen
      de consumo, no un ticket ni una factura: el ticket lo emite el local con su sistema de caja.</p>
    </div>`, (bg, close) => bg.querySelector('[data-close]').onclick = close);
}

function openFilters() {
  const cat = state.data.catalog;
  sheet(`<div class="sheet-head"><h3 style="margin:0">${t('filters')}</h3><button class="btn ghost sm" data-close><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-x"/></svg></button></div>
    <div class="sheet-body">
      <label>${t('diet')}</label>
      <div class="row wrap-row" style="margin-bottom:18px">
        ${cat.tags.map((tg) => `<button class="btn sm ${state.diet === tg.id ? 'primary' : ''}" data-diet="${tg.id}">${icon(tg.icon)}${esc(tg.label)}</button>`).join('')}
      </div>
      <label>${t('allergensOff')}</label>
      <div class="row wrap-row">
        ${cat.allergens.map((a) => `<button class="btn sm ${state.hideAllergens.includes(a.id) ? 'danger' : ''}" data-alg="${a.id}">${esc(a.label)}</button>`).join('')}
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:16px">La información de alérgenos la facilita el establecimiento.
      Ante cualquier duda o alergia grave, consúltalo con el personal.</p>
    </div>
    <div class="sheet-foot"><button class="btn grow" id="clear">Quitar filtros</button>
      <button class="btn primary grow" data-close2>Ver la carta</button></div>`, (bg, close) => {
    bg.querySelector('[data-close]').onclick = close;
    bg.querySelector('[data-close2]').onclick = () => { close(); render(); };
    bg.querySelectorAll('[data-diet]').forEach((b) => b.onclick = () => {
      state.diet = state.diet === b.dataset.diet ? null : b.dataset.diet;
      bg.querySelectorAll('[data-diet]').forEach((x) => x.classList.toggle('primary', x.dataset.diet === state.diet));
    });
    bg.querySelectorAll('[data-alg]').forEach((b) => b.onclick = () => {
      const id = b.dataset.alg;
      state.hideAllergens = state.hideAllergens.includes(id)
        ? state.hideAllergens.filter((x) => x !== id) : [...state.hideAllergens, id];
      localStorage.setItem('maitre_avoid', JSON.stringify(state.hideAllergens));
      b.classList.toggle('danger', state.hideAllergens.includes(id));
    });
    bg.querySelector('#clear').onclick = () => {
      state.diet = null; state.hideAllergens = []; localStorage.setItem('maitre_avoid', '[]');
      close(); render();
    };
  });
}

// Resalta la categoría visible al hacer scroll.
addEventListener('scroll', () => {
  const titles = [...document.querySelectorAll('.cat-title[id]')];
  const cur = titles.filter((h) => h.getBoundingClientRect().top < 160).pop();
  document.documentElement.classList.toggle('scrolled', scrollY > 30);
  if (!cur) return;
  const id = cur.id.replace('cat-', '');
  document.querySelectorAll('.m-cat').forEach((c) => {
    const activa = c.dataset.cat === id;
    if (activa && !c.classList.contains('on')) c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    c.classList.toggle('on', activa);
  });
}, { passive: true });

load();

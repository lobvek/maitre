// Historial de pedidos con filtros y exportación.
import { api, money, esc, el, $, $$, fmtDate, toast, modal } from '/js/core.js';
import { skeletonFilas, contarTodo } from '/js/motion.js';
import { app, can, hasFeature } from '/js/app.js';

const LABEL = { new: ['amber', 'Nuevo'], accepted: ['blue', 'Aceptado'], preparing: ['blue', 'Preparando'],
  served: ['green', 'Servido'], paid: ['', 'Cobrado'], cancelled: ['red', 'Cancelado'] };

export async function render(root) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

  root.innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <div class="row wrap-row">
        <div><label>Desde</label><input type="date" id="from" value="${monthAgo}"></div>
        <div><label>Hasta</label><input type="date" id="to" value="${today}"></div>
        <div><label>Estado</label><select id="status">
          <option value="">Todos</option>
          ${Object.entries(LABEL).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join('')}
        </select></div>
        <div style="align-self:flex-end" class="row">
          <button class="btn primary" id="apply">Filtrar</button>
          ${can('manager') && hasFeature('export') ? '<button class="btn" id="export">Exportar CSV</button>' : ''}
        </div>
      </div>
    </div>
    <div id="list"></div>`;

  const load = async () => {
    $('#list').innerHTML = skeletonFilas(6, 5);
    const q = new URLSearchParams({ scope: 'all', limit: '300' });
    ['from', 'to', 'status'].forEach((k) => { const v = $('#' + k).value; if (v) q.set(k, v); });
    const orders = await api('/api/orders?' + q);
    const revenue = orders.filter((o) => ['served', 'paid'].includes(o.status)).reduce((n, o) => n + o.total_cents, 0);
    $('#list').innerHTML = orders.length ? `
      <div class="grid g4 stagger" style="margin-bottom:16px">
        <div class="kpi"><div class="k">Pedidos</div><div class="v">${orders.length}</div></div>
        <div class="kpi"><div class="k">Facturado</div><div class="v">${money(revenue, app.venue.currency)}</div></div>
        <div class="kpi"><div class="k">Ticket medio</div><div class="v">${money(orders.length ? revenue / orders.length : 0, app.venue.currency)}</div></div>
        <div class="kpi"><div class="k">Por QR</div><div class="v">${Math.round(orders.filter((o) => o.channel === 'qr').length / orders.length * 100)}%</div>
          <div class="d">el resto lo toma el personal</div></div>
      </div>
      <div class="card" style="padding:0"><table>
        <thead><tr><th>Código</th><th>Fecha</th><th>Mesa</th><th>Artículos</th><th>Canal</th><th>Estado</th><th class="num">Total</th></tr></thead>
        <tbody>${orders.map((o) => `<tr data-o="${o.id}" style="cursor:pointer">
          <td class="mono">${esc(o.code)}</td><td>${fmtDate(o.created_at)}</td>
          <td>${esc(o.table_name)}</td><td>${o.item_count}</td>
          <td><span class="tag">${o.channel === 'qr' ? 'QR' : 'Sala'}</span></td>
          <td><span class="tag ${LABEL[o.status][0]}">${LABEL[o.status][1]}</span></td>
          <td class="num">${money(o.total_cents, app.venue.currency)}</td></tr>`).join('')}
        </tbody></table></div>`
      : '<div class="empty"><span class="ico">≡</span>No hay pedidos en ese periodo.</div>';
    contarTodo($('#list'));
    $$('[data-o]').forEach((tr) => tr.onclick = () => detail(orders.find((o) => o.id === Number(tr.dataset.o))));
  };

  $('#apply').onclick = load;
  if ($('#export')) $('#export').onclick = () => {
    location.href = `/api/orders/export.csv?from=${$('#from').value}&to=${$('#to').value}`;
  };
  await load();
}

function detail(o) {
  modal({
    title: `Pedido ${o.code} · mesa ${o.table_name}`, cancel: 'Cerrar', save: '',
    body: el('div', { html: `
      <table><tbody>${o.items.map((li) => `<tr><td>${li.qty} × ${esc(li.name)}
        ${li.options?.length ? `<div class="muted" style="font-size:12.5px">${esc(li.options.map((x) => x.name).join(', '))}</div>` : ''}
        ${li.note ? `<div class="muted" style="font-size:12.5px"><svg class="i " aria-hidden="true"><use href="/assets/icons.svg#i-note"/></svg> ${esc(li.note)}</div>` : ''}</td>
        <td class="num">${money(li.line_total_cents, app.venue.currency)}</td></tr>`).join('')}
        <tr><td class="muted">Base imponible</td><td class="num">${money(o.subtotal_cents, app.venue.currency)}</td></tr>
        <tr><td class="muted">IVA</td><td class="num">${money(o.tax_cents, app.venue.currency)}</td></tr>
        <tr><td><strong>Total</strong></td><td class="num"><strong>${money(o.total_cents, app.venue.currency)}</strong></td></tr>
      </tbody></table>
      <div class="fse">Creado ${fmtDate(o.created_at)}${o.accepted_at ? ` · aceptado ${fmtDate(o.accepted_at)}` : ''}${o.served_at ? ` · servido ${fmtDate(o.served_at)}` : ''}${o.paid_at ? ` · cobrado ${fmtDate(o.paid_at)} (${esc(o.payment_method || '')})` : ''}
      ${o.guest_name ? `<br>Cliente: ${esc(o.guest_name)}` : ''}${o.note ? `<br>Nota: ${esc(o.note)}` : ''}</div>` }),
  });
}

// Mis locales: la foto de toda la marca, local a local.
// Lo que pide el jefe de una franquicia no es el detalle de un bar: es ver de un vistazo
// cuál va bien y cuál se ha quedado atrás, y poder meterse en el que haga falta.
import { api, money, esc, el, $, $$, num, chart } from '/js/core.js';
import { app } from '/js/app.js';
import { contarTodo } from '/js/motion.js';

export async function render(root) {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  root.innerHTML = `
    <div class="row wrap-row" style="margin-bottom:18px;align-items:flex-end">
      <div class="field" style="margin:0"><label>Desde</label><input type="date" id="from" value="${hace30}"></div>
      <div class="field" style="margin:0"><label>Hasta</label><input type="date" id="to" value="${hoy}"></div>
      <button class="btn primary" id="apply">Actualizar</button>
    </div>
    <div id="out"></div>`;

  const load = async () => {
    const out = $('#out', root);
    out.innerHTML = '<div class="sk" style="height:220px"></div>';
    const d = await api(`/api/analytics/group?from=${$('#from', root).value}&to=${$('#to', root).value}`);
    const cur = app.venue?.currency || 'EUR';
    const mejor = [...d.venues].sort((a, b) => b.revenue_cents - a.revenue_cents)[0];

    out.innerHTML = `
      <div class="grid g4 stagger" style="margin-bottom:20px">
        <div class="kpi"><div class="k">Locales</div><div class="v" data-count="${d.venues.length}">${d.venues.length}</div>
          <div class="d">en el grupo</div></div>
        <div class="kpi"><div class="k">Ventas del grupo</div>
          <div class="v" data-count="${d.total.revenue_cents}" data-count-currency="${cur}">${money(d.total.revenue_cents, cur)}</div>
          <div class="d">en el periodo elegido</div></div>
        <div class="kpi"><div class="k">Pedidos</div><div class="v" data-count="${d.total.orders}">${num(d.total.orders)}</div>
          <div class="d">de todos los locales</div></div>
        <div class="kpi"><div class="k">El que más vende</div><div class="v" style="font-size:1.4rem">${esc(mejor?.name || '—')}</div>
          <div class="d">${mejor ? money(mejor.revenue_cents, cur) : ''}</div></div>
      </div>

      <div class="card" style="margin-bottom:20px"><h3>Ventas por local</h3>
        ${d.venues.length ? chart(d.venues.map((v) => ({ label: v.name, short: v.name.slice(0, 10), value: v.revenue_cents / 100 })),
          { kind: 'bar', height: 210, multicolor: true, format: (n) => `${n.toFixed(0)} €` })
          : '<div class="empty">Todavía no hay ventas.</div>'}</div>

      <div class="card" style="padding:0"><table>
        <thead><tr><th>Local</th><th class="num">Ventas</th><th class="num">Pedidos</th>
          <th class="num">Ticket medio</th><th class="num">% por QR</th><th class="num">Tardan en aceptar</th><th></th></tr></thead>
        <tbody>${d.venues.map((v) => `<tr>
          <td><strong>${esc(v.name)}</strong><div class="muted" style="font-size:12.5px">${esc(v.city || '')}</div></td>
          <td class="num">${money(v.revenue_cents, cur)}</td>
          <td class="num">${num(v.orders)}</td>
          <td class="num">${money(v.avg_ticket_cents, cur)}</td>
          <td class="num">${v.qr_pct}%</td>
          <td class="num ${v.accept_minutes > 8 ? 'bad' : ''}">${v.accept_minutes === null ? '—' : `${v.accept_minutes} min`}</td>
          <td class="right">${v.id === app.venue?.id
            ? '<span class="tag green">estás aquí</span>'
            : `<button class="btn sm" data-ir="${v.id}">Entrar</button>`}</td>
        </tr>`).join('')}</tbody></table></div>`;

    contarTodo(out);
    $$('[data-ir]', out).forEach((b) => b.onclick = async () => {
      await api('/api/auth/venue', { method: 'POST', body: { venue_id: Number(b.dataset.ir) } });
      location.href = '/panel#/inicio';
      location.reload();
    });
  };

  $('#apply', root).onclick = load;
  await load();
}

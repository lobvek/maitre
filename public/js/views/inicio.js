// Inicio: puesta en marcha, pulso del día y accesos rápidos.
import { api, money, esc, el, $, timeAgo, chart } from '/js/core.js';
import { app, hasFeature } from '/js/app.js';

export async function render(root) {
  const [tables, items, orders, calls] = await Promise.all([
    api('/api/tables'), api('/api/menu/items'), api('/api/orders?scope=today&limit=300'), api('/api/orders/pending-calls'),
  ]);
  const v = app.venue;
  const paid = orders.filter((o) => ['served', 'paid'].includes(o.status));
  const revenue = paid.reduce((n, o) => n + o.total_cents, 0);
  const open = orders.filter((o) => !['paid', 'cancelled'].includes(o.status));
  const firstTable = tables.tables[0];

  const steps = [
    { done: items.length > 0, label: 'Carga tu carta', hint: `${items.length} productos`, href: '#/carta' },
    { done: tables.tables.length > 0, label: 'Crea tus mesas', hint: `${tables.tables.length} mesas`, href: '#/mesas' },
    { done: !!v.logo_path, label: 'Sube tu logotipo', hint: 'aparece en la carta y en la cuña', href: '#/ajustes' },
    { done: orders.length > 0, label: 'Prueba un pedido real', hint: 'escanea el QR de una mesa', href: firstTable ? firstTable.url : '#/mesas' },
    { done: v.plan !== 'trial' || v.trial_days_left < 25, label: 'Imprime la hoja de QR', hint: 'para empezar mientras llegan las cuñas', href: '/cunas' },
  ];
  const pending = steps.filter((s) => !s.done);

  const LLAMADAS = { waiter: '🙋 Camarero', bill: '🧾 La cuenta', water: '💧 Agua', help: '❓ Duda' };

  root.append(el('div', { html: `
    ${calls.length ? `<div class="notice warn" style="margin-bottom:18px">
      <strong>${calls.length} mesa${calls.length === 1 ? '' : 's'} reclamando atención:</strong>
      ${calls.map((c) => `mesa ${esc(c.table_name || '—')} (${LLAMADAS[c.type] || c.type})`).join(' · ')}
      — se atienden desde la <a href="/sala">pantalla de sala</a>.</div>` : ''}
    ${pending.length ? `<div class="card" style="margin-bottom:22px">
      <div class="card-head"><h3 style="margin:0">Puesta en marcha</h3>
        <span class="muted">${steps.length - pending.length}/${steps.length}</span></div>
      <div class="stack">
        ${steps.map((s) => `<a href="${esc(s.href)}" ${s.href.startsWith('http') ? 'target="_blank"' : ''}
          style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit">
          <span style="font-size:18px">${s.done ? '✅' : '⬜️'}</span>
          <span class="grow"><strong style="${s.done ? 'opacity:.5' : ''}">${esc(s.label)}</strong>
            <span class="muted" style="font-size:13px"> · ${esc(s.hint)}</span></span>
          ${s.done ? '' : '<span class="btn sm">Ir</span>'}
        </a>`).join('')}
      </div>
    </div>` : ''}

    <div class="grid g4" style="margin-bottom:22px">
      <div class="kpi"><div class="k">Ventas de hoy</div><div class="v">${money(revenue, v.currency)}</div>
        <div class="d">${paid.length} pedidos cerrados</div></div>
      <div class="kpi"><div class="k">Pedidos abiertos</div><div class="v">${open.length}</div>
        <div class="d">${calls.length} aviso${calls.length === 1 ? '' : 's'} sin atender</div></div>
      <div class="kpi"><div class="k">Ticket medio</div><div class="v">${money(paid.length ? revenue / paid.length : 0, v.currency)}</div>
        <div class="d">solo pedidos por QR y sala</div></div>
      <div class="kpi"><div class="k">Mesas</div><div class="v">${tables.tables.length}</div>
        <div class="d">${tables.tables.filter((t) => t.status === 'occupied').length} ocupadas ahora</div></div>
    </div>

    ${open.length ? `<div class="card" style="margin-bottom:22px">
      <div class="card-head"><h3 style="margin:0">Ahora mismo en sala</h3><a class="btn sm" href="/sala">Abrir pantalla de sala</a></div>
      <table><tbody>${open.slice(0, 6).map((o) => `<tr>
        <td><strong>Mesa ${esc(o.table_name)}</strong></td>
        <td>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</td>
        <td class="num">${money(o.total_cents, v.currency)}</td>
        <td class="num muted">hace ${timeAgo(o.created_at)}</td></tr>`).join('')}</tbody></table>
    </div>` : ''}

    <div class="grid g2">
      <div class="card">
        <h3>Tu carta en el móvil</h3>
        <p class="muted" style="font-size:13.5px">Así la ve un cliente sentado en la mesa. Ábrela en el móvil o compártela.</p>
        ${firstTable ? `<div class="row wrap-row">
          <a class="btn primary" href="${esc(firstTable.url)}" target="_blank">Ver la carta de la mesa ${esc(firstTable.name)}</a>
          <a class="btn" href="/m/${esc(v.slug)}" target="_blank">Carta de escaparate</a>
        </div>` : '<p class="muted">Crea una mesa para generar el primer QR.</p>'}
      </div>
      <div class="card">
        <h3>Atajos</h3>
        <div class="row wrap-row">
          <a class="btn" href="#/carta">Añadir un plato</a>
          <a class="btn" href="/cunas" target="_blank">Imprimir hoja de QR</a>
          ${hasFeature('analytics') ? '<a class="btn" href="#/analitica">Ver analítica</a>' : ''}
          <a class="btn" href="#/ajustes">Activar o quitar funciones</a>
        </div>
      </div>
    </div>` }));
}

// Analítica del local (plan Pro): ventas, embudo del QR, horas punta y márgenes.
import { api, money, esc, el, $, $$, chart, num, icon, loader } from '/js/core.js';
import { contarTodo } from '/js/motion.js';
import { app, hasFeature } from '/js/app.js';

export async function render(root) {
  if (!hasFeature('analytics')) {
    root.innerHTML = `<div class="card center" style="max-width:520px;margin:40px auto">
      <h2>La analítica es del plan Pro</h2>
      <p class="muted">Ventas por día, ticket medio, horas punta, productos más vendidos y el embudo de escaneos a pedidos.</p>
      <a class="btn primary" href="#/facturacion">Ver planes</a></div>`;
    return;
  }
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

  root.innerHTML = `
    <div class="row wrap-row" style="margin-bottom:18px">
      <div><label>Desde</label><input type="date" id="from" value="${from}"></div>
      <div><label>Hasta</label><input type="date" id="to" value="${to}"></div>
      <div style="align-self:flex-end"><button class="btn primary" id="apply">Actualizar</button></div>
    </div>
    <div id="out">${loader()}</div>`;

  const load = async () => {
    const q = `from=${$('#from').value}&to=${$('#to').value}`;
    const [d, margins] = await Promise.all([api('/api/analytics/summary?' + q), api('/api/analytics/margins?' + q)]);
    const k = d.kpis, cur = app.venue.currency;
    const days = d.by_day.map((r) => ({ label: r.day, short: r.day.slice(8) + '/' + r.day.slice(5, 7), value: r.revenue_cents / 100 }));
    const hours = Array.from({ length: 24 }, (_, h) => {
      const row = d.by_hour.find((x) => x.hour === h);
      return { label: `${h}:00`, short: h % 3 === 0 ? h : '', value: row ? row.orders : 0 };
    });

    const totalPedidos = d.by_channel.reduce((n, c) => n + c.orders, 0);
    const porQr = totalPedidos ? Math.round((d.by_channel.find((c) => c.channel === 'qr')?.orders || 0) / totalPedidos * 100) : 0;

    $('#out').innerHTML = `
      <div class="grid g4 stagger" style="margin-bottom:20px">
        <div class="kpi"><div class="k">Ventas totales</div>
          <div class="v" data-count="${k.revenue_cents}" data-count-currency="${cur}">${money(k.revenue_cents, cur)}</div>
          <div class="d">IVA incluido: ${money(k.tax_cents, cur)}</div></div>
        <div class="kpi"><div class="k">Pedidos</div><div class="v" data-count="${k.orders}">${num(k.orders)}</div>
          <div class="d">${k.cancelled} cancelados</div></div>
        <div class="kpi"><div class="k">Ticket medio</div><div class="v">${money(k.avg_ticket_cents, cur)}</div></div>
        <div class="kpi"><div class="k">Pedidos por QR</div><div class="v">${porQr}%</div>
          <div class="d">el resto los toma el personal</div></div>
      </div>

      ${k.reviews ? `<div class="card" style="margin-bottom:20px"><div class="spread"><h3 style="margin:0">Valoración de los clientes</h3>
        <span><strong style="font-size:1.4rem">${k.rating}</strong> <span class="muted">/ 5 · ${k.reviews} reseñas · ${k.optins} quieren novedades</span></span></div>
        ${d.last_reviews?.length ? `<div style="margin-top:12px">${d.last_reviews.map((r) => `<div style="padding:6px 0;border-top:1px solid var(--line-2);font-size:13.5px">
          ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} <span class="muted">mesa ${esc(r.table_name || '—')}</span> — ${esc(r.comment)}</div>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="card" style="margin-bottom:20px"><h3>Lo que más se vende</h3>
        <table><thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num">Importe</th></tr></thead>
        <tbody>${d.top_items.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.qty}</td>
          <td class="num">${money(r.revenue_cents, cur)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin datos.</td></tr>'}</tbody></table></div>

      <div class="spread" style="margin:26px 0 14px">
        <h2 style="margin:0;font-size:1.15rem">Analítica avanzada</h2>
        <button class="btn sm" id="toggle-avanzada">Mostrar</button>
      </div>
      <div id="avanzada" class="hidden">

      <div class="card" style="margin-bottom:20px">
        <div class="card-head"><h3 style="margin:0">Ventas por día</h3><span class="muted">${d.range.from} → ${d.range.to}</span></div>
        ${days.length ? chart(days, { kind: 'line', height: 200, format: (v) => Math.round(v) + ' €' }) : '<div class="empty">Sin datos.</div>'}
      </div>

      <div class="grid g2" style="margin-bottom:20px">
        <div class="card"><h3>Horas punta</h3>
          ${chart(hours, { kind: 'bar', height: 180, color: 'var(--c1)', format: (v) => Math.round(v) })}
          <div class="muted" style="font-size:12.5px">Pedidos por hora del día.</div></div>
        <div class="card"><h3>Tiempos de servicio</h3>
          <table><tbody>
            <tr><td>Aceptar el pedido</td><td class="num"><strong>${k.accept_minutes ?? '—'} min</strong></td></tr>
            <tr><td>Servir el pedido</td><td class="num"><strong>${k.serve_minutes ?? '—'} min</strong></td></tr>
            <tr><td>Atender un aviso</td><td class="num"><strong>${k.calls_avg_minutes ?? '—'} min</strong></td></tr>
            <tr><td>Avisos recibidos</td><td class="num"><strong>${num(k.calls)}</strong> (${k.calls_open} sin atender)</td></tr>
          </tbody></table>
          <div class="muted" style="font-size:12.5px;margin-top:8px">Medias del periodo seleccionado.</div></div>
      </div>

      <div class="card" style="margin-bottom:20px"><h3>Escaneos que acaban en pedido</h3>
        <div class="row" style="gap:26px;align-items:flex-end">
          <div><div class="k muted" style="font-size:12px">Conversión</div>
            <div style="font-family:var(--serif);font-size:2rem">${k.conversion}%</div></div>
          <div class="muted" style="font-size:13.5px">${num(k.scan_sessions)} móviles abrieron la carta ·
            ${num(k.ordering_sessions)} acabaron pidiendo</div>
        </div></div>

      <div class="grid g2" style="margin-bottom:20px">
        <div class="card"><h3>Por categoría</h3>
          <table><thead><tr><th>Categoría</th><th class="num">Uds.</th><th class="num">Importe</th></tr></thead>
          <tbody>${d.by_category.map((r) => {
            let name = r.category; try { name = Object.values(JSON.parse(r.category))[0]; } catch {}
            return `<tr><td>${esc(name)}</td><td class="num">${r.qty}</td><td class="num">${money(r.revenue_cents, cur)}</td></tr>`;
          }).join('') || '<tr><td colspan="3" class="muted">Sin datos.</td></tr>'}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:20px"><h3>Mesas que más facturan</h3>
        <table><thead><tr><th>Mesa</th><th class="num">Pedidos</th><th class="num">Importe</th></tr></thead>
        <tbody>${d.by_table.map((r) => `<tr><td>Mesa ${esc(r.table_name)}</td><td class="num">${r.orders}</td>
          <td class="num">${money(r.revenue_cents, cur)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin datos.</td></tr>'}</tbody></table></div>

      <div class="card"><h3>Margen por producto <span class="tag amber">beta</span></h3>
        <p class="muted" style="font-size:13px">Solo es fiable en los productos con coste/escandallo informado en la carta.
        El control de escandallos completo llegará más adelante; esto es una primera aproximación.</p>
        <table><thead><tr><th>Producto</th><th class="num">PVP</th><th class="num">Coste</th><th class="num">Margen</th><th class="num">Uds.</th><th class="num">Beneficio</th></tr></thead>
        <tbody>${margins.filter((r) => r.qty).slice(0, 20).map((r) => {
          let name = r.name; try { name = Object.values(JSON.parse(r.name))[0]; } catch {}
          return `<tr><td>${esc(name)}</td><td class="num">${money(r.price_cents, cur)}</td>
            <td class="num">${r.cost_cents ? money(r.cost_cents, cur) : '—'}</td>
            <td class="num">${r.margin_pct != null ? r.margin_pct + '%' : '—'}</td>
            <td class="num">${r.qty}</td><td class="num">${money(r.profit_cents, cur)}</td></tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">Sin ventas en el periodo.</td></tr>'}</tbody></table></div>
      </div>`;

    contarTodo($('#out'));
    const bloque = $('#avanzada');
    $('#toggle-avanzada').onclick = (e) => {
      bloque.classList.toggle('hidden');
      e.target.textContent = bloque.classList.contains('hidden') ? 'Mostrar' : 'Ocultar';
    };
  };

  $('#apply').onclick = load;
  await load();
}

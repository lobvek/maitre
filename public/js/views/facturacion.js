// Plan, límites y facturas del local.
import { api, money, esc, el, $, $$, toast, fmtDate, confirmDialog } from '/js/core.js';
import { app, refreshChrome } from '/js/app.js';

export async function render(root) {
  const b = await api('/api/billing');
  const current = b.effective_plan;

  root.innerHTML = `
    ${b.plan === 'trial' ? `<div class="notice ${b.trial_days_left <= 5 ? 'warn' : 'info'}" style="margin-bottom:18px">
      Estás en el <strong>piloto de 30 días</strong> con el plan Servicio completo. Te quedan <strong>${b.trial_days_left} días</strong>
      (decisión el ${fmtDate(b.trial_ends_at, { day: '2-digit', month: 'long' })}). El piloto termina con una decisión explícita:
      contratar, ampliarlo por una causa concreta o retirar el material. Si no eliges nada, la cuenta pasa al plan Mesa.</div>` : ''}
    ${b.plan === 'founders' ? `<div class="notice ok" style="margin-bottom:18px">
      Eres de la <strong>primera cohorte</strong>: plan Servicio a 19 €/mes durante 24 meses
      (hasta ${fmtDate(b.plan_until, { day: '2-digit', month: 'long', year: 'numeric' })}). Después pasa al precio público del plan Servicio.</div>` : ''}

    <div class="grid g3" style="margin-bottom:24px">
      ${b.plans.filter((p) => !p.invite_only).map((p) => `
        <div class="card" style="${current === p.id ? 'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft)' : ''}">
          <div class="spread"><h3 style="margin:0">${esc(p.name)}</h3>
            ${current === p.id ? '<span class="tag brand">Tu plan</span>' : p.highlight ? '<span class="tag green">Principal</span>' : ''}</div>
          <div style="font-family:var(--serif);font-size:2rem;margin:8px 0 2px">${money(p.price_cents)}<span style="font-size:.9rem;font-family:var(--sans)" class="muted">/mes + IVA</span></div>
          <p class="muted" style="font-size:13.5px">${esc(p.tagline)}</p>
          <ul style="list-style:none;padding:0;margin:0 0 16px;font-size:14px">
            ${(() => {
              const prev = { servicio: 'mesa', local: 'servicio' }[p.id];
              const base = prev ? b.plans.find((x) => x.id === prev)?.features || [] : [];
              const extra = p.features.filter((f) => !base.includes(f));
              return (prev ? [`<li style="padding:4px 0">✓ Todo lo del plan ${esc(b.plans.find((x) => x.id === prev)?.name)}</li>`] : [])
                .concat(extra.map((f) => `<li style="padding:4px 0">✓ ${esc(FEATURES[f] || f)}</li>`)).join('');
            })()}
            <li style="padding:4px 0" class="muted">Hasta ${p.max_tables} mesas</li>
          </ul>
          ${current === p.id ? '<button class="btn block" disabled>Plan actual</button>'
            : `<button class="btn primary block" data-plan="${p.id}">Cambiar a ${esc(p.name)}</button>`}
        </div>`).join('')}
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>Uso actual</h3>
        <table><tbody>
          <tr><td>Mesas activas</td><td class="num"><strong>${b.tables_used} / ${b.max_tables}</strong></td></tr>
          <tr><td>Plan contratado</td><td class="num"><strong>${esc(b.plan)}</strong></td></tr>
          <tr><td>Cuota mensual</td><td class="num"><strong>${money(b.plans.find((p) => p.id === current)?.price_cents || 0)} + IVA</strong></td></tr>
        </tbody></table>
        ${b.plan !== 'paused' ? '<button class="btn danger sm" id="cancel" style="margin-top:14px">Cancelar suscripción</button>' : ''}
        <p class="muted" style="font-size:12.5px;margin-top:10px">Al cancelar, la carta sigue visible en modo solo lectura
        y no se pierde ningún dato.</p>
      </div>
      <div class="card">
        <h3>Historial</h3>
        <table><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody>${b.events.map((e) => `<tr>
          <td>${fmtDate(e.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
          <td>${esc(e.note || e.type)}</td>
          <td class="num">${e.amount_cents ? money(e.amount_cents + e.tax_cents) : '—'}</td>
          <td class="right">${e.amount_cents ? `<a class="btn ghost sm" href="/api/billing/invoice/${e.id}" target="_blank">Factura</a>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="muted">Sin movimientos.</td></tr>'}</tbody></table>
      </div>
    </div>

    <p class="fse">Los precios mostrados no incluyen el 21% de IVA. Maitre no almacena datos de tarjetas: el cobro se
    tramita mediante un proveedor de pago autorizado.</p>`;

  $$('[data-plan]').forEach((btn) => btn.onclick = async () => {
    const plan = btn.dataset.plan;
    const p = b.plans.find((x) => x.id === plan);
    if (!await confirmDialog('Cambiar de plan', `Vas a pasar al plan ${p.name} (${money(p.price_cents)}/mes + IVA). El cambio es inmediato.`, 'Confirmar')) return;
    try {
      await api('/api/billing/plan', { method: 'POST', body: { plan } });
      await refreshChrome();
      toast('Plan actualizado', 'ok');
      render($('#view'));
    } catch (err) { toast(err.message, 'err'); }
  });

  if ($('#cancel')) $('#cancel').onclick = async () => {
    if (!await confirmDialog('Cancelar suscripción', 'Se desactivarán los pedidos y la analítica. La carta seguirá visible.', 'Cancelar suscripción')) return;
    await api('/api/billing/cancel', { method: 'POST', body: { reason: 'Cancelado desde el panel' } });
    await refreshChrome();
    render($('#view'));
  };
}

const FEATURES = {
  menu: 'Carta digital', qr: 'QR por mesa', calls: 'Aviso al personal', analytics_basic: 'Analítica básica',
  staff_basic: 'Acceso del personal', orders: 'Pedido desde la mesa', kds: 'Cola de sala y cocina',
  modifiers: 'Variantes y extras', upsell: 'Sugerencias', staff: 'Equipo y roles', tables: 'Gestión de mesas',
  export: 'Exportaciones', analytics: 'Analítica de servicio', integrations: 'Integraciones con TPV',
  payments: 'Pago con el móvil', reviews: 'Reseñas y opt-in', multi_venue: 'Varios locales',
};

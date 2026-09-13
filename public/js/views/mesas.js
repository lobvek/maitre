// Mesas, zonas y QR. Incluye la hoja imprimible de las cuñas de madera.
import { api, money, esc, el, $, $$, toast, modal, confirmDialog } from '/js/core.js';
import { app, can } from '/js/app.js';

let data = null;

export async function render(root) {
  data = await api('/api/tables');
  const used = data.tables.filter((t) => t.active).length;

  root.innerHTML = `
    <div class="spread" style="margin-bottom:18px">
      <div class="muted">${used} de ${data.limit} mesas del plan · ${data.zones.length} zonas</div>
      <div class="row">
        <a class="btn sm" href="/cunas" target="_blank">Hoja de QR</a>
        ${can('manager') ? `<button class="btn sm" id="new-zone">+ Zona</button>
          <button class="btn sm primary" id="new-table">+ Mesas</button>` : ''}
      </div>
    </div>
    ${used >= data.limit ? '<div class="notice warn" style="margin-bottom:16px">Has llegado al límite de mesas de tu plan. Sube a Pro para añadir más.</div>' : ''}
    <div id="zones"></div>`;

  paint();
  if (can('manager')) {
    $('#new-table').onclick = newTables;
    $('#new-zone').onclick = async () => {
      const name = prompt('Nombre de la zona (Sala, Terraza, Barra…)');
      if (!name) return;
      await api('/api/tables/zones', { method: 'POST', body: { name } });
      render($('#view'));
    };
  }
}

function paint() {
  const groups = [...data.zones.map((z) => [z, data.tables.filter((t) => t.zone_id === z.id)]),
    [null, data.tables.filter((t) => !t.zone_id)]].filter(([, list]) => list.length);

  $('#zones').innerHTML = groups.map(([zone, list]) => `
    <div class="card" style="margin-bottom:18px">
      <div class="card-head"><h3 style="margin:0">${esc(zone?.name || 'Sin zona')}</h3>
        <span class="muted">${list.length} mesas</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">
        ${list.map((t) => `<div class="card flat" style="padding:12px">
          <div class="spread"><strong style="font-family:var(--serif);font-size:19px">Mesa ${esc(t.name)}</strong>
            <span class="tag ${({ free: '', occupied: 'green', reserved: 'blue', cleaning: 'amber' })[t.status]}">
              ${({ free: 'Libre', occupied: 'Ocupada', reserved: 'Reservada', cleaning: 'Limpieza' })[t.status]}</span></div>
          <div class="muted" style="font-size:12.5px;margin:4px 0 10px">${t.seats} plazas${t.open_orders ? ` · ${t.open_orders} pedido(s) · ${money(t.open_total_cents)}` : ''}</div>
          <img src="/api/tables/${t.id}/qr.png?size=240" style="width:100%;border-radius:8px;background:#fff" alt="QR mesa ${esc(t.name)}" loading="lazy">
          <div class="row" style="margin-top:10px">
            <a class="btn sm grow" href="${esc(t.url)}" target="_blank">Ver</a>
            <a class="btn sm" href="/api/tables/${t.id}/qr.png?size=1200" download="qr-mesa-${esc(t.name)}.png">PNG</a>
            ${can('manager') ? `<button class="btn ghost sm" data-edit="${t.id}">⋯</button>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty"><span class="ico">▦</span>Todavía no has creado mesas.</div>';

  $$('[data-edit]').forEach((b) => b.onclick = () => editTable(data.tables.find((t) => t.id === Number(b.dataset.edit))));
}

async function newTables() {
  const body = el('div', { html: `
    <div class="field-row">
      <div class="field"><label>¿Cuántas mesas?</label><input id="qty" type="number" min="1" max="50" value="4"></div>
      <div class="field"><label>Empezar por el número</label><input id="start" type="number" min="1" placeholder="automático"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Zona</label><select id="zone">
        <option value="">Sin zona</option>
        ${data.zones.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Plazas por mesa</label><input id="seats" type="number" min="1" max="20" value="2"></div>
    </div>` });
  const r = await modal({
    title: 'Añadir mesas', body, save: 'Crear',
    onSave: (root) => api('/api/tables', { method: 'POST', body: {
      quantity: Number(root.querySelector('#qty').value),
      start_number: root.querySelector('#start').value || undefined,
      zone_id: root.querySelector('#zone').value || null,
      seats: Number(root.querySelector('#seats').value),
    } }),
  });
  if (r) { toast(`${r.length} mesas creadas`, 'ok'); render($('#view')); }
}

async function editTable(t) {
  const body = el('div', { html: `
    <div class="field-row">
      <div class="field"><label>Nombre / número</label><input id="name" value="${esc(t.name)}"></div>
      <div class="field"><label>Plazas</label><input id="seats" type="number" min="1" max="20" value="${t.seats}"></div>
    </div>
    <div class="field"><label>Zona</label><select id="zone">
      <option value="">Sin zona</option>
      ${data.zones.map((z) => `<option value="${z.id}" ${z.id === t.zone_id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Etiqueta NFC (UID)</label><input id="nfc" value="${esc(t.nfc_uid || '')}" placeholder="04:A2:39:…">
      <div class="help">Si programas una etiqueta NFC con <span class="mono">${esc(location.origin)}/t/UID</span>, abrirá esta mesa.</div></div>
    <div class="field-row">
      <div class="field"><label>Código grabado en la cuña</label><input value="${esc(t.qr_code || '')}" readonly onclick="this.select()">
        <div class="help">El QR apunta a <span class="mono">/q/${esc(t.qr_code || '')}</span>: permanente, no se regraba.</div></div>
      <div class="field"><label>Lote de la cuña</label><input id="lot" value="${esc(t.lot || '')}" placeholder="L2609-ANC"></div>
    </div>
    <div class="field"><label>Enlace de la mesa</label><input value="${esc(t.url)}" readonly onclick="this.select()"></div>
    <div class="row wrap-row">
      <button class="btn sm" id="rotate">Caducar enlaces compartidos</button>
      <a class="btn sm" href="/api/tables/${t.id}/qr.svg" target="_blank">Descargar SVG</a>
      <button class="btn danger sm" id="del">Eliminar mesa</button>
    </div>` });

  body.querySelector('#rotate').onclick = async () => {
    if (!await confirmDialog('Caducar enlaces', 'Los enlaces de esta mesa que alguien haya guardado dejarán de funcionar. La cuña grabada sigue valiendo. ¿Continuar?', 'Caducar')) return;
    await api(`/api/tables/${t.id}/rotate`, { method: 'POST' });
    document.querySelector('.modal-bg')?.remove();
    toast('Enlaces antiguos caducados. La cuña sigue funcionando.', 'ok');
    render($('#view'));
  };
  body.querySelector('#del').onclick = async () => {
    if (!await confirmDialog('Eliminar mesa', 'Se perderá el enlace de esta mesa.', 'Eliminar')) return;
    await api(`/api/tables/${t.id}`, { method: 'DELETE' });
    document.querySelector('.modal-bg')?.remove();
    render($('#view'));
  };

  const saved = await modal({
    title: `Mesa ${t.name}`, body,
    onSave: async (root) => {
      const nfc = root.querySelector('#nfc').value.trim();
      const out = await api(`/api/tables/${t.id}`, { method: 'PATCH', body: {
        name: root.querySelector('#name').value.trim(),
        seats: Number(root.querySelector('#seats').value),
        zone_id: root.querySelector('#zone').value || null,
        lot: root.querySelector('#lot').value.trim(),
      } });
      if (nfc && nfc !== (t.nfc_uid || '')) await api(`/api/tables/${t.id}/nfc`, { method: 'POST', body: { uid: nfc } });
      return out;
    },
  });
  if (saved) { toast('Mesa actualizada', 'ok'); render($('#view')); }
}

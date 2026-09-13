// Gestor de carta: categorías, productos, alérgenos, opciones e importación.
import { api, money, esc, el, $, $$, toast, modal, confirmDialog } from '/js/core.js';
import { app, can, hasFeature } from '/js/app.js';

let cats = [], items = [], catalog = null, sel = null;
const langOf = () => app.venue.locale || 'es';
const nameIn = (obj) => obj?.[langOf()] || obj?.es || Object.values(obj || {})[0] || '';
const LANG_NAMES = { es: 'Castellano', ca: 'Català', en: 'English', fr: 'Français', de: 'Deutsch' };
const langs = () => {
  const list = app.venue.languages?.length ? [...app.venue.languages] : [langOf()];
  return list.includes(langOf()) ? [langOf(), ...list.filter((l) => l !== langOf())] : list;
};

/** Campos de texto por idioma. Con un solo idioma es un input normal; con varios, uno por idioma. */
function i18nFields(prefix, label, value = {}, { textarea = false } = {}) {
  const many = langs().length > 1;
  return langs().map((l, i) => {
    const v = esc(value?.[l] || '');
    const input = textarea
      ? `<textarea id="${prefix}-${l}" rows="2" data-i18n="${prefix}" data-lang="${l}">${v}</textarea>`
      : `<input id="${prefix}-${l}" value="${v}" data-i18n="${prefix}" data-lang="${l}">`;
    return `<div class="field"><label>${label}${many ? ` · ${LANG_NAMES[l] || l.toUpperCase()}` : ''}${many && i > 0 ? ' <span class="muted" style="font-weight:400">(si se deja vacío, se muestra en ' + (LANG_NAMES[langOf()] || langOf()) + ')</span>' : ''}</label>${input}</div>`;
  }).join('');
}
function readI18n(root, prefix) {
  const out = {};
  root.querySelectorAll(`[data-i18n="${prefix}"]`).forEach((el2) => { const v = el2.value.trim(); if (v) out[el2.dataset.lang] = v; });
  return out;
}

export async function render(root) {
  [cats, items, catalog] = await Promise.all([
    api('/api/menu/categories'), api('/api/menu/items'), api('/api/venue/catalog'),
  ]);
  if (sel === null || !cats.some((c) => c.id === sel)) sel = cats[0]?.id ?? null;

  root.innerHTML = `
    <div class="spread" style="margin-bottom:18px">
      <div class="muted">${items.length} productos en ${cats.length} categorías</div>
      <div class="row">
        ${can('manager') ? `<button class="btn sm" id="import">Importar CSV</button>
        <a class="btn sm" href="/api/menu/export.csv">Exportar</a>
        <button class="btn sm" id="new-cat">+ Categoría</button>
        <button class="btn sm primary" id="new-item">+ Producto</button>` : ''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:230px 1fr;gap:20px" id="grid">
      <div id="cats"></div>
      <div id="items"></div>
    </div>`;
  if (innerWidth < 760) $('#grid').style.gridTemplateColumns = '1fr';
  paint();
  if (can('manager')) {
    $('#new-cat').onclick = () => editCategory(null);
    $('#new-item').onclick = () => editItem(null);
    $('#import').onclick = importCsv;
  }
}

function paint() {
  $('#cats').innerHTML = `<div class="card flat" style="padding:8px">
    ${cats.map((c) => `<div class="row" style="padding:2px">
      <button class="btn ghost sm grow" style="justify-content:flex-start;${c.id === sel ? 'background:var(--brand-soft);color:var(--brand);font-weight:700' : ''}"
        data-cat="${c.id}">${esc(nameIn(c.name))}${c.station ? ` <span class="muted" style="font-weight:400;font-size:11px">· ${c.station}</span>` : ''}
        <span class="muted" style="margin-left:auto;font-weight:400">${items.filter((i) => i.category_id === c.id).length}</span></button>
      ${can('manager') ? `<button class="btn ghost sm" data-editcat="${c.id}" title="Editar">⋯</button>` : ''}
    </div>`).join('') || '<div class="muted" style="padding:10px;font-size:13px">Sin categorías todavía.</div>'}
  </div>`;

  const list = items.filter((i) => i.category_id === sel);
  $('#items').innerHTML = list.length ? `<div class="card" style="padding:0">
    <table><thead><tr><th></th><th>Producto</th><th class="num">Precio</th><th>Estado</th><th></th></tr></thead>
    <tbody>${list.map((i, idx) => `<tr>
      <td style="width:52px">${i.image_path ? `<img src="${esc(i.image_path)}" style="width:40px;height:40px;border-radius:8px;object-fit:cover">` : ''}</td>
      <td><strong>${esc(nameIn(i.name))}</strong>
        <div class="muted movil-no" style="font-size:12.5px">${esc(nameIn(i.description) || '')}</div>
        <div style="margin-top:4px">${i.allergens.map((a) => catalog.allergens.find((x) => x.id === a)?.icon || '').join('')}
        ${i.option_groups.length ? `<span class="tag" style="margin-left:6px">${i.option_groups.length} grupo(s) de opciones</span>` : ''}</div></td>
      <td class="num">${money(i.price_cents, app.venue.currency)}</td>
      <td><button class="btn sm ${i.available ? 'green' : 'danger'}" data-avail="${i.id}">${i.available ? 'Disponible' : 'Agotado'}</button></td>
      <td class="right" style="white-space:nowrap">
        ${can('manager') ? `<button class="btn ghost sm movil-no" data-move="${i.id}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn ghost sm movil-no" data-move="${i.id}" data-dir="1" ${idx === list.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sm" data-edit="${i.id}">Editar</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`
    : `<div class="empty"><span class="ico">🍽️</span>Esta categoría todavía no tiene productos.</div>`;

  $$('[data-cat]').forEach((b) => b.onclick = () => { sel = Number(b.dataset.cat); paint(); });
  $$('[data-editcat]').forEach((b) => b.onclick = () => editCategory(cats.find((c) => c.id === Number(b.dataset.editcat))));
  $$('[data-edit]').forEach((b) => b.onclick = () => editItem(items.find((i) => i.id === Number(b.dataset.edit))));
  $$('[data-avail]').forEach((b) => b.onclick = async () => {
    const it = items.find((i) => i.id === Number(b.dataset.avail));
    const updated = await api(`/api/menu/items/${it.id}`, { method: 'PATCH', body: { available: !it.available } });
    Object.assign(it, updated); paint();
    toast(updated.available ? 'Disponible de nuevo' : 'Marcado como agotado', 'ok');
  });
  $$('[data-move]').forEach((b) => b.onclick = async () => {
    const arr = items.filter((i) => i.category_id === sel);
    const i = arr.findIndex((x) => x.id === Number(b.dataset.move));
    const j = i + Number(b.dataset.dir);
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await api('/api/menu/items/reorder', { method: 'POST', body: { order: arr.map((x, k) => ({ id: x.id, sort: k })) } });
    items = await api('/api/menu/items'); paint();
  });
}

async function editCategory(cat) {
  const body = el('div', { html: `
    ${i18nFields('name', 'Nombre', cat?.name)}
    ${i18nFields('desc', 'Descripción (opcional)', cat?.description)}
    <div class="field"><label>¿A dónde va esta comanda?</label><select id="station">
      <option value="" ${!cat?.station ? 'selected' : ''}>Sin separar</option>
      <option value="barra" ${cat?.station === 'barra' ? 'selected' : ''}>Barra (bebidas)</option>
      <option value="cocina" ${cat?.station === 'cocina' ? 'selected' : ''}>Cocina</option>
    </select><div class="help">Separa bebidas y comida para que en la pantalla de sala se puedan ver
    e imprimir comandas distintas para barra y para cocina.</div></div>
    <fieldset><legend>Horario de esta categoría</legend>
      <div class="field-row">
        <div class="field"><label>Desde</label><input id="from" type="time" value="${esc(cat?.available_from || '')}"></div>
        <div class="field"><label>Hasta</label><input id="to" type="time" value="${esc(cat?.available_to || '')}"></div>
      </div>
      <div class="help">Déjalo vacío para mostrarla siempre. Útil para desayunos o menú del día.</div>
    </fieldset>
    ${cat ? `<button class="btn danger sm" id="del">Eliminar categoría</button>` : ''}` });

  if (cat) body.querySelector('#del').onclick = async () => {
    if (!await confirmDialog('Eliminar categoría', 'Se eliminarán también sus productos. No se puede deshacer.', 'Eliminar')) return;
    await api(`/api/menu/categories/${cat.id}?force=1`, { method: 'DELETE' });
    document.querySelector('.modal-bg')?.remove();
    toast('Categoría eliminada', 'ok');
    sel = null; render($('#view'));
  };

  const saved = await modal({
    title: cat ? 'Editar categoría' : 'Nueva categoría', body,
    onSave: async (r) => {
      const payload = {
        name: readI18n(r, 'name'),
        description: readI18n(r, 'desc'),
        station: r.querySelector('#station').value,
        available_from: r.querySelector('#from').value || null,
        available_to: r.querySelector('#to').value || null,
      };
      if (!payload.name[langOf()]) throw new Error(`Pon el nombre en ${LANG_NAMES[langOf()] || langOf()}.`);
      return cat ? api(`/api/menu/categories/${cat.id}`, { method: 'PATCH', body: payload })
        : api('/api/menu/categories', { method: 'POST', body: payload });
    },
  });
  if (saved) { cats = await api('/api/menu/categories'); sel = saved.id ?? sel; paint(); toast('Guardado', 'ok'); }
}

async function editItem(item) {
  const body = el('div', { html: `
    ${i18nFields('name', 'Nombre', item?.name)}
    ${i18nFields('desc', 'Descripción', item?.description, { textarea: true })}
    <div class="field-row">
      <div class="field"><label>Precio (€)</label><input id="price" type="number" step="0.05" min="0" value="${item ? (item.price_cents / 100).toFixed(2) : ''}"></div>
      <div class="field"><label>Categoría</label><select id="cat">
        ${cats.map((c) => `<option value="${c.id}" ${item?.category_id === c.id || (!item && c.id === sel) ? 'selected' : ''}>${esc(nameIn(c.name))}</option>`).join('')}
      </select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Coste / escandallo (€)</label><input id="cost" type="number" step="0.05" min="0" value="${item?.cost_cents ? (item.cost_cents / 100).toFixed(2) : ''}">
        <div class="help">Opcional. Se usa en el informe de márgenes.</div></div>
      <div class="field"><label>Kcal</label><input id="kcal" type="number" min="0" value="${item?.kcal ?? ''}"></div>
    </div>
    <div class="field"><label>Alérgenos</label><div class="row wrap-row" id="algs">
      ${catalog.allergens.map((a) => `<button type="button" class="btn sm ${item?.allergens.includes(a.id) ? 'danger' : ''}" data-a="${a.id}">${a.icon} ${esc(a.label)}</button>`).join('')}
    </div></div>
    <div class="field"><label>Etiquetas</label><div class="row wrap-row" id="tags">
      ${catalog.tags.map((t) => `<button type="button" class="btn sm ${item?.tags.includes(t.id) ? 'primary' : ''}" data-t="${t.id}">${t.icon} ${esc(t.label)}</button>`).join('')}
    </div></div>
    ${item && hasFeature('upsell') ? `<div class="field"><label>Sugerir junto a este plato (máx. 4)</label>
      <div class="row wrap-row" id="sugs">
        ${items.filter((x) => x.id !== item.id && x.active).map((x) => `<button type="button" class="btn sm ${item.suggests?.includes(x.id) ? 'primary' : ''}" data-s="${x.id}">${esc(nameIn(x.name))}</button>`).join('')}
      </div><div class="help">Al añadir este plato al carrito, el cliente verá «¿Añades…?» con estos productos.</div></div>` : ''}
    ${item ? `<div class="field"><label>Foto</label><input id="img" type="file" accept="image/png,image/jpeg,image/webp">
      ${item.image_path ? `<img src="${esc(item.image_path)}" style="width:90px;border-radius:8px;margin-top:8px">` : ''}</div>` : ''}
    ${item && hasFeature('modifiers') ? `<fieldset><legend>Opciones y extras</legend><div id="groups"></div>
      <button type="button" class="btn sm" id="add-group">+ Grupo de opciones</button></fieldset>` : ''}
    ${item && !hasFeature('modifiers') ? '<div class="notice info">Las opciones y extras (tamaños, tipo de leche, guarniciones) están en el plan Servicio.</div>' : ''}
    ${item ? `<button type="button" class="btn danger sm" id="del">Eliminar producto</button>` : ''}` });

  const picked = { allergens: new Set(item?.allergens || []), tags: new Set(item?.tags || []), suggests: new Set(item?.suggests || []) };
  body.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
    const id = Number(b.dataset.s);
    if (picked.suggests.has(id)) picked.suggests.delete(id);
    else if (picked.suggests.size >= 4) return toast('Máximo 4 sugerencias por plato');
    else picked.suggests.add(id);
    b.classList.toggle('primary', picked.suggests.has(id));
  });
  body.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    const id = b.dataset.a;
    picked.allergens.has(id) ? picked.allergens.delete(id) : picked.allergens.add(id);
    b.classList.toggle('danger', picked.allergens.has(id));
  });
  body.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    const id = b.dataset.t;
    picked.tags.has(id) ? picked.tags.delete(id) : picked.tags.add(id);
    b.classList.toggle('primary', picked.tags.has(id));
  });

  if (item && hasFeature('modifiers')) {
    const drawGroups = async () => {
      const fresh = await api(`/api/menu/items/${item.id}`);
      item.option_groups = fresh.option_groups;
      body.querySelector('#groups').innerHTML = item.option_groups.map((g) => `
        <div class="card flat" style="padding:12px;margin-bottom:10px">
          <div class="spread"><strong>${esc(g.name)}</strong>
            <span><span class="muted" style="font-size:12.5px">elige ${g.min_select}–${g.max_select}</span>
            <button class="btn ghost sm" data-delg="${g.id}">✕</button></span></div>
          ${g.options.map((o) => `<div class="spread" style="font-size:13.5px;padding:3px 0">
            <span>${esc(o.name)}</span><span class="muted">${o.price_delta_cents ? '+' + money(o.price_delta_cents) : 'incluido'}
            <button class="btn ghost sm" data-delo="${o.id}">✕</button></span></div>`).join('')}
          <button class="btn sm" data-addo="${g.id}" style="margin-top:8px">+ Opción</button>
        </div>`).join('');
      body.querySelectorAll('[data-addo]').forEach((b) => b.onclick = async () => {
        const name = prompt('Nombre de la opción (p. ej. «Avena»)');
        if (!name) return;
        const price = prompt('Suplemento en € (0 si no tiene)', '0');
        await api(`/api/menu/groups/${b.dataset.addo}/options`, { method: 'POST', body: { name, price_delta: Number(price) || 0 } });
        drawGroups();
      });
      body.querySelectorAll('[data-delo]').forEach((b) => b.onclick = async () => {
        await api(`/api/menu/options/${b.dataset.delo}`, { method: 'DELETE' }); drawGroups();
      });
      body.querySelectorAll('[data-delg]').forEach((b) => b.onclick = async () => {
        await api(`/api/menu/groups/${b.dataset.delg}`, { method: 'DELETE' }); drawGroups();
      });
    };
    body.querySelector('#add-group').onclick = async () => {
      const name = prompt('Nombre del grupo (p. ej. «Tamaño», «Leche»)');
      if (!name) return;
      const min = Number(prompt('¿Cuántas opciones como mínimo? (0 = opcional)', '1')) || 0;
      const max = Number(prompt('¿Cuántas como máximo?', '1')) || 1;
      await api(`/api/menu/items/${item.id}/groups`, { method: 'POST', body: { name, min_select: min, max_select: max } });
      drawGroups();
    };
    drawGroups();
  }

  if (item) body.querySelector('#del').onclick = async () => {
    if (!await confirmDialog('Eliminar producto', `Se eliminará «${nameIn(item.name)}» de la carta.`, 'Eliminar')) return;
    await api(`/api/menu/items/${item.id}`, { method: 'DELETE' });
    document.querySelector('.modal-bg')?.remove();
    items = await api('/api/menu/items'); paint(); toast('Producto eliminado', 'ok');
  };

  const saved = await modal({
    title: item ? 'Editar producto' : 'Nuevo producto', body, wide: true,
    onSave: async (r) => {
      const payload = {
        name: readI18n(r, 'name'),
        description: readI18n(r, 'desc'),
        price: Number(r.querySelector('#price').value) || 0,
        cost: Number(r.querySelector('#cost').value) || 0,
        kcal: r.querySelector('#kcal').value === '' ? null : Number(r.querySelector('#kcal').value),
        category_id: Number(r.querySelector('#cat').value) || null,
        allergens: [...picked.allergens], tags: [...picked.tags],
        ...(item && hasFeature('upsell') ? { suggests: [...picked.suggests] } : {}),
      };
      if (!payload.name[langOf()]) throw new Error(`El producto necesita nombre en ${LANG_NAMES[langOf()] || langOf()}.`);
      const out = item ? await api(`/api/menu/items/${item.id}`, { method: 'PATCH', body: payload })
        : await api('/api/menu/items', { method: 'POST', body: payload });
      const file = r.querySelector('#img')?.files?.[0];
      if (file) {
        await api(`/api/menu/items/${out.id}/image`, { method: 'POST', raw: true, body: file, headers: { 'Content-Type': file.type } });
      }
      return out;
    },
  });
  if (saved) { items = await api('/api/menu/items'); sel = saved.category_id ?? sel; paint(); toast('Guardado', 'ok'); }
}

async function importCsv() {
  const body = el('div', { html: `
    <p class="muted" style="font-size:13.5px">Pega el CSV o sube un archivo. Columnas admitidas:
      <span class="mono">categoria, producto, descripcion, precio, alergenos, etiquetas</span>.
      Separa varios alérgenos con «|».</p>
    <div class="field"><input type="file" id="file" accept=".csv,text/csv"></div>
    <div class="field"><textarea id="csv" rows="8" placeholder="categoria,producto,descripcion,precio,alergenos
Bebidas,Caña,25 cl,2.60,gluten
Postres,Flan,De la casa,4.50,milk|eggs"></textarea></div>` });
  body.querySelector('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (f) body.querySelector('#csv').value = await f.text();
  };
  const r = await modal({
    title: 'Importar carta desde CSV', body, save: 'Importar',
    onSave: async (root) => {
      const csv = root.querySelector('#csv').value.trim();
      if (!csv) throw new Error('Pega el contenido del CSV.');
      return api('/api/menu/import', { method: 'POST', raw: true, body: csv, headers: { 'Content-Type': 'text/csv' } });
    },
  });
  if (r) { toast(r.message, 'ok'); render($('#view')); }
}

// Equipo del local: altas, roles y PIN de sala.
import { api, esc, el, $, $$, toast, modal, confirmDialog, fmtDate } from '/js/core.js';
import { hasFeature } from '/js/app.js';

const ROLE = { owner: 'Propietario', manager: 'Encargado', staff: 'Sala' };

export async function render(root) {
  const team = await api('/api/auth/team');
  root.innerHTML = `
    <div class="spread" style="margin-bottom:18px">
      <div class="muted">${team.length} personas con acceso</div>
      <button class="btn sm primary" id="add">+ Añadir persona</button>
    </div>
    <div class="card" style="padding:0"><table>
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>PIN</th><th>Último acceso</th><th></th></tr></thead>
      <tbody>${team.map((u) => `<tr>
        <td><strong>${esc(u.name)}</strong>${u.active ? '' : ' <span class="tag red">inactivo</span>'}</td>
        <td class="muted">${esc(u.email)}</td>
        <td><span class="tag ${u.role === 'owner' ? 'brand' : ''}">${ROLE[u.role]}</span></td>
        <td class="mono">${esc(u.pin || '—')}</td>
        <td class="muted">${u.last_login_at ? fmtDate(u.last_login_at) : 'nunca'}</td>
        <td class="right">${u.role === 'owner' ? '' : `<button class="btn sm" data-edit="${u.id}">Editar</button>`}</td>
      </tr>`).join('')}</tbody></table></div>
    <div class="notice info" style="margin-top:18px">
      <strong>Qué puede hacer cada rol.</strong> El personal de <em>sala</em> ve pedidos y mesas y puede marcar productos
      como agotados. El <em>encargado</em> además edita la carta, cancela pedidos y ve la analítica.
      El <em>propietario</em> gestiona el equipo y el plan.</div>`;

  $('#add').onclick = () => editUser(null);
  $$('[data-edit]').forEach((b) => b.onclick = () => editUser(team.find((u) => u.id === Number(b.dataset.edit))));
}

async function editUser(user) {
  const body = el('div', { html: `
    <div class="field-row">
      <div class="field"><label>Nombre</label><input id="name" value="${esc(user?.name || '')}"></div>
      <div class="field"><label>Rol</label><select id="role">
        <option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>Sala</option>
        <option value="manager" ${user?.role === 'manager' ? 'selected' : ''} ${hasFeature('staff') ? '' : 'disabled'}>Encargado${hasFeature('staff') ? '' : ' (plan Servicio)'}</option>
      </select></div>
    </div>
    <div class="field"><label>Email</label><input id="email" type="email" value="${esc(user?.email || '')}" ${user ? 'disabled' : ''}></div>
    <div class="field-row">
      <div class="field"><label>${user ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label><input id="password" type="password" minlength="8"></div>
      <div class="field"><label>PIN de sala</label><input id="pin" maxlength="6" value="${esc(user?.pin || '')}" placeholder="1234"></div>
    </div>
    ${user ? `<label class="row"><input type="checkbox" id="active" ${user.active ? 'checked' : ''}> <span>Cuenta activa</span></label>
      <button class="btn danger sm" id="del" style="margin-top:14px">Eliminar del equipo</button>` : ''}` });

  if (user) body.querySelector('#del').onclick = async () => {
    if (!await confirmDialog('Eliminar del equipo', `${user.name} perderá el acceso inmediatamente.`, 'Eliminar')) return;
    await api(`/api/auth/team/${user.id}`, { method: 'DELETE' });
    document.querySelector('.modal-bg')?.remove();
    toast('Acceso eliminado', 'ok'); render($('#view'));
  };

  const saved = await modal({
    title: user ? `Editar a ${user.name}` : 'Añadir persona al equipo', body,
    onSave: async (r) => {
      const payload = {
        name: r.querySelector('#name').value.trim(),
        role: r.querySelector('#role').value,
        pin: r.querySelector('#pin').value.trim(),
      };
      if (r.querySelector('#password').value) payload.password = r.querySelector('#password').value;
      if (user) {
        payload.active = r.querySelector('#active').checked;
        return api(`/api/auth/team/${user.id}`, { method: 'PATCH', body: payload });
      }
      payload.email = r.querySelector('#email').value.trim();
      if (!payload.email || !payload.password) throw new Error('Email y contraseña son obligatorios.');
      return api('/api/auth/team', { method: 'POST', body: payload });
    },
  });
  if (saved) { toast('Guardado', 'ok'); render($('#view')); }
}

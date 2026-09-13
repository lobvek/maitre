// Ajustes del local: marca, idiomas, impuestos, funciones y contraseña.
import { api, esc, el, $, $$, toast, modal } from '/js/core.js';
import { app, refreshChrome } from '/js/app.js';

const LANGS = { es: 'Castellano', ca: 'Català', en: 'English', fr: 'Français', de: 'Deutsch' };

export async function render(root) {
  const [v, push] = await Promise.all([api('/api/venue'), api('/api/push/key').catch(() => ({ subscriptions: 0, telegram: false }))]);
  const f = v.features || {};

  root.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <h3>Identidad</h3>
        <div class="field"><label>Nombre comercial</label><input id="name" value="${esc(v.name)}"></div>
        <div class="field-row">
          <div class="field"><label>Razón social</label><input id="legal_name" value="${esc(v.legal_name)}"></div>
          <div class="field"><label>NIF / CIF</label><input id="nif" value="${esc(v.nif)}"></div>
        </div>
        <div class="field"><label>Dirección</label><input id="address" value="${esc(v.address)}"></div>
        <div class="field-row">
          <div class="field"><label>Población</label><input id="city" value="${esc(v.city)}"></div>
          <div class="field"><label>Teléfono</label><input id="phone" value="${esc(v.phone)}"></div>
        </div>
        <div class="field"><label>Email de contacto</label><input id="email" type="email" value="${esc(v.email)}"></div>
      </div>

      <div class="card">
        <h3>Aspecto de la carta</h3>
        <div class="field"><label>Logotipo</label>
          <div class="row">
            ${v.logo_path ? `<img src="${esc(v.logo_path)}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;background:var(--surface-2)">` : ''}
            <input type="file" id="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml">
          </div>
          <div class="help">PNG o SVG, hasta 2 MB. Se usa en la carta y en la cuña de madera.</div></div>
        <div class="field-row">
          <div class="field"><label>Color de marca</label><input id="brand_color" type="color" value="${esc(v.brand_color)}" style="height:42px;padding:4px"></div>
          <div class="field"><label>Idioma principal</label><select id="locale">
            ${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${v.locale === k ? 'selected' : ''}>${n}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>Idiomas de la carta</label>
          <div class="row wrap-row" id="langs">
            ${Object.entries(LANGS).map(([k, n]) => `<button type="button" class="btn sm ${v.languages.includes(k) ? 'primary' : ''}" data-lang="${k}">${n}</button>`).join('')}
          </div></div>
        <div class="field"><label>Mensaje en la carta</label>
          <textarea id="service_note" rows="2">${esc(v.service_note)}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Wifi (SSID)</label><input id="wifi_ssid" value="${esc(v.wifi_ssid)}"></div>
          <div class="field"><label>Clave wifi</label><input id="wifi_password" value="${esc(v.wifi_password)}"></div>
        </div>
      </div>

      <div class="card">
        <h3>Funciones activas</h3>
        <p class="muted" style="font-size:13.5px">Activa solo lo que necesites. Puedes cambiarlo en cualquier momento.</p>
        ${toggle('calls', 'Aviso al personal', 'El cliente puede llamar al camarero, pedir la cuenta o agua.', f.calls !== false, v.plan_features.includes('calls'))}
        ${toggle('orders', 'Pedido desde la mesa', 'El cliente envía el pedido a barra desde su móvil.', f.orders !== false, v.plan_features.includes('orders'))}
        ${toggle('upsell', 'Sugerencias al pedir', '«¿Añades una caña con las bravas?». Se configuran plato a plato en la carta.', f.upsell !== false, v.plan_features.includes('upsell'))}
        ${toggle('guest_name', 'Pedir el nombre del cliente', 'Opcional, ayuda a identificar quién ha pedido qué.', !!f.guest_name, true)}
        ${toggle('notes', 'Permitir comentarios en los platos', '«Sin cebolla», «poco hecho»…', f.notes !== false, true)}
        ${toggle('reviews', 'Pedir valoración al terminar', 'Una nota de 1 a 5 y, si quiere, su email. Después del servicio, nunca antes de pedir.', f.reviews !== false, v.plan_features.includes('reviews'))}
        <hr>
        <h3 style="margin-top:0">Cobro del pedido</h3>
        <div class="field"><select id="payment_mode" ${v.plan_features.includes('payments') ? '' : 'disabled'}>
          <option value="venue" ${v.payment_mode === 'venue' ? 'selected' : ''}>Se paga en el local, como siempre</option>
          <option value="online_optional" ${v.payment_mode === 'online_optional' ? 'selected' : ''}>El cliente elige: pagar con el móvil o en el local</option>
          <option value="online_required" ${v.payment_mode === 'online_required' ? 'selected' : ''}>Se paga con el móvil antes de mandarlo a barra</option>
        </select>
        <div class="help">Con cobro previo, el pedido no aparece en la pantalla de sala hasta que el pago se confirma.
        Quien no quiera pagar por el móvil siempre puede avisar al camarero.
        ${v.plan_features.includes('payments') ? '' : '<br><span class="tag brand">Local</span> El pago con el móvil está en el plan Local.'}</div></div>
        <hr>
        <h3 style="margin-top:0">Cómo se entera el personal</h3>
        <p class="muted" style="font-size:13.5px">Los avisos y pedidos entran en la pantalla de sala. Si no tenéis una tablet en barra,
        que cada camarero active <strong>📳 Avisos</strong> en la pantalla de sala desde su móvil: le suena y vibra aunque
        esté bloqueado. En iPhone hay que añadir la sala a la pantalla de inicio primero (Compartir → Añadir a inicio).</p>
        <div class="notice ${push.subscriptions ? 'ok' : ''}" style="margin-bottom:12px">
          ${push.subscriptions ? `${push.subscriptions} móvil${push.subscriptions === 1 ? '' : 'es'} con avisos activos.` : 'Ningún móvil con avisos activos todavía.'}
          <button class="btn sm" id="push-test" style="margin-left:8px">Enviar prueba</button></div>
        <div class="field"><label>Grupo de Telegram del local (opcional)</label>
          <div class="row"><input id="telegram_chat_id" value="${esc(v.telegram_chat_id || '')}" placeholder="-100123456789" ${push.telegram ? '' : 'disabled'}>
          <button class="btn sm" id="tg-test" ${push.telegram ? '' : 'disabled'}>Probar</button></div>
          <div class="help">${push.telegram
            ? 'Añade el bot de Maitre a vuestro grupo y pega aquí el identificador del chat. Cada aviso y cada pedido llegan también ahí.'
            : 'Maitre todavía no tiene el bot de Telegram configurado en el servidor (MAITRE_TELEGRAM_BOT_TOKEN).'}</div></div>
        <hr>
        <h3 style="margin-top:0">Quién puede pedir</h3>
        <div class="field"><select id="order_gate">
          <option value="open" ${v.order_gate === 'open' ? 'selected' : ''}>Cualquiera que escanee el QR</option>
          <option value="occupied" ${v.order_gate === 'occupied' ? 'selected' : ''}>Solo si el personal ha abierto la mesa</option>
          <option value="code" ${v.order_gate === 'code' ? 'selected' : ''}>Hay que teclear el código del turno</option>
        </select>
        <div class="help">El QR de la cuña es fijo: quien le haga una foto podría pedir desde casa.
        Si cobras antes de enviar el pedido el problema casi desaparece; si no, abre la mesa al sentar a los
        clientes o usa el código, que el personal ve en la pantalla de sala.
        ${v.order_gate === 'code' && v.order_code ? `<br>Código actual: <strong>${esc(v.order_code)}</strong>` : ''}</div></div>
        ${v.payment_mode !== 'venue' ? `<div class="field"><label>Cuenta de la pasarela</label>
          <input id="payment_account" value="${esc(v.payment_account || '')}" placeholder="acct_… (pendiente de conectar)">
          <div class="help">El dinero va directo a tu cuenta. Maitre no lo toca ni guarda datos de tarjetas.</div></div>` : ''}
      </div>

      <div class="card">
        <h3>Impuestos y precios</h3>
        <div class="field-row">
          <div class="field"><label>IVA por defecto (%)</label><input id="tax_rate" type="number" step="0.5" min="0" max="50" value="${(v.tax_rate / 100).toFixed(1)}"></div>
          <div class="field"><label>Moneda</label><select id="currency">
            <option value="EUR" ${v.currency === 'EUR' ? 'selected' : ''}>Euro (€)</option>
            <option value="USD" ${v.currency === 'USD' ? 'selected' : ''}>Dólar ($)</option>
          </select></div>
        </div>
        <label class="row"><input type="checkbox" id="prices_include_tax" ${v.prices_include_tax ? 'checked' : ''}>
          <span>Los precios de la carta ya incluyen IVA</span></label>
        <div class="help">Así se muestran normalmente en hostelería en España.</div>
        <hr>
        <h3 style="margin-top:0">Conexión con tu TPV</h3>
        <div class="field"><label>URL de integración (webhook)</label>
          <input id="webhook_url" value="${esc(v.webhook_url || '')}" placeholder="https://tu-tpv.example.com/maitre" ${v.plan_features.includes('integrations') ? '' : 'disabled'}>
          <div class="help">Maitre enviará ahí cada pedido (creado, pagado, servido) firmado con HMAC-SHA256.
          Es la vía de integración mientras preparamos los conectores nativos.
          ${v.plan_features.includes('integrations') ? '' : '<br><span class="tag brand">Local</span> Las integraciones están en el plan Local.'}
          ${v.webhook_secret ? `<br>Clave de firma: <span class="mono">${esc(v.webhook_secret)}</span>` : ''}</div></div>
        <hr>
        <h3>Seguridad</h3>
        <button class="btn sm" id="pwd">Cambiar mi contraseña</button>
        <p class="muted" style="font-size:12.5px;margin-top:10px">Cambiarla cierra la sesión en el resto de dispositivos.</p>
      </div>
    </div>

    <div class="row" style="margin-top:20px;position:sticky;bottom:16px">
      <button class="btn primary lg" id="save">Guardar cambios</button>
      <span class="muted" id="saved"></span>
    </div>`;

  const langs = new Set(v.languages);
  $$('[data-lang]').forEach((b) => b.onclick = () => {
    const k = b.dataset.lang;
    langs.has(k) ? langs.delete(k) : langs.add(k);
    if (!langs.size) langs.add(v.locale);
    b.classList.toggle('primary', langs.has(k));
  });

  $('#push-test').onclick = async () => { await api('/api/push/test', { method: 'POST' }); toast('Prueba enviada a los móviles activos', 'ok'); };
  $('#tg-test').onclick = async () => {
    try { await api('/api/push/telegram-test', { method: 'POST', body: { chat_id: $('#telegram_chat_id').value } }); toast('Mensaje enviado al grupo', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  };

  $('#pwd').onclick = async () => {
    const body = el('div', { html: `
      <div class="field"><label>Contraseña actual</label><input id="cur" type="password"></div>
      <div class="field"><label>Nueva contraseña</label><input id="new" type="password" minlength="8"></div>` });
    const done = await modal({ title: 'Cambiar contraseña', body, onSave: (r) =>
      api('/api/auth/password', { method: 'POST', body: { current: r.querySelector('#cur').value, next: r.querySelector('#new').value } }) });
    if (done) toast('Contraseña actualizada', 'ok');
  };

  $('#save').onclick = async () => {
    const btn = $('#save'); btn.disabled = true;
    try {
      const body = { languages: [...langs], features: {} };
      for (const k of ['name', 'legal_name', 'nif', 'address', 'city', 'phone', 'email', 'brand_color', 'locale', 'currency', 'service_note', 'wifi_ssid', 'wifi_password']) {
        body[k] = $('#' + k).value;
      }
      body.tax_rate = Number($('#tax_rate').value);
      body.payment_mode = $('#payment_mode').value;
      body.order_gate = $('#order_gate').value;
      if (!$('#telegram_chat_id').disabled) body.telegram_chat_id = $('#telegram_chat_id').value.trim();
      if (!$('#webhook_url').disabled) body.webhook_url = $('#webhook_url').value.trim();
      if ($('#payment_account')) body.payment_account = $('#payment_account').value;
      body.prices_include_tax = $('#prices_include_tax').checked;
      for (const t of $$('[data-toggle]')) body.features[t.dataset.toggle] = t.checked;
      await api('/api/venue', { method: 'PATCH', body });
      const file = $('#logo').files?.[0];
      if (file) await api('/api/venue/logo', { method: 'POST', raw: true, body: file, headers: { 'Content-Type': file.type } });
      await refreshChrome();
      toast('Ajustes guardados', 'ok');
      render($('#view'));
    } catch (err) { toast(err.message, 'err'); }
    btn.disabled = false;
  };
}

function toggle(id, label, help, checked, allowed) {
  const plan = { reviews: 'Local' }[id] || 'Servicio';
  return `<label class="row" style="align-items:flex-start;padding:10px 0;border-top:1px solid var(--line-2)">
    <input type="checkbox" data-toggle="${id}" ${checked && allowed ? 'checked' : ''} ${allowed ? '' : 'disabled'} style="margin-top:3px">
    <span class="grow"><strong>${label}</strong> ${allowed ? '' : `<span class="tag brand">${plan}</span>`}
      <div class="muted" style="font-size:13px">${help}</div></span></label>`;
}

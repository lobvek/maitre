/* ============================================================================
   La web funciona como la carta.
   Los planes son platos, se añaden con +, viven en una barra de pedido abajo y
   al enviarlos se abre la misma hoja inferior que en el móvil del comensal.
   Quien llega aquí ya ha usado Maitre antes de que se lo enseñemos.
   ========================================================================== */
import { api, money, esc, el, $, $$, toast, icon, loader } from '/js/core.js';
import { haptic, volarAlCarrito, ocupado, arrastrable, MACRO, quieto } from '/js/motion.js';

// --- La carta ---------------------------------------------------------------
const CARTA = [
  {
    seccion: 'Planes · uno por local, al mes',
    platos: [
      { id: 'mesa', nombre: 'Mesa', precio: 1900, periodo: 'al mes',
        desc: 'La carta en el móvil, el pedido desde la mesa con variantes y extras, el aviso al personal y una pantalla de sala sencilla para recibirlos.',
        chips: ['Carta en 6 idiomas', 'Alérgenos', 'Pedido desde la mesa', 'Aviso al camarero', 'Hasta 40 mesas'] },
      { id: 'servicio', nombre: 'Servicio', precio: 3900, periodo: 'al mes', destacado: true, etiqueta: 'El que recomendamos',
        desc: 'Todo lo de Mesa y la sala entera: barra y cocina separadas, comanda imprimible, agotados de un toque, cambio y unión de mesas, equipo con roles, analítica y valoración del cliente.',
        chips: ['Todo lo de Mesa', 'Barra y cocina', 'Agotados', 'Mesas y roles', 'Analítica', 'Reseñas', 'Hasta 80 mesas'] },
      { id: 'grupo', nombre: 'Grupo', precio: 2900, periodo: 'por local y mes',
        desc: 'Para una marca con cinco locales o más: todo lo de Servicio y una cuenta para quien manda, que entra en todos y los compara, mientras cada local sigue viendo solo el suyo.',
        chips: ['Todo lo de Servicio', 'Desde 5 locales', 'Cuenta de grupo', 'Comparativa entre locales'] },
    ],
  },
  {
    seccion: 'Para la mesa · un solo pago',
    platos: [
      { id: 'cunas', nombre: 'Cuñas de madera', precio: null, periodo: 'a coste, por mesa', porMesa: true,
        desc: 'Roble recuperado de toneles, con tu logo, el número y el QR grabados a láser. Módulos que se deslizan en la base: servilletero, cubrecenicero, azucarillos, aro de taza. Durante el piloto van en depósito.',
        chips: ['Grabado a láser', 'QR administrable', 'Módulos intercambiables', 'En depósito durante el piloto'] },
      { id: 'hoja', nombre: 'Hoja de QR provisional', precio: 0, periodo: 'incluida',
        desc: 'Tarjetas recortables para empezar hoy mismo mientras se fabrican las cuñas. Los QR son los definitivos: no habrá que cambiarlos.',
        chips: ['Para empezar hoy', 'Mismos QR que la madera'] },
    ],
  },
  {
    seccion: 'Puesta en marcha · incluido',
    platos: [
      { id: 'instalacion', nombre: 'Instalación y formación', precio: 0, periodo: 'incluido',
        desc: 'Vamos al local, cargamos la carta, creamos las mesas y formamos al equipo en menos de 45 minutos. El primer servicio lo acompañamos.',
        chips: ['En 72 horas', 'Formación al equipo', 'Primer servicio acompañado'] },
      { id: 'soporte', nombre: 'Soporte por WhatsApp', precio: 0, periodo: 'incluido',
        desc: 'Un número, no un formulario. Durante el piloto contestan los fundadores.',
        chips: ['Directo con nosotros'] },
    ],
  },
  {
    seccion: 'En preparación · todavía no se vende',
    pronto: true,
    platos: [
      { id: 'tpv', nombre: 'Conexión con tu TPV', precio: null, periodo: 'sin fecha', pronto: true,
        desc: 'Hoy conviven: el camarero mete la comanda como siempre y Maitre marca quién la está metiendo para que no la metan tres veces. El conector llegará cuando diez locales pidan el mismo TPV.',
        chips: ['Webhook firmado ya disponible'] },
      { id: 'pagos', nombre: 'Pago con el móvil', precio: null, periodo: 'sin fecha', pronto: true,
        desc: 'Construido y apagado a propósito: cobrar sin estar integrado con la caja le crea un descuadre al bar. Primero el conector, después el cobro.',
        chips: ['Al pedir o al final', 'Cuando esté el conector'] },
    ],
  },
];

const PLANES = ['mesa', 'servicio', 'grupo'];
const estado = {
  pedido: JSON.parse(localStorage.getItem('maitre_web_pedido') || '[]'),
  mesas: Number(localStorage.getItem('maitre_web_mesas')) || 18,
  local: localStorage.getItem('maitre_web_local') || '',
};
const guardar = () => {
  localStorage.setItem('maitre_web_pedido', JSON.stringify(estado.pedido));
  localStorage.setItem('maitre_web_mesas', String(estado.mesas));
  localStorage.setItem('maitre_web_local', estado.local);
};
const plato = (id) => CARTA.flatMap((s) => s.platos).find((p) => p.id === id);

/** Orientación de coste de una cuña, mientras no esté cerrado con el taller. */
const CUNA = [900, 1400];

// --- La carta pintada -------------------------------------------------------
function pintarCarta() {
  $('#carta-planes').innerHTML = CARTA.map((sec) => `
    <div class="rotulo" style="margin:26px 0 4px">${esc(sec.seccion)}</div>
    ${sec.platos.map((p) => `
      <div class="plato ${p.destacado ? 'destacado' : ''} ${p.pronto ? 'pronto' : ''}" data-plato="${p.id}">
        <div class="plato-cuerpo">
          <h3>${esc(p.nombre)}${p.etiqueta ? ` <span class="tag brand" style="vertical-align:middle">${esc(p.etiqueta)}</span>` : ''}</h3>
          <p>${esc(p.desc)}</p>
          <div class="chips">${p.chips.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</div>
          <div class="precio">
            ${p.precio === null ? '<span class="muted">Según tus mesas</span>'
              : p.precio === 0 ? 'Incluido' : `${money(p.precio)} <small>${esc(p.periodo)}</small>`}
            ${p.precio > 0 ? `<small>+ IVA</small>` : ''}
          </div>
        </div>
        ${p.pronto || p.precio === 0 ? '' : `<button class="mas" data-add="${p.id}" aria-label="Añadir ${esc(p.nombre)}">${icon('plus')}</button>`}
      </div>`).join('')}
  `).join('');

  $$('[data-add]').forEach((b) => b.onclick = () => añadir(b.dataset.add, b));
  marcarPuestos();
}

function marcarPuestos() {
  $$('[data-add]').forEach((b) => {
    const puesto = estado.pedido.includes(b.dataset.add);
    b.classList.toggle('puesto', puesto);
    b.innerHTML = icon(puesto ? 'check' : 'plus');
  });
}

function añadir(id, boton) {
  const p = plato(id);
  if (!p) return;
  if (estado.pedido.includes(id)) {
    estado.pedido = estado.pedido.filter((x) => x !== id);
  } else {
    // Los planes son excluyentes: no se contratan dos a la vez.
    if (PLANES.includes(id)) estado.pedido = estado.pedido.filter((x) => !PLANES.includes(x));
    estado.pedido.push(id);
    haptic(14);
    volarAlCarrito(boton, $('#ver-pedido'));
  }
  guardar();
  marcarPuestos();
  pintarBarra();
}

// --- La barra de abajo ------------------------------------------------------
function totales() {
  const mensual = estado.pedido.filter((id) => !plato(id).porMesa)
    .reduce((n, id) => n + (plato(id).precio || 0) * (id === 'grupo' ? 5 : 1), 0);
  const cunas = estado.pedido.includes('cunas')
    ? [estado.mesas * CUNA[0], estado.mesas * CUNA[1]] : null;
  return { mensual, cunas };
}

function pintarBarra() {
  const barra = $('#barra');
  if (!estado.pedido.length) { barra.classList.remove('fuera'); return; }
  const { mensual } = totales();
  const n = estado.pedido.length;
  $('#resumen').innerHTML = `<strong>${n}</strong> ${n === 1 ? 'cosa' : 'cosas'}${mensual ? ` · <strong>${money(mensual)}</strong>/mes` : ''}`;
  barra.classList.add('fuera');
}

// --- La hoja del pedido, la misma que en la mesa ----------------------------
function hoja(html, alMontar) {
  const panel = el('div', { class: 'sheet', html });
  const fondo = el('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === fondo) cerrar(); } }, panel);
  const cerrar = () => {
    panel.style.transition = `transform .3s ${MACRO}`;
    panel.style.transform = 'translateY(100%)';
    fondo.style.transition = 'background .3s'; fondo.style.background = 'rgba(35,36,28,0)';
    setTimeout(() => fondo.remove(), 290);
  };
  document.body.append(fondo);
  if (!quieto) arrastrable(fondo, panel, cerrar);
  alMontar?.(fondo, cerrar);
  return cerrar;
}

function abrirPedido() {
  const { mensual, cunas } = totales();
  const lineas = estado.pedido.map((id) => {
    const p = plato(id);
    const precio = p.porMesa ? `${money(cunas[0])} – ${money(cunas[1])}`
      : p.precio ? `${money(p.precio * (id === 'grupo' ? 5 : 1))}/mes` : 'incluido';
    return `<div class="line"><div class="grow"><strong>${esc(p.nombre)}</strong>
      ${p.porMesa ? `<div class="muted" style="font-size:12.5px">${estado.mesas} mesas, un solo pago</div>`
        : id === 'grupo' ? '<div class="muted" style="font-size:12.5px">5 locales, el mínimo</div>' : ''}</div>
      <div>${precio}<button class="btn ghost sm" data-quitar="${id}" style="color:var(--red);margin-left:8px">Quitar</button></div></div>`;
  }).join('');

  hoja(`
    <div class="sheet-head"><div>
      <h3 style="margin:0 0 2px">Tu pedido</h3>
      <div class="muted" style="font-size:13.5px">Lo revisamos contigo antes de nada</div>
    </div><button class="btn ghost sm" data-close>${icon('x')}</button></div>
    <div class="sheet-body">
      ${lineas || '<div class="empty">Todavía no has añadido nada.</div>'}
      <div class="field" style="margin-top:16px"><label>¿Cuántas mesas tiene tu local?</label>
        <input id="h-mesas" type="number" min="1" max="200" value="${estado.mesas}"></div>
      <div class="spread" style="margin-top:14px;font-size:17px">
        <strong>Al mes</strong><strong>${mensual ? `${money(mensual)} + IVA` : '—'}</strong></div>
      ${mensual ? `<div class="muted" style="font-size:13px;margin-top:4px">Sale a
        <strong>${money(mensual / Math.max(1, estado.mesas) / 30)}</strong> por mesa y día. Menos que una servilleta.</div>` : ''}
      ${cunas ? `<div class="spread" style="margin-top:10px"><span>Cuñas, un solo pago</span>
        <strong>${money(cunas[0])} – ${money(cunas[1])}</strong></div>
        <div class="muted" style="font-size:12.5px">Orientativo, a coste completo. En depósito durante el piloto.</div>` : ''}

      <hr>
      <h3 style="margin:0 0 10px;font-size:1.05rem">¿A quién se lo llevamos?</h3>
      <div class="field-row">
        <div class="field"><label>Tu nombre</label><input id="h-name" required></div>
        <div class="field"><label>Local</label><input id="h-venue" value="${esc(estado.local)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Email</label><input id="h-email" type="email" required></div>
        <div class="field"><label>Teléfono</label><input id="h-phone"></div>
      </div>
      <div class="field"><label>Población</label><input id="h-city"></div>
      <div class="field"><label>¿Qué te duele hoy en la sala?</label>
        <textarea id="h-msg" rows="2" placeholder="Esperas en terraza, errores de comanda, falta de manos…"></textarea></div>
      <p class="muted" style="font-size:12px;margin:0">Al enviar aceptas el
        <a href="/privacidad">aviso de privacidad</a>. Usamos tus datos solo para responderte.</p>
    </div>
    <div class="sheet-foot"><button class="btn primary grow lg" id="h-enviar">Enviar el pedido</button></div>`,
  (fondo, cerrar) => {
    fondo.querySelector('[data-close]').onclick = cerrar;
    fondo.querySelectorAll('[data-quitar]').forEach((b) => b.onclick = () => {
      estado.pedido = estado.pedido.filter((x) => x !== b.dataset.quitar);
      guardar(); marcarPuestos(); pintarBarra(); cerrar(); abrirPedido();
    });
    const mesas = fondo.querySelector('#h-mesas');
    mesas.onchange = () => {
      estado.mesas = Math.min(200, Math.max(1, Number(mesas.value) || 1));
      guardar(); cerrar(); abrirPedido();
    };
    fondo.querySelector('#h-enviar').onclick = async (e) => {
      const nombre = fondo.querySelector('#h-name').value.trim();
      const email = fondo.querySelector('#h-email').value.trim();
      if (!nombre || !email) return toast('Necesitamos tu nombre y tu email.', 'err');
      await ocupado(e.target, async () => {
        const elegido = estado.pedido.map((id) => plato(id).nombre).join(', ');
        await api('/api/leads', { method: 'POST', body: {
          name: nombre, email,
          venue_name: fondo.querySelector('#h-venue').value,
          phone: fondo.querySelector('#h-phone').value,
          city: fondo.querySelector('#h-city').value,
          tables: estado.mesas,
          plan_interest: estado.pedido.find((id) => PLANES.includes(id)) || '',
          message: `Pedido desde la web: ${elegido || 'sin elegir'}. ${fondo.querySelector('#h-msg').value}`.trim(),
        } });
        cerrar();
        confirmar(elegido);
        estado.pedido = []; guardar(); marcarPuestos(); pintarBarra();
      });
    };
  });
}

/** La misma confirmación que ve un comensal cuando manda su pedido. */
function confirmar(elegido) {
  haptic(22);
  hoja(`
    <div class="sheet-head"><h3 style="margin:0">Pedido enviado</h3>
      <button class="btn ghost sm" data-close>${icon('x')}</button></div>
    <div class="sheet-body center" style="padding-bottom:26px">
      <div style="color:var(--brand);margin-bottom:10px">${icon('check', 'i-lg')}</div>
      <p style="margin:0 0 6px"><strong>Te escribimos en menos de 24 horas laborables.</strong></p>
      <p class="muted" style="font-size:14px;margin:0">${elegido ? `Apuntado: ${esc(elegido)}.` : ''}
      Si tienes prisa, escríbenos por WhatsApp y lo vemos hoy.</p>
      <a class="btn primary" style="margin-top:20px" href="https://wa.me/34618218289" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    </div>`, (fondo, cerrar) => { fondo.querySelector('[data-close]').onclick = cerrar; });
}

// --- Entrada y movimiento ---------------------------------------------------
function entrada() {
  const intro = $('#intro');
  intro.innerHTML = loader('Poniendo la cafetera…');
  const abrir = () => {
    intro.classList.add('fuera');
    document.body.classList.remove('cargando');
    setTimeout(() => intro.remove(), 600);
  };
  // Lo justo para que se vea la cafetera, sin hacer esperar a nadie de verdad.
  const minimo = quieto ? 0 : 900;
  const desde = performance.now();
  addEventListener('load', () => setTimeout(abrir, Math.max(0, minimo - (performance.now() - desde))));
  setTimeout(abrir, 3500);   // salida de emergencia: la web nunca se queda en la cafetera
}

function revelar() {
  if (quieto) { $$('.sube').forEach((e) => e.classList.add('vista')); return; }
  const obs = new IntersectionObserver((filas) => {
    for (const f of filas) {
      if (!f.isIntersecting) continue;
      const hermanos = [...f.target.parentElement.children].filter((x) => x.classList.contains('sube'));
      f.target.style.transitionDelay = `${Math.min(hermanos.indexOf(f.target), 5) * 70}ms`;
      f.target.classList.add('vista');
      obs.unobserve(f.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: .12 });
  $$('.sube').forEach((e) => obs.observe(e));
}

function navegacion() {
  const nav = document.querySelector('header.nav');
  const secciones = $$('section[id]');
  addEventListener('scroll', () => {
    nav.classList.toggle('stuck', scrollY > 12);
    let activa = '';
    for (const s of secciones) if (s.getBoundingClientRect().top <= 140) activa = s.id;
    $$('.cat').forEach((c) => c.classList.toggle('on', c.getAttribute('href') === `#${activa}`));
  }, { passive: true });

  $$('.cat').forEach((c) => c.onclick = (e) => {
    e.preventDefault();
    document.querySelector(c.getAttribute('href'))?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth' });
    haptic(8);
  });
}

// --- Arranque ---------------------------------------------------------------
entrada();
pintarCarta();
pintarBarra();
revelar();
navegacion();

$('#ver-pedido').onclick = abrirPedido;

$('#probar').onsubmit = (e) => {
  e.preventDefault();
  estado.local = $('#p-venue').value.trim();
  guardar();
  if (!estado.pedido.length) estado.pedido = ['servicio'];
  guardar(); marcarPuestos(); pintarBarra();
  document.querySelector('#precios').scrollIntoView({ behavior: quieto ? 'auto' : 'smooth' });
  setTimeout(abrirPedido, quieto ? 0 : 700);
};

/* ============================================================================
   El pase de prototipado.
   Un recorrido guiado por el software para enseñarlo en la mesa de un bar: en
   cada paso dice qué contar y qué tocar, y salta solo de la carta a la sala y
   al panel. Sirve de demostración y de guion a la vez, para que nadie se quede
   en blanco delante del dueño.

   Se enciende poniendo ?tour en cualquier pantalla. Se sale con Esc.
   ========================================================================== */
const CLAVE = 'maitre_tour';
/* Marca de los saltos que hace el propio recorrido. Abrirlo a mano con ?tour=1
   siempre empieza por el principio; esto es lo único que continúa donde iba. */
const SEGUIR = 'seguir';

/* Cada paso: dónde ocurre, qué señalar, qué decir y qué hacer.
   `decir` es para quien enseña; `hacer`, la acción concreta. */
const PASOS = [
  { en: 'carta', sel: '.m-head',
    titulo: 'Esto es lo que ve tu cliente',
    decir: 'Escanea el QR de la cuña y le sale tu carta. Sin descargar nada, sin registrarse y con tu logo.',
    hacer: 'Enséñaselo en su propio móvil: que lo escanee él.' },
  { en: 'carta', sel: '.m-chips, .m-cats',
    titulo: 'Se busca y se filtra',
    decir: 'Los catorce alérgenos, filtros por dieta y seis idiomas. Si entra un alemán, le sale en alemán solo.',
    hacer: 'Toca «Vegetariano» y mira cómo se queda la carta.' },
  { en: 'carta', sel: '.dish-add',
    titulo: 'Pedir es un toque',
    decir: 'Para una caña no hay que abrir nada. Y si ya pidieron, arriba les sale «Otra ronda» con lo mismo de antes.',
    hacer: 'Dale al + de un par de platos.' },
  { en: 'carta', sel: '#btn-cart',
    titulo: 'Y se envía',
    decir: 'Ve el pedido avanzar: recibido, aceptado, en preparación, servido. Se acabó el «¿y lo mío?».',
    hacer: 'Envía el pedido de verdad. Lo vamos a ver caer en la barra.' },

  { en: 'sala', sel: '.cols',
    titulo: 'Aquí cae, al instante',
    decir: 'Esta pantalla va en una tablet o en el ordenador de barra. Suena, y el pedido entra solo.',
    hacer: 'Señala el pedido que acabáis de hacer.' },
  { en: 'sala', sel: '.ticket footer, .ticket',
    titulo: 'Que no lo metan dos camareros',
    decir: 'Quien lo va a teclear en la caja pulsa «Lo cojo yo» y los demás lo ven. Es el error que más dinero cuesta.',
    hacer: 'Pulsa «Lo cojo yo» y luego «Aceptar».' },
  { en: 'sala', sel: '#agotados',
    titulo: 'Agotados, sin tocar la carta',
    decir: 'Se acaban las croquetas: un toque y desaparece del móvil de todas las mesas. Sin editar nada.',
    hacer: 'Abre el 86 y marca algo como agotado.' },
  { en: 'sala', sel: '#calls, .bar',
    titulo: 'Y los avisos',
    decir: 'La mesa pide la cuenta o agua y sale aquí arriba, con el motivo. Si no te encaja, se apaga.',
    hacer: 'Si no hay ninguno, pídelo desde la carta con el botón «Avisar».' },

  { en: 'panel', hash: '#/carta', sel: '#items, #view',
    titulo: 'La carta se cambia aquí',
    decir: 'Subes el precio de algo y en el móvil de la mesa ya está cambiado. No hay que reimprimir nada nunca más.',
    hacer: 'Cambia un precio y vuelve a la carta del móvil.' },
  { en: 'panel', hash: '#/mesas', sel: '#view',
    titulo: 'Mesas y QR',
    decir: 'Cada mesa tiene su QR permanente. Mientras llegan las cuñas de madera, se imprime una hoja y se empieza hoy.',
    hacer: 'Enséñale la hoja de QR imprimible.' },
  { en: 'panel', hash: '#/analitica', sel: '#view',
    titulo: 'Y lo que nadie le da',
    decir: 'Ventas, ticket medio, cuánto tardáis en aceptar, qué mesas rinden y lo que más se vende. Con esto se decide si seguimos.',
    hacer: 'Busca el dato que más le duela: esperas o ticket medio.' },
  { en: 'panel', hash: '#/facturacion', sel: '#view',
    titulo: 'Y lo que cuesta',
    decir: 'Cuota fija, sin comisión por pedido y sin permanencia. Treinta días de piloto con objetivos y una decisión al final.',
    hacer: 'Cierra pidiéndole una fecha para montarlo.' },
];

// --- Dónde estamos ----------------------------------------------------------
const dondeEstoy = () => (location.pathname.startsWith('/m/') ? 'carta'
  : location.pathname.startsWith('/sala') ? 'sala'
    : location.pathname.startsWith('/panel') ? 'panel' : null);

const leer = () => Number(sessionStorage.getItem(CLAVE) ?? -1);
const guardar = (i) => sessionStorage.setItem(CLAVE, String(i));
const salir = () => { sessionStorage.removeItem(CLAVE); document.querySelector('#tour')?.remove(); };

// --- Estilos, dentro del propio módulo para poder caer en cualquier pantalla -
function estilos() {
  if (document.querySelector('#tour-css')) return;
  const css = document.createElement('style');
  css.id = 'tour-css';
  css.textContent = `
    #tour { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
    #tour .foco { position: absolute; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(25,27,18,.62);
      transition: all .45s cubic-bezier(.32,.72,0,1); outline: 2px solid var(--brand); }
    #tour .ficha { position: absolute; pointer-events: auto; width: min(380px, calc(100vw - 32px));
      background: var(--surface); border-radius: var(--r-lg); box-shadow: 0 24px 60px rgba(0,0,0,.34);
      padding: 18px 20px 16px; transition: all .45s cubic-bezier(.32,.72,0,1); }
    #tour .cuenta { font: 700 10.5px var(--sans); letter-spacing: .16em; text-transform: uppercase;
      color: var(--ink-3); margin-bottom: 8px; }
    #tour h4 { font-family: var(--display); font-size: 1.16rem; font-weight: 600; margin: 0 0 8px; letter-spacing: -.015em; }
    #tour .decir { font-size: 14.5px; line-height: 1.55; margin: 0 0 12px; }
    #tour .hacer { font-size: 13px; color: var(--brand); background: var(--g-50); border-radius: 10px;
      padding: 9px 12px; display: flex; gap: 8px; align-items: flex-start; font-weight: 600; }
    #tour .pies { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
    #tour .barra { flex: 1; height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; }
    #tour .barra i { display: block; height: 100%; background: var(--brand); transition: width .45s cubic-bezier(.32,.72,0,1); }
    @media (max-width: 760px) { #tour .ficha { left: 16px !important; right: 16px; bottom: 16px !important; top: auto !important; width: auto; } }
    @media (prefers-reduced-motion: reduce) { #tour .foco, #tour .ficha { transition: none; } }`;
  document.head.append(css);
}

// --- Pintar un paso ---------------------------------------------------------
function pintar(i) {
  const paso = PASOS[i];
  estilos();
  let raiz = document.querySelector('#tour');
  if (!raiz) {
    raiz = document.createElement('div');
    raiz.id = 'tour';
    raiz.innerHTML = '<div class="foco"></div><div class="ficha"></div>';
    document.body.append(raiz);
  }
  const foco = raiz.querySelector('.foco');
  const ficha = raiz.querySelector('.ficha');

  // El elemento a señalar puede no existir (una sala vacía, por ejemplo):
  // entonces no se señala nada y la ficha se queda en el centro. Nunca se rompe.
  const objetivo = paso.sel ? document.querySelector(paso.sel) : null;
  if (objetivo) {
    objetivo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const situar = () => {
      const r = objetivo.getBoundingClientRect();
      if (!r.width && !r.height) { foco.style.opacity = '0'; centrar(ficha); return; }
      foco.style.opacity = '1';
      foco.style.top = `${r.top - 6}px`; foco.style.left = `${r.left - 6}px`;
      foco.style.width = `${r.width + 12}px`; foco.style.height = `${r.height + 12}px`;
      colocarFicha(ficha, r);
    };
    setTimeout(situar, 340);
    // Si se mueve la pantalla, el foco va detrás: señalar el sitio equivocado es peor que no señalar.
    raiz._seguir = situar;
  } else {
    foco.style.opacity = '0';
    centrar(ficha);
    raiz._seguir = null;
  }

  ficha.innerHTML = `
    <div class="cuenta">Paso ${i + 1} de ${PASOS.length}</div>
    <h4>${paso.titulo}</h4>
    <p class="decir">${paso.decir}</p>
    <div class="hacer"><span>→</span><span>${paso.hacer}</span></div>
    <div class="pies">
      <div class="barra"><i style="width:${Math.round(((i + 1) / PASOS.length) * 100)}%"></i></div>
      ${i > 0 ? '<button class="btn sm" data-t="atras">Atrás</button>' : ''}
      <button class="btn sm" data-t="salir">Salir</button>
      <button class="btn primary sm" data-t="siguiente">${i === PASOS.length - 1 ? 'Terminar' : 'Siguiente'}</button>
    </div>`;

  ficha.querySelector('[data-t="siguiente"]').onclick = () => ir(i + 1);
  ficha.querySelector('[data-t="salir"]')?.addEventListener('click', salir);
  ficha.querySelector('[data-t="atras"]')?.addEventListener('click', () => ir(i - 1));
}

function centrar(ficha) {
  ficha.style.top = '50%'; ficha.style.left = '50%'; ficha.style.transform = 'translate(-50%,-50%)';
}

function colocarFicha(ficha, r) {
  const margen = 16;
  const ancho = ficha.offsetWidth || 380;
  const alto = ficha.offsetHeight || 230;
  const abajo = r.bottom + alto + margen < innerHeight;
  ficha.style.transform = '';
  ficha.style.top = `${Math.max(margen, abajo ? r.bottom + margen : r.top - alto - margen)}px`;
  // El clamp nunca puede salir negativo: con la ventana a cero, la ficha se iba fuera.
  ficha.style.left = `${Math.max(margen, Math.min(r.left, innerWidth - ancho - margen))}px`;
}

// --- Moverse entre pasos, saltando de pantalla cuando toca ------------------
async function ir(i) {
  if (i < 0 || i >= PASOS.length) return salir();
  guardar(i);
  const paso = PASOS[i];
  if (paso.en === dondeEstoy()) {
    if (paso.hash && location.hash !== paso.hash) {
      location.hash = paso.hash;
      await new Promise((r) => setTimeout(r, 650));   // la sección tarda en cargar
    }
    pintar(i);
    return;
  }
  location.href = await url(paso);
}

/** La dirección de cada pantalla. La carta usa la primera mesa del local de verdad. */
async function url(paso) {
  if (paso.en === 'sala') return `/sala?tour=${SEGUIR}`;
  if (paso.en === 'panel') return `/panel?tour=${SEGUIR}${paso.hash || ''}`;
  try {
    const r = await fetch('/api/tables', { credentials: 'same-origin' });
    const d = await r.json();
    const mesa = d.tables?.[0];
    if (mesa?.url) return `${new URL(mesa.url).pathname}?tour=${SEGUIR}`;
  } catch { /* sin sesión: no pasa nada */ }
  return `/m/bar-lancora/zRUufoh2?tour=${SEGUIR}`;
}

// --- Arranque ---------------------------------------------------------------
export function arrancar() {
  if (!dondeEstoy()) return;
  const pedido = new URLSearchParams(location.search).get('tour');
  // Abrirlo a mano empieza por el paso 1, caiga donde caiga la pantalla: si no,
  // enganchar el enlace del panel te dejaba en mitad del guion.
  const desdeCero = pedido !== null && pedido !== SEGUIR;
  const i = desdeCero ? 0 : Math.max(0, leer());
  guardar(i);
  setTimeout(() => ir(i), 900);   // deja que la pantalla termine de cargar

  for (const ev of ['scroll', 'resize']) {
    addEventListener(ev, () => document.querySelector('#tour')?._seguir?.(), { passive: true });
  }

  addEventListener('keydown', (e) => {
    if (!document.querySelector('#tour')) return;
    if (e.key === 'Escape') salir();
    if (e.key === 'ArrowRight') ir(leer() + 1);
    if (e.key === 'ArrowLeft') ir(leer() - 1);
  });
}

arrancar();

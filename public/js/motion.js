/* ============================================================================
   Movimiento de Maitre.
   Dos velocidades, como en la investigación: el dedo responde en 120 ms, las
   superficies se mueven en 400-500 ms con la curva que arranca fuerte y se posa.
   Todo respeta «reducir movimiento» del sistema.
   ========================================================================== */

export const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const MICRO = 'cubic-bezier(.25,.46,.45,.94)';
export const MACRO = 'cubic-bezier(.32,.72,0,1)';
export const EXPO = 'cubic-bezier(.16,1,.3,1)';

/** Vibración corta en el móvil. En barra, con ruido, se nota más que un sonido. */
export function haptic(ms = 12) {
  if (quieto) return;
  try { navigator.vibrate?.(ms); } catch { /* el navegador no quiere */ }
}

/**
 * Cambia el contenido con transición de vista donde el navegador la admite.
 * Si ya hay una en marcha o la pestaña está oculta, se hace el cambio a secas:
 * la animación es un extra, nunca puede romper la pantalla.
 */
export function transicion(cambio) {
  if (quieto || !document.startViewTransition || document.visibilityState !== 'visible') return void cambio();
  try {
    const t = document.startViewTransition(cambio);
    t.finished?.catch(() => {});
    t.ready?.catch(() => {});
    t.updateCallbackDone?.catch(() => {});
  } catch { cambio(); }
}

/**
 * FLIP: mueve un elemento de un sitio a otro con una animación real en vez de
 * un salto. Se mide dónde estaba, se repinta y se anima desde la posición vieja.
 */
export function flip(nodos, repintar) {
  if (quieto) return void repintar();
  const antes = new Map();
  for (const n of nodos) if (n.dataset.flipId) antes.set(n.dataset.flipId, n.getBoundingClientRect());
  repintar();
  requestAnimationFrame(() => {
    for (const n of document.querySelectorAll('[data-flip-id]')) {
      const viejo = antes.get(n.dataset.flipId);
      if (!viejo) continue;
      const nuevo = n.getBoundingClientRect();
      const dx = viejo.left - nuevo.left, dy = viejo.top - nuevo.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 460, easing: MACRO });
    }
  });
}

/** Cuenta hasta el valor final. Para los números grandes del panel. */
export function contar(el, hasta, { duracion = 900, formato = (v) => Math.round(v) } = {}) {
  if (quieto) { el.textContent = formato(hasta); return; }
  const desde = 0;
  const t0 = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / duracion);
    // easeOutExpo, para que frene al final
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = formato(desde + (hasta - desde) * e);
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Aplica `contar` a todos los [data-count] que haya dentro de un contenedor. */
export function contarTodo(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-count]')) {
    const valor = Number(el.dataset.count);
    if (!Number.isFinite(valor)) continue;
    const sufijo = el.dataset.countSuffix || '';
    const moneda = el.dataset.countCurrency;
    const fmt = moneda
      ? (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(v / 100)
      : (v) => new Intl.NumberFormat('es-ES').format(Math.round(v)) + sufijo;
    el.classList.add('tabular');
    contar(el, valor, { formato: fmt });
  }
}

/**
 * Hoja inferior que se arrastra para cerrar, siguiendo el dedo.
 * Es el gesto que separa una web de una app de verdad.
 */
export function arrastrable(fondo, hoja, cerrar) {
  if (quieto) return;
  let y0 = null, dy = 0, alto = 0;
  const zonaValida = (e) => {
    const t = e.target.closest('.sheet-head, .sheet-foot');
    return t || hoja.scrollTop <= 0;
  };
  const inicio = (e) => {
    if (!zonaValida(e)) return;
    y0 = e.touches ? e.touches[0].clientY : e.clientY;
    alto = hoja.getBoundingClientRect().height;
    hoja.style.transition = 'none';
  };
  const mover = (e) => {
    if (y0 === null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dy = Math.max(0, y - y0);
    if (dy > 4 && e.cancelable) e.preventDefault();
    hoja.style.transform = `translateY(${dy}px)`;
    fondo.style.background = `rgba(35,36,28,${0.46 * (1 - dy / alto)})`;
  };
  const fin = () => {
    if (y0 === null) return;
    hoja.style.transition = `transform .34s ${MACRO}`;
    if (dy > alto * 0.28 || dy > 190) {
      haptic(8);
      hoja.style.transform = 'translateY(100%)';
      fondo.style.transition = 'background .3s';
      fondo.style.background = 'rgba(35,36,28,0)';
      setTimeout(cerrar, 300);
    } else {
      hoja.style.transform = '';
      fondo.style.background = '';
    }
    y0 = null; dy = 0;
  };
  hoja.addEventListener('touchstart', inicio, { passive: true });
  hoja.addEventListener('touchmove', mover, { passive: false });
  hoja.addEventListener('touchend', fin);
  hoja.addEventListener('mousedown', inicio);
  addEventListener('mousemove', mover);
  addEventListener('mouseup', fin);
}

/** El plato «vuela» hasta el botón del carrito al añadirlo. */
export function volarAlCarrito(origen, destino) {
  if (quieto || !origen || !destino) return;
  const a = origen.getBoundingClientRect(), b = destino.getBoundingClientRect();
  const punto = document.createElement('div');
  punto.style.cssText = `position:fixed;left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;
    width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--brand);
    z-index:300;pointer-events:none;box-shadow:0 4px 14px rgba(35,36,28,.35)`;
  document.body.append(punto);
  punto.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${(b.left + b.width / 2 - a.left - a.width / 2) * .55}px, ${(b.top - a.top) * .35 - 60}px) scale(1.5)`, opacity: 1, offset: .5 },
    { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.35)`, opacity: .2 },
  ], { duration: 620, easing: MACRO }).onfinish = () => {
    punto.remove();
    destino.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' });
  };
}

/** Marca un botón como ocupado sin que cambie de tamaño. */
export async function ocupado(btn, tarea) {
  btn.classList.add('busy');
  try { return await tarea(); }
  finally { btn.classList.remove('busy'); }
}

/** Esqueletos: se ve la forma de lo que viene, no un hueco en blanco. */
export const skeletonFilas = (filas = 5, columnas = 4) => `<div class="card" style="padding:0">
  <table><tbody>${Array.from({ length: filas }, () => `<tr>${Array.from({ length: columnas }, (_, c) =>
    `<td><div class="sk" style="height:13px;width:${c === 0 ? 60 : 30 + (c % 3) * 15}%"></div></td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;

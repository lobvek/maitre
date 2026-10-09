// Panel del establecimiento: enrutador por hash y carga de vistas.
import { api, $, $$, toast, el, icon, loader, soporteUrl, esc } from '/js/core.js';
import { entrar, contarTodo } from '/js/motion.js';

export const app = { me: null, venue: null, user: null };

const ROUTES = [
  { id: 'inicio', label: 'Inicio', ico: 'home', roles: ['staff', 'manager', 'owner'] },
  { id: 'carta', label: 'Carta', ico: 'menu', roles: ['staff', 'manager', 'owner'] },
  { id: 'mesas', label: 'Mesas y QR', ico: 'grid', roles: ['staff', 'manager', 'owner'] },
  { id: 'pedidos', label: 'Pedidos', ico: 'list', roles: ['staff', 'manager', 'owner'] },
  { id: 'analitica', label: 'Analítica', ico: 'chart', roles: ['manager', 'owner'], feature: 'analytics' },
  { id: 'grupo', label: 'Mis locales', ico: 'grid', roles: ['manager', 'owner'], group: true },
  { id: 'equipo', label: 'Equipo', ico: 'users', roles: ['owner'] },
  { id: 'ajustes', label: 'Ajustes', ico: 'settings', roles: ['manager', 'owner'] },
  { id: 'facturacion', label: 'Plan y facturas', ico: 'card', roles: ['owner'] },
];

const RANK = { staff: 1, manager: 2, owner: 3, superadmin: 4 };
export const can = (role) => RANK[app.user?.role] >= RANK[role];
export const hasFeature = (f) => app.venue?.plan_features?.includes(f);

export async function reloadMe() {
  app.me = await api('/api/auth/me');
  app.user = app.me.user;
  app.venue = app.me.venue;
  return app.me;
}

function paintChrome() {
  $('#venue-name').textContent = app.venue?.name || '';
  pintarSelectorDeLocal();
  $('#who').innerHTML = `<strong>${app.user.name}</strong><span>${app.user.email}</span>`;
  $('#links').innerHTML = ROUTES
    .filter((r) => r.roles.includes(app.user.role))
    .filter((r) => !r.group || app.me?.group)
    .map((r) => `<a href="#/${r.id}" data-route="${r.id}">${icon(r.ico)}<span>${r.label}</span>
      ${r.feature && !hasFeature(r.feature) ? '<span class="tag brand" style="margin-left:auto">Servicio</span>' : ''}</a>`).join('');

  const plan = app.venue?.effective_plan;
  const chip = {
    trial: ['amber', `Piloto · ${app.venue.trial_days_left} días`], mesa: ['', 'Plan Mesa'], servicio: ['green', 'Plan Servicio'],
    grupo: ['green', 'Plan Grupo'], founders: ['brand', 'Fundadores'], paused: ['red', 'Sin plan'],
  }[plan] || ['', plan];
  $('#plan-chip').innerHTML = `<a href="#/facturacion" class="tag ${chip[0]}" style="text-decoration:none">${chip[1]}</a>`;
}

/**
 * Franquicias: el jefe del grupo cambia de local desde la barra lateral, sin volver
 * a entrar. Cada local sigue viendo solo el suyo; esto es solo para quien lleva varios.
 */
function pintarSelectorDeLocal() {
  const g = app.me?.group;
  const hueco = $('#group-switch');
  if (!hueco) return;
  if (!g || g.venues.length < 2) { hueco.classList.add('hidden'); return; }
  hueco.classList.remove('hidden');
  hueco.innerHTML = `<label class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">${esc(g.name)}</label>
    <select id="sel-venue">${g.venues.map((v) => `<option value="${v.id}" ${v.id === app.venue?.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
  $('#sel-venue').onchange = async (e) => {
    await api('/api/auth/venue', { method: 'POST', body: { venue_id: Number(e.target.value) } });
    location.reload();   // la vista entera cambia de local: más honesto recargar
  };
}

async function route() {
  const id = (location.hash.replace('#/', '') || 'inicio').split('?')[0];
  const def = ROUTES.find((r) => r.id === id) || ROUTES[0];
  if (!def.roles.includes(app.user.role)) { location.hash = '#/inicio'; return; }
  $$('#links a').forEach((a) => a.classList.toggle('on', a.dataset.route === def.id));
  $('#title').textContent = def.label;
  $('#side').classList.remove('open');
  const view = $('#view');
  view.innerHTML = loader();
  try {
    const mod = await import(`/js/views/${def.id}.js`);
    view.innerHTML = '';
    // Se pinta sobre el nodo que ya está en el documento: las vistas buscan sus
    // propios elementos por id mientras se montan, y fuera del documento no existen.
    await mod.render(view);
    contarTodo(view);
    entrar(view);   // la sección entra en vez de aparecer de golpe
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="notice err">No se ha podido cargar esta sección: ${err.message}</div>`;
  }
}

async function boot() {
  try { await reloadMe(); }
  catch { location.href = '/entrar?next=/panel'; return; }
  if (app.user.role === 'superadmin') { location.href = '/operador'; return; }
  paintChrome();
  addEventListener('hashchange', route);
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/entrar'; };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#burger').innerHTML = icon('burger');
  // El enlace de ayuda lleva escrito de qué local viene y con qué plan: así no hay que
  // preguntarles quiénes son cuando escriben con prisa.
  $('#ayuda').innerHTML = icon('help') + ' Ayuda por WhatsApp';
  $('#ayuda').href = soporteUrl(`${app.venue?.name || 'un local'} (plan ${app.venue?.plan || '—'})`);
  $('#logout').innerHTML = icon('logout') + ' Salir';
  await route();
}

/** Recarga la sesión y repinta el menú (tras cambiar de plan o de ajustes). */
export async function refreshChrome() { await reloadMe(); paintChrome(); }

boot();

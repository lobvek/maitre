// Panel del establecimiento: enrutador por hash y carga de vistas.
import { api, $, $$, toast, el, icon, loader } from '/js/core.js';
import { transicion, contarTodo } from '/js/motion.js';

export const app = { me: null, venue: null, user: null };

const ROUTES = [
  { id: 'inicio', label: 'Inicio', ico: 'home', roles: ['staff', 'manager', 'owner'] },
  { id: 'carta', label: 'Carta', ico: 'menu', roles: ['staff', 'manager', 'owner'] },
  { id: 'mesas', label: 'Mesas y QR', ico: 'grid', roles: ['staff', 'manager', 'owner'] },
  { id: 'pedidos', label: 'Pedidos', ico: 'list', roles: ['staff', 'manager', 'owner'] },
  { id: 'analitica', label: 'Analítica', ico: 'chart', roles: ['manager', 'owner'], feature: 'analytics' },
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
  $('#who').innerHTML = `<strong>${app.user.name}</strong><span>${app.user.email}</span>`;
  $('#links').innerHTML = ROUTES
    .filter((r) => r.roles.includes(app.user.role))
    .map((r) => `<a href="#/${r.id}" data-route="${r.id}">${icon(r.ico)}<span>${r.label}</span>
      ${r.feature && !hasFeature(r.feature) ? '<span class="tag brand" style="margin-left:auto">Servicio</span>' : ''}</a>`).join('');

  const plan = app.venue?.effective_plan;
  const chip = {
    trial: ['amber', `Piloto · ${app.venue.trial_days_left} días`], mesa: ['', 'Plan Mesa'], servicio: ['green', 'Plan Servicio'],
    local: ['green', 'Plan Local'], founders: ['brand', 'Fundadores'], paused: ['red', 'Sin plan'],
  }[plan] || ['', plan];
  $('#plan-chip').innerHTML = `<a href="#/facturacion" class="tag ${chip[0]}" style="text-decoration:none">${chip[1]}</a>`;
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
    const pintar = document.createElement('div');
    await mod.render(pintar);
    // La sección entra con transición en vez de aparecer de golpe.
    transicion(() => { view.innerHTML = ''; view.append(...pintar.childNodes); });
    contarTodo(view);
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
  $('#logout').innerHTML = icon('logout') + ' Salir';
  await route();
}

/** Recarga la sesión y repinta el menú (tras cambiar de plan o de ajustes). */
export async function refreshChrome() { await reloadMe(); paintChrome(); }

boot();

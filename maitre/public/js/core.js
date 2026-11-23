// Utilidades compartidas por todas las pantallas de Maitre.

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body !== undefined) {
    if (raw) { opts.body = body; }
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(path, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Error ${res.status}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

export const money = (cents, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format((Number(cents) || 0) / 100);

export const num = (n) => new Intl.NumberFormat('es-ES').format(Number(n) || 0);

export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const secs = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h`;
  return `${Math.floor(secs / 86400)} d`;
}

export function fmtDate(iso, opts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  if (!iso) return '—';
  return new Date(iso.replace(' ', 'T')).toLocaleString('es-ES', opts);
}

/** Escapa texto para interpolarlo en HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(message, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const t = el('div', { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3200);
}

/** Modal reutilizable. Devuelve una promesa que resuelve con el resultado de onSave o null. */
export function modal({ title, body, save = 'Guardar', cancel = 'Cancelar', onSave, wide = false }) {
  return new Promise((resolve) => {
    const content = typeof body === 'string' ? el('div', { html: body }) : body;
    const close = (value) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const saveBtn = el('button', { class: 'btn primary', onclick: async () => {
      if (!onSave) return close(true);
      saveBtn.disabled = true;
      try { close(await onSave(content)); }
      catch (err) { toast(err.message, 'err'); saveBtn.disabled = false; }
    } }, save);
    const box = el('div', { class: 'modal', style: wide ? 'width:min(880px,100%)' : '' },
      el('header', {}, el('h3', { style: 'margin:0' }, title),
        el('button', { class: 'btn ghost sm', onclick: () => close(null), 'aria-label': 'Cerrar' }, '✕')),
      el('div', { class: 'body' }, content),
      el('footer', {}, el('button', { class: 'btn', onclick: () => close(null) }, cancel), saveBtn));
    const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(null); } }, box);
    document.body.append(bg);
    document.addEventListener('keydown', onKey);
    setTimeout(() => box.querySelector('input, textarea, select')?.focus(), 60);
  });
}

export function confirmDialog(title, text, save = 'Sí, continuar') {
  return modal({ title, body: el('p', {}, text), save, onSave: () => true });
}

/** Conexión SSE con reintento automático. */
export function stream(url, handlers = {}) {
  let source;
  let closed = false;
  const connect = () => {
    source = new EventSource(url);
    for (const [event, fn] of Object.entries(handlers)) {
      if (event === 'onopen') { source.onopen = fn; continue; }
      source.addEventListener(event, (e) => { try { fn(JSON.parse(e.data)); } catch { fn(e.data); } });
    }
    source.onerror = () => { if (!closed) { source.close(); setTimeout(connect, 2500); } };
  };
  connect();
  return { close: () => { closed = true; source?.close(); } };
}

/** Gráfico de líneas/barras en SVG, sin librerías. */
export function chart(series, { width = 640, height = 180, kind = 'line', color = 'var(--brand)', format = (v) => v } = {}) {
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const max = Math.max(1, ...series.map((s) => s.value));
  const n = series.length || 1;
  const x = (i) => pad.l + (n === 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => pad.t + h - (v / max) * h;
  const ticks = [0, max / 2, max].map((v) => `
    <line x1="${pad.l}" x2="${width - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-2)"/>
    <text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--ink-3)">${format(v)}</text>`).join('');

  let marks = '';
  if (kind === 'bar') {
    const bw = Math.min(56, Math.max(2, (w / n) * 0.62));
    marks = series.map((s, i) => {
      const bx = pad.l + (w / n) * i + (w / n - bw) / 2;
      return `<rect x="${bx}" y="${y(s.value)}" width="${bw}" height="${Math.max(1, pad.t + h - y(s.value))}" rx="3" fill="${color}" opacity=".85"><title>${s.label}: ${format(s.value)}</title></rect>`;
    }).join('');
  } else {
    const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
    const area = `${path} L${x(n - 1)},${pad.t + h} L${pad.l},${pad.t + h} Z`;
    marks = `<path d="${area}" fill="${color}" opacity=".10"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
      series.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.value)}" r="2.5" fill="${color}"><title>${s.label}: ${format(s.value)}</title></circle>`).join('');
  }
  const labels = series.map((s, i) => (n <= 12 || i % Math.ceil(n / 8) === 0)
    ? `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${s.short ?? s.label}</text>` : '').join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img">${ticks}${marks}${labels}</svg>`;
}

export const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const FSE_TEXT = 'Actuación cofinanciada por el Fondo Social Europeo Plus (FSE+) y la Generalitat de Catalunya en el marco del programa de fomento del autoempleo juvenil.';

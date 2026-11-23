// Arranca la aplicación real contra una BD en memoria para cada fichero de test.
process.env.MAITRE_DB = ':memory:';
process.env.MAITRE_DATA_DIR = new URL('../data', import.meta.url).pathname;

const { createApp } = await import('../server/index.js');

export async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = { cookie: '' };

  const request = async (path, { method = 'GET', body, headers = {}, cookies = true } = {}) => {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      if (typeof body === 'string') opts.headers['Content-Type'] ||= 'text/csv';
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      if (typeof body === 'string') opts.body = body;
    }
    if (cookies && jar.cookie) opts.headers.Cookie = jar.cookie;
    const res = await fetch(base + path, opts);
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) if (cookies) jar.cookie = c.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };

  return { base, server, request, jar, close: () => new Promise((r) => server.close(r)) };
}

/** Da de alta un local nuevo y devuelve su contexto autenticado. */
export async function signup(request, over = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const payload = {
    venue_name: `Bar ${suffix}`, name: 'Responsable', email: `${suffix}@test.dev`,
    password: 'contrasena123', tables: 4, ...over,
  };
  const res = await request('/api/auth/signup', { method: 'POST', body: payload });
  return { ...res, payload };
}

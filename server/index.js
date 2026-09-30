// Maitre — servidor. Arranque, middlewares, montaje de rutas y páginas públicas.
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, get, insert, all, ROOT, UPLOAD_DIR } from './db.js';
import { expirePendingPayments, releaseStaleClaims } from './orders-core.js';
import { cookieParser, loadUser, hashPassword } from './auth.js';
import { router as authRouter } from './routes/auth.js';
import { router as venueRouter } from './routes/venue.js';
import { router as menuRouter } from './routes/menu.js';
import { router as tablesRouter } from './routes/tables.js';
import { router as ordersRouter } from './routes/orders.js';
import { router as publicRouter } from './routes/public.js';
import { router as analyticsRouter } from './routes/analytics.js';
import { router as billingRouter } from './routes/billing.js';
import { router as adminRouter } from './routes/admin.js';
import { router as leadsRouter } from './routes/leads.js';
import { router as pushRouter } from './routes/push.js';
import { PLANS } from './plans.js';

export function createApp() {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: 'text/csv', limit: '2mb' }));
  app.use(express.raw({ type: ['image/*'], limit: '4mb' }));
  // Express 5 deja req.body sin definir si no hubo cuerpo; normalizarlo evita comprobaciones por toda la API.
  app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use(cookieParser);
  app.use(loadUser);

  // --- API ---
  app.use('/api/auth', authRouter);
  app.use('/api/venue', venueRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/tables', tablesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/push', pushRouter);

  app.get('/api/plans', (_req, res) => res.json(Object.values(PLANS).filter((p) => p.id !== 'paused')));
  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    venues: get('SELECT COUNT(*) AS n FROM venues').n,
    orders: get('SELECT COUNT(*) AS n FROM orders').n,
    uptime: Math.round(process.uptime()),
  }));

  // --- Estáticos ---
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
  // Fuentes, iconos y logotipos cambian muy de vez en cuando: se cachean una semana para que
  // la tablet de sala y los móviles no los vuelvan a pedir en cada pantalla.
  app.use('/assets', express.static(resolve(ROOT, 'public/assets'), { maxAge: '7d' }));
  app.use(express.static(resolve(ROOT, 'public'), { extensions: ['html'], maxAge: 0 }));

  // --- Páginas ---
  const page = (name) => (_req, res) => res.sendFile(resolve(ROOT, 'public', name));

  app.get('/', page('index.html'));
  app.get('/entrar', page('login.html'));
  app.get('/alta', page('signup.html'));
  app.get('/panel', page('app.html'));
  app.get('/panel/:seccion', page('app.html'));
  app.get('/sala', page('sala.html'));
  app.get('/cunas', page('cunas.html'));
  app.get('/operador', page('operador.html'));
  app.get('/privacidad', page('privacidad.html'));

  /** Pantalla de cobro del pedido (con el proveedor de pruebas, una simulación). */
  app.get('/pagar/:slug/:token/:orderId', page('pagar.html'));

  /** Carta del comensal: /m/:slug/:token (y /m/:slug para escaparate). */
  app.get('/m/:slug', page('m.html'));
  app.get('/m/:slug/:token', page('m.html'));

  /** QR grabado en la cuña: /q/CÓDIGO → carta de la mesa a la que esté asignada hoy. */
  app.get('/q/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const table = get('SELECT t.*, v.slug FROM tables t JOIN venues v ON v.id = t.venue_id WHERE t.qr_code = ?', code);
    if (!table || !table.active) return res.status(404).sendFile(resolve(ROOT, 'public', '404.html'));
    res.redirect(`/m/${table.slug}/${table.token}`);
  });

  /** Etiqueta NFC: /t/:uid redirige a la carta de esa mesa (fase 2 del plan). */
  app.get('/t/:uid', (req, res) => {
    const table = get('SELECT t.*, v.slug FROM tables t JOIN venues v ON v.id = t.venue_id WHERE t.nfc_uid = ?', req.params.uid);
    if (!table) return res.status(404).sendFile(resolve(ROOT, 'public', '404.html'));
    insert('scans', { venue_id: table.venue_id, table_id: table.id, source: 'nfc' });
    res.redirect(`/m/${table.slug}/${table.token}`);
  });

  // --- Errores ---
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found', path: req.path });
    res.status(404).sendFile(resolve(ROOT, 'public', '404.html'));
  });

  app.use((err, req, res, _next) => {
    console.error('[maitre]', err.stack || err);
    if (res.headersSent) return;
    const status = err.status || 500;
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: 'server_error', message: err.message });
    res.status(status).send('Error interno');
  });

  // Los pedidos que se quedan a medias en la pasarela no deben ocupar la mesa para siempre.
  const sweep = setInterval(() => {
    try { expirePendingPayments(30); releaseStaleClaims(5); }
    catch (err) { console.error('[maitre] limpieza periódica', err.message); }
  }, 60000);
  sweep.unref?.();

  return app;
}

/**
 * Despliegue real: la primera vez, con la base vacía, crea la cuenta de operador
 * a partir de las variables de entorno. Así no hace falta sembrar datos de muestra
 * —ni dejar una contraseña conocida— solo para poder entrar.
 */
async function bootstrapAdmin() {
  const email = (process.env.MAITRE_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.MAITRE_ADMIN_PASSWORD || '';
  if (!get('SELECT id FROM users LIMIT 1') && !email) {
    console.warn('\n  ⚠ No hay ninguna cuenta y no se ha definido MAITRE_ADMIN_EMAIL:');
    console.warn('    nadie podrá entrar. Define MAITRE_ADMIN_EMAIL y MAITRE_ADMIN_PASSWORD.\n');
    return;
  }
  if (!email) return;
  if (get('SELECT id FROM users WHERE email = ?', email)) return;   // ya existe: no se toca
  if (password.length < 8) {
    console.warn('\n  ⚠ MAITRE_ADMIN_PASSWORD debe tener al menos 8 caracteres. No se ha creado la cuenta.\n');
    return;
  }
  insert('users', {
    venue_id: null, email, password_hash: hashPassword(password),
    name: process.env.MAITRE_ADMIN_NAME || 'Operador Maitre', role: 'superadmin',
  });
  console.log(`  Cuenta de operador creada: ${email}`);
}

// Compara rutas reales: import.meta.url viene URL-encoded y el argv no.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  // Deploy de demostración: si la base de datos está vacía, se siembran los dos locales piloto.
  if (process.env.SEED_ON_EMPTY === '1' && !get('SELECT id FROM venues LIMIT 1')) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('\n  ⚠ SEED_ON_EMPTY=1 en producción: se van a crear locales de muestra');
      console.warn('    y la cuenta marc@maitre.app con una contraseña pública. Quítalo para un despliegue real.\n');
    }
    await import('./seed.js');
  }
  await bootstrapAdmin();
  app.listen(port, () => {
    console.log(`\n  Maitre en marcha  →  http://localhost:${port}`);
    console.log(`  Panel del local   →  http://localhost:${port}/panel`);
    console.log(`  Pantalla de sala  →  http://localhost:${port}/sala`);
    console.log(`  Operador Maitre   →  http://localhost:${port}/operador\n`);
  });
}

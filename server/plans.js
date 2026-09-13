// Planes comerciales y control de funciones.
// Arquitectura de precios del Estudio competitivo 2026 (tabla 9): Mesa / Servicio / Conectado,
// más la oferta Fundadores para la primera cohorte. Precios sin IVA, hipótesis para test A/B.
const MESA = ['menu', 'qr', 'calls', 'analytics_basic', 'staff_basic'];
const SERVICIO = [...MESA, 'orders', 'kds', 'modifiers', 'upsell', 'staff', 'tables', 'export', 'analytics'];
const CONECTADO = [...SERVICIO, 'integrations', 'payments', 'reviews', 'multi_venue'];

export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Piloto',
    price_cents: 0,
    tagline: '30 días con el plan Servicio completo, con objetivos medidos y decisión al final',
    max_tables: 60,
    features: SERVICIO,
  },
  mesa: {
    id: 'mesa',
    name: 'Mesa',
    price_cents: 1900,
    tagline: 'Carta, idiomas, alérgenos, aviso al personal y analítica básica',
    max_tables: 40,
    features: MESA,
  },
  servicio: {
    id: 'servicio',
    name: 'Servicio',
    price_cents: 3900,
    tagline: 'Pedido desde la mesa, cola de sala, estados, agotados, sugerencias y roles',
    max_tables: 80,
    features: SERVICIO,
    highlight: true,
  },
  conectado: {
    id: 'conectado',
    name: 'Conectado',
    price_cents: 6900,
    tagline: 'Integraciones con TPV, pago opcional, reseñas y varios locales',
    max_tables: 200,
    features: CONECTADO,
  },
  founders: {
    id: 'founders',
    name: 'Fundadores',
    price_cents: 1900,
    tagline: 'Plan Servicio a 19 € durante 24 meses para la primera cohorte',
    max_tables: 80,
    features: SERVICIO,
    invite_only: true,
    months: 24,
  },
  paused: {
    id: 'paused',
    name: 'En pausa',
    price_cents: 0,
    tagline: 'Suscripción cancelada: la carta sigue visible en solo lectura',
    max_tables: 40,
    features: ['menu'],
  },
};

/** Planes que un local puede contratar por sí mismo. */
export const SELF_SERVICE = ['mesa', 'servicio', 'conectado'];

export const FEATURE_LABELS = {
  menu: 'Carta digital',
  qr: 'QR por mesa',
  calls: 'Aviso al personal',
  analytics_basic: 'Analítica básica',
  staff_basic: 'Acceso del personal',
  orders: 'Pedido desde la mesa',
  kds: 'Cola de sala y cocina',
  modifiers: 'Variantes y extras',
  upsell: 'Sugerencias (upselling)',
  staff: 'Equipo y roles',
  tables: 'Gestión de mesas',
  export: 'Exportaciones',
  analytics: 'Analítica de servicio',
  integrations: 'Integraciones con TPV',
  payments: 'Pago con el móvil',
  reviews: 'Reseñas y opt-in',
  multi_venue: 'Varios locales',
};

const expired = (iso) => {
  if (!iso) return true;
  return Date.parse(String(iso).replace(' ', 'T') + 'Z') < Date.now();
};

/** El plan efectivo de un local: si la prueba caducó, cae a Mesa salvo que ya pague. */
export function effectivePlan(venue) {
  if (!venue) return PLANS.paused;
  if (venue.status !== 'active') return PLANS.paused;
  if (venue.plan === 'trial') return expired(venue.trial_ends_at) ? PLANS.mesa : PLANS.trial;
  if (venue.plan === 'founders') return expired(venue.plan_until) ? PLANS.servicio : PLANS.founders;
  return PLANS[venue.plan] || PLANS.mesa;
}

export function hasFeature(venue, feature) {
  return effectivePlan(venue).features.includes(feature);
}

export function trialDaysLeft(venue) {
  if (!venue?.trial_ends_at) return 0;
  const ends = Date.parse(venue.trial_ends_at.replace(' ', 'T') + 'Z');
  return Math.max(0, Math.ceil((ends - Date.now()) / 86400000));
}

/** Middleware: exige que el plan del local incluya la función. */
export function requireFeature(feature) {
  return (req, res, next) => {
    if (hasFeature(req.venue, feature)) return next();
    res.status(402).json({
      error: 'plan_required',
      feature,
      message: `«${FEATURE_LABELS[feature] || feature}» no está incluido en tu plan actual.`,
      plan: effectivePlan(req.venue).id,
    });
  };
}

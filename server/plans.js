// Planes comerciales y control de funciones. Precios sin IVA (hipótesis para test A/B).
// Reparto acordado el 13-09-2026 y revisado el 28-09: el pedido desde la mesa y las
// variantes van en Mesa; la sala completa, los roles y la analítica van en Servicio.
//
// Solo se vende lo que funciona. La integración nativa con el TPV, el cobro con tarjeta
// y el multi-local todavía no existen, así que no forman parte de ningún plan: están en
// la hoja de ruta. El código sigue ahí, detrás de ROADMAP, para el día que se activen.
// Cambiar un plan = tocar este fichero; el resto de la app lee de aquí.

// Mesa: la carta, el pedido y la llamada. Recibe los pedidos en una pantalla de sala sencilla.
const MESA = ['menu', 'qr', 'calls', 'orders', 'modifiers', 'staff_basic'];
// Servicio: la sala completa — barra/cocina, comandas, agotados, mesas, roles, analítica y reseñas.
const SERVICIO = [...MESA, 'kds', 'upsell', 'staff', 'tables', 'export', 'analytics', 'reviews'];

// Grupo: varios locales de una misma marca. El jefe entra en todos; cada local ve el suyo.
const GRUPO = [...SERVICIO, 'multi_venue'];

/** Construido pero aún no vendible. Se activa por local desde la consola de Maitre. */
export const ROADMAP = ['integrations', 'payments'];

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
    tagline: 'Carta, idiomas, alérgenos, pedido desde la mesa con extras y aviso al personal',
    max_tables: 40,
    features: MESA,
  },
  servicio: {
    id: 'servicio',
    name: 'Servicio',
    price_cents: 3900,
    tagline: 'Barra y cocina, comandas, agotados en un toque, mesas, equipo con roles y analítica',
    max_tables: 80,
    features: SERVICIO,
    highlight: true,
  },
  grupo: {
    id: 'grupo',
    name: 'Grupo',
    // Precio POR LOCAL. Sale más barato que Servicio porque la visita, la formación y
    // el soporte se hacen una vez para toda la marca, no local por local.
    price_cents: 2900,
    tagline: 'Para marcas con cinco locales o más: todo lo de Servicio y una cuenta que los ve todos',
    max_tables: 80,
    features: GRUPO,
    min_venues: 5,
    invite_only: true,   // se negocia con la marca; no se contrata desde el panel
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
export const SELF_SERVICE = ['mesa', 'servicio'];

export const FEATURE_LABELS = {
  menu: 'Carta digital',
  qr: 'QR por mesa',
  calls: 'Aviso al personal',
  orders: 'Pedido desde la mesa',
  modifiers: 'Variantes y extras',
  staff_basic: 'Acceso del personal a la sala',
  kds: 'Barra y cocina, comandas y agotados en un toque',
  upsell: 'Sugerencias (upselling)',
  staff: 'Equipo con roles',
  tables: 'Cambio y unión de mesas',
  export: 'Exportaciones',
  analytics: 'Analítica',
  reviews: 'Reseñas y opt-in',
  // Hoja de ruta, fuera de los planes por ahora:
  integrations: 'Integración con TPV',
  payments: 'Pago con el móvil',
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
  if (venue.plan === 'local') return PLANS.servicio;   // plan retirado
  return PLANS[venue.plan] || PLANS.mesa;
}

export function hasFeature(venue, feature) {
  if (ROADMAP.includes(feature)) {
    // Solo si Maitre lo ha abierto expresamente para ese local (pruebas internas).
    try { return !!JSON.parse(venue?.features || '{}')[`beta_${feature}`]; } catch { return false; }
  }
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

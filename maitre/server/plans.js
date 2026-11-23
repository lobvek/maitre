// Planes comerciales y control de funciones. Precios del plan de empresa (3.5), sin IVA.
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Prueba piloto',
    price_cents: 0,
    tagline: '30 días con todo el Pro activado',
    max_tables: 60,
    features: ['menu', 'qr', 'calls', 'orders', 'analytics', 'staff', 'tables', 'export', 'modifiers'],
  },
  basic: {
    id: 'basic',
    name: 'Básico',
    price_cents: 990,
    tagline: 'Carta digital, QR por mesa y aviso al personal',
    max_tables: 30,
    features: ['menu', 'qr', 'calls'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_cents: 1990,
    tagline: 'Todo lo del Básico más pedido desde la mesa y analítica',
    max_tables: 120,
    features: ['menu', 'qr', 'calls', 'orders', 'analytics', 'staff', 'tables', 'export', 'modifiers'],
  },
  paused: {
    id: 'paused',
    name: 'En pausa',
    price_cents: 0,
    tagline: 'Suscripción cancelada: la carta sigue visible en solo lectura',
    max_tables: 30,
    features: ['menu'],
  },
};

export const FEATURE_LABELS = {
  menu: 'Carta digital',
  qr: 'QR por mesa',
  calls: 'Aviso al personal',
  orders: 'Pedido desde la mesa',
  analytics: 'Analítica',
  staff: 'Equipo y roles',
  tables: 'Gestión de mesas',
  export: 'Exportaciones',
  modifiers: 'Opciones y extras',
};

/** El plan efectivo de un local: si la prueba caducó, cae a básico salvo que ya pague. */
export function effectivePlan(venue) {
  if (!venue) return PLANS.paused;
  if (venue.status !== 'active') return PLANS.paused;
  if (venue.plan === 'trial') {
    const ends = venue.trial_ends_at ? Date.parse(venue.trial_ends_at.replace(' ', 'T') + 'Z') : 0;
    if (!ends || ends < Date.now()) return PLANS.basic;
    return PLANS.trial;
  }
  return PLANS[venue.plan] || PLANS.basic;
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

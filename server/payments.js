// Cobro del pedido antes de mandarlo a barra.
//
// Maitre no toca el dinero ni guarda tarjetas: cada local conecta su propia cuenta de la
// pasarela y el importe va directo a él. Este módulo aísla ese enganche. Mientras no haya
// pasarela configurada (PAYMENTS_PROVIDER), funciona un proveedor de pruebas que abre una
// pantalla de simulación: sirve para demostrar y probar el flujo completo, no cobra nada.
import { token } from './utils.js';
import { hasFeature } from './plans.js';

export const provider = () => process.env.PAYMENTS_PROVIDER || 'sandbox';
export const isSandbox = () => provider() === 'sandbox';

/** ¿Puede este local cobrar online ahora mismo? */
export function canChargeOnline(venue) {
  if (!hasFeature(venue, 'payments')) return false;   // todavía en preparación
  if (venue.payment_mode === 'venue') return false;
  return isSandbox() || !!venue.payment_account;
}

/** Cómo se paga este pedido, según la configuración del local y lo que pida el móvil. */
export function resolveMode(venue, requested) {
  if (!canChargeOnline(venue)) return 'venue';
  if (venue.payment_mode === 'online_required') return 'online';
  return requested === 'online' ? 'online' : 'venue';
}

/**
 * Abre el cobro. Con una pasarela real, aquí se crearía la sesión de pago y se
 * devolvería su URL; el resultado llegaría por webhook firmado.
 */
export function createCheckout(venue, order, tableToken) {
  const ref = `${isSandbox() ? 'TEST' : provider().toUpperCase()}-${order.code}-${token(4)}`;
  return {
    provider: provider(),
    sandbox: isSandbox(),
    reference: ref,
    amount_cents: order.total_cents,
    url: `/pagar/${venue.slug}/${tableToken}/${order.id}?ref=${encodeURIComponent(ref)}`,
  };
}

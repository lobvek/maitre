# Integración con el TPV

Qué contestar cuando un local pregunta «¿esto se conecta con mi TPV?».

## Respuesta corta para la venta

> Maitre no sustituye tu TPV. En la primera versión convive con él: los pedidos entran en la pantalla
> de sala y se exportan a contabilidad; si tu TPV admite integraciones, te lo conectamos por webhook.
> Los conectores nativos con los TPV más comunes llegan en la fase 2.

Prometer «integración con tu TPV» sin más es la vía rápida a un cliente enfadado: cada TPV tiene su
propia API (o no tiene ninguna). Se promete lo que hay hoy y se explica el plan.

## Fase 1 — lo que ya funciona (hoy)

**1. Convivencia.** El local sigue cobrando en su TPV. Maitre aporta la carta, el pedido y el aviso;
la comanda se imprime desde la pantalla de sala, separada por barra y cocina.

**2. Webhook firmado.** En *Ajustes → Conexión con tu TPV* se pega una URL. Maitre envía ahí cada evento:

```http
POST https://tu-tpv.example.com/maitre
Content-Type: application/json
X-Maitre-Event: order.created
X-Maitre-Signature: sha256=<hmac del cuerpo con la clave del local>

{
  "event": "order.created",
  "sent_at": "2026-09-03T12:40:11.000Z",
  "venue": { "id": 1, "slug": "bar-lancora", "name": "Bar L'Àncora" },
  "data": {
    "id": 912, "code": "C458", "table_name": "7", "status": "new",
    "channel": "qr", "payment_status": "paid", "payment_method": "card",
    "subtotal_cents": 1264, "tax_cents": 126, "total_cents": 1390,
    "items": [{ "name": "Caña", "qty": 2, "station": "barra", "unit_price_cents": 260, "options": [] }]
  }
}
```

Eventos: `order.created` (solo cuando el pedido ya es válido: pagado, o a pagar en el local) y
`order.updated` (aceptado, servido, cobrado, cancelado).

Verificación en el receptor:

```js
const esperada = crypto.createHmac('sha256', CLAVE).update(cuerpoCrudo).digest('hex');
if (`sha256=${esperada}` !== req.headers['x-maitre-signature']) return res.status(401).end();
```

Esto ya permite conectar cualquier TPV con API abierta, o un middleware (Make, Zapier, n8n) sin
esperar a que existamos en su catálogo de integraciones.

**3. Exportación.** `Pedidos → Exportar CSV` para la gestoría o para importar en el TPV a final de día.

## Fase 2 — conectores nativos (según demanda real de los pilotos)

Orden propuesto, por cuota en hostelería independiente en Cataluña:

| TPV | Vía | Complejidad |
|---|---|---|
| Revo | API REST pública | media |
| Last.app | API + webhooks | media |
| Glop | conector local / fichero | alta (instalación en el equipo) |
| Camarero10 | API | media |
| Cuentas propias / Excel | ya cubierto por el CSV | — |

**Regla:** no se empieza un conector hasta que **tres locales de pago** lo pidan. Cada uno son semanas
de trabajo y mantenimiento permanente cuando el otro cambia su API.

## Fase 3 — impresión directa

Impresora de comandas en red (ESC/POS por TCP 9100) desde la propia pantalla de sala, para locales
que quieran el ticket en cocina sin pasar por el TPV. Es más barato de construir que un conector y
resuelve el 80 % del problema real («que llegue el papel a cocina»).

## Lo que no se promete

- Sincronizar la carta en los dos sentidos con el TPV (conflictos de precios, un lío).
- Que Maitre cobre en el TPV del local: el cobro con el móvil va por la pasarela del propio local.
- Integración con TPV que no tenga API. Ahí la respuesta honesta es la impresora o el CSV.

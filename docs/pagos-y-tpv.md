# Pagos y conexión con el TPV: cómo lo hacen otros y qué hacemos nosotros

Actualizado el 09-10-2026.

## 1. El aviso que más importa: Sunday se fue de España

Sunday —la referencia mundial del pago por QR en mesa, del grupo Big Mamma— **cerró en
España el 31 de julio de 2022**, después de llegar a más de 2.000 restaurantes. Su
responsable comercial aquí dio el motivo: la adopción media era del **12 %**.

Es decir: de cada diez mesas, una escaneaba para pagar. Con ese porcentaje no hay negocio
que aguante si tu única propuesta es el pago. Esto cambia nuestra estrategia:

**El pago no puede ser la razón de ser de Maitre.** Es una función más. Lo que de verdad
usa un bar todos los días es recibir el pedido, el aviso y la comanda.

## 2. Cómo conectan los demás con el TPV

| Quién | Cómo lo resuelve |
|---|---|
| **Revo** | Su propia carta QR (Revo SOLO) se enlaza con su TPV (Revo XEF) intercambiando tokens en el back-office. Para terceros hay API con token de integrador, previa solicitud |
| **Glop** | Tiene API en el módulo Cloud (planes PRO y BUSINESS). Es la vía por la que se integran terceros como Lymon, que mete cada pedido como una comanda normal del canal correspondiente |
| **Ágora** | Carta QR integrada en su propio TPV. No encontré API pública para terceros |
| **Camarero10** | Carta integrada en su TPV. Si usas otro TPV, funciona *como sistema aparte*: hay comparativas que señalan que los pedidos no quedan coordinados |
| **Last.app** | Es el TPV. No integra: sustituye |

**El patrón es claro**: cada TPV trae su propia carta QR y casi ninguno abre la puerta de
par en par. Las APIs existen (Revo, Glop) pero se piden una a una, con contrato.

## 3. Qué significa para nosotros

Integrarse de verdad con un TPV no es programar: es **negociar acceso, uno por uno**, y
mantener un conector por cada marca. Eso no se hace antes de tener locales; se hace cuando
diez bares con el mismo TPV lo piden.

Por eso la estrategia es, por orden:

1. **Hoy: convivencia.** El camarero mete la comanda en el TPV como siempre. Maitre marca
   quién la está metiendo («Lo cojo yo» → «Ya está en el TPV») para que no la metan tres
   veces. No es un apaño: es lo que hace que no se pierda nada mientras no hay conector.
2. **Ya construido: webhook firmado.** Cada pedido sale firmado con HMAC-SHA256 a la URL
   que diga el local. Quien tenga a alguien técnico, se integra hoy.
3. **Cuando lo pidan diez: conector nativo**, empezando por el TPV más repetido entre
   nuestros locales. Primero Glop o Revo, que son los que tienen API documentada.

## 4. ¿Y si cobramos con Stripe en vez de integrar el TPV?

Son cosas distintas y conviene no mezclarlas:

- **Integrar el TPV** resuelve el trabajo del camarero.
- **Cobrar con Stripe** resuelve el pago del cliente, pero **no mete la venta en el TPV**:
  el bar sigue teniendo que cuadrar la caja, y encima con dinero que entró por otro sitio.

Si cobramos y no integramos, le creamos un problema contable al bar. Por eso el cobro con
el móvil solo tiene sentido **después** del conector, no antes.

Números, para dimensionar: Stripe en España cobra como referencia pública **1,5 % + 0,25 €**
por tarjeta europea. Sobre un ticket de 25 €, unos 0,63 €. Y en España **está prohibido
repercutir ese coste al cliente** con un recargo, así que se lo come el local o nos lo
comemos nosotros.

Añadido legal que no se puede ignorar: desde el momento en que Maitre cobra, se acerca al
terreno de la facturación (VERI*FACTU). Hoy lo evitamos a propósito: la cuenta de Maitre es
**un resumen de consumo, no un ticket fiscal**.

## 5. Lo que hay que hacer antes de tocar nada de esto

Preguntar a los primeros bares, por escrito, **qué TPV tienen**. Con cinco respuestas
sabemos por dónde empezar. Sin esas cinco respuestas, cualquier conector es una apuesta.

## Fuentes

- [Sunday abandona España](https://www.profesionalhoreca.com/2022/08/15/la-app-de-pago-sunday-abandona-espana/)
- [Revo XEF ↔ Revo SOLO](https://support.revo.works/es/articles/497) · [Revo API](https://api.revo.works/)
- [Glop + Lymon: pedidos QR](https://www.lymon.es/blog/glop-tpv-lymon-pedidos-qr)
- [Camarero10 TPV](https://www.camarero10.com/software-tpv-bares-restaurantes/)
- [Last.app: nuevo pricing del QR](https://www.last.app/actualizaciones-de-producto/el-nuevo-pricing-del-qr-cuanto-mas-vendes-menos-pagas)
- [Tarifas de Stripe](https://stripe.com/pricing)
- [¿Es legal cobrar más por tarjeta? (Qamarero)](https://qamarero.com/blog/es-legal-cobrar-mas-por-tarjeta-en-restaurante/)

# Qué cuesta tener Maitre funcionando

Actualizado el 25-11-2026. Precios sin IVA salvo donde se diga.

## 1. Lo que cuesta el software en marcha (fijo, no por local)

Maitre es **multi-local en un solo servidor**: el mismo proceso sirve a todos los bares.
No hay coste por local hasta que haya mucho volumen.

| Concepto | Coste / mes | Nota |
|---|---|---|
| Servidor Render Starter | ~6,50 € (7 $) | lo que hace falta para un bar real: no duerme |
| Disco de 1 GB | ~0,25 € | la base de datos pesa 0,6 MB con 900 pedidos |
| Dominio | ~1,20 € | 12–15 €/año, según extensión |
| Copias de seguridad | 0 € | ya montadas: una al día en el propio disco, 14 copias |
| Traducción de la carta (DeepL) | 0 € | la capa gratis son 500.000 caracteres/mes; una carta entera a 5 idiomas gasta ~25.000 |
| Avisos al personal (Web Push, Telegram) | 0 € | las notificaciones del navegador y Telegram son gratis |
| Correo transaccional | 0 € | todavía no se envía ningún correo |
| **Total para empezar** | **~8 €/mes** | sirve para los primeros locales |

Cuándo deja de bastar: cuando el servidor vaya justo (muchos locales a la vez en hora punta)
se pasa a Render Standard, ~23 €/mes. No antes.

Lo que falta y costaría algo: **copia fuera del servidor** (si el disco de Render se pierde,
se pierden las copias con él). Un bucket en Backblaze B2 o Cloudflare R2 son ~0,50 €/mes
para este volumen. Es el único agujero de coste real que queda.

## 2. Lo que cuesta cada local

| Concepto | Coste | Quién lo paga |
|---|---|---|
| Cuñas de madera | **por confirmar** — dato de Marc | el local, a coste completo |
| Hoja de QR provisional | céntimos de impresión | nosotros, en la visita |
| Alta y formación | ~1 h de una persona | nosotros |
| Soporte durante el piloto | ~15 min/semana | nosotros |

En la web las cuñas se presupuestan a **9–14 € la unidad** hasta que Marc confirme el coste.

## 3. Lo que costaría el día que se cobre con el móvil

No está activado. Cuando lo esté, con Stripe en España la referencia pública es
**1,5 % + 0,25 € por tarjeta europea** y **2,5 % + 0,25 €** por tarjeta de fuera.
Hay que confirmarlo en la web de Stripe el día que se firme.

Sobre un ticket medio de 25 €: unos **0,63 €** por pago. Si lo asume el local, se le come
el 2,5 % de la venta. **No se puede repercutir al cliente**: en España está prohibido
cobrar un recargo por pagar con tarjeta.

Conclusión para el precio: el cobro con el móvil no puede entrar en la cuota como si fuera
gratis. O va aparte y transparente, o se come el margen de los 19–39 €.

## 4. El punto de equilibrio, en cristiano

Con ~8 €/mes de coste fijo, **el primer local de pago ya cubre la infraestructura**.

| Escenario | Ingreso/mes | Coste servidor | Queda |
|---|---|---|---|
| 1 local Mesa (19 €) | 19 € | 8 € | 11 € |
| 5 locales Servicio (39 €) | 195 € | 8 € | 187 € |
| 1 franquicia de 5 locales (29 €/local) | 145 € | 8 € | 137 € |
| 20 locales Servicio | 780 € | 23 € (Standard) | 757 € |

Lo que no cubre es el tiempo de las personas: el coste real de Maitre hoy no es el
servidor, son las horas de instalar, formar y atender. Por eso el precio tiene que
mirar al tiempo de visita, no al coste de servidor.

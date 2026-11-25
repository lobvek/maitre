# Pagos y conexión con el TPV: cómo lo hacen otros y qué hacemos nosotros

Actualizado el 25-11-2026. Las tarifas son de noviembre de 2026 y hay que reconfirmarlas
antes de firmar nada.

## 0. Cómo funciona por dentro, en funcional

### El dinero no pasa nunca por Maitre

Esto no es una opción, es la base de todo: **cada bar conecta su propia cuenta de la
pasarela y el dinero va directo a él.** Maitre no lo toca, no lo retiene y no guarda
tarjetas. Tres motivos, cualquiera de ellos definitivo:

1. Si el dinero pasara por nosotros, seríamos legalmente una **entidad de pago**: licencia,
   capital mínimo, auditorías. Ni de broma.
2. Nos comeríamos las **devoluciones y reclamaciones** de las ventas de otros.
3. Al bar le cuadra la caja: el ingreso le entra en **su** banco, con **su** nombre.

Lo que hace Maitre es abrir el cobro y esperar la confirmación firmada de la pasarela.
Está aislado en un solo fichero a propósito, para poder cambiar de pasarela sin tocar
nada más.

### Los tres modos, y el bar elige (ya está hecho)

En Ajustes hay un desplegable con tres opciones:

| Modo | Qué pasa | Para quién |
|---|---|---|
| **Se paga en el local, como siempre** | Maitre suma el pedido a la cuenta de la mesa. El camarero cobra en el TPV como toda la vida. **Comisión: cero.** | el 90 % de los bares, y es el que viene puesto |
| **El cliente elige** | Puede pagar con el móvil o esperar al camarero | terrazas, sitios con mucha rotación |
| **Se paga antes de mandarlo a barra** | El pedido **no llega a la cocina** hasta que entra el dinero | festivales, eventos, barras con fugas |

Lo importante de esto: **la mayor parte del valor de Maitre no necesita cobrar nada.**
Recibir la comanda en la barra, el aviso al móvil y la carta que se cambia sola funcionan
igual con comisión cero. El cobro es una función más, no el producto.

### Las dos cañas: lo que de verdad decide el coste

La pregunta no es "qué pasarela", es **cuántas veces se cobra**. Casi todas las pasarelas
cobran un fijo por operación, y ese fijo es el que mata los tickets pequeños:

| | Dos cañas (5 €) | Un pedido (14 €) | La cuenta entera (40 €) |
|---|---|---|---|
| Comisión Stripe | 0,33 € | 0,46 € | 0,85 € |
| **Sobre la venta** | **6,5 %** | 3,3 % | **2,1 %** |

Una mesa que pide seis veces de cinco euros paga **1,95 €** de comisión. La misma mesa
pagando una sola vez al final: **0,85 €**. Menos de la mitad, por hacer lo que el bar ya
hace de siempre.

Conclusión funcional, y es la decisión de diseño que hay que tomar:
**se cobra la cuenta al final, no cada ronda.** Coincide con cómo funciona un bar y es lo
más barato. "Pagar al pedir" se reserva para donde hace falta de verdad: festivales y
barras donde la gente se va sin pagar.

**Esto es lo que falta por construir.** Hoy el cobro con el móvil es **por pedido**; pagar
la cuenta entera de la mesa de una vez no está hecho. La cuenta ya se calcula y el cliente
ya la ve en su móvil (con las mesas unidas incluidas), así que es enganchar el cobro a lo
que ya existe. Es el siguiente trozo de trabajo si los pagos siguen adelante.

## 0 bis. ¿Stripe? Sí para empezar, pero no es la más barata

Lo de "comisiones de la hostia" es verdad, y hay alternativas mucho más baratas:

| Pasarela | Un ticket de 5 € | Uno de 25 € | Dar de alta a un bar |
|---|---|---|---|
| **TPV virtual del banco** (Redsys) | ~0,08 € (1,6 %) | ~0,16 € (**0,64 %**) | semanas, papeleo en su oficina |
| **SumUp** | 0,10 € (1,95 %) | 0,49 € (1,95 %) | online, días |
| **Stripe** | 0,33 € (**6,5 %**) | 0,63 € (2,5 %) | online, **10 minutos** |

El TPV virtual de Banco Sabadell está publicado a **0,40 % + 0,06 €** por operación hasta
2.000 €/mes (después, 1,10 % + 0,06 €). Eso es **cuatro veces más barato que Stripe**. Hay
que preguntar por la cuota de mantenimiento, que según su web es de 17 €/mes mientras no
se pase de esos 2.000 €, porque esa cuota puede darle la vuelta a la cuenta en un bar que
cobre poco por el móvil. Redsys no pone precio: lo pone cada banco, y se negocia.

**Entonces por qué Stripe primero:** porque un bar se da de alta **en diez minutos, sin ir
al banco**. Con cinco pilotos, la diferencia de comisión son unos pocos euros al mes; no
vale la pena cambiarlos por tres semanas de papeleo por bar y perder el impulso de la
visita. Y como la pasarela está aislada en un fichero, añadir Redsys después es un rato,
no una reescritura.

La frase para la visita, cuando el hostelero pregunte: *"Empezamos con Stripe, que se monta
hoy. Si acabas cobrando mucho por el móvil, te interesa pedir el TPV virtual a tu banco:
te sale cuatro veces más barato y te lo enganchamos nosotros."* Eso es verdad y le da el
control.

**Falta comprobar Bizum.** En España lo usa todo el mundo y va por Redsys; si la comisión
es la que se dice, para tickets pequeños sería la opción buena. Hay que preguntarlo en el
banco, no fiarse de comparadores.

### Dos cosas legales que no se pueden saltar

- **No se puede cobrar un recargo al cliente por pagar con tarjeta.** En España está
  prohibido. La comisión se la come el bar o nos la comemos nosotros; no hay tercera vía.
- **La cuenta de Maitre es un resumen de consumo, no un ticket fiscal.** Está hecho así a
  propósito: en el momento en que Maitre emita facturas entra en VERI*FACTU, y eso es otro
  proyecto. El ticket lo sigue dando el TPV del bar.

## 0 ter. ¿Se puede cobrar por el datáfono que ya tiene el bar?

Esta es **la** pregunta, y la respuesta tiene dos mitades: una que no, y una que sí.

### La mitad que no: el datáfono no se puede disparar desde nuestra plataforma

Un datáfono cobra **cuando la tarjeta está delante**. No existe una forma de decirle
"cóbrale 5 € al móvil de la mesa 4", porque el datáfono no tiene ninguna manera de llegar
hasta ese móvil. La tarjeta tiene que acercarse **a esa máquina**. No es que los bancos no
hayan hecho la API: es que no hay nada que la API pueda hacer.

### Por qué hay dos precios y no uno

No es que el banco sea más caro online por capricho. Son **dos productos distintos con dos
riesgos distintos**:

| | Presencial (el datáfono) | Comercio electrónico (online) |
|---|---|---|
| La tarjeta está | delante, se acerca al aparato | en otro sitio, solo hay un número |
| Si el cliente dice "yo no he pagado eso" | lo come el banco | **lo come el comercio** |
| Comisión | ~0,4–0,9 % | más alta |

Por eso el banco **no deja** pasar cobros online por el contrato del datáfono: es otro
contrato, no un ajuste. Y por eso la diferencia de comisión es real y no negociable del
todo: alguien está asumiendo un riesgo que antes no asumía.

### La mitad que sí, y es la que buscabas: el TPV Virtual del mismo banco

Lo que quieres existe y se llama **TPV Virtual** (va por Redsys). Es exactamente lo que
pedías, salvo que no es la caja física:

- **El mismo banco.** CaixaBank o Sabadell, el que ya tenga.
- **La misma cuenta.** El dinero le entra donde le entra ya.
- **La misma relación.** Lo pide en su oficina, con su gestor.
- **Y la comisión del banco, no la de Stripe**: Sabadell lo publica a **0,40 % + 0,06 €**
  por operación hasta 2.000 €/mes.
- **Admite Apple Pay y Google Pay**, que es la experiencia que describes: el cliente le da,
  Face ID, y ya. (Depende del contrato de cada banco: hay que pedirlo explícitamente.)

O sea: tu instinto es el correcto —**ir por el banco y no por Stripe**— solo que la puerta
no es el aparato, es el producto hermano del aparato.

### Y para tickets de dos cañas, probablemente Bizum

Lo que mata los importes pequeños es el **fijo por operación**. Bizum por el banco se cita
en torno al **0,60 % sin fijo** (BBVA lo publica así), y en España lo tiene instalado todo
el mundo. Sobre 5 € son **tres céntimos**.

| Cobrar 5 € (dos cañas) | Comisión | Sobre la venta |
|---|---|---|
| **Bizum por el banco** (~0,60 %) | **0,03 €** | **0,6 %** |
| Su datáfono de siempre | ~0,04 € | ~0,8 % |
| TPV Virtual Sabadell (0,40 % + 0,06 €) | 0,08 € | 1,6 % |
| Tap to Pay con el móvil del camarero (~1,5 %) | 0,08 € | 1,5 % |
| **Stripe** (1,5 % + 0,25 €) | **0,33 €** | **6,5 %** |

Stripe es **diez veces** más caro que Bizum en un ticket de dos cañas. En uno de 40 € la
diferencia baja a tres veces. El fijo de 0,25 € es todo el problema.

### Para el efectivo: si el camarero va a ir igual, que vaya con un datáfono en el bolsillo

Dices, y es verdad, que para el efectivo tiene que ir el camarero. Entonces merece la pena
saber esto: **Tap to Pay on iPhone ya funciona en España**, desde el iPhone XS, sin ningún
aparato extra. El móvil del camarero **es** el datáfono: el cliente acerca su tarjeta o su
móvil al del camarero y se cobra.

La comisión la pone el proveedor, no Apple: SumUp ~1,5 %, Stripe 1,4 % + 0,10 € en
presencial. No es gratis, pero es **presencial**, así que es mucho más barato que el mismo
Stripe online, y el bar se ahorra comprar datáfonos para la terraza.

Esto no lo tenemos que programar nosotros: es una app aparte en el móvil del camarero. Pero
es la respuesta buena a "¿y si quiere pagar con tarjeta pero no por el móvil?".

### Qué hay que preguntar en el banco, literal

Esto se puede hacer esta semana y vale más que cualquier cosa que yo programe:

1. ¿Cuánto cuesta el **TPV Virtual** (comercio electrónico) y qué cuota de mantenimiento
   tiene? Sabadell publica 17 €/mes mientras no se pasen de 2.000 €/mes: **¿es además de
   la comisión o en lugar de?** De esto depende todo.
2. ¿Incluye **Bizum**? ¿A qué comisión, y con qué fijo si lo hay?
3. ¿Incluye **Apple Pay y Google Pay**?
4. ¿Cuánto tarda el alta y qué papeles hacen falta?
5. ¿Se puede tener el TPV Virtual **en la misma cuenta** que el datáfono?

Con esas cinco respuestas de un banco ya se sabe si merece la pena montar Redsys antes o
después de Stripe. Hoy no lo sabemos, y los comparadores no sirven: Redsys **no pone
precio**, lo pone cada banco y se negocia.

### Qué significa esto para el código: casi nada

La pasarela está aislada a propósito en un solo fichero (`server/payments.js`), detrás de
una variable. Añadir Redsys es **ese fichero y una pantalla de ajustes** donde el bar meta
sus datos de comercio (código FUC, terminal y clave secreta). El resto —el pedido, la
cuenta, los avisos, la mesa— no se toca.

Lo único que cambia de verdad es **el alta**: Stripe se monta en diez minutos y Redsys son
semanas de papeleo por bar. Por eso la secuencia sensata sigue siendo Stripe para el
prototipo y los primeros pilotos, y Redsys para el bar que cobre volumen de verdad.

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

## 4. Cobrar y integrar el TPV son cosas distintas

Conviene no mezclarlas, porque resuelven problemas de dos personas distintas:

- **Integrar el TPV** le quita trabajo al **camarero**.
- **Cobrar con el móvil** le quita una espera al **cliente**, pero **no mete la venta en el
  TPV**: el bar sigue teniendo que cuadrar la caja, y encima con dinero que entró por otro
  sitio.

Esa es la pega de verdad del cobro online, más que la comisión: **si cobramos y no
integramos, le creamos un lío contable al bar.** Mientras no haya conector, el camarero
tiene que meter a mano en el TPV una venta que ya está pagada, marcándola como cobrada por
otro medio. Es asumible en un bar pequeño y es un problema en uno con volumen.

Por eso, en los pilotos, el modo recomendado es **"se paga en el local"**. El cobro con el
móvil se activa cuando el bar lo pida por un motivo concreto (una terraza con fugas, una
barra de evento), no porque esté en la lista de funciones.

## 5. Lo que hay que hacer antes de tocar nada de esto

Preguntar a los primeros bares, por escrito, **qué TPV tienen**. Con cinco respuestas
sabemos por dónde empezar. Sin esas cinco respuestas, cualquier conector es una apuesta.

## Fuentes

- [Sunday abandona España](https://www.profesionalhoreca.com/2022/08/15/la-app-de-pago-sunday-abandona-espana/)
- [Revo XEF ↔ Revo SOLO](https://support.revo.works/es/articles/497) · [Revo API](https://api.revo.works/)
- [Glop + Lymon: pedidos QR](https://www.lymon.es/blog/glop-tpv-lymon-pedidos-qr)
- [Camarero10 TPV](https://www.camarero10.com/software-tpv-bares-restaurantes/)
- [Last.app: nuevo pricing del QR](https://www.last.app/actualizaciones-de-producto/el-nuevo-pricing-del-qr-cuanto-mas-vendes-menos-pagas)
- [Tarifas de Stripe](https://stripe.com/pricing) · [calculadora 1,5 % + 0,25 €](https://www.smartcookieapp.com/es/resources/guides/stripe-fee-calculator)
- [TPV Virtual de Banco Sabadell](https://www.bancsabadell.com/bsnacional/en/business/tpv/tpv-virtual/) · [comisiones de TPV por banco](https://rankiabusiness.com/comisiones-tpv/)
- [Qué es Redsys y quién pone el precio](https://ecomninja.net/que-es/redsys/) · [Redsys vs Stripe](https://namuratech.com/blog/mejor-pasarela-pago-ecommerce)
- [SumUp vs Stripe](https://www.sumup.com/es-es/compare/sumup-vs-stripe/)
- [TPV virtual de BBVA, comisión de Bizum](https://finantres.com/bbva-tpv-virtual/) · [Bizum salta al comercio físico (abril 2026)](https://www.merca2.es/2026/04/24/bizum-pago-comercios-tpv-fecha-2372317/)
- [Tap to Pay on iPhone en España](https://www.applesfera.com/servicios-apple/tu-iphone-puede-ser-datafono-no-necesitas-ningun-accesorio-apple-lanza-tap-to-pay-espana) · [la comisión la pone el proveedor](https://easybyte.es/blog/cobrar-con-el-movil-sin-datafono-tap-to-pay/) · [Tap to Pay de SumUp](https://www.sumup.com/es-es/business-guide/como-aceptar-pagos-en-el-iphone/)
- [¿Es legal cobrar más por tarjeta? (Qamarero)](https://qamarero.com/blog/es-legal-cobrar-mas-por-tarjeta-en-restaurante/)

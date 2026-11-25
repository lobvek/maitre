# Dónde vive Maitre, y por qué

Escrito el 25-11-2026. Responde a tres preguntas: qué hosting, hace falta Supabase, y
cabe todo en 1 GB. Los precios de terceros son de noviembre de 2026 y hay que
reconfirmarlos el día de firmar: en 2026 Render y Hetzner los cambiaron a mitad de año.

## 1. Qué hace falta de verdad

Maitre es un proceso de Node y un fichero de SQLite al lado. Eso impone tres cosas,
y descarta a la mitad del mercado:

1. **Un disco que no se borre al desplegar.** Sin eso, la base de datos desaparece en
   cada actualización. Esto tacha Vercel, Netlify y cualquier cosa "serverless".
2. **Un proceso que no duerma.** Un bar en hora punta no puede esperar 40 segundos a
   que arranque el servidor. Esto tacha la capa gratis de Render — y es exactamente
   la pantalla de "arrancando" que viste en el PWA.
3. **Conexiones largas (SSE).** La sala recibe los pedidos por una conexión abierta.
   Cualquier proveedor que corte conexiones a los 30 segundos rompe el tiempo real.

## 2. Las opciones, al grano

| | Coste/mes | Fiabilidad | Trabajo nuestro | Veredicto |
|---|---|---|---|---|
| **Render Starter** (hoy) | ~6,50 € + 0,25 €/GB | alta: parches y TLS los pone él | ninguno | **lo que hay, y está bien** |
| Fly.io | ~5,50 € + 0,15 €/GB | alta, pero más piezas | poco | sin ventaja clara |
| Railway | 5 € mínimo + consumo | alta | poco | la factura varía mes a mes |
| Hetzner VPS (CPX11) | ~6 € + IPv4 | el hierro va muy bien… | **el sistema es tuyo** | no, hasta que haya alguien de guardia |
| Vercel / Netlify | — | — | — | **no sirve**: sin disco |

Hetzner sale casi igual de precio y da 10 veces más máquina, pero el precio de verdad
es otro: actualizaciones de seguridad, certificados, firewall, vigilar que el disco no
se llene. Hoy somos dos y ninguno está de guardia. Render cobra ~6 € por hacer eso.

Lo honesto sobre fiabilidad: **ningún plan barato de ningún proveedor te da cero cortes.**
Render Starter es **una sola máquina**: cuando desplegamos una versión nueva, hay unos
20–30 segundos en que la carta no carga. Para un bar eso es invisible si se despliega a
las 11 de la mañana, y es un problema si se hace un viernes a las 22:00. La regla, que no
cuesta dinero: **no se despliega en horario de servicio.** Cero cortes de verdad cuesta
dos máquinas y una base de datos de pago, y eso son ~50 €/mes: el día que haya 30 bares.

## 3. ¿Supabase? Hoy no, y el motivo es concreto

### Cómo están guardados los datos ahora

**Una sola base de datos para todos los bares**, con cada fila marcada con su `venue_id`.
Toda consulta filtra por ese campo y está comprobado con pruebas que un bar no puede
leer los datos de otro. La franquicia es el único caso que cruza locales, y también está
comprobado: un jefe de marca ve sus 5 locales y nada más.

**Una base por bar sería un error**, no una mejora: cada cambio de estructura habría que
aplicarlo 30 veces, y cada copia de seguridad multiplicarse por 30. Nadie lo hace así.

### Qué nos daría Supabase

- Copias gestionadas y **recuperar a un segundo concreto** del pasado.
- La base sobrevive si el servidor se muere.
- Poder levantar dos servidores a la vez (hoy, imposible: el fichero es de uno solo).

### Qué nos costaría

- **25 $/mes** el plan Pro (8 GB incluidos). Recuperar a un punto en el tiempo son
  **100 $/mes más**. O sea, pasar de ~8 € a ~115 € para tener de verdad lo que lo
  justifica.
- **Reescribir la capa de datos.** SQLite va dentro del propio proceso: una consulta
  tarda microsegundos. Postgres en otra máquina son 1–5 ms **por consulta**, y una
  pantalla de la sala hace docenas. Hay que rehacer las consultas para que no se note.
  Tres o cinco días de trabajo, y un sitio nuevo donde pueden fallar cosas.

### Lo que sí hay que hacer, y cuesta 0,50 €

El agujero real no es "SQLite vs Postgres", es que **las copias están en el mismo disco
que la base**. Si el disco de Render se pierde, se pierden las copias con él.

La solución proporcionada al problema es **Litestream**: copia el SQLite a un bucket
(Backblaze B2 o Cloudflare R2) de forma continua, segundo a segundo. Si el servidor
desaparece, se levanta otro y se recupera con una pérdida de segundos, no de un día.
Cuesta **~0,50 €/mes** y es media tarde de trabajo. Eso es el 90 % de lo que da Supabase
por el 0,5 % del precio.

**Cuándo toca mover a Postgres de verdad:** cuando haga falta más de un servidor a la vez
(muchos bares en hora punta), o cuando perder un día de datos deje de ser un disgusto y
pase a ser un problema con un cliente. No antes. Y cuando toque, Postgres gestionado sale
más barato en Neon o en el propio Render que en Supabase, porque de Supabase no usaríamos
casi nada: ni su autenticación, ni su almacenamiento, ni sus APIs. Solo la base.

### Qué datos personales tenemos (menos de lo que parece)

| Dato | Dónde | Nota |
|---|---|---|
| Nombre que escribe el cliente | pedido | texto libre; suele ser "Mesa 4" |
| Correo del cliente | reseña | **solo si marca la casilla** del opt-in |
| Nombre, correo y móvil del hostelero | usuarios y leads | los nuestros, no de comensales |

**No hay tarjetas, ni direcciones, ni teléfonos de comensales.** Las contraseñas se
guardan con scrypt, nunca en claro. Esto es una ventaja comercial y hay que decirlo en
las visitas: cuanto menos dato personal se guarda, menos hay que proteger y menos riesgo
tiene el bar. Lo que falta para estar del todo en regla es papel, no código: el contrato
de encargado de tratamiento, que cada bar tiene que firmar con nosotros.

## 4. ¿Cabe en 1 GB? Medido, no estimado

Metí **100.000 pedidos** de prueba (3 líneas y 2 escaneos cada uno) en una copia real de
la base y la compacté. Resultado: **757 bytes por pedido**.

| | |
|---|---|
| 1 GB da para | **~1,4 millones de pedidos** |
| Un bar de 100 pedidos al día | 28 MB al año |
| 20 bares así | 550 MB al año |

Con los primeros bares, 1 GB es **años** de margen. Y si se llena, ampliar el disco
cuesta 0,25 €/GB: pasar a 10 GB son 2,50 €/mes. Esto no es un problema de dinero.

### El que sí gasta es otro: las fotos

Las fotos de los platos se guardan tal cual, hasta **3 MB cada una**, sin reducirlas.
Una carta de 40 platos con fotos del móvil son **~80 MB de un solo bar**. Veinte bares
con fotos se comen el giga mucho antes que los pedidos.

Hay que arreglarlo, y no por el disco: una foto de 3 MB tarda **varios segundos** en
cargar en el móvil de un cliente con mala cobertura, y es lo primero que ve. Reducirlas
al subirlas a ~1200 px de ancho y convertirlas a WebP las deja en **~150 KB**: veinte
veces menos disco y una carta que abre al instante.

## 5. Resumen en cuatro líneas

1. **Seguimos en Render**, pagando los ~7 $ para que no duerma. Es lo que estaba mal.
2. **No desplegar en horario de servicio.** Es la única fuente de cortes que tenemos.
3. **Litestream a un bucket, 0,50 €/mes.** Es el único agujero serio que queda.
4. **Supabase cuando haga falta el segundo servidor**, no antes. 1 GB sobra para años.

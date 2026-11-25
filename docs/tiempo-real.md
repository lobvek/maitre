# Cómo viajan los pedidos, y dónde se guardan de verdad

Escrito el 25-11-2026. Describe lo que hace el código hoy, no un plan.

## La regla de la que cuelga todo

**Primero se escribe en disco, después se avisa.** El tiempo real es solo un aviso de
que algo ha cambiado; **nunca** es donde vive el dato. Si el aviso se pierde, el pedido
sigue ahí. Esto no es un detalle de implementación: es lo que hace que un corte de wifi
en la barra no cueste una comanda.

Nada existe "solo en tiempo real". Si está en la pantalla, está en la base de datos.

## El viaje de un pedido, paso a paso

**1. El móvil manda qué quiere, no cuánto cuesta.**
Envía ids de producto, cantidades y opciones. **El precio no se envía nunca.** El
servidor lo recalcula desde la carta real (`priceLines`). Si alguien manipula el móvil
para pedir un chuletón a 1 €, el servidor lo cobra a su precio. Lo mismo con los
productos agotados: el móvil puede tener la carta vieja en pantalla, el servidor no.

**2. Se escribe todo de una vez o nada.**
El pedido y sus líneas se insertan en **una sola transacción**. No existe un estado
intermedio con medio pedido guardado: o entra entero, o no entra.

**3. Y solo entonces se avisa.**
`announce()` manda el pedido ya guardado a dos sitios a la vez:

| Canal | Quién escucha | Qué recibe |
|---|---|---|
| `venue:<id>` | todas las pantallas del local | el pedido entero |
| `table:<token>` | el móvil de esa mesa | su propio pedido |

Y además, por si nadie está mirando la tablet: **notificación al móvil del camarero**
(Web Push) y, si el local lo tiene puesto, un mensaje de Telegram.

**4. La mesa se marca ocupada**, si estaba libre.

## El estado del pedido

```
new ──> accepted ──> preparing ──> served ──> paid
 └────────────────> cancelled
```

Cada salto es un `UPDATE` de esa fila **con su hora**: `accepted_at`, `served_at`,
`paid_at`, `closed_at`. Esas horas no son adorno: son de donde sale toda la analítica
(cuánto se tarda en aceptar, cuánto en servir, a qué hora se llena el local). Después de
cada salto, el mismo aviso a las mismas pantallas.

Reglas que están metidas en el código, no en la cabeza de nadie:
- Un pedido **cobrado ya no se puede modificar**.
- Cuando una mesa se queda sin pedidos abiertos, **pasa a limpieza** sola.
- Si se cobra con el móvil, el pedido se guarda como `pending` y **no se anuncia a
  barra**. La cocina solo ve lo que está pagado o lo que se paga en la mesa. Nadie
  prepara algo que no se ha cobrado.
- **«Lo cojo yo»**: mientras un camarero pasa el pedido al TPV queda marcado con su
  nombre, para que no lo metan dos y salga duplicado. La marca se suelta sola a los
  5 minutos por si alguien se despista.

## Cómo viaja: SSE, no WebSockets

Es **Server-Sent Events**: una conexión HTTP normal que el servidor deja abierta y en la
que va escribiendo líneas de texto. Cada aviso son dos líneas:

```
event: order.updated
data: {"id":412,"status":"served","table_name":"Mesa 4", ...}
```

Por qué SSE y no WebSockets, que suena más moderno:
- Va en **una sola dirección** (servidor → pantalla), que es todo lo que hace falta.
  Lo que la pantalla manda al servidor son peticiones HTTP normales.
- Es **HTTP del montón**: ningún proxy, antivirus ni wifi de bar lo bloquea.
- **El navegador reconecta solo.** Con WebSockets eso lo tienes que escribir tú.

## Qué hay en memoria del servidor (casi nada)

Solo **la lista de conexiones abiertas**: un mapa de canal → conexiones. Ni pedidos, ni
estados, ni colas. Si el servidor se reinicia, ese mapa se queda vacío y cada pantalla
se reconecta a los 3 segundos y vuelve a pedir la lista. No se pierde nada porque ahí
nunca había nada que perder.

## Las tres redes de seguridad

Esto está así porque falló: los pedidos dejaban de llegar al PWA del móvil.

1. **Latido cada 20 segundos**, como evento con nombre. Un comentario mantiene viva la
   conexión pero **el navegador no lo ve**; el cliente necesita verlo para saber que
   sigue conectado de verdad. Ese era el fallo: la conexión parecía viva y estaba muerta.
2. **Vigilante**: si pasan 50 segundos sin latido, se reconecta **aunque el navegador no
   haya dado ningún error**. Corre también con la pantalla apagada, porque la tablet de
   la barra tiene que sonar sin que nadie la mire.
3. **Resync**: al reconectar, la pantalla **vuelve a pedir la lista entera** por HTTP.
   Entre el corte y la vuelta han podido entrar pedidos cuyo aviso ya pasó y no va a
   volver. Esto es lo que impide el fallo clásico de "la pantalla cree que está al día".

Y además se reconecta al volver a primer plano, al recuperar la red, y al volver con el
botón atrás. El punto verde dice **«reconectando…»** cuando toca: *en directo* no puede
mentir, porque un camarero que se fía de una pantalla mentirosa pierde comandas.

## Los límites, dichos claros

- **Los avisos no se guardan ni se reenvían.** Si una pantalla ha estado apagada diez
  minutos, no recibe esos diez avisos: pide la lista entera. Es lo correcto, pero
  significa que el histórico vive **solo** en la base de datos, nunca en el stream.
- **Esto funciona con un servidor, no con dos.** El mapa de conexiones está en la memoria
  de ese proceso: una pantalla conectada al servidor A no se enteraría de un aviso
  publicado en el servidor B. El día que haga falta un segundo servidor, hay que sacar
  los avisos a Redis o a Postgres. **Es el mismo cruce de caminos que la base de datos**:
  los dos llegan a la vez, y ninguno ha llegado todavía.
- **El carrito del cliente vive en su móvil** hasta que le da a enviar. Si cierra la
  pestaña antes, se pierde — y está bien que sea así: no es un pedido hasta que lo manda.

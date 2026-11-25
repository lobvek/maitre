# Lo que queda por hacer

Lista viva. Lo de arriba es lo que más duele; lo de abajo, lo que puede esperar.
Última revisión: 26-11-2026, después de las pruebas de Daniel en Render.

## Arreglado en esta tanda

- **Un cobro abandonado se quedaba dentro de la cuenta de la mesa.** Si un cliente elegía
  pagar con el móvil y no terminaba, ese pedido no salía en la pantalla de sala (bien) pero
  **sí sumaba en la cuenta** (mal). El camarero cobraba la mesa y el pedido seguía ahí.
  Encima, el mensaje de "cobrado X €" daba el total de la cuenta y no lo que se había
  cerrado de verdad, así que podía descuadrar la caja. Hay prueba automática que lo fija.

## Pendiente, por orden de dolor

### 1. Guardar el tipo de IVA en cada línea de pedido
Diez líneas de código, y **no se puede recuperar después**. Hoy el IVA de una venta se
recalcula leyendo el producto de hoy: si el bar cambia el tipo en septiembre, las ventas
de junio salen mal. Antes de que facture un bar de verdad. Ver `contabilidad.md`.

### 2. Los avisos tienen que gritar más según lo que lleven esperando
Un pedido que lleva 30 segundos y uno que lleva ocho minutos se ven igual. Hay que
graduarlo por color —verde, ámbar, rojo— según el tiempo de espera, con el umbral que
decida el local, y que el rojo se note de verdad desde dos metros: es la distancia a la
que mira un camarero una tablet en la barra. Lo mismo para los avisos de mesa.

### 3. Pasada de móvil en serio
Se arreglaron los fallos que impedían usarlo, pero no está *pensado* para el móvil:
objetivos táctiles grandes, una mano, menos pasos para lo de siempre (aceptar, servir,
cobrar), nada de desplazamiento lateral, y que el camarero pueda trabajar sin leer letra
pequeña con prisa. Es un rediseño de la sala, no un retoque.

### 4. Pagar la cuenta entera de la mesa de una vez
Hoy el cobro con el móvil es por pedido. Cobrar seis rondas de 5 € cuesta más del doble en
comisiones que cobrar 40 € una vez, y además no es como funciona un bar. La cuenta ya se
calcula y el cliente ya la ve; falta enganchar el cobro. Ver `pagos-y-tpv.md`.

### 5. Reducir las fotos al subirlas
Se guardan hasta 3 MB sin tocar. Una foto así tarda segundos en abrir en el móvil de un
cliente con mala cobertura, y es lo primero que ve. A ~1200 px y WebP quedan en ~150 KB.

### 6. Litestream: copia continua fuera del servidor
Las copias de seguridad están en el mismo disco que la base. Si se pierde el disco, se
pierden las dos. ~0,50 €/mes. Ver `infraestructura.md`.

### 7. Comanda directa a la impresora de cocina
ESC/POS por el puerto 9100. Resuelve el "no teclear dos veces" sin depender de ningún
fabricante de TPV. Dos o tres días. Ver `tpv.md`.

### 8. Desglose por tipo de IVA y resumen mensual en la exportación
Para que el gestor del bar pueda hacer el 303 sin sumar a mano.

### 9. El panel, más visual
Pendiente de decidir branding y la interfaz antes de tocarlo. No se empieza hasta que eso
esté hablado, o se tira el trabajo dos veces.

## Cosas que dependen de otros, no de programar

- **Pagar Render Starter** (~7 $): mientras esté en el plan gratis, el servidor se duerme y
  la primera visita tarda 30–40 segundos. No es un fallo del código.
- **Preguntar en el banco** por el TPV Virtual, Bizum y Apple Pay (las cinco preguntas de
  `pagos-y-tpv.md`).
- **Preguntar a los bares en qué meten las comandas**: papel, cabeza o un programa, y cuál.
- **Las cuatro fotos** de la web, y el coste de la cuña, de Marc.
- **Clave de DeepL** gratis para la traducción de las cartas.
- **Contrato de encargado de tratamiento** para firmar con cada bar.

## Más adelante

- Cobro recurrente de las cuotas (hoy se emiten facturas, no se cobra solo).
- Panel y sala en catalán e inglés (hoy solo castellano; la carta del cliente sí está en 6).
- "Lo más pedido" en la carta, y una fila de destacados.
- Los huecos de analítica de `analitica.md`: ocupación de mesas, segundas rondas, lo que se
  mira y no se pide, comparación con la semana pasada en una frase.

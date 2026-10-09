# Qué datos podemos recoger y qué analítica le interesa de verdad a un bar

Actualizado el 09-10-2026.

## La regla

Un bar no quiere un panel de datos. Quiere **una decisión por dato**. Si un número no
cambia nada de lo que hará mañana el dueño, sobra. Esa es la vara de medir de esta lista.

## 1. Lo que YA se guarda (sin tocar nada)

Cada pedido lleva cuatro marcas de tiempo: `created_at`, `accepted_at`, `served_at`,
`closed_at`. Con eso ya se calcula todo lo que sigue, y ya está hecho:

| Dato | Decisión que permite |
|---|---|
| Ventas, nº de pedidos, ticket medio | saber si el QR sube el gasto o no |
| Tiempo de **aceptar** un pedido | cuánto tarda la sala en enterarse |
| Tiempo de **servir** (aceptado → servido) | dónde se atasca, barra o cocina |
| Ventas por hora y por día | a qué hora hace falta una persona más |
| Lo más y lo menos vendido | qué quitar de la carta |
| Ventas por mesa | qué mesas rinden y cuáles sobran |
| % de escaneos que acaban en pedido | si la carta convierte o solo se mira |
| Avisos al camarero: cuántos, de qué tipo y cuánto tardan en atenderse | si hace falta más sala en terraza |
| Valoraciones y nota media | cómo se vive el servicio |
| Margen por producto (si cargan los costes) | qué conviene empujar |

## 2. Lo que se puede sacar con poco más, y vale mucho

Ordenado por lo que un bar pagaría por ello:

1. **Tiempo total de mesa (ocupación)**. Desde que se abre la mesa hasta que se cierra.
   Decide: cuántos turnos caben un sábado. Hoy medimos pedidos, no mesas.
2. **Rotación por franja**: cubiertos por mesa y hora. Decide la reserva y el aforo.
3. **Segundas rondas**: qué % de mesas pide dos veces y cuánto tardan en pedirla.
   Es *la* métrica del pedido desde la mesa: si la segunda ronda sube, el QR paga la cuota.
4. **Lo que se mira y no se pide**: productos muy abiertos en la carta y poco vendidos.
   Decide: cambiar la foto, el nombre o el precio. (Hoy guardamos escaneos, no vistas de plato.)
5. **Abandono del carrito**: pedidos empezados y no enviados, y en qué paso se cae.
6. **Pareja de productos** (lo que se pide junto). Decide los menús y las sugerencias.
7. **Agotados**: cuántas veces y cuánto tiempo estuvo agotado algo que se vende mucho.
   Es dinero perdido, medible.
8. **Pedidos perdidos o tardíos**: los que pasan de X minutos sin aceptar. Es el criterio
   de fiabilidad del piloto.
9. **Comparación con la semana pasada** en todo lo anterior. Un número sin comparación no
   es información.
10. **Propinas**, si algún día se cobra por el móvil.

## 3. Lo que NO deberíamos recoger

- Nada que identifique al comensal más allá de lo que él escriba.
- Nada de huella de dispositivo ni seguimiento entre locales.
- Dentro del local, el personal no ve analítica de negocio: ya está restringido por rol.

Cuanto menos dato personal, menos obligación de RGPD y menos conversación incómoda
con el dueño. El valor está en los tiempos y en los productos, no en las personas.

## 4. Cómo presentarlo

Tres pantallas, no una:

- **Hoy** (para el dueño, de pie, con el móvil): ventas, pedidos, ticket medio, avisos sin
  atender. Cuatro números y nada más.
- **La semana** (para decidir): comparado con la anterior, con una frase en texto —
  «el jueves tardasteis 9 minutos de media en aceptar, el doble que el resto de la semana».
- **La carta** (para ordenar): lo más vendido, lo que no se vende, agotados y margen.

La frase en texto es lo que marca la diferencia. Un bar no lee un gráfico; lee una frase.

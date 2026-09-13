# Maitre — Manual del primer bar

Guía para dar de alta un bar y enseñar al equipo. Escrita para leerse en el propio bar.

## Qué es Maitre, en una frase

Un QR en cada mesa que abre la carta en el móvil del cliente, le deja **pedir** y **llamar al camarero**, y todo eso
aparece al instante en una pantalla en la barra. El bar no cambia nada de lo que ya tiene: ni su caja ni su forma de cobrar.

## Cómo ayuda de verdad a un bar

- **Menos vueltas.** El pedido ya está en la barra cuando el cliente termina de decidir.
- **Menos brazos levantados.** "La cuenta", "agua", "que venga alguien": un toque y le vibra al camarero.
- **Menos errores.** El pedido llega escrito, con "sin cebolla" y "al punto" incluidos.
- **Más ticket.** Cuando el cliente pide bravas, el móvil le sugiere una caña.
- **Datos.** Qué se vende, a qué hora, cuánto tardáis en aceptar.

La cuña de madera en la mesa hace que todo esto se vea, y no sea una pegatina de QR más.

## Las cuatro pantallas

| Pantalla | Quién | Dónde |
|---|---|---|
| La carta | El cliente, en su móvil | Escaneando el QR |
| La sala | Camareros, en tablet o móvil | `/sala` |
| El panel | El dueño, desde el ordenador | `/panel` |
| El operador | Maitre | `/operador` |

## Dar de alta un bar (30 minutos, con el dueño al lado)

1. **Crear la cuenta** — `/alta`: nombre del bar, email, contraseña, nº de mesas. Arranca con 30 días de piloto.
2. **Cargar la carta** — Panel → Carta. A mano (+ Categoría, + Producto) o **Importar CSV** desde su Excel.
   Ahí se ponen extras ("punto de la carne") y sugerencias ("con las bravas, caña").
3. **Barra y cocina** — En cada categoría, decir a dónde va la comanda.
4. **Mesas** — Panel → Mesas y QR. Ajustar número y zonas. **Hoja de QR** → imprimir → recortar → una por mesa.
   Se empieza hoy; las cuñas de madera llegan después con el mismo QR.
5. **Equipo** — Panel → Equipo: una cuenta por camarero.
6. **La sala** — Abrir `/sala` en la tablet de barra o en el móvil de cada camarero.
   Sin tablet: cada camarero pulsa **📳 Avisos** en su móvil y le llega todo aunque esté bloqueado
   (en iPhone: antes, Compartir → Añadir a pantalla de inicio, y abrir desde ese icono).
7. **Ajustes que importan** — Aviso al personal (sí/no) · Quién puede pedir (recomendado: *solo si el personal ha
   abierto la mesa*) · Cobro (de momento: *se paga en el local*).
8. **Probar en vivo** — Escanear una mesa con el móvil del dueño, pedir una caña, verla entrar en la sala,
   aceptar, servir, cobrar.

## El día a día del camarero (5 minutos de formación)

- Entra un pedido → pita → **Aceptar** → **Servido** → **Cobrar**.
- Se acaba algo → **86** → buscar → *Agotado*. Desaparece de la carta al instante.
- Aviso de una mesa → aparece arriba en amarillo → **Hecho**.
- Cambiar o unir mesas → pestaña **Mesas** → tocar la mesa.

## Lo de Maitre en `/operador`

- **Cartera**: bares que pagan, ingresos al mes, hitos del plan de empresa.
- **Pilotos**: por bar, si cumple los criterios (uso, ticket, pedidos perdidos) y nota semanal.
- **Locales**: cambiar plan, ampliar piloto, oferta Fundadores.
- **Contactos**: quienes escriben desde la web.

## Cómo contarlo

> "No te cambio la caja. Pongo un QR en cada mesa: el cliente ve la carta, pide y te avisa desde el móvil, y a ti
> te llega a la barra al momento. Te lo dejo un mes, medimos si lo usan, y si no te sirve me llevo las cuñas y
> aquí no ha pasado nada."

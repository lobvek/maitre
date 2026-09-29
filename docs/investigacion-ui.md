# Cómo lo hacen los que lo hacen bien

Investigación de interfaces, 29 de septiembre de 2026. No son impresiones: los valores están
extraídos leyendo los estilos calculados de cada web en el navegador.

## Lo que usa cada uno

| Producto | Titulares | Radios dominantes | Curva grande | Micro-interacción |
|---|---|---|---|---|
| **Linear** | Inter Variable 510/590, interletraje −0,022em | píldora · 8px · 9px · 4px | `.7s cubic-bezier(.32,.72,0,1)` | `.16s cubic-bezier(.25,.46,.45,.94)` y `.1s` |
| **Stripe** | Söhne 300, −0,02em | 4px · 6px | `.3s cubic-bezier(.25,1,.5,1)` | `.15s linear`, `.12s` |
| **Sunday** (pago QR) | Helvetica 400, −0,05em | 16px · píldora | `.4s cubic-bezier(.16,1,.3,1)` | `.3s ease` |
| **Tebi** | Marund Curved 500 (tipografía propia) | — | — | — |
| **Qamarero** | DM Sans 700, sin interletraje | 8px · 24px · 48px | `.15s ease` | `.15s ease` |
| **Last.app** | Vendsans 700, −0,02em | 12px · píldora | `1.1s cubic-bezier(.22,1,.36,1)` | `.15s ease` |
| **Honei** | Helvetica, negro y amarillo | píldora | — | — |

## Las cinco cosas que aprendimos

**1. El movimiento va a dos velocidades, no a una.**
Todos los buenos separan la *micro-interacción* (120–160 ms, curva rápida y seca: un botón que
responde al dedo) de la *transición grande* (400–700 ms, curva que arranca fuerte y se posa despacio:
un panel que entra). Mezclarlas es lo que hace que una interfaz parezca lenta o nerviosa.
Adoptado: `--ease-micro` a 140 ms y `--ease-macro` con la curva de Linear `(.32,.72,0,1)`.

**2. Los radios pequeños son de producto; los grandes, de folleto.**
Linear y Stripe trabajan con 4–9 px en la herramienta. Sunday usa 16 px, pero en su web de venta.
Teníamos 16–22 px en todas partes, y por eso el panel parecía de juguete. Ahora: **8–10 px** en el
panel y la sala (densidad), **16 px** en la carta del cliente (calidez), píldora en los botones.

**3. El interletraje negativo crece con el tamaño.**
Entre −0,02 y −0,05 em en titulares grandes. Lo teníamos fijo en −0,012 em, así que los titulares
grandes se veían sueltos. Ahora escala con el tamaño.

**4. En hostelería nadie cuida el movimiento.**
Qamarero y Last.app van con `0.15s ease` por defecto en todo: no hay sistema. Es una ventaja
gratis para nosotros — es lo más barato de hacer bien y lo primero que se nota al enseñarlo.

**5. Fondo cálido y oscuro para romper el ritmo.**
Tebi alterna secciones oscuras con fotografía real de bares. Una web de cards blancas en fila es
justo lo que produce una IA. Adoptado en la sección de producto y el pie.

## Qué NO copiamos

- El negro y amarillo de Honei: agresivo, y nuestro verde es lo contrario.
- La suite completa de Qamarero: es su ventaja, no la nuestra.
- Fotografía de banco de imágenes: sin fotos reales del local, mejor madera y papel.

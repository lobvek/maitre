# Investigación: ocho webs, medidas de verdad

Valores extraídos del navegador el 19-10-2026, no mirados a ojo.

| Sitio | Titular | Cuerpo | Radios | Movimiento | Imágenes |
|---|---|---|---|---|---|
| **buenacarta** | Raleway 800, −0,02em | Raleway | 6 · 8 · 10 · 14 · 18 · 28 · 50px | `0.15–0.3s ease-in-out` | 63 fotos |
| **kavuo** | **Source Serif 4, peso 400** | DM Sans | 12 · 16 · 20 · 32 · píldora | — | 7, una gigante de portada |
| **tucartadigital** | Inter 700, −0,025em | Inter | 6 · 12 · 15 · 30px | — | 73 |
| **offforum** | **Forvm serif 400**, −0,02em, 45px | Baikal **a 10px** | 20 · 40 · píldora | `0.3–0.4s cubic-bezier(.32,.94,.6,1)` | 2 (a sangre) |
| **overworldaudio** | PPFrama, versalitas espaciadas | — | — | GSAP + **three.js**, canvas WebGL | **0 imágenes** |
| **huyml** | — | — | — | GSAP + three.js + Framer Motion | 19, en cascada diagonal |
| **neutomni** | Vazirmatn | — | **2px y ya** | GSAP + **Lenis** | 89 + vídeo |
| **nickho** | Anton 600 | Helvetica | — | GSAP + three.js + Lenis | 67 + vídeo |
| **heronai** | BT Grotesk 700, −0,02em | BT Grotesk | 50% | GSAP + Lenis | 45 |

## Siete conclusiones

1. **Las tres de nuestro sector se parecen entre sí y a todas las SaaS del mundo.** Inter o Raleway, azul o verde,
   bloques de tres tarjetas, captura de móvil flotando. Son correctas y olvidables. Ahí no hay nada que copiar:
   hay un hueco que ocupar.

2. **Las que impresionan tienen serif de peso bajo en los titulares.** Kavuo pone Source Serif en 400; offforum,
   Forvm en 400. Un titular serif fino sobre foto lee «restaurante», no «software». Nosotros ya tenemos Fraunces.

3. **La interfaz se encoge cuando el titular crece.** offforum escribe su interfaz **a 10px** en versalitas con
   mucho tracking. El contraste de tamaños es lo que hace que un titular parezca enorme.

4. **Una foto a sangre con cosas encima que funcionan.** En Kavuo, sobre la foto del restaurante hay un campo de
   verdad: «Nombre de tu restaurante» + botón. No es una imagen decorativa: es el principio del producto.
   Es exactamente lo que pediste.

5. **Las que flipan no usan fotos: las generan.** Overworld Audio tiene **cero imágenes**: todo es WebGL, grano y
   versalitas sobre azul casi negro. Eso es three.js, y su coste de mantenimiento no nos compensa — pero el
   *efecto* (grano, oscuro cálido, una sola acción en el centro) se consigue con CSS.

6. **Todas las premiadas usan la misma máquina: GSAP + Lenis + scroll.** Reveal por scroll, no al cargar.
   Nosotros no necesitamos las librerías: `IntersectionObserver` hace el 90% y pesa cero.

7. **El loader no es una espera, es la entrada.** huyml y nickho arrancan en negro con una barra o un número y
   de ahí revientan a contenido. Nosotros ya tenemos la cafetera; solo había que usarla también aquí.

## La decisión: la web es una carta

De las tres competidoras ninguna hace lo obvio: **si vendes una carta con pedido desde la mesa, la web debería
funcionar como una carta con pedido desde la mesa**.

- La navegación son las categorías de la carta, con el mismo chip que en el móvil del comensal.
- Los planes son **platos**: nombre, descripción, precio, etiquetas y un botón **+**.
- Las cuñas y los extras, también platos.
- Abajo vive la misma barra de «Tu pedido», con su contador y su total.
- Al enviarlo se abre la misma hoja inferior que en la app, con el resumen y los datos de contacto.
  Pedir el piloto **es** hacer un pedido.

Así, quien entra en la web ya ha usado el producto antes de que se lo enseñemos. Y la calculadora de precios
desaparece: no hace falta calcular lo que te cuesta si lo estás montando en un carrito.

## Fotos que hacen falta (cuatro)

Formato apaisado 3:2, 2000px de ancho, cálidas, luz de tarde, nada de stock azul.

1. `hero.jpg` — mesa de bar con la cuña de madera y el QR, taza de café, vermut, luz lateral de tarde.
2. `sala.jpg` — camarero detrás de la barra mirando una tablet, movimiento de fondo, cálido.
3. `cuna.jpg` — primer plano de la cuña de roble con el QR grabado, grano de madera visible.
4. `terraza.jpg` — manos sosteniendo un móvil con la carta abierta, mesa de terraza desenfocada detrás.

Mientras no estén, cada hueco se rellena con un degradado de marca y la web se ve entera.

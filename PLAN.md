# Maitre — Plan de construcción del software

Derivado del *Plan de empresa 2026* (borrador G346NTA-192, Marc Simón Socías).
Todo lo que el documento promete como producto, implementado y funcionando.

## 1. Qué dice el plan de empresa y cómo se traduce a software

| Punto del plan | Módulo del software |
|---|---|
| 2.1 Carta web por QR específico de cada mesa | `Carta pública móvil` + `Mesas y QR` |
| 2.1 Pedido desde la mesa | `Pedidos` (carrito + envío + seguimiento) |
| 2.1 Aviso al personal, activable por el local | `Avisos` (camarero / cuenta / agua) con toggle por local |
| 2.1 Panel para cargar y actualizar la carta | `Gestor de carta` (categorías, productos, alérgenos, variantes) |
| 2.1 Identificar la mesa y recibir pedidos o avisos | `Sala / KDS` en tiempo real (SSE) |
| 2.1 Soporte físico: logo + nº de mesa + QR + "Reservado" | `Generador de cuñas` (hoja imprimible + PNG/SVG por mesa) |
| 3.1 Configuración inicial y acompañamiento | `Onboarding` guiado en 5 pasos + importador CSV de carta |
| 3.3 Fase 2: estadísticas, gestión de mesas, estados de limpieza/NFC | `Analítica`, `Estado de mesas`, `endpoint NFC` |
| 3.3 Fase 2: consulta de pedidos y cobro in situ | `Cuenta de mesa` + cierre con método de pago |
| 3.5 Plan Básico 9,90 € / Pro 19,90 € + 30 días piloto | `Planes y facturación` con feature-gating real |
| 3.7 Web con demo, calculadora de precio y alta sencilla | `Landing` pública + alta self-service |
| 3.8 Flujo alternativo para que el personal tome pedidos | `Pedido manual` desde el panel de sala |
| 3.8 Minimizar datos, aviso de privacidad | Sin registro del comensal, sesión anónima, política incluida |
| 4 Publicidad obligatoria Generalitat + FSE+ | Bloque de cofinanciación en el pie de la web y de la carta |

## 2. Decisiones técnicas

- **Node.js 24 + Express 5**, ES Modules.
- **SQLite vía `node:sqlite`** (integrado en Node, cero dependencias nativas, cero servidor de BD).
  Un solo fichero `data/maitre.db`, migraciones en código.
- **Sin build step en el front**: HTML + CSS propio + ES Modules nativos. Se abre y funciona.
- **Tiempo real con SSE** (`EventSource`), nativo, sin websockets ni librerías.
- **Auth propia**: scrypt + cookies de sesión httpOnly, roles `superadmin / owner / manager / staff`.
- **Únicas dependencias npm**: `express` y `qrcode`. Nada más.
- **Multi-tenant**: cada fila lleva `venue_id`, y todas las consultas se filtran por el local de la sesión.
- **Pagos**: capa `billing` con adaptador simulado (crea suscripciones, facturas y cambios de plan reales
  en BD) y punto de enganche marcado para Stripe. No se guardan tarjetas — coherente con el punto 3.8.

## 3. Arquitectura

```
server/
  index.js      arranque, estáticos, montaje de rutas
  db.js         esquema + migraciones + helpers
  auth.js       scrypt, sesiones, requireAuth/requireRole
  plans.js      definición de planes y feature-gating
  realtime.js   hub SSE (canales por local y por mesa)
  qr.js         PNG/SVG de QR y hoja de cuñas imprimible
  routes/       auth, venue, menu, tables, orders, calls, public, analytics, billing, admin
public/
  index.html    landing + calculadora de precio + alta
  app.html      panel del local (SPA con router de hash)
  sala.html     pantalla de sala/KDS a pantalla completa
  m.html        carta pública móvil (la que ve el comensal)
  cunas.html    hoja imprimible de soportes de madera
```

## 4. Módulos y alcance

1. **Cuentas** — alta de local self-service, login, logout, cambio de contraseña, equipo con roles.
2. **Local** — marca (logo, color), idiomas, moneda, IVA, horario, wifi, toggles de funciones.
3. **Carta** — categorías, productos, precio, foto, 14 alérgenos UE, etiquetas, grupos de opciones
   (tamaños/extras) con precio delta, disponibilidad y agotados, orden, i18n es/ca/en, import/export CSV.
4. **Mesas** — zonas, mesas, token único por mesa, QR, estado (libre/ocupada/reservada/limpieza),
   endpoint NFC, hoja de cuñas imprimible con logo + número + "Reservado".
5. **Carta pública** — sin registro, rápida, buscador, filtro por alérgenos y dieta, carrito,
   envío del pedido, seguimiento del estado, botón de aviso al personal.
6. **Sala** — pedidos en vivo por SSE con aviso sonoro, ciclo nuevo→aceptado→preparando→servido→cobrado,
   avisos pendientes, cuenta por mesa, pedido manual, cronómetro por ticket.
7. **Analítica (Pro)** — ventas por día, ticket medio, top productos, horas punta, embudo escaneo→pedido,
   gráficos SVG generados a mano.
8. **Planes** — trial 30 días, Básico 9,90 €, Pro 19,90 € (+IVA). Límites y funciones bloqueadas de verdad.
9. **Superadmin** — todos los locales, MRR, altas, pilotos, ampliar prueba, cambiar plan, hitos del plan
   de empresa (12 / 35 / 70 locales) contra la realidad.
10. **Cumplimiento** — bloque FSE+ / Generalitat, política de privacidad, datos mínimos del comensal.

## 4 bis. Añadido tras la primera revisión

| Petición | Cómo se resolvió |
|---|---|
| Cobrar antes de mandar a barra | `payments.js` + estado de pago del pedido; la cocina no ve nada sin pagar |
| Confirmación para el comensal | Pantalla de confirmación con detalle, total y referencia del cobro |
| Evitar pedidos con una foto del QR | `order_gate`: abierto / solo mesa abierta / código de turno, más freno por sesión |
| Separar barra y cocina | `station` por categoría, filtro en sala y comanda imprimible por estación |
| Punto de cocción y similares | Grupos de opciones por producto (ya existía; sembrado como ejemplo) |
| Marcar agotados sin tocar la carta | Lista rápida «86» en la pantalla de sala |
| Cambio y unión de mesas | `/move`, `/merge`, `/unmerge` con cuenta conjunta |
| Roles con acceso distinto | Analítica y facturación cerradas a sala (verificado en tests) |
| Conexión con TPV | Webhook firmado + plan por fases en `docs/tpv.md` |
| Analítica ligera para el MVP | Lo esencial arriba; lo avanzado plegado y el margen marcado como beta |

## 4 ter. Alineación con el Estudio de competencia y estrategia 2026

| El estudio dice | En el software |
|---|---|
| Opción C: capa de mesa, no carta QR ni TPV | Posicionamiento y copy de la web reescritos; nunca «carta QR» |
| Precios Mesa 19 / Servicio 39 / Fundadores 19 × 24 meses | `plans.js`; reparto revisado el 13-09 (pedido en Mesa, analítica en Servicio); Fundadores solo lo asigna el operador. El tercer plan se retiró: no se vende lo que aún no está construido |
| Piloto = experimento con objetivo, baseline, revisión semanal y decisión | Diseño del piloto por local + cuadro de mando con los 4 criterios de éxito |
| QR administrable y lote en la cuña | Código permanente `/q/…` grabado; token y dominio cambian sin regrabar |
| Hardware a coste completo, depósito en piloto | Copy de precios y campo de depósito en el piloto |
| Fase 1: upselling, reseñas, opt-in | Sugerencias por plato; valoración tras el servicio con opt-in |
| Fiabilidad: el pedido no puede perderse | Alarma en sala a los 3 min sin aceptar; «pedidos perdidos» en el cuadro del piloto |
| Pago y TPV: fase 2 | Pago con el móvil, conexión con TPV y varios locales viven en `ROADMAP`: no se venden en ningún plan y solo el operador puede abrirlos para pruebas internas |
| No ser sistema fiscal (VERI*FACTU) | La cuenta se presenta como resumen de consumo, no ticket |
| Métricas (tabla 12) | % mesas que escanean/piden/llaman, tiempo a aceptar, ticket vs base, retención semana 4 |

## 4 quater. Diseño: investigación y movimiento

No se inventó un lenguaje visual: se midieron sitios reales desde el navegador y se copiaron los
valores que funcionan. La tabla completa está en [`docs/investigacion-ui.md`](docs/investigacion-ui.md).

| Lo que se midió | Lo que se hizo |
|---|---|
| Linear separa una curva macro (`.7s`) de una micro (`.16s`) | Dos velocidades en todo el producto: `--t-fast` para el dedo, `--t-slow` para las superficies |
| Linear y Stripe usan radios de 4–9 px en la herramienta | Radios recalibrados: 6–12 px en panel y sala, 16–18 px en la carta |
| Sunday cierra el interletraje hasta −0,05em | Interletraje por tamaño, hasta −0,034em en titulares |
| Qamarero y Last.app van con `0.15s ease` en todo | Ventaja gratis: en hostelería nadie cuida el movimiento, y es lo primero que se nota al enseñarlo |
| Tebi rompe el ritmo con fondos oscuros y cálidos | Secciones en `--coffee` en la web, para no parecer una fila de tarjetas blancas |

El motor es `public/js/motion.js`: View Transitions, FLIP en los tickets de sala, hojas que se
arrastran con el dedo, cifras que cuentan, vibración corta y esqueletos de carga. Respeta
`prefers-reduced-motion` y cada animación tiene salida segura: si el navegador no puede, el cambio
se aplica igualmente sin animar.

## 5. Verificación

- `npm test` — suite con `node:test` sobre BD en memoria: auth, aislamiento multi-tenant, carta,
  cálculo de totales con opciones e IVA, ciclo de pedido, gating por plan.
- `scripts/smoke.sh` — arranca el servidor y recorre el flujo completo real con curl:
  alta → carta → mesa → escaneo → pedido → sala → cobro.
- Datos de demostración (`npm run seed`) con dos locales piloto, como en el plan.

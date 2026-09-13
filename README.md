# Maitre

Carta digital por QR, pedido desde la mesa y gestión de sala para bares, cafeterías y restaurantes.

Implementación del producto descrito en el *Plan de empresa 2026* y alineada con el *Estudio de
competencia y estrategia 2026*: capa de servicio de mesa compatible con cualquier TPV — carta móvil por
QR administrable en cada mesa, pedido con confirmación y estado, aviso al personal, cola de sala y cocina,
cuña de madera modular, piloto de 30 días medido y planes Mesa 19 € / Servicio 39 € / Local 69 €
(+ oferta Fundadores).

| Plan | Qué incluye |
|---|---|
| **Mesa** 19 € | Carta en varios idiomas, alérgenos, QR por mesa, pedido desde la mesa con variantes y extras, aviso al personal, pantalla de sala sencilla, cuentas de sala |
| **Servicio** 39 € | + barra y cocina separadas, comanda imprimible, agotados en un toque, sugerencias, cambio y unión de mesas, equipo con roles, analítica y exportaciones |
| **Local** 69 € | + integración con TPV, pago con el móvil, reseñas y opt-in, varios locales |
| **Fundadores** | Servicio a 19 € durante 24 meses; lo asigna Maitre |

---

## Arrancar

```bash
npm install
npm run seed      # datos de demostración: 2 locales piloto, 31 productos, ~900 pedidos
                  # (npm run reset borra y recrea; para el servidor antes de ejecutarlo)
npm start         # http://localhost:3000
```

| Página | Ruta | Para quién |
|---|---|---|
| Web pública y precios | `/` | Visitantes |
| Alta de un local | `/alta` | Nuevo cliente |
| Panel del local | `/panel` | Propietario y encargado |
| Pantalla de sala | `/sala` | Barra y camareros |
| Carta del comensal | `/m/:local/:mesa` | Cliente del bar |
| Hoja de QR y vista de la cuña | `/cunas` | Impresión provisional del local |
| Consola de Maitre | `/operador` | Operador del negocio |

### Accesos de demostración (contraseña `maitre2026`)

| Cuenta | Rol |
|---|---|
| `marc@maitre.app` | Operador de Maitre (cartera, MRR, pilotos, contactos) |
| `ancora@maitre.app` | Propietario de un local Fundadores (piloto convertido) |
| `vitoria@maitre.app` | Propietario de un local en piloto |
| `encargado.ancora@maitre.app` | Encargado |
| `sala.ancora@maitre.app` | Camarero |

La carta de un comensal se abre desde *Mesas y QR* → *Ver*, o directamente en `/m/bar-lancora`.

## Ponerlo online

**Ahora mismo, desde tu Mac** (URL temporal, sin cuenta):

```bash
bash scripts/online.sh
```

**Para siempre, en Fly.io** (URL fija `https://maitre.fly.dev`, ~5 €/mes, la base de datos en un volumen):

```bash
fly auth login          # una vez: crea la cuenta o entra
bash scripts/deploy-fly.sh
```

**Gratis, en Render** (se duerme sin visitas y en el plan Free los datos vuelven a la demo al reiniciar —
vale para enseñarlo, no para un piloto): sube el repo a GitHub y en render.com elige *New → Blueprint*;
`render.yaml` hace el resto.

`Dockerfile` y `fly.toml` ya están preparados; el mismo Dockerfile sirve para Railway.
Con `SEED_ON_EMPTY=1` el primer arranque siembra los dos locales de demostración.

## Comprobar que funciona

```bash
npm test          # 17 pruebas: auth, aislamiento multi-local, carta, IVA, ciclo de pedido, planes, roles
npm run smoke     # recorrido real de punta a punta con curl sobre un servidor temporal
```

## Qué incluye

**Para el comensal** — carta optimizada para móvil sin registro ni app, buscador, filtros por dieta y por
alérgenos (los 14 grupos de la UE), foto opcional en cada plato, opciones y extras, carrito, **pago con el
móvil antes de mandar el pedido a barra** (o pago en el local, según decida el establecimiento), pantalla de
confirmación, seguimiento en vivo del estado, aviso al personal (camarero, cuenta, agua) y consulta de la
cuenta. Castellano, catalán e inglés.

**Para el local** — puesta en marcha guiada, gestor de carta con categorías por horario, fotos por plato,
importación y exportación en CSV, disponibilidad por producto, zonas y mesas, QR por mesa en PNG y SVG,
rotación de token, etiquetas NFC, hoja de QR imprimible para empezar el primer día, vista previa de la cuña
modular, elección del modo de cobro (en el local, opcional o previo obligatorio) y de quién puede pedir.

En la **pantalla de sala**: pedidos en tiempo real con aviso sonoro, distintivo de «pagado», filtro por
estación (barra / cocina) con comanda imprimible por separado, lista rápida de agotados («86») sin entrar a
la carta, estados de mesa, cambio de mesa y unión de mesas con cuenta conjunta, cuenta por mesa y pedido
manual.

Y además: analítica (lo esencial siempre a la vista — ventas, pedidos, ticket medio, % de pedidos por QR y
lo más vendido — y un bloque avanzado plegado con horas punta, embudo, tiempos y márgenes), equipo con
roles reales y planes con facturas.

**Para Maitre** — cartera de locales, MRR y ARR, seguimiento de los hitos del plan de empresa
(12 / 35 / 70 locales y punto de equilibrio en 45), contactos entrantes de la web y registro de auditoría.

## Arquitectura

- **Node.js 24 + Express 5**, ES Modules. Únicas dependencias: `express` y `qrcode`.
- **SQLite integrado en Node** (`node:sqlite`): un fichero, sin servidor de base de datos ni compilación nativa.
- **Sin build en el front**: HTML, CSS propio y ES Modules nativos.
- **Tiempo real por SSE**, con canal por local (personal) y canal por mesa (comensal).
- **Sesiones propias** con scrypt y cookie httpOnly; roles `superadmin / owner / manager / staff`.
- **Multi-tenant** por `venue_id` en cada tabla y en cada consulta.

```
server/
  index.js        arranque y montaje de rutas
  db.js           esquema y helpers de SQLite
  auth.js         scrypt, sesiones y control de acceso
  plans.js        planes comerciales y bloqueo de funciones
  orders-core.js  precios, IVA y ciclo de vida del pedido
  realtime.js     hub de SSE
  qr.js           QR en PNG y SVG
  routes/         auth · venue · menu · tables · orders · public · analytics · billing · admin · leads
public/
  index.html      web pública con calculadora de precio
  app.html + js/views/   panel del local
  sala.html       pantalla de sala
  m.html          carta del comensal
  cunas.html      hoja imprimible de cuñas
  operador.html   consola de Maitre
```

## Integración con el TPV

Fase 1: convivencia + **webhook firmado** (HMAC-SHA256) por local + exportación CSV.
Fase 2: conectores nativos según demanda real. Fase 3: impresión ESC/POS directa a cocina.
El detalle, con ejemplo de carga útil y verificación de firma, está en [`docs/tpv.md`](docs/tpv.md).

## Decisiones que conviene conocer

- **Los precios se calculan siempre en el servidor** a partir de la carta. Lo que envía el móvil del
  cliente son identificadores y cantidades; cualquier precio que llegue en la petición se ignora.
- **El IVA** se desglosa según la configuración del local (incluido en el precio, como es habitual en
  hostelería en España, o añadido). Cada producto puede llevar su propio tipo.
- **Cobro del pedido**: si el local lo activa, el cliente paga con el móvil **antes** de que el pedido llegue a
  barra; hasta que el pago se confirma, la cocina no lo ve. El enganche con la pasarela está aislado en
  `server/payments.js`: cada local conectaría su propia cuenta y el dinero iría directo a él, sin pasar por
  Maitre y sin guardar datos de tarjeta. Mientras no haya pasarela configurada
  (`PAYMENTS_PROVIDER`), funciona un proveedor de pruebas que simula el resultado.
- **Suscripción de Maitre**: el módulo de facturación crea planes, cambios y facturas reales en la base de
  datos, pero tampoco cobra: mismo patrón de adaptador en `routes/billing.js`.
- **Quién puede pedir**: el QR grabado en la cuña es estático, así que una foto del QR permitiría pedir
  desde fuera. Cada local elige su nivel en Ajustes: abierto, solo con la mesa abierta por el personal,
  o con código de turno. Además hay freno por sesión y tope de pedidos sin atender por mesa. Cobrar
  antes de enviar es, en la práctica, la mejor defensa.
- **Barra y cocina**: cada categoría se marca como barra o cocina; la pantalla de sala filtra por estación
  e imprime comandas separadas.
- **Datos del comensal al mínimo**: no hay registro ni cookies de terceros; solo un identificador anónimo
  guardado en el propio navegador para poder mostrarle el estado de su pedido.
- **Publicidad obligatoria**: la mención de cofinanciación del FSE+ y la Generalitat aparece en la web
  pública, en la carta del comensal y en el aviso de privacidad.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `PUBLIC_URL` | origen de la petición | URL base con la que se generan los QR |
| `MAITRE_DB` | `data/maitre.db` | Fichero de base de datos (`:memory:` en los tests) |
| `MAITRE_DATA_DIR` | `data/` | Carpeta de base de datos y de imágenes subidas |
| `PAYMENTS_PROVIDER` | `sandbox` | Pasarela de cobro. Con `sandbox` se simula el pago |
| `SEED_ON_EMPTY` | — | Con `1`, siembra los datos de demostración si la base está vacía |
| `NODE_ENV` | — | Con `production` la cookie de sesión exige HTTPS |

## Antes de poner esto en producción

1. Servir detrás de HTTPS y fijar `NODE_ENV=production` y `PUBLIC_URL`.
2. Conectar la pasarela real (`PAYMENTS_PROVIDER`), con una cuenta por local, y activar el ciclo de
   renovación de las suscripciones. Ojo al coste por transacción: en tickets pequeños pesa mucho.
3. Copia de seguridad periódica de `data/` (base de datos e imágenes) y monitorización.
4. Firmar el contrato de encargo del tratamiento con cada establecimiento.

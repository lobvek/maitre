# Integración con el TPV del bar: cómo sería de verdad

Actualizado el 25-11-2026. Esto no es el guion de venta (eso está al final), es el
análisis de qué hace falta, cuánto cuesta y qué conviene prometer.

## 0. Primero hay que saber qué es "su TPV", porque hay tres casos distintos

Dijiste que los TPV de los bares serán "de la Caixa, Sabadell". **Eso son datáfonos, no
software de TPV.** Y cambia la respuesta por completo, porque un datáfono **no tiene nada
que integrar**: no guarda la carta, no guarda comandas, no tiene base de datos ni API.
Solo cobra tarjetas.

| Lo que tiene el bar | ¿Hay algo que integrar? | Qué hacemos |
|---|---|---|
| **Solo datáfono** (CaixaBank, Sabadell) y comandas a papel o de memoria | **No. No hay nada.** | **Maitre ya es su sistema.** Caso ideal: entramos sin pelearnos con nadie |
| **Caja registradora** de toda la vida | No | igual que el anterior |
| **Software de TPV** (Revo, Glop, Ágora, Camarero10, Last, ICG…) | Sí, y es trabajo de verdad | conector, marca por marca, negociado |

**Esta es la pregunta que hay que llevar escrita a las visitas:** *"¿En qué metéis las
comandas: en un programa, en papel, o de cabeza?"* Si la respuesta de los cinco primeros
es "papel", el conector de TPV **desaparece de la lista de cosas por hacer** y nos ahorramos
meses. Y si la respuesta es un programa, hay que apuntar cuál.

## 1. Lo que ya está hecho y funciona hoy

**Convivencia.** El camarero mete la comanda en su TPV como siempre. Maitre marca quién la
está metiendo ("Lo cojo yo") y la suelta sola a los 5 minutos. No es un apaño: es lo que
impide que tres camareros metan el mismo pedido.

Que esto importa de verdad lo confirma Revo: en su versión del **22 de octubre de 2026**
publicaron una corrección de **pedidos externos duplicados**. Es decir, el problema de la
comanda duplicada lo tienen hasta los que llevan años integrando su propio producto.

**Webhook firmado.** En Ajustes se pega una URL y Maitre manda ahí cada evento, firmado
con HMAC-SHA256 para que el receptor sepa que viene de nosotros. Quien tenga a alguien
técnico (o un Make/Zapier) se integra hoy sin que toquemos nada.

## 2. Cómo sería un conector nativo: el caso Revo, con nombres y apellidos

Revo es el mejor caso posible, porque es el que tiene la API más documentada. Si con Revo
es manejable, con los demás también; si con Revo es un lío, con los demás es peor.

**Lo que hay que conseguir antes de escribir una línea:**
- Una cuenta de pruebas de Revo XEF.
- Un **Access Token**, que se saca uno mismo desde la cuenta.
- Un **Integrator Token**, que **no es autoservicio**: hay que pedirlo a Revo por un
  formulario y esperar a que te contesten y te validen.

Ese último punto es el que marca el ritmo: **la primera integración no depende de nosotros,
depende de que Revo nos coja el teléfono.** Semanas, no días.

**Lo que hace el conector, una vez dentro:** mandar el pedido con tres cabeceras
(`tenant`, `Authorization: Bearer`, `client-token`) a su endpoint de creación de pedidos,
con la mesa, los comensales, las notas y las líneas. Hay entorno de pruebas aparte
(`integrations.revoxef.works`), el límite es de 120 peticiones por minuto —muchísimo para
un bar— y además **Revo avisa de vuelta** por webhook firmado cuando un pedido se crea, se
modifica, se cierra, se mueve de mesa o se cancela. Eso último es lo bueno: permitiría que
Maitre sepa que la mesa ya se cobró en el TPV sin que nadie se lo diga.

### Y aquí está el problema de verdad, que no es la API

Para mandar una línea de pedido hay que decir **qué producto es, con el id de Revo**. No
vale mandar "Caña 2,50": hay que mandar "item_id 4417".

Eso significa que por **cada bar** hay que **casar las dos cartas**: la caña de Maitre con
la caña de Revo, los 80 productos uno por uno. Y mantenerlo:

- El bar añade un plato en Revo → en Maitre no existe → no se puede pedir.
- El bar cambia un precio en Maitre → el TPV cobra otro → **descuadre de caja**.
- El bar borra un producto en Revo → el conector empieza a fallar a mitad de servicio.

**El coste del conector no es programarlo, es que no se podrique.** Y ese coste es **por
bar**, no por marca. Esto es exactamente, por cierto, la razón por la que todos los TPV
traen su propia carta QR: cuando la carta es la misma carta, no hay nada que casar.

### Lo que costaría, con honestidad

| | |
|---|---|
| Conseguir acceso y token de integrador | semanas de espera, 0 € de código |
| Primer conector (Revo), funcionando en pruebas | ~1 semana |
| Pantalla para casar las dos cartas, con avisos cuando algo no cuadra | ~1 semana más, y es la parte que no se puede saltar |
| Cada marca nueva (Glop, Ágora…) | otra semana, y otra negociación |
| Mantenimiento | para siempre, y crece con cada bar |

## 3. El atajo que vale la pena antes que todo esto: imprimir la comanda

Si lo que se quiere resolver es **que el camarero no teclee dos veces**, hay una vía mucho
más corta que integrar un TPV: **mandar la comanda directamente a la impresora de cocina**.

Casi todas las impresoras de comandas de un bar son de red y hablan ESC/POS por el puerto
9100. Se les manda texto plano y escupen el papel. **No hay fabricante al que pedir
permiso, ni carta que casar, ni token que negociar.**

Hoy Maitre imprime desde el navegador, con el diálogo de imprimir de toda la vida. Mandarlo
directo a la impresora son **dos o tres días de trabajo** y resuelve el 80 % del dolor real
(la comanda llega a cocina sola) sin tocar el TPV ni su caja. El cobro sigue donde estaba.

Para un bar de los que vas a visitar —datáfono y comandas a papel— **esto es más valioso
que cualquier conector**, y no depende de nadie más que de nosotros.

## 4. Qué conviene prometer, y qué no

**Nunca "nos integramos con tu TPV"** a secas. Cada TPV tiene su API, o no tiene ninguna, y
la mitad son competencia directa: Last.app no integra, sustituye.

El orden sensato:

1. **Preguntar.** Cinco visitas, una pregunta: ¿en qué metéis las comandas?
2. **Impresora de cocina.** Barato, nuestro, y resuelve el dolor de verdad.
3. **Webhook**, para el que tenga a alguien técnico. Ya está.
4. **Conector nativo** cuando **diez bares con el mismo TPV** lo pidan. Empezando por Revo
   o Glop, que son los que tienen API documentada. Antes de esos diez, es una apuesta.

## Respuesta corta para la visita

> Maitre no sustituye tu TPV ni te obliga a cambiarlo. Convive: tú sigues cobrando donde
> cobras. Lo que te damos es la carta, el pedido que llega solo y el aviso al móvil.
> Si tienes impresora en cocina, la comanda te sale impresa sin que nadie la teclee. Y si tu
> programa de TPV admite conexiones, te lo enganchamos — dime cuál es y te digo si se puede.

Esa última frase es la clave: **se pregunta cuál es antes de prometer nada.**

## Fuentes

- [Revo API Reference](https://api.revo.works/) · [API de Revo XEF](https://api.revo.works/sections/xef.html)
- [Revo XEF 5.4, corrección de pedidos externos duplicados (22/10/2026)](https://support.revoxef.works/es/articles/1300)
- [Revo SOLO ↔ Revo XEF](https://support.revo.works/es/articles/497)
- [Glop + Lymon: pedidos QR](https://www.lymon.es/blog/glop-tpv-lymon-pedidos-qr)
- [Camarero10 TPV](https://www.camarero10.com/software-tpv-bares-restaurantes/)

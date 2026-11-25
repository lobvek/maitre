# Tickets, recibos y contabilidad: quién emite qué

Escrito el 25-11-2026. Las fechas de Veri*Factu hay que reconfirmarlas antes de decidir:
están en movimiento y hay un aplazamiento anunciado y **no publicado**.

## 1. Hay tres papeles distintos, y mezclarlos es el error más caro

| Papel | Quién lo emite | ¿Es fiscal? |
|---|---|---|
| **El ticket del cliente** (factura simplificada) | **el TPV o la caja del bar** | **Sí** |
| **El resumen de consumo** en el móvil del cliente | Maitre | **No**, y no debe parecerlo |
| **El resumen de ventas para el gestor** del bar | Maitre | No: es un apoyo, no un libro oficial |
| *(Y aparte)* **nuestra factura al bar**, los 19/39 € | nosotros | Sí, y es **nuestra** obligación |

## 2. Lo que ve el cliente en su móvil: un resumen, no un ticket

Cuando alguien pide dos cañas, en su móvil aparece **lo que ha pedido y lo que cuesta**.
Eso es un resumen de consumo, igual que la cuenta en un platillo. **No es un ticket
fiscal**, y está hecho así a propósito.

Lo que **no** debe llevar nunca esa pantalla, por mucho que quede bonito:
- la palabra "Factura"
- un número de factura correlativo
- el NIF del bar presentado como si fuera un ticket
- un QR que simule el de la Agencia Tributaria

El ticket legal lo sigue dando el bar, de su caja, como siempre. Si el cliente pide
factura, se la hace el bar.

## 3. Por qué no queremos emitir el ticket (todavía)

En el momento en que Maitre emite el ticket, Maitre se convierte en un **sistema
informático de facturación** y hereda **Veri*Factu** entero:

- cada factura encadenada con la anterior por huella (hash), para que no se pueda tocar
  ninguna sin que se note
- un registro de facturación inalterable, con su registro de eventos
- el QR obligatorio y, en su caso, el envío a la Agencia Tributaria
- una declaración responsable del fabricante del software — o sea, **nuestra**

Y el dato que más importa de todo esto: **a los fabricantes de software la obligación les
entró el 29 de julio de 2025.** Es decir, no tenemos el margen que tienen los bares: el
día que Maitre emita una factura, tiene que cumplir ya, no en 2027.

Las fechas para quien **usa** el programa, a día de hoy en el BOE:

| Quién | Desde |
|---|---|
| Sociedades | 1 de enero de 2027 |
| Autónomos | 1 de julio de 2027 |

Hacienda anunció el 5 de octubre de 2026 un aplazamiento **hasta octubre de 2028**, pero
**no está publicado en el BOE**. Mientras no se publique, lo que vale son las fechas de
2027. Esto hay que mirarlo otra vez antes de prometer nada, y no fiarse de blogs: las
fuentes que encontré se contradicen entre sí.

**Conclusión:** Maitre no factura. Y cuando algún día facture, será una decisión de
producto tomada a propósito, con presupuesto y con un asesor fiscal delante — no un efecto
secundario de haber añadido el cobro con el móvil.

## 4. Lo que el bar necesita de nosotros para su gestor

Aquí sí tenemos que ser útiles, y es barato.

### Lo que ya hay

Una **exportación contable en CSV** por rango de fechas, con una fila por pedido: código,
fecha, mesa, canal, estado, los artículos, **base, IVA, total** y medio de pago. Eso se
abre en Excel y se le manda al gestor.

### Lo que falta, y es importante

**1. El desglose por tipo de IVA.** Hoy el CSV da una sola base y un solo IVA por pedido.
Si el bar tiene cosas al 10 % y cosas al 21 %, el gestor **no puede separar las bases**, y
eso es justo lo que necesita para el modelo 303. Hay que sacar una columna por tipo.

**2. Un fallo del modelo de datos que hay que arreglar antes de que facture un bar real.**
En cada línea de pedido guardamos el nombre y el precio del producto tal como estaban en
ese momento (una "foto"), pero **no guardamos el tipo de IVA**. Se calcula al vuelo
leyendo el producto actual. Eso significa que si el bar cambia el IVA de un producto en
septiembre, **las ventas de junio se recalculan mal**. No se puede arreglar hacia atrás:
o se guarda desde el principio, o esos datos quedan tocados para siempre.

Son unas diez líneas de código: añadir la columna, guardarla al crear el pedido y usarla
en la exportación. **Es lo primero que haría de toda la lista de contabilidad.**

**3. Un resumen por meses**, para no tener que sumar en Excel: ventas por día y por mes,
con bases separadas por tipo de IVA y totales por medio de pago. Una pantalla y un botón
de descargar.

### Lo que no vamos a dar, y conviene decirlo claro

**Maitre no es el libro de ventas del bar.** Por el QR entra una parte de lo que vende el
bar: lo que se pide en la barra, lo que paga en efectivo sin pasar por la carta, los menús
del mediodía apuntados a mano, nada de eso está en Maitre. El libro de ventas sale de **su
TPV y su caja**. Lo nuestro es un apoyo para cuadrar, no la verdad fiscal.

Esto, además, es la misma razón de la sección 4 del documento de pagos: **si cobramos y no
integramos el TPV, le creamos un descuadre al bar.** Contabilidad y TPV son el mismo
problema visto de dos lados.

## 5. Nuestra propia factura al bar (esta sí nos obliga)

Los 19 o 39 € al mes que nos paga cada bar son **nuestras** facturas emitidas, y ahí sí
hay una fecha encima: si la sociedad que factura Maitre es una S.L., le toca Veri*Factu el
**1 de enero de 2027**, salvo que se publique el aplazamiento.

Hoy Maitre genera esas facturas en HTML, listas para imprimir. **Eso no vale como
facturación legal a partir de esa fecha**, y la recomendación es clara: **no programar
nuestro propio sistema de facturación.** Se emiten las facturas desde una herramienta ya
certificada (la que use la gestoría: Holded, Quipu, Finutive…) y Maitre se queda con lo
que es: saber a quién hay que cobrar y cuánto. Montar un sistema de facturación conforme
a Veri*Factu para emitir treinta facturas al mes es malgastar semanas.

## 6. La frase para la visita

> El ticket se lo sigues dando tú, desde tu caja, como siempre. Lo que ve el cliente en el
> móvil es su consumo, no una factura. Y a final de mes te bajas un Excel con todas las
> ventas que han entrado por el QR, con sus bases y su IVA, para tu gestor.

## Qué hacer, por orden

1. **Guardar el tipo de IVA en cada línea de pedido.** Diez líneas, y no es recuperable
   después. Antes de que cobre el primer bar de verdad.
2. **Desglose por tipo de IVA en la exportación**, para que sirva para el 303.
3. **Resumen mensual** descargable.
4. **Nuestras facturas, en una herramienta certificada**, no en Maitre.
5. **Volver a mirar las fechas de Veri*Factu** antes de enero, por si se publica el
   aplazamiento.

## Fuentes

- [Fechas de Veri*Factu: 1-1-2027 sociedades, 1-7-2027 autónomos](https://contix.es/verifactu/fechas/)
- [El BOE mantiene el 1 de enero de 2027 para sociedades (24-11-2026)](https://www.elconfidencialdigital.com/seguraria/articulo/hacienda/confirmado-boe-sociedades-siguen-obligadas-usar-verifactu-1-enero-2027/20261124075711002951.html)
- [Aplazamiento anunciado a octubre de 2028, aún sin publicar](https://getquipu.com/blog/verifactu-se-retrasa/)
- [Qué es Veri*Factu y qué exige al software](https://www.cegid.com/ib/es/sistema-verifactu/)
- [Obligación de los fabricantes de software desde el 29-7-2025](https://www.innobing.com/post/verifactu-facturacion-electronica-obligatoria-a-partir-del-1-de-enero-de-2026/)

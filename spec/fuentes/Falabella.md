# Banco Falabella (personas)

Revisado el 2026-09-28 solo con el sitio público y el código JavaScript público; **sin iniciar sesión** (banco bloqueado en `~/.fpc/bloqueos/falabella` tras un rechazo, hasta entrar a mano).

Extractor: `extractores/bancos/productos/falabella.mjs` (`extraerFalabella({ descubrir })`).

## Login (verificado en la página pública)

- En `https://www.bancofalabella.cl`, el botón "Mi Cuenta" abre un panel (`DrawerFormLogin`) con RUT y clave en la misma pantalla: `input#document` (máx. 10, "Ej: 12345678-9") e `input#pass` (máx. 6).
- El botón `button[type=submit]` "Ingresar" está **deshabilitado** hasta que RUT y clave están completos. Con solo el RUT sigue deshabilitado. El extractor espera a que se habilite y nunca presiona Enter.
- `#modal-message` existe siempre en el DOM, oculto y con un texto genérico. Lo que cuenta es que esté **visible**.
- El login va a `bff.bancofalabella.cl/login/v2/authentication-web` con cuerpo y respuesta encriptados (no es JSON legible en la red).

## Después del login (según el código público, sin verificar con datos)

- La banca es una app Angular en `web.bancofalabella.cl/web-clientes/` (o `web2`). Llama a `…/bankingserver-api-falabella-web/rest/callService/json/…`, con pedidos y respuestas encriptados (`{m, p, s, i}`) que la app desencripta y luego pasa por `JSON.parse`.
- Por eso `registrarRed` solo ve sobres encriptados. El extractor agrega una sonda (`JSON.parse` + `XMLHttpRequest`) que guarda en memoria los JSON ya desencriptados, junto con la última ruta XHR. `descubrimiento` guarda solo su forma (`forma()`), nunca valores.
- CMR: web component `credit-card-movements` (`static.fif.tech/omnichannel-assets/bfcl/wc/credit-card-movements/credit-card-movements.js`). El componente no llama a la red: emite `onChanges` con `endpoint` y la app le devuelve la respuesta en la propiedad `params`. Rutas lógicas: `/movement-cc/v1.0|v2.0` + `/credit-card` (resumen), `/credit-card/movements` (`transactionType` `BILLED`/`UNBILLED`, 20 por página), `/credit-card/projected-billing-statements` (gastos del período, próximos vencimientos), `/credit-card-banking-statement/billing-date/list` y `/customer/get-statement`.
- Campos CMR usados: `billingSummary.lastBillingSummary.{lastBillingDate, expirationDate, billedAmount, minimumPayment}`, `nextBillingSummary.{nextBillingDate, nextExpirationDate}`, `startingBillingDate`, `endingBillingDate`; transacciones con `transaction.{transactionId, transactionDate, transactionAmount, description}`, `installmentInfo.{currentInstallmentNumber, totalInstallmentNumber, installmentAmount}`, `ownership.ownershipId` (`T`/`A`), `transactionType.code` (`A` autorización pendiente, `C` compra en cuotas, `E` movimiento de estado de cuenta, `X` concepto económico) y `accountingActionType.code` (`A` abono, `C` cargo).
- Productos: la app los lista como `customerOperationPermission.customerOperation` (con `subproduct.shortDesc` y `subproduct.product.shortDesc`). El extractor los resume sin números completos.

## Qué sale del extractor

- Cuentas: movimientos (fecha, glosa, monto con signo, saldo) desde JSON si se reconoce la estructura, si no desde la tabla en pantalla; también saldo disponible y saldo contable.
- Tarjetas CMR: movimientos no facturados, pendientes y facturados (cuota N/M, monto de la cuota con signo, monto total de la compra, titular o adicional, categoría), hasta 5 estados de cuenta anteriores, cupos nacional e internacional (de la pantalla), próximas fechas, último estado (monto facturado, pago mínimo, período), intereses, comisiones, impuestos y seguros (sumados desde los movimientos facturados), avances y cuotas vigentes con **fecha de término estimada** (último vencimiento + cuotas restantes).
- Líneas y créditos: desde los bloques de producto del inicio (pares etiqueta/monto). Es heurístico.

## Pendiente de verificar en el primer login real

- Que el login avance a `web-clientes` sin segundo factor, y cómo se ve un rechazo.
- Que la sonda capture los JSON desencriptados (ver `rutas_api` en el resumen). Si no aparecen, todo sale de la pantalla (`fuente: "pantalla"`).
- Selectores del inicio: enlaces de cuenta (`Cuenta Corriente/Vista` seguido de número), `[id^=cardDetail]` para CMR, textos de cupos, bloques de líneas y créditos, y botón "Cerrar sesión".
- Estructura JSON de cuentas, cupos, líneas y créditos (hoy solo se registra en `descubrimiento`).

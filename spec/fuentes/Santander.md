# Santander (banca en línea personas)

Resultado del descubrimiento del 2026-09-28 (2 sesiones). Solo rutas, campos y unidades; sin datos.

## Límites observados
- Una sesión a la vez. La sesión se cierra sola tras unos minutos sin actividad en la interfaz (revoke + logoff).
- El token de `openbanking.santander.cl` deja de servir (302) unos 20 min después del login: leer cuentas primero.
- Cuentas: unos 3 meses de movimientos disponibles aunque se pida un rango mayor.
- `deudaPendientePrestamo` respondió código 16 "LA APLICACION UG ESTA Desactiva" en horario nocturno; `ultimosPagos` sí respondió.
- No hay estados de cuenta internacionales (USD) para las tarjetas actuales.

## Endpoints

| Ruta | Se dispara en | Contenido | Unidades |
|---|---|---|---|
| `api-dsk.santander.cl/perdsk/datosCliente/cruceProductosOnline` | login | productos (`AGRUPACIONCOMERCIAL`: CCC, LCR, TCR, AHR), `CUPO`, `MONTOUTILIZADO`, `MONTODISPONIBLE`, `CODIGOMONEDA` | montos /100 |
| `openbanking.santander.cl/account_balances_transactions_and_withholdings_retail/v1/current-accounts/balances` | Cuentas > Mis cuentas | `totalBalance`, `availableBalance`, `overdraftAgreement` (cupo línea), `balanceLca` (disponible línea) | /100 |
| `.../current-accounts/transactions` | Cuentas > Movimientos | `movements[]`: `transactionDate`, `accountingDate`, `observation`, `expandedCode`, `movementAmount`, `newBalance`, `chargePaymentFlag` (D/H), `movementNumber` | centavos con signo final (`...-`) |
| `openbanking.santander.cl/card_authorization/card_authorization/v1/cards/card_devices_management` (GET) | Mis Tarjetas de Crédito | por tarjeta: `productComment`, `cardNumber` (enmascarado, últimos 4), `accountNumber`, `emissionCenter`, `entityCode`, `subProductCode`, `cardStatusComment` | — |
| `api-dsk.santander.cl/perdsk/tarjetasDeCredito/consultaUltimosMovimientos` | pestaña Movimientos por facturar | `DATA.MatrizMovimientos[]`: `Fecha` (dd/mm/aaaa), `Comercio`, `Descripcion`, `Importe`, `IndicadorDebeHaber` | pesos con punto de miles |
| `.../tarjetasDeCredito/cuentasDisponibles` | pestaña Movimientos facturados | lista de estados: `NUMEXT`, `FECHAEXT`, `MONEDA` (152 CLP), `TipoEECC` | — |
| `.../tarjetasDeCredito/estadoCuentaNacional` | idem (entrada `NumExtracto`) | cabecera `RESPUESTA` y movimientos `Matriz` (ver abajo) | pesos enteros |
| `.../tarjetasDeCredito/estadoCuentaInternacional` | — | sin datos (código 16) | — |
| `.../tarjetasDeCredito/estadoDeCuenta` | idem | PDF en base64 (`imgNbs64`); no se usa | — |
| `api-app.santander.cl/appper/Mazon/ResumenEECCNacional` | idem | `DeudaNoFacturada`, `CupoUtilizado`, `PagoMinimo`, `FechaVencimiento`; requiere el `NumeroExtracto` propio de cada tarjeta | pesos |
| `api-dsk.santander.cl/perdsk/datosCliente/cruceProductoHipotecario` | acordeón Créditos del inicio | créditos (`AGRUPACIONCOMERCIAL` HIP/CON), `CODIGOMONEDA` (UF), `GLOSAESTADO` | — |
| `.../serviciosCliente/creditoDeConsumo/ultimosPagos` | Mundo Hipotecario | `Movimientos[]`: `NroCuota`, `Monto`, `FechaLiquidacion` | CLP /10000 |
| `.../serviciosCliente/creditoDeConsumo/deudaPendientePrestamo` | acordeón Créditos / Mis Créditos | `Escalares` esperados: `FecFormalizacion`, `FecVencimiento`, `FecRecVigente`, `FecUltimoPago`, `TotalCuotas`, `MontoCapVigente`, `CapInicialMO`, `ValCuotaVigML`, `ValCuotaVigMO`; `Cuotas2[]` | montos con 4 decimales implícitos (no verificado) |

## Estado de cuenta nacional
- Cabecera: `TasaIntPeriodo`, `TasaIntCuotas` (probable % mensual = valor/10000, sin confirmar), `CupoPesos`, `MontoUtilizado`, `CupoDisponible`, `FechaFactAnt`, `FechaFactActual`, `FechaVenc`, `FechaProxFact`, `DeudaTotalFact`, `PagoMinimo`, `TotalComision`, `SaldoAnterior`, `TotalPagos`, `TotalCompras`, `TotalCargos`, `SaldoCapitalCuota`, `CuotasMes1..4`.
- Movimientos (`SegmentoTxs/CodTxs`), verificado sumando contra la cabecera:
  - 01/067 = pagos (= `TotalPagos`).
  - resto de 01 = compras (= `TotalCompras`); 205 = cuota de compra en cuotas.
  - 03 = cargos: impuestos, IVA, servicios (= `TotalCargos`).
  - 04 = compra en cuotas informativa (cuota 0/M).
  - `SaldoAnterior − TotalPagos + TotalCompras + TotalCargos = DeudaTotalFact` (se cumplió en 2 de 4 estados probados).
- Cuotas: `NumeroCuotas/TotalCuotas` = cuota N de M; `MontoTxs` = valor de la cuota; `MontoCuota` = total de la compra. El sitio muestra N y M invertidos.
- Una sola llamada trae el estado completo (hasta 70 filas vistas); `NumMov` no pagina.

## Paginación de movimientos de cuenta
Hasta 50 por respuesta. Mientras `repositioningExit.recordRecover` sea 50, repetir con `startMovement = initialMove` y `endMovement = finalMove`. `accountId` = oficina + contrato del listado de productos; `commercialGroup` = "LCA" para la línea de crédito, vacío para cuentas.

## Extractor

`extractores/bancos/productos/santander.mjs` (2026-09-29) no reenvía llamadas: navega Inicio → panel Créditos → panel Tarjetas (cada tarjeta, pestañas por facturar y facturados) → Cuentas > Mis cuentas y Movimientos, y lee las respuestas capturadas. Hay que esperar a que `#menu-uid-0010` esté visible y existan los paneles antes de navegar; dentro de un submenú, `#back-lvl2` vuelve al primer nivel.

## Pendiente
- Un estado de tarjeta que no cuadra con la cabecera (revisar segmentos o moneda).
- Estados anteriores de cada tarjeta (seleccionar extractos en la pestaña facturados).
- Más de 50 movimientos de cuenta y cuentas de ahorro.
- Confirmar escalas de `deudaPendientePrestamo` y de las tasas de tarjeta.
- Distinguir saldo disponible de contable en la cuenta corriente.

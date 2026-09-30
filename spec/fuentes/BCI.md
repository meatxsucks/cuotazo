# BCI personas — extractor propio

Código: `extractores/bancos/productos/bci.mjs` (`extraerBci()`; `node productos/bci.mjs` imprime solo un resumen). Revisado contra el portal real el 2026-09-28.

## Flujo

1. Login en `www.bci.cl/corporativo/banco-en-linea/personas` (formulario `#frm` → `login.bci.cl/.../ms-auth-personas/v1.5/login`).
2. Tras el login aparece **"Registra tu Dispositivo de confianza"** (`login.bci.cl/web/fe-dispositivosconfianza-mo-re-v1-0/...`), opcional por normativa CMF. Se pulsa **Omitir** (`POST .../dispositivo-confianza/omitir`) y el portal redirige a `personas.bci.cl/web/fe-orq-mo-personas-re-v1-7/...`.
3. Menú Mi Banco → *Últimos Movimientos* (iframe `personas.bci.cl/modernizacion/fe-saldosultimosmovpersonas/`).
4. Menú Créditos → *Mis Créditos* (`.../comp/creditos/.../resumenCreditos`).
5. Cerrar Sesión.

Por qué open-banking-chile devolvía 0: su login solo verifica que la URL ya no sea `banco-en-linea/personas`, y la pantalla de dispositivo de confianza cumple eso, así que da el login por bueno. Queda detenido en esa pantalla, sin menú ni iframes, y no encuentra "Últimos Movimientos" ni "Tarjetas".

## Endpoints

Base A: `https://apilocal.bci.cl/bci-produccion/api-bci/bff-saldosyultimosmovimientoswebpersonas/v3.2`. Cabeceras `authorization: Bearer <jwt>`, `x-ibm-client-id`, `channel`, `application-id`, `reference-operation`, `reference-service`, `tracking-id`, que se copian de la primera llamada que hace la app. Las llamadas se repiten con `fetch` desde el propio iframe.

| Endpoint | Cuerpo | Da |
|---|---|---|
| `POST A/cuentas-busquedas/por-rut` | `{rut}` | `cuentas[{numero, tipo: Corriente\|Prima}]` |
| `POST A/cuentas-busquedas/por-numero-cuenta` | `{cuentaNumero}` | `tipo` (CCT/CPR), `estado`, `saldoContable`, `saldoDisponible`, `retenciones`, `lineaSobregiro{montoUtilizado, saldoDisponible}`, `lineaEmergencia{saldoDisponible}` |
| `POST A/cuentas-movimientos/por-numero-cuenta` | `{numeroCuenta}` | `movimientos[{fechaMovimiento (ISO con hora), idMovimiento, glosa, monto ("1234.0000"), tipo C=cargo/A=abono, serie, detalleMovimiento{tipo, atributos[{titulo, valor}]}}]`, de más nuevo a más antiguo |
| `GET personas.bci.cl/api/ms-creditos-mb-orq/v1.3/resumenCreditosBackingMB/state` | — (cookie) | `creditosVigentes[{numOperacion, glosaTipoOperacion, tipoCredito, tipoDeudor, glosaMoneda, montoCredito, saldoCredito, valorCuota, saldoValorFinalCuota, cuotasPagadas, numTotalCuotas, fecVencimiento, fechaMaxVencimiento, fechaCurseOper, tasaSprea}]` |
| `GET personas.bci.cl/api/ms-aplicaciones-mb-orq/v1.3/productosMB/state` | — (cookie) | catálogo: `cuentasCorrientesYPrimas`, `tieneTarjeta`, `tieneLSG` |

Otros vistos y no usados: `supercartolaBackingMB/state` (saldos agregados y cupos TDC), `cuentas-movimientos/por-numero-cuenta/reporte` (`{numeroCuenta, cantidadRegistros}`, binario), `ms-movimientoscuentapersonas-neg/v1.3/cartolas-busquedas/por-cuenta-y-anio` (solo metadatos de cartolas históricas en PDF), `ms-gestioncuentascliente-neg/v3.11/SolicitarClienteCuentas` (tipo, estado y fecha de apertura), `bff-tdc-mantenimiento-posicion-webpersonas/v1.0/cuenta/tarjetas/titulares` (sin tarjeta responde 460 "cliente no encontrado").

## Productos cubiertos

| Producto | Estado | Campos |
|---|---|---|
| Cuenta corriente | Extraída | saldo disponible y contable, retenciones, movimientos con fecha, hora, glosa, monto con signo, categoría y detalle |
| Cuenta Prima | Extraída | igual que la corriente |
| Crédito de consumo | Endpoint documentado | campos de la tabla de arriba; ver advertencia en Límites |
| Tarjeta de crédito | Sin probar | sin tarjeta el menú es `tdc_sin_tdc` y `tieneTarjeta=false` |
| Línea de sobregiro | Sin probar | sin línea, `tieneLSG=false` y montos en cero |

## Límites

- Movimientos: la API entrega solo los últimos (50 en la cuenta corriente, unos 2 meses; la Prima con menos uso cubre más tiempo). No hay paginación ni filtro de fechas en el cuerpo. Para más historia quedan el reporte binario o las cartolas PDF.
- La API no trae saldo por movimiento. El extractor lo calcula hacia atrás desde `saldoContable`, así que es aproximado si hay retenciones o movimientos pendientes.
- Créditos: `resumenCreditosBackingMB/state` responde varias veces y cada respuesta trae un solo crédito, que cambia entre sesiones. Resultó que el portal mezcla ahí ofertas o simulaciones con créditos vigentes: el normalizador no los carga hasta poder distinguirlos.
- `tasaSprea` viene sin unidad (probablemente % mensual).
- Si el portal empieza a pedir registrar el dispositivo o un segundo factor obligatorio, el extractor se detiene.

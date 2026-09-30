# ADR-007 — Caja por ciclo de sueldo

**Estado:** aceptada · **Fecha:** 2026-09-30

## Contexto

El Resumen mostraba flujo de consumo por mes calendario (`resumen_mensual`). Con el sueldo a fin de mes, el mes calendario
parte el período en dos, y el flujo de consumo no cuenta pagos de tarjeta ni créditos: podía salir positivo con las cuentas
casi en cero. La pregunta que importa es otra: cuánta plata real queda para vivir hasta el próximo sueldo.

## Decisión

### Ciclo de sueldo

- El ciclo va del día de corte (`dw.dim_usuario.dia_corte_sueldo`, 25 por defecto) del mes M al día anterior del mes M+1, y se
  etiqueta con el día 1 de M+1. Funciones `dw.corte_mes` (día de corte ajustado al último día del mes) y `dw.ciclo_de`.
- Solo cuentan movimientos de **cuentas** por su `fecha` real (no la imputación): es caja, no consumo. Las tarjetas entran
  cuando se pagan desde una cuenta (`pago_tarjetas`).
- `dw.caja_movimiento` clasifica cada movimiento de cuenta en un grupo fijo; `presentacion.caja_ciclo` suma entradas y salidas
  por grupo y `presentacion.caja_resumen` por ciclo. Los `traspasos_propios` se muestran netos para no inflar entradas y salidas
  con plata que solo se movió entre cuentas del mismo usuario. Un giro de la línea de crédito hacia la cuenta cuenta como
  traspaso propio (la línea es un producto del usuario); lo que muestra el uso de la línea es la bandera de más abajo.

### Disponible para vivir

- `saldo_hoy` = suma de `saldo_cuenta`; solo en el ciclo en curso.
- Compromisos conocidos (`dw.compromiso`): facturado de cada tarjeta menos lo pagado desde la facturación (con su mínimo), la
  cuota del mes de cada crédito de consumo y el dividendo (`deuda_cuota_mes`, o `valor_cuota` si es CLP), con la fecha de pago
  llevada al próximo mes si ya pasó.
- `comprometido_proximo` suma todos esos compromisos; `comprometido_antes_sueldo`, solo los que vencen antes del
  `proximo_sueldo` (último sueldo detectado + 1 mes, o el día de corte si no hay sueldo detectado).
- `disponible_para_vivir = saldo_hoy − comprometido_antes_sueldo`. Puede ser negativo.
- En Supabase, `finanzas.lo_que_viene` lista esos compromisos uno por uno y suma pagos fijos manuales (`pago_fijo`, con
  vigencia `desde`/`hasta` y meses en pausa) y deudas que ningún extractor trae (`deuda_manual`); de ahí sale
  `disponible_para_vivir_ajustado`. Si un usuario no tiene compromisos, la vista no trae filas y la app usa
  `caja_resumen.disponible_para_vivir`.

### Pagar la tarjeta con la línea

Un pago de tarjeta desde una cuenta queda `financiado_con_linea` si hay un giro de la línea de crédito hacia una cuenta del
mismo usuario a ±3 días; `monto_financiado_linea` es el menor entre el pago y la suma de esos giros. El giro se reconoce por la
glosa (línea, sobregiro) o por el número de la línea que aparece en sus amortizaciones. Se expone en `caja_ciclo` y
`caja_resumen`. Es una señal de alerta: la deuda no baja, se mueve a un producto más caro.

### Sobres y anotaciones

Tablas editables `sobre` (monto por semana lunes–domingo o por mes, opcionalmente ligado a una categoría) y `anotacion`
(gasto anotado a mano, ≤ 140 caracteres, con vínculo opcional al movimiento del banco). `estado_sobre` compara lo anotado con
el monto del sobre y muestra como `sin_anotar` el gasto real de la categoría en el período que no tiene anotación vinculada.

### Reglas de categorización por usuario

`sql/bodega/03_reglas.sql` queda con marcas y rubros nacionales. Los comercios propios de cada usuario van como reglas con
`usuario_id` en `sql/bodega/privado/reglas_usuario.sql` (ignorado por git; plantilla en `reglas_usuario.example.sql`), que
`fpc_categorizar.py` carga antes de categorizar. Las reglas de usuario tienen precedencia sobre las generales. Para retirar
una regla de usuario se marca `activa = FALSE`.

## Consecuencias

- La cuadratura de caja es por cuenta y ciclo: entradas − salidas = suma de movimientos, en `caja_movimiento`, `caja_ciclo` y
  `caja_resumen`. La cuadratura de tarjetas recorre todas las tarjetas con estado; las que no traen `saldo_anterior` en el
  estado quedan como no evaluables.
- `datos_completos` es falso si alguna cuenta no cubre el ciclo completo hasta hoy (una corrida de ayer basta para que el
  ciclo en curso salga incompleto).
- Supuestos a revisar: un mismo giro de línea puede marcar dos pagos de tarjeta cercanos; los pagos fijos con fecha anterior a hoy
  se asumen pagados (una deuda manual con `proximo_pago` vencido y sin `dia_pago` se muestra como pendiente); el próximo sueldo se estima con el último detectado.

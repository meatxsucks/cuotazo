# ADR-006 — Alertas de presupuesto y plan de ajuste

**Estado:** aceptada; pantallas reemplazadas por [[ADR-009_Mes_Y_Carro]] (las vistas siguen) · **Fecha:** 2026-09-29

## Contexto

Los gastos no se anotan: llegan solos desde los bancos. En Chile es común comprar en cuotas sin llevar control de cuánto
se compra a crédito cada mes ni de qué parte del ingreso se va en cuotas; las cuotas comprometidas pueden subir mes a mes
sin que se note, y el ingreso que se ve en los bancos es poco confiable (hay meses sin sueldo visible). La pantalla anterior de
presupuestos era un límite por categoría y mes que había que copiar a mano cada mes.

## Decisión

### Alertas al estilo AWS Budgets

Como en AWS Budgets, el usuario define límites y umbrales, y la app vigila el consumo real y el pronosticado; no hay captura
manual de gastos. Encaja con datos que llegan solos y con alguien que no va a revisar categoría por categoría.

- Tabla `finanzas.presupuesto` evolucionada sin perder filas: clave propia `presupuesto_id`, `tipo`, `umbrales int[]`
  (por defecto 80 y 100), `alerta_pronostico` y `mes` opcional. Sin mes el presupuesto es **recurrente**; con mes aplica solo
  a ese mes y tiene prioridad sobre el recurrente del mismo tipo y categoría. Las filas previas quedan como `categoria` mensual.
- Cuatro tipos:
  1. `categoria`: gasto del mes en una categoría (`gasto_diario`, por `fecha_imputacion`).
  2. `total`: todo el gasto del mes (`gasto` + `interes_comision`).
  3. `compras_credito`: tope de compras **nuevas** en cuotas (tarjeta, `cuotas_total > 1`, cuota 1 del mes o, sin cuota actual,
     fecha de compra en el mes; suma el total de la compra). Es el control que suele faltar: cuánto se endeuda cada mes.
  4. `carga_cuotas`: % máximo del ingreso que se va en cuotas y dividendos del mes (`deuda_cuota_mes` ÷ ingreso de referencia).
- Estados: `excedido` (consumo ≥ límite), `aviso` (cruzó un umbral), `pronostico_excede` (la proyección al cierre supera el
  límite y la alerta de pronóstico está activa), `ok`, en ese orden de prioridad.
- Todo se calcula en vistas `security_invoker` (`estado_presupuesto`, `credito_mes`, `presupuesto_sugerido`) para que RLS
  siga aplicando y la app no replique lógica; el modo demo replica las mismas fórmulas en TypeScript
  (`web/src/lib/demo/calculos.ts`), verificado contra Postgres con los mismos datos.

### Pronóstico lineal

`proyectado_cierre = consumido × días del mes ÷ día de hoy` (hora de Chile), igual que `flujo_proyectado_cierre`. Es simple,
explicable en una línea y no necesita historia. En `carga_cuotas` no se proyecta: las cuotas del mes ya están fijadas.
Límites conocidos: los primeros días del mes exagera (un cargo grande el día 2 se multiplica por ~15) y trata los cargos
fijos (dividendo, gastos comunes) como si siguieran al mismo ritmo. Por eso la alerta de pronóstico se puede apagar por
presupuesto. Una mejora futura es proyectar solo el gasto variable y sumar los fijos una vez.

### Ingreso de referencia

`perfil.ingreso_mensual_neto` si el usuario lo declaró; si no, el promedio de los últimos 3 meses anteriores con ingresos > 0
en `resumen_mensual`. Como el detectado es poco confiable, el Plan pide el ingreso arriba de todo cuando falta.

### Plan de ajuste

Tabla `finanzas.perfil` (ingreso neto, día de pago, meta de ahorro, tope de carga de cuotas, por defecto 30%) y vistas
`gasto_referencia`, `ingreso_referencia`, `plan_ajuste`, `plan_ajuste_categoria` y `liberacion_cuotas`, para el mes en curso y
el próximo:

```
disponible_variable = ingreso_referencia − compromisos − gastos_fijos − meta_ahorro
restante_variable   = disponible_variable − gasto_variable_mes          (solo mes en curso)
compromisos         = Σ deuda_cuota_mes del mes
gastos_fijos        = promedio 3 meses (vivienda_servicios, seguros, salud, educacion,
                      suscripciones recurrentes, intereses_comisiones_impuestos)
                      − min(dividendo hipotecario del mes, promedio de vivienda_servicios)
```

- Los promedios usan solo compras al contado (`cuotas_total` nulo o 1): las cuotas de compras anteriores ya están en
  `compromisos` y contarlas otra vez inflaría el plan.
- El dividendo es gasto `vivienda_servicios` y también está en `deuda_cuota_mes`; se descuenta una vez de los fijos.
- Suscripción recurrente: mismo comercio de `entretenimiento_suscripciones` en 2 o más de los 3 meses cerrados.
- Se suman `intereses_comisiones_impuestos` a los fijos aunque no estaban en la lista original: salen igual de la cuenta.
- `salud` queda como gasto fijo (no se recorta), aunque se mencionó entre los esenciales.
- Límite por categoría variable: esenciales (`supermercado`, `transporte`, `combustible_auto`) al 90% de su promedio; las
  discrecionales parten del 90% y se escalan en proporción a lo que quede (`disponible − esenciales`), sin bajar de 0. Todo se
  redondea hacia abajo a miles. Si el disponible no cubre ni los esenciales, `alcanza_esenciales = false` y la app muestra
  cuánto falta; las discrecionales quedan en 0.
- Compras nuevas en cuotas sugeridas: 0 si la carga del mes siguiente supera el tope; si no, el margen
  `ingreso × tope − cuotas del mes siguiente`.
- `liberacion_cuotas`: carga por mes futuro y el primer mes desde el cual queda bajo el tope si no hay compras nuevas.
- "Convertir en alertas" crea o actualiza alertas recurrentes por categoría con `limite_alerta` (el sugerido más las cuotas ya
  imputadas en esa categoría este mes y, en entretenimiento, las suscripciones fijas, porque la alerta mide todo el gasto de
  la categoría) y un tope de `compras_credito`.

## Alternativas

- **Presupuesto por sobres (YNAB):** exige asignar cada peso y registrar; no calza con datos automáticos.
- **Pronóstico por estacionalidad o regresión:** más preciso con historia larga, pero opaco y con pocos meses de datos.
- **Calcular en la app:** duplicaría fórmulas entre Supabase y la app y dejaría la lógica fuera de RLS.

## Pendiente: notificaciones

Hoy las alertas se ven al abrir la app (aviso en el Resumen). Para avisar por correo: una función programada (Supabase Edge
Function con cron o la Lambda de publicación al terminar) que lea `estado_presupuesto` con service role, detecte cambios de
estado respecto de una tabla `alerta_enviada (presupuesto_id, mes, estado, enviada_en)` para no repetir, y envíe por un
proveedor transaccional. Requiere preferencias de notificación en `perfil` y consentimiento explícito.

## Riesgos y consecuencias

- `deuda_cuota_mes` debe traer solo cuotas, créditos y dividendo por mes de pago; si la facturación proyectada de una tarjeta
  incluye compras al contado, esas compras se cuentan dos veces en el plan del mes siguiente.
- Un recurrente nuevo se evalúa también sobre los 5 meses anteriores (historia de cómo te habría ido).
- Alertas con límite 0 (discrecionales recortadas por completo) quedan excedidas con la primera compra: es intencional.

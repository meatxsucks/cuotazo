# Contrato de presentación

Tablas que la bodega (Postgres en floci, esquema `presentacion`) produce y que se publican en Supabase
(esquema `finanzas`) para la app web. Los tres frentes (datos, publicación y app) trabajan contra este
contrato; cambiarlo exige actualizar esta nota primero. Montos en CLP enteros con signo (negativo = sale
plata) salvo que se indique; fechas `date`; meses `date` al día 1.

## Flujo

```
extractores (Mac) → fpc-raw/productos/<banco>/ → carga a bodega (stage → dw) → vistas presentacion.*
  → Lambda fpc-publicar-supabase → Supabase finanzas.* (RLS por usuario) → app SvelteKit en Vercel
```

## Tablas

### `usuario`
| columna | tipo | nota |
|---|---|---|
| usuario_id | uuid | id interno (FPC_USUARIO_ID) |
| auth_user_id | uuid | solo en Supabase: `auth.users.id`; se asigna al vincular la cuenta |
| nombre_visible | text | alias, no el nombre legal |

### `movimiento` (grano: un movimiento)
| columna | tipo | nota |
|---|---|---|
| usuario_id | uuid | |
| movimiento_id | text | estable: id del banco si existe, si no hash de banco+producto+fecha+glosa+monto+cuota |
| fecha | date | fecha de la transacción |
| fecha_imputacion | date | mes en que pesa el gasto: compras en cuotas = fecha + (cuota − 1) meses; si no, = fecha. `gasto_diario` y `resumen_mensual` usan esta fecha |
| banco | text | `santander`, `falabella`, `bci` |
| producto_tipo | text | `cuenta`, `tarjeta`, `linea` |
| producto_nombre | text | "Cuenta Corriente", "CMR", "Visa Signature"… sin números completos |
| glosa | text | texto del banco con series de 5 o más dígitos enmascaradas y nombres de personas en transferencias reemplazados por un seudónimo estable (`Persona 3f2a`) |
| comercio | text | nombre normalizado, nulo si no aplica |
| categoria | text | ver catálogo |
| tipo_flujo | text | `ingreso`, `gasto`, `transferencia_interna`, `pago_deuda`, `interes_comision` |
| monto | bigint | con signo |
| monto_total_compra | bigint | compras en cuotas: total de la compra; si no, nulo |
| cuota_actual | int | |
| cuotas_total | int | |
| estado | text | `contable`, `no_facturado`, `facturado`, `pendiente` |

### `gasto_diario` (grano: usuario, fecha, categoría)
usuario_id, fecha, categoria, monto_gasto (positivo), cantidad. Solo `tipo_flujo` in (`gasto`, `interes_comision`).

### `resumen_mensual` (grano: usuario, mes)
usuario_id, mes, ingresos, gastos, pagos_deuda, intereses_comisiones, flujo_neto (= ingresos − gastos − intereses_comisiones),
flujo_proyectado_cierre (mes en curso: gastos e intereses proyectados linealmente; ingresos = máximo entre lo observado y el promedio de los 3 meses cerrados anteriores; en meses cerrados = flujo_neto), alerta_negativo (bool), meses_completos (bool: false si el mes no tiene datos de todas las cuentas del usuario; la alerta solo se muestra si es true).

### `deuda_producto` (grano: un producto de crédito)
usuario_id, banco, tipo (`tarjeta`, `linea`, `consumo`, `hipotecario`), nombre, moneda (`CLP`/`UF`),
cupo_total, usado, disponible, saldo_deuda, valor_cuota, cuotas_pagadas, cuotas_total, fecha_termino,
proximo_vencimiento, pago_minimo, tasa_mensual (%), cae (%), saldo_deuda_clp, más las columnas de facturación de tarjetas
(ver "Caja y tarjetas"). Montos `numeric` (admiten UF con decimales); `saldo_deuda_clp` entero, (UF convertida al valor del día), actualizado (timestamptz).

### `deuda_cuota_mes` (grano: usuario, mes, producto)
usuario_id, mes, banco, tipo, nombre, monto (positivo, CLP). Fuentes: facturación proyectada CMR, `CuotasMes1..4`
de Santander, cuotas futuras de compras en cuotas vigentes, valor cuota de créditos de consumo y dividendo hipotecario (UF→CLP).
El Plan y la carga de cuotas asumen que el mes corresponde al mes de pago y que el monto trae solo cuotas, créditos y dividendo,
no compras al contado ya facturadas (si las trajera, se contarían dos veces; ver [[ADR-006_Alertas_Presupuesto]]).

### `saldo_cuenta` (grano: usuario, banco, cuenta)
usuario_id, banco, producto_nombre, saldo_disponible, actualizado.

### Caja y tarjetas (vista principal del Resumen)

El número principal de la app es **plata real**, no consumo. El ciclo de caja va de sueldo a sueldo: empieza el día de corte
(`dia_corte_sueldo`, 25 por defecto) del mes M y termina el día anterior del mes M+1; se etiqueta con el mes M+1 (el mes que
financia el sueldo).

`deuda_producto` suma columnas para tarjetas: `monto_facturado` (último estado), `fecha_facturacion`, `monto_pagado`
(del último estado), `monto_por_facturar` (compras del período en curso), `fecha_proxima_facturacion`. `proximo_vencimiento`
es la fecha de pago y `pago_minimo` el mínimo.

#### `caja_ciclo` (grano: usuario, ciclo, grupo)
usuario_id, ciclo (date, día 1 del mes que financia), ciclo_inicio, ciclo_fin, grupo, entradas (bigint ≥ 0), salidas (bigint ≥ 0),
cantidad, financiado_con_linea (bool), monto_financiado_linea (bigint ≥ 0). Solo movimientos de cuentas (`producto_tipo = 'cuenta'`)
con `fecha` real entre inicio y fin. Grupos:
`sueldo`, `otros_ingresos`, `vivienda_servicios`, `pago_tarjetas`, `pago_creditos` (consumo, línea, hipotecario si se paga
aparte), `transferencias_personas`, `traspasos_propios` (netos: solo entradas o solo salidas según el signo de la suma; incluye
giros de la línea de crédito hacia la cuenta), `gasto_debito` (compras con débito y cargos varios), `intereses_comisiones`,
`sin_categoria`. Un pago de tarjeta queda `financiado_con_linea` si hay un giro de la línea a una cuenta propia a ±3 días;
`monto_financiado_linea` = mínimo entre el pago y la suma de esos giros ([[ADR-007_Caja_Por_Ciclo]]).

#### `caja_resumen` (grano: usuario, ciclo)
usuario_id, ciclo, ciclo_inicio, ciclo_fin, entradas, salidas, neto (= suma de `caja_ciclo` del ciclo), saldo_hoy (suma de
`saldo_cuenta`, solo el ciclo en curso), comprometido_proximo (lo ya conocido por pagar: facturado de tarjetas menos lo pagado +
cuota del mes de créditos + dividendo, desde `deuda_producto` y `deuda_cuota_mes`), comprometido_antes_sueldo (la parte que vence
antes de `proximo_sueldo`), disponible_para_vivir (= saldo_hoy − comprometido_antes_sueldo; puede ser negativo), proximo_sueldo
(fecha estimada: último sueldo + 1 mes), datos_completos (bool: todas las cuentas con movimientos cubren el ciclo hasta hoy),
financiado_con_linea, monto_financiado_linea. Saldo, compromisos, disponible y próximo sueldo solo vienen en el ciclo en curso;
en los demás son nulos. Hay una fila por ciclo desde el primer movimiento de cuenta, aunque no tenga movimientos.

#### Tablas editables de caja (solo Supabase; las edita el usuario, la Lambda no las toca)
Todas con `usuario_id` por defecto `finanzas.mi_usuario_id()` y RLS de lectura y escritura por dueño.

- `pago_fijo`: pago_fijo_id (uuid), nombre, categoria, monto (> 0), dia_vencimiento (1–31, ajustado al último día del mes),
  desde, hasta (vigencia opcional), meses_pausa (int[] de 1 a 12: meses sin pago, p. ej. `{1,2}`), activo, actualizado.
- `deuda_manual` (deudas que ningún extractor trae): deuda_manual_id, nombre, acreedor, tipo (`tarjeta`, `consumo`,
  `automotriz`, `educacion`, `otro`), saldo, tasa_mensual (%), cuota_minima, cuota_fija, cuotas_restantes, dia_pago,
  proximo_pago, activo, actualizado.
- `sobre`: sobre_id, nombre, categoria (opcional), monto (> 0), periodo (`semana` lunes–domingo o `mes`), esencial, orden,
  activo, actualizado.
- `anotacion`: anotacion_id, sobre_id (se anula si se borra el sobre; solo sobres propios), fecha (timestamptz, por defecto
  ahora), monto (> 0), nota (≤ 140), medio (`debito`, `credito`, `efectivo`, `otro`), movimiento_id (vínculo opcional al
  movimiento del banco), creado. Índice (usuario_id, fecha desc).
- `pago_marcado`: ciclo, clave (la de `pagos_ciclo`), pagado (bool), actualizado. Clave (usuario_id, ciclo, clave). Marca
  manual de un pago del ciclo; borrarla vuelve a la detección automática.
- `compra` (carro): compra_id, sobre_id (obligatorio, solo sobres propios), lugar (≤ 60), abierta, anotacion_id (la que crea
  `finanzas.cerrar_compra(compra, medio)` al terminar), creada, cerrada.
- `compra_item`: item_id, compra_id (solo compras propias), nombre (≤ 60), cantidad (> 0, dos decimales), precio (≥ 0), creado.
- `anotacion` y `compra` guardan además `creado_por` (quién del hogar la hizo).
- `conciliacion` (publicada desde `presentacion.conciliacion`): ambito (`carga`, `tarjeta`, `caja`), sujeto, detalle, cuadra
  (nulo = no evaluable), revisado.
- `solicitud_actualizacion`: origen (`app`, `programada`), estado, pasos (jsonb paso → estado), detalle, creada, iniciada,
  terminada. Se crea con `pedir_actualizacion()`; la escribe el agente del equipo.
- `foto_balance`: fecha, activos, pasivos, detalle (jsonb de partidas); la escribe `tomar_foto_balance()`.
- Vistas: `balance_actual`, `resultado_mensual`, `libro` (saldo corrido en cuentas) y `conciliacion_saldos`
  ([[ADR-011_Actualizacion_Y_Contabilidad]]).
- Hogar ([[ADR-010_Hogar_Compartido]]): `hogar` (titular_id único), `miembro_hogar` (usuario_id único), `invitacion_hogar`
  (email en minúsculas) sin acceso directo: se usan por `mi_hogar()`, `invitar_hogar(email)`, `cancelar_invitacion(email)`,
  `quitar_miembro(usuario)` y `aceptar_invitacion()`. `producto_compartido` (usuario_id, banco, producto_nombre): lo edita
  el dueño.

### `publicacion` (solo Supabase; la escribe la Lambda)
usuario_id, tabla, publicado_en (timestamptz), filas. Clave (usuario_id, tabla). La app muestra "actualizado a las…".

### `presupuesto` (solo Supabase; lo edita el usuario en la app)
Alertas de presupuesto ([[ADR-006_Alertas_Presupuesto]]). RLS de lectura y escritura por dueño.

| columna | tipo | nota |
|---|---|---|
| presupuesto_id | uuid | clave, `gen_random_uuid()` |
| usuario_id | uuid | por defecto `finanzas.mi_usuario_id()` |
| tipo | text | `categoria`, `total`, `compras_credito`, `carga_cuotas` (por defecto `categoria`) |
| categoria | text | obligatoria solo si tipo = `categoria`; nula en los demás |
| mes | date | nulo = recurrente (todos los meses); con mes, solo ese mes y con prioridad sobre el recurrente |
| monto_limite | bigint | CLP ≥ 0; obligatorio salvo en `carga_cuotas` (ahí nulo) |
| porcentaje_limite | numeric(5,2) | solo `carga_cuotas`: % máximo del ingreso (0–100] |
| umbrales | int[] | por defecto `{80,100}`; 1 a 5 valores entre 1 y 200 |
| alerta_pronostico | boolean | por defecto true: avisa si la proyección al cierre supera el límite |

Únicos parciales: (usuario, tipo, categoría, mes) cuando hay mes y (usuario, tipo, categoría) cuando es recurrente.

### `perfil` (solo Supabase; lo edita el usuario en la app)
usuario_id (clave, por defecto `mi_usuario_id()`), ingreso_mensual_neto (bigint, nulo = usar el detectado), dia_pago (1–31),
meta_ahorro_mensual (bigint, por defecto 0), tope_carga_cuotas_pct (int 1–100, por defecto 30), actualizado (timestamptz).
RLS de lectura y escritura por dueño.

## Vistas (solo Supabase, `security_invoker = true`, lectura `authenticated`)

Calculan sobre las tablas publicadas, así que respetan RLS: cada usuario ve solo lo suyo. "Hoy" es la fecha de
`America/Santiago` (`finanzas.hoy_chile()`). Ingreso de referencia = `perfil.ingreso_mensual_neto` o, si falta, el promedio
de los últimos 3 meses anteriores con `resumen_mensual.ingresos > 0`.

- `credito_mes` (usuario, mes; mes en curso y 5 anteriores): compras_cuotas_monto y compras_cuotas_cantidad (movimientos de
  tarjeta, `gasto`, `cuotas_total > 1` con `cuota_actual = 1` imputada en el mes o sin cuota actual y fecha de compra en el mes;
  suma `monto_total_compra` o el monto), cuotas_mes (`deuda_cuota_mes`), ingreso_referencia, carga_porcentaje.
- `estado_presupuesto` (presupuesto, mes; mes en curso y 5 anteriores): presupuesto_id, tipo, categoria, mes, recurrente,
  limite (CLP o %), consumido (categoría y total desde `gasto_diario`; compras y carga desde `credito_mes`), porcentaje,
  proyectado_cierre (solo mes en curso: lineal `consumido × días del mes ÷ día de hoy`; en carga = consumido),
  umbral_cruzado (mayor umbral ≤ porcentaje), excede_pronostico, estado (`excedido` si consumido ≥ límite, si no `aviso` si
  cruzó un umbral, si no `pronostico_excede`, si no `ok`), más umbrales, alerta_pronostico, monto_limite, porcentaje_limite,
  cantidad, cuotas_mes, ingreso_referencia.
- `presupuesto_sugerido`: por categoría y para `total`, promedio de `gasto_diario` de los últimos 3 meses cerrados con datos,
  redondeado a miles; `compras_credito` con el promedio de `credito_mes`; `carga_cuotas` con la carga actual redondeada.
- `ingreso_referencia` (usuario): ingreso_declarado, ingreso_detectado, ingreso_referencia, meta_ahorro_mensual,
  tope_carga_cuotas_pct, dia_pago.
- `gasto_referencia` (usuario, grupo): promedio de 3 meses cerrados y gastado del mes en curso de compras al contado
  (`gasto` e `interes_comision` con `cuotas_total` nulo o 1), por categoría; `entretenimiento_suscripciones` se separa en
  `suscripciones_recurrentes` (mismo comercio en 2 o más de los 3 meses) y el resto.
- `plan_ajuste` (usuario, mes; mes en curso y próximo): ingreso_referencia, compromisos (`deuda_cuota_mes`), gastos_fijos,
  meta_ahorro, disponible_variable, gasto_variable_mes, restante_variable, esenciales_objetivo, alcanza_esenciales,
  carga_mes_siguiente_pct, compras_credito_sugerido. Fórmula en [[ADR-006_Alertas_Presupuesto]].
- `plan_ajuste_categoria` (usuario, mes, categoría variable): promedio, gastado_mes, limite_sugerido, recorte, recorte_pct,
  comprometido (cuotas ya imputadas en la categoría este mes y, en entretenimiento, suscripciones fijas) y
  limite_alerta = limite_sugerido + comprometido.
- `pagos_ciclo` (usuario, ciclo en curso y siguiente, clave): pagos del ciclo 25 → 24 con origen `pago_fijo`,
  `deuda_manual`, `tarjeta`, `dividendo` y `credito`. Columnas: ciclo, ciclo_inicio, ciclo_fin, en_curso, clave, origen,
  nombre, acreedor, fecha, monto, monto_minimo, pagado_banco, automatico, estimado, marcado, estado (`pagado`, `minimo`,
  `pendiente`), por_pagar, por_pagar_minimo y comprometido (lo que sale de la caja del ciclo). Reglas en [[ADR-009_Mes_Y_Carro]].
- `lo_que_viene` (usuario, compromiso; ciclo en curso): lo que falta pagar según `pagos_ciclo` (por_pagar > 0). Columnas:
  ciclo, origen, nombre, acreedor, fecha, monto (= por_pagar) y monto_minimo (= por_pagar_minimo), proximo_sueldo, saldo_hoy,
  total_comprometido y disponible_para_vivir_ajustado (= saldo_hoy − total_comprometido). Sin pendientes no hay filas: usar
  `caja_resumen.disponible_para_vivir`.
- `deudas_todas`: `deuda_producto` sin hipotecario (origen `banco`, acreedor = banco) unida a `deuda_manual` activa (origen
  `manual`): usuario_id, origen, nombre, acreedor, tipo, saldo_clp, tasa_mensual, cuota_minima (pago mínimo en tarjetas, cuota
  en créditos CLP), proximo_pago.
- `estado_sobre` (sobre activo, período en curso: semana lunes–domingo o ciclo de sueldo en curso): nombre, categoria,
  periodo, esencial, orden, monto, inicio, fin, anotado, disponible (= monto − anotado), porcentaje, dias_restantes (incluye
  hoy) y sin_anotar (gasto real de la categoría del sobre en el período por fecha de compra, total de la compra si es en
  cuotas, sin anotación vinculada por `movimiento_id` ni pagos fijos, menos lo anotado con débito o crédito; 0 si el sobre
  no tiene categoría).
- `liberacion_cuotas` (usuario, mes desde el en curso hasta el último de `deuda_cuota_mes`, meses sin cuotas en 0):
  compromisos, carga_pct, bajo_tope y mes_bajo_tope (primer mes desde el cual la carga queda ≤ tope si no hay compras nuevas;
  nulo si no ocurre en el horizonte).

## Criterios de flujo
- Dividendo hipotecario: `gasto`, categoría `vivienda_servicios` (es costo de vivienda del mes).
- Cuotas de crédito de consumo y pagos de línea: `pago_deuda`, categoría `pago_credito`. Pagos de tarjeta: `pago_deuda`, categoría `pago_tarjeta_credito`.
- Abonos dentro de la tarjeta: `transferencia_interna` / `pago_tarjeta_credito`.

## Catálogo de categorías
`supermercado`, `restaurantes_delivery`, `transporte`, `combustible_auto`, `salud`, `educacion`, `vivienda_servicios`,
`hogar`, `vestuario`, `entretenimiento_suscripciones`, `viajes`, `tecnologia`, `mascotas`, `seguros`,
`intereses_comisiones_impuestos`, `transferencias_personas`, `transferencia_interna`, `pago_tarjeta_credito`, `pago_credito`, `ingresos_sueldo`, `ingresos_otros`, `sin_categoria`.

## Claves de grano y validación

| Tabla | Clave única |
|---|---|
| usuario | usuario_id (la vista `presentacion.usuario` expone `usuario_id, nombre_visible`) |
| movimiento | usuario_id, movimiento_id |
| gasto_diario | usuario_id, fecha, categoria |
| resumen_mensual | usuario_id, mes |
| deuda_producto | usuario_id, banco, tipo, nombre |
| deuda_cuota_mes | usuario_id, mes, banco, tipo, nombre |
| saldo_cuenta | usuario_id, banco, producto_nombre |
| presupuesto | presupuesto_id (únicos parciales por usuario, tipo, categoría y mes) |
| perfil | usuario_id |
| caja_ciclo | usuario_id, ciclo, grupo |
| caja_resumen | usuario_id, ciclo |
| pago_fijo, deuda_manual, sobre, anotacion, compra, compra_item | su uuid propio |
| pago_marcado | usuario_id, ciclo, clave |
| producto_compartido | usuario_id, banco, producto_nombre |
| conciliacion | usuario_id, ambito, sujeto |
| foto_balance | usuario_id, fecha |
| solicitud_actualizacion | solicitud_id (una activa por usuario) |
| hogar / miembro_hogar / invitacion_hogar | hogar_id / usuario_id / hogar_id, email |

Supabase valida categorías y valores de `tipo_flujo`, `producto_tipo`, `estado`, `tipo` y `moneda` con checks: un valor fuera
del catálogo hace fallar la publicación de ese usuario (su transacción se revierte y quedan los datos anteriores).

## Reglas de seguridad
- Supabase: RLS en todas las tablas; `usuario_id` resuelto desde `auth.uid()` vía `finanzas.usuario.auth_user_id`.
- La Lambda publica con la service key, que vive en Secrets Manager de floci (`fpc/supabase`), nunca en el repo.
- No se publica: RUT, números de cuenta o tarjeta completos, nombres legales, link tokens ni credenciales.

# ADR-009 — Pantalla Mes y carro de compras

**Estado:** aceptada · **Fecha:** 2026-09-30 · **Reemplaza:** [[ADR-008_Salir_De_Deudas]] y las pantallas de
[[ADR-006_Alertas_Presupuesto]]

## Contexto

Con uso real, Presupuestos, Plan y Salir de deudas no respondían las preguntas del día a día:

- Plan mostraba lo que "queda" por mes calendario (sueldo teórico − cuotas − promedio de fijos), una cifra que no calza
  con la plata que hay en la cuenta.
- Presupuestos proyectaba al mes siguiente y solo tenía sentido a fin de mes.
- El simulador de salida de deudas no llevaba a una acción concreta.
- Lo que sí se usa: saber qué pagos faltan este mes, cuánto queda en cada sobre y un balance simple
  (entra / sale / queda), al estilo de un reporte mensual de una línea por concepto.

## Decisión

Una pantalla **Mes** por ciclo de sueldo (25 → 24, [[ADR-007_Caja_Por_Ciclo]]), con pestañas *Este mes* y *Próximo*:

1. **Balance**: sueldo del ciclo (real si ya entró, si no el declarado) − pagos del mes − sobres = queda o falta, con % del
   ingreso. En el ciclo en curso agrega el cierre estimado: saldo de hoy − lo que falta pagar − lo que falta de los sobres.
2. **Qué hacer con la plata de hoy** (solo ciclo en curso, reglas fijas en `web/src/lib/mes.ts`): cuentas y cuotas
   pendientes → mínimos de tarjetas y créditos → lo que falta de los sobres esenciales → lo que sobre, al resto del estado de
   la tarjeta que vence. Cada paso dice si alcanza con el saldo de hoy.
3. **Pagos** desde la vista `pagos_ciclo`: pagos fijos, deudas anotadas, estados de tarjeta y cuotas de créditos del ciclo.
   - Tarjetas y créditos se detectan con los movimientos del banco: pago de tarjeta posterior a la facturación; dividendo
     por glosa; crédito de consumo por categoría `pago_credito`.
   - Pagos fijos y deudas anotadas se marcan a mano (`pago_marcado`); la marca manda sobre la detección y se puede deshacer.
   - Estados: `pagado`, `minimo` (mínimo cubierto; si ya venció, el resto pasa al próximo estado y deja de contar como
     pendiente) y `pendiente`.
   - El próximo ciclo estima las tarjetas como cuotas de ese mes (`deuda_cuota_mes`) + compras al contado sin facturar + lo
     que quedó sin pagar de un estado ya vencido. `monto_por_facturar` del portal no se usa: no es confiable entre bancos.
4. **Sobres** del ciclo: gasto = anotado + gasto del banco en la categoría sin anotar (una anotación con débito o crédito
   descuenta el cargo del banco para no contarlo dos veces). El sobre mensual ahora va por ciclo, no por mes calendario.

`lo_que_viene` pasa a ser lo pendiente del ciclo en curso según `pagos_ciclo`; ya no supone pagado lo que vence hoy.

**Carro**: una compra abierta por vez, con lugar, sobre y productos (nombre, cantidad, precio). Muestra el total contra lo
que queda en el sobre. Al terminar, `finanzas.cerrar_compra` crea la anotación del sobre en la misma transacción. Los
productos anteriores se sugieren con su último precio.

**Deudas anotadas y límite por tarjeta** se mueven a `/deudas/anotadas`. `/plan`, `/presupuestos` y `/salir-de-deudas`
redirigen. Las vistas `plan_ajuste*`, `estado_presupuesto` y `liberacion_cuotas` siguen en la base, pero sin pantalla propia.

## Consecuencias

- Un solo lugar para "cuánto me queda por pagar y cómo cierro el mes", con cifras que calzan con la cuenta.
- Marcar pagos fijos es manual hasta tener extractor de cuentas de servicios (backlog).
- La estimación de tarjetas del próximo ciclo es aproximada y se muestra como *estimado*.

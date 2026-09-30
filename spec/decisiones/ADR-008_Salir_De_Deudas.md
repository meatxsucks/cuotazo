# ADR-008 — Salir de deudas: simulador, escenarios y reglas fijas

**Estado:** reemplazada por [[ADR-009_Mes_Y_Carro]] · **Fecha:** 2026-09-30

## Contexto

El caso de uso es un sueldo fijo a fin de mes que no alcanza: el gasto supera el ingreso, una tarjeta se paga completa, otra al
mínimo, y la diferencia se tapa girando de la línea de crédito. Hay deudas que no llegan desde los bancos conectados (casas
comerciales, crédito automotriz, crédito universitario, avances), pagos fijos que se pausan en vacaciones y gastos esenciales
(supermercado, bencina, salud, actividades de los hijos). Se necesita ayuda concreta para bajar deudas, con reglas y cálculos
que se puedan explicar en una línea, sin modelos opacos.

## Decisión

### Monto para deudas

```
monto_para_deudas = sueldo − pagos fijos vigentes del mes − cuotas fijas − sobres esenciales (− dividendo hipotecario)
presupuesto_simulador = monto_para_deudas (editable) + cuotas fijas
```

- Sueldo: `perfil.ingreso_mensual_neto` o, si falta, el ingreso de referencia de [[ADR-006_Alertas_Presupuesto]].
- Pagos fijos vigentes: activos, con `desde` ≤ mes ≤ `hasta` y sin el mes en `meses_pausa`.
- Cuotas fijas: créditos del plan con cuota fija cuyo primer pago cae en el próximo ciclo; los que empiezan después no se
  descuentan hoy y, cuando empiezan, su cuota sale del mismo presupuesto (así se ve el efecto de un crédito que parte más adelante).
- Sobres esenciales: suma mensual de los sobres activos marcados esenciales (semana × 52/12).
- El monto es editable: el usuario puede restar respiros o imprevistos.

### Simulador (`web/src/lib/deudas/simulador.ts`, función pura con pruebas Vitest)

Mes a mes, con el mes 0 = el próximo pago:

1. Cargos del mes (escenario de línea) se suman al saldo.
2. Interés: `saldo × tasa_mensual / 100` a cada deuda activa (una deuda con `inicio` futuro no cobra ni paga antes).
3. Mínimos y cuotas de todas las deudas activas. La última cuota de un crédito en cuotas salda lo que quede.
4. Excedente = presupuesto − mínimos. Va completo a una sola deuda objetivo; si la salda, lo que sobra pasa a la siguiente en el
   mismo mes. Avalancha: mayor tasa primero (desempate por saldo menor). Bola de nieve: menor saldo primero (desempate por tasa).
5. Si el presupuesto no alcanza los mínimos, se pagan igual y se informa el `faltante` (lo que hoy termina en la línea).

Resultados: mes en que queda libre cada deuda y el total, intereses totales, pago de este mes por deuda ("a quién y cuánto")
y comparación con pagar solo mínimos (`estrategia = 'minimos'`). Horizonte de 600 meses; si no termina, se muestra "Nunca".

Supuestos de entrada (`web/src/lib/deudas/salir.ts`):

- Se simulan `deudas_todas` menos el hipotecario (tasa baja y plazo largo; su dividendo se descuenta como gasto fijo).
- Tarjeta sin mínimo informado: 5% del saldo. Línea sin mínimo: paga al menos su interés del mes.
- El mínimo es fijo durante toda la simulación (en la realidad baja con el saldo): es conservador para "solo mínimos".
- Tasa desconocida: se pide en pantalla; mientras falte se simula al 0% y se avisa.
- `inicio` de una deuda: meses entre el mes actual y el de su `proximo_pago`, menos uno.

### Escenarios "¿qué pasa si?"

Cada uno se compara con el plan elegido (mismo monto y estrategia) y muestra meses e intereses de diferencia:

- **Portabilidad:** junta las deudas activas con tasa mayor a la nueva (1,7% mensual por defecto, editable) en un crédito francés al
  plazo indicado (36 meses por defecto).
- **Ingreso extra mensual:** se suma al presupuesto todos los meses.
- **Seguir tapando con la línea:** se suma cada mes el giro detectado (`monto_tarjeta_con_linea` del ciclo) al saldo de la línea.
- **Pausas de enero y febrero hacia deudas:** en los meses pausados, el monto de esos pagos fijos se suma al presupuesto.
- **Compra nueva en cuotas:** crédito francés a la tasa de la tarjeta más cara, sin abonos extra; se informa el atraso.

No hay escenario de "nuevo sueldo": el plan parte del ingreso real.

### Reglas fijas visibles

1. No pagar deudas baratas con crédito caro.
2. No pagar una tarjeta con la línea (se marca si `caja_resumen` detectó el giro en los últimos ciclos).
3. Bajar el cupo de la tarjeta que más se usa (mayor % de cupo usado).
4. Congelar compras en cuotas mientras la carga de cuotas supere el tope del perfil.

### Límite de uso por tarjeta

Reutiliza `finanzas.presupuesto` con `tipo = 'tope_tarjeta'` y `categoria = 'banco|nombre de la tarjeta'`, recurrente. El uso del mes
se calcula en la app: compras de la tarjeta imputadas en el mes, contando las compras en cuotas por su total en la cuota 1. Estos
presupuestos no se muestran en la pantalla de alertas. Si la base aún no acepta el tipo, la app lo informa sin romperse.

### Sobres y anotador

`/anotar` registra compras en el momento contra sobres semanales o mensuales. `estado_sobre` (o su réplica en
`web/src/lib/deudas/presupuesto.ts`) da anotado, disponible y `sin_anotar`: gasto de la categoría del sobre en los bancos que no
se anotó con débito o crédito. Los sobres esenciales alimentan el monto para deudas.

## Alternativas

- **Recomendaciones por modelos entrenados:** descartado; el usuario pidió reglas transparentes y no hay datos para validarlas.
- **Mínimo proporcional al saldo:** más realista, pero depende de reglas distintas por emisor; se prefirió un mínimo fijo explicable.
- **Calcular el simulador en la base:** las simulaciones son interactivas (tasa, monto, escenarios); en la app responden al instante.

## Riesgos y consecuencias

- Los resultados son una guía: la tasa efectiva, seguros y comisiones de cada producto cambian los números.
- Una deuda con tasa desconocida aparece más barata de lo que es hasta que se completa.
- El escenario de línea supone que el giro se repite igual cada mes.

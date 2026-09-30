INSERT INTO dw.dim_usuario (usuario_id)
SELECT DISTINCT usuario_id FROM stage.corrida
ON CONFLICT (usuario_id) DO NOTHING;

MERGE INTO dw.dim_producto d
USING (
    SELECT DISTINCT ON (usuario_id, producto_id) usuario_id, producto_id, banco, producto_tipo, nombre, terminacion, moneda
    FROM stage.producto
    ORDER BY usuario_id, producto_id, corrida DESC
) s ON d.usuario_id = s.usuario_id AND d.producto_id = s.producto_id
WHEN MATCHED AND (d.nombre IS DISTINCT FROM s.nombre OR d.terminacion IS DISTINCT FROM s.terminacion
                  OR d.moneda IS DISTINCT FROM s.moneda OR d.producto_tipo IS DISTINCT FROM s.producto_tipo) THEN
    UPDATE SET nombre = s.nombre, terminacion = s.terminacion, moneda = s.moneda, producto_tipo = s.producto_tipo, actualizado = now()
WHEN NOT MATCHED THEN
    INSERT (usuario_id, producto_id, banco, producto_tipo, nombre, terminacion, moneda)
    VALUES (s.usuario_id, s.producto_id, s.banco, s.producto_tipo, s.nombre, s.terminacion, s.moneda);

UPDATE stage.movimiento SET duplicado = FALSE WHERE duplicado;

UPDATE stage.movimiento s
SET duplicado = TRUE
WHERE s.estado IN ('no_facturado', 'pendiente')
  AND (
      EXISTS (
          SELECT 1
          FROM stage.movimiento o
          WHERE o.usuario_id = s.usuario_id
            AND o.producto_id = s.producto_id
            AND o.fecha = s.fecha
            AND abs(o.monto) = abs(s.monto)
            AND CASE WHEN coalesce(o.cuotas_total, 1) <= 1 THEN 1 ELSE coalesce(o.cuota_actual, 1) END
              = CASE WHEN coalesce(s.cuotas_total, 1) <= 1 THEN 1 ELSE coalesce(s.cuota_actual, 1) END
            AND CASE o.estado WHEN 'pendiente' THEN 1 WHEN 'no_facturado' THEN 2 ELSE 3 END
              > CASE s.estado WHEN 'pendiente' THEN 1 WHEN 'no_facturado' THEN 2 ELSE 3 END
      )
      OR EXISTS (
          SELECT 1
          FROM dw.fact_movimiento o
          WHERE o.usuario_id = s.usuario_id
            AND o.producto_id = s.producto_id
            AND o.movimiento_id <> s.movimiento_id
            AND o.estado = 'facturado'
            AND o.fecha = s.fecha
            AND abs(o.monto) = abs(s.monto)
            AND CASE WHEN coalesce(o.cuotas_total, 1) <= 1 THEN 1 ELSE coalesce(o.cuota_actual, 1) END
              = CASE WHEN coalesce(s.cuotas_total, 1) <= 1 THEN 1 ELSE coalesce(s.cuota_actual, 1) END
      )
  );

DELETE FROM dw.fact_movimiento f
USING (SELECT DISTINCT usuario_id, banco FROM stage.corrida) c
WHERE f.usuario_id = c.usuario_id
  AND f.banco = c.banco
  AND f.estado IN ('no_facturado', 'pendiente');

MERGE INTO dw.fact_movimiento d
USING (SELECT * FROM stage.movimiento WHERE NOT duplicado) s
ON d.usuario_id = s.usuario_id AND d.movimiento_id = s.movimiento_id
WHEN MATCHED THEN
    UPDATE SET producto_id = s.producto_id, fecha = s.fecha, fecha_imputacion = s.fecha_imputacion, glosa = s.glosa,
               glosa_norm = s.glosa_norm, glosa_publica = s.glosa_publica, comercio = s.comercio, monto = s.monto, monto_total_compra = s.monto_total_compra,
               cuota_actual = s.cuota_actual, cuotas_total = s.cuotas_total, estado = s.estado, tipo_origen = s.tipo_origen,
               periodo = coalesce(s.periodo, d.periodo), corrida = s.corrida, cargado = now()
WHEN NOT MATCHED THEN
    INSERT (usuario_id, movimiento_id, producto_id, banco, fecha, fecha_imputacion, glosa, glosa_norm, glosa_publica, comercio, monto,
            monto_total_compra, cuota_actual, cuotas_total, estado, tipo_origen, periodo, corrida)
    VALUES (s.usuario_id, s.movimiento_id, s.producto_id, s.banco, s.fecha, s.fecha_imputacion, s.glosa, s.glosa_norm,
            s.glosa_publica, s.comercio, s.monto, s.monto_total_compra, s.cuota_actual, s.cuotas_total, s.estado, s.tipo_origen, s.periodo, s.corrida);

MERGE INTO dw.fact_estado_tarjeta d
USING stage.estado_tarjeta s
ON d.usuario_id = s.usuario_id AND d.producto_id = s.producto_id AND d.fecha_facturacion = s.fecha_facturacion
WHEN MATCHED THEN
    UPDATE SET fecha_vencimiento = s.fecha_vencimiento, saldo_anterior = s.saldo_anterior, monto_facturado = s.monto_facturado,
               pago_minimo = s.pago_minimo, cuadra = s.cuadra, corrida = s.corrida
WHEN NOT MATCHED THEN
    INSERT (usuario_id, producto_id, fecha_facturacion, fecha_vencimiento, saldo_anterior, monto_facturado, pago_minimo, cuadra, corrida)
    VALUES (s.usuario_id, s.producto_id, s.fecha_facturacion, s.fecha_vencimiento, s.saldo_anterior, s.monto_facturado,
            s.pago_minimo, s.cuadra, s.corrida);

DELETE FROM dw.fact_deuda_producto f
USING (SELECT DISTINCT usuario_id, banco FROM stage.corrida) c
WHERE f.usuario_id = c.usuario_id AND f.banco = c.banco;

INSERT INTO dw.fact_deuda_producto (usuario_id, producto_id, banco, tipo, nombre, moneda, cupo_total, usado, disponible,
                                    saldo_deuda, valor_cuota, cuotas_pagadas, cuotas_total, fecha_termino,
                                    proximo_vencimiento, pago_minimo, tasa_mensual, cae, actualizado, corrida, monto_facturado,
                                    fecha_facturacion, monto_pagado, monto_por_facturar, fecha_proxima_facturacion)
SELECT usuario_id, producto_id, banco, tipo, nombre, moneda, cupo_total, usado, disponible, saldo_deuda, valor_cuota,
       cuotas_pagadas, cuotas_total, fecha_termino, proximo_vencimiento, pago_minimo, tasa_mensual, cae, actualizado, corrida,
       monto_facturado, fecha_facturacion, monto_pagado, monto_por_facturar, fecha_proxima_facturacion
FROM stage.deuda;

DELETE FROM dw.fact_cuota_mes f
USING dw.dim_producto p, (SELECT DISTINCT usuario_id, banco FROM stage.corrida) c
WHERE f.usuario_id = p.usuario_id AND f.producto_id = p.producto_id
  AND p.usuario_id = c.usuario_id AND p.banco = c.banco;

INSERT INTO dw.fact_cuota_mes (usuario_id, producto_id, mes, fuente, moneda, monto, corrida)
SELECT usuario_id, producto_id, mes, fuente, moneda, monto, corrida
FROM stage.cuota_mes;

MERGE INTO dw.fact_saldo d
USING stage.saldo s
ON d.usuario_id = s.usuario_id AND d.producto_id = s.producto_id AND d.fecha = s.fecha
WHEN MATCHED THEN
    UPDATE SET saldo_disponible = s.saldo_disponible, saldo_contable = s.saldo_contable, actualizado = s.actualizado, corrida = s.corrida
WHEN NOT MATCHED THEN
    INSERT (usuario_id, producto_id, fecha, saldo_disponible, saldo_contable, actualizado, corrida)
    VALUES (s.usuario_id, s.producto_id, s.fecha, s.saldo_disponible, s.saldo_contable, s.actualizado, s.corrida);

MERGE INTO dw.carga_corrida d
USING (
    SELECT c.usuario_id, c.banco, c.corrida, c.fecha_carga, c.extraido, c.movimientos_raw, c.descartados,
           (SELECT count(*) FROM stage.movimiento m
            WHERE m.usuario_id = c.usuario_id AND m.banco = c.banco AND m.duplicado) AS duplicados
    FROM stage.corrida c
) s ON d.usuario_id = s.usuario_id AND d.banco = s.banco AND d.corrida = s.corrida
WHEN MATCHED THEN
    UPDATE SET movimientos_raw = s.movimientos_raw, descartados = s.descartados, duplicados = s.duplicados, cargado = now()
WHEN NOT MATCHED THEN
    INSERT (usuario_id, banco, corrida, fecha_carga, extraido, movimientos_raw, descartados, duplicados)
    VALUES (s.usuario_id, s.banco, s.corrida, s.fecha_carga, s.extraido, s.movimientos_raw, s.descartados, s.duplicados)

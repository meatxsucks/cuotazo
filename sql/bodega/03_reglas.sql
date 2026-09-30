INSERT INTO dw.regla_categoria (codigo, patron, banco, producto_tipo, signo, categoria, tipo_flujo, prioridad) VALUES
    ('pago_tarjeta_desde_cuenta', 'PAGO (DE )?(TARJETA|TC|TDC|CMR)|TRANSF.* PAGO (DE )?(TARJETA|TC|CMR)|PAGO AUTOM.* (TARJETA|TC)', NULL, 'cuenta', -1, 'pago_tarjeta_credito', 'pago_deuda', 10),
    ('pago_linea_desde_cuenta', 'LINEA DE CREDITO|AMORTIZACION.* LCA|PAGO.* LCA|AMORTIZACION PERIODICA', NULL, 'cuenta', -1, 'pago_credito', 'pago_deuda', 10),
    ('pago_credito_consumo', 'PAGO (CUOTA )?CREDITO (DE )?CONSUMO|PAGO CUOTA PRESTAMO|PAGO PRESTAMO', NULL, 'cuenta', -1, 'pago_credito', 'pago_deuda', 10),
    ('dividendo_hipotecario', 'HIPOTEC|DIVIDENDO', NULL, 'cuenta', -1, 'vivienda_servicios', 'gasto', 10),
    ('traspaso_propio', '^TRASPASO (CON|DE|A) (LA )?(CTA|CUENTA)|^TRASPASO ENTRE CUENTAS|TRANSFERENCIA ENTRE CUENTAS|ALCANCIA|AVANCE', NULL, 'cuenta', NULL, 'transferencia_interna', 'transferencia_interna', 12),
    ('abono_en_tarjeta', '^(PAGO|ABONO|MONTO CANCELADO)', NULL, 'tarjeta', 1, 'pago_tarjeta_credito', 'transferencia_interna', 10),
    ('sueldo', 'REMUNERACION|SUELDO|AGUINALDO|PAGO NOMINA|LIQUIDACION SUELDO|ANTICIPO SUELDO', NULL, 'cuenta', 1, 'ingresos_sueldo', 'ingreso', 10),
    ('comision_banco', '^COM\.|COMISION|MANTENCION (PLAN|CUENTA)|CARGO (FIJO|ANUAL)|INTERES(ES)? (LINEA|SOBREGIRO|MORA)|IMPUESTO|^ITF|TIMBRES', NULL, 'cuenta', -1, 'intereses_comisiones_impuestos', 'interes_comision', 15),
    ('impuestos_tgr', 'T\.?G\.?R|TESORERIA', NULL, NULL, -1, 'intereses_comisiones_impuestos', 'gasto', 20),
    ('seguros', 'SEGURO|^PAC SEG|SEG\. |SEG AUTO|DESGRAVAMEN|METLIFE|CONSORCIO SEG|BCI SEGUROS|\mHDI\M|MAPFRE|\mSURA\M', NULL, NULL, -1, 'seguros', 'gasto', 20),
    ('servicios_basicos', '\mENEL\M|\mCGE\M|CHILQUINTA|AGUAS ANDINAS|AGUAS |ESSBIO|METROGAS|ABASTIBLE|LIPIGAS|GASCO|SERVIPAG|SOC DE RECAUDACION|CONDOMINIO|GASTOS? COMUN|EDIFICIO|COMUNIDAD|VTR|MOVISTAR|ENTEL|CLARO|\mWOM\M|\mGTD\M|MUNDO PACIFICO|ARRIENDO', NULL, NULL, -1, 'vivienda_servicios', 'gasto', 30),
    ('estacionamiento_saba', 'SABA|PARKING|ESTACIONAMIENTO|PARQUIMETRO', NULL, NULL, NULL, 'transporte', NULL, 30),
    ('transporte', 'UBER(?! ?EATS)|CABIFY|DIDI(?! ?FOOD)|METRO |RED MOVILIDAD|\mBIP\M|AUTOPISTA|COSTANERA|VESPUCIO (NORTE|SUR)|PEAJE|TAG |TURBUS|PULLMAN|EFE ', NULL, NULL, NULL, 'transporte', NULL, 32),
    ('combustible', 'COPEC|MUEVO|SHELL|PETROBRAS|ARAMCO|ENEX|TERPEL|LUBRICENTRO|AUTOMOTRIZ|NEUMATICO|REVISION TECNICA', NULL, NULL, NULL, 'combustible_auto', NULL, 34),
    ('supermercado', 'JUMBO|LIDER|TOTTUS|UNIMARC|SANTA ISABEL|EKONO|ACUENTA|ALVI|MAYORISTA|SUPERMERCADO|MINIMARKET|MINI MARKET|ALMACEN|ABARROTES|CARNICERIA|VERDULERIA|PANADERIA|CORNERSHOP|OK MARKET|OXXO', NULL, NULL, NULL, 'supermercado', NULL, 40),
    ('restaurantes', 'JOHNNY ROCKETS|MC ?DONALD|DUNKIN|PAPA ?JOHN|CARLS JR|BURGER|SUSHI|EMPANADA|RESTOBAR|RESTAURANT|TABERNA|CAFETERIA|CAFE |STARBUCKS|PIZZA|CHURRO|BRESLER|PALETERIA|SODEXO|DOGGIS|\mKFC\M|SUBWAY|TELEPIZZA|RAPPI|PEDIDOSYA|UBER ?EATS|DIDI ?FOOD|JUSTO|HELADERIA|FUENTE DE SODA|COMIDA', NULL, NULL, NULL, 'restaurantes_delivery', NULL, 42),
    ('salud', 'CLINICA|BUPA|FARMACIA|SALCOBRAND|SALCO|CRUZ VERDE|AHUMADA|SIMI|CENTRO MEDICO|MEDIC|DENTAL|LABORATORIO|BIONET|ISAPRE|FONASA|INTEGRAMEDICA|REDSALUD|OPTICA|HOSPITAL|KINESIO', NULL, NULL, NULL, 'salud', NULL, 44),
    ('educacion', 'UDEMY|COURSERA|PLATZI|EDICIONES SM|COLEGIO|UNIVERSIDAD|ESCUELA|JARDIN INFANTIL|LIBRERIA|INSTITUTO|DUOC|INACAP', NULL, NULL, NULL, 'educacion', NULL, 46),
    ('hogar', 'SODIMAC|EASY|IKEA|HOMECENTER|CONSTRUMART|CHILEMAT|IMPERIAL|LIQUIMAX|HOMY|CASAIDEAS|DAISO|FERRETERIA|MUEBLE', NULL, NULL, NULL, 'hogar', NULL, 48),
    ('vestuario', 'H&M|HYM |ZARA|PARIS |RIPLEY|FALABELLA|HITES|LA POLAR|\mCORONA\M|TRICOT|\mBATA\M|NIKE|ADIDAS|SKECHERS|MALLAS|ZAPATERIA', NULL, NULL, NULL, 'vestuario', NULL, 50),
    ('entretenimiento', 'NETFLIX|SPOTIFY|DISNEY|HBO|PRIME VIDEO|YOUTUBE|APPLE\.COM|MICROSOFT|XBOX|PLAYSTATION|STEAM|NINTENDO|CINE|HOYTS|PUNTO ?TICKET|TICKETMASTER|HAPPYLAND|PASSLINE|GOOGLE \*|GOOGLE PLAY', NULL, NULL, NULL, 'entretenimiento_suscripciones', NULL, 52),
    ('tecnologia', 'PC ?FACTORY|ANTHROPIC|OPENROUTER|OPENAI|PADDLE|ELECTRONICA|MACONLINE|SAMSUNG|APPLE STORE|ABCDIN|SPACE ?X|GITHUB|DIGITALOCEAN|\mAWS\M', NULL, NULL, NULL, 'tecnologia', NULL, 54),
    ('viajes', 'LATAM|SKY AIRLINE|JETSMART|BOOKING|AIRBNB|DESPEGAR|HOTEL|HOSTAL|TURISMO|AGENCIA DE VIAJES', NULL, NULL, NULL, 'viajes', NULL, 56),
    ('mascotas', 'VETERINARI|SUPERZOO|PET ?SHOP|PUNTO MASCOTA|MASCOTA', NULL, NULL, NULL, 'mascotas', NULL, 58),
    ('marketplace', 'MERCADO ?LIBRE|MERCADOL$|ALIPAY|ALIEXPRESS|TEMU|SHEIN|AMAZON', NULL, NULL, NULL, 'hogar', NULL, 60),
    ('transferencia_a_terceros', 'TRANSF', NULL, 'cuenta', -1, 'transferencias_personas', 'gasto', 90)
ON CONFLICT (codigo) DO UPDATE
SET patron = EXCLUDED.patron, banco = EXCLUDED.banco, producto_tipo = EXCLUDED.producto_tipo, signo = EXCLUDED.signo,
    categoria = EXCLUDED.categoria, tipo_flujo = EXCLUDED.tipo_flujo, prioridad = EXCLUDED.prioridad, activa = TRUE;

UPDATE dw.fact_movimiento f
SET regla_id = NULL,
    tipo_flujo = CASE
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen IN ('pago', 'avance') THEN 'transferencia_interna'
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen IN ('interes', 'comision', 'impuesto', 'seguro', 'cargo', 'cargo_banco')
             AND f.glosa_norm !~ 'SIN INTERES' THEN 'interes_comision'
        WHEN p.producto_tipo = 'tarjeta' THEN 'gasto'
        WHEN f.monto > 0 THEN 'ingreso'
        ELSE 'gasto'
    END,
    categoria = CASE
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen = 'pago' THEN 'pago_tarjeta_credito'
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen = 'avance' THEN 'transferencia_interna'
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen = 'seguro' THEN 'seguros'
        WHEN p.producto_tipo = 'tarjeta' AND f.tipo_origen IN ('interes', 'comision', 'impuesto', 'cargo', 'cargo_banco')
             AND f.glosa_norm !~ 'SIN INTERES' THEN 'intereses_comisiones_impuestos'
        WHEN p.producto_tipo <> 'tarjeta' AND f.monto > 0 THEN 'ingresos_otros'
        ELSE 'sin_categoria'
    END
FROM dw.dim_producto p
WHERE p.usuario_id = f.usuario_id AND p.producto_id = f.producto_id;

WITH coincidencia AS (
    SELECT f.usuario_id, f.movimiento_id, r.regla_id, r.categoria, r.tipo_flujo
    FROM dw.fact_movimiento f
    JOIN dw.dim_producto p ON p.usuario_id = f.usuario_id AND p.producto_id = f.producto_id
    CROSS JOIN LATERAL (
        SELECT r.regla_id, r.categoria, r.tipo_flujo
        FROM dw.regla_categoria r
        WHERE r.activa
          AND (r.usuario_id IS NULL OR r.usuario_id = f.usuario_id)
          AND (r.banco IS NULL OR r.banco = f.banco)
          AND (r.producto_tipo IS NULL OR r.producto_tipo = p.producto_tipo)
          AND (r.signo IS NULL OR r.signo = sign(f.monto))
          AND f.glosa_norm ~ r.patron
        ORDER BY r.usuario_id IS NULL, r.prioridad, r.regla_id
        LIMIT 1
    ) r
    WHERE f.tipo_flujo IN ('gasto', 'ingreso')
)
UPDATE dw.fact_movimiento f
SET categoria = c.categoria, tipo_flujo = coalesce(c.tipo_flujo, f.tipo_flujo), regla_id = c.regla_id
FROM coincidencia c
WHERE f.usuario_id = c.usuario_id AND f.movimiento_id = c.movimiento_id;

WITH candidatos AS (
    SELECT c.usuario_id,
           c.movimiento_id AS id_cuenta,
           row_number() OVER (PARTITION BY t.usuario_id, t.movimiento_id ORDER BY abs(c.fecha - t.fecha), c.movimiento_id) AS rn_tarjeta,
           row_number() OVER (PARTITION BY c.usuario_id, c.movimiento_id ORDER BY abs(c.fecha - t.fecha), t.movimiento_id) AS rn_cuenta
    FROM dw.fact_movimiento c
    JOIN dw.dim_producto pc ON pc.usuario_id = c.usuario_id AND pc.producto_id = c.producto_id AND pc.producto_tipo = 'cuenta'
    JOIN dw.fact_movimiento t ON t.usuario_id = c.usuario_id AND t.monto = -c.monto AND abs(t.fecha - c.fecha) <= 3
    JOIN dw.dim_producto pt ON pt.usuario_id = t.usuario_id AND pt.producto_id = t.producto_id AND pt.producto_tipo = 'tarjeta'
    WHERE c.monto < 0
      AND c.tipo_flujo = 'gasto'
      AND t.categoria = 'pago_tarjeta_credito'
)
UPDATE dw.fact_movimiento f
SET tipo_flujo = 'pago_deuda', categoria = 'pago_tarjeta_credito'
FROM candidatos c
WHERE c.rn_tarjeta = 1 AND c.rn_cuenta = 1
  AND f.usuario_id = c.usuario_id AND f.movimiento_id = c.id_cuenta;

WITH candidatos AS (
    SELECT a.usuario_id,
           a.movimiento_id AS id_salida,
           b.movimiento_id AS id_entrada,
           row_number() OVER (PARTITION BY a.usuario_id, a.movimiento_id ORDER BY abs(a.fecha - b.fecha), b.movimiento_id) AS rn_salida,
           row_number() OVER (PARTITION BY b.usuario_id, b.movimiento_id ORDER BY abs(a.fecha - b.fecha), a.movimiento_id) AS rn_entrada
    FROM dw.fact_movimiento a
    JOIN dw.dim_producto pa ON pa.usuario_id = a.usuario_id AND pa.producto_id = a.producto_id
    JOIN dw.fact_movimiento b ON b.usuario_id = a.usuario_id AND b.producto_id <> a.producto_id
                             AND b.monto = -a.monto AND abs(b.fecha - a.fecha) <= 3
    JOIN dw.dim_producto pb ON pb.usuario_id = b.usuario_id AND pb.producto_id = b.producto_id AND pb.producto_tipo = 'cuenta'
    WHERE a.monto < 0
      AND b.tipo_flujo IN ('ingreso', 'transferencia_interna')
      AND b.categoria IN ('ingresos_otros', 'sin_categoria', 'transferencia_interna')
      AND ((pa.producto_tipo = 'cuenta' AND a.tipo_flujo IN ('gasto', 'transferencia_interna') AND a.categoria IN ('sin_categoria', 'transferencias_personas', 'transferencia_interna'))
           OR (pa.producto_tipo = 'tarjeta' AND a.tipo_origen = 'avance'))
),
pares AS (
    SELECT usuario_id, id_salida, id_entrada FROM candidatos WHERE rn_salida = 1 AND rn_entrada = 1
)
UPDATE dw.fact_movimiento f
SET tipo_flujo = 'transferencia_interna', categoria = 'transferencia_interna'
FROM (
    SELECT usuario_id, id_salida AS movimiento_id FROM pares
    UNION
    SELECT usuario_id, id_entrada FROM pares
) x
WHERE f.usuario_id = x.usuario_id AND f.movimiento_id = x.movimiento_id;

UPDATE dw.fact_movimiento f
SET fecha_imputacion = (date_trunc('month', f.fecha) + INTERVAL '1 month')::date
FROM dw.dim_usuario u
WHERE f.usuario_id = u.usuario_id
  AND f.categoria = 'ingresos_sueldo'
  AND f.tipo_flujo = 'ingreso'
  AND EXTRACT(DAY FROM f.fecha) >= u.dia_corte_sueldo

CREATE SCHEMA IF NOT EXISTS stage;
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS presentacion;

CREATE TABLE IF NOT EXISTS stage.corrida (
    usuario_id      UUID NOT NULL,
    banco           TEXT NOT NULL,
    corrida         TEXT NOT NULL,
    fecha_carga     DATE NOT NULL,
    extraido        TIMESTAMPTZ,
    movimientos_raw INTEGER NOT NULL,
    descartados     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stage.producto (
    usuario_id    UUID NOT NULL,
    banco         TEXT NOT NULL,
    corrida       TEXT NOT NULL,
    producto_id   TEXT NOT NULL,
    producto_tipo TEXT NOT NULL,
    nombre        TEXT,
    terminacion   TEXT,
    moneda        TEXT
);

CREATE TABLE IF NOT EXISTS stage.movimiento (
    usuario_id         UUID NOT NULL,
    banco              TEXT NOT NULL,
    corrida            TEXT NOT NULL,
    producto_id        TEXT NOT NULL,
    movimiento_id      TEXT NOT NULL,
    fecha              DATE NOT NULL,
    fecha_imputacion   DATE NOT NULL,
    glosa              TEXT,
    glosa_norm         TEXT,
    glosa_publica      TEXT,
    comercio           TEXT,
    monto              BIGINT NOT NULL,
    monto_total_compra BIGINT,
    cuota_actual       INTEGER,
    cuotas_total       INTEGER,
    estado             TEXT NOT NULL,
    tipo_origen        TEXT,
    periodo            DATE,
    duplicado          BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE stage.movimiento ADD COLUMN IF NOT EXISTS glosa_publica TEXT;

CREATE TABLE IF NOT EXISTS stage.deuda (
    usuario_id          UUID NOT NULL,
    banco               TEXT NOT NULL,
    corrida             TEXT NOT NULL,
    producto_id         TEXT NOT NULL,
    tipo                TEXT NOT NULL,
    nombre              TEXT,
    moneda              TEXT NOT NULL,
    cupo_total          NUMERIC(18,4),
    usado               NUMERIC(18,4),
    disponible          NUMERIC(18,4),
    saldo_deuda         NUMERIC(18,4),
    valor_cuota         NUMERIC(18,4),
    cuotas_pagadas      INTEGER,
    cuotas_total        INTEGER,
    fecha_termino       DATE,
    proximo_vencimiento DATE,
    pago_minimo         NUMERIC(18,4),
    tasa_mensual        NUMERIC(9,4),
    cae                 NUMERIC(9,4),
    actualizado         TIMESTAMPTZ
);

ALTER TABLE stage.deuda
    ADD COLUMN IF NOT EXISTS monto_facturado BIGINT,
    ADD COLUMN IF NOT EXISTS fecha_facturacion DATE,
    ADD COLUMN IF NOT EXISTS monto_pagado BIGINT,
    ADD COLUMN IF NOT EXISTS monto_por_facturar BIGINT,
    ADD COLUMN IF NOT EXISTS fecha_proxima_facturacion DATE;

CREATE TABLE IF NOT EXISTS stage.cuota_mes (
    usuario_id  UUID NOT NULL,
    banco       TEXT NOT NULL,
    corrida     TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    mes         DATE NOT NULL,
    fuente      TEXT NOT NULL,
    moneda      TEXT NOT NULL,
    monto       NUMERIC(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS stage.saldo (
    usuario_id       UUID NOT NULL,
    banco            TEXT NOT NULL,
    corrida          TEXT NOT NULL,
    producto_id      TEXT NOT NULL,
    fecha            DATE NOT NULL,
    saldo_disponible BIGINT,
    saldo_contable   BIGINT,
    actualizado      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stage.estado_tarjeta (
    usuario_id        UUID NOT NULL,
    banco             TEXT NOT NULL,
    corrida           TEXT NOT NULL,
    producto_id       TEXT NOT NULL,
    fecha_facturacion DATE NOT NULL,
    fecha_vencimiento DATE,
    saldo_anterior    BIGINT,
    monto_facturado   BIGINT,
    pago_minimo       BIGINT,
    cuadra            BOOLEAN
);

CREATE TABLE IF NOT EXISTS dw.dim_fecha (
    fecha         DATE PRIMARY KEY,
    fecha_id      INTEGER NOT NULL UNIQUE,
    anio          SMALLINT NOT NULL,
    mes           SMALLINT NOT NULL,
    dia           SMALLINT NOT NULL,
    mes_inicio    DATE NOT NULL,
    dia_semana    SMALLINT NOT NULL,
    es_fin_semana BOOLEAN NOT NULL
);

INSERT INTO dw.dim_fecha
SELECT d::date,
       CAST(to_char(d, 'YYYYMMDD') AS INTEGER),
       EXTRACT(YEAR FROM d),
       EXTRACT(MONTH FROM d),
       EXTRACT(DAY FROM d),
       date_trunc('month', d)::date,
       EXTRACT(ISODOW FROM d),
       EXTRACT(ISODOW FROM d) IN (6, 7)
FROM generate_series(DATE '2000-01-01', DATE '2070-12-31', INTERVAL '1 day') AS g(d)
ON CONFLICT (fecha) DO NOTHING;

CREATE TABLE IF NOT EXISTS dw.dim_usuario (
    usuario_id     UUID PRIMARY KEY,
    nombre_visible TEXT,
    dia_corte_sueldo INT NOT NULL DEFAULT 25 CHECK (dia_corte_sueldo BETWEEN 1 AND 31),
    creado         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dw.dim_usuario ADD COLUMN IF NOT EXISTS dia_corte_sueldo INT NOT NULL DEFAULT 25 CHECK (dia_corte_sueldo BETWEEN 1 AND 31);

CREATE TABLE IF NOT EXISTS dw.dim_categoria (
    categoria TEXT PRIMARY KEY,
    grupo     TEXT NOT NULL
);

INSERT INTO dw.dim_categoria (categoria, grupo) VALUES
    ('supermercado', 'gasto'),
    ('restaurantes_delivery', 'gasto'),
    ('transporte', 'gasto'),
    ('combustible_auto', 'gasto'),
    ('salud', 'gasto'),
    ('educacion', 'gasto'),
    ('vivienda_servicios', 'gasto'),
    ('hogar', 'gasto'),
    ('vestuario', 'gasto'),
    ('entretenimiento_suscripciones', 'gasto'),
    ('viajes', 'gasto'),
    ('tecnologia', 'gasto'),
    ('mascotas', 'gasto'),
    ('seguros', 'gasto'),
    ('intereses_comisiones_impuestos', 'costo_financiero'),
    ('transferencias_personas', 'transferencia'),
    ('transferencia_interna', 'transferencia'),
    ('pago_tarjeta_credito', 'deuda'),
    ('pago_credito', 'deuda'),
    ('ingresos_sueldo', 'ingreso'),
    ('ingresos_otros', 'ingreso'),
    ('sin_categoria', 'sin_categoria')
ON CONFLICT (categoria) DO UPDATE SET grupo = EXCLUDED.grupo;

CREATE TABLE IF NOT EXISTS dw.dim_producto (
    usuario_id    UUID NOT NULL REFERENCES dw.dim_usuario,
    producto_id   TEXT NOT NULL,
    banco         TEXT NOT NULL,
    producto_tipo TEXT NOT NULL CHECK (producto_tipo IN ('cuenta', 'tarjeta', 'linea', 'consumo', 'hipotecario')),
    nombre        TEXT,
    terminacion   TEXT CHECK (terminacion ~ '^[0-9]{4}$'),
    moneda        TEXT,
    actualizado   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, producto_id)
);

CREATE TABLE IF NOT EXISTS dw.regla_categoria (
    regla_id      SERIAL PRIMARY KEY,
    codigo        TEXT NOT NULL UNIQUE,
    usuario_id    UUID REFERENCES dw.dim_usuario,
    patron        TEXT NOT NULL,
    banco         TEXT,
    producto_tipo TEXT,
    signo         SMALLINT CHECK (signo IN (-1, 1)),
    categoria     TEXT NOT NULL REFERENCES dw.dim_categoria,
    tipo_flujo    TEXT CHECK (tipo_flujo IN ('ingreso', 'gasto', 'transferencia_interna', 'pago_deuda', 'interes_comision')),
    prioridad     INTEGER NOT NULL DEFAULT 100,
    activa        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dw.fact_movimiento (
    usuario_id         UUID NOT NULL REFERENCES dw.dim_usuario,
    movimiento_id      TEXT NOT NULL,
    producto_id        TEXT NOT NULL,
    banco              TEXT NOT NULL,
    fecha              DATE NOT NULL REFERENCES dw.dim_fecha,
    fecha_imputacion   DATE NOT NULL REFERENCES dw.dim_fecha,
    glosa              TEXT,
    glosa_norm         TEXT,
    glosa_publica      TEXT,
    comercio           TEXT,
    monto              BIGINT NOT NULL,
    monto_total_compra BIGINT,
    cuota_actual       INTEGER,
    cuotas_total       INTEGER,
    estado             TEXT NOT NULL CHECK (estado IN ('contable', 'no_facturado', 'facturado', 'pendiente')),
    tipo_origen        TEXT,
    periodo            DATE,
    categoria          TEXT NOT NULL DEFAULT 'sin_categoria' REFERENCES dw.dim_categoria,
    tipo_flujo         TEXT NOT NULL DEFAULT 'gasto' CHECK (tipo_flujo IN ('ingreso', 'gasto', 'transferencia_interna', 'pago_deuda', 'interes_comision')),
    regla_id           INTEGER,
    corrida            TEXT NOT NULL,
    cargado            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, movimiento_id),
    FOREIGN KEY (usuario_id, producto_id) REFERENCES dw.dim_producto
);
ALTER TABLE dw.fact_movimiento ADD COLUMN IF NOT EXISTS glosa_publica TEXT;
CREATE INDEX IF NOT EXISTS ix_fact_movimiento_fecha ON dw.fact_movimiento (usuario_id, fecha_imputacion);

CREATE TABLE IF NOT EXISTS dw.fact_estado_tarjeta (
    usuario_id        UUID NOT NULL REFERENCES dw.dim_usuario,
    producto_id       TEXT NOT NULL,
    fecha_facturacion DATE NOT NULL,
    fecha_vencimiento DATE,
    saldo_anterior    BIGINT,
    monto_facturado   BIGINT,
    pago_minimo       BIGINT,
    cuadra            BOOLEAN,
    corrida           TEXT NOT NULL,
    PRIMARY KEY (usuario_id, producto_id, fecha_facturacion),
    FOREIGN KEY (usuario_id, producto_id) REFERENCES dw.dim_producto
);

CREATE TABLE IF NOT EXISTS dw.fact_deuda_producto (
    usuario_id          UUID NOT NULL REFERENCES dw.dim_usuario,
    producto_id         TEXT NOT NULL,
    banco               TEXT NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN ('tarjeta', 'linea', 'consumo', 'hipotecario')),
    nombre              TEXT,
    moneda              TEXT NOT NULL CHECK (moneda IN ('CLP', 'UF')),
    cupo_total          NUMERIC(18,4),
    usado               NUMERIC(18,4),
    disponible          NUMERIC(18,4),
    saldo_deuda         NUMERIC(18,4),
    valor_cuota         NUMERIC(18,4),
    cuotas_pagadas      INTEGER,
    cuotas_total        INTEGER,
    fecha_termino       DATE,
    proximo_vencimiento DATE,
    pago_minimo         NUMERIC(18,4),
    tasa_mensual        NUMERIC(9,4),
    cae                 NUMERIC(9,4),
    actualizado         TIMESTAMPTZ,
    corrida             TEXT NOT NULL,
    PRIMARY KEY (usuario_id, producto_id),
    FOREIGN KEY (usuario_id, producto_id) REFERENCES dw.dim_producto
);

ALTER TABLE dw.fact_deuda_producto
    ADD COLUMN IF NOT EXISTS monto_facturado BIGINT,
    ADD COLUMN IF NOT EXISTS fecha_facturacion DATE,
    ADD COLUMN IF NOT EXISTS monto_pagado BIGINT,
    ADD COLUMN IF NOT EXISTS monto_por_facturar BIGINT,
    ADD COLUMN IF NOT EXISTS fecha_proxima_facturacion DATE;

CREATE TABLE IF NOT EXISTS dw.fact_cuota_mes (
    usuario_id  UUID NOT NULL REFERENCES dw.dim_usuario,
    producto_id TEXT NOT NULL,
    mes         DATE NOT NULL REFERENCES dw.dim_fecha,
    fuente      TEXT NOT NULL,
    moneda      TEXT NOT NULL CHECK (moneda IN ('CLP', 'UF')),
    monto       NUMERIC(18,4) NOT NULL,
    corrida     TEXT NOT NULL,
    PRIMARY KEY (usuario_id, producto_id, mes, fuente),
    FOREIGN KEY (usuario_id, producto_id) REFERENCES dw.dim_producto
);

CREATE TABLE IF NOT EXISTS dw.fact_saldo (
    usuario_id       UUID NOT NULL REFERENCES dw.dim_usuario,
    producto_id      TEXT NOT NULL,
    fecha            DATE NOT NULL REFERENCES dw.dim_fecha,
    saldo_disponible BIGINT,
    saldo_contable   BIGINT,
    actualizado      TIMESTAMPTZ NOT NULL,
    corrida          TEXT NOT NULL,
    PRIMARY KEY (usuario_id, producto_id, fecha),
    FOREIGN KEY (usuario_id, producto_id) REFERENCES dw.dim_producto
);

CREATE TABLE IF NOT EXISTS dw.carga_corrida (
    usuario_id      UUID NOT NULL REFERENCES dw.dim_usuario,
    banco           TEXT NOT NULL,
    corrida         TEXT NOT NULL,
    fecha_carga     DATE NOT NULL,
    extraido        TIMESTAMPTZ,
    movimientos_raw INTEGER NOT NULL,
    descartados     INTEGER NOT NULL,
    duplicados      INTEGER NOT NULL,
    cargado         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, banco, corrida)
);

CREATE TABLE IF NOT EXISTS dw.indicador (
    indicador   TEXT NOT NULL,
    fecha       DATE NOT NULL,
    valor       NUMERIC(14,4) NOT NULL,
    actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (indicador, fecha)
);

CREATE TABLE IF NOT EXISTS dw.conciliacion (
    usuario_id UUID NOT NULL REFERENCES dw.dim_usuario,
    ambito     TEXT NOT NULL CHECK (ambito IN ('carga', 'tarjeta', 'caja')),
    sujeto     TEXT NOT NULL,
    detalle    TEXT NOT NULL,
    cuadra     BOOLEAN,
    revisado   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, ambito, sujeto)
);

CREATE OR REPLACE VIEW dw.uf_vigente AS
SELECT valor, fecha
FROM dw.indicador
WHERE indicador = 'uf' AND fecha <= (now() AT TIME ZONE 'America/Santiago')::date
ORDER BY fecha DESC
LIMIT 1;

CREATE OR REPLACE VIEW presentacion.usuario AS
SELECT usuario_id, nombre_visible
FROM dw.dim_usuario;

DROP VIEW IF EXISTS presentacion.caja_resumen;
DROP VIEW IF EXISTS presentacion.caja_ciclo;
DROP VIEW IF EXISTS dw.compromiso;
DROP VIEW IF EXISTS presentacion.movimiento;
DROP VIEW IF EXISTS dw.caja_movimiento;

CREATE OR REPLACE FUNCTION dw.corte_mes(mes DATE, dia INT) RETURNS DATE
LANGUAGE sql IMMUTABLE AS $$
    SELECT (date_trunc('month', mes)
            + make_interval(days => least(dia, EXTRACT(DAY FROM date_trunc('month', mes) + INTERVAL '1 month - 1 day')::int) - 1))::date
$$;

CREATE OR REPLACE FUNCTION dw.ciclo_de(f DATE, dia INT) RETURNS DATE
LANGUAGE sql IMMUTABLE AS $$
    SELECT (date_trunc('month', f) + CASE WHEN f >= dw.corte_mes(f, dia) THEN INTERVAL '1 month' ELSE INTERVAL '0' END)::date
$$;

CREATE VIEW dw.caja_movimiento AS
WITH cuenta AS (
    SELECT f.usuario_id, f.movimiento_id, f.producto_id, f.banco, f.fecha, f.monto, f.categoria, f.tipo_flujo, f.glosa_norm,
           u.dia_corte_sueldo
    FROM dw.fact_movimiento f
    JOIN dw.dim_producto p ON p.usuario_id = f.usuario_id AND p.producto_id = f.producto_id AND p.producto_tipo = 'cuenta'
    JOIN dw.dim_usuario u ON u.usuario_id = f.usuario_id
),
numero_linea AS (
    SELECT DISTINCT usuario_id, substring(glosa_norm FROM '(?:LCA|LINEA (?:DE )?CREDITO)\D{0,6}([0-9]{6,})') AS numero
    FROM cuenta
    WHERE monto < 0 AND glosa_norm ~ '(?:LCA|LINEA (?:DE )?CREDITO)\D{0,6}[0-9]{6,}'
),
giro AS (
    SELECT c.usuario_id, c.movimiento_id
    FROM cuenta c
    WHERE c.monto > 0
      AND (c.glosa_norm ~ '\m(LCA|SOBREGIRO)\M|LINEA (DE )?CREDITO|DESDE (LA )?LINEA'
           OR EXISTS (SELECT 1 FROM numero_linea n WHERE n.usuario_id = c.usuario_id AND position(n.numero IN c.glosa_norm) > 0))
),
financiado AS (
    SELECT p.usuario_id, p.movimiento_id, least(-p.monto, sum(g.monto)) AS monto_financiado
    FROM cuenta p
    JOIN giro gi ON gi.usuario_id = p.usuario_id
    JOIN cuenta g ON g.usuario_id = gi.usuario_id AND g.movimiento_id = gi.movimiento_id AND abs(g.fecha - p.fecha) <= 3
    WHERE p.monto < 0 AND p.categoria = 'pago_tarjeta_credito'
    GROUP BY p.usuario_id, p.movimiento_id, p.monto
)
SELECT c.usuario_id,
       c.movimiento_id,
       c.producto_id,
       c.banco,
       c.fecha,
       k.ciclo,
       dw.corte_mes((k.ciclo - INTERVAL '1 month')::date, c.dia_corte_sueldo) AS ciclo_inicio,
       dw.corte_mes(k.ciclo, c.dia_corte_sueldo) - 1 AS ciclo_fin,
       CASE
           WHEN g.movimiento_id IS NOT NULL THEN 'traspasos_propios'
           WHEN c.categoria = 'ingresos_sueldo' THEN 'sueldo'
           WHEN c.categoria = 'pago_tarjeta_credito' THEN 'pago_tarjetas'
           WHEN c.categoria = 'pago_credito' THEN 'pago_creditos'
           WHEN c.tipo_flujo = 'transferencia_interna' THEN 'traspasos_propios'
           WHEN c.categoria = 'vivienda_servicios' THEN 'vivienda_servicios'
           WHEN c.categoria = 'transferencias_personas' THEN 'transferencias_personas'
           WHEN c.tipo_flujo = 'interes_comision' OR c.categoria = 'intereses_comisiones_impuestos' THEN 'intereses_comisiones'
           WHEN c.tipo_flujo = 'ingreso' THEN 'otros_ingresos'
           WHEN c.categoria = 'sin_categoria' THEN 'sin_categoria'
           ELSE 'gasto_debito'
       END AS grupo,
       c.monto,
       fi.movimiento_id IS NOT NULL AS financiado_con_linea,
       CAST(coalesce(fi.monto_financiado, 0) AS BIGINT) AS monto_financiado_linea
FROM cuenta c
CROSS JOIN LATERAL (SELECT dw.ciclo_de(c.fecha, c.dia_corte_sueldo) AS ciclo) k
LEFT JOIN giro g ON g.usuario_id = c.usuario_id AND g.movimiento_id = c.movimiento_id
LEFT JOIN financiado fi ON fi.usuario_id = c.usuario_id AND fi.movimiento_id = c.movimiento_id;

CREATE VIEW presentacion.movimiento AS
SELECT m.usuario_id,
       m.movimiento_id,
       m.fecha,
       m.fecha_imputacion,
       m.banco,
       p.producto_tipo,
       p.nombre AS producto_nombre,
       regexp_replace(coalesce(m.glosa_publica, m.glosa), '[0-9]{5,}', '****', 'g') AS glosa,
       CASE WHEN m.tipo_flujo = 'gasto' AND m.categoria <> 'transferencias_personas' THEN m.comercio END AS comercio,
       m.categoria,
       m.tipo_flujo,
       m.monto,
       m.monto_total_compra,
       m.cuota_actual,
       m.cuotas_total,
       m.estado
FROM dw.fact_movimiento m
JOIN dw.dim_producto p ON p.usuario_id = m.usuario_id AND p.producto_id = m.producto_id;

CREATE OR REPLACE VIEW presentacion.gasto_diario AS
SELECT usuario_id,
       fecha_imputacion AS fecha,
       categoria,
       CAST(-sum(monto) AS BIGINT) AS monto_gasto,
       CAST(count(*) AS INTEGER) AS cantidad
FROM dw.fact_movimiento
WHERE tipo_flujo IN ('gasto', 'interes_comision')
GROUP BY usuario_id, fecha_imputacion, categoria;

CREATE OR REPLACE VIEW presentacion.resumen_mensual AS
WITH hoy AS (
    SELECT (now() AT TIME ZONE 'America/Santiago')::date AS fecha
),
mensual AS (
    SELECT usuario_id,
           date_trunc('month', fecha_imputacion)::date AS mes,
           CAST(coalesce(sum(monto) FILTER (WHERE tipo_flujo = 'ingreso'), 0) AS BIGINT) AS ingresos,
           CAST(coalesce(-sum(monto) FILTER (WHERE tipo_flujo = 'gasto'), 0) AS BIGINT) AS gastos,
           CAST(coalesce(-sum(monto) FILTER (WHERE tipo_flujo = 'pago_deuda'), 0) AS BIGINT) AS pagos_deuda,
           CAST(coalesce(-sum(monto) FILTER (WHERE tipo_flujo = 'interes_comision'), 0) AS BIGINT) AS intereses_comisiones
    FROM dw.fact_movimiento
    WHERE fecha_imputacion <= (SELECT fecha FROM hoy)
    GROUP BY usuario_id, date_trunc('month', fecha_imputacion)
),
cobertura AS (
    SELECT f.usuario_id,
           f.producto_id,
           min(f.fecha) AS desde,
           greatest(max(f.fecha), (SELECT max(s.fecha) FROM dw.fact_saldo s
                                   WHERE s.usuario_id = f.usuario_id AND s.producto_id = f.producto_id)) AS hasta
    FROM dw.fact_movimiento f
    JOIN dw.dim_producto p ON p.usuario_id = f.usuario_id AND p.producto_id = f.producto_id
    WHERE p.producto_tipo = 'cuenta'
    GROUP BY f.usuario_id, f.producto_id
),
con_historia AS (
    SELECT m.*,
           avg(m.ingresos) OVER (PARTITION BY m.usuario_id ORDER BY m.mes ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS ingresos_previos,
           coalesce((
               SELECT bool_and(c.desde <= m.mes
                               AND c.hasta >= least((m.mes + INTERVAL '1 month - 1 day')::date, (SELECT fecha FROM hoy)))
               FROM cobertura c
               WHERE c.usuario_id = m.usuario_id
           ), FALSE) AS meses_completos
    FROM mensual m
),
proyectado AS (
    SELECT c.*,
           c.ingresos - c.gastos - c.intereses_comisiones AS flujo_neto,
           CASE
               WHEN c.mes = date_trunc('month', h.fecha)::date THEN
                   CAST(round(
                       greatest(c.ingresos, coalesce(c.ingresos_previos, 0))
                       - (c.gastos + c.intereses_comisiones)
                         * EXTRACT(DAY FROM (date_trunc('month', h.fecha) + INTERVAL '1 month - 1 day'))
                         / EXTRACT(DAY FROM h.fecha)
                   ) AS BIGINT)
               ELSE c.ingresos - c.gastos - c.intereses_comisiones
           END AS flujo_proyectado_cierre
    FROM con_historia c
    CROSS JOIN hoy h
)
SELECT usuario_id,
       mes,
       ingresos,
       gastos,
       pagos_deuda,
       intereses_comisiones,
       flujo_neto,
       flujo_proyectado_cierre,
       meses_completos AND flujo_proyectado_cierre < 0 AS alerta_negativo,
       meses_completos
FROM proyectado;

CREATE OR REPLACE VIEW presentacion.deuda_producto AS
SELECT d.usuario_id,
       d.banco,
       d.tipo,
       d.nombre,
       d.moneda,
       d.cupo_total,
       d.usado,
       d.disponible,
       d.saldo_deuda,
       d.valor_cuota,
       d.cuotas_pagadas,
       d.cuotas_total,
       d.fecha_termino,
       d.proximo_vencimiento,
       d.pago_minimo,
       d.tasa_mensual,
       d.cae,
       CAST(round(CASE WHEN d.moneda = 'UF' THEN d.saldo_deuda * u.valor ELSE d.saldo_deuda END) AS BIGINT) AS saldo_deuda_clp,
       d.actualizado,
       d.monto_facturado,
       d.fecha_facturacion,
       d.monto_pagado,
       d.monto_por_facturar,
       d.fecha_proxima_facturacion
FROM dw.fact_deuda_producto d
LEFT JOIN dw.uf_vigente u ON TRUE;

CREATE OR REPLACE VIEW presentacion.deuda_cuota_mes AS
SELECT c.usuario_id,
       c.mes,
       p.banco,
       p.producto_tipo AS tipo,
       p.nombre,
       CAST(round(sum(CASE WHEN c.moneda = 'UF' THEN c.monto * u.valor ELSE c.monto END)) AS BIGINT) AS monto
FROM dw.fact_cuota_mes c
JOIN dw.dim_producto p ON p.usuario_id = c.usuario_id AND p.producto_id = c.producto_id
LEFT JOIN dw.uf_vigente u ON TRUE
GROUP BY c.usuario_id, c.mes, c.producto_id, p.banco, p.producto_tipo, p.nombre;

CREATE OR REPLACE VIEW presentacion.saldo_cuenta AS
SELECT DISTINCT ON (s.usuario_id, s.producto_id)
       s.usuario_id,
       p.banco,
       p.nombre AS producto_nombre,
       s.saldo_disponible,
       s.actualizado
FROM dw.fact_saldo s
JOIN dw.dim_producto p ON p.usuario_id = s.usuario_id AND p.producto_id = s.producto_id
ORDER BY s.usuario_id, s.producto_id, s.fecha DESC, s.actualizado DESC;

CREATE VIEW presentacion.caja_ciclo AS
SELECT usuario_id,
       ciclo,
       ciclo_inicio,
       ciclo_fin,
       grupo,
       CAST(CASE WHEN grupo = 'traspasos_propios' THEN greatest(sum(monto), 0)
                 ELSE coalesce(sum(monto) FILTER (WHERE monto > 0), 0) END AS BIGINT) AS entradas,
       CAST(CASE WHEN grupo = 'traspasos_propios' THEN greatest(-sum(monto), 0)
                 ELSE coalesce(-sum(monto) FILTER (WHERE monto < 0), 0) END AS BIGINT) AS salidas,
       CAST(count(*) AS INTEGER) AS cantidad,
       bool_or(financiado_con_linea) AS financiado_con_linea,
       CAST(sum(monto_financiado_linea) AS BIGINT) AS monto_financiado_linea
FROM dw.caja_movimiento
GROUP BY usuario_id, ciclo, ciclo_inicio, ciclo_fin, grupo;

CREATE VIEW dw.compromiso AS
WITH hoy AS (
    SELECT (now() AT TIME ZONE 'America/Santiago')::date AS fecha
),
tarjeta AS (
    SELECT d.usuario_id, d.banco, d.nombre, d.proximo_vencimiento AS fecha, d.pago_minimo,
           greatest(coalesce(d.monto_facturado, 0) - coalesce(d.monto_pagado, 0), 0) AS por_pagar
    FROM presentacion.deuda_producto d
    WHERE d.tipo = 'tarjeta'
),
credito AS (
    SELECT d.usuario_id, d.banco, d.tipo, d.nombre, d.moneda, d.valor_cuota,
           CASE
               WHEN d.proximo_vencimiento IS NULL OR d.proximo_vencimiento >= h.fecha THEN d.proximo_vencimiento
               ELSE (SELECT min(x.f) FROM generate_series(1, 24) AS k(n)
                     CROSS JOIN LATERAL (SELECT (d.proximo_vencimiento + make_interval(months => k.n))::date AS f) x
                     WHERE x.f >= h.fecha)
           END AS fecha
    FROM presentacion.deuda_producto d
    CROSS JOIN hoy h
    WHERE d.tipo IN ('consumo', 'hipotecario')
)
SELECT usuario_id, 'tarjeta' AS origen, banco, nombre, fecha,
       CAST(por_pagar AS BIGINT) AS monto,
       CAST(least(coalesce(round(pago_minimo), por_pagar), por_pagar) AS BIGINT) AS monto_minimo
FROM tarjeta
WHERE por_pagar > 0
UNION ALL
SELECT usuario_id, origen, banco, nombre, fecha, monto, monto
FROM (
    SELECT c.usuario_id, CASE c.tipo WHEN 'hipotecario' THEN 'dividendo' ELSE 'credito' END AS origen, c.banco, c.nombre, c.fecha,
           coalesce(q.monto, CASE WHEN c.moneda = 'CLP' THEN CAST(round(c.valor_cuota) AS BIGINT) END) AS monto
    FROM credito c
    CROSS JOIN hoy h
    LEFT JOIN presentacion.deuda_cuota_mes q
           ON q.usuario_id = c.usuario_id AND q.banco = c.banco AND q.tipo = c.tipo AND q.nombre = c.nombre
          AND q.mes = date_trunc('month', coalesce(c.fecha, h.fecha))::date
) x
WHERE monto > 0;

CREATE VIEW presentacion.caja_resumen AS
WITH hoy AS (
    SELECT (now() AT TIME ZONE 'America/Santiago')::date AS fecha
),
usuario AS (
    SELECT u.usuario_id, u.dia_corte_sueldo, dw.ciclo_de(h.fecha, u.dia_corte_sueldo) AS ciclo_actual, h.fecha AS hoy
    FROM dw.dim_usuario u
    CROSS JOIN hoy h
),
ciclos AS (
    SELECT u.usuario_id, u.dia_corte_sueldo, u.ciclo_actual, u.hoy, g::date AS ciclo
    FROM usuario u
    CROSS JOIN LATERAL generate_series(
        coalesce((SELECT min(k.ciclo) FROM dw.caja_movimiento k WHERE k.usuario_id = u.usuario_id), u.ciclo_actual),
        u.ciclo_actual, INTERVAL '1 month') AS g
),
totales AS (
    SELECT usuario_id, ciclo,
           sum(entradas) AS entradas,
           sum(salidas) AS salidas,
           bool_or(financiado_con_linea) AS financiado_con_linea,
           sum(monto_financiado_linea) AS monto_financiado_linea
    FROM presentacion.caja_ciclo
    GROUP BY usuario_id, ciclo
),
cobertura AS (
    SELECT f.usuario_id,
           f.producto_id,
           min(f.fecha) AS desde,
           greatest(max(f.fecha), (SELECT max(s.fecha) FROM dw.fact_saldo s
                                   WHERE s.usuario_id = f.usuario_id AND s.producto_id = f.producto_id)) AS hasta
    FROM dw.fact_movimiento f
    JOIN dw.dim_producto p ON p.usuario_id = f.usuario_id AND p.producto_id = f.producto_id
    WHERE p.producto_tipo = 'cuenta'
    GROUP BY f.usuario_id, f.producto_id
),
saldo AS (
    SELECT usuario_id, sum(saldo_disponible) AS saldo_hoy
    FROM presentacion.saldo_cuenta
    GROUP BY usuario_id
),
sueldo AS (
    SELECT usuario_id, max(fecha) AS ultimo
    FROM dw.caja_movimiento
    WHERE grupo = 'sueldo'
    GROUP BY usuario_id
),
proximo AS (
    SELECT u.usuario_id,
           coalesce(
               (SELECT min(x.f)
                FROM generate_series(1, 24) AS k(n)
                CROSS JOIN LATERAL (
                    SELECT CASE WHEN s.ultimo = (date_trunc('month', s.ultimo) + INTERVAL '1 month - 1 day')::date
                                THEN (date_trunc('month', s.ultimo) + make_interval(months => k.n + 1) - INTERVAL '1 day')::date
                                ELSE (s.ultimo + make_interval(months => k.n))::date
                           END AS f
                ) x
                WHERE x.f >= u.hoy),
               dw.corte_mes(u.ciclo_actual, u.dia_corte_sueldo)
           ) AS proximo_sueldo
    FROM usuario u
    LEFT JOIN sueldo s ON s.usuario_id = u.usuario_id
),
comprometido AS (
    SELECT p.usuario_id,
           sum(c.monto) AS comprometido_proximo,
           coalesce(sum(c.monto) FILTER (WHERE coalesce(c.fecha, h.fecha) < p.proximo_sueldo), 0) AS comprometido_antes_sueldo
    FROM proximo p
    CROSS JOIN hoy h
    JOIN dw.compromiso c ON c.usuario_id = p.usuario_id
    GROUP BY p.usuario_id
)
SELECT c.usuario_id,
       c.ciclo,
       dw.corte_mes((c.ciclo - INTERVAL '1 month')::date, c.dia_corte_sueldo) AS ciclo_inicio,
       dw.corte_mes(c.ciclo, c.dia_corte_sueldo) - 1 AS ciclo_fin,
       CAST(coalesce(t.entradas, 0) AS BIGINT) AS entradas,
       CAST(coalesce(t.salidas, 0) AS BIGINT) AS salidas,
       CAST(coalesce(t.entradas, 0) - coalesce(t.salidas, 0) AS BIGINT) AS neto,
       CAST(CASE WHEN c.ciclo = c.ciclo_actual THEN s.saldo_hoy END AS BIGINT) AS saldo_hoy,
       CAST(CASE WHEN c.ciclo = c.ciclo_actual THEN coalesce(m.comprometido_proximo, 0) END AS BIGINT) AS comprometido_proximo,
       CAST(CASE WHEN c.ciclo = c.ciclo_actual THEN coalesce(m.comprometido_antes_sueldo, 0) END AS BIGINT) AS comprometido_antes_sueldo,
       CAST(CASE WHEN c.ciclo = c.ciclo_actual THEN s.saldo_hoy - coalesce(m.comprometido_antes_sueldo, 0) END AS BIGINT) AS disponible_para_vivir,
       CASE WHEN c.ciclo = c.ciclo_actual THEN p.proximo_sueldo END AS proximo_sueldo,
       coalesce((
           SELECT bool_and(v.desde <= dw.corte_mes((c.ciclo - INTERVAL '1 month')::date, c.dia_corte_sueldo)
                           AND v.hasta >= least(dw.corte_mes(c.ciclo, c.dia_corte_sueldo) - 1, c.hoy))
           FROM cobertura v
           WHERE v.usuario_id = c.usuario_id
       ), FALSE) AS datos_completos,
       coalesce(t.financiado_con_linea, FALSE) AS financiado_con_linea,
       CAST(coalesce(t.monto_financiado_linea, 0) AS BIGINT) AS monto_financiado_linea
FROM ciclos c
LEFT JOIN totales t ON t.usuario_id = c.usuario_id AND t.ciclo = c.ciclo
LEFT JOIN saldo s ON s.usuario_id = c.usuario_id
LEFT JOIN proximo p ON p.usuario_id = c.usuario_id
LEFT JOIN comprometido m ON m.usuario_id = c.usuario_id;

CREATE OR REPLACE VIEW presentacion.conciliacion AS
SELECT usuario_id, ambito, sujeto, detalle, cuadra, revisado
FROM dw.conciliacion;

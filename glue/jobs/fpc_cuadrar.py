import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "utils"))

from glue_utils import argumentos, cliente, conectar
from normalizar_productos import clave_compra, compras_conocidas, cuota_cero

TABLAS = ["dw.dim_usuario", "dw.dim_producto", "dw.fact_movimiento", "dw.fact_estado_tarjeta", "dw.fact_deuda_producto",
          "dw.fact_cuota_mes", "dw.fact_saldo", "dw.indicador", "presentacion.movimiento", "presentacion.gasto_diario",
          "presentacion.resumen_mensual", "presentacion.deuda_producto", "presentacion.deuda_cuota_mes", "presentacion.saldo_cuenta",
          "presentacion.caja_ciclo", "presentacion.caja_resumen"]


def excluido(m, conocidas=frozenset()):
    """Indica si un movimiento del raw no debe llegar a la bodega (sin fecha, saldo inicial o compra 0/N ya informada con cuota 1)."""
    if not m.get("fecha") or re.match(r"^\s*saldo inicial", m.get("glosa") or "", re.I):
        return True
    return (m.get("tipo") == "cuota_informativa" or cuota_cero(m)) and clave_compra(m) in conocidas


def conteo_raw(j):
    """Movimientos totales y cargables del raw por tipo de producto, contados directo del JSON."""
    total, cargables = Counter(), Counter()
    listas = [("cuenta", m, frozenset()) for c in j.get("cuentas") or [] for m in c.get("movimientos") or []]
    for t in j.get("tarjetas") or []:
        filas = list(t.get("movimientos_no_facturados") or []) + [m for e in t.get("estados") or [] for m in e.get("movimientos") or []]
        filas += list(t.get("movimientos") or []) + [m for e in t.get("estados_anteriores") or [] for m in e.get("movimientos") or []]
        conocidas = compras_conocidas(filas)
        listas += [("tarjeta", m, conocidas) for m in filas]
    for tipo, m, conocidas in listas:
        total[tipo] += 1
        if not excluido(m, conocidas):
            cargables[tipo] += 1
    return total, cargables


args = argumentos([], {"secretoBodega": "fpc/bodega", "hostBodega": "localhost", "bucketRaw": "fpc-raw"})
s3 = cliente("s3")
ok_global = True

with conectar(args["secretoBodega"], args["hostBodega"] or None) as conexion, conexion.cursor() as cur:
    cur.execute("SELECT usuario_id, banco, corrida, fecha_carga FROM stage.corrida ORDER BY banco")
    for usuario, banco, corrida, fecha_carga in cur.fetchall():
        clave = f"productos/{banco}/usuario={usuario}/fecha_carga={fecha_carga}/{corrida}.json"
        total, cargables = conteo_raw(json.loads(s3.get_object(Bucket=args["bucketRaw"], Key=clave)["Body"].read()))
        cur.execute("""
            SELECT p.producto_tipo, count(*), count(*) FILTER (WHERE s.duplicado)
            FROM stage.movimiento s JOIN dw.dim_producto p USING (usuario_id, producto_id)
            WHERE s.usuario_id = %s AND s.banco = %s GROUP BY 1
        """, (usuario, banco))
        stage = {t: (n, d) for t, n, d in cur.fetchall()}
        cur.execute("""
            SELECT p.producto_tipo, count(*), min(f.fecha), max(f.fecha)
            FROM dw.fact_movimiento f JOIN dw.dim_producto p USING (usuario_id, producto_id)
            WHERE f.usuario_id = %s AND f.banco = %s AND f.corrida = %s GROUP BY 1
        """, (usuario, banco, corrida))
        dw = {t: (n, a, b) for t, n, a, b in cur.fetchall()}
        for tipo in sorted(set(total) | set(stage) | set(dw)):
            n_stage, n_dup = stage.get(tipo, (0, 0))
            n_dw, desde, hasta = dw.get(tipo, (0, None, None))
            cuadra = cargables[tipo] == n_stage and n_stage - n_dup == n_dw
            ok_global &= cuadra
            print(f"{banco}/{tipo}: raw {total[tipo]}, cargables {cargables[tipo]}, stage {n_stage}, duplicados {n_dup}, "
                  f"dw {n_dw}, fechas {desde} a {hasta}, cuadra={cuadra}")

    cur.execute("""
        SELECT e.producto_id, e.fecha_facturacion, e.cuadra,
               CASE WHEN e.saldo_anterior IS NOT NULL AND e.monto_facturado IS NOT NULL
                    THEN abs(e.saldo_anterior - coalesce(sum(f.monto), 0) - e.monto_facturado) <= 1 END,
               count(f.*)
        FROM dw.fact_estado_tarjeta e
        LEFT JOIN dw.fact_movimiento f
               ON f.usuario_id = e.usuario_id AND f.producto_id = e.producto_id
              AND f.estado = 'facturado' AND f.periodo = e.fecha_facturacion
              AND f.fecha_imputacion <= e.fecha_facturacion
        WHERE e.fecha_facturacion = (SELECT max(fecha_facturacion) FROM dw.fact_estado_tarjeta x
                                     WHERE x.usuario_id = e.usuario_id AND x.producto_id = e.producto_id)
        GROUP BY e.usuario_id, e.producto_id, e.fecha_facturacion, e.cuadra, e.saldo_anterior, e.monto_facturado
        ORDER BY e.producto_id
    """)
    for producto_id, fecha_fact, cuadra_banco, cuadra_dw, n in cur.fetchall():
        if cuadra_dw is None:
            print(f"tarjeta {producto_id} estado {fecha_fact}: {n} movimientos; sin saldo_anterior en el estado, no evaluable")
            continue
        ok_global &= cuadra_dw
        print(f"tarjeta {producto_id} estado {fecha_fact}: {n} movimientos; saldo_anterior - suma(movimientos) = monto_facturado (±1): "
              f"{cuadra_dw}; cuadratura de cabecera del extractor: {cuadra_banco}")

    # Caja
    cur.execute("""
        WITH fuente AS (
            SELECT f.usuario_id, f.producto_id, dw.ciclo_de(f.fecha, u.dia_corte_sueldo) AS ciclo, sum(f.monto) AS neto, count(*) AS n
            FROM dw.fact_movimiento f
            JOIN dw.dim_producto p USING (usuario_id, producto_id)
            JOIN dw.dim_usuario u USING (usuario_id)
            WHERE p.producto_tipo = 'cuenta'
            GROUP BY 1, 2, 3
        ),
        caja AS (
            SELECT usuario_id, producto_id, ciclo,
                   coalesce(sum(monto) FILTER (WHERE monto > 0), 0) - coalesce(-sum(monto) FILTER (WHERE monto < 0), 0) AS neto, count(*) AS n
            FROM dw.caja_movimiento
            GROUP BY 1, 2, 3
        ),
        por_ciclo AS (
            SELECT usuario_id, ciclo, sum(neto) AS neto, sum(n) AS n FROM fuente GROUP BY 1, 2
        ),
        ciclo AS (
            SELECT usuario_id, ciclo, sum(entradas - salidas) AS neto, sum(cantidad) AS n FROM presentacion.caja_ciclo GROUP BY 1, 2
        )
        SELECT
            (SELECT count(*) FROM fuente),
            (SELECT bool_and(c.neto IS NOT DISTINCT FROM f.neto AND c.n = f.n) FROM fuente f FULL JOIN caja c USING (usuario_id, producto_id, ciclo)),
            (SELECT count(*) FROM por_ciclo),
            (SELECT bool_and(c.neto IS NOT DISTINCT FROM f.neto AND c.n = f.n) FROM por_ciclo f FULL JOIN ciclo c USING (usuario_id, ciclo)),
            (SELECT bool_and(r.neto = coalesce(f.neto, 0)) FROM presentacion.caja_resumen r LEFT JOIN por_ciclo f USING (usuario_id, ciclo)),
            (SELECT bool_and(entradas >= 0 AND salidas >= 0) FROM presentacion.caja_ciclo),
            (SELECT count(*) FROM presentacion.caja_resumen WHERE saldo_hoy IS NOT NULL),
            (SELECT coalesce(bool_and(grupo IN ('sueldo', 'otros_ingresos', 'vivienda_servicios', 'pago_tarjetas', 'pago_creditos',
                                                'transferencias_personas', 'traspasos_propios', 'gasto_debito',
                                                'intereses_comisiones', 'sin_categoria')
                                      AND (NOT financiado_con_linea OR grupo = 'pago_tarjetas')
                                      AND monto_financiado_linea <= salidas), TRUE)
             FROM presentacion.caja_ciclo),
            (SELECT count(*) FROM dw.caja_movimiento WHERE financiado_con_linea)
    """)
    n_cuenta_ciclo, ok_cuenta, n_ciclo, ok_ciclo, ok_resumen, ok_signo, n_actual, ok_grupos, n_financiados = cur.fetchone()
    ok_caja = bool(ok_cuenta) and bool(ok_ciclo) and bool(ok_resumen) and bool(ok_signo) and n_actual >= 1 and bool(ok_grupos)
    ok_global &= ok_caja
    print(f"caja: {n_cuenta_ciclo} cuenta-ciclo, entradas - salidas = suma de movimientos por cuenta: {ok_cuenta}; "
          f"{n_ciclo} ciclos, caja_ciclo cuadra: {ok_ciclo}; caja_resumen.neto cuadra: {ok_resumen}; "
          f"entradas y salidas >= 0: {ok_signo}; filas con saldo_hoy (ciclo en curso): {n_actual}; "
          f"grupos y financiamiento con línea válidos: {ok_grupos}; pagos de tarjeta financiados con línea: {n_financiados}")

    for tabla in TABLAS:
        cur.execute(f"SELECT count(*) FROM {tabla}")
        print(f"conteo {tabla}: {cur.fetchone()[0]}")

print(f"cuadraturas OK: {ok_global}")

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "utils"))

from glue_utils import argumentos, conectar, ejecutar_sql, leer_sentencias

args = argumentos([], {"secretoBodega": "fpc/bodega", "hostBodega": "localhost", "rutaSql": "sql/bodega", "mostrarComercios": "no"})

with conectar(args["secretoBodega"], args["hostBodega"] or None) as conexion:
    privadas = os.path.join(args["rutaSql"], "privado", "reglas_usuario.sql")
    if os.path.exists(privadas):
        n_privadas = ejecutar_sql(conexion, leer_sentencias(privadas))
        print(f"reglas por usuario cargadas: {sum(n_privadas)}")
    afectadas = ejecutar_sql(conexion, leer_sentencias(os.path.join(args["rutaSql"], "03_reglas.sql")))
    with conexion.cursor() as cur:
        cur.execute("SELECT tipo_flujo, count(*) FROM dw.fact_movimiento GROUP BY 1 ORDER BY 1")
        flujos = cur.fetchall()
        cur.execute("""
            SELECT round(100.0 * sum(-monto) FILTER (WHERE categoria = 'sin_categoria') / nullif(sum(-monto), 0), 1),
                   round(100.0 * count(*) FILTER (WHERE categoria = 'sin_categoria') / nullif(count(*), 0), 1),
                   count(*)
            FROM dw.fact_movimiento
            WHERE tipo_flujo IN ('gasto', 'interes_comision') AND monto < 0
        """)
        pct_monto, pct_cantidad, total = cur.fetchone()
        cur.execute("""
            SELECT coalesce(comercio, glosa_norm), count(*)
            FROM dw.fact_movimiento
            WHERE tipo_flujo = 'gasto' AND categoria = 'sin_categoria' AND monto < 0
            GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20
        """)
        top = cur.fetchall()

print(f"filas afectadas por sentencia: {afectadas}")
print("movimientos por tipo_flujo: " + ", ".join(f"{t} {n}" for t, n in flujos))
print(f"gasto sin_categoria: {pct_monto}% del monto, {pct_cantidad}% de {total} movimientos de gasto")
if args["mostrarComercios"] == "si":
    for nombre, n in top:
        print(f"  {n:4d}  {nombre}")
else:
    print("top 20 comercios sin categoría (solo conteos): " + ", ".join(str(n) for _, n in top))

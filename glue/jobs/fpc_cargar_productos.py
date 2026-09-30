import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "utils"))

from glue_utils import argumentos, cliente, conectar, ejecutar_sql, insertar_filas, leer_sentencias, obtener_secreto
from normalizar_productos import BANCOS, normalizar

COLUMNAS = {
    "stage.producto": ["usuario_id", "banco", "corrida", "producto_id", "producto_tipo", "nombre", "terminacion", "moneda"],
    "stage.movimiento": ["usuario_id", "banco", "corrida", "producto_id", "movimiento_id", "fecha", "fecha_imputacion", "glosa",
                         "glosa_norm", "glosa_publica", "comercio", "monto", "monto_total_compra", "cuota_actual", "cuotas_total", "estado",
                         "tipo_origen", "periodo"],
    "stage.deuda": ["usuario_id", "banco", "corrida", "producto_id", "tipo", "nombre", "moneda", "cupo_total", "usado", "disponible",
                    "saldo_deuda", "valor_cuota", "cuotas_pagadas", "cuotas_total", "fecha_termino", "proximo_vencimiento",
                    "pago_minimo", "tasa_mensual", "cae", "actualizado", "monto_facturado", "fecha_facturacion", "monto_pagado",
                    "monto_por_facturar", "fecha_proxima_facturacion"],
    "stage.cuota_mes": ["usuario_id", "banco", "corrida", "producto_id", "mes", "fuente", "moneda", "monto"],
    "stage.saldo": ["usuario_id", "banco", "corrida", "producto_id", "fecha", "saldo_disponible", "saldo_contable", "actualizado"],
    "stage.estado_tarjeta": ["usuario_id", "banco", "corrida", "producto_id", "fecha_facturacion", "fecha_vencimiento",
                             "saldo_anterior", "monto_facturado", "pago_minimo", "cuadra"],
    "stage.corrida": ["usuario_id", "banco", "corrida", "fecha_carga", "extraido", "movimientos_raw", "descartados"],
}
RUTA = re.compile(r"^productos/(?P<banco>[a-z]+)/usuario=(?P<usuario>[0-9a-f-]{36})/fecha_carga=(?P<fecha>\d{4}-\d{2}-\d{2})/(?P<corrida>[^/]+)\.json$")


def listar_corridas(s3, bucket, banco):
    """Claves de raw del banco agrupadas por usuario, ordenadas de la más nueva a la más antigua."""
    por_usuario = defaultdict(list)
    for pagina in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"productos/{banco}/"):
        for o in pagina.get("Contents", []):
            m = RUTA.match(o["Key"])
            if m:
                por_usuario[m["usuario"]].append((m["fecha"], m["corrida"], o["Key"]))
    return {u: sorted(v, reverse=True) for u, v in por_usuario.items()}


def completar_creditos(s3, bucket, j, anteriores):
    """Si un crédito viene sin detalle (servicio del banco caído), usa el último detalle bueno de corridas anteriores."""
    faltantes = [k for k, cr in enumerate(j.get("creditos") or []) if cr.get("detalle_disponible") is False]
    for _, _, ruta in anteriores:
        if not faltantes:
            break
        previo = json.loads(s3.get_object(Bucket=bucket, Key=ruta)["Body"].read())
        buenos = {cr.get("tipo"): cr for cr in previo.get("creditos") or [] if cr.get("detalle_disponible")}
        for k in list(faltantes):
            tipo = j["creditos"][k].get("tipo")
            if tipo in buenos:
                j["creditos"][k] = {**buenos[tipo], "detalle_de": previo.get("extraido")}
                faltantes.remove(k)


def tiene_datos(j):
    """Indica si la corrida trae movimientos o productos de crédito."""
    movs = sum(len(c.get("movimientos") or []) for c in j.get("cuentas") or [])
    return movs > 0 or bool(j.get("tarjetas")) or bool(j.get("creditos"))


args = argumentos(
    [],
    {"secretoBodega": "fpc/bodega", "hostBodega": "localhost", "bucketRaw": "fpc-raw", "rutaSql": "sql/bodega",
     "bancos": ",".join(BANCOS), "fecha": "", "usuarioId": "", "corrida": "", "secretoSeudonimo": "fpc/seudonimo"},
)
s3 = cliente("s3")
clave = obtener_secreto(args["secretoSeudonimo"])["clave"]

with conectar(args["secretoBodega"], args["hostBodega"] or None) as conexion:
    with conexion.cursor() as cur:
        cur.execute("TRUNCATE " + ", ".join(COLUMNAS))
        cur.execute("SELECT fecha, valor FROM dw.indicador WHERE indicador = 'uf'")
        uf = dict(cur.fetchall())

    resumen = []
    for banco in [b.strip() for b in args["bancos"].split(",") if b.strip()]:
        for usuario, corridas in listar_corridas(s3, args["bucketRaw"], banco).items():
            if args["usuarioId"] and usuario != args["usuarioId"]:
                continue
            candidatas = [c for c in corridas if (not args["fecha"] or c[0] == args["fecha"]) and (not args["corrida"] or c[1] == args["corrida"])]
            elegida = None
            for i, (fecha_carga, corrida, ruta) in enumerate(candidatas):
                j = json.loads(s3.get_object(Bucket=args["bucketRaw"], Key=ruta)["Body"].read())
                if tiene_datos(j) or args["corrida"]:
                    elegida = (fecha_carga, corrida, j)
                    completar_creditos(s3, args["bucketRaw"], j, candidatas[i + 1:])
                    break
            if not elegida:
                print(f"{banco}: sin corridas con datos para el usuario")
                continue
            fecha_carga, corrida, j = elegida
            c = normalizar(usuario, corrida, j, uf, clave)
            insertar_filas(conexion, "stage.corrida", COLUMNAS["stage.corrida"], [{
                "usuario_id": usuario, "banco": banco, "corrida": corrida, "fecha_carga": fecha_carga,
                "extraido": j.get("extraido"), "movimientos_raw": c.movimientos_raw, "descartados": c.descartados,
            }])
            for tabla, filas in (("stage.producto", c.productos), ("stage.movimiento", c.movimientos), ("stage.deuda", c.deudas),
                                 ("stage.cuota_mes", c.cuotas_mes), ("stage.saldo", c.saldos), ("stage.estado_tarjeta", c.estados)):
                insertar_filas(conexion, tabla, COLUMNAS[tabla], filas)
            resumen.append((banco, fecha_carga, corrida, c))
            for aviso in c.avisos:
                print(f"AVISO {aviso}")

    afectadas = ejecutar_sql(conexion, leer_sentencias(os.path.join(args["rutaSql"], "02_cargar.sql")))
    with conexion.cursor() as cur:
        cur.execute("SELECT banco, count(*) FILTER (WHERE duplicado) FROM stage.movimiento GROUP BY banco")
        duplicados = dict(cur.fetchall())

for banco, fecha_carga, corrida, c in resumen:
    print(
        f"{banco} {fecha_carga}/{corrida}: productos {len(c.productos)}, movimientos raw {c.movimientos_raw}, "
        f"descartados {c.descartados}, duplicados {duplicados.get(banco, 0)}, deudas {len(c.deudas)}, "
        f"cuotas_mes {len(c.cuotas_mes)}, saldos {len(c.saldos)}, estados {len(c.estados)}"
    )
print(f"filas afectadas por sentencia: {afectadas}")

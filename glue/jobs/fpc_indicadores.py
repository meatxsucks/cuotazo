import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "utils"))

from glue_utils import argumentos, conectar

args = argumentos([], {"secretoBodega": "fpc/bodega", "hostBodega": "localhost", "indicador": "uf", "url": "https://mindicador.cl/api"})

try:
    with urllib.request.urlopen(f"{args['url']}/{args['indicador']}", timeout=20) as r:
        serie = json.load(r)["serie"]
except Exception as e:
    print(f"AVISO: no se pudo obtener {args['indicador']} ({type(e).__name__}); los montos en UF quedarán nulos si no hay valores previos")
    sys.exit(0)

filas = [(args["indicador"], s["fecha"][:10], s["valor"]) for s in serie]
with conectar(args["secretoBodega"], args["hostBodega"] or None) as conexion, conexion.cursor() as cur:
    cur.executemany(
        "INSERT INTO dw.indicador (indicador, fecha, valor) VALUES (%s, %s, %s) "
        "ON CONFLICT (indicador, fecha) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()",
        filas,
    )
    cur.execute("SELECT count(*), min(fecha), max(fecha) FROM dw.indicador WHERE indicador = %s", (args["indicador"],))
    total, desde, hasta = cur.fetchone()

print(f"{args['indicador']}: {len(filas)} valores recibidos; en bodega {total} entre {desde} y {hasta}")

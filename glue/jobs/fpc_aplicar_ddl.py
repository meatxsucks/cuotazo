import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "utils"))

from glue_utils import argumentos, conectar, ejecutar_sql, leer_sentencias

args = argumentos([], {"secretoBodega": "fpc/bodega", "hostBodega": "localhost", "rutaSql": "sql/bodega"})

with conectar(args["secretoBodega"], args["hostBodega"] or None) as conexion:
    sentencias = leer_sentencias(os.path.join(args["rutaSql"], "01_ddl.sql"))
    ejecutar_sql(conexion, sentencias)

print(f"DDL aplicado: {len(sentencias)} sentencias")

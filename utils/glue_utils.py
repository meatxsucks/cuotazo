import json
import os
import sys

import boto3
import psycopg

ENDPOINT_FLOCI = "http://localhost:4566"


# Argumentos estilo Glue
def argumentos(requeridos, opcionales=None):
    """Lee argumentos --clave valor como getResolvedOptions, con valores por defecto para los opcionales."""
    valores = dict(opcionales or {})
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a.startswith("--") and i + 1 < len(args) and not args[i + 1].startswith("--"):
            valores[a[2:]] = args[i + 1]
    faltan = [r for r in requeridos if r not in valores]
    if faltan:
        raise SystemExit(f"faltan argumentos: {', '.join('--' + f for f in faltan)}")
    return valores


# Clientes AWS contra floci
def cliente(servicio):
    """Cliente boto3 que apunta a floci salvo que AWS_ENDPOINT_URL indique otro endpoint."""
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
    os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
    return boto3.client(servicio, endpoint_url=os.environ.get("AWS_ENDPOINT_URL", ENDPOINT_FLOCI))


# Credenciales de la bodega
def obtener_secreto(nombre):
    """Devuelve el secreto JSON de Secrets Manager como diccionario."""
    return json.loads(cliente("secretsmanager").get_secret_value(SecretId=nombre)["SecretString"])


# Conexión a la bodega
def conectar(secreto_bodega, host=None):
    """Abre una conexión psycopg a la bodega; permite reemplazar el host cuando se ejecuta fuera de la red de floci."""
    s = obtener_secreto(secreto_bodega)
    return psycopg.connect(
        host=host or s["host"], port=s["port"], dbname=s["dbname"], user=s["username"], password=s["password"]
    )


# Sentencias de un archivo SQL con parámetros
def leer_sentencias(ruta, **parametros):
    """Lee un archivo SQL, reemplaza los parámetros {nombre} si se entregan y lo separa en sentencias."""
    with open(ruta) as f:
        texto = f.read()
    if parametros:
        texto = texto.format(**parametros)
    return [s.strip() for s in texto.split(";") if s.strip()]


# Ejecución de sentencias en una transacción
def ejecutar_sql(conexion, sentencias):
    """Ejecuta las sentencias en orden dentro de la transacción abierta y devuelve las filas afectadas por cada una."""
    afectadas = []
    with conexion.cursor() as cur:
        for sql in sentencias:
            cur.execute(sql)
            afectadas.append(cur.rowcount)
    return afectadas


# Carga de filas a una tabla de stage
def insertar_filas(conexion, tabla, columnas, filas):
    """Inserta las filas (diccionarios) en la tabla con COPY y devuelve cuántas se cargaron."""
    if not filas:
        return 0
    with conexion.cursor() as cur, cur.copy(f"COPY {tabla} ({', '.join(columnas)}) FROM STDIN") as copia:
        for f in filas:
            copia.write_row([f.get(c) for c in columnas])
    return len(filas)

import json
import os

import boto3
import psycopg
from psycopg import sql

TAMANO_LOTE = 2000

# Columnas publicadas por tabla, según spec/CONTRATO_PRESENTACION.md
TABLAS = {
    "movimiento": [
        "usuario_id", "movimiento_id", "fecha", "fecha_imputacion", "banco", "producto_tipo", "producto_nombre", "glosa", "comercio",
        "categoria", "tipo_flujo", "monto", "monto_total_compra", "cuota_actual", "cuotas_total", "estado",
    ],
    "gasto_diario": ["usuario_id", "fecha", "categoria", "monto_gasto", "cantidad"],
    "resumen_mensual": [
        "usuario_id", "mes", "ingresos", "gastos", "pagos_deuda", "intereses_comisiones", "flujo_neto",
        "flujo_proyectado_cierre", "alerta_negativo", "meses_completos",
    ],
    "deuda_producto": [
        "usuario_id", "banco", "tipo", "nombre", "moneda", "cupo_total", "usado", "disponible", "saldo_deuda",
        "valor_cuota", "cuotas_pagadas", "cuotas_total", "fecha_termino", "proximo_vencimiento", "pago_minimo",
        "tasa_mensual", "cae", "saldo_deuda_clp", "actualizado", "monto_facturado", "fecha_facturacion", "monto_pagado",
        "monto_por_facturar", "fecha_proxima_facturacion",
    ],
    "deuda_cuota_mes": ["usuario_id", "mes", "banco", "tipo", "nombre", "monto"],
    "saldo_cuenta": ["usuario_id", "banco", "producto_nombre", "saldo_disponible", "actualizado"],
    "caja_ciclo": [
        "usuario_id", "ciclo", "ciclo_inicio", "ciclo_fin", "grupo", "entradas", "salidas", "cantidad", "financiado_con_linea",
        "monto_financiado_linea",
    ],
    "caja_resumen": [
        "usuario_id", "ciclo", "ciclo_inicio", "ciclo_fin", "entradas", "salidas", "neto", "saldo_hoy", "comprometido_proximo",
        "comprometido_antes_sueldo", "disponible_para_vivir", "proximo_sueldo", "datos_completos", "financiado_con_linea",
        "monto_financiado_linea",
    ],
}

secretos = boto3.client("secretsmanager")


class ConfiguracionFaltante(Exception):
    """Falta un secreto o un campo necesario para publicar."""


def leer_secreto(nombre):
    """Devuelve el secreto como diccionario, o vacío si no tiene valor."""
    try:
        texto = secretos.get_secret_value(SecretId=nombre).get("SecretString") or "{}"
    except secretos.exceptions.ResourceNotFoundException:
        return {}
    return json.loads(texto)


def conexion_supabase():
    """Abre la conexión directa a Supabase (pooler) desde el secreto."""
    nombre = os.environ.get("SECRETO_SUPABASE", "fpc/supabase")
    db_url = leer_secreto(nombre).get("db_url", "").strip()
    if not db_url:
        raise ConfiguracionFaltante(
            f"Falta configurar {nombre}: el secreto debe tener db_url (cadena Postgres del pooler de Supabase)"
        )
    return psycopg.connect(db_url, prepare_threshold=None, connect_timeout=15)


def conexion_bodega():
    """Abre la conexión de solo lectura a la bodega desde el secreto."""
    nombre = os.environ.get("SECRETO_BODEGA", "fpc/bodega")
    s = leer_secreto(nombre)
    if not s.get("host"):
        raise ConfiguracionFaltante(f"Falta configurar {nombre}")
    return psycopg.connect(
        host=s["host"], port=s["port"], dbname=s["dbname"], user=s["username"], password=s["password"],
        connect_timeout=15, options="-c default_transaction_read_only=on",
    )


# Lectura por lotes desde presentacion
def filas_bodega(bodega, tabla, usuario_id):
    """Recorre por lotes las filas de presentacion.<tabla> de un usuario."""
    columnas = TABLAS[tabla]
    consulta = sql.SQL("select {} from presentacion.{} where usuario_id = %s").format(
        sql.SQL(", ").join(map(sql.Identifier, columnas)), sql.Identifier(tabla)
    )
    with bodega.cursor(name=f"lee_{tabla}") as cur:
        cur.execute(consulta, (usuario_id,))
        while lote := cur.fetchmany(TAMANO_LOTE):
            yield from lote


def cargar_temporal(destino, tabla, filas):
    """Copia las filas a una tabla temporal con la forma de finanzas.<tabla> y devuelve cuántas copió."""
    columnas = TABLAS[tabla]
    temporal = sql.Identifier(f"tmp_{tabla}")
    with destino.cursor() as cur:
        cur.execute(sql.SQL("create temp table {} (like finanzas.{}) on commit drop").format(
            temporal, sql.Identifier(tabla)
        ))
        copia = sql.SQL("copy {} ({}) from stdin").format(temporal, sql.SQL(", ").join(map(sql.Identifier, columnas)))
        n = 0
        with cur.copy(copia) as c:
            for fila in filas:
                c.write_row(fila)
                n += 1
    return n


# Movimientos: upsert y baja de los que ya no están dentro del rango publicado
def aplicar_movimientos(destino, usuario_id):
    """Hace upsert de movimientos y borra los obsoletos del rango de fechas publicado."""
    columnas = TABLAS["movimiento"]
    lista = sql.SQL(", ").join(map(sql.Identifier, columnas))
    cambios = sql.SQL(", ").join(
        sql.SQL("{0} = excluded.{0}").format(sql.Identifier(c)) for c in columnas if c not in ("usuario_id", "movimiento_id")
    )
    with destino.cursor() as cur:
        cur.execute(
            """
            delete from finanzas.movimiento m
            using (select min(fecha) desde, max(fecha) hasta from tmp_movimiento) r
            where m.usuario_id = %s
              and m.fecha between r.desde and r.hasta
              and not exists (select 1 from tmp_movimiento t where t.movimiento_id = m.movimiento_id)
            """,
            (usuario_id,),
        )
        cur.execute(sql.SQL(
            "insert into finanzas.movimiento ({lista}) select {lista} from tmp_movimiento "
            "on conflict (usuario_id, movimiento_id) do update set {cambios}"
        ).format(lista=lista, cambios=cambios))


# Derivados: reemplazo completo por usuario
def aplicar_derivado(destino, tabla, usuario_id):
    """Borra las filas del usuario en finanzas.<tabla> y las reinserta desde la temporal."""
    lista = sql.SQL(", ").join(map(sql.Identifier, TABLAS[tabla]))
    with destino.cursor() as cur:
        cur.execute(sql.SQL("delete from finanzas.{} where usuario_id = %s").format(sql.Identifier(tabla)), (usuario_id,))
        cur.execute(sql.SQL("insert into finanzas.{t} ({l}) select {l} from {tmp}").format(
            t=sql.Identifier(tabla), l=lista, tmp=sql.Identifier(f"tmp_{tabla}")
        ))


def publicar_usuario(bodega, destino, usuario_id, nombre_visible):
    """Publica todas las tablas de un usuario en una sola transacción y devuelve las filas por tabla."""
    filas = {}
    with destino.transaction():
        destino.execute(
            "insert into finanzas.usuario (usuario_id, nombre_visible) values (%s, %s) "
            "on conflict (usuario_id) do update set nombre_visible = excluded.nombre_visible",
            (usuario_id, nombre_visible),
        )
        for tabla in TABLAS:
            n = cargar_temporal(destino, tabla, filas_bodega(bodega, tabla, usuario_id))
            if tabla == "movimiento":
                aplicar_movimientos(destino, usuario_id)
            else:
                aplicar_derivado(destino, tabla, usuario_id)
            destino.execute(
                "insert into finanzas.publicacion (usuario_id, tabla, publicado_en, filas) values (%s, %s, now(), %s) "
                "on conflict (usuario_id, tabla) do update set publicado_en = excluded.publicado_en, filas = excluded.filas",
                (usuario_id, tabla, n),
            )
            filas[tabla] = n
    return filas


def handler(event, context):
    """Publica las vistas presentacion.* de la bodega en el esquema finanzas de Supabase."""
    conteos = {"usuario": 0} | {t: 0 for t in TABLAS}
    with conexion_supabase() as destino, conexion_bodega() as bodega:
        destino.autocommit = True
        usuarios = bodega.execute("select usuario_id, nombre_visible from presentacion.usuario").fetchall()
        errores = []
        for usuario_id, nombre_visible in usuarios:
            try:
                filas = publicar_usuario(bodega, destino, usuario_id, nombre_visible)
            except psycopg.Error as e:
                bodega.rollback()
                # Sin valores en el mensaje: solo tipo, tabla, columna y restricción
                d = e.diag
                errores.append(f"{usuario_id}: {type(e).__name__} {d.table_name} {d.column_name} {d.constraint_name}")
                continue
            conteos["usuario"] += 1
            for tabla, n in filas.items():
                conteos[tabla] += n
    print(json.dumps({"publicado": conteos, "errores": errores}))
    if errores:
        raise RuntimeError(f"Falló la publicación de {len(errores)} usuario(s); sus datos anteriores quedan: {errores}")
    return conteos

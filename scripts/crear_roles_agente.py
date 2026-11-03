"""Crea en Neon los roles del agente MCP (ADR-012) y guarda sus cadenas en el Llavero.

agente_mcp           -> solo ejecuta agente_leer y agente_buscar_obligacion       (NEON_AGENTE_URL)
agente_mcp_escritura -> solo ejecuta las funciones que escriben                   (NEON_AGENTE_ESCRITURA_URL)
Requiere psycopg. Se puede repetir: rota la clave de cada rol.
"""
import secrets
import subprocess
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

ROLES = {
    "agente_mcp": ("NEON_AGENTE_URL", [
        "agente_leer(uuid, text, date, date)",
        "agente_buscar_obligacion(uuid, text, text)",
    ]),
    "agente_mcp_escritura": ("NEON_AGENTE_ESCRITURA_URL", [
        "agente_anotar_gasto(uuid, bigint, text, uuid, text, date)",
        "agente_crear_sobre(uuid, text, bigint, finanzas.categoria, text, boolean)",
        "agente_registrar_ingreso(uuid, text, bigint, date, boolean, text)",
        "agente_registrar_pago(uuid, text, bigint, date, text, boolean)",
        "agente_deshacer(uuid, text, uuid)",
    ]),
}


def llavero(cuenta):
    return subprocess.run(["security", "find-generic-password", "-s", "fpc", "-a", cuenta, "-w"],
                          capture_output=True, text=True, check=True).stdout.strip()


def guardar(cuenta, valor):
    subprocess.run(["security", "add-generic-password", "-U", "-s", "fpc", "-a", cuenta, "-w", valor], check=True)


admin = llavero("NEON_DB_URL")
partes = urlsplit(admin)
with psycopg.connect(admin, autocommit=True) as conn:
    for rol, (cuenta, funciones) in ROLES.items():
        clave = secrets.token_hex(24)
        existe = conn.execute("select 1 from pg_roles where rolname = %s", (rol,)).fetchone()
        verbo = "alter role {} password {}" if existe else "create role {} login password {}"
        conn.execute(sql.SQL(verbo).format(sql.Identifier(rol), sql.Literal(clave)))
        conn.execute(sql.SQL("grant usage on schema finanzas to {}").format(sql.Identifier(rol)))
        for f in funciones:
            conn.execute(sql.SQL("grant execute on function finanzas.{} to {}").format(sql.SQL(f), sql.Identifier(rol)))
        guardar(cuenta, urlunsplit((partes.scheme, f"{rol}:{clave}@{partes.hostname}", partes.path, partes.query, "")))
        print(f"{rol}: listo; cadena en el Llavero ({cuenta})")

"""Atiende las solicitudes de actualización de la app y la corrida diaria: extrae los bancos, carga la bodega y publica."""
import datetime as dt
import fcntl
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg

RAIZ = Path(__file__).resolve().parent.parent
BANCOS = ["santander", "falabella", "bci"]
HORA_PROGRAMADA = 7
ZONA = ZoneInfo("America/Santiago")
DIR_FPC = Path.home() / ".fpc"
PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"


def registro(texto):
    """Escribe una línea con hora en la salida (va al log de launchd)."""
    print(f"{dt.datetime.now(ZONA):%Y-%m-%d %H:%M:%S} {texto}", flush=True)


def url_supabase():
    """Lee la cadena de Postgres de Supabase desde el Llavero."""
    r = subprocess.run(["security", "find-generic-password", "-s", "fpc", "-a", "SUPABASE_DB_URL", "-w"],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def entorno():
    """Variables para los extractores, la carga y la AWS CLI contra floci."""
    env = dict(os.environ, PATH=PATH, AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test",
               AWS_DEFAULT_REGION="us-east-1", AWS_ENDPOINT_URL="http://localhost:4566")
    for linea in (RAIZ / ".env").read_text().splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            clave, valor = linea.split("=", 1)
            env[clave.strip()] = valor.strip()
    return env


def correr(cmd, env, cwd=RAIZ, limite=900):
    """Corre un comando y devuelve (código, salida combinada)."""
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=limite)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return -1, "se excedió el tiempo"


def asegurar_floci(env):
    """Levanta Docker y floci si están apagados; True si quedaron arriba."""
    if correr(["docker", "info"], env, limite=30)[0] != 0:
        subprocess.run(["open", "-a", "Docker"], env=env)
        for _ in range(40):
            time.sleep(3)
            if correr(["docker", "info"], env, limite=30)[0] == 0:
                break
        else:
            return False
    correr(["docker", "compose", "up", "-d"], env, limite=120)
    for _ in range(20):
        if correr(["aws", "s3", "ls", "s3://fpc-raw"], env, limite=30)[0] == 0:
            return True
        time.sleep(3)
    return False


def resultado_extraccion(salida):
    """Interpreta lo que imprime correr.mjs: 'ok', 'sin datos' o el motivo del error."""
    i = salida.find("{")
    try:
        j = json.loads(salida[i:])
    except (ValueError, json.JSONDecodeError):
        mensajes = [m.group(1) for m in re.finditer(r"^\w*Error: (.+)$", salida, re.M)]
        mensajes += [m.group(0) for m in re.finditer(r"^page\.\w+: .+$", salida, re.M)]
        return (mensajes[-1] if mensajes else "error").strip()[:160]
    movimientos = sum(c.get("movimientos") or 0 for c in j.get("cuentas") or [] if isinstance(c.get("movimientos"), int))
    return "ok" if movimientos else "incompleto: se mantienen los datos anteriores"


def extraer(banco, env):
    """Extrae un banco con un reintento; respeta el bloqueo por rechazo de clave."""
    if (DIR_FPC / "bloqueos" / banco).exists():
        return "bloqueado: revisar la clave"
    resultado = "error"
    for intento in range(2):
        codigo, salida = correr(["node", "correr.mjs", banco], env, cwd=RAIZ / "extractores" / "bancos", limite=480)
        resultado = resultado_extraccion(salida)
        # Un login trabado o un rechazo no se reintenta: insistir puede bloquear la clave
        if resultado == "ok" or "revisar a mano" in resultado or (DIR_FPC / "bloqueos" / banco).exists():
            break
        if intento == 0:
            time.sleep(30)
    return resultado


def solicitud_pendiente(cur, usuario):
    """Toma la solicitud pendiente más antigua; crea la programada de la mañana si corresponde."""
    cur.execute("""
        update finanzas.solicitud_actualizacion set estado = 'error', terminada = now(), detalle = 'se interrumpió'
        where usuario_id = %s and estado = 'corriendo' and iniciada < now() - interval '40 minutes'
    """, (usuario,))
    ahora = dt.datetime.now(ZONA)
    # La corrida diaria parte desde las 7:00; si el equipo estaba apagado o dormido, apenas despierte
    if ahora.hour >= HORA_PROGRAMADA:
        cur.execute("""
            insert into finanzas.solicitud_actualizacion (usuario_id, origen)
            select %s, 'programada'
            where not exists (select 1 from finanzas.solicitud_actualizacion
                              where usuario_id = %s and origen = 'programada'
                                and (creada at time zone 'America/Santiago')::date = %s)
            on conflict do nothing
        """, (usuario, usuario, ahora.date()))
    cur.execute("""
        select solicitud_id from finanzas.solicitud_actualizacion
        where usuario_id = %s and estado = 'pendiente' order by creada limit 1
    """, (usuario,))
    fila = cur.fetchone()
    return fila[0] if fila else None


def atender(cur, solicitud, env):
    """Corre la actualización completa y va dejando el avance en la solicitud."""
    pasos = {}

    def avance(estado=None, detalle=None):
        cur.execute("""
            update finanzas.solicitud_actualizacion
            set pasos = %s, estado = coalesce(%s, estado), detalle = coalesce(%s, detalle),
                terminada = case when %s in ('ok', 'parcial', 'error') then now() else terminada end
            where solicitud_id = %s
        """, (json.dumps(pasos), estado, detalle, estado, solicitud))

    cur.execute("update finanzas.solicitud_actualizacion set estado = 'corriendo', iniciada = now() where solicitud_id = %s",
                (solicitud,))
    if not asegurar_floci(env):
        pasos["floci"] = "no se pudo levantar Docker"
        return avance("error", "Docker o floci no están disponibles en el equipo")

    for banco in BANCOS:
        pasos[banco] = "corriendo"
        avance()
        pasos[banco] = extraer(banco, env)
        registro(f"{banco}: {pasos[banco]}")
        avance()

    pasos["carga"] = "corriendo"
    avance()
    codigo, salida = correr(["bash", "scripts/cargar_bodega.sh"], env, limite=900)
    pasos["carga"] = "ok" if "cuadraturas OK: True" in salida else ("no cuadra" if codigo == 0 else "error")
    if pasos["carga"] == "error":
        registro(salida[-800:])
        return avance("error", "Falló la carga de la bodega")

    pasos["publicacion"] = "corriendo"
    avance()
    destino = DIR_FPC / "publicacion.json"
    codigo, salida = correr(["aws", "lambda", "invoke", "--function-name", "fpc-publicar-supabase", "--cli-read-timeout", "300",
                             str(destino), "--query", "FunctionError", "--output", "text"], env, limite=400)
    if codigo != 0 or salida.strip() not in ("None", ""):
        pasos["publicacion"] = "error"
        registro(salida[-800:])
        return avance("error", "Falló la publicación en Supabase")
    pasos["publicacion"] = "ok"
    cur.execute("select finanzas.tomar_foto_balance()")

    bancos_ok = all(pasos[b] == "ok" for b in BANCOS)
    estado = "ok" if bancos_ok and pasos["carga"] == "ok" else "parcial"
    detalle = None if estado == "ok" else "Algún banco o la cuadratura no salió completa; se publicó lo que había"
    avance(estado, detalle)
    registro(f"solicitud {solicitud}: {estado}")


def main():
    """Toma el candado, revisa si hay algo que hacer y lo atiende."""
    DIR_FPC.mkdir(exist_ok=True)
    candado = open(DIR_FPC / "actualizacion.lock", "w")
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    env = entorno()
    usuario = env.get("FPC_USUARIO_ID")
    if not usuario:
        sys.exit("falta FPC_USUARIO_ID en .env")
    with psycopg.connect(url_supabase(), autocommit=True, prepare_threshold=None, connect_timeout=20) as conexion:
        with conexion.cursor() as cur:
            solicitud = solicitud_pendiente(cur, usuario)
            if solicitud:
                registro(f"atendiendo solicitud {solicitud}")
                atender(cur, solicitud, env)


if __name__ == "__main__":
    main()

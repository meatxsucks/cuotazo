import hashlib
import hmac
import re
import unicodedata
from datetime import date

BANCOS = ("santander", "falabella", "bci")
TIPOS_EXCLUIDOS = {"cuota_informativa"}
SALDO_INICIAL = re.compile(r"^SALDO INICIAL")
PREFIJOS_COMERCIO = re.compile(
    r"^(COMPRA CON TARJETA DE DEBITO EN|COMPRA (NACIONAL|INTERNACIONAL|NAC|INT|EN|WEB)|COMPRAS?|PAGO EN|CARGO POR COMPRA|TRANSACCION|POS)\s+"
)
INTERMEDIARIOS = re.compile(r"^(MERPAGO|MERCADOPAGO|MP|DL|PAYU|SUMUP|TUU|FLOW|KHIPU|GETNET|WEBPAY|PAYPAL|SQ|SP|GOOGLE)\s?\*\s?")
TRANSFERENCIA_A_PERSONA = re.compile(
    r"^(?P<pre>.*?\bTRANSF[A-Z.]*\s+(?:(?:ENVIADA|RECIBIDA|ELECTRONICA)\s+)?(?:(?:A|DE|PARA)\s+)?)(?P<nombre>.+?)\s*$", re.I
)
NO_PERSONA = re.compile(
    r"\d|\b(PAGO|TARJETA|CMR|CUENTAS?|SOC|SOCIEDAD|BANCO|LIMITADA|LTDA|SPA|S\.?A\.?|EIRL|E\.I\.R\.L|CONDOMINIO|COMUNIDAD|EDIFICIO|"
    r"MEDIO|INVERSIONES?|COMERCIAL|SERVICIOS?|FUNDACION|CORPORACION|MUNICIPALIDAD|SEGUROS?|ISAPRE|CAJA|COOPERATIVA|"
    r"UNIVERSIDAD|COLEGIO|CLINICA|SUSHI|RESTAURANT|TESORERIA|RECAUDACION|EMPRESAS?|CIA|COMPANIA|ADMINISTRADORA|INMOBILIARIA|ELECTRONICAS?|ENTRE)\b"
)
SIN_COMERCIO = re.compile(r"^(TRASPASO|TRANSF|TEF|PAGO (TARJETA|TC|CMR|LINEA|DE TARJETA|DEUDA)|ABONO|DEPOSITO|GIRO|CARGO|INTERES|COMISION|IMPUESTO|SEGURO|REMUNERACION|SUELDO|PAC|DIVIDENDO|AVANCE)")


# Texto
def normalizar_texto(texto):
    """Mayúsculas sin tildes ni espacios repetidos."""
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t.upper()).strip()


def comercio(glosa_norm):
    """Nombre de comercio limpio desde la glosa normalizada, o None si la glosa no es de un comercio."""
    t = re.sub(r"^\d+\s*", "", glosa_norm or "")
    if not t or SIN_COMERCIO.match(t):
        return None
    t = PREFIJOS_COMERCIO.sub("", t)
    t = INTERMEDIARIOS.sub("", t)
    t = re.sub(r"\b\d{2}/\d{2}(/\d{2,4})?\b", " ", t)
    t = re.sub(r"[*#]+|\b\d{3,}\b|\bCUOTA \d+(/\d+)?\b", " ", t)
    t = re.sub(r"\s+", " ", re.sub(r"\s?CHL$", "", t)).strip(" -.,")
    return t[:60] or None


def glosa_publica(glosa, clave):
    """Glosa con el nombre de la persona de una transferencia reemplazado por un seudónimo HMAC estable."""
    m = TRANSFERENCIA_A_PERSONA.match(glosa or "")
    if not m or NO_PERSONA.search(normalizar_texto(m["nombre"])):
        return glosa
    firma = hmac.new(clave.encode(), normalizar_texto(m["nombre"]).encode(), hashlib.sha256).hexdigest()[:4]
    return f"{m['pre']}Persona {firma}"


# Fechas
def fecha(valor):
    """Fecha desde texto ISO (se ignora la hora)."""
    if not valor or not isinstance(valor, str) or not re.match(r"^\d{4}-\d{2}-\d{2}", valor):
        return None
    return date.fromisoformat(valor[:10])


def sumar_meses(f, meses):
    """Primer día del mes que resulta de sumar meses a la fecha."""
    total = f.year * 12 + f.month - 1 + meses
    return date(total // 12, total % 12 + 1, 1)


def sumar_meses_dia(f, meses):
    """Misma fecha desplazada en meses, ajustando al último día válido."""
    base = sumar_meses(f, meses)
    for dia in (f.day, 30, 29, 28):
        try:
            return base.replace(day=dia)
        except ValueError:
            continue


def cuota_cero(m):
    """Compra en cuotas cuya primera cuota se cobra el mes siguiente (cuota 0/N)."""
    return (m.get("cuotas_total") or 0) > 1 and m.get("cuota_actual") == 0


def clave_compra(m):
    """Identifica una compra en cuotas por glosa normalizada, monto total y número de cuotas."""
    return (normalizar_texto(m.get("glosa")), abs(entero(m.get("monto_total")) or 0), m.get("cuotas_total"))


def compras_conocidas(filas):
    """Compras en cuotas que ya vienen con cuota 1 o mayor."""
    return {clave_compra(m) for m in filas if (m.get("cuotas_total") or 0) > 1 and (m.get("cuota_actual") or 0) >= 1}


def cargar_cuota_cero(c, pid, m, conocidas, **kw):
    """Descarta la compra 0/N si ya viene con cuota 1; si no, la carga con su primera cuota el mes siguiente."""
    if clave_compra(m) in conocidas:
        c.excluido()
        return
    f = fecha(m.get("fecha"))
    c.movimiento(pid, {**m, "cuota_actual": 1}, "facturado", imputar=sumar_meses_dia(f, 1) if f else None, **kw)


def pagado_desde(movimientos, facturacion):
    """Suma de abonos a la tarjeta posteriores a la fecha de facturación."""
    return sum(entero(m.get("monto")) or 0 for m in movimientos
               if (m.get("monto") or 0) > 0 and fecha(m.get("fecha")) and fecha(m.get("fecha")) > facturacion)


def facturacion_tarjeta(facturado, fecha_facturacion, pagado, por_facturar, proxima):
    """Columnas de facturación del último estado de una tarjeta."""
    return {"monto_facturado": entero(facturado), "fecha_facturacion": fecha_facturacion, "monto_pagado": entero(pagado),
            "monto_por_facturar": entero(por_facturar), "fecha_proxima_facturacion": proxima}


def imputacion(f, cuota_actual, cuotas_total, tope):
    """Fecha en que se imputa el gasto: la compra más (cuota - 1) meses si es en cuotas, sin pasar del tope."""
    if cuotas_total and cuotas_total > 1 and cuota_actual and cuota_actual > 1:
        return max(f, min(sumar_meses_dia(f, cuota_actual - 1), tope))
    return f


# Números
def entero(v):
    """Entero redondeado o None."""
    return None if v is None or v == "" else int(round(float(v)))


def terminacion(texto):
    """Últimos cuatro dígitos de un texto, o None."""
    m = re.search(r"(\d{4})\D*$", str(texto or ""))
    return m.group(1) if m else None


class Corrida:
    """Acumula las filas normalizadas de una corrida de un banco para un usuario."""

    def __init__(self, usuario_id, banco, corrida, extraido, uf, clave):
        self.base = {"usuario_id": usuario_id, "banco": banco, "corrida": corrida}
        self.extraido = extraido
        self.hoy = fecha(extraido) or date.today()
        self.uf = uf
        self.clave = clave
        self.avisos = []
        self.productos, self.movimientos, self.deudas, self.cuotas_mes, self.saldos, self.estados = [], [], [], [], [], []
        self.movimientos_raw = 0
        self.descartados = 0
        self._ids = set()

    def producto(self, producto_id, tipo, nombre, terminacion_=None, moneda="CLP"):
        """Registra un producto y devuelve su id."""
        self.productos.append({**self.base, "producto_id": producto_id, "producto_tipo": tipo, "nombre": nombre, "terminacion": terminacion_, "moneda": moneda})
        return producto_id

    def movimiento(self, producto_id, m, estado, id_banco=None, tipo_origen=None, periodo=None, monto_total=None, imputar=None):
        """Normaliza un movimiento; descarta los que no tienen fecha o son saldo inicial."""
        self.movimientos_raw += 1
        f = fecha(m.get("fecha"))
        monto = entero(m.get("monto"))
        if f is None or monto is None or SALDO_INICIAL.match(normalizar_texto(m.get("glosa"))):
            self.descartados += 1
            return
        glosa = (m.get("glosa") or "").strip()
        cuota, cuotas = m.get("cuota_actual"), m.get("cuotas_total")
        if id_banco:
            mid = f"{self.base['banco']}:{id_banco}"
        else:
            clave = "|".join(str(x) for x in (self.base["banco"], producto_id, f, glosa, monto, cuota or ""))
            mid = f"{self.base['banco']}:h:{hashlib.sha1(clave.encode()).hexdigest()[:24]}"
        base_id, n = mid, 1
        while mid in self._ids:
            n += 1
            mid = f"{base_id}:{n}"
        self._ids.add(mid)
        gn = normalizar_texto(glosa)
        self.movimientos.append({
            **self.base,
            "producto_id": producto_id,
            "movimiento_id": mid,
            "fecha": f,
            "fecha_imputacion": imputar or imputacion(f, cuota, cuotas, periodo if estado == "facturado" and periodo else self.hoy),
            "glosa": glosa,
            "glosa_norm": gn,
            "glosa_publica": glosa_publica(glosa, self.clave),
            "comercio": comercio(gn),
            "monto": monto,
            "monto_total_compra": entero(monto_total) if cuotas and cuotas > 1 else None,
            "cuota_actual": cuota,
            "cuotas_total": cuotas,
            "estado": estado,
            "tipo_origen": tipo_origen,
            "periodo": periodo,
        })

    def excluido(self):
        """Cuenta un movimiento del raw que no se carga por ser informativo."""
        self.movimientos_raw += 1
        self.descartados += 1

    def deuda(self, producto_id, tipo, nombre, moneda="CLP", **campos):
        """Registra la foto de deuda de un producto de crédito."""
        self.deudas.append({**self.base, "producto_id": producto_id, "tipo": tipo, "nombre": nombre or next(p["nombre"] for p in self.productos if p["producto_id"] == producto_id), "moneda": moneda, "actualizado": self.extraido, **campos})

    def cuota_mes(self, producto_id, mes, fuente, monto, moneda="CLP"):
        """Registra un monto comprometido para un mes futuro, sumando si ya existe."""
        if monto is None or monto == 0:
            return
        for c in self.cuotas_mes:
            if (c["producto_id"], c["mes"], c["fuente"]) == (producto_id, mes, fuente):
                c["monto"] += abs(monto)
                return
        self.cuotas_mes.append({**self.base, "producto_id": producto_id, "mes": mes, "fuente": fuente, "moneda": moneda, "monto": abs(monto)})

    def saldo(self, producto_id, disponible, contable):
        """Registra el saldo de una cuenta a la fecha de extracción."""
        self.saldos.append({**self.base, "producto_id": producto_id, "fecha": self.hoy, "saldo_disponible": entero(disponible), "saldo_contable": entero(contable), "actualizado": self.extraido})

    def estado(self, producto_id, e):
        """Registra la cabecera de un estado de cuenta de tarjeta."""
        if fecha(e.get("fecha_facturacion")):
            self.estados.append({
                **self.base,
                "producto_id": producto_id,
                "fecha_facturacion": fecha(e.get("fecha_facturacion")),
                "fecha_vencimiento": fecha(e.get("fecha_vencimiento")),
                "saldo_anterior": entero(e.get("saldo_anterior")),
                "monto_facturado": entero(e.get("monto_facturado")),
                "pago_minimo": entero(e.get("pago_minimo")),
                "cuadra": e.get("cuadra"),
            })

    def distinguir_nombres(self):
        """Agrega la terminación (o un correlativo) a los productos del mismo tipo y nombre para que el nombre sea único."""
        vistos = {}
        for p in self.productos:
            vistos.setdefault((p["producto_tipo"], p["nombre"]), []).append(p)
        nombres = {}
        for grupo in vistos.values():
            for i, p in enumerate(grupo, 1):
                if len(grupo) > 1:
                    p["nombre"] = f"{p['nombre']} …{p['terminacion']}" if p["terminacion"] else f"{p['nombre']} {i}"
                nombres[p["producto_id"]] = p["nombre"]
        for d in self.deudas:
            d["nombre"] = nombres.get(d["producto_id"], d["nombre"])

    def uf_a(self, f):
        """Valor de la UF vigente a la fecha (o la anterior más cercana)."""
        previas = [k for k in self.uf if k <= f]
        return self.uf[max(previas)] if previas else None

    def credito_meses(self, producto_id, desde, restantes, valor, moneda, fuente):
        """Proyecta la cuota de un crédito por cada mes restante."""
        if valor is None or not restantes or not desde:
            return
        for k in range(int(restantes)):
            self.cuota_mes(producto_id, sumar_meses(desde, k), fuente, valor, moneda)


# Santander
def santander(c, j):
    """Normaliza una corrida de Santander."""
    for i, cta in enumerate(j.get("cuentas") or [], 1):
        pid = c.producto(f"santander:cuenta:{i}", "cuenta", "Cuenta Corriente" if cta.get("tipo") == "corriente" else "Cuenta Vista")
        for m in cta.get("movimientos") or []:
            c.movimiento(pid, m, "contable", id_banco=f"cc{i}:{m['id']}" if m.get("id") else None)
        c.saldo(pid, cta.get("saldo_disponible") if cta.get("saldo_disponible") is not None else cta.get("saldo_total"), cta.get("saldo_total"))

    for i, t in enumerate(j.get("tarjetas") or [], 1):
        fin = terminacion(t.get("terminacion"))
        pid = c.producto(f"santander:tarjeta:{fin or i}", "tarjeta", t.get("nombre") or "Tarjeta de crédito", fin)
        for m in t.get("movimientos_no_facturados") or []:
            c.movimiento(pid, m, "no_facturado", tipo_origen="compra" if (m.get("monto") or 0) < 0 else "abono")
        estados = sorted(t.get("estados") or [], key=lambda e: e.get("fecha_facturacion") or "")
        conocidas = compras_conocidas([m for e in estados for m in e.get("movimientos") or []] + list(t.get("movimientos_no_facturados") or []))
        for e in estados:
            periodo = fecha(e.get("fecha_facturacion"))
            for m in e.get("movimientos") or []:
                if m.get("tipo") in TIPOS_EXCLUIDOS or cuota_cero(m):
                    cargar_cuota_cero(c, pid, m, conocidas, tipo_origen="compra", periodo=periodo, monto_total=m.get("monto_total"))
                    continue
                c.movimiento(pid, m, "facturado", tipo_origen=m.get("tipo"), periodo=periodo, monto_total=m.get("monto_total"))
            c.estado(pid, e)
        ultimo = estados[-1] if estados else {}
        cupo = t.get("cupo_nacional") or {}
        tasa = ultimo.get("tasa_interes_periodo")
        venc = fecha(ultimo.get("fecha_vencimiento"))
        facturacion = fecha(ultimo.get("fecha_facturacion"))
        no_facturados = t.get("movimientos_no_facturados") or []
        c.deuda(
            pid, "tarjeta", t.get("nombre"),
            cupo_total=cupo.get("total", ultimo.get("cupo")),
            usado=cupo.get("usado", ultimo.get("usado")),
            disponible=cupo.get("disponible", ultimo.get("disponible")),
            saldo_deuda=cupo.get("usado", ultimo.get("usado")),
            pago_minimo=ultimo.get("pago_minimo"),
            proximo_vencimiento=venc,
            tasa_mensual=tasa / 10000 if tasa else None,
            **facturacion_tarjeta(
                ultimo.get("monto_facturado"), facturacion,
                pagado_desde(no_facturados, facturacion) if facturacion else None,
                -sum(entero(m.get("monto")) or 0 for m in no_facturados if (m.get("monto") or 0) < 0),
                fecha(ultimo.get("fecha_proxima_facturacion")),
            ),
        )
        if venc:
            for k, v in enumerate(ultimo.get("cuotas_proximos_meses") or [], 1):
                c.cuota_mes(pid, sumar_meses(venc, k), "cuotas_proximos_meses", v)
            horizonte = len(ultimo.get("cuotas_proximos_meses") or [])
            for m in ultimo.get("movimientos") or []:
                total, actual = m.get("cuotas_total") or 0, m.get("cuota_actual") or 0
                if m.get("tipo") == "compra" and total > 1:
                    for k in range(horizonte + 1, total - actual + 1):
                        c.cuota_mes(pid, sumar_meses(venc, k), "cuotas_compras", m.get("monto"))

    for i, l in enumerate(j.get("lineas") or [], 1):
        pid = c.producto(f"santander:linea:{i}", "linea", l.get("nombre") or "Línea de crédito")
        c.deuda(pid, "linea", l.get("nombre"), cupo_total=l.get("cupo_total"), usado=l.get("usado"), disponible=l.get("disponible"), saldo_deuda=l.get("usado"))

    for i, cr in enumerate(j.get("creditos") or [], 1):
        tipo = "hipotecario" if cr.get("tipo") == "hipotecario" else "consumo"
        moneda = "UF" if str(cr.get("moneda") or "").upper() in ("UF", "CLF") else "CLP"
        nombre = "Crédito hipotecario" if tipo == "hipotecario" else "Crédito de consumo"
        pid = c.producto(f"santander:{tipo}:{i}", tipo, nombre, moneda=moneda)
        pagos = [p for p in cr.get("pagos") or [] if p.get("cuota")]
        pagadas = max((p["cuota"] for p in pagos), default=None)
        ultimo_pago = max((fecha(p.get("fecha")) for p in pagos if fecha(p.get("fecha"))), default=None) or fecha(cr.get("fecha_ultimo_pago"))
        valor = cr.get("valor_cuota")
        if moneda == "UF" and valor is not None:
            uf = c.uf_a(c.hoy)
            if uf is None:
                c.avisos.append(f"{pid}: sin UF para convertir el dividendo; valor_cuota queda nulo")
            valor = valor / float(uf) if uf else None
        proximo = sumar_meses_dia(ultimo_pago, 1) if ultimo_pago else None
        c.deuda(
            pid, tipo, nombre, moneda,
            saldo_deuda=cr.get("saldo_capital"),
            valor_cuota=valor,
            cuotas_pagadas=pagadas,
            cuotas_total=cr.get("cuotas_total"),
            fecha_termino=fecha(cr.get("fecha_vencimiento_final")),
            proximo_vencimiento=proximo,
        )
        if cr.get("cuotas_total") and pagadas is not None and proximo:
            c.credito_meses(pid, sumar_meses(proximo, 0), cr["cuotas_total"] - pagadas, valor, moneda, "dividendo" if tipo == "hipotecario" else "cuota_credito")


# Falabella
def falabella(c, j):
    """Normaliza una corrida de Banco Falabella."""
    for i, cta in enumerate(j.get("cuentas") or [], 1):
        fin = terminacion(cta.get("terminacion"))
        pid = c.producto(f"falabella:cuenta:{fin or i}", "cuenta", "Cuenta Vista" if cta.get("tipo") == "vista" else "Cuenta Corriente", fin)
        for m in cta.get("movimientos") or []:
            c.movimiento(pid, m, "contable", id_banco=m.get("id"))
        c.saldo(pid, cta.get("saldo_disponible"), cta.get("saldo_contable"))

    for i, t in enumerate(j.get("tarjetas") or [], 1):
        fin = terminacion(t.get("terminacion"))
        pid = c.producto(f"falabella:tarjeta:{fin or i}", "tarjeta", t.get("nombre") or "CMR", fin)
        ultimo = t.get("ultimo_estado") or {}
        periodo_actual = fecha(ultimo.get("fecha_facturacion"))
        conocidas = compras_conocidas(list(t.get("movimientos") or []) + [m for e in t.get("estados_anteriores") or [] for m in e.get("movimientos") or []])
        for m in t.get("movimientos") or []:
            estado = m.get("estado") if m.get("estado") in ("facturado", "no_facturado", "pendiente") else "no_facturado"
            if cuota_cero(m):
                cargar_cuota_cero(c, pid, m, conocidas, id_banco=m.get("id"), tipo_origen=m.get("categoria"), periodo=periodo_actual, monto_total=m.get("monto_total"))
                continue
            c.movimiento(pid, m, estado, id_banco=m.get("id"), tipo_origen=m.get("categoria"), periodo=periodo_actual if estado == "facturado" else None, monto_total=m.get("monto_total"))
        for e in t.get("estados_anteriores") or []:
            periodo = fecha(e.get("fecha_facturacion"))
            for m in e.get("movimientos") or []:
                if cuota_cero(m):
                    cargar_cuota_cero(c, pid, m, conocidas, id_banco=m.get("id"), tipo_origen=m.get("categoria"), periodo=periodo, monto_total=m.get("monto_total"))
                    continue
                c.movimiento(pid, m, "facturado", id_banco=m.get("id"), tipo_origen=m.get("categoria"), periodo=periodo, monto_total=m.get("monto_total"))
        c.estado(pid, ultimo)
        cupo = t.get("cupo_nacional") or {}
        proximo = t.get("proximo_estado") or {}
        facturado = entero(ultimo.get("monto_facturado"))
        # El monto_pagado del raw son los pagos del período; lo pagado del último estado sale de la deuda pendiente
        pagado = max(facturado - entero(t["deuda_pendiente"]), 0) if facturado is not None and t.get("deuda_pendiente") is not None \
            else pagado_desde(t.get("movimientos") or [], periodo_actual) if periodo_actual else None
        venc_ultimo = fecha(ultimo.get("fecha_vencimiento"))
        c.deuda(
            pid, "tarjeta", t.get("nombre"),
            cupo_total=cupo.get("total"), usado=cupo.get("usado"), disponible=cupo.get("disponible"), saldo_deuda=cupo.get("usado"),
            pago_minimo=ultimo.get("pago_minimo"),
            proximo_vencimiento=venc_ultimo if venc_ultimo and venc_ultimo >= c.hoy
            else fecha(t.get("proximo_vencimiento")) or fecha(proximo.get("fecha_vencimiento")),
            **facturacion_tarjeta(
                facturado, periodo_actual, pagado, proximo.get("monto_por_facturar"),
                fecha(proximo.get("fecha_facturacion")) or fecha(t.get("proxima_facturacion")),
            ),
        )
        for p in t.get("cuotas_proyectadas") or []:
            f = fecha(p.get("fecha_vencimiento")) or fecha(p.get("fecha_facturacion"))
            if f and str(p.get("moneda") or "152") in ("152", "CLP"):
                c.cuota_mes(pid, sumar_meses(f, 0), "cuotas_proyectadas", entero(p.get("monto")))

    for i, l in enumerate(j.get("lineas") or [], 1):
        pid = c.producto(f"falabella:linea:{i}", "linea", l.get("nombre") or "Línea de crédito")
        c.deuda(pid, "linea", l.get("nombre"), cupo_total=l.get("cupo_total"), usado=l.get("usado"), disponible=l.get("disponible"), saldo_deuda=l.get("usado"))

    for i, cr in enumerate(j.get("creditos") or [], 1):
        nombre = cr.get("nombre") or "Crédito de consumo"
        tipo = "hipotecario" if re.search(r"hipotec", nombre, re.I) else "consumo"
        moneda = "UF" if str(cr.get("moneda") or "").upper() in ("UF", "CLF") else "CLP"
        pid = c.producto(f"falabella:{tipo}:{i}", tipo, nombre, moneda=moneda)
        valor = cr.get("valor_cuota") or cr.get("proxima_cuota_monto") or None
        total, pagadas = cr.get("cuotas_total"), cr.get("cuotas_pagadas")
        restantes = cr.get("cuotas_pendientes") if cr.get("cuotas_pendientes") is not None else (total - pagadas if total and pagadas is not None else None)
        proximo = fecha(cr.get("proxima_cuota_fecha"))
        c.deuda(
            pid, tipo, nombre, moneda,
            saldo_deuda=cr.get("saldo_capital"), valor_cuota=valor, cuotas_pagadas=pagadas, cuotas_total=total,
            proximo_vencimiento=proximo, tasa_mensual=cr.get("tasa_mensual"), cae=cr.get("cae"),
        )
        if proximo is None:
            c.avisos.append(f"{pid}: sin fecha de próxima cuota; la proyección parte el mes siguiente a la extracción")
        c.credito_meses(pid, sumar_meses(proximo or c.hoy, 0 if proximo else 1), restantes, valor, moneda, "cuota_credito")


# BCI
def bci(c, j):
    """Normaliza una corrida de BCI."""
    nombres = {"cuenta_corriente": "Cuenta Corriente", "cuenta_prima": "Cuenta Prima"}
    for i, cta in enumerate(j.get("cuentas") or [], 1):
        fin = terminacion(cta.get("numero"))
        pid = c.producto(f"bci:cuenta:{fin or i}", "cuenta", nombres.get(cta.get("tipo"), "Cuenta"), fin)
        for m in cta.get("movimientos") or []:
            c.movimiento(pid, m, "contable", id_banco=m.get("id"))
        c.saldo(pid, cta.get("saldoDisponible"), cta.get("saldoContable"))

    for i, l in enumerate(j.get("lineas") or [], 1):
        fin = terminacion(l.get("cuenta"))
        nombre = "Línea de sobregiro" if l.get("tipo") == "sobregiro" else "Línea de emergencia"
        pid = c.producto(f"bci:linea:{l.get('tipo')}:{fin or i}", "linea", nombre)
        c.deuda(pid, "linea", nombre, cupo_total=l.get("cupo"), usado=l.get("usado"), disponible=l.get("disponible"), saldo_deuda=l.get("usado"))

    # Lo que BCI muestra como créditos no es deuda real del usuario (ofertas o simulaciones); no se carga hasta verificarlo
    if j.get("creditos"):
        c.avisos.append(f"bci: {len(j['creditos'])} crédito(s) del portal ignorados (no son deuda confirmada)")
    for i, cr in enumerate([], 1):
        tipo = "hipotecario" if cr.get("tipo") == "hipotecario" else "consumo"
        moneda = "UF" if cr.get("moneda") == "UF" else "CLP"
        nombre = "Crédito hipotecario" if tipo == "hipotecario" else "Crédito de consumo"
        pid = c.producto(f"bci:{tipo}:{terminacion(cr.get('operacion')) or i}", tipo, nombre, moneda=moneda)
        total, pagadas = cr.get("cuotasTotales"), cr.get("cuotasPagadas")
        proximo = fecha(cr.get("proximoVencimiento"))
        c.deuda(
            pid, tipo, nombre, moneda,
            saldo_deuda=cr.get("saldo"), valor_cuota=cr.get("valorCuota"), cuotas_pagadas=pagadas, cuotas_total=total,
            fecha_termino=fecha(cr.get("ultimoVencimiento")), proximo_vencimiento=proximo,
        )
        if total and pagadas is not None:
            c.credito_meses(pid, sumar_meses(proximo or c.hoy, 0 if proximo else 1), total - pagadas, cr.get("valorCuota"), moneda, "dividendo" if tipo == "hipotecario" else "cuota_credito")
    if j.get("tarjetas"):
        c.avisos.append("bci: tarjetas presentes en raw sin normalizador")


NORMALIZADORES = {"santander": santander, "falabella": falabella, "bci": bci}


def normalizar(usuario_id, corrida, j, uf, clave):
    """Normaliza el JSON de una corrida y devuelve el acumulador con las filas de stage."""
    c = Corrida(usuario_id, j["banco"], corrida, j.get("extraido"), uf, clave)
    NORMALIZADORES[j["banco"]](c, j)
    c.distinguir_nombres()
    return c

import { pathToFileURL } from "node:url";
import { abrirNavegador, bloquear, credenciales, ocultar, RECHAZO, registrarRed } from "../comun.mjs";

const URL_LOGIN = "https://www.bci.cl/corporativo/banco-en-linea/personas";
const API_CUENTAS = "https://apilocal.bci.cl/bci-produccion/api-bci/bff-saldosyultimosmovimientoswebpersonas/v3.2";
const SEGUNDO_FACTOR = /clave din[aá]mica|segundo factor|bci pass|aprobaci[oó]n en tu app|autorizar en tu app|confirmar en tu app|c[oó]digo de verificaci[oó]n/i;
const CABECERAS_FUERA = /^(sec-|:|host$|content-length$|cookie$|accept-encoding$|connection$|user-agent$|referer$|origin$|accept-language$)/i;

const espera = (pagina, ms) => pagina.waitForTimeout(ms);
const monto = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const dia = (v) => (typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : null);

/** Texto visible de la página y de todos sus frames. */
async function textoTotal(pagina) {
  let texto = "";
  for (const f of pagina.frames()) {
    try {
      texto += "\n" + (await f.evaluate(() => document.body?.innerText ?? ""));
    } catch {}
  }
  return texto;
}

/** Hace clic en el primer enlace del menú con ese título, en cualquier frame. */
async function clicTitulo(pagina, titulo) {
  for (const f of pagina.frames()) {
    try {
      const hecho = await f.evaluate((t) => {
        const el = [...document.querySelectorAll("a[title]")].find((a) => a.getAttribute("title") === t);
        if (!el) return false;
        el.click();
        return true;
      }, titulo);
      if (hecho) return true;
    } catch {}
  }
  return false;
}

/** Inicia sesión; lanza ante rechazo, segundo factor o si no llega al portal. */
async function iniciarSesion(pagina) {
  const { rut, password } = credenciales("bci");
  await pagina.goto(URL_LOGIN, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pagina.waitForSelector("#rut_aux", { timeout: 20000 });
  await espera(pagina, 2000);
  const limpio = rut.replace(/[.\-\s]/g, "");
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  await pagina.click("#rut_aux");
  await pagina.keyboard.type(`${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`, { delay: 60 });
  await pagina.click("#clave");
  await pagina.keyboard.type(password, { delay: 60 });
  await pagina.evaluate(([c, d]) => {
    document.getElementById("rut").value = c;
    document.getElementById("dig").value = d;
  }, [cuerpo, dv]);
  await espera(pagina, 800);
  await Promise.all([
    pagina.waitForNavigation({ timeout: 45000 }).catch(() => {}),
    pagina.evaluate(() => {
      const boton = document.querySelector('#frm button[type="submit"]');
      if (boton) {
        boton.disabled = false;
        boton.click();
      } else document.getElementById("frm").submit();
    }),
  ]);
  await espera(pagina, 10000);

  const texto = await textoTotal(pagina);
  const enLogin = /login\.bci\.cl\/(?!web\/fe-dispositivos)|banco-en-linea\/personas/.test(pagina.url());
  if (enLogin && RECHAZO.test(texto)) {
    bloquear("bci", "el banco rechazó RUT o clave");
    throw new Error("bci rechazó las credenciales; banco bloqueado hasta revisar la clave");
  }
  if (enLogin && SEGUNDO_FACTOR.test(texto)) throw new Error("bci pide segundo factor; se detiene sin reintentar");

  // oferta opcional de registrar dispositivo de confianza
  for (let i = 0; i < 3 && /dispositivo-confianza/.test(pagina.url()); i++) {
    await pagina.evaluate(() => {
      const b = [...document.querySelectorAll("button,a")].find((x) => /^(omitir|ahora no|m[aá]s tarde)$/i.test((x.innerText ?? "").trim()));
      b?.click();
    });
    await espera(pagina, 12000);
  }
  if (!pagina.url().includes("personas.bci.cl")) throw new Error(`bci no llegó al portal: ${ocultar(pagina.url().split("?")[0])}`);
}

/** Cierra sesión desde el encabezado del portal. */
async function cerrarSesion(pagina) {
  await clicTitulo(pagina, "Mi Banco");
  await espera(pagina, 3000);
  await pagina.evaluate(() => {
    const el = [...document.querySelectorAll("a,button")].find((a) => /cerrar sesi[oó]n/i.test((a.innerText || a.title || "").trim()));
    el?.click();
  });
  await espera(pagina, 4000);
}

/** Convierte un movimiento de la API de últimos movimientos. */
function movimiento(m) {
  const absoluto = monto(m.monto) ?? 0;
  const hora = /T(\d\d:\d\d)/.exec(m.fechaMovimiento ?? "")?.[1];
  const detalle = Object.fromEntries((m.detalleMovimiento?.atributos ?? []).map((a) => [String(a.titulo).replace(/:\s*$/, "").trim(), a.valor]));
  return {
    id: m.idMovimiento ?? null,
    fecha: dia(m.fechaMovimiento),
    hora: hora && hora !== "00:00" ? hora : null,
    glosa: m.glosa?.trim() ?? "",
    monto: m.tipo === "C" ? -absoluto : absoluto,
    tipo: m.tipo === "C" ? "cargo" : m.tipo === "A" ? "abono" : m.tipo ?? null,
    saldo: null,
    categoria: m.detalleMovimiento?.tipo ?? null,
    detalle,
  };
}

/** Lee cuentas, saldos y últimos movimientos desde la app de últimos movimientos. */
async function extraerCuentas(pagina, red, avisos) {
  const esperaMov = pagina.waitForResponse((r) => r.url().includes("/cuentas-movimientos/por-numero-cuenta"), { timeout: 40000 });
  if (!(await clicTitulo(pagina, "Últimos Movimientos"))) {
    avisos.push("no se encontró el menú Últimos Movimientos");
    return { cuentas: [], lineas: [] };
  }
  const primera = await esperaMov;
  const cabeceras = Object.fromEntries(Object.entries(await primera.request().allHeaders()).filter(([k]) => !CABECERAS_FUERA.test(k)));
  const frame = primera.request().frame();
  await espera(pagina, 3000);

  let listado = red.capturas.get(`${API_CUENTAS}/cuentas-busquedas/por-rut`)?.at(-1)?.cuentas ?? [];
  if (!listado.length) {
    const productos = red.capturas.get("https://personas.bci.cl/api/ms-aplicaciones-mb-orq/v1.3/productosMB/state")?.at(-1);
    listado = (productos?.cuentasCorrientesYPrimas ?? []).map((o) => ({ numero: o.value, tipo: String(o.label).split(":")[0].trim() }));
  }
  if (!listado.length) avisos.push("sin listado de cuentas por RUT");

  const post = (ruta, cuerpo) =>
    frame.evaluate(
      async ({ url, headers, body }) => {
        const r = await fetch(url, { method: "POST", headers, body });
        return { estado: r.status, json: r.ok ? await r.json() : null };
      },
      { url: `${API_CUENTAS}${ruta}`, headers: cabeceras, body: JSON.stringify(cuerpo) },
    );

  const cuentas = [];
  const lineas = [];
  for (const c of listado) {
    const fin = c.numero.slice(-4);
    const det = await post("/cuentas-busquedas/por-numero-cuenta", { cuentaNumero: c.numero });
    const mov = await post("/cuentas-movimientos/por-numero-cuenta", { numeroCuenta: c.numero });
    if (det.estado !== 200) avisos.push(`cuenta …${fin}: detalle respondió ${det.estado}`);
    if (mov.estado !== 200) avisos.push(`cuenta …${fin}: movimientos respondió ${mov.estado}`);
    const d = det.json ?? {};
    const movimientos = (mov.json?.movimientos ?? []).map(movimiento);

    // saldo tras cada movimiento, hacia atrás desde el saldo contable (la API viene de más nuevo a más antiguo)
    const saldoContable = monto(d.saldoContable);
    if (saldoContable !== null && movimientos.length) {
      const orden = [...movimientos].sort((a, b) => `${b.fecha}${b.hora ?? ""}`.localeCompare(`${a.fecha}${a.hora ?? ""}`));
      let saldo = saldoContable;
      for (const m of orden) {
        m.saldo = saldo;
        saldo -= m.monto;
      }
    }

    cuentas.push({
      tipo: c.tipo === "Corriente" ? "cuenta_corriente" : c.tipo === "Prima" ? "cuenta_prima" : c.tipo,
      codigoTipo: d.tipo ?? null,
      numero: c.numero,
      estado: d.estado ?? null,
      moneda: "CLP",
      saldoDisponible: monto(d.saldoDisponible),
      saldoContable,
      retenciones: monto(d.retenciones),
      movimientos,
    });

    const lsg = d.lineaSobregiro;
    const usado = monto(lsg?.montoUtilizado) ?? 0;
    const disponible = monto(lsg?.saldoDisponible) ?? 0;
    if (usado + disponible > 0) {
      lineas.push({ tipo: "sobregiro", cuenta: c.numero, moneda: "CLP", cupo: usado + disponible, usado, disponible, tasa: null, intereses: null });
    }
    const emergencia = monto(d.lineaEmergencia?.saldoDisponible) ?? 0;
    if (emergencia > 0) {
      lineas.push({ tipo: "emergencia", cuenta: c.numero, moneda: "CLP", cupo: null, usado: null, disponible: emergencia, tasa: null, intereses: null });
    }
  }
  if (cuentas.some((c) => c.movimientos.length)) avisos.push("movimientos de cuenta: solo los últimos que entrega la API (hasta 50 por cuenta); saldo por movimiento calculado desde el saldo contable");
  if (lineas.some((l) => l.tipo === "sobregiro")) avisos.push("línea de sobregiro: tasa e intereses no disponibles en la API usada");
  return { cuentas, lineas };
}

/** Lee los créditos vigentes desde Créditos > Mis Créditos. */
async function extraerCreditos(pagina, red, avisos) {
  const ruta = "https://personas.bci.cl/api/ms-creditos-mb-orq/v1.3/resumenCreditosBackingMB/state";
  if (!(await clicTitulo(pagina, "Créditos"))) {
    avisos.push("no se encontró el menú Créditos");
    return [];
  }
  await espera(pagina, 6000);
  if (!(await clicTitulo(pagina, "Mis Créditos"))) {
    avisos.push("no se encontró el menú Mis Créditos");
    return [];
  }
  // el estado llega en varias respuestas; se espera a que se estabilice
  let previas = -1;
  for (let i = 0; i < 12; i++) {
    await espera(pagina, 2500);
    const n = red.capturas.get(ruta)?.length ?? 0;
    if (n > 0 && n === previas && i >= 4) break;
    previas = n;
  }
  const porOperacion = new Map();
  for (const estado of red.capturas.get(ruta) ?? []) {
    for (const c of estado?.creditosVigentes ?? []) porOperacion.set(c.numOperacion ?? c.idOperacion, c);
  }
  if (!red.capturas.get(ruta)?.length) avisos.push("sin respuesta del resumen de créditos");
  return [...porOperacion.values()].map((c) => ({
    tipo: /hipotec/i.test(`${c.glosaTipoOperacion} ${c.tipoCredito}`) ? "hipotecario" : /consum/i.test(`${c.glosaTipoOperacion} ${c.tipoCredito}`) ? "consumo" : "otro",
    descripcion: c.glosaTipoOperacion ?? null,
    codigoTipo: c.tipoCredito ?? null,
    operacion: c.numOperacion ?? null,
    deudor: c.tipoDeudor === "DIR" ? "directo" : c.tipoDeudor === "IND" ? "indirecto" : c.tipoDeudor ?? null,
    moneda: /peso/i.test(c.glosaMoneda ?? "") ? "CLP" : /uf/i.test(c.glosaMoneda ?? "") ? "UF" : c.glosaMoneda ?? null,
    montoOriginal: c.montoCredito ?? null,
    saldo: c.saldoCredito ?? null,
    valorCuota: c.valorCuota ?? null,
    valorCuotaFinal: c.saldoValorFinalCuota ?? null,
    cuotasPagadas: c.cuotasPagadas ?? null,
    cuotasTotales: c.numTotalCuotas ?? null,
    proximoVencimiento: dia(c.fecVencimiento),
    ultimoVencimiento: dia(c.fechaMaxVencimiento),
    fechaCurse: dia(c.fechaCurseOper),
    tasa: c.tasaSprea ?? null,
  }));
}

/** Entra a BCI personas y extrae cuentas, líneas, créditos y tarjetas. */
export async function extraerBci() {
  const salida = { banco: "bci", extraido: new Date().toISOString(), cuentas: [], tarjetas: [], lineas: [], creditos: [], avisos: [] };
  const { navegador, pagina } = await abrirNavegador();
  const red = registrarRed(pagina, ["bci.cl"]);
  let conSesion = false;
  try {
    await iniciarSesion(pagina);
    conSesion = true;
    await espera(pagina, 3000);

    const productos = red.capturas.get("https://personas.bci.cl/api/ms-aplicaciones-mb-orq/v1.3/productosMB/state")?.at(-1);
    if (productos?.tieneTarjeta) salida.avisos.push("el portal indica tarjeta de crédito, pero su extracción no está implementada");
    else if (productos) salida.avisos.push("sin tarjetas de crédito BCI según el portal");
    if (productos?.tieneLSG === false) salida.avisos.push("sin línea de sobregiro según el portal");

    try {
      Object.assign(salida, await extraerCuentas(pagina, red, salida.avisos));
    } catch (e) {
      salida.avisos.push(`cuentas: ${ocultar(e.message)}`);
    }
    try {
      salida.creditos = await extraerCreditos(pagina, red, salida.avisos);
    } catch (e) {
      salida.avisos.push(`créditos: ${ocultar(e.message)}`);
    }
    if (salida.creditos.length) salida.avisos.push("créditos: tasa tal como la entrega el banco (tasaSprea), sin unidad declarada");
  } finally {
    if (conSesion) await cerrarSesion(pagina).catch(() => {});
    await navegador.close();
  }
  return salida;
}

/** Indica por campo si viene lleno en todos, en algunos o en ninguno de los elementos. */
function llenado(lista) {
  const claves = [...new Set(lista.flatMap((x) => Object.keys(x)))].filter((k) => k !== "movimientos");
  const lleno = (v) => v !== null && v !== undefined && v !== "" && !(typeof v === "object" && !Object.keys(v).length);
  return Object.fromEntries(
    claves.map((k) => {
      const n = lista.filter((x) => lleno(x[k])).length;
      return [k, n === lista.length ? "lleno" : n ? `parcial ${n}/${lista.length}` : "vacío"];
    }),
  );
}

/** Rango de fechas de una lista de movimientos. */
function rango(movs) {
  const fechas = movs.map((m) => m.fecha).filter(Boolean).sort();
  return fechas.length ? `${fechas[0]} a ${fechas.at(-1)}` : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await extraerBci();
  const movs = r.cuentas.flatMap((c) => c.movimientos);
  console.log(
    JSON.stringify(
      {
        banco: r.banco,
        extraido: r.extraido,
        cuentas: r.cuentas.map((c) => ({ tipo: c.tipo, movimientos: c.movimientos.length, rango: rango(c.movimientos) })),
        camposCuenta: llenado(r.cuentas),
        camposMovimiento: llenado(movs),
        categorias: [...new Set(movs.map((m) => m.categoria))],
        tarjetas: r.tarjetas.length,
        lineas: r.lineas.map((l) => l.tipo),
        camposLinea: llenado(r.lineas),
        creditos: r.creditos.map((c) => ({ tipo: c.tipo, cuotas: `${c.cuotasPagadas}/${c.cuotasTotales}`, proximoVencimiento: c.proximoVencimiento })),
        camposCredito: llenado(r.creditos),
        avisos: r.avisos.map(ocultar),
      },
      null,
      1,
    ),
  );
}

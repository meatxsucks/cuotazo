import { pathToFileURL } from "node:url";
import { RECHAZO, abrirNavegador, bloquear, credenciales, ocultar, registrarRed } from "../comun.mjs";

const URL_BANCO = "https://banco.santander.cl/personas";
const DOMINIOS = ["santander.cl"];
const SEGUNDO_FACTOR = /santander pass|autoriza(r)? (el ingreso|en tu app)|clave din[aá]mica|segundo factor|superclave/i;
const MENU = { cuentas: "#menu-uid-0410", movimientos: "#menu-uid-0413", tarjetas: "#menu-uid-0420", misTc: ["#menu-uid-0421", "#menu-uid-042182"] };

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const teclado = (ctx) => ctx.keyboard ?? ctx.page().keyboard;

/** Marco donde vive la banca privada (menú lateral o carrusel), o la página si no hay marco. */
async function marcoApp(pagina, ms = 30000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    for (const f of pagina.frames()) {
      if (await f.locator("#menu-uid-0010").isVisible().catch(() => false) && (await f.locator("mat-expansion-panel-header").count().catch(() => 0)) >= 2) {
        await espera(3000);
        return f;
      }
    }
    const privado = pagina.frames().find((f) => /Private_new|UI\.Web\.HB/.test(f.url()));
    if (privado && (await privado.locator("body").innerText().catch(() => "")).length > 200) return privado;
    await espera(1000);
  }
  return pagina.mainFrame();
}

// Conversión de valores del banco

/** Número desde "0001.234", "3.990", "1234,5" o número. */
function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const negativo = /-\s*$|^\s*-/.test(v);
  const limpio = String(v).replace(/[^\d,]/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/** Fecha ISO desde "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd" o "aaaammdd". */
function fechaIso(v) {
  if (!v) return null;
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Objetos anidados que cumplen el predicado. */
function buscar(valor, predicado, salida = []) {
  if (Array.isArray(valor)) valor.forEach((v) => buscar(v, predicado, salida));
  else if (valor && typeof valor === "object") {
    if (predicado(valor)) salida.push(valor);
    Object.values(valor).forEach((v) => buscar(v, predicado, salida));
  }
  return salida;
}

/** Cuerpos capturados cuya ruta calza con el patrón. */
function cuerpos(red, patron) {
  return [...red.capturas.entries()].filter(([ruta]) => patron.test(ruta)).flatMap(([, lista]) => lista);
}

// Navegación

/** Clic en el primer selector o texto visible del menú lateral. */
async function clicMenu(pagina, selectores, textos) {
  for (const s of selectores) {
    const el = pagina.locator(s).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  for (const t of textos) {
    const el = pagina.getByText(t, { exact: false }).locator("visible=true").first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Cierra avisos y ventanas emergentes comunes. */
async function cerrarAvisos(pagina) {
  for (const t of [/^cerrar$/i, /^entendido$/i, /^ahora no$/i, /^omitir$/i, /^continuar$/i]) {
    const b = pagina.getByRole("button", { name: t }).first();
    if (await b.isVisible({ timeout: 800 }).catch(() => false)) await b.click().catch(() => {});
  }
  await teclado(pagina).press("Escape").catch(() => {});
}

/** Texto visible de la página y del iframe de login. */
async function textoVisible(pagina) {
  const partes = [await pagina.locator("body").innerText().catch(() => "")];
  const marco = pagina.frame({ name: "login-frame" }) ?? pagina.frames().find((f) => /login/i.test(f.url()));
  if (marco) partes.push(await marco.locator("body").innerText().catch(() => ""));
  return partes.join("\n");
}

/** Inicia sesión; lanza ante rechazo o segundo factor. */
async function iniciarSesion(pagina, rut, password) {
  await pagina.goto(URL_BANCO, { waitUntil: "domcontentloaded", timeout: 45000 });
  await espera(5000);
  await cerrarAvisos(pagina);
  const boton = pagina.locator("#btnIngresar").first();
  if (await boton.isVisible({ timeout: 5000 }).catch(() => false)) await boton.click();
  else await clicMenu(pagina, [], [/^ingresar$/i, /banco en l[ií]nea/i]);

  const iframe = pagina.locator("iframe#login-frame");
  await iframe.waitFor({ timeout: 20000 });
  const marco = pagina.frameLocator("iframe#login-frame");
  const campoRut = marco.locator("#rut");
  await campoRut.waitFor({ timeout: 20000 });
  await campoRut.click();
  await campoRut.pressSequentially(rut.replace(/[.\-\s]/g, ""), { delay: 60 });
  await espera(1500);
  const campoClave = marco.locator("#pass");
  await campoClave.click();
  await campoClave.pressSequentially(password, { delay: 60 });
  await espera(700);
  const enviar = marco.locator("button[type=submit], #btnIngresar, button:has-text('Ingresar')").first();
  if (await enviar.isVisible({ timeout: 2000 }).catch(() => false)) await enviar.click();
  else await campoClave.press("Enter");

  await pagina.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(8000);
  const texto = await textoVisible(pagina);
  if (RECHAZO.test(texto)) {
    bloquear("santander", "rechazo de credenciales");
    throw new Error("el banco rechazó RUT o clave; santander bloqueado");
  }
  if (SEGUNDO_FACTOR.test(texto) && (await iframe.isVisible().catch(() => false))) throw new Error("el banco pide segundo factor");
  if (await iframe.isVisible().catch(() => false)) throw new Error("el login no avanzó");
}

/** Recorre las cuentas desde Cuentas > Movimientos con el botón "Cuenta siguiente". */
async function recorrerCuentas(app) {
  await irInicio(app);
  await clicMenu(app, [MENU.cuentas], [/^cuentas$/i]);
  await espera(2000);
  await clicMenu(app, ["#menu-uid-0411"], [/^mis cuentas$/i]);
  await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(4000);
  await clicMenu(app, [MENU.movimientos], [/^movimientos$/i]);
  await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(5000);
  const texto = await app.locator("body").innerText().catch(() => "");
  const total = Number(texto.match(/cuenta\s+\d+\s+de\s+(\d+)/i)?.[1] ?? 1);
  for (let i = 1; i < total; i++) {
    const siguiente = app.getByRole("button", { name: /cuenta siguiente/i }).or(app.getByLabel(/cuenta siguiente/i)).first();
    await siguiente.click({ timeout: 5000 }).catch(() => {});
    await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await espera(5000);
  }
  return total;
}

/** Pestaña de tarjeta por texto. */
async function pestanaTarjeta(pagina, patron) {
  const el = pagina.getByText(patron).locator("visible=true").first();
  if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return false;
  await el.click({ timeout: 5000 }).catch(() => {});
  await pagina.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(4000);
  return true;
}

/** Vuelve al inicio de la banca privada. */
async function irInicio(app) {
  const volver = app.locator("#back-lvl2").first();
  if (await volver.isVisible({ timeout: 1500 }).catch(() => false)) {
    await volver.click().catch(() => {});
    await espera(1500);
  }
  await clicMenu(app, ["#menu-uid-0010"], [/^inicio$/i]);
  await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(4000);
}

/** Expande un panel del inicio por su título si está cerrado. */
async function expandirPanel(app, titulo) {
  const cabecera = app.locator("mat-expansion-panel-header").filter({ hasText: titulo }).first();
  if (!(await cabecera.isVisible({ timeout: 3000 }).catch(() => false))) return false;
  if ((await cabecera.getAttribute("aria-expanded").catch(() => "true")) !== "true") {
    await cabecera.click().catch(() => {});
    await espera(2500);
  }
  return true;
}

/** Recorre cada tarjeta del panel del inicio: detalle, por facturar y facturados. */
async function recorrerTarjetas(app, avisos) {
  await irInicio(app);
  if (!(await expandirPanel(app, /^\s*tarjetas/i))) avisos.push("tarjetas: no se encontró el panel del inicio");
  const patron = /\*\s*\d{4}/;
  const nombres = (await app.locator("mat-expansion-panel").filter({ has: app.locator("mat-expansion-panel-header", { hasText: /^\s*tarjetas/i }) }).locator("a, button, [role=button], .product, div").filter({ hasText: patron }).allInnerTexts().catch(() => []))
    .map((x) => x.split("\n")[0].trim())
    .filter((x) => patron.test(x) && x.length < 60)
    .filter((x, i, a) => a.indexOf(x) === i);
  if (!nombres.length) avisos.push("tarjetas: no se encontraron tarjetas en el panel");
  for (const [i, nombre] of nombres.entries()) {
    if (i > 0) {
      await irInicio(app);
      await expandirPanel(app, /^\s*tarjetas/i);
    }
    const tarjeta = app.getByText(nombre, { exact: false }).locator("visible=true").first();
    await tarjeta.click({ timeout: 5000 }).catch(() => {});
    await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await espera(5000);
    if (process.env.FPC_DEPURAR) avisos.push(`tarjeta ${i + 1} ui: ${JSON.stringify(await elementosMenu(app))}`);
    if (!(await pestanaTarjeta(app, /por facturar/i))) avisos.push(`tarjeta ${i + 1}: sin pestaña por facturar`);
    if (!(await pestanaTarjeta(app, /^\s*(movimientos )?facturados/i))) avisos.push(`tarjeta ${i + 1}: sin pestaña facturados`);
  }
  return nombres;
}

/** Abre el panel de créditos del inicio y el detalle de cada crédito. */
async function recorrerCreditos(app, avisos) {
  await irInicio(app);
  if (!(await expandirPanel(app, /^\s*cr[eé]ditos/i))) avisos.push("créditos: no se encontró el panel del inicio");
  await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await espera(4000);
  if (process.env.FPC_DEPURAR) avisos.push(`creditos ui: ${JSON.stringify(await elementosMenu(app))}`);
  const credito = app.locator("mat-expansion-panel").filter({ has: app.locator("mat-expansion-panel-header", { hasText: /^\s*cr[eé]ditos/i }) }).getByText(/hipotecario|consumo|cr[eé]dito/i).locator("visible=true").nth(1);
  if (await credito.isVisible({ timeout: 2000 }).catch(() => false)) {
    await credito.click().catch(() => {});
    await app.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await espera(6000);
  }
}

/** Elementos clicables de la interfaz con texto corto e id, sin números. */
async function elementosMenu(pagina) {
  return pagina.evaluate(() => {
    const corto = (t) => (t ?? "").replace(/\s+/g, " ").trim().replace(/\d/g, "#").slice(0, 35);
    return [...document.querySelectorAll("a, button, [role=menuitem], [role=button], li[id^=menu], [id^=menu-uid]")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((e) => `${e.id ? `#${e.id} ` : ""}${corto(e.innerText || e.getAttribute("aria-label"))}`)
      .filter((t) => t.trim() && !/^#+$/.test(t.trim()))
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 80);
  });
}

/** Cierra la sesión en el banco. */
async function cerrarSesion(pagina) {
  const boton = pagina.getByText(/cerrar sesi[oó]n/i).locator("visible=true").first();
  if (await boton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await boton.click().catch(() => {});
    await espera(3000);
    return true;
  }
  await pagina.evaluate(() => window.dispatchEvent(new Event("triggerLogout"))).catch(() => {});
  await espera(2000);
  return false;
}

// Interpretación de las respuestas

/** Divide por el factor si el valor existe. */
const escala = (v, factor) => (numero(v) === null ? null : numero(v) / factor);

/** Productos del cliente desde cruceProductosOnline. */
function productos(red) {
  const todos = cuerpos(red, /cruceProductosOnline/).flatMap((c) => buscar(c, (o) => "AGRUPACIONCOMERCIAL" in o));
  return [...new Map(todos.map((p) => [JSON.stringify(p), p])).values()].map((p) => ({
    grupo: p.AGRUPACIONCOMERCIAL,
    nombre: String(p.GLOSAPRODUCTO ?? p.DESCRIPCION ?? p.GLOSA ?? "").trim() || null,
    moneda: p.CODIGOMONEDA ?? null,
    cupo: escala(p.CUPO, 100),
    usado: escala(p.MONTOUTILIZADO, 100),
    disponible: escala(p.MONTODISPONIBLE, 100),
  }));
}

/** Movimiento de cuenta desde la API de openbanking. */
function movimientoCuenta(m) {
  const texto = String(m.movementAmount ?? "").trim();
  const bruto = numero(texto.replace(/-$/, "")) ?? 0;
  const cargo = m.chargePaymentFlag === "D" || texto.endsWith("-");
  return {
    id: m.movementNumber ? `${m.accountingDate ?? m.transactionDate}-${m.movementNumber}` : null,
    fecha: fechaIso(m.transactionDate),
    fecha_contable: fechaIso(m.accountingDate),
    glosa: (m.observation || m.expandedCode || "").trim(),
    monto: (cargo ? -1 : 1) * (bruto / 100),
    saldo: m.newBalance ? Math.round(numero(m.newBalance) / 100) : null,
  };
}

/** Cuenta corriente con saldo y movimientos sin duplicados. */
function cuentas(red) {
  const movimientos = cuerpos(red, /current-accounts\/transactions/).flatMap((c) => c.movements ?? []).map(movimientoCuenta);
  const unicos = [...new Map(movimientos.map((m) => [m.id ?? `${m.fecha}|${m.glosa}|${m.monto}`, m])).values()];
  const saldo = cuerpos(red, /current-accounts\/balances/).flatMap((c) => buscar(c, (o) => "totalBalance" in o || "availableBalance" in o))[0] ?? {};
  return [{
    tipo: "corriente",
    saldo_total: escala(saldo.totalBalance, 100),
    saldo_disponible: escala(saldo.availableBalance, 100),
    movimientos: unicos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")),
  }];
}

/** Movimiento no facturado de tarjeta. */
function noFacturado(m) {
  const importe = numero(m.Importe) ?? 0;
  return { fecha: fechaIso(m.Fecha), glosa: `${m.Comercio ?? ""} ${m.Descripcion ?? ""}`.trim(), monto: m.IndicadorDebeHaber === "D" ? -importe : importe, estado: "no_facturado" };
}

/** Movimiento facturado con cuotas y tipo según segmento y código. */
function facturado(m) {
  const segmento = String(m.SegmentoTxs ?? "").padStart(2, "0");
  const codigo = String(m.CodTxs ?? "").padStart(3, "0");
  const tipo = segmento === "01" && codigo === "067" ? "pago" : segmento === "01" ? "compra" : segmento === "03" ? "cargo" : segmento === "04" ? "cuota_informativa" : "otro";
  const valor = numero(String(m.MontoTxs ?? "").replace(/^0+/, "")) ?? 0;
  const total = numero(m.TotalCuotas) || 0;
  return {
    fecha: fechaIso(m.FechaTxs),
    glosa: String(m.NombreComercio ?? "").trim(),
    monto: tipo === "pago" ? valor : -valor,
    monto_total: numero(String(m.MontoCuota ?? "").replace(/^0+/, "")),
    cuota_actual: total ? numero(m.NumeroCuotas) || 0 : null,
    cuotas_total: total || null,
    tipo,
    estado: "facturado",
  };
}

/** Estados de cuenta nacionales con cabecera, cuadratura y movimientos. */
function estados(red) {
  return cuerpos(red, /estadoCuentaNacional/).flatMap((cuerpo) => {
    const cab = buscar(cuerpo, (o) => "DeudaTotalFact" in o)[0];
    const matriz = buscar(cuerpo, (o) => Array.isArray(o.Matriz))[0]?.Matriz;
    if (!cab || !matriz) return [];
    const movs = matriz.map(facturado).filter((m) => !/saldo inicial/i.test(m.glosa));
    const [anterior, pagos, compras, cargos, total] = ["SaldoAnterior", "TotalPagos", "TotalCompras", "TotalCargos", "DeudaTotalFact"].map((k) => numero(cab[k]));
    return [{
      fecha_facturacion: fechaIso(cab.FechaFactActual),
      fecha_facturacion_anterior: fechaIso(cab.FechaFactAnt),
      fecha_proxima_facturacion: fechaIso(cab.FechaProxFact),
      fecha_vencimiento: fechaIso(cab.FechaVenc),
      cupo: numero(cab.CupoPesos),
      usado: numero(cab.MontoUtilizado),
      disponible: numero(cab.CupoDisponible),
      saldo_anterior: anterior,
      pagos,
      compras,
      cargos,
      comisiones: numero(cab.TotalComision),
      monto_facturado: total,
      pago_minimo: numero(cab.PagoMinimo),
      saldo_capital_cuotas: numero(cab.SaldoCapitalCuota),
      cuotas_proximos_meses: [1, 2, 3, 4].map((i) => numero(cab[`CuotasMes${i}`])),
      tasa_interes_periodo: numero(cab.TasaIntPeriodo),
      tasa_interes_cuotas: numero(cab.TasaIntCuotas),
      cuadra: [anterior, total].every((v) => v !== null) ? Math.abs(anterior - (pagos ?? 0) + (compras ?? 0) + (cargos ?? 0) - total) <= 1 : null,
      movimientos: movs,
    }];
  });
}

/** Tarjetas con no facturados, estados y cupos, en el orden en que se recorrieron. */
function tarjetas(red, prods, visitadas) {
  const dispositivos = cuerpos(red, /card_devices_management/).flatMap((c) => buscar(c, (o) => "cardNumber" in o));
  const unicos = [...new Map(dispositivos.map((d) => [String(d.cardNumber), d])).values()];
  const noFact = cuerpos(red, /consultaUltimosMovimientos/).flatMap((c) => buscar(c, (o) => Array.isArray(o.MatrizMovimientos)));
  const ests = estados(red);
  const conCupo = prods.filter((p) => p.grupo === "TCR" && p.moneda !== "USD" && p.moneda !== "013");
  // El orden de visita en la portada define cada grupo de respuestas; el nombre y los 4 dígitos salen de esa misma tarjeta
  const grupos = visitadas.length ? visitadas : unicos.map((d) => `${d.productComment ?? ""} * ${String(d.cardNumber ?? "").slice(-4)}`);
  return grupos.map((texto, i) => {
    const ultimos = texto.match(/(\d{4})\s*$/)?.[1] ?? null;
    const disp = unicos.find((d) => String(d.cardNumber ?? "").slice(-4) === ultimos) ?? (visitadas.length ? null : unicos[i]);
    const propios = grupos.length === 1 ? ests : ests.filter((_, j) => j % grupos.length === i);
    const cupoEstado = propios.at(-1)?.cupo;
    const prod = conCupo.find((p) => cupoEstado != null && p.cupo === cupoEstado) ?? conCupo[i];
    return {
      nombre: disp?.productComment ?? texto.replace(/\*\s*\d{4}\s*$/, "").trim() ?? null,
      terminacion: ultimos ?? (disp?.cardNumber ? String(disp.cardNumber).slice(-4) : null),
      estado_tarjeta: disp?.cardStatusComment ?? null,
      cupo_nacional: prod ? { total: prod.cupo, usado: prod.usado, disponible: prod.disponible } : null,
      movimientos_no_facturados: (noFact[i]?.MatrizMovimientos ?? []).map(noFacturado),
      estados: propios,
    };
  });
}

/** Líneas de crédito desde el listado de productos. */
function lineas(prods) {
  return prods.filter((p) => p.grupo === "LCR").map((p) => ({ nombre: p.nombre ?? "Línea de crédito", cupo_total: p.cupo, usado: p.usado, disponible: p.disponible }));
}

/** Créditos hipotecarios y de consumo con pagos y deuda pendiente. */
function creditos(red) {
  const lista = cuerpos(red, /cruceProductoHipotecario/).flatMap((c) => buscar(c, (o) => "AGRUPACIONCOMERCIAL" in o));
  const pagos = cuerpos(red, /ultimosPagos/).flatMap((c) => buscar(c, (o) => Array.isArray(o.Movimientos))).flatMap((o) => o.Movimientos);
  const deuda = cuerpos(red, /deudaPendientePrestamo/).flatMap((c) => buscar(c, (o) => "Escalares" in o || "TotalCuotas" in o));
  const esc = deuda[0]?.Escalares ?? deuda[0] ?? {};
  return lista.map((c, i) => ({
    tipo: c.AGRUPACIONCOMERCIAL === "HIP" ? "hipotecario" : "consumo",
    moneda: c.CODIGOMONEDA ?? null,
    estado: c.GLOSAESTADO ?? null,
    pagos: i === 0 ? pagos.map((p) => ({ cuota: numero(p.NroCuota), monto: escala(p.Monto, 10000), fecha: fechaIso(p.FechaLiquidacion) })) : [],
    cuotas_total: i === 0 ? numero(esc.TotalCuotas) : null,
    saldo_capital: i === 0 ? escala(esc.MontoCapVigente, 10000) : null,
    valor_cuota: i === 0 ? escala(esc.ValCuotaVigML, 10000) : null,
    fecha_vencimiento_final: i === 0 ? fechaIso(esc.FecVencimiento) : null,
    fecha_ultimo_pago: i === 0 ? fechaIso(esc.FecUltimoPago) : null,
    detalle_disponible: i === 0 && deuda.length > 0,
  }));
}

/** Extrae cuentas, tarjetas, línea y créditos de Santander personas. */
export async function extraerSantander() {
  const { rut, password } = credenciales("santander");
  const salida = { banco: "santander", extraido: new Date().toISOString(), cuentas: [], tarjetas: [], lineas: [], creditos: [], avisos: [] };
  const { navegador, pagina } = await abrirNavegador();
  const red = registrarRed(pagina, DOMINIOS);
  try {
    await iniciarSesion(pagina, rut, password);
    const app = await marcoApp(pagina);
    await cerrarAvisos(app);
    if (process.env.FPC_DEPURAR) salida.avisos.push(`menu: ${JSON.stringify(await elementosMenu(app))}`);
    await recorrerCreditos(app, salida.avisos);
    salida.tarjetas_visitadas = await recorrerTarjetas(app, salida.avisos);
    salida.cuentas_recorridas = await recorrerCuentas(app);
    if (!(await cerrarSesion(app))) salida.avisos.push("no se encontró el botón de cerrar sesión");
  } catch (e) {
    if (/rechaz|segundo factor|no avanzó/.test(e.message)) throw e;
    salida.avisos.push(ocultar(e.message.split("\n")[0]));
  } finally {
    await navegador.close().catch(() => {});
  }
  const prods = productos(red);
  Object.assign(salida, {
    cuentas: cuentas(red),
    tarjetas: tarjetas(red, prods, salida.tarjetas_visitadas ?? []),
    lineas: lineas(prods),
    creditos: creditos(red),
    productos: prods.map((p) => `${p.grupo}${p.moneda ? `/${p.moneda}` : ""}`),
    rutas: [...red.capturas.keys()].map((r) => r.replace(/^https:\/\/[^/]+/, "")),
  });
  return salida;
}

/** Resumen sin montos ni glosas. */
export function resumir(r) {
  const rango = (ms) => {
    const f = ms.map((m) => m.fecha).filter(Boolean).sort();
    return f.length ? `${f[0]} a ${f.at(-1)}` : "-";
  };
  return {
    productos: r.productos,
    cuentas: r.cuentas.map((c) => ({ movimientos: c.movimientos.length, rango: rango(c.movimientos), con_saldo: c.saldo_total !== null })),
    tarjetas: r.tarjetas.map((t) => ({
      nombre: t.nombre,
      no_facturados: t.movimientos_no_facturados.length,
      estados: t.estados.map((e) => ({ fecha: e.fecha_facturacion, movimientos: e.movimientos.length, cuotas: e.movimientos.filter((m) => m.cuotas_total > 1).length, cuadra: e.cuadra })),
      con_cupo: !!t.cupo_nacional,
    })),
    lineas: r.lineas.length,
    creditos: r.creditos.map((c) => ({ tipo: c.tipo, moneda: c.moneda, pagos: c.pagos.length, detalle: c.detalle_disponible })),
    avisos: r.avisos,
    rutas: r.rutas,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(resumir(await extraerSantander()), null, 1));
  } catch (e) {
    console.error(ocultar(e.message.split("\n")[0]));
    process.exitCode = 1;
  }
}

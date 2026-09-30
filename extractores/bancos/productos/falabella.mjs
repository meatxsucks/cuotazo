import { pathToFileURL } from "node:url";
import { abrirNavegador, bloquear, credenciales, forma, ocultar, RECHAZO, registrarRed } from "../comun.mjs";

const URL_BANCO = "https://www.bancofalabella.cl";
const DOMINIOS = ["bancofalabella.cl", "fif.tech", "falabella.com"];
const HOST_CMR = "credit-card-movements";
const SEGUNDO_FACTOR = /clave din[aá]mica|segundo factor/i;
const MAX_PAGINAS = 20;
const MAX_PERIODOS = 6;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Utilidades de datos

/** Convierte un monto chileno (número o texto como "-$1.234" o "US$ 12,50") a número. */
export function monto(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpio)) return null;
  const negativo = /-\s*(US)?\$|^\s*-/.test(valor);
  const decimal = /,\d{1,2}$/.test(limpio);
  const n = Number(limpio.replace(/-/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return (negativo ? -1 : 1) * (decimal ? n : Math.round(n));
}

/** Normaliza una fecha (ISO, dd/mm/aaaa, dd-mm-aa o dd/mm) a aaaa-mm-dd. */
export function fechaIso(valor) {
  if (!valor || typeof valor !== "string") return null;
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = valor.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (!dmy) return null;
  const hoy = new Date();
  let anio = dmy[3] ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : hoy.getFullYear();
  const mes = Number(dmy[2]);
  const dia = Number(dmy[1]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (!dmy[3] && new Date(anio, mes - 1, dia) > hoy) anio -= 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Suma meses a una fecha aaaa-mm-dd. */
function sumarMeses(fecha, meses) {
  if (!fecha) return null;
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d, ultimo));
  return f.toISOString().slice(0, 10);
}

/** Clasifica un movimiento de tarjeta por su glosa y tipo. */
export function categoria(glosa = "", tipo = "") {
  if (/inter[eé]s/i.test(glosa)) return "interes";
  if (/comisi[oó]n|mantenci[oó]n|administraci[oó]n|cargo (fijo|anual)/i.test(glosa)) return "comision";
  if (/impuesto|timbre|\bitf\b/i.test(glosa)) return "impuesto";
  if (/seguro|desgravamen/i.test(glosa)) return "seguro";
  if (/avance/i.test(glosa)) return "avance";
  if (/^\s*(pago|abono)\b/i.test(glosa)) return "pago";
  if (tipo === "X") return "cargo_banco";
  return "compra";
}

/** Busca un valor (fecha o monto) cerca de una etiqueta en un texto. */
function valorTras(texto, etiqueta, tipo) {
  const patron = tipo === "fecha" ? /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/ : /-?\s?(US)?\$\s?-?[\d.,]+/;
  for (const m of texto.matchAll(new RegExp(etiqueta.source, "gi"))) {
    const tras = texto.slice(m.index + m[0].length, m.index + m[0].length + 80).match(patron);
    if (tras) return tipo === "fecha" ? fechaIso(tras[0]) : monto(tras[0]);
  }
  return null;
}

/** Busca un monto escrito justo antes de una etiqueta (diseño "$monto / etiqueta"). */
function valorAntes(texto, etiqueta) {
  const m = texto.match(new RegExp(`(-?\\s?(?:US)?\\$\\s?[\\d.,]+)\\s*\\n?\\s*(?:${etiqueta.source})`, "i"));
  return m ? monto(m[1]) : null;
}

/** Monto asociado a una etiqueta, probando ambos órdenes. */
function montoEtiqueta(texto, etiqueta) {
  return valorAntes(texto, etiqueta) ?? valorTras(texto, etiqueta, "monto");
}

/** Pares etiqueta/monto de un texto de tarjeta de producto. */
export function paresEtiquetaMonto(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const esMonto = (l) => /^-?\s?(US)?\$\s?-?[\d.,]+$/.test(l);
  const esEtiqueta = (l) => l && !esMonto(l) && /[a-záéíóúñ]{3}/i.test(l) && !/\d{4}/.test(l) && l.length < 60;
  const campos = {};
  lineas.forEach((l, i) => {
    if (!esMonto(l)) return;
    const etiqueta = esEtiqueta(lineas[i - 1]) ? lineas[i - 1] : esEtiqueta(lineas[i + 1]) ? lineas[i + 1] : null;
    if (etiqueta && !(etiqueta in campos)) campos[etiqueta.replace(/:$/, "")] = monto(l);
  });
  return campos;
}

/** Recorre un JSON y devuelve los nodos que cumplen la condición. */
function buscar(valor, condicion, hallados = [], profundidad = 0) {
  if (!valor || typeof valor !== "object" || profundidad > 12) return hallados;
  if (condicion(valor)) hallados.push(valor);
  for (const hijo of Array.isArray(valor) ? valor : Object.values(valor)) buscar(hijo, condicion, hallados, profundidad + 1);
  return hallados;
}

/** Últimos cuatro dígitos de un texto enmascarado. */
function terminacion(texto) {
  return String(texto ?? "").match(/(\d{4})\D*$/)?.[1] ?? null;
}

/** Convierte una transacción JSON del componente CMR al formato de salida. */
export function movimientoCmrApi(t, estado) {
  const tr = t.transaction ?? {};
  const cuota = t.installmentInfo ?? {};
  const abono = t.accountingActionType?.code === "A" || tr.isNegative === true;
  const total = Math.abs(monto(tr.transactionAmount) ?? 0);
  const aPagar = Math.abs(monto(cuota.installmentAmount) ?? total);
  const actual = cuota.currentInstallmentNumber ?? tr.installments?.currentInstallmentNumber ?? null;
  const cuotas = cuota.totalInstallmentNumber ?? tr.installments?.totalInstallmentNumber ?? null;
  const glosa = (tr.description ?? "").trim();
  const tipo = t.transactionType?.code ?? null;
  return {
    id: tr.transactionId ?? tr.identifier ?? null,
    fecha: fechaIso(tr.transactionDate ?? tr.accountingDate),
    glosa,
    monto: (abono ? 1 : -1) * aPagar,
    monto_total: total,
    cuota_actual: actual,
    cuotas_total: cuotas,
    cuota: actual && cuotas ? `${String(actual).padStart(2, "0")}/${String(cuotas).padStart(2, "0")}` : null,
    titular: t.ownership?.ownershipId === "A" ? "adicional" : "titular",
    estado: tipo === "A" ? "pendiente" : estado,
    tipo,
    categoria: categoria(glosa, tipo),
    fuente: "api",
  };
}

/** Convierte una fila de tabla del componente CMR al formato de salida. */
export function movimientoCmrFila(encabezados, celdas, estado) {
  const idx = (re, def) => {
    const i = encabezados.findIndex((h) => re.test(h));
    return i >= 0 ? i : def;
  };
  const iFecha = idx(/fecha|pendientes/, 0);
  const iGlosa = idx(/descrip/, 1);
  const iTitular = idx(/titular|adicional|tarjeta/, 2);
  const iTotal = idx(/monto/, 3);
  const iCuotas = encabezados.findIndex((h) => /^cuotas?$|n.? de cuotas|cuotas$/.test(h));
  const iPagar = idx(/a pagar|valor cuota/, 5);
  const texto = (i) => (i >= 0 ? (celdas[i] ?? "").trim() : "");
  const glosa = texto(iGlosa);
  const fechaTexto = texto(iFecha);
  const fecha = fechaIso(fechaTexto);
  const totalTexto = texto(iTotal);
  const pagarTexto = texto(iPagar) || totalTexto;
  const valor = Math.abs(monto(pagarTexto) ?? 0);
  if (!glosa || !valor) return null;
  const cuotaTexto = texto(iCuotas >= 0 ? iCuotas : 4).match(/(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/);
  return {
    id: null,
    fecha,
    glosa,
    monto: (/-\s?\$/.test(pagarTexto) ? 1 : -1) * valor,
    monto_total: Math.abs(monto(totalTexto) ?? valor),
    cuota_actual: cuotaTexto ? Number(cuotaTexto[1]) : null,
    cuotas_total: cuotaTexto ? Number(cuotaTexto[2]) : null,
    cuota: cuotaTexto ? `${cuotaTexto[1].padStart(2, "0")}/${cuotaTexto[2].padStart(2, "0")}` : null,
    titular: /adicional/i.test(texto(iTitular)) ? "adicional" : "titular",
    estado: fecha ? estado : "pendiente",
    tipo: null,
    categoria: categoria(glosa),
    fuente: "pantalla",
  };
}

/** Quita duplicados por id o por fecha, glosa, monto, cuota y estado. */
function sinDuplicados(movimientos) {
  const vistos = new Set();
  return movimientos.filter((m) => {
    const clave = m.id ? `id:${m.id}:${m.estado}` : [m.fecha, m.glosa, m.monto, m.cuota, m.estado, m.periodo, m.saldo].join("|");
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** Movimientos de cuenta desde un JSON de estructura desconocida, por nombre de claves. */
function movimientosCuentaApi(datos) {
  const clave = (o, re) => Object.keys(o).find((k) => re.test(k));
  const listas = datos.flatMap(({ valor }) =>
    buscar(valor, (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && clave(x, /date|fecha/i) && clave(x, /amount|monto|importe/i))),
  );
  return listas.flat().map((x) => {
    const kMonto = clave(x, /^(amount|monto|importe)$/i) ?? clave(x, /amount|monto|importe/i);
    const cargo = /cargo|debit|d[eé]bito/i.test(String(x[clave(x, /type|tipo|naturaleza/i)] ?? ""));
    const valor = monto(x[kMonto]);
    return {
      fecha: fechaIso(String(x[clave(x, /date|fecha/i)])),
      glosa: String(x[clave(x, /desc|glosa|detalle|concept/i)] ?? "").trim(),
      monto: valor === null ? null : cargo && valor > 0 ? -valor : valor,
      saldo: monto(x[clave(x, /balance|saldo/i)]),
      fuente: "api",
    };
  });
}

// Navegador

/** Sonda que registra en window.__fpcJson los JSON que el sitio desencripta y parsea. */
function sondaJson() {
  const registro = (window.__fpcJson = []);
  let ruta = "";
  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.addEventListener("load", () => {
      try {
        ruta = new URL(String(url), location.href).href.split("?")[0];
      } catch {}
    });
    return abrir.call(this, metodo, url, ...resto);
  };
  const parsear = JSON.parse;
  JSON.parse = function (texto, ...resto) {
    const valor = parsear.call(this, texto, ...resto);
    try {
      if (typeof texto === "string" && texto.length > 40 && registro.length < 800 && valor && typeof valor === "object" && /payload|transaction|movim|saldo|balance|amount|monto|cupo|credit|customerOperation/i.test(texto.slice(0, 20000))) {
        registro.push({ ruta, valor: parsear(texto) });
      }
    } catch {}
    return valor;
  };
}

/** Texto visible de la página, recortado. */
async function textoPagina(pagina) {
  return (await pagina.locator("body").innerText({ timeout: 5000 }).catch(() => "")) ?? "";
}

/** Cierra banners y ventanas emergentes comunes. */
async function cerrarAvisos(pagina) {
  for (const boton of [
    pagina.getByRole("button", { name: "cerrar", exact: true }),
    pagina.locator("button, a").filter({ hasText: /^\s*(Aceptar|Entendido|Continuar|Omitir|Ahora no|M[aá]s tarde)\s*$/i }),
  ]) {
    const visible = boton.locator("visible=true").first();
    if (await visible.isVisible({ timeout: 1500 }).catch(() => false)) await visible.click().catch(() => {});
  }
  const reintentar = pagina.getByText("Reintentar", { exact: true }).locator("visible=true").first();
  if (await reintentar.isVisible({ timeout: 1000 }).catch(() => false)) {
    await reintentar.click().catch(() => {});
    await espera(5000);
  }
}

/** Abre el formulario de login del sitio público y devuelve sus campos, sin escribir nada. */
export async function abrirFormulario(pagina) {
  await pagina.goto(URL_BANCO, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const cookies = pagina.locator("button").filter({ hasText: /^\s*(Aceptar|Acepto|Entendido)\s*$/i }).locator("visible=true").first();
  if (await cookies.isVisible({ timeout: 1500 }).catch(() => false)) await cookies.click().catch(() => {});
  await pagina.locator("a, button").filter({ hasText: /^\s*mi cuenta\s*$/i }).locator("visible=true").first().click({ timeout: 10000 });
  const rut = pagina.locator("input#document");
  const clave = pagina.locator("input#pass");
  await rut.waitFor({ state: "visible", timeout: 15000 });
  await clave.waitFor({ state: "visible", timeout: 5000 });
  const formulario = clave.locator("xpath=ancestor::form[1]");
  return { rut, clave, formulario, enviar: formulario.locator("button[type=submit]").first() };
}

/** Inicia sesión una sola vez; bloquea el banco ante un rechazo y nunca reintenta. */
async function iniciarSesion(contexto, pagina, rut, password) {
  const campos = await abrirFormulario(pagina);
  const rutLimpio = rut.replace(/[.\s]/g, "").toUpperCase();
  const rutFormato = rutLimpio.includes("-") ? rutLimpio : `${rutLimpio.slice(0, -1)}-${rutLimpio.slice(-1)}`;
  await campos.rut.fill(rutFormato);
  await campos.clave.fill(password);
  const escrito = (await campos.rut.inputValue()).replace(/[.-]/g, "").toUpperCase();
  if (escrito !== rutFormato.replace("-", "") || (await campos.clave.inputValue()).length !== password.length) {
    throw new Error("el formulario no quedó con RUT y clave completos; no se envía");
  }
  const limite = Date.now() + 5000;
  while (!(await campos.enviar.isEnabled().catch(() => false))) {
    if (Date.now() > limite) throw new Error("el botón Ingresar sigue deshabilitado con RUT y clave escritos; no se envía");
    await espera(250);
  }
  await campos.enviar.click();

  const modal = pagina.locator("#modal-message");
  const fin = Date.now() + 60000;
  while (Date.now() < fin) {
    await espera(500);
    if (await modal.isVisible().catch(() => false)) {
      const texto = ocultar((await modal.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
      bloquear("falabella", `modal tras login: ${texto}`);
      throw new Error(`el banco respondió con un aviso tras el login; se bloquea sin reintentar: ${texto}`);
    }
    const textoForm = await campos.formulario.innerText({ timeout: 500 }).catch(() => "");
    if (RECHAZO.test(textoForm)) {
      bloquear("falabella", `rechazo en formulario: ${ocultar(textoForm.match(RECHAZO)[0])}`);
      throw new Error("el banco rechazó RUT o clave; se bloquea sin reintentar");
    }
    const destino = contexto.pages().find((p) => !p.url().startsWith(URL_BANCO) && /bancofalabella\.cl/.test(p.url()));
    if (destino) {
      pagina = destino;
      break;
    }
  }
  if (pagina.url().startsWith(URL_BANCO)) throw new Error("el login no avanzó en 60 s; revisar a mano antes de reintentar");

  await pagina.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await espera(5000);
  const texto = await textoPagina(pagina);
  if (SEGUNDO_FACTOR.test(texto)) throw new Error("el banco pide clave dinámica o segundo factor; se detiene");
  const alertas = await pagina.locator('[role="alert"], [class*="error" i], [class*="alert" i]').locator("visible=true").allInnerTexts().catch(() => []);
  const rechazo = alertas.find((a) => RECHAZO.test(a));
  if (rechazo) {
    bloquear("falabella", `rechazo tras login: ${ocultar(rechazo.slice(0, 120))}`);
    throw new Error("el banco rechazó RUT o clave; se bloquea sin reintentar");
  }
  return pagina;
}

/** Cierra sesión haciendo clic en "Cerrar sesión" o "Salir". */
async function cerrarSesion(pagina) {
  const boton = pagina.locator("a, button, span, div[role=button]").filter({ hasText: /^\s*(cerrar sesi[oó]n|salir)\s*$/i }).locator("visible=true").first();
  if (await boton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await boton.click().catch(() => {});
    await espera(3000);
    return true;
  }
  return false;
}

// Cuenta

/** Lee las tablas de movimientos visibles con encabezado de fecha. */
async function tablasCuenta(pagina) {
  return pagina.evaluate(() => {
    const filas = [];
    for (const tabla of document.querySelectorAll("table")) {
      const encabezados = [...tabla.querySelectorAll("th")].map((th) => th.innerText.trim().toLowerCase());
      if (!encabezados.some((h) => h.includes("fecha"))) continue;
      const i = (re) => encabezados.findIndex((h) => re.test(h));
      const col = { fecha: i(/fecha/), glosa: i(/descrip|detalle|glosa/), cargo: i(/cargo|d[eé]bito|giro/), abono: i(/abono|cr[eé]dito|dep[oó]sito/), monto: i(/^monto$|importe/), saldo: i(/saldo/) };
      let ultimaFecha = "";
      for (const tr of tabla.querySelectorAll("tbody tr, tr")) {
        const celdas = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
        if (celdas.length < 3) continue;
        const fecha = /\d{1,2}[/.-]\d{1,2}/.test(celdas[col.fecha] ?? "") ? celdas[col.fecha] : ultimaFecha;
        if (!fecha) continue;
        ultimaFecha = fecha;
        filas.push({ fecha, glosa: celdas[col.glosa] ?? "", cargo: celdas[col.cargo] ?? "", abono: celdas[col.abono] ?? "", monto: celdas[col.monto] ?? "", saldo: celdas[col.saldo] ?? "" });
      }
    }
    return filas;
  });
}

/** Extrae los movimientos de la cuenta abierta, paginando. */
async function movimientosCuentaPantalla(pagina) {
  for (const select of await pagina.locator("select").all()) {
    const opciones = await select.locator("option").allInnerTexts().catch(() => []);
    const amplia = opciones.find((o) => /todos|90 d[ií]as|60 d[ií]as|[uú]ltimo mes|30 d[ií]as|mes anterior/i.test(o));
    if (amplia) {
      await select.selectOption({ label: amplia }).catch(() => {});
      await espera(3000);
    }
  }
  const filas = [];
  for (let i = 0; i < MAX_PAGINAS; i++) {
    filas.push(...(await tablasCuenta(pagina)));
    const siguiente = pagina.locator("button, a").filter({ hasText: /^\s*(siguiente|ver m[aá]s|mostrar m[aá]s|cargar m[aá]s)\s*$/i }).locator("visible=true").first();
    if (!(await siguiente.isVisible({ timeout: 1000 }).catch(() => false)) || (await siguiente.isDisabled().catch(() => true))) break;
    await siguiente.click().catch(() => {});
    await espera(2500);
  }
  return filas
    .map((f) => {
      const cargo = monto(f.cargo);
      const abono = monto(f.abono);
      const valor = cargo ? -Math.abs(cargo) : abono ? Math.abs(abono) : monto(f.monto);
      return { fecha: fechaIso(f.fecha), glosa: f.glosa, monto: valor, saldo: monto(f.saldo), fuente: "pantalla" };
    })
    .filter((m) => m.monto !== null && (m.glosa || m.monto));
}

// Tarjeta CMR (componente web con shadow DOM)

/** Lee tablas, texto, períodos y firma de paginación dentro del componente CMR. */
async function leerCmr(pagina) {
  return pagina.evaluate((host) => {
    const raiz = document.querySelector(host)?.shadowRoot ?? document.querySelector(host) ?? document;
    const raices = [];
    const recorrer = (r) => {
      raices.push(r);
      for (const el of r.querySelectorAll("*")) if (el.shadowRoot) recorrer(el.shadowRoot);
    };
    recorrer(raiz);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };
    const tablas = raices.flatMap((r) => [...r.querySelectorAll("table")]).filter(visible).map((t) => ({
      encabezados: [...t.querySelectorAll("thead th, tr:first-child th")].map((th) => th.innerText.trim().toLowerCase()),
      filas: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())).filter((c) => c.length >= 4),
    }));
    const texto = raices.map((r) => [...r.children].map((c) => c.innerText ?? "").join("\n")).join("\n");
    const periodos = raices.flatMap((r) => [...r.querySelectorAll("select option")]).map((o) => o.value).filter((v) => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(v));
    const factura = tablas.find((t) => t.encabezados.some((h) => h.includes("fecha de compra"))) ?? tablas.find((t) => t.filas.length);
    return { tablas, texto, periodos: [...new Set(periodos)], firma: factura?.filas[0]?.join("|") ?? "" };
  }, HOST_CMR);
}

/** Acciones dentro del componente CMR: "siguiente", "facturados" o "periodo". */
async function accionCmr(pagina, accion, valor) {
  return pagina.evaluate(({ host, accion, valor }) => {
    const raiz = document.querySelector(host)?.shadowRoot ?? document;
    const raices = [];
    const recorrer = (r) => {
      raices.push(r);
      for (const el of r.querySelectorAll("*")) if (el.shadowRoot) recorrer(el.shadowRoot);
    };
    recorrer(raiz);
    const todos = (sel) => raices.flatMap((r) => [...r.querySelectorAll(sel)]);
    if (accion === "siguiente") {
      const boton = todos(".btn-pagination, button").find((b) => {
        if (b.disabled) return false;
        const img = b.querySelector("img");
        const pista = `${img?.getAttribute("alt") ?? ""} ${img?.getAttribute("src") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.innerText ?? ""}`.toLowerCase();
        return /avanzar|siguiente|next|right-arrow|arrow-right/.test(pista);
      });
      boton?.click();
      return !!boton;
    }
    if (accion === "facturados") {
      const radio = todos("#invoicedMovements")[0] ?? todos("label").find((l) => /facturado/i.test(l.innerText) && !/no facturado/i.test(l.innerText));
      if (!radio) return false;
      if (radio.tagName === "INPUT") {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      radio.click();
      return true;
    }
    if (accion === "periodo") {
      const select = todos("select").find((s) => [...s.options].some((o) => o.value === valor));
      if (!select) return false;
      select.value = valor;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }, { host: HOST_CMR, accion, valor });
}

/** Clic real de Playwright en la pestaña de facturados del componente CMR. */
async function clicFacturados(pagina) {
  const candidatos = [
    pagina.locator(`${HOST_CMR} label[for="invoicedMovements"]`),
    pagina.locator(`${HOST_CMR} #invoicedMovements`),
    pagina.locator(HOST_CMR).getByText(/^\s*(movimientos\s+)?facturados\s*$/i),
    pagina.locator(HOST_CMR).getByRole("tab", { name: /^(movimientos )?facturados$/i }),
  ];
  for (const c of candidatos) {
    const el = c.first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Pestañas, radios, botones y selects del componente CMR, solo textos cortos de interfaz. */
async function controlesCmr(pagina) {
  return pagina.evaluate((host) => {
    const raiz = document.querySelector(host)?.shadowRoot ?? document;
    const raices = [];
    const recorrer = (r) => {
      raices.push(r);
      for (const el of r.querySelectorAll("*")) if (el.shadowRoot) recorrer(el.shadowRoot);
    };
    recorrer(raiz);
    const todos = (sel) => raices.flatMap((r) => [...r.querySelectorAll(sel)]);
    const corto = (t) => (t ?? "").replace(/\s+/g, " ").trim().replace(/\d/g, "#").slice(0, 40);
    return {
      host_encontrado: !!document.querySelector(host),
      inputs: todos("input").map((i) => `${i.type}#${i.id}`).slice(0, 15),
      labels: todos("label").map((l) => corto(l.innerText)).filter(Boolean).slice(0, 15),
      tabs: todos("[role=tab], .tab, .tabs li, mat-tab, button").map((b) => corto(b.innerText || b.getAttribute("aria-label"))).filter(Boolean).slice(0, 20),
      selects: todos("select").map((s) => s.options.length),
    };
  }, HOST_CMR);
}

/** Espera a que el componente CMR muestre filas o a que cambie la primera fila. */
async function esperarCmr(pagina, firmaPrevia = null, ms = 30000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const { firma } = await leerCmr(pagina).catch(() => ({ firma: "" }));
    if (firma && firma !== firmaPrevia) return true;
    await espera(500);
  }
  return false;
}

/** Recorre las páginas del listado CMR visible y devuelve sus movimientos de pantalla. */
async function paginarCmr(pagina, estado) {
  const movimientos = [];
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const { tablas, firma } = await leerCmr(pagina);
    const tablasUsar = estado === "facturado" ? tablas.filter((t) => t.encabezados.some((h) => /fecha de compra|monto total|cuota a pagar/.test(h))) : tablas;
    for (const t of tablasUsar.length ? tablasUsar : tablas) {
      for (const celdas of t.filas) {
        const m = movimientoCmrFila(t.encabezados, celdas, estado);
        if (m) movimientos.push(m);
      }
    }
    if (!(await accionCmr(pagina, "siguiente"))) break;
    if (!(await esperarCmr(pagina, firma, 15000))) break;
  }
  return movimientos;
}

/** Transacciones CMR presentes en los JSON capturados. */
function transaccionesApi(datos, estado) {
  return datos
    .flatMap(({ valor }) => buscar(valor, (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && "transaction" in x)))
    .flat()
    .map((t) => movimientoCmrApi(t, estado));
}

/** Resumen de facturación (último estado y próximo período) desde los JSON capturados. */
function resumenApi(datos) {
  const resumen = datos.flatMap(({ valor }) => buscar(valor, (v) => !Array.isArray(v) && "lastBillingSummary" in v)).at(-1);
  const proyectado = datos.flatMap(({ valor }) => buscar(valor, (v) => Array.isArray(v.projectedBillingStatements))).at(-1)?.projectedBillingStatements;
  const ultimo = resumen?.lastBillingSummary ?? {};
  const proximo = resumen?.nextBillingSummary ?? {};
  return {
    ultimo_estado: resumen
      ? {
          fecha_facturacion: fechaIso(ultimo.lastBillingDate),
          fecha_vencimiento: fechaIso(ultimo.expirationDate),
          monto_facturado: monto(ultimo.billedAmount),
          pago_minimo: monto(ultimo.minimumPayment),
          periodo_desde: fechaIso(resumen.startingBillingDate),
          periodo_hasta: fechaIso(resumen.endingBillingDate),
        }
      : null,
    proxima_facturacion: fechaIso(proximo.nextBillingDate),
    proximo_vencimiento: fechaIso(proximo.nextExpirationDate),
    gastos_periodo: monto(proyectado?.[0]?.totalAmount),
    proximos_vencimientos: (proyectado ?? []).map((p) => {
      const kFecha = Object.keys(p).find((k) => /date|fecha/i.test(k));
      return { fecha: kFecha ? fechaIso(String(p[kFecha])) : null, monto: monto(p.totalAmount) };
    }),
  };
}

/** Datos de encabezado del componente CMR leídos de la pantalla. */
function resumenPantalla(texto) {
  return {
    proxima_facturacion: valorTras(texto, /pr[oó]xima facturaci[oó]n/, "fecha"),
    proximo_vencimiento: valorTras(texto, /pr[oó]ximo vencimiento/, "fecha"),
    gastos_periodo: valorTras(texto, /gastos del per[ií]odo/, "monto"),
    fecha_facturacion: valorTras(texto, /fecha de facturaci[oó]n/, "fecha"),
    fecha_vencimiento: valorTras(texto, /fecha de vencimiento/, "fecha"),
    monto_facturado: valorTras(texto, /monto facturado/, "monto"),
    pago_minimo: valorTras(texto, /pago m[ií]nimo/, "monto"),
    intereses: valorTras(texto, /intereses?/, "monto"),
    comisiones: valorTras(texto, /comisi[oó]n(es)?/, "monto"),
  };
}

/** Cupos nacional e internacional desde un texto de tarjeta. */
function cupos(texto) {
  const internacional = texto.match(/internacional[\s\S]{0,400}/i)?.[0] ?? "";
  const nacional = internacional ? texto.slice(0, texto.search(/internacional/i)) : texto;
  const leer = (t) => ({
    total: montoEtiqueta(t, /cupo (de compras|total|aprobado)/),
    usado: montoEtiqueta(t, /cupo (utilizado|usado)|utilizado/),
    disponible: montoEtiqueta(t, /cupo disponible|disponible/),
  });
  const n = leer(nacional);
  const i = internacional ? leer(internacional) : { total: null, usado: null, disponible: null };
  return { cupo_nacional: n, cupo_internacional: { ...i, moneda: "USD" } };
}

/** Cuotas vigentes a partir de los movimientos facturados del último estado. */
function cuotasVigentes(movimientos, vencimiento) {
  return movimientos
    .filter((m) => m.estado === "facturado" && m.cuotas_total > 1 && m.cuota_actual && m.cuota_actual <= m.cuotas_total)
    .map((m) => ({
      glosa: m.glosa,
      fecha_compra: m.fecha,
      monto_total: m.monto_total,
      monto_cuota: Math.abs(m.monto),
      cuota_actual: m.cuota_actual,
      cuotas_total: m.cuotas_total,
      cuotas_restantes: m.cuotas_total - m.cuota_actual,
      saldo_por_pagar: Math.abs(m.monto) * (m.cuotas_total - m.cuota_actual),
      fecha_termino_estimada: sumarMeses(vencimiento, m.cuotas_total - m.cuota_actual),
    }));
}

/** Extrae una tarjeta CMR ya abierta en pantalla. */
async function extraerTarjeta(pagina, recoger, textoTarjeta, avisos) {
  const tarjeta = { nombre: textoTarjeta.match(/CMR[^\n$]*/i)?.[0].replace(/[*•·\d\s]+$/, "").trim() ?? "CMR", terminacion: null, ...cupos(textoTarjeta) };
  const cargado = await esperarCmr(pagina);
  if (!cargado) avisos.push("tarjeta: el componente de movimientos CMR no mostró filas en 30 s");
  const encabezado = await leerCmr(pagina).catch(() => ({ texto: "" }));
  tarjeta.terminacion = terminacion(encabezado.texto.match(/[*•]{2,}\s?\d{4}/)?.[0]) ?? terminacion(textoTarjeta.match(/[*•]{2,}\s?\d{4}/)?.[0]);
  if (!tarjeta.cupo_nacional.disponible) Object.assign(tarjeta, cupos(encabezado.texto));

  // No facturados
  const pantallaNoFact = await paginarCmr(pagina, "no_facturado");
  const infoNoFact = resumenPantalla((await leerCmr(pagina)).texto);
  const apiNoFact = await recoger("cmr_no_facturados");
  const movApiNoFact = transaccionesApi(apiNoFact, "no_facturado");

  // Facturados del último estado y de períodos anteriores
  const pantallaFact = [];
  let infoFact = {};
  let apiFact = [];
  if (process.env.FPC_DEPURAR) avisos.push(`controles CMR: ${JSON.stringify(await controlesCmr(pagina))}`);
  if ((await clicFacturados(pagina)) || (await accionCmr(pagina, "facturados"))) {
    await espera(2000);
    await esperarCmr(pagina, null, 30000);
    await espera(2000);
    const lectura = await leerCmr(pagina);
    infoFact = resumenPantalla(lectura.texto);
    pantallaFact.push(...(await paginarCmr(pagina, "facturado")));
    apiFact = await recoger("cmr_facturados");
    const periodos = lectura.periodos.slice(1, MAX_PERIODOS);
    for (const periodo of periodos) {
      const { firma } = await leerCmr(pagina);
      if (!(await accionCmr(pagina, "periodo", periodo))) break;
      await esperarCmr(pagina, firma, 20000);
      const anteriores = await paginarCmr(pagina, "facturado");
      const api = await recoger("cmr_facturados_anteriores");
      const etiqueta = fechaIso(periodo);
      const delPeriodo = transaccionesApi(api, "facturado");
      tarjeta.estados_anteriores ??= [];
      tarjeta.estados_anteriores.push({ ...resumenApi(api).ultimo_estado, fecha_facturacion: etiqueta, movimientos: sinDuplicados((delPeriodo.length ? delPeriodo : anteriores).map((m) => ({ ...m, periodo: etiqueta }))) });
    }
  } else avisos.push("tarjeta: no se encontró la pestaña de movimientos facturados");

  const resumen = resumenApi([...apiNoFact, ...apiFact]);
  const movApiFact = transaccionesApi(apiFact, "facturado");
  const usarApi = movApiNoFact.length + movApiFact.length > 0;
  if (!usarApi && pantallaNoFact.length + pantallaFact.length) avisos.push("tarjeta: sin JSON de movimientos CMR, se usó la tabla de pantalla");
  const movimientos = sinDuplicados(usarApi ? [...movApiNoFact, ...movApiFact] : [...pantallaNoFact, ...pantallaFact]);

  const ultimo = resumen.ultimo_estado ?? {
    fecha_facturacion: infoFact.fecha_facturacion,
    fecha_vencimiento: infoFact.fecha_vencimiento,
    monto_facturado: infoFact.monto_facturado,
    pago_minimo: infoFact.pago_minimo,
  };
  const facturados = movimientos.filter((m) => m.estado === "facturado");
  const sumar = (cat) => {
    const lista = facturados.filter((m) => m.categoria === cat);
    return lista.length ? Math.abs(lista.reduce((s, m) => s + m.monto, 0)) : null;
  };
  Object.assign(tarjeta, {
    proxima_facturacion: resumen.proxima_facturacion ?? infoNoFact.proxima_facturacion,
    proximo_vencimiento: resumen.proximo_vencimiento ?? infoNoFact.proximo_vencimiento,
    gastos_periodo: resumen.gastos_periodo ?? infoNoFact.gastos_periodo,
    ultimo_estado: {
      ...ultimo,
      intereses: sumar("interes") ?? infoFact.intereses ?? null,
      comisiones: sumar("comision") ?? infoFact.comisiones ?? null,
      impuestos: sumar("impuesto"),
      seguros: sumar("seguro"),
    },
    proximos_vencimientos: resumen.proximos_vencimientos,
    avances: movimientos.filter((m) => m.categoria === "avance"),
    cuotas_vigentes: cuotasVigentes(movimientos, ultimo.fecha_vencimiento),
    movimientos,
    fuente: usarApi ? "api" : "pantalla",
  });
  return tarjeta;
}

// Productos del inicio

/** Productos listados en el JSON del sitio (customerOperation), sin números completos. */
function productosApi(datos) {
  const vistos = new Map();
  for (const { valor } of datos) {
    for (const op of buscar(valor, (v) => !Array.isArray(v) && v.subproduct && (v.operationId !== undefined || v.customerOperationId))) {
      const clave = String(op.customerOperationId ?? op.operationId);
      vistos.set(clave, { producto: op.subproduct?.product?.shortDesc ?? null, subproducto: op.subproduct?.shortDesc ?? null, terminacion: terminacion(op.operationId) });
    }
  }
  return [...vistos.values()];
}

/** Textos de los bloques de producto del inicio que calzan con el patrón. */
async function bloquesProducto(pagina, patron) {
  return pagina.evaluate((fuente) => {
    const re = new RegExp(fuente, "i");
    const candidatos = [...document.querySelectorAll("a, article, li, section, div")].filter((el) => {
      const t = el.innerText ?? "";
      return re.test(t) && /\$/.test(t) && t.length < 600 && (el.offsetWidth || el.offsetHeight);
    });
    // Se quedan los bloques más internos que aún contienen nombre y monto
    return candidatos.filter((el) => !candidatos.some((otro) => otro !== el && el.contains(otro))).map((el) => el.innerText.trim());
  }, patron.source);
}

// Extracción principal

// Datos estructurados de las APIs internas

/** Normaliza a lista un nodo que puede venir como objeto único, lista o ausente. */
function lista(nodo) {
  if (nodo === undefined || nodo === null) return [];
  return Array.isArray(nodo) ? nodo : [nodo];
}

/** Último cuerpo desencriptado cuya ruta calza con el patrón. */
function ultimaCaptura(capturas, patron) {
  return capturas.filter((c) => c.origen === "desencriptado" && patron.test(c.ruta) && c.valor && typeof c.valor === "object").at(-1)?.valor ?? null;
}

/** Completa cupos, estado de cuenta, proyección, líneas y créditos con las respuestas internas del sitio. */
function enriquecerDesdeApi(salida, capturas) {
  const operaciones = ultimaCaptura(capturas, /massiveSelectCustomerOperation/);
  const tarjetaApi = ultimaCaptura(capturas, /movement-cc\/v2\.0\/credit-card$/)?.payload;
  const proyeccion = ultimaCaptura(capturas, /projected-billing-statements/)?.payload?.projectedBillingStatements;
  const prestamo = ultimaCaptura(capturas, /personal-loan\/v1\/details/)?.payload;

  const cuentasApi = lista(operaciones?.accounts?.account);
  salida.cuentas.forEach((c, i) => {
    const a = cuentasApi[i];
    if (!a) return;
    c.saldo_disponible = a.availableBalance ?? c.saldo_disponible;
    c.saldo_hoy = a.balanceToday ?? null;
    c.sobregiro = a.lineOverdraft ?? null;
  });

  const tarjetasApi = lista(operaciones?.creditCards?.creditCard);
  salida.tarjetas.forEach((t, i) => {
    const a = tarjetasApi[i];
    if (a) {
      t.cupo_nacional = { ...t.cupo_nacional, total: a.purchaseLimit ?? null, usado: a.purchaseAcum ?? null, disponible: a.availablePurchaseLimit ?? null };
      t.avance = { cupo: a.cashAdvanceLimit ?? null, disponible: a.availableCashAdvance ?? null };
      t.super_avance = { cupo: a.superCashAdvanceLimit ?? null, usado: a.superCashAdvanceAcum ?? null, disponible: a.availableSuperCashAdvance ?? null };
      t.monto_impago = a.unpaidAmount ?? null;
      t.proximo_vencimiento = a.creditCardAccount?.nextDueDate ?? t.proximo_vencimiento ?? null;
    }
    if (i === 0 && tarjetaApi) {
      const ultimo = tarjetaApi.billingSummary?.lastBillingSummary ?? {};
      const proximo = tarjetaApi.billingSummary?.nextBillingSummary ?? {};
      t.ultimo_estado = {
        ...t.ultimo_estado,
        fecha_facturacion: fechaIso(ultimo.lastBillingDate) ?? t.ultimo_estado?.fecha_facturacion ?? null,
        fecha_vencimiento: fechaIso(ultimo.expirationDate) ?? t.ultimo_estado?.fecha_vencimiento ?? null,
        monto_facturado: ultimo.billedAmount ?? t.ultimo_estado?.monto_facturado ?? null,
        monto_pagado: ultimo.amountPaid ?? null,
        fecha_pago: fechaIso(ultimo.paymentDate),
        pago_minimo: ultimo.minimumPayment ?? t.ultimo_estado?.pago_minimo ?? null,
      };
      t.proximo_estado = {
        monto_por_facturar: proximo.amountForBilling ?? null,
        fecha_facturacion: fechaIso(proximo.nextBillingDate),
        fecha_vencimiento: fechaIso(proximo.nextExpirationDate),
      };
      t.deuda_pendiente = tarjetaApi.billingSummary?.pendingPaymentAmount ?? null;
      t.dias_impago = tarjetaApi.creditCardContract?.unpaidDays ?? null;
      t.cupos = lista(tarjetaApi.facility).map((f) => ({
        tipo: f.description ?? null,
        total: f.balance?.total ?? null,
        usado: f.balance?.used ?? null,
        disponible: f.balance?.available ?? null,
        moneda: f.currency?.code ?? null,
      }));
      if (!t.terminacion && tarjetaApi.card?.PAN) t.terminacion = String(tarjetaApi.card.PAN).slice(-4);
    }
    if (i === 0 && Array.isArray(proyeccion)) {
      t.cuotas_proyectadas = proyeccion.map((p) => ({
        fecha_facturacion: fechaIso(p.billingDate),
        fecha_vencimiento: fechaIso(p.expirationDate),
        monto: p.totalAmount ?? null,
        moneda: p.currency?.code ?? null,
      }));
    }
  });

  const lineasApi = lista(operaciones?.agreements?.agreement);
  if (lineasApi.length) {
    salida.lineas = lineasApi.map((l, i) => ({
      nombre: salida.lineas[i]?.nombre ?? "Línea de crédito",
      cupo_total: l.originalAmount ?? null,
      usado: l.amountUsed ?? null,
      disponible: l.availableBalance ?? null,
      estado: l.status?.shortDesc ?? null,
      fuente: "api",
    }));
  }

  const creditosApi = lista(operaciones?.loans?.loan);
  if (creditosApi.length || prestamo) {
    salida.creditos = (creditosApi.length ? creditosApi : [{}]).map((c, i) => {
      const d = i === 0 ? prestamo ?? {} : {};
      return {
        nombre: d.product ?? "Crédito de consumo",
        monto_otorgado: d.amountGranted ?? null,
        monto_liquido: d.liquidAmount ?? null,
        costo_total: d.totalCreditAmount ?? null,
        saldo_capital: d.pendingPrincipalAmount ?? c.loPrincipalAmount ?? null,
        capital_pagado: d.paidPrincipalAmount ?? null,
        valor_cuota: d.monthlyPaymentAmount ?? null,
        proxima_cuota_monto: d.nextInstallmentAmount ?? c.nextInstallmentAmount ?? null,
        proxima_cuota_fecha: fechaIso(d.nextInstallmentDate ?? c.nextInstallmentDate),
        proxima_cuota_numero: c.nextInstallmentNumber ?? null,
        cuotas_pagadas: d.paidInstallments ?? c.totalOfPaidInstallments ?? null,
        cuotas_pendientes: d.pendingInstallments ?? null,
        cuotas_total: d.installments ?? c.totalNumberOfInstallments ?? null,
        tasa_mensual: d.monthlyInterestRate ?? null,
        cae: d.CAE ?? null,
        fecha_curse: fechaIso(d.activationDate),
        impuestos: d.stampTaxesAndStamps ?? null,
        gastos_notariales: d.notarialFees ?? null,
        seguros: lista(d.insurances).map((s) => ({ nombre: s.name ?? null, monto: s.amount ?? null })),
        moneda: d.currency ?? null,
        estado: d.status ?? c.status?.shortDesc ?? null,
        fuente: "api",
      };
    });
  }
  if (operaciones?.mortgage && Object.keys(operaciones.mortgage).length) salida.avisos.push("el sitio informa un crédito hipotecario sin leer");
  salida.avisos = salida.avisos.filter((a) => !/se leyeron \d+ desde la pantalla/.test(a) || !(lineasApi.length || creditosApi.length));
}

/** Extrae cuentas, tarjetas CMR, líneas y créditos de Banco Falabella personas. */
export async function extraerFalabella({ descubrir = true } = {}) {
  const { rut, password } = credenciales("falabella");
  const salida = { banco: "falabella", extraido: new Date().toISOString(), cuentas: [], tarjetas: [], lineas: [], creditos: [], avisos: [], descubrimiento: [] };
  const { navegador, contexto, pagina: inicial } = await abrirNavegador();
  let pagina = inicial;
  const capturas = [];
  const leidos = new Map();
  try {
    await contexto.addInitScript(sondaJson);
    const red = registrarRed(contexto, DOMINIOS);

    // Junta lo nuevo de la red y de la sonda, etiquetado por fase
    const recoger = async (fase) => {
      await espera(800);
      const nuevos = [];
      for (const [ruta, cuerpos] of red.capturas) {
        const desde = leidos.get(ruta) ?? 0;
        cuerpos.slice(desde).forEach((valor) => nuevos.push({ fase, ruta, origen: "red", valor }));
        leidos.set(ruta, cuerpos.length);
      }
      for (const p of contexto.pages()) {
        const sonda = await p.evaluate(() => (window.__fpcJson ?? []).splice(0)).catch(() => []);
        sonda.forEach(({ ruta, valor }) => nuevos.push({ fase, ruta: ruta || p.url().split("?")[0], origen: "desencriptado", valor }));
      }
      capturas.push(...nuevos);
      return nuevos;
    };

    pagina = await iniciarSesion(contexto, pagina, rut, password);
    await cerrarAvisos(pagina);
    const urlInicio = pagina.url();
    const datosInicio = await recoger("inicio");
    const textoInicio = await textoPagina(pagina);
    const productos = productosApi(datosInicio);

    // Cuentas corriente y vista
    const enlacesCuenta = pagina.getByRole("link", { name: /cuenta (corriente|vista)\s*[\d*]/i });
    const nCuentas = Math.max(await enlacesCuenta.count().catch(() => 0), /cuenta (corriente|vista)/i.test(textoInicio) ? 1 : 0);
    for (let i = 0; i < nCuentas; i++) {
      try {
        if (pagina.url() !== urlInicio) {
          await pagina.goto(urlInicio, { waitUntil: "networkidle" }).catch(() => {});
          await cerrarAvisos(pagina);
        }
        const enlace = (await enlacesCuenta.count()) > i ? enlacesCuenta.nth(i) : pagina.getByText(/cuenta (corriente|vista)/i).locator("visible=true").first();
        const nombre = ((await enlace.innerText().catch(() => "")) || "").split("\n")[0];
        const bloque = (await bloquesProducto(pagina, /cuenta (corriente|vista)/))[i] ?? "";
        await enlace.click({ timeout: 5000 });
        await pagina.waitForLoadState("networkidle").catch(() => {});
        await espera(4000);
        await cerrarAvisos(pagina);
        const pantalla = await movimientosCuentaPantalla(pagina);
        const api = movimientosCuentaApi(await recoger("cuenta"));
        const texto = await textoPagina(pagina);
        const movimientos = sinDuplicados(api.length ? api : pantalla);
        salida.cuentas.push({
          tipo: /vista/i.test(nombre + bloque) ? "vista" : "corriente",
          terminacion: terminacion(nombre.match(/\d[\d-]{3,}/)?.[0]),
          saldo_disponible: montoEtiqueta(texto, /saldo disponible/) ?? montoEtiqueta(bloque, /saldo disponible|disponible/),
          saldo_contable: montoEtiqueta(texto, /saldo contable/),
          movimientos,
          fuente: api.length ? "api" : "pantalla",
        });
        if (!movimientos.length) salida.avisos.push(`cuenta ${i + 1}: sin movimientos legibles`);
      } catch (e) {
        salida.avisos.push(`cuenta ${i + 1}: ${ocultar(e.message.split("\n")[0])}`);
      }
    }

    // Tarjetas CMR
    await pagina.goto(urlInicio, { waitUntil: "networkidle" }).catch(() => {});
    await cerrarAvisos(pagina);
    const bloquesCmr = await bloquesProducto(pagina, /CMR/);
    const enlacesCmr = pagina.locator("[id^='cardDetail']");
    const nCmr = Math.max(await enlacesCmr.count().catch(() => 0), bloquesCmr.length ? 1 : 0);
    for (let i = 0; i < nCmr; i++) {
      try {
        if (i > 0) {
          await pagina.goto(urlInicio, { waitUntil: "networkidle" }).catch(() => {});
          await cerrarAvisos(pagina);
        }
        const enlace = (await enlacesCmr.count()) > i ? enlacesCmr.nth(i) : pagina.getByRole("link", { name: /CMR/ }).first().or(pagina.locator("a, button").filter({ hasText: /CMR/ }).first());
        const textoTarjeta = (await enlace.innerText().catch(() => "")) || bloquesCmr[i] || textoInicio;
        await recoger("antes_cmr");
        await enlace.click({ timeout: 5000 });
        await pagina.waitForLoadState("networkidle").catch(() => {});
        await espera(4000);
        salida.tarjetas.push(await extraerTarjeta(pagina, recoger, textoTarjeta, salida.avisos));
      } catch (e) {
        salida.avisos.push(`tarjeta ${i + 1}: ${ocultar(e.message.split("\n")[0])}`);
      }
    }
    if (!nCmr) salida.avisos.push("no se encontró tarjeta CMR en el inicio");

    // Líneas de crédito y créditos de consumo
    await pagina.goto(urlInicio, { waitUntil: "networkidle" }).catch(() => {});
    await cerrarAvisos(pagina);
    for (const texto of await bloquesProducto(pagina, /l[ií]nea de cr[eé]dito/)) {
      const campos = paresEtiquetaMonto(texto);
      salida.lineas.push({
        nombre: texto.split("\n")[0].replace(/\d{4,}/g, "").trim(),
        cupo_total: montoEtiqueta(texto, /cupo (total|aprobado)|monto aprobado/),
        usado: montoEtiqueta(texto, /utilizado|usado|deuda/),
        disponible: montoEtiqueta(texto, /disponible/),
        campos,
        fuente: "pantalla",
      });
    }
    for (const texto of await bloquesProducto(pagina, /cr[eé]dito de consumo|pr[eé]stamo|s[uú]per ?avance|cr[eé]dito hipotecario/)) {
      salida.creditos.push({
        nombre: texto.split("\n")[0].replace(/\d{4,}/g, "").trim(),
        monto_original: montoEtiqueta(texto, /monto (otorgado|original|cr[eé]dito|solicitado)/),
        saldo_deuda: montoEtiqueta(texto, /saldo|deuda/),
        valor_cuota: montoEtiqueta(texto, /valor (de la )?cuota|cuota mensual/),
        cuota: texto.match(/cuota\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/i)?.slice(1, 3).join("/") ?? null,
        proximo_vencimiento: valorTras(texto, /vencimiento/, "fecha"),
        campos: paresEtiquetaMonto(texto),
        fuente: "pantalla",
      });
    }
    const listados = productos.filter((p) => /cr[eé]dito|consumo|pr[eé]stamo|loan|l[ií]nea/i.test(`${p.producto} ${p.subproducto}`));
    if (listados.length > salida.lineas.length + salida.creditos.length) {
      salida.avisos.push(`el sitio lista ${listados.length} productos de crédito o línea y se leyeron ${salida.lineas.length + salida.creditos.length} desde la pantalla`);
    }
    if (productos.length) salida.productos = productos;
    await recoger("fin");

    if (!(await cerrarSesion(pagina))) salida.avisos.push("no se encontró el botón de cerrar sesión");
  } finally {
    await navegador.close().catch(() => {});
  }

  enriquecerDesdeApi(salida, capturas);
  if (descubrir) {
    const vistos = new Map();
    for (const c of capturas) {
      const clave = `${c.origen} ${c.ruta}`;
      if (!vistos.has(clave)) vistos.set(clave, { origen: c.origen, ruta: c.ruta, fases: new Set(), forma: forma(c.valor) });
      vistos.get(clave).fases.add(c.fase);
    }
    salida.descubrimiento = [...vistos.values()].map((d) => ({ ...d, fases: [...d.fases] }));
  }
  return salida;
}

// Resumen sin datos personales

/** Rango de fechas de una lista de movimientos. */
function rango(movimientos) {
  const fechas = movimientos.map((m) => m.fecha).filter(Boolean).sort();
  return fechas.length ? [fechas[0], fechas.at(-1)] : null;
}

/** Claves con valor y sin valor de un objeto plano. */
function llenos(objeto) {
  const planos = Object.entries(objeto).filter(([, v]) => v === null || typeof v !== "object" || Array.isArray(v));
  return {
    llenos: planos.filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)).map(([k]) => k),
    vacios: planos.filter(([, v]) => v === null || v === undefined || (Array.isArray(v) && !v.length)).map(([k]) => k),
  };
}

/** Resumen imprimible: conteos, rangos, campos llenos o vacíos y rutas de API. */
export function resumir(r) {
  return {
    banco: r.banco,
    extraido: r.extraido,
    cuentas: r.cuentas.map((c) => ({ tipo: c.tipo, fuente: c.fuente, movimientos: c.movimientos.length, rango: rango(c.movimientos), ...llenos(c) })),
    tarjetas: r.tarjetas.map((t) => ({
      fuente: t.fuente,
      movimientos: t.movimientos.length,
      no_facturados: t.movimientos.filter((m) => m.estado === "no_facturado").length,
      facturados: t.movimientos.filter((m) => m.estado === "facturado").length,
      pendientes: t.movimientos.filter((m) => m.estado === "pendiente").length,
      con_cuotas: t.movimientos.filter((m) => m.cuotas_total > 1).length,
      cuotas_vigentes: t.cuotas_vigentes.length,
      avances: t.avances.length,
      estados_anteriores: t.estados_anteriores?.length ?? 0,
      rango: rango(t.movimientos),
      ...llenos(t),
      cupo_nacional: llenos(t.cupo_nacional),
      cupo_internacional: llenos(t.cupo_internacional),
      ultimo_estado: llenos(t.ultimo_estado),
    })),
    lineas: r.lineas.map(llenos),
    creditos: r.creditos.map(llenos),
    productos_listados: r.productos?.length ?? 0,
    avisos: r.avisos,
    rutas_api: r.descubrimiento.map((d) => `${d.origen} ${d.ruta} [${d.fases.join(",")}]`),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(resumir(await extraerFalabella()), null, 2));
  } catch (e) {
    console.error(ocultar(e.message.split("\n")[0]));
    process.exitCode = 1;
  }
}

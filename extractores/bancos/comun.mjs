import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const DIR_BLOQUEOS = `${homedir()}/.fpc/bloqueos`;
export const RECHAZO = /no son v[aá]lid|clave (incorrecta|bloqueada)|rut o clave|credenciales inv[aá]lidas|clave inv[aá]lida|bloquead/i;

/** Lee una credencial del Llavero de macOS (servicio fpc), o null si no existe. */
export function llavero(cuenta) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "fpc", "-a", cuenta, "-w"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Credenciales de un banco desde el Llavero; lanza si faltan o si el banco está bloqueado. */
export function credenciales(banco) {
  if (existsSync(`${DIR_BLOQUEOS}/${banco}`)) throw new Error(`${banco} bloqueado: borra ${DIR_BLOQUEOS}/${banco} tras revisar la clave`);
  const prefijo = banco.toUpperCase();
  const rut = llavero(`${prefijo}_RUT`);
  const password = llavero(`${prefijo}_PASS`);
  if (!rut || !password) throw new Error(`faltan ${prefijo}_RUT y ${prefijo}_PASS en el Llavero`);
  return { rut, password };
}

/** Marca el banco como bloqueado tras un rechazo de credenciales. */
export function bloquear(banco, motivo) {
  mkdirSync(DIR_BLOQUEOS, { recursive: true });
  writeFileSync(`${DIR_BLOQUEOS}/${banco}`, `${new Date().toISOString()} ${motivo}\n`);
}

/** Abre Chrome sin interfaz con un contexto de escritorio. */
export async function abrirNavegador({ visible = false } = {}) {
  const navegador = await chromium.launch({
    executablePath: CHROME,
    headless: !visible,
    args: ["--disable-blink-features=AutomationControlled", "--disable-notifications"],
  });
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    locale: "es-CL",
  });
  await contexto.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  return { navegador, contexto, pagina: await contexto.newPage() };
}

/** Estructura de un JSON sin valores: claves, tipos y largo de listas. */
export function forma(valor, profundidad = 0) {
  if (profundidad > 4) return "…";
  if (Array.isArray(valor)) return valor.length ? [`${valor.length}×`, forma(valor[0], profundidad + 1)] : [];
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, forma(v, profundidad + 1)]));
  return typeof valor;
}

/** Registra las respuestas JSON de los dominios dados: URL sin query, estado y forma, nunca valores. */
export function registrarRed(pagina, dominios) {
  const registro = [];
  const capturas = new Map();
  pagina.on("response", async (r) => {
    const url = r.url();
    if (!dominios.some((d) => url.includes(d))) return;
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    try {
      const cuerpo = await r.json();
      const ruta = url.split("?")[0];
      registro.push({ metodo: r.request().method(), ruta, estado: r.status(), forma: forma(cuerpo) });
      capturas.set(ruta, [...(capturas.get(ruta) ?? []), cuerpo]);
    } catch {}
  });
  return { registro, capturas };
}

/** Oculta RUT, montos y correos en un texto de log. */
export function ocultar(texto) {
  return String(texto)
    .replace(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]/g, "<rut>")
    .replace(/\$\s?-?[\d.,]+/g, "$<monto>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<correo>");
}

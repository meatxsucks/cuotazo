import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getBank } from "open-banking-chile";

const BANCOS = ["falabella", "santander", "bci"];
const BUCKET_RAW = process.env.BUCKET_RAW ?? "fpc-raw";
const USUARIO_ID = process.env.FPC_USUARIO_ID;
const DIR_BLOQUEOS = `${homedir()}/.fpc/bloqueos`;
const RECHAZO = /no son v[aá]lid|clave (incorrecta|bloqueada)|rut o clave|credenciales inv[aá]lidas/i;

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

// Conteos sin montos ni glosas
function resumen(banco, r) {
  return {
    banco,
    ok: r.success,
    error: r.error?.split("\n")[0],
    pasos: r.pasos,
    cuentas: (r.accounts ?? []).map((c) => c.movements.length),
    tarjetas: (r.creditCards ?? []).map((t) => ({
      movimientos: t.movements?.length ?? 0,
      conCuotas: (t.movements ?? []).filter((m) => m.installments).length,
    })),
  };
}

/** Lee una credencial del Llavero de macOS (servicio fpc), o null si no existe. */
function llavero(cuenta) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "fpc", "-a", cuenta, "-w"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Extrae un banco con las credenciales del Llavero y deja el resultado en raw. */
async function extraer(banco) {
  const prefijo = banco.toUpperCase();
  const rut = llavero(`${prefijo}_RUT`);
  const password = llavero(`${prefijo}_PASS`);
  if (!rut || !password) return { banco, ok: false, error: `faltan ${prefijo}_RUT y ${prefijo}_PASS en el Llavero` };

  const bloqueo = `${DIR_BLOQUEOS}/${banco}`;
  if (existsSync(bloqueo)) return { banco, ok: false, error: `bloqueado tras un rechazo de credenciales; revisa la clave y borra ${bloqueo}` };

  const ahora = new Date();
  const pasos = [];
  const r = await getBank(banco).scrape({
    rut,
    password,
    chromePath: process.env.CHROME_PATH,
    onDebug: (l) => pasos.push(l.replace(/\d{7,8}-?[\dkK]/g, "<rut>").slice(0, 400)),
  });
  if (pasos.some((l) => RECHAZO.test(l)) || RECHAZO.test(r.error ?? "")) {
    mkdirSync(DIR_BLOQUEOS, { recursive: true });
    writeFileSync(bloqueo, ahora.toISOString());
    return { banco, ok: false, error: "el banco rechazó RUT o clave; no se reintenta hasta revisar la clave" };
  }
  if (!r.success) r.pasos = pasos.slice(-15);
  const { screenshot, debug, movements, balance, ...resultado } = r;

  if (r.success) {
    const fecha = ahora.toISOString().slice(0, 10);
    const marca = ahora.toISOString().replace(/[-:]/g, "").slice(0, 15);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_RAW,
        Key: `scraper/${banco}/usuario=${USUARIO_ID}/fecha_carga=${fecha}/${marca}.json`,
        Body: JSON.stringify({ extraido: ahora.toISOString(), banco, fuente: "open-banking-chile@085faaf", resultado }),
        ContentType: "application/json",
      }),
    );
  }
  return resumen(banco, r);
}

if (!USUARIO_ID) throw new Error("falta FPC_USUARIO_ID");
const pedidos = process.argv.slice(2).length ? process.argv.slice(2) : BANCOS;
for (const banco of pedidos) console.log(JSON.stringify(await extraer(banco)));

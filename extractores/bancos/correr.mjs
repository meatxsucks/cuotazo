import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const EXTRACTORES = {
  falabella: async () => (await import("./productos/falabella.mjs")).extraerFalabella({ descubrir: false }),
  bci: async () => (await import("./productos/bci.mjs")).extraerBci(),
  santander: async () => (await import("./productos/santander.mjs")).extraerSantander(),
};
const BUCKET_RAW = process.env.BUCKET_RAW ?? "fpc-raw";
const USUARIO_ID = process.env.FPC_USUARIO_ID;

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

// Rango de fechas de una lista de movimientos
function rango(movimientos = []) {
  const fechas = movimientos.map((m) => m.fecha).filter(Boolean).sort();
  return fechas.length ? `${fechas[0]} a ${fechas.at(-1)}` : "-";
}

// Campos con valor de un objeto, sin mostrar los valores
function conValor(objeto = {}) {
  return Object.entries(objeto ?? {})
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length))
    .map(([k]) => k);
}

/** Conteos por producto, sin montos ni glosas. */
function resumen(r) {
  return {
    banco: r.banco,
    cuentas: (r.cuentas ?? []).map((c) => ({ tipo: c.tipo, movimientos: c.movimientos?.length ?? 0, rango: rango(c.movimientos) })),
    tarjetas: (r.tarjetas ?? []).map((t) => ({
      movimientos: t.movimientos?.length ?? 0,
      rango: rango(t.movimientos),
      por_estado: Object.entries((t.movimientos ?? []).reduce((a, m) => ({ ...a, [m.estado ?? "-"]: (a[m.estado ?? "-"] ?? 0) + 1 }), {})),
      con_cuotas: (t.movimientos ?? []).filter((m) => m.cuotas_total > 1).length,
      cuotas_vigentes: t.cuotas_vigentes?.length ?? 0,
      estados_anteriores: t.estados_anteriores?.length ?? 0,
      cuotas_proyectadas: t.cuotas_proyectadas?.length ?? 0,
      cupos: (t.cupos ?? []).map((c) => c.tipo),
      cupo_nacional: conValor(t.cupo_nacional),
      ultimo_estado: conValor(t.ultimo_estado),
      proximo_estado: conValor(t.proximo_estado),
    })),
    lineas: (r.lineas ?? []).map(conValor),
    creditos: (r.creditos ?? []).map(conValor),
    avisos: r.avisos ?? [],
  };
}

const banco = process.argv[2];
if (!EXTRACTORES[banco]) throw new Error(`banco no soportado: ${banco}`);
if (!USUARIO_ID) throw new Error("falta FPC_USUARIO_ID");

const r = await EXTRACTORES[banco]();
const ahora = new Date();
await s3.send(
  new PutObjectCommand({
    Bucket: BUCKET_RAW,
    Key: `productos/${banco}/usuario=${USUARIO_ID}/fecha_carga=${ahora.toISOString().slice(0, 10)}/${ahora.toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`,
    Body: JSON.stringify(r),
    ContentType: "application/json",
  }),
);
console.log(JSON.stringify(resumen(r), null, 1));

# Arquitectura

Decisiones en `decisiones/`; lo abierto en [[DUDAS]].

## Vista general

```
Fuentes        Banca en línea: Santander · BCI · Banco Falabella (CMR)       PDF de estados (carga manual)
               │
Extracción     extractores/bancos: Node + Playwright en el equipo, credenciales del Llavero ([[ADR-003_Scraper_Open_Banking_Chile]])
               │
Raw            S3 fpc-raw/productos/<banco>/usuario=<id>/fecha_carga=AAAA-MM-DD/  (JSON tal cual; inmutable)
               │
Bodega         scripts/cargar_bodega.sh: jobs estilo Glue (normalizan, cuotas 0/N, seudonimizan, categorizan, cuadran)
               Postgres: stage ─► dw (dimensional, usuario_id en toda tabla) ─► presentacion
               │
Publicación    Lambda fpc-publicar-supabase ─► Supabase, esquema finanzas con RLS ([[ADR-005_Publicacion_Supabase]])
               │
App            SvelteKit en Vercel: Resumen, Mes, Carro, Deudas, Movimientos
Infra          Terraform contra floci (http://localhost:4566)
Secretos       Llavero de macOS: credenciales bancarias · Secrets Manager de floci: seudonimización, bodega, Supabase
```

## Separación por usuario

- `usuario_id` interno (UUID) en raw (como partición seudónima), analytics y en toda tabla de la bodega.
- El RUT y el nombre del usuario viven solo en `sensible/` y en `dw.dim_usuario_sensible`, fuera del esquema analítico.
- Claves de PDF por usuario en Secrets Manager (`fpc/usuarios/<usuario_id>/...`), nunca en S3 ni en Postgres.
- Bodega con Row Level Security: cada rol de lectura ve solo sus filas (`usuario_id = current_setting('fpc.usuario_id')`).
- Contrapartes persona natural (quien te transfiere o a quien le transfieres) se seudonimizan como en el ADR-008 de plataforma-datos-chile: token HMAC, diccionario en `sensible/`.

## Modelo de datos (propuesta)

| Tabla | Grano | Notas |
|---|---|---|
| `dim_usuario` | usuario | SCD 1; sin datos personales |
| `dim_cuenta` | cuenta o tarjeta de un usuario | institución, tipo (corriente, vista, tarjeta, línea), fuente |
| `dim_fecha` | día | estática |
| `dim_comercio` | comercio normalizado | nombre limpio desde la glosa |
| `dim_categoria` | categoría y subcategoría | jerárquica, catálogo global |
| `fact_movimiento` | un movimiento | monto con signo, `tipo_flujo` (ingreso, gasto, transferencia_interna, pago_deuda, interes, comision), categoría, comercio, fuente, `id_origen` |
| `fact_cuota` | una cuota de una compra en cuotas | compra, n° de cuota, total de cuotas, monto, mes de vencimiento |
| `fact_estado_tarjeta` | un estado de cuenta por tarjeta y período | facturado, pagado, saldo no pagado, intereses, comisiones, avances, cupo |
| `regla_categoria` | regla | patrón sobre glosa o comercio → categoría; `usuario_id` nulo = global |

Vistas de análisis: gasto diario y mensual por categoría y comercio contra ingresos; deuda comprometida
por mes futuro (suma de `fact_cuota`); intereses y comisiones por mes; flujo mensual con alerta.

## Categorización

1. **Tipo de flujo primero** (antes que la categoría): transferencias entre cuentas propias y pagos de
   tarjeta o línea se marcan `transferencia_interna` o `pago_deuda` y se excluyen del gasto. Detección
   por glosa (`PAGO TARJETA`, `PAGO CMR`, `TRASPASO A CTA`) y por cruce: mismo monto, ±3 días, cargo en
   una cuenta propia y abono en otra (o pago en el estado de la tarjeta).
2. **Reglas ordenadas por prioridad**: primero las del usuario, después las globales; patrón sobre la glosa
   normalizada o sobre el comercio.
3. **Sin regla** → `sin_categoria`, visible en un reporte para crear reglas nuevas.
4. **Deduplicación entre fuentes**: una compra CMR puede llegar por correo y después por el estado de cuenta;
   se cruza por tarjeta, monto y fecha ±2 días, y gana el estado de cuenta.

Clasificación con un modelo de lenguaje: fuera del alcance inicial (ver [[DUDAS]]).

## Servicios y emulación

Mismos criterios que plataforma-datos-chile: floci para S3, Lambda, Secrets Manager,
EventBridge Scheduler, RDS Postgres y MWAA; Glue ejecutado en contenedor local (floci solo emula el catálogo).

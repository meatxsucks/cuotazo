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

- `usuario_id` interno (UUID) en raw (partición `usuario=`), en toda tabla de la bodega y en Supabase.
- El RUT y las claves bancarias viven solo en el Llavero de macOS (servicio `fpc`); no llegan a S3, a la bodega ni a Supabase.
- La bodega no tiene RLS: corre en local (floci) y cada consulta filtra por `usuario_id`. El aislamiento entre personas
  está en Supabase, con RLS en todas las tablas ([[ADR-005_Publicacion_Supabase]], [[ADR-010_Hogar_Compartido]]).
- Contrapartes persona natural en las glosas (quien te transfiere o a quien le transfieres) se reemplazan por un
  seudónimo estable HMAC (`Persona 3f2a`) con la clave `fpc/seudonimo`; series de 5 o más dígitos se enmascaran.

## Bodega (`sql/bodega`, Postgres 16 en floci)

Carga completa con `scripts/cargar_bodega.sh`: DDL → UF del día → productos (raw → `stage.*` → `MERGE` a `dw.*`) →
categorización → cuadraturas contra los totales de cada estado de cuenta.

| Objeto | Grano | Notas |
|---|---|---|
| `stage.corrida`, `stage.producto`, `stage.movimiento`, `stage.deuda`, `stage.cuota_mes`, `stage.saldo`, `stage.estado_tarjeta` | lo que trae una corrida del extractor | se reemplaza en cada carga |
| `dw.dim_usuario` | usuario | alias y `dia_corte_sueldo` (25 por defecto) |
| `dw.dim_producto` | cuenta, tarjeta, línea o crédito de un usuario | banco, tipo, nombre sin números completos |
| `dw.dim_fecha`, `dw.dim_categoria` | día / categoría | estáticas; la categoría tiene grupo |
| `dw.regla_categoria` | regla | patrón (con banco, tipo de producto y signo opcionales) → categoría y tipo de flujo, por prioridad; globales en `03_reglas.sql`, personales en `sql/bodega/privado/` (ignorado por git); sin regla queda `sin_categoria` |
| `dw.fact_movimiento` | movimiento | monto con signo, `fecha_imputacion`, cuota actual y total, estado (contable, no facturado, facturado, pendiente), categoría, `tipo_flujo` |
| `dw.fact_estado_tarjeta` | estado de cuenta por tarjeta y período | saldo anterior, facturado, mínimo, vencimiento y si cuadra con los movimientos |
| `dw.fact_deuda_producto`, `dw.fact_cuota_mes` | deuda por producto / cuota por mes futuro | base de la deuda comprometida |
| `dw.fact_saldo` | saldo por cuenta y fecha | |
| `dw.indicador`, `dw.uf_vigente` | valor diario | UF para el dividendo |
| `dw.caja_movimiento`, `dw.compromiso` | vistas de caja | ciclo de sueldo 25 → 24 ([[ADR-007_Caja_Por_Ciclo]]) |
| `presentacion.*` | lo que se publica | contrato en [[CONTRATO_PRESENTACION]] |

Reglas de carga que importan:
- Compras en cuotas "0/N": si la misma compra ya aparece con la cuota 1 se omite; si no, se carga imputada al mes siguiente.
- El sueldo pagado desde el día de corte se imputa al mes siguiente (lo financia).
- Pagos de tarjeta y traspasos entre cuentas propias son `transferencia_interna` o `pago_deuda`, nunca gasto.
- Si una corrida nocturna trae vacío el detalle del hipotecario, se reutiliza el último detalle bueno.

## Supabase y app

- Supabase (esquema `finanzas`): tablas publicadas desde la bodega, tablas que edita la persona (pagos fijos, deudas
  anotadas, sobres, anotaciones, carro, marcas de pago, perfil, hogar) y vistas `security_invoker` (`pagos_ciclo`,
  `lo_que_viene`, `estado_sobre`, `deudas_todas`, alertas y plan). Migraciones en `supabase/migrations/`.
- La app web está descrita en [[APP_WEB]]; cómo se corre todo, en [[OPERACION]].

## Servicios y emulación

floci para S3, Lambda, Secrets Manager, EventBridge Scheduler y RDS Postgres; los jobs estilo Glue corren como scripts
Python locales. Nada apunta a AWS real.

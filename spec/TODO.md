# TODO

Cada fase termina con algo que se puede demostrar. No se pasa de fase sin cumplir el criterio.

## Fase 0 — Verificación y decisiones
- [x] Revisar agregadores (Fintoc y otros): no cubren tarjetas ni Banco Falabella para personas; se usa scraping ([[Fuentes_de_Datos]], [[ADR-003_Scraper_Open_Banking_Chile]])
- [x] Arquitectura, modelo de datos y categorización propuestos ([[ARQUITECTURA]])
- [x] Resolver [[DUDAS]] 12
- **Término:** dudas bloqueantes de las fases 1 y 2 resueltas y ADRs escritos.

## Fase 1 — Base local
- [x] `docker-compose.yml` con floci (`fpc-floci`) y datos en `~/.fpc/floci-data`
- [x] Terraform: buckets raw, analytics y sensible; secretos `fpc/seudonimo` y `fpc/bodega` (la cola SQS y el secreto de Fintoc se retiraron el 2026-09-30); Postgres 16 `fpc-bodega`
- **Término:** `terraform apply` contra floci crea buckets, secretos y la bodega. **Cumplido 2026-09-28:** 12 recursos creados, verificados con AWS CLI y `psql`; persisten tras reiniciar floci y `terraform plan` no muestra cambios.
- [ ] `psql` no está instalado en el equipo: por ahora se usa `docker exec` sobre el contenedor de RDS
- [ ] Otro proyecto local con floci usa los mismos puertos (4566, 7001): solo uno puede estar arriba a la vez

## Fase 2C — Scraper de bancos ([[ADR-003_Scraper_Open_Banking_Chile]])
- [x] `extractores/bancos/extraer.mjs` con credenciales desde el Llavero y bloqueo ante rechazo
- [x] Santander: cuenta y tarjeta en raw
- [x] Falabella: extractor propio (`productos/falabella.mjs`) con cuenta, CMR (facturado, no facturado, estados anteriores, cuotas, cupos, proyección) y crédito
- [x] BCI: extractor propio (`productos/bci.mjs`) con cuentas corrientes y Prima
- [x] Santander: extractor propio (`productos/santander.mjs`) con cuenta, tarjetas (por facturar y último estado), línea e hipotecario
- [x] Ejecución programada y a pedido: agente de launchd + botón Actualizar ([[ADR-011_Actualizacion_Y_Contabilidad]])
- [ ] Falabella: login trabado el 2026-10-07 aunque el sitio cargó; revisar con el navegador visible
- [ ] Llevar el agente a un equipo siempre encendido (Raspberry o mini PC) con las claves fuera del Llavero
- [ ] Santander: estados de cuenta anteriores (el sitio ofrece más de un año), más de 50 movimientos de cuenta, cuentas de ahorro; un estado de tarjeta no cuadra con su cabecera
- [ ] BCI: historia más allá de los últimos 50 movimientos
- [ ] Falabella: tasa y CAE del crédito; cuota del crédito llega en 0
- **Término:** los tres bancos dejan cuentas y tarjetas en raw en una misma corrida programada.

## Fase 8 — App web (Cuotazo)
- [x] Bodega → Supabase (`finanzas`, RLS) → SvelteKit en Vercel, login con Google y enlace mágico
- [x] Alertas de presupuesto estilo AWS y Plan de ajuste
- [x] Resumen basado en caja real: disponible hoy, tarjetas (cupo, a pagar, fecha de pago), caja del ciclo 25→24, lo que viene, consumo
- [x] Bodega y migración de caja por ciclo, pagos fijos, deudas manuales y sobres ([[ADR-007_Caja_Por_Ciclo]])
- [x] Aplicar `0003_caja.sql` en Supabase antes de volver a invocar la Lambda de publicación
- [x] Pantallas para pagos fijos, deudas manuales, sobres y anotaciones; Resumen con `caja_resumen` y `lo_que_viene`
- [x] Pantalla Mes (pagos del ciclo con estado, sobres, balance y plan del día) y Carro de compras ([[ADR-009_Mes_Y_Carro]])
- [x] Hogar compartido: invitación por correo, productos compartidos a elección, la pareja anota y marca pagos ([[ADR-010_Hogar_Compartido]])
- [ ] Cuando un miembro conecte sus bancos: sumar ambos usuarios en Resumen y Mes
- [ ] Detectar pagos fijos con los movimientos del banco (patrón de glosa por pago fijo) para no marcarlos a mano
- [ ] Vincular una compra del carro con su cargo del banco (`anotacion.movimiento_id`) en vez de descontar por medio de pago
- [ ] Quitar de la capa de datos y del modo demo lo que ya no usa ninguna pantalla (`planAjuste`, `planCategorias`, `liberacionCuotas`, `estadoPresupuestos`)
- [ ] Cuadratura del estado CMR: el estado no trae saldo anterior (hoy queda como no evaluable)
- [ ] Día de corte del sueldo desde `finanzas.perfil.dia_pago` hacia la bodega (hoy fijo en 25)
- [ ] Versión React (Expo) en `app/` con paridad; reemplazar la de Svelte cuando esté aprobada
- **Término:** el Resumen muestra plata real que calza con los saldos de los bancos y sirve para decidir cuánto gastar.

## Backlog
- [ ] Extractor de cuentas de servicios al estilo de los bancos (portales de luz, agua, gas, internet, celular) o lectura de boletas en Gmail; reemplaza los pagos fijos manuales
- [ ] Notificaciones de alertas (correo o push; canal y consentimiento por decidir)
- [ ] Nombre visible editable por cada persona del hogar (hoy sale del correo)
- [ ] Envío de la invitación al hogar por correo (requiere SMTP propio en Supabase)
- [ ] App móvil (exportar la versión Expo a iOS/Android)
- [ ] Revisar si la facturación proyectada de CMR incluye compras al contado (posible doble conteo en `deuda_cuota_mes`)

## Fase 3 — Analytics y bodega
- [x] DDL dimensional (`sql/bodega`) y jobs estilo Glue (`glue/jobs`); el aislamiento por usuario con RLS vive en Supabase, no en la bodega local
- [x] Carga stage + MERGE (`scripts/cargar_bodega.sh`)
- **Término:** conteos cuadran entre raw, analytics y bodega; un rol de usuario no ve filas de otro. **Cumplido 2026-09-30:** cuadraturas OK en cada carga y RLS probada en Supabase simulando usuarios ([[ADR-010_Hogar_Compartido]]).

## Fase 4 — Falabella (CMR)
- [ ] Confirmar si el sitio de Banco Falabella exporta movimientos CMR a Excel
- [ ] Experimento opcional: leer notificaciones del iPhone duplicadas en el Mac
- **Término:** las compras de un estado de cuenta o exportación CMR aparecen en la bodega sin duplicar las ya cargadas.

## Fase 5 — Estados de cuenta
- **Término:** cuotas, intereses y comisiones de un estado CMR real cuadran con el PDF.

## Fase 6 — Categorización y transferencias internas
- [x] Pagos de tarjeta y traspasos propios como `transferencia_interna` / `pago_deuda`, fuera del gasto
- [ ] Bajar el gasto sin categoría (hoy ~17%) bajo 10% con más reglas
- **Término:** un pago de tarjeta no aparece como gasto; menos de 10% del gasto queda sin categoría.

## Fase 7 — Análisis, alertas y bancos reales
- **Término:** vistas de gasto, deuda comprometida, intereses y flujo; alerta de mes negativo probada; Santander conectado en vivo.

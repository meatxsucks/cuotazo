# ADR-011 — Actualización a pedido y contabilidad

**Estado:** aceptada · **Fecha:** 2026-10-08

## Contexto

Los datos se actualizaban solo cuando alguien corría a mano los extractores, la carga y la publicación; pasaron días sin
refrescarse. Además se pidió ver las finanzas "como contabilidad": balance, estado de resultados, libro por cuenta y
conciliación con el banco.

## Decisión

### Actualización

- La app no puede correr los extractores: necesitan Chrome, las claves del Llavero y floci en el equipo de la casa. Por eso
  el botón **Actualizar** solo deja una solicitud (`finanzas.pedir_actualizacion()`, una activa a la vez y como mínimo
  10 minutos entre corridas exitosas) en `finanzas.solicitud_actualizacion`.
- En el equipo corre un agente de `launchd` (`scripts/instalar_actualizacion.sh`) que cada minuto ejecuta
  `scripts/trabajador_actualizacion.py`: toma la solicitud, levanta Docker y floci si están apagados, extrae cada banco
  (un reintento, salvo login trabado o clave rechazada), carga la bodega, publica, toma la foto del balance y va dejando el
  avance por paso. La app lo consulta cada 4 segundos y recarga al terminar.
- Una vez al día, desde las 7:00 (o apenas el equipo despierte), crea sola una solicitud `programada`.
- Estados: `ok`, `parcial` (algún banco falló o no cuadró, pero se publicó) y `error` (falló la carga o la publicación).
- Una corrida del extractor solo cuenta si trae movimientos de cuenta; si no, la carga conserva la última buena.
- El mismo agente sirve igual en una Raspberry o un mini PC.

### Contabilidad (`/contabilidad`)

- **Balance**: activos (saldos de cuentas) menos pasivos (`saldo_deuda_clp` de tarjetas y créditos, más deudas anotadas)
  = patrimonio. `finanzas.tomar_foto_balance()` guarda una foto por día en `foto_balance` para ver la evolución.
- **Resultados**: `finanzas.resultado_mensual`, ingresos − gastos − intereses y comisiones por categoría y mes de imputación.
- **Libro**: `finanzas.libro`, movimientos por producto con entradas, salidas y saldo corrido reconstruido hacia atrás
  desde el saldo de hoy (solo cuentas).
- **Conciliación**: `fpc_cuadrar` guarda sus verificaciones en `dw.conciliacion` (carga raw → bodega, estado de cuenta
  saldo anterior − movimientos = facturado, caja por ciclo) y se publica en `finanzas.conciliacion`; `conciliacion_saldos`
  compara el saldo de cada cuenta entre dos fotos con la suma de sus movimientos.
- En un hogar, balance, fotos y conciliación siguen la regla de los agregados de [[ADR-010_Hogar_Compartido]]: los demás
  los ven solo si el dueño comparte todo.

## Consecuencias

- Los datos quedan al día sin intervención mientras el equipo esté encendido; si está apagado, la app muestra la solicitud en
  cola y avisa.
- El patrimonio sale muy negativo por el hipotecario y el CAE: el valor de la casa y del auto no se registra como activo.
- La conciliación de saldos necesita al menos dos fotos.

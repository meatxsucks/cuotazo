# ADR-010 — Hogar compartido

**Estado:** aceptada · **Fecha:** 2026-09-30

## Contexto

La economía de una casa la llevan dos personas, pero hoy solo una tiene bancos conectados. La otra necesita ver los pagos
del mes y los sobres, anotar compras y marcar pagos, sin editar la configuración ni ver cuentas que el titular no quiera
compartir. Más adelante también tendrá sus propios bancos.

## Decisión

- **Hogar** (`finanzas.hogar`) con un **titular** y **miembros** (`miembro_hogar`, una persona pertenece a un solo hogar).
  El titular invita por correo (`invitacion_hogar`). La primera vez que la persona entra con ese correo verificado, la app
  llama a `finanzas.aceptar_invitacion()`: crea su `usuario`, la une al hogar y borra la invitación.
- **Productos compartidos por elección** (`producto_compartido`, opt-in): el titular marca qué cuentas y tarjetas ve el
  hogar. Una cuenta o tarjeta nueva queda privada hasta que la marque.
- **RLS por hogar**, todo desde funciones `security definer` (`usuarios_hogar`, `producto_visible`, `agregado_visible`):
  - `movimiento`, `saldo_cuenta`, `deuda_producto` y `deuda_cuota_mes`: se ven las filas propias y las de productos
    compartidos del hogar.
  - Agregados (`gasto_diario`, `resumen_mensual`, `caja_ciclo`, `caja_resumen`): los demás los ven solo si el dueño
    comparte todos sus productos, para que un total no revele una cuenta privada.
  - Pagos fijos, deudas anotadas, sobres, perfil, presupuestos y publicaciones: lectura para todo el hogar, edición solo
    del dueño.
  - Anotaciones, compras, productos del carro y marcas de pago: lectura y escritura para todo el hogar. Se guardan a nombre
    del titular (`titular_de_mi_hogar()` como valor por defecto) y registran `creado_por`.
- El ciclo de sueldo lo calcula `finanzas.ciclo_actual()` (corte el 25), sin depender de `caja_resumen`, para que
  `pagos_ciclo`, `lo_que_viene` y `estado_sobre` den lo mismo a quien no ve los agregados. `lo_que_viene` suma el saldo
  de las cuentas visibles.
- La app oculta a los miembros los controles de edición; la base igual los rechaza.

## Consecuencias

- La pareja ve "Lo que viene", Mes, sobres y carro iguales al titular; con cuentas privadas, sus saldos y el detalle de
  pagos detectados por el banco en esas cuentas no aparecen para ella.
- Cuando el miembro conecte sus bancos, sus filas quedan con su propio `usuario_id`: habrá que sumar ambos en el Resumen
  y en Mes (hoy la app toma el primer `disponible_para_vivir_ajustado`).
- El día de corte del ciclo queda fijo en 25 en Supabase (en la bodega es por usuario).

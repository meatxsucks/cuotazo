# App web (Cuotazo)

SvelteKit 2 + Svelte 5 en `web/`, desplegada en Vercel. Lee y escribe en Supabase (esquema `finanzas`) con la clave
anónima y la sesión del usuario: toda la seguridad la pone RLS. Sin variables de Supabase corre en **modo demo** con datos
sintéticos (`web/src/lib/demo/`), sin login.

## Pantallas

| Ruta | Para qué | Decisión |
|---|---|---|
| `/` Resumen | Disponible hoy, lo que viene hasta el cierre del ciclo, tarjetas con fecha de pago, caja del ciclo, consumo del mes y sobres | [[ADR-007_Caja_Por_Ciclo]] |
| `/mes` Mes | Balance del ciclo (sueldo − pagos − sobres), qué hacer con la plata de hoy, pagos con estado y marca manual, sobres con ritmo diario; pestaña del próximo ciclo | [[ADR-009_Mes_Y_Carro]] |
| `/carro` Carro | Compra abierta con productos, total contra el sobre, productos frecuentes; al terminar anota en el sobre | [[ADR-009_Mes_Y_Carro]] |
| `/anotar` Sobres | Crear y ordenar sobres; gasto suelto sin detalle | |
| `/deudas` Deudas | Tarjetas, líneas y créditos de los bancos, cuotas comprometidas por mes | |
| `/deudas/anotadas` | Deudas que no vienen de los bancos y límite de uso por tarjeta | |
| `/pagos-fijos` | Pagos mensuales con día, pausas y fecha de inicio | |
| `/movimientos`, `/diario`, `/categorias` | Detalle, calendario de gasto y gasto por categoría | |
| `/contabilidad` Contabilidad | Balance (patrimonio y su evolución), resultados del mes por categoría, libro por cuenta con saldo corrido y conciliación | [[ADR-011_Actualizacion_Y_Contabilidad]] |
| `/actualizar` | Endpoint del botón Actualizar del encabezado (GET estado, POST pedir) | [[ADR-011_Actualizacion_Y_Contabilidad]] |
| `/hogar` Hogar | Invitar, quitar, elegir qué cuentas se comparten; vista de miembro | [[ADR-010_Hogar_Compartido]] |
| `/login`, `/auth/confirmar` | Google o enlace al correo | |
| `/plan`, `/presupuestos`, `/salir-de-deudas` | Redirigen a `/mes` o `/deudas/anotadas` | [[ADR-008_Salir_De_Deudas]] (reemplazada) |

Menú: Resumen · Mes · **+** (Carro) · Deudas · Más (Contabilidad, Movimientos, Pagos fijos, Sobres, Diario, Categorías, Hogar).
En el encabezado de todas las pantallas: "Actualizado …" y el botón **Actualizar** con el avance por banco.

## Roles

- `solo` o `titular`: edita todo lo suyo.
- `miembro` del hogar: ve lo compartido; usa el carro, anota gastos y marca pagos. La app oculta la edición de pagos
  fijos, deudas, sobres y sueldo (`data.rol` desde `+layout.server.ts`) y la base igual la rechaza.
- Al primer ingreso, si el correo tiene invitación, `+layout.server.ts` llama a `aceptarInvitacion()`.
- Las escrituras se hacen a nombre del **titular** (`usuario()` devuelve el dueño de los datos del hogar), y las vistas
  que traen una fila por persona se filtran por el titular.

## Código

- `src/lib/datos/`: capa única de datos (`FuenteDatos` en `tipos.ts`) con dos implementaciones, `supabase.ts` y
  `demo.ts`. Si una vista no existe aún (migración pendiente), los métodos opcionales devuelven `null` y la pantalla
  muestra un aviso en vez de caerse.
- `src/lib/caja.ts`: ciclo de sueldo y réplica de `lo_que_viene` para cuando falta la vista.
- `src/lib/mes.ts`: balance, plan de uso de la plata, sobres del ciclo, carro y réplica de `pagos_ciclo` para el modo demo.
  Pruebas en `mes.test.ts` y `deudas/presupuesto.test.ts` (`npx vitest run`).
- `src/lib/componentes/`: navegación, íconos, barras, campos de monto.
- `static/`: íconos (`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icono-192/512.png`) y `manifest.webmanifest`
  para instalarla en la pantalla de inicio como "Cuotazo".

## Variables (Vercel)

`PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Nada más: la app nunca usa la clave de servicio.

## Versión React

`app/` tiene un port a Expo (React Native + web) de la primera etapa, pausado. No tiene Mes, Carro ni Hogar. Solo tiene
sentido si se quiere publicar en App Store / Play Store ([[TODO]]).

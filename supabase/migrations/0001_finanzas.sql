create schema if not exists finanzas;

create domain finanzas.categoria as text check (value in (
  'supermercado', 'restaurantes_delivery', 'transporte', 'combustible_auto', 'salud', 'educacion',
  'vivienda_servicios', 'hogar', 'vestuario', 'entretenimiento_suscripciones', 'viajes', 'tecnologia',
  'mascotas', 'seguros', 'intereses_comisiones_impuestos', 'transferencias_personas', 'transferencia_interna', 'pago_tarjeta_credito', 'pago_credito',
  'ingresos_sueldo', 'ingresos_otros', 'sin_categoria'
));

create table finanzas.usuario (
  usuario_id uuid primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  nombre_visible text
);

create function finanzas.mi_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.usuario_id from finanzas.usuario u where u.auth_user_id = auth.uid()
$$;

revoke all on function finanzas.mi_usuario_id() from public;
revoke all on function finanzas.mi_usuario_id() from anon;
grant execute on function finanzas.mi_usuario_id() to authenticated, service_role;

create table finanzas.movimiento (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  movimiento_id text not null,
  fecha date not null,
  fecha_imputacion date not null,
  banco text not null,
  producto_tipo text not null check (producto_tipo in ('cuenta', 'tarjeta', 'linea')),
  producto_nombre text,
  glosa text,
  comercio text,
  categoria finanzas.categoria not null,
  tipo_flujo text not null check (tipo_flujo in ('ingreso', 'gasto', 'transferencia_interna', 'pago_deuda', 'interes_comision')),
  monto bigint not null,
  monto_total_compra bigint,
  cuota_actual int,
  cuotas_total int,
  estado text check (estado in ('contable', 'no_facturado', 'facturado', 'pendiente')),
  primary key (usuario_id, movimiento_id)
);

create index movimiento_usuario_fecha_idx on finanzas.movimiento (usuario_id, fecha desc);

create table finanzas.gasto_diario (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  fecha date not null,
  categoria finanzas.categoria not null,
  monto_gasto bigint not null,
  cantidad int not null,
  primary key (usuario_id, fecha, categoria)
);

create table finanzas.resumen_mensual (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  ingresos bigint not null,
  gastos bigint not null,
  pagos_deuda bigint not null,
  intereses_comisiones bigint not null,
  flujo_neto bigint not null,
  flujo_proyectado_cierre bigint,
  alerta_negativo boolean not null default false,
  meses_completos boolean not null default false,
  primary key (usuario_id, mes)
);

create table finanzas.deuda_producto (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  banco text not null,
  tipo text not null check (tipo in ('tarjeta', 'linea', 'consumo', 'hipotecario')),
  nombre text not null,
  moneda text not null default 'CLP' check (moneda in ('CLP', 'UF')),
  cupo_total numeric,
  usado numeric,
  disponible numeric,
  saldo_deuda numeric,
  valor_cuota numeric,
  cuotas_pagadas int,
  cuotas_total int,
  fecha_termino date,
  proximo_vencimiento date,
  pago_minimo numeric,
  tasa_mensual numeric,
  cae numeric,
  saldo_deuda_clp bigint,
  actualizado timestamptz,
  primary key (usuario_id, banco, tipo, nombre)
);

create table finanzas.deuda_cuota_mes (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  banco text not null,
  tipo text not null check (tipo in ('tarjeta', 'linea', 'consumo', 'hipotecario')),
  nombre text not null,
  monto bigint not null,
  primary key (usuario_id, mes, banco, tipo, nombre)
);

create table finanzas.saldo_cuenta (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  banco text not null,
  producto_nombre text not null,
  saldo_disponible bigint,
  actualizado timestamptz,
  primary key (usuario_id, banco, producto_nombre)
);

create table finanzas.presupuesto (
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  categoria finanzas.categoria not null,
  monto_limite bigint not null check (monto_limite >= 0),
  primary key (usuario_id, mes, categoria)
);

create table finanzas.publicacion (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  tabla text not null,
  publicado_en timestamptz not null default now(),
  filas int not null,
  primary key (usuario_id, tabla)
);

alter table finanzas.usuario enable row level security;
alter table finanzas.movimiento enable row level security;
alter table finanzas.gasto_diario enable row level security;
alter table finanzas.resumen_mensual enable row level security;
alter table finanzas.deuda_producto enable row level security;
alter table finanzas.deuda_cuota_mes enable row level security;
alter table finanzas.saldo_cuenta enable row level security;
alter table finanzas.presupuesto enable row level security;
alter table finanzas.publicacion enable row level security;

create policy usuario_lectura_dueno on finanzas.usuario
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy movimiento_lectura_dueno on finanzas.movimiento
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy gasto_diario_lectura_dueno on finanzas.gasto_diario
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy resumen_mensual_lectura_dueno on finanzas.resumen_mensual
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy deuda_producto_lectura_dueno on finanzas.deuda_producto
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy deuda_cuota_mes_lectura_dueno on finanzas.deuda_cuota_mes
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy saldo_cuenta_lectura_dueno on finanzas.saldo_cuenta
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy publicacion_lectura_dueno on finanzas.publicacion
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy presupuesto_lectura_dueno on finanzas.presupuesto
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy presupuesto_alta_dueno on finanzas.presupuesto
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));

create policy presupuesto_cambio_dueno on finanzas.presupuesto
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));

create policy presupuesto_baja_dueno on finanzas.presupuesto
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

revoke all on schema finanzas from public, anon;
revoke all on all tables in schema finanzas from public, anon;
alter default privileges in schema finanzas revoke all on tables from public, anon;
alter default privileges in schema finanzas revoke all on functions from public, anon;

grant usage on schema finanzas to authenticated, service_role;
grant usage on domain finanzas.categoria to authenticated, service_role;

grant select on
  finanzas.usuario, finanzas.movimiento, finanzas.gasto_diario, finanzas.resumen_mensual,
  finanzas.deuda_producto, finanzas.deuda_cuota_mes, finanzas.saldo_cuenta, finanzas.publicacion
  to authenticated;
grant select, insert, update, delete on finanzas.presupuesto to authenticated;

grant all on all tables in schema finanzas to service_role;

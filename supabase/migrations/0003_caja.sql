alter table finanzas.deuda_producto
  add column monto_facturado bigint,
  add column fecha_facturacion date,
  add column monto_pagado bigint,
  add column monto_por_facturar bigint,
  add column fecha_proxima_facturacion date;

create table finanzas.caja_ciclo (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  ciclo date not null check (extract(day from ciclo) = 1),
  ciclo_inicio date not null,
  ciclo_fin date not null,
  grupo text not null check (grupo in (
    'sueldo', 'otros_ingresos', 'vivienda_servicios', 'pago_tarjetas', 'pago_creditos', 'transferencias_personas',
    'traspasos_propios', 'gasto_debito', 'intereses_comisiones', 'sin_categoria'
  )),
  entradas bigint not null check (entradas >= 0),
  salidas bigint not null check (salidas >= 0),
  cantidad int not null,
  financiado_con_linea boolean not null default false,
  monto_financiado_linea bigint not null default 0,
  primary key (usuario_id, ciclo, grupo)
);

create table finanzas.caja_resumen (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  ciclo date not null check (extract(day from ciclo) = 1),
  ciclo_inicio date not null,
  ciclo_fin date not null,
  entradas bigint not null,
  salidas bigint not null,
  neto bigint not null,
  saldo_hoy bigint,
  comprometido_proximo bigint,
  comprometido_antes_sueldo bigint,
  disponible_para_vivir bigint,
  proximo_sueldo date,
  datos_completos boolean not null default false,
  financiado_con_linea boolean not null default false,
  monto_financiado_linea bigint not null default 0,
  primary key (usuario_id, ciclo)
);

create function finanzas.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := now();
  return new;
end
$$;

revoke all on function finanzas.tocar_actualizado() from public;
revoke all on function finanzas.tocar_actualizado() from anon;

create table finanzas.pago_fijo (
  pago_fijo_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  categoria finanzas.categoria not null default 'vivienda_servicios',
  monto bigint not null check (monto > 0),
  dia_vencimiento int not null check (dia_vencimiento between 1 and 31),
  desde date,
  hasta date,
  meses_pausa int[] not null default '{}',
  activo boolean not null default true,
  actualizado timestamptz not null default now(),
  check (hasta is null or desde is null or hasta >= desde),
  check (
    cardinality(meses_pausa) <= 12
    and array_position(meses_pausa, null) is null
    and 1 <= all (meses_pausa)
    and 12 >= all (meses_pausa)
  )
);

create table finanzas.deuda_manual (
  deuda_manual_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  acreedor text check (char_length(acreedor) <= 80),
  tipo text not null default 'otro' check (tipo in ('tarjeta', 'consumo', 'automotriz', 'educacion', 'otro')),
  saldo bigint not null check (saldo >= 0),
  tasa_mensual numeric(6, 3) check (tasa_mensual >= 0),
  cuota_minima bigint check (cuota_minima >= 0),
  cuota_fija bigint check (cuota_fija >= 0),
  cuotas_restantes int check (cuotas_restantes >= 0),
  dia_pago int check (dia_pago between 1 and 31),
  proximo_pago date,
  activo boolean not null default true,
  actualizado timestamptz not null default now()
);

create table finanzas.sobre (
  sobre_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 40),
  categoria finanzas.categoria,
  monto bigint not null check (monto > 0),
  periodo text not null default 'mes' check (periodo in ('semana', 'mes')),
  esencial boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  actualizado timestamptz not null default now(),
  unique (sobre_id, usuario_id)
);

create table finanzas.anotacion (
  anotacion_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  sobre_id uuid,
  fecha timestamptz not null default now(),
  monto bigint not null check (monto > 0),
  nota text check (char_length(nota) <= 140),
  medio text not null default 'debito' check (medio in ('debito', 'credito', 'efectivo', 'otro')),
  movimiento_id text,
  creado timestamptz not null default now(),
  foreign key (sobre_id, usuario_id) references finanzas.sobre (sobre_id, usuario_id) on delete set null (sobre_id)
);

create index anotacion_usuario_fecha_idx on finanzas.anotacion (usuario_id, fecha desc);
create index anotacion_sobre_idx on finanzas.anotacion (sobre_id);

create trigger pago_fijo_actualizado before update on finanzas.pago_fijo
  for each row execute function finanzas.tocar_actualizado();
create trigger deuda_manual_actualizado before update on finanzas.deuda_manual
  for each row execute function finanzas.tocar_actualizado();
create trigger sobre_actualizado before update on finanzas.sobre
  for each row execute function finanzas.tocar_actualizado();

alter table finanzas.caja_ciclo enable row level security;
alter table finanzas.caja_resumen enable row level security;
alter table finanzas.pago_fijo enable row level security;
alter table finanzas.deuda_manual enable row level security;
alter table finanzas.sobre enable row level security;
alter table finanzas.anotacion enable row level security;

create policy caja_ciclo_lectura_dueno on finanzas.caja_ciclo
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy caja_resumen_lectura_dueno on finanzas.caja_resumen
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy pago_fijo_lectura_dueno on finanzas.pago_fijo
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_fijo_alta_dueno on finanzas.pago_fijo
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_fijo_cambio_dueno on finanzas.pago_fijo
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_fijo_baja_dueno on finanzas.pago_fijo
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy deuda_manual_lectura_dueno on finanzas.deuda_manual
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy deuda_manual_alta_dueno on finanzas.deuda_manual
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy deuda_manual_cambio_dueno on finanzas.deuda_manual
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy deuda_manual_baja_dueno on finanzas.deuda_manual
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy sobre_lectura_dueno on finanzas.sobre
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy sobre_alta_dueno on finanzas.sobre
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy sobre_cambio_dueno on finanzas.sobre
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy sobre_baja_dueno on finanzas.sobre
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy anotacion_lectura_dueno on finanzas.anotacion
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy anotacion_alta_dueno on finanzas.anotacion
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy anotacion_cambio_dueno on finanzas.anotacion
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy anotacion_baja_dueno on finanzas.anotacion
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create view finanzas.lo_que_viene with (security_invoker = true) as
with ciclo as (
  select distinct on (r.usuario_id)
    r.usuario_id, r.ciclo, r.saldo_hoy, r.proximo_sueldo, finanzas.hoy_chile() as hoy
  from finanzas.caja_resumen r
  where r.saldo_hoy is not null and r.proximo_sueldo is not null
  order by r.usuario_id, r.ciclo desc
),
meses as (
  select c.usuario_id, gs::date as mes
  from ciclo c
  cross join generate_series(date_trunc('month', c.hoy), date_trunc('month', c.proximo_sueldo) + interval '1 month', interval '1 month') gs
),
tarjeta as (
  select
    d.usuario_id, 'tarjeta'::text as origen, d.nombre, d.banco as acreedor, d.proximo_vencimiento as fecha,
    greatest(coalesce(d.monto_facturado, 0) - coalesce(d.monto_pagado, 0), 0) as monto,
    round(d.pago_minimo)::bigint as monto_minimo
  from finanzas.deuda_producto d
  where d.tipo = 'tarjeta'
),
credito as (
  select
    d.usuario_id,
    case d.tipo when 'hipotecario' then 'dividendo' else 'credito' end as origen,
    d.nombre, d.banco as acreedor, d.tipo, d.moneda, d.valor_cuota,
    case
      when d.proximo_vencimiento is null or d.proximo_vencimiento >= c.hoy then d.proximo_vencimiento
      else (
        select min(x.f)
        from generate_series(1, 24) k(n)
        cross join lateral (select (d.proximo_vencimiento + make_interval(months => k.n))::date as f) x
        where x.f >= c.hoy
      )
    end as fecha
  from finanzas.deuda_producto d
  join ciclo c on c.usuario_id = d.usuario_id
  where d.tipo in ('consumo', 'hipotecario')
),
credito_monto as (
  select
    cr.usuario_id, cr.origen, cr.nombre, cr.acreedor, cr.fecha,
    coalesce(q.monto, case when cr.moneda = 'CLP' then round(cr.valor_cuota)::bigint end) as monto
  from credito cr
  join ciclo c on c.usuario_id = cr.usuario_id
  left join finanzas.deuda_cuota_mes q
    on q.usuario_id = cr.usuario_id and q.banco = cr.acreedor and q.tipo = cr.tipo and q.nombre = cr.nombre
   and q.mes = date_trunc('month', coalesce(cr.fecha, c.hoy))::date
),
fijo as (
  select p.usuario_id, 'pago_fijo'::text as origen, p.nombre, null::text as acreedor, x.fecha, p.monto
  from finanzas.pago_fijo p
  join ciclo c on c.usuario_id = p.usuario_id
  join meses m on m.usuario_id = p.usuario_id
  cross join lateral (
    select (m.mes + make_interval(days => least(p.dia_vencimiento, extract(day from m.mes + interval '1 month - 1 day')::int) - 1))::date as fecha
  ) x
  where p.activo
    and x.fecha >= c.hoy
    and (p.desde is null or x.fecha >= p.desde)
    and (p.hasta is null or x.fecha <= p.hasta)
    and not (extract(month from x.fecha)::int = any (p.meses_pausa))
),
manual as (
  select
    d.usuario_id, 'deuda_manual'::text as origen, d.nombre, d.acreedor,
    case
      when d.proximo_pago >= c.hoy or d.dia_pago is null then d.proximo_pago
      else (
        select min(x.f)
        from meses m
        cross join lateral (
          select (m.mes + make_interval(days => least(d.dia_pago, extract(day from m.mes + interval '1 month - 1 day')::int) - 1))::date as f
        ) x
        where m.usuario_id = d.usuario_id and x.f >= c.hoy
      )
    end as fecha,
    coalesce(d.cuota_fija, d.cuota_minima) as monto,
    d.cuota_minima as monto_minimo
  from finanzas.deuda_manual d
  join ciclo c on c.usuario_id = d.usuario_id
  where d.activo and d.saldo > 0 and coalesce(d.cuotas_restantes, 1) > 0
),
items as (
  select usuario_id, origen, nombre, acreedor, fecha, monto::bigint as monto, least(coalesce(monto_minimo, monto), monto)::bigint as monto_minimo
  from tarjeta where monto > 0
  union all
  select usuario_id, origen, nombre, acreedor, fecha, monto, monto from credito_monto where monto > 0
  union all
  select usuario_id, origen, nombre, acreedor, fecha, monto, monto from fijo
  union all
  select usuario_id, origen, nombre, acreedor, fecha, monto::bigint, least(coalesce(monto_minimo, monto), monto)::bigint
  from manual where monto > 0
)
select
  i.usuario_id,
  c.ciclo,
  i.origen,
  i.nombre,
  i.acreedor,
  i.fecha,
  i.monto,
  i.monto_minimo,
  c.proximo_sueldo,
  c.saldo_hoy,
  sum(i.monto) over (partition by i.usuario_id)::bigint as total_comprometido,
  (c.saldo_hoy - sum(i.monto) over (partition by i.usuario_id))::bigint as disponible_para_vivir_ajustado
from items i
join ciclo c on c.usuario_id = i.usuario_id
where coalesce(i.fecha, c.hoy) < c.proximo_sueldo;

create view finanzas.deudas_todas with (security_invoker = true) as
select
  d.usuario_id,
  'banco'::text as origen,
  d.nombre,
  d.banco as acreedor,
  d.tipo,
  d.saldo_deuda_clp as saldo_clp,
  d.tasa_mensual,
  case
    when d.tipo = 'tarjeta' then round(d.pago_minimo)
    when d.moneda = 'CLP' then round(d.valor_cuota)
  end::bigint as cuota_minima,
  d.proximo_vencimiento as proximo_pago
from finanzas.deuda_producto d
where d.tipo <> 'hipotecario'
union all
select
  m.usuario_id,
  'manual',
  m.nombre,
  m.acreedor,
  m.tipo,
  m.saldo,
  m.tasa_mensual,
  coalesce(m.cuota_minima, m.cuota_fija),
  m.proximo_pago
from finanzas.deuda_manual m
where m.activo;

create view finanzas.estado_sobre with (security_invoker = true) as
with base as (
  select
    s.*,
    finanzas.hoy_chile() as hoy,
    case s.periodo
      when 'semana' then date_trunc('week', finanzas.hoy_chile())::date
      else date_trunc('month', finanzas.hoy_chile())::date
    end as inicio
  from finanzas.sobre s
  where s.activo
),
periodo as (
  select
    b.*,
    case b.periodo
      when 'semana' then b.inicio + 6
      else (b.inicio + interval '1 month - 1 day')::date
    end as fin
  from base b
),
medido as (
  select
    p.*,
    coalesce((
      select sum(a.monto)
      from finanzas.anotacion a
      where a.sobre_id = p.sobre_id
        and a.usuario_id = p.usuario_id
        and (a.fecha at time zone 'America/Santiago')::date between p.inicio and p.fin
    ), 0) as anotado,
    case when p.categoria is not null then coalesce((
      select sum(abs(coalesce(m.monto_total_compra, m.monto)))
      from finanzas.movimiento m
      where m.usuario_id = p.usuario_id
        and m.categoria = p.categoria
        and m.tipo_flujo = 'gasto'
        and m.monto < 0
        and coalesce(m.cuota_actual, 1) <= 1
        and m.fecha between p.inicio and p.fin
        and not exists (
          select 1 from finanzas.anotacion a
          where a.usuario_id = m.usuario_id and a.movimiento_id = m.movimiento_id
        )
    ), 0) end as sin_anotar
  from periodo p
)
select
  md.sobre_id,
  md.usuario_id,
  md.nombre,
  md.categoria,
  md.periodo,
  md.esencial,
  md.orden,
  md.monto,
  md.inicio,
  md.fin,
  md.anotado::bigint as anotado,
  (md.monto - md.anotado)::bigint as disponible,
  round(100.0 * md.anotado / md.monto, 1) as porcentaje,
  (md.fin - md.hoy + 1)::int as dias_restantes,
  md.sin_anotar::bigint as sin_anotar
from medido md;

revoke all on
  finanzas.caja_ciclo, finanzas.caja_resumen, finanzas.pago_fijo, finanzas.deuda_manual, finanzas.sobre,
  finanzas.anotacion, finanzas.lo_que_viene, finanzas.deudas_todas, finanzas.estado_sobre
  from public, anon;

grant select on
  finanzas.caja_ciclo, finanzas.caja_resumen, finanzas.lo_que_viene, finanzas.deudas_todas, finanzas.estado_sobre
  to authenticated;

grant select, insert, update, delete on
  finanzas.pago_fijo, finanzas.deuda_manual, finanzas.sobre, finanzas.anotacion
  to authenticated;

grant all on
  finanzas.caja_ciclo, finanzas.caja_resumen, finanzas.pago_fijo, finanzas.deuda_manual, finanzas.sobre,
  finanzas.anotacion, finanzas.lo_que_viene, finanzas.deudas_todas, finanzas.estado_sobre
  to service_role;

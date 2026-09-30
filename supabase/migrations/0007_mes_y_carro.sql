create table finanzas.pago_marcado (
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  ciclo date not null,
  clave text not null check (char_length(clave) between 1 and 200),
  pagado boolean not null,
  actualizado timestamptz not null default now(),
  primary key (usuario_id, ciclo, clave)
);

create table finanzas.compra (
  compra_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  sobre_id uuid not null,
  lugar text not null check (char_length(lugar) between 1 and 60),
  abierta boolean not null default true,
  anotacion_id uuid references finanzas.anotacion (anotacion_id) on delete set null,
  creada timestamptz not null default now(),
  cerrada timestamptz,
  unique (compra_id, usuario_id),
  foreign key (sobre_id, usuario_id) references finanzas.sobre (sobre_id, usuario_id) on delete cascade
);

create table finanzas.compra_item (
  item_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  compra_id uuid not null,
  nombre text not null check (char_length(nombre) between 1 and 60),
  cantidad numeric(8, 2) not null default 1 check (cantidad > 0 and cantidad <= 999),
  precio bigint not null check (precio >= 0 and precio <= 50000000),
  creado timestamptz not null default now(),
  foreign key (compra_id, usuario_id) references finanzas.compra (compra_id, usuario_id) on delete cascade
);

create index compra_usuario_idx on finanzas.compra (usuario_id, creada desc);
create index compra_item_compra_idx on finanzas.compra_item (compra_id);
create index compra_item_nombre_idx on finanzas.compra_item (usuario_id, lower(nombre), creado desc);

create trigger pago_marcado_actualizado before update on finanzas.pago_marcado
  for each row execute function finanzas.tocar_actualizado();

alter table finanzas.pago_marcado enable row level security;
alter table finanzas.compra enable row level security;
alter table finanzas.compra_item enable row level security;

create policy pago_marcado_lectura_dueno on finanzas.pago_marcado
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_marcado_alta_dueno on finanzas.pago_marcado
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_marcado_cambio_dueno on finanzas.pago_marcado
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy pago_marcado_baja_dueno on finanzas.pago_marcado
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy compra_lectura_dueno on finanzas.compra
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_alta_dueno on finanzas.compra
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_cambio_dueno on finanzas.compra
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_baja_dueno on finanzas.compra
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy compra_item_lectura_dueno on finanzas.compra_item
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_item_alta_dueno on finanzas.compra_item
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_item_cambio_dueno on finanzas.compra_item
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy compra_item_baja_dueno on finanzas.compra_item
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create function finanzas.cerrar_compra(p_compra uuid, p_medio text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sobre uuid;
  v_lugar text;
  v_total bigint;
  v_id uuid;
begin
  select c.sobre_id, c.lugar into v_sobre, v_lugar
  from finanzas.compra c
  where c.compra_id = p_compra and c.abierta
  for update;
  if not found then
    raise exception 'compra no encontrada o ya cerrada';
  end if;
  select coalesce(round(sum(i.cantidad * i.precio)), 0)::bigint into v_total
  from finanzas.compra_item i
  where i.compra_id = p_compra;
  if v_total <= 0 then
    raise exception 'la compra no tiene productos';
  end if;
  insert into finanzas.anotacion (sobre_id, monto, nota, medio)
  values (v_sobre, v_total, v_lugar, p_medio)
  returning anotacion_id into v_id;
  update finanzas.compra set abierta = false, anotacion_id = v_id, cerrada = now()
  where compra_id = p_compra;
  return v_id;
end;
$$;

create function finanzas.fecha_en_ciclo(p_inicio date, p_fin date, p_dia int)
returns date
language sql
immutable
set search_path = ''
as $$
  select x.f
  from unnest(array[p_inicio, p_fin]) m(d)
  cross join lateral (
    select (date_trunc('month', m.d) + make_interval(days => least(p_dia, extract(day from date_trunc('month', m.d) + interval '1 month - 1 day')::int) - 1))::date as f
  ) x
  where x.f between p_inicio and p_fin
  order by x.f
  limit 1
$$;

create view finanzas.pagos_ciclo with (security_invoker = true) as
with actual as (
  select distinct on (r.usuario_id) r.usuario_id, r.ciclo, r.ciclo_inicio, r.ciclo_fin
  from finanzas.caja_resumen r
  where r.saldo_hoy is not null
  order by r.usuario_id, r.ciclo desc
),
ciclos as (
  select usuario_id, ciclo, ciclo_inicio as inicio, ciclo_fin as fin, 0 as n from actual
  union all
  select usuario_id, (ciclo + interval '1 month')::date, ciclo_fin + 1, (ciclo_fin + interval '1 month')::date, 1 from actual
),
fijo as (
  select
    c.usuario_id, c.ciclo, c.n, 'fijo:' || p.pago_fijo_id as clave, 'pago_fijo'::text as origen, p.nombre, null::text as acreedor,
    x.fecha, p.monto, p.monto as monto_minimo, 0::bigint as pagado_banco, false as automatico, false as estimado
  from ciclos c
  join finanzas.pago_fijo p on p.usuario_id = c.usuario_id and p.activo
  cross join lateral (select finanzas.fecha_en_ciclo(c.inicio, c.fin, p.dia_vencimiento) as fecha) x
  where (p.desde is null or x.fecha >= p.desde)
    and (p.hasta is null or x.fecha <= p.hasta)
    and not (extract(month from x.fecha)::int = any (p.meses_pausa))
),
manual as (
  select
    c.usuario_id, c.ciclo, c.n, 'manual:' || d.deuda_manual_id, 'deuda_manual', d.nombre, d.acreedor,
    coalesce(case when d.dia_pago is not null then finanzas.fecha_en_ciclo(c.inicio, c.fin, d.dia_pago) end, d.proximo_pago),
    coalesce(d.cuota_fija, d.cuota_minima), coalesce(d.cuota_minima, d.cuota_fija), 0::bigint, false, false
  from ciclos c
  join finanzas.deuda_manual d on d.usuario_id = c.usuario_id and d.activo and d.saldo > 0 and coalesce(d.cuotas_restantes, 1) > 0
  where coalesce(d.cuota_fija, d.cuota_minima, 0) > 0
    and (d.dia_pago is not null or d.proximo_pago between c.inicio and c.fin)
),
tarjeta_base as (
  select
    d.usuario_id, d.banco, d.nombre, d.proximo_vencimiento, d.monto_facturado, d.pago_minimo, d.monto_por_facturar,
    greatest(coalesce(d.monto_pagado, 0), coalesce((
      select sum(m.monto)
      from finanzas.movimiento m
      where m.usuario_id = d.usuario_id and m.banco = d.banco and m.producto_nombre = d.nombre
        and m.producto_tipo = 'tarjeta' and m.categoria = 'pago_tarjeta_credito' and m.monto > 0
        and m.fecha > d.fecha_facturacion
    ), 0)) as pagado
  from finanzas.deuda_producto d
  where d.tipo = 'tarjeta' and d.proximo_vencimiento is not null and coalesce(d.monto_facturado, 0) > 0
),
tarjeta as (
  select
    c.usuario_id, c.ciclo, c.n, 'tarjeta:' || t.banco || ':' || t.nombre, 'tarjeta', t.nombre, t.banco,
    t.proximo_vencimiento, round(t.monto_facturado)::bigint, round(least(t.pago_minimo, t.monto_facturado))::bigint,
    round(t.pagado)::bigint, true, false
  from ciclos c
  join tarjeta_base t on t.usuario_id = c.usuario_id and t.proximo_vencimiento between c.inicio and c.fin
  union all
  select
    c.usuario_id, c.ciclo, c.n, 'tarjeta:' || t.banco || ':' || t.nombre, 'tarjeta', t.nombre, t.banco,
    (t.proximo_vencimiento + interval '1 month')::date,
    round(coalesce(t.monto_por_facturar, 0)
      + case when t.proximo_vencimiento <= finanzas.hoy_chile() then greatest(t.monto_facturado - t.pagado, 0) else 0 end)::bigint,
    null::bigint, 0::bigint, true, true
  from ciclos c
  join ciclos c0 on c0.usuario_id = c.usuario_id and c0.n = 0
  join tarjeta_base t on t.usuario_id = c.usuario_id and t.proximo_vencimiento between c0.inicio and c0.fin
  where c.n = 1
),
credito_base as (
  select d.usuario_id, d.banco, d.tipo, d.nombre, d.moneda, d.valor_cuota, extract(day from d.proximo_vencimiento)::int as dia
  from finanzas.deuda_producto d
  where d.tipo in ('hipotecario', 'consumo') and coalesce(d.saldo_deuda_clp, 1) > 0
),
credito as (
  select
    c.usuario_id, c.ciclo, c.n, 'credito:' || k.banco || ':' || k.nombre,
    case k.tipo when 'hipotecario' then 'dividendo' else 'credito' end, k.nombre, k.banco, x.fecha,
    coalesce(nullif(q.monto, 0), case when k.moneda = 'CLP' then round(k.valor_cuota)::bigint end, nullif(p.pagado, 0), u.ultimo) as monto,
    null::bigint, coalesce(p.pagado, 0), true, q.monto is null and k.moneda <> 'CLP'
  from ciclos c
  join credito_base k on k.usuario_id = c.usuario_id
  cross join lateral (select case when k.dia is not null then finanzas.fecha_en_ciclo(c.inicio, c.fin, k.dia) end as fecha) x
  left join finanzas.deuda_cuota_mes q
    on q.usuario_id = k.usuario_id and q.banco = k.banco and q.tipo = k.tipo and q.nombre = k.nombre
   and q.mes = date_trunc('month', coalesce(x.fecha, c.fin))::date
  cross join lateral (
    select sum(-m.monto)::bigint as pagado
    from finanzas.movimiento m
    where m.usuario_id = k.usuario_id and m.banco = k.banco and m.producto_tipo = 'cuenta' and m.monto < 0
      and m.fecha between c.inicio and c.fin
      and case k.tipo when 'hipotecario' then m.glosa ilike '%hipotec%' else m.categoria = 'pago_credito' end
  ) p
  left join lateral (
    select -m.monto::bigint as ultimo
    from finanzas.movimiento m
    where m.usuario_id = k.usuario_id and m.banco = k.banco and m.producto_tipo = 'cuenta' and m.monto < 0
      and case k.tipo when 'hipotecario' then m.glosa ilike '%hipotec%' else m.categoria = 'pago_credito' end
    order by m.fecha desc
    limit 1
  ) u on true
),
items as (
  select * from fijo
  union all select * from manual
  union all select * from tarjeta
  union all select * from credito
),
estado as (
  select
    i.*,
    mk.pagado as marcado,
    case
      when mk.pagado then 'pagado'
      when mk.pagado = false then 'pendiente'
      when i.monto > 0 and i.pagado_banco >= 0.99 * i.monto then 'pagado'
      when i.origen = 'tarjeta' and i.monto_minimo is not null and i.pagado_banco > 0 and i.pagado_banco >= 0.99 * i.monto_minimo then 'minimo'
      else 'pendiente'
    end as estado
  from items i
  left join finanzas.pago_marcado mk on mk.usuario_id = i.usuario_id and mk.ciclo = i.ciclo and mk.clave = i.clave
  where coalesce(i.monto, 0) > 0
)
select
  e.usuario_id, e.ciclo, c.inicio as ciclo_inicio, c.fin as ciclo_fin, e.n = 0 as en_curso,
  e.clave, e.origen, e.nombre, e.acreedor, e.fecha, e.monto, e.monto_minimo, e.pagado_banco,
  e.automatico, e.estimado, e.marcado, e.estado,
  case
    when e.estado = 'pagado' then 0
    when e.estado = 'minimo' and e.fecha <= finanzas.hoy_chile() then 0
    else greatest(e.monto - e.pagado_banco, 0)
  end::bigint as por_pagar,
  case
    when e.estado in ('pagado', 'minimo') then 0
    else greatest(coalesce(e.monto_minimo, e.monto) - e.pagado_banco, 0)
  end::bigint as por_pagar_minimo,
  case
    when e.estado = 'minimo' and e.fecha <= finanzas.hoy_chile() then least(e.pagado_banco, e.monto)
    else e.monto
  end::bigint as comprometido
from estado e
join ciclos c on c.usuario_id = e.usuario_id and c.ciclo = e.ciclo;

create or replace view finanzas.lo_que_viene with (security_invoker = true) as
with ciclo as (
  select distinct on (r.usuario_id)
    r.usuario_id, r.ciclo, r.saldo_hoy, r.proximo_sueldo
  from finanzas.caja_resumen r
  where r.saldo_hoy is not null and r.proximo_sueldo is not null
  order by r.usuario_id, r.ciclo desc
),
items as (
  select p.usuario_id, p.origen, p.nombre, p.acreedor, p.fecha, p.por_pagar as monto, p.por_pagar_minimo as monto_minimo
  from finanzas.pagos_ciclo p
  where p.en_curso and p.por_pagar > 0
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
join ciclo c on c.usuario_id = i.usuario_id;

create or replace view finanzas.estado_sobre with (security_invoker = true) as
with ciclo as (
  select distinct on (r.usuario_id) r.usuario_id, r.ciclo_inicio, r.ciclo_fin
  from finanzas.caja_resumen r
  where r.saldo_hoy is not null
  order by r.usuario_id, r.ciclo desc
),
periodo as (
  select
    s.*,
    finanzas.hoy_chile() as hoy,
    case s.periodo
      when 'semana' then date_trunc('week', finanzas.hoy_chile())::date
      else coalesce(c.ciclo_inicio, date_trunc('month', finanzas.hoy_chile())::date)
    end as inicio,
    case s.periodo
      when 'semana' then date_trunc('week', finanzas.hoy_chile())::date + 6
      else coalesce(c.ciclo_fin, (date_trunc('month', finanzas.hoy_chile()) + interval '1 month - 1 day')::date)
    end as fin
  from finanzas.sobre s
  left join ciclo c on c.usuario_id = s.usuario_id
  where s.activo
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
    coalesce((
      select sum(a.monto)
      from finanzas.anotacion a
      where a.sobre_id = p.sobre_id
        and a.usuario_id = p.usuario_id
        and a.medio in ('debito', 'credito')
        and (a.fecha at time zone 'America/Santiago')::date between p.inicio and p.fin
    ), 0) as anotado_banco,
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
        and not exists (
          select 1 from finanzas.pago_fijo f
          where f.usuario_id = m.usuario_id and f.activo and f.categoria = m.categoria and f.monto = abs(m.monto)
        )
    ), 0) end as banco
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
  greatest(coalesce(md.banco, 0) - md.anotado_banco, 0)::bigint as sin_anotar
from medido md;

revoke all on finanzas.pago_marcado, finanzas.compra, finanzas.compra_item, finanzas.pagos_ciclo from public, anon;
grant select on finanzas.pagos_ciclo to authenticated;
grant select, insert, update, delete on finanzas.pago_marcado, finanzas.compra, finanzas.compra_item to authenticated;
grant all on finanzas.pago_marcado, finanzas.compra, finanzas.compra_item, finanzas.pagos_ciclo to service_role;

revoke all on function finanzas.cerrar_compra(uuid, text) from public, anon;
grant execute on function finanzas.cerrar_compra(uuid, text) to authenticated, service_role;
revoke all on function finanzas.fecha_en_ciclo(date, date, int) from public, anon;
grant execute on function finanzas.fecha_en_ciclo(date, date, int) to authenticated, service_role;

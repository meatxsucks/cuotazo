create or replace view finanzas.lo_que_viene with (security_invoker = true) as
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
    and x.fecha > c.hoy
    and (p.desde is null or x.fecha >= p.desde)
    and (p.hasta is null or x.fecha <= p.hasta)
    and not (extract(month from x.fecha)::int = any (p.meses_pausa))
),
manual as (
  select
    d.usuario_id, 'deuda_manual'::text as origen, d.nombre, d.acreedor,
    case
      when d.proximo_pago > c.hoy or d.dia_pago is null then d.proximo_pago
      else (
        select min(x.f)
        from meses m
        cross join lateral (
          select (m.mes + make_interval(days => least(d.dia_pago, extract(day from m.mes + interval '1 month - 1 day')::int) - 1))::date as f
        ) x
        where m.usuario_id = d.usuario_id and x.f > c.hoy
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

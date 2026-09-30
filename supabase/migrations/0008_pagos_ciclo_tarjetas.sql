create or replace view finanzas.pagos_ciclo with (security_invoker = true) as
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
    d.usuario_id, d.banco, d.nombre, d.proximo_vencimiento, d.monto_facturado, d.pago_minimo,
    coalesce((
      select sum(-m.monto)
      from finanzas.movimiento m
      where m.usuario_id = d.usuario_id and m.banco = d.banco and m.producto_nombre = d.nombre
        and m.producto_tipo = 'tarjeta' and m.monto < 0 and coalesce(m.cuotas_total, 1) <= 1
        and m.fecha > d.fecha_facturacion
    ), 0) as contado_sin_facturar,
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
    round(t.contado_sin_facturar + coalesce(q.monto, 0)
      + case when t.proximo_vencimiento <= finanzas.hoy_chile() then greatest(t.monto_facturado - t.pagado, 0) else 0 end)::bigint,
    null::bigint, 0::bigint, true, true
  from ciclos c
  join ciclos c0 on c0.usuario_id = c.usuario_id and c0.n = 0
  join tarjeta_base t on t.usuario_id = c.usuario_id and t.proximo_vencimiento between c0.inicio and c0.fin
  left join finanzas.deuda_cuota_mes q
    on q.usuario_id = t.usuario_id and q.banco = t.banco and q.tipo = 'tarjeta' and q.nombre = t.nombre
   and q.mes = date_trunc('month', t.proximo_vencimiento + interval '1 month')::date
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
    null::bigint, coalesce(p.pagado, 0), true, q.monto is null and k.moneda <> 'CLP' and p.pagado is null
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

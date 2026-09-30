create function finanzas.hoy_chile()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Santiago')::date
$$;

revoke all on function finanzas.hoy_chile() from public;
revoke all on function finanzas.hoy_chile() from anon;
grant execute on function finanzas.hoy_chile() to authenticated, service_role;

alter table finanzas.presupuesto drop constraint presupuesto_pkey;

alter table finanzas.presupuesto
  add column presupuesto_id uuid not null default gen_random_uuid(),
  add column tipo text not null default 'categoria',
  add column porcentaje_limite numeric(5, 2),
  add column umbrales int[] not null default '{80,100}',
  add column alerta_pronostico boolean not null default true,
  alter column mes drop not null,
  alter column categoria drop not null,
  alter column monto_limite drop not null;

alter table finanzas.presupuesto add primary key (presupuesto_id);

alter table finanzas.presupuesto
  add constraint presupuesto_tipo_check
    check (tipo in ('categoria', 'total', 'compras_credito', 'carga_cuotas')),
  add constraint presupuesto_categoria_tipo_check
    check ((tipo = 'categoria') = (categoria is not null)),
  add constraint presupuesto_limite_tipo_check
    check (
      case
        when tipo = 'carga_cuotas' then
          monto_limite is null and porcentaje_limite is not null and porcentaje_limite > 0 and porcentaje_limite <= 100
        else
          monto_limite is not null and porcentaje_limite is null
      end
    ),
  add constraint presupuesto_umbrales_check
    check (
      cardinality(umbrales) between 1 and 5
      and array_position(umbrales, null) is null
      and 1 <= all (umbrales)
      and 200 >= all (umbrales)
    );

create unique index presupuesto_unico_mes
  on finanzas.presupuesto (usuario_id, tipo, coalesce(categoria::text, ''), mes)
  where mes is not null;

create unique index presupuesto_unico_recurrente
  on finanzas.presupuesto (usuario_id, tipo, coalesce(categoria::text, ''))
  where mes is null;

create table finanzas.perfil (
  usuario_id uuid primary key default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  ingreso_mensual_neto bigint check (ingreso_mensual_neto > 0),
  dia_pago int check (dia_pago between 1 and 31),
  meta_ahorro_mensual bigint not null default 0 check (meta_ahorro_mensual >= 0),
  tope_carga_cuotas_pct int not null default 30 check (tope_carga_cuotas_pct between 1 and 100),
  actualizado timestamptz not null default now()
);

alter table finanzas.perfil enable row level security;

create policy perfil_lectura_dueno on finanzas.perfil
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create policy perfil_alta_dueno on finanzas.perfil
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));

create policy perfil_cambio_dueno on finanzas.perfil
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));

create policy perfil_baja_dueno on finanzas.perfil
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create view finanzas.credito_mes with (security_invoker = true) as
with meses as (
  select gs::date as mes
  from generate_series(
    date_trunc('month', finanzas.hoy_chile()) - interval '5 months',
    date_trunc('month', finanzas.hoy_chile()),
    interval '1 month'
  ) gs
)
select
  u.usuario_id,
  m.mes,
  coalesce(cc.monto, 0)::bigint as compras_cuotas_monto,
  coalesce(cc.cantidad, 0)::int as compras_cuotas_cantidad,
  coalesce(dc.monto, 0)::bigint as cuotas_mes,
  coalesce(p.ingreso_mensual_neto, ir.ingresos)::bigint as ingreso_referencia,
  round(100.0 * coalesce(dc.monto, 0) / nullif(coalesce(p.ingreso_mensual_neto, ir.ingresos), 0), 1) as carga_porcentaje
from finanzas.usuario u
cross join meses m
left join finanzas.perfil p on p.usuario_id = u.usuario_id
left join lateral (
  select sum(abs(coalesce(mv.monto_total_compra, mv.monto))) as monto, count(*) as cantidad
  from finanzas.movimiento mv
  where mv.usuario_id = u.usuario_id
    and mv.producto_tipo = 'tarjeta'
    and mv.tipo_flujo = 'gasto'
    and mv.cuotas_total > 1
    and (
      (mv.cuota_actual = 1 and mv.fecha_imputacion >= m.mes and mv.fecha_imputacion < m.mes + interval '1 month')
      or (mv.cuota_actual is null and mv.fecha >= m.mes and mv.fecha < m.mes + interval '1 month')
    )
) cc on true
left join lateral (
  select sum(d.monto) as monto
  from finanzas.deuda_cuota_mes d
  where d.usuario_id = u.usuario_id and d.mes = m.mes
) dc on true
left join lateral (
  select round(avg(r.ingresos)) as ingresos
  from (
    select r.ingresos
    from finanzas.resumen_mensual r
    where r.usuario_id = u.usuario_id and r.mes < m.mes and r.ingresos > 0
    order by r.mes desc
    limit 3
  ) r
) ir on true;

create view finanzas.estado_presupuesto with (security_invoker = true) as
with meses as (
  select gs::date as mes, finanzas.hoy_chile() as hoy
  from generate_series(
    date_trunc('month', finanzas.hoy_chile()) - interval '5 months',
    date_trunc('month', finanzas.hoy_chile()),
    interval '1 month'
  ) gs
),
aplicables as (
  select
    p.presupuesto_id, p.usuario_id, p.tipo, p.categoria, p.mes is null as recurrente,
    p.monto_limite, p.porcentaje_limite, p.umbrales, p.alerta_pronostico,
    m.mes, m.hoy
  from finanzas.presupuesto p
  join meses m
    on m.mes = p.mes
    or (
      p.mes is null
      and not exists (
        select 1
        from finanzas.presupuesto e
        where e.usuario_id = p.usuario_id
          and e.tipo = p.tipo
          and e.categoria is not distinct from p.categoria
          and e.mes = m.mes
      )
    )
),
medidos as (
  select
    a.*,
    coalesce(a.monto_limite::numeric, a.porcentaje_limite) as limite,
    case a.tipo
      when 'categoria' then (
        select coalesce(sum(g.monto_gasto), 0)
        from finanzas.gasto_diario g
        where g.usuario_id = a.usuario_id and g.categoria = a.categoria
          and g.fecha >= a.mes and g.fecha < a.mes + interval '1 month'
      )
      when 'total' then (
        select coalesce(sum(g.monto_gasto), 0)
        from finanzas.gasto_diario g
        where g.usuario_id = a.usuario_id
          and g.fecha >= a.mes and g.fecha < a.mes + interval '1 month'
      )
      when 'compras_credito' then c.compras_cuotas_monto
      when 'carga_cuotas' then c.carga_porcentaje
    end::numeric as consumido,
    case a.tipo when 'compras_credito' then c.compras_cuotas_cantidad end as cantidad,
    case a.tipo when 'carga_cuotas' then c.cuotas_mes end as cuotas_mes,
    case a.tipo when 'carga_cuotas' then c.ingreso_referencia end as ingreso_referencia,
    a.mes = date_trunc('month', a.hoy)::date as en_curso,
    extract(day from a.hoy)::numeric as dia,
    extract(day from a.mes + interval '1 month' - interval '1 day')::numeric as dias_mes
  from aplicables a
  left join finanzas.credito_mes c on c.usuario_id = a.usuario_id and c.mes = a.mes
),
proyectados as (
  select
    md.*,
    case when md.limite > 0 then round(100 * md.consumido / md.limite, 1) end as porcentaje,
    case
      when not md.en_curso then null
      when md.tipo = 'carga_cuotas' then md.consumido
      else round(md.consumido * md.dias_mes / md.dia)
    end as proyectado_cierre
  from medidos md
),
evaluados as (
  select
    pr.*,
    (select max(u) from unnest(pr.umbrales) u where pr.porcentaje >= u) as umbral_cruzado,
    coalesce(pr.alerta_pronostico and pr.en_curso and pr.proyectado_cierre > pr.limite, false) as excede_pronostico
  from proyectados pr
)
select
  e.presupuesto_id,
  e.usuario_id,
  e.tipo,
  e.categoria,
  e.mes,
  e.recurrente,
  e.limite,
  e.consumido,
  e.porcentaje,
  e.proyectado_cierre,
  e.umbral_cruzado,
  e.excede_pronostico,
  case
    when e.consumido > 0 and e.consumido >= e.limite then 'excedido'
    when e.umbral_cruzado is not null then 'aviso'
    when e.excede_pronostico then 'pronostico_excede'
    else 'ok'
  end as estado,
  e.umbrales,
  e.alerta_pronostico,
  e.monto_limite,
  e.porcentaje_limite,
  e.cantidad,
  e.cuotas_mes,
  e.ingreso_referencia
from evaluados e;

create view finanzas.presupuesto_sugerido with (security_invoker = true) as
with base as (
  select date_trunc('month', finanzas.hoy_chile())::date as actual
),
gasto as (
  select g.usuario_id, g.categoria::text as categoria, date_trunc('month', g.fecha)::date as mes, sum(g.monto_gasto) as monto
  from finanzas.gasto_diario g, base b
  where g.fecha >= b.actual - interval '3 months' and g.fecha < b.actual
  group by g.usuario_id, g.categoria, date_trunc('month', g.fecha)
),
meses as (
  select usuario_id, count(distinct mes) as meses from gasto group by usuario_id
),
sugerencias as (
  select g.usuario_id, 'categoria'::text as tipo, g.categoria,
    (round(sum(g.monto) / m.meses / 1000) * 1000)::bigint as monto_sugerido,
    null::numeric as porcentaje_sugerido, m.meses::int as meses_base
  from gasto g join meses m using (usuario_id)
  group by g.usuario_id, g.categoria, m.meses
  union all
  select g.usuario_id, 'total', null,
    (round(sum(g.monto) / m.meses / 1000) * 1000)::bigint, null, m.meses::int
  from gasto g join meses m using (usuario_id)
  group by g.usuario_id, m.meses
  union all
  select c.usuario_id, 'compras_credito', null,
    (round(sum(c.compras_cuotas_monto)::numeric / m.meses / 1000) * 1000)::bigint, null, m.meses::int
  from finanzas.credito_mes c
  join meses m using (usuario_id)
  cross join base b
  where c.mes >= b.actual - interval '3 months' and c.mes < b.actual
  group by c.usuario_id, m.meses
  union all
  select c.usuario_id, 'carga_cuotas', null, null, round(c.carga_porcentaje), null
  from finanzas.credito_mes c, base b
  where c.mes = b.actual and c.carga_porcentaje is not null
)
select usuario_id, tipo, categoria, monto_sugerido, porcentaje_sugerido, meses_base
from sugerencias
where coalesce(monto_sugerido, porcentaje_sugerido) > 0;

create view finanzas.ingreso_referencia with (security_invoker = true) as
select
  u.usuario_id,
  p.ingreso_mensual_neto as ingreso_declarado,
  ir.ingresos::bigint as ingreso_detectado,
  coalesce(p.ingreso_mensual_neto, ir.ingresos)::bigint as ingreso_referencia,
  coalesce(p.meta_ahorro_mensual, 0)::bigint as meta_ahorro_mensual,
  coalesce(p.tope_carga_cuotas_pct, 30) as tope_carga_cuotas_pct,
  p.dia_pago
from finanzas.usuario u
left join finanzas.perfil p on p.usuario_id = u.usuario_id
left join lateral (
  select round(avg(r.ingresos)) as ingresos
  from (
    select r.ingresos
    from finanzas.resumen_mensual r
    where r.usuario_id = u.usuario_id
      and r.mes < date_trunc('month', finanzas.hoy_chile())
      and r.ingresos > 0
    order by r.mes desc
    limit 3
  ) r
) ir on true;

create view finanzas.gasto_referencia with (security_invoker = true) as
with base as (
  select date_trunc('month', finanzas.hoy_chile())::date as actual
),
mov as (
  select
    m.usuario_id,
    m.categoria::text as categoria,
    coalesce(m.comercio, m.glosa, '') as origen,
    date_trunc('month', m.fecha_imputacion)::date as mes,
    -m.monto as monto,
    date_trunc('month', m.fecha_imputacion)::date = b.actual as en_curso
  from finanzas.movimiento m, base b
  where m.tipo_flujo in ('gasto', 'interes_comision')
    and coalesce(m.cuotas_total, 1) <= 1
    and m.fecha_imputacion >= b.actual - interval '3 months'
    and m.fecha_imputacion < b.actual + interval '1 month'
),
meses as (
  select usuario_id, count(distinct mes) as meses from mov where not en_curso group by usuario_id
),
recurrentes as (
  select usuario_id, origen
  from mov
  where categoria = 'entretenimiento_suscripciones' and not en_curso
  group by usuario_id, origen
  having count(distinct mes) >= 2
),
clasificados as (
  select
    mv.usuario_id, mv.monto, mv.en_curso,
    case
      when mv.categoria = 'entretenimiento_suscripciones' and r.origen is not null then 'suscripciones_recurrentes'
      else mv.categoria
    end as grupo
  from mov mv
  left join recurrentes r on r.usuario_id = mv.usuario_id and r.origen = mv.origen
)
select
  c.usuario_id,
  c.grupo,
  coalesce(round(sum(c.monto) filter (where not c.en_curso) / nullif(m.meses, 0)), 0)::bigint as promedio,
  coalesce(sum(c.monto) filter (where c.en_curso), 0)::bigint as gastado_mes,
  coalesce(m.meses, 0)::int as meses_base
from clasificados c
left join meses m on m.usuario_id = c.usuario_id
group by c.usuario_id, c.grupo, m.meses;

create view finanzas.plan_ajuste with (security_invoker = true) as
with base as (
  select date_trunc('month', finanzas.hoy_chile())::date as actual
),
meses as (
  select b.actual as mes from base b
  union all
  select (b.actual + interval '1 month')::date from base b
),
grupos as (
  select
    g.usuario_id,
    sum(g.promedio) filter (where g.grupo in (
      'vivienda_servicios', 'seguros', 'salud', 'educacion', 'suscripciones_recurrentes', 'intereses_comisiones_impuestos'
    )) as fijos,
    sum(g.promedio) filter (where g.grupo = 'vivienda_servicios') as vivienda,
    sum(g.promedio) filter (where g.grupo in (
      'supermercado', 'restaurantes_delivery', 'transporte', 'combustible_auto', 'hogar', 'vestuario', 'tecnologia',
      'viajes', 'mascotas', 'transferencias_personas', 'sin_categoria', 'entretenimiento_suscripciones'
    )) as variable_promedio,
    sum(g.gastado_mes) filter (where g.grupo in (
      'supermercado', 'restaurantes_delivery', 'transporte', 'combustible_auto', 'hogar', 'vestuario', 'tecnologia',
      'viajes', 'mascotas', 'transferencias_personas', 'sin_categoria', 'entretenimiento_suscripciones'
    )) as variable_gastado,
    sum(floor(0.9 * g.promedio / 1000) * 1000) filter (where g.grupo in (
      'supermercado', 'transporte', 'combustible_auto'
    )) as esenciales
  from finanzas.gasto_referencia g
  group by g.usuario_id
),
cuotas as (
  select d.usuario_id, d.mes, sum(d.monto) as total, sum(d.monto) filter (where d.tipo = 'hipotecario') as hipotecario
  from finanzas.deuda_cuota_mes d
  group by d.usuario_id, d.mes
),
calculo as (
  select
    i.usuario_id,
    m.mes,
    m.mes = b.actual as en_curso,
    i.ingreso_referencia,
    i.ingreso_declarado is not null as ingreso_declarado,
    i.ingreso_detectado,
    coalesce(c.total, 0)::bigint as compromisos,
    greatest(coalesce(g.fijos, 0) - least(coalesce(c.hipotecario, 0), coalesce(g.vivienda, 0)), 0)::bigint as gastos_fijos,
    i.meta_ahorro_mensual as meta_ahorro,
    coalesce(g.variable_promedio, 0)::bigint as gasto_variable_promedio,
    case when m.mes = b.actual then coalesce(g.variable_gastado, 0) else 0 end::bigint as gasto_variable_mes,
    coalesce(g.esenciales, 0)::bigint as esenciales_objetivo,
    coalesce(cp.total, 0)::bigint as compromisos_mes_siguiente,
    i.tope_carga_cuotas_pct
  from finanzas.ingreso_referencia i
  cross join meses m
  cross join base b
  left join grupos g on g.usuario_id = i.usuario_id
  left join cuotas c on c.usuario_id = i.usuario_id and c.mes = m.mes
  left join cuotas cp on cp.usuario_id = i.usuario_id and cp.mes = (m.mes + interval '1 month')::date
),
disponible as (
  select
    ca.*,
    ca.ingreso_referencia - ca.compromisos - ca.gastos_fijos - ca.meta_ahorro as disponible_variable,
    round(100.0 * ca.compromisos_mes_siguiente / nullif(ca.ingreso_referencia, 0), 1) as carga_mes_siguiente_pct
  from calculo ca
)
select
  d.usuario_id,
  d.mes,
  d.en_curso,
  d.ingreso_referencia,
  d.ingreso_declarado,
  d.ingreso_detectado,
  d.compromisos,
  d.gastos_fijos,
  d.meta_ahorro,
  d.disponible_variable,
  d.gasto_variable_mes,
  d.disponible_variable - d.gasto_variable_mes as restante_variable,
  d.gasto_variable_promedio,
  d.esenciales_objetivo,
  d.disponible_variable >= d.esenciales_objetivo as alcanza_esenciales,
  d.compromisos_mes_siguiente,
  d.carga_mes_siguiente_pct,
  d.tope_carga_cuotas_pct,
  case
    when d.ingreso_referencia is null then null
    when d.carga_mes_siguiente_pct > d.tope_carga_cuotas_pct then 0
    else greatest(round(d.ingreso_referencia * d.tope_carga_cuotas_pct / 100.0) - d.compromisos_mes_siguiente, 0)
  end::bigint as compras_credito_sugerido
from disponible d;

create view finanzas.plan_ajuste_categoria with (security_invoker = true) as
with categorias as (
  select
    g.usuario_id,
    g.grupo as categoria,
    g.grupo in ('supermercado', 'transporte', 'combustible_auto') as esencial,
    g.promedio,
    g.gastado_mes,
    floor(0.9 * g.promedio / 1000) * 1000 as tope
  from finanzas.gasto_referencia g
  where g.grupo in (
    'supermercado', 'restaurantes_delivery', 'transporte', 'combustible_auto', 'hogar', 'vestuario', 'tecnologia',
    'viajes', 'mascotas', 'transferencias_personas', 'sin_categoria', 'entretenimiento_suscripciones'
  )
    and g.promedio > 0
),
cuotas_categoria as (
  select m.usuario_id, m.categoria::text as categoria, sum(-m.monto) as cuotas
  from finanzas.movimiento m
  where m.tipo_flujo = 'gasto'
    and m.cuotas_total > 1
    and m.fecha_imputacion >= date_trunc('month', finanzas.hoy_chile())
    and m.fecha_imputacion < date_trunc('month', finanzas.hoy_chile()) + interval '1 month'
  group by m.usuario_id, m.categoria
),
suscripciones as (
  select g.usuario_id, g.promedio
  from finanzas.gasto_referencia g
  where g.grupo = 'suscripciones_recurrentes'
),
totales as (
  select
    usuario_id,
    coalesce(sum(tope) filter (where esencial), 0) as esenciales,
    coalesce(sum(tope) filter (where not esencial), 0) as discrecionales
  from categorias
  group by usuario_id
),
limites as (
  select
    p.usuario_id,
    p.mes,
    c.categoria,
    c.esencial,
    c.promedio,
    case when p.en_curso then c.gastado_mes else 0 end as gastado_mes,
    case
      when c.esencial then c.tope
      else floor(
        c.tope * least(1, greatest(coalesce(p.disponible_variable, t.esenciales + t.discrecionales) - t.esenciales, 0) / nullif(t.discrecionales, 0))
        / 1000
      ) * 1000
    end as limite_sugerido,
    coalesce(cc.cuotas, 0) + case when c.categoria = 'entretenimiento_suscripciones' then coalesce(s.promedio, 0) else 0 end as comprometido
  from finanzas.plan_ajuste p
  join categorias c on c.usuario_id = p.usuario_id
  join totales t on t.usuario_id = p.usuario_id
  left join cuotas_categoria cc on cc.usuario_id = c.usuario_id and cc.categoria = c.categoria
  left join suscripciones s on s.usuario_id = c.usuario_id
)
select
  l.usuario_id,
  l.mes,
  l.categoria,
  l.esencial,
  l.promedio,
  l.gastado_mes::bigint as gastado_mes,
  l.limite_sugerido::bigint as limite_sugerido,
  (l.promedio - l.limite_sugerido)::bigint as recorte,
  round(100.0 * (l.promedio - l.limite_sugerido) / l.promedio, 1) as recorte_pct,
  l.comprometido::bigint as comprometido,
  (l.limite_sugerido + l.comprometido)::bigint as limite_alerta
from limites l;

create view finanzas.liberacion_cuotas with (security_invoker = true) as
with base as (
  select date_trunc('month', finanzas.hoy_chile())::date as actual
),
rango as (
  select d.usuario_id, max(d.mes) as ultimo
  from finanzas.deuda_cuota_mes d, base b
  where d.mes >= b.actual
  group by d.usuario_id
),
meses as (
  select r.usuario_id, gs::date as mes
  from rango r, base b, generate_series(b.actual, r.ultimo, interval '1 month') gs
),
compromisos as (
  select
    m.usuario_id,
    m.mes,
    coalesce(sum(d.monto), 0)::bigint as compromisos
  from meses m
  left join finanzas.deuda_cuota_mes d on d.usuario_id = m.usuario_id and d.mes = m.mes
  group by m.usuario_id, m.mes
),
cargas as (
  select
    c.usuario_id,
    c.mes,
    c.compromisos,
    i.ingreso_referencia,
    i.tope_carga_cuotas_pct,
    round(100.0 * c.compromisos / nullif(i.ingreso_referencia, 0), 1) as carga_pct
  from compromisos c
  join finanzas.ingreso_referencia i on i.usuario_id = c.usuario_id
),
marcas as (
  select
    ca.*,
    ca.carga_pct <= ca.tope_carga_cuotas_pct as bajo_tope,
    max(ca.mes) filter (where ca.carga_pct > ca.tope_carga_cuotas_pct) over (partition by ca.usuario_id) as ultimo_sobre_tope,
    min(ca.mes) over (partition by ca.usuario_id) as primero,
    max(ca.mes) over (partition by ca.usuario_id) as ultimo
  from cargas ca
)
select
  mc.usuario_id,
  mc.mes,
  mc.compromisos,
  mc.ingreso_referencia,
  mc.carga_pct,
  mc.tope_carga_cuotas_pct,
  mc.bajo_tope,
  case
    when mc.ingreso_referencia is null then null
    when mc.ultimo_sobre_tope is null then mc.primero
    when mc.ultimo_sobre_tope < mc.ultimo then (mc.ultimo_sobre_tope + interval '1 month')::date
  end as mes_bajo_tope
from marcas mc;

revoke all on
  finanzas.perfil, finanzas.credito_mes, finanzas.estado_presupuesto, finanzas.presupuesto_sugerido,
  finanzas.ingreso_referencia, finanzas.gasto_referencia, finanzas.plan_ajuste, finanzas.plan_ajuste_categoria,
  finanzas.liberacion_cuotas
  from public, anon;

grant select, insert, update, delete on finanzas.perfil to authenticated;

grant select on
  finanzas.credito_mes, finanzas.estado_presupuesto, finanzas.presupuesto_sugerido, finanzas.ingreso_referencia,
  finanzas.gasto_referencia, finanzas.plan_ajuste, finanzas.plan_ajuste_categoria, finanzas.liberacion_cuotas
  to authenticated;

grant all on
  finanzas.perfil, finanzas.credito_mes, finanzas.estado_presupuesto, finanzas.presupuesto_sugerido,
  finanzas.ingreso_referencia, finanzas.gasto_referencia, finanzas.plan_ajuste, finanzas.plan_ajuste_categoria,
  finanzas.liberacion_cuotas
  to service_role;

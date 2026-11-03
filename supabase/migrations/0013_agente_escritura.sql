-- Escritura acotada para el agente (ADR-012): origen en lo que anota, ingresos, pagos manuales, auditoría y una función por operación.
alter table finanzas.anotacion add column origen text not null default 'app' check (origen in ('app', 'agente'));
alter table finanzas.sobre add column origen text not null default 'app' check (origen in ('app', 'agente'));

create table finanzas.ingreso (
  ingreso_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  fecha date not null default finanzas.hoy_chile(),
  descripcion text not null check (char_length(descripcion) between 1 and 140),
  monto bigint not null check (monto > 0),
  recurrente boolean not null default false,
  categoria text not null default 'otro' check (categoria in ('salario', 'freelance', 'venta', 'devolucion', 'otro')),
  origen text not null default 'app' check (origen in ('app', 'agente')),
  creado timestamptz not null default now()
);

-- Pago que la persona o el agente anotó a mano: cuenta para el estado de la obligación hasta que el banco lo refleje
create table finanzas.pago_manual (
  pago_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  ciclo date not null,
  clave text not null check (char_length(clave) between 1 and 200),
  monto bigint not null check (monto > 0),
  fecha date not null default finanzas.hoy_chile(),
  nota text check (char_length(nota) <= 140),
  origen text not null default 'app' check (origen in ('app', 'agente')),
  creado timestamptz not null default now()
);
create index pago_manual_clave on finanzas.pago_manual (usuario_id, ciclo, clave);

create table finanzas.agente_log (
  log_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  herramienta text not null,
  argumentos jsonb not null,
  resultado jsonb not null,
  creado timestamptz not null default now()
);
create index agente_log_usuario_creado on finanzas.agente_log (usuario_id, creado desc);

alter table finanzas.ingreso enable row level security;
alter table finanzas.pago_manual enable row level security;
alter table finanzas.agente_log enable row level security;

create policy ingreso_lectura_hogar on finanzas.ingreso
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy ingreso_alta_hogar on finanzas.ingreso
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy ingreso_cambio_hogar on finanzas.ingreso
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy ingreso_baja_hogar on finanzas.ingreso
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_manual_lectura_hogar on finanzas.pago_manual
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_manual_alta_hogar on finanzas.pago_manual
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_manual_cambio_hogar on finanzas.pago_manual
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_manual_baja_hogar on finanzas.pago_manual
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy agente_log_lectura_dueno on finanzas.agente_log
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

revoke all on finanzas.ingreso, finanzas.pago_manual, finanzas.agente_log from public, anon;
grant select, insert, update, delete on finanzas.ingreso, finanzas.pago_manual to authenticated;
grant select on finanzas.agente_log to authenticated;
grant all on finanzas.ingreso, finanzas.pago_manual, finanzas.agente_log to service_role;


-- Vistas: el pago manual entra al estado y los ingresos adicionales al disponible
create or replace view finanzas.pagos_ciclo with (security_invoker = true) as
with actual as (
  select u.usuario_id, c.ciclo, c.inicio as ciclo_inicio, c.fin as ciclo_fin
  from finanzas.usuario u
  cross join finanzas.ciclo_actual() c
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
    pm.monto as pagado_manual,
    ef.v as pagado_efectivo,
    case
      when mk.pagado then 'pagado'
      when mk.pagado = false then 'pendiente'
      when i.monto > 0 and ef.v >= 0.99 * i.monto then 'pagado'
      when i.origen = 'tarjeta' and i.monto_minimo is not null and ef.v > 0 and ef.v >= 0.99 * i.monto_minimo then 'minimo'
      else 'pendiente'
    end as estado
  from items i
  left join finanzas.pago_marcado mk on mk.usuario_id = i.usuario_id and mk.ciclo = i.ciclo and mk.clave = i.clave
  cross join lateral (
    select coalesce(sum(p.monto), 0)::bigint as monto
    from finanzas.pago_manual p
    where p.usuario_id = i.usuario_id and p.ciclo = i.ciclo and p.clave = i.clave
  ) pm
  -- Cuando el banco ya refleja el pago, el manual deja de sumar: se toma el mayor, no la suma
  cross join lateral (select greatest(i.pagado_banco, pm.monto) as v) ef
  where coalesce(i.monto, 0) > 0
)
select
  e.usuario_id, e.ciclo, c.inicio as ciclo_inicio, c.fin as ciclo_fin, e.n = 0 as en_curso,
  e.clave, e.origen, e.nombre, e.acreedor, e.fecha, e.monto, e.monto_minimo, e.pagado_banco,
  e.automatico, e.estimado, e.marcado, e.estado,
  case
    when e.estado = 'pagado' then 0
    when e.estado = 'minimo' and e.fecha <= finanzas.hoy_chile() then 0
    else greatest(e.monto - e.pagado_efectivo, 0)
  end::bigint as por_pagar,
  case
    when e.estado in ('pagado', 'minimo') then 0
    else greatest(coalesce(e.monto_minimo, e.monto) - e.pagado_efectivo, 0)
  end::bigint as por_pagar_minimo,
  case
    when e.estado = 'minimo' and e.fecha <= finanzas.hoy_chile() then least(e.pagado_efectivo, e.monto)
    else e.monto
  end::bigint as comprometido,
  e.pagado_manual
from estado e
join ciclos c on c.usuario_id = e.usuario_id and c.ciclo = e.ciclo;

create or replace view finanzas.lo_que_viene with (security_invoker = true) as
with ciclo as (
  select
    u.usuario_id,
    c.ciclo,
    c.inicio,
    c.fin,
    (select sum(s.saldo_disponible) from finanzas.saldo_cuenta s where s.usuario_id = u.usuario_id)::bigint as saldo_hoy,
    (
      select r.proximo_sueldo from finanzas.caja_resumen r
      where r.usuario_id = u.usuario_id and r.proximo_sueldo is not null
      order by r.ciclo desc
      limit 1
    ) as proximo_sueldo,
    coalesce((select max(p.publicado_en) from finanzas.publicacion p where p.usuario_id = u.usuario_id and p.tabla = 'saldo_cuenta'), '-infinity'::timestamptz) as saldo_al
  from finanzas.usuario u
  cross join finanzas.ciclo_actual() c
),
-- Lo anotado a mano después de la última lectura del banco aún no está en el saldo; cuando el banco se actualiza, lo absorbe
ajuste as (
  select
    c.usuario_id,
    coalesce((select sum(p.monto) from finanzas.pago_manual p where p.usuario_id = c.usuario_id and p.creado > c.saldo_al), 0)::bigint as pagos_sin_banco,
    coalesce((select sum(i.monto) from finanzas.ingreso i where i.usuario_id = c.usuario_id and i.creado > c.saldo_al), 0)::bigint as ingresos_sin_banco,
    coalesce((select sum(i.monto) from finanzas.ingreso i where i.usuario_id = c.usuario_id and i.fecha between c.inicio and c.fin), 0)::bigint as ingresos_adicionales
  from ciclo c
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
  (c.saldo_hoy - a.pagos_sin_banco + a.ingresos_sin_banco - sum(i.monto) over (partition by i.usuario_id))::bigint as disponible_para_vivir_ajustado,
  a.ingresos_adicionales,
  a.pagos_sin_banco as pagos_manuales_sin_banco
from items i
join ciclo c on c.usuario_id = i.usuario_id
join ajuste a on a.usuario_id = i.usuario_id;

-- Lectura: suma anotaciones, ingresos y pagos manuales a las vistas permitidas
create or replace function finanzas.agente_leer(p_usuario uuid, p_vista text, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_col text := case p_vista when 'movimiento' then 'fecha_imputacion' when 'anotacion' then 'fecha::date' when 'ingreso' then 'fecha' when 'pago_manual' then 'fecha' end;
  v_filtro text := '';
  v_orden text := '';
  v_filas jsonb;
begin
  if p_vista not in ('lo_que_viene', 'pagos_ciclo', 'deudas_todas', 'estado_sobre', 'uso_credito', 'tope_credito', 'movimiento', 'anotacion', 'ingreso', 'pago_manual') then
    raise exception 'vista no permitida: %', p_vista;
  end if;
  if v_col is not null then
    v_filtro := format(' and %1$s >= coalesce($2, date ''0001-01-01'') and %1$s <= coalesce($3, date ''9999-12-31'')', v_col);
    v_orden := format(' order by %s desc', v_col);
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from finanzas.%I where usuario_id = $1%s%s limit 500) t',
    p_vista, v_filtro, v_orden
  ) into v_filas using p_usuario, p_desde, p_hasta;
  return v_filas;
end;
$$;

-- Tope de ritmo y registro: 30 escrituras por hora por usuario
create function finanzas.agente_registrar(p_usuario uuid, p_herramienta text, p_argumentos jsonb, p_resultado jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into finanzas.agente_log (usuario_id, herramienta, argumentos, resultado) values (p_usuario, p_herramienta, p_argumentos, p_resultado)
$$;

create function finanzas.agente_ritmo(p_usuario uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from finanzas.agente_log where usuario_id = p_usuario and creado > now() - interval '1 hour') >= 30 then
    raise exception 'demasiadas escrituras en la última hora (máximo 30)';
  end if;
end;
$$;

create function finanzas.agente_anotar_gasto(
  p_usuario uuid, p_monto bigint, p_nota text default null, p_sobre uuid default null, p_medio text default 'debito', p_fecha date default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoy date := finanzas.hoy_chile();
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_id uuid;
begin
  perform finanzas.agente_ritmo(p_usuario);
  if p_monto is null or p_monto not between 1 and 500000 then raise exception 'monto fuera de rango (1 a 500.000)'; end if;
  if char_length(coalesce(p_nota, '')) > 140 then raise exception 'la nota admite hasta 140 caracteres'; end if;
  if p_medio not in ('debito', 'credito', 'efectivo', 'otro') then raise exception 'medio inválido'; end if;
  if v_fecha > v_hoy or v_fecha < v_hoy - 30 then raise exception 'la fecha debe estar en los últimos 30 días'; end if;
  insert into finanzas.anotacion (usuario_id, sobre_id, fecha, monto, nota, medio, origen)
  values (p_usuario, p_sobre, (v_fecha::timestamp at time zone 'America/Santiago'), p_monto, p_nota, p_medio, 'agente')
  returning anotacion_id into v_id;
  perform finanzas.agente_registrar(p_usuario, 'anotar_gasto',
    jsonb_build_object('monto', p_monto, 'nota', p_nota, 'sobre', p_sobre, 'medio', p_medio, 'fecha', v_fecha), jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

create function finanzas.agente_crear_sobre(
  p_usuario uuid, p_nombre text, p_monto bigint, p_categoria finanzas.categoria default null, p_periodo text default 'mes', p_esencial boolean default false
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform finanzas.agente_ritmo(p_usuario);
  if char_length(coalesce(p_nombre, '')) not between 1 and 40 then raise exception 'el nombre admite de 1 a 40 caracteres'; end if;
  if p_monto is null or p_monto not between 1 and 2000000 then raise exception 'monto fuera de rango (1 a 2.000.000)'; end if;
  if p_periodo not in ('semana', 'mes') then raise exception 'período inválido'; end if;
  if (select count(*) from finanzas.sobre where usuario_id = p_usuario and origen = 'agente' and activo) >= 20 then
    raise exception 'ya hay 20 sobres creados por el agente';
  end if;
  insert into finanzas.sobre (usuario_id, nombre, categoria, monto, periodo, esencial, orden, origen)
  values (p_usuario, p_nombre, p_categoria, p_monto, p_periodo, coalesce(p_esencial, false),
          coalesce((select max(orden) from finanzas.sobre where usuario_id = p_usuario), 0) + 1, 'agente')
  returning sobre_id into v_id;
  perform finanzas.agente_registrar(p_usuario, 'crear_sobre',
    jsonb_build_object('nombre', p_nombre, 'monto', p_monto, 'categoria', p_categoria, 'periodo', p_periodo, 'esencial', p_esencial), jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

create function finanzas.agente_registrar_ingreso(
  p_usuario uuid, p_descripcion text, p_monto bigint, p_fecha date default null, p_recurrente boolean default false, p_categoria text default 'otro'
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoy date := finanzas.hoy_chile();
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_id uuid;
begin
  perform finanzas.agente_ritmo(p_usuario);
  if char_length(coalesce(p_descripcion, '')) not between 1 and 140 then raise exception 'la descripción admite de 1 a 140 caracteres'; end if;
  if p_monto is null or p_monto not between 1 and 5000000 then raise exception 'monto fuera de rango (1 a 5.000.000)'; end if;
  if p_categoria not in ('salario', 'freelance', 'venta', 'devolucion', 'otro') then raise exception 'categoría inválida (salario, freelance, venta, devolucion u otro)'; end if;
  if v_fecha > v_hoy or v_fecha < v_hoy - 30 then raise exception 'la fecha debe estar en los últimos 30 días'; end if;
  insert into finanzas.ingreso (usuario_id, fecha, descripcion, monto, recurrente, categoria, origen)
  values (p_usuario, v_fecha, p_descripcion, p_monto, coalesce(p_recurrente, false), p_categoria, 'agente')
  returning ingreso_id into v_id;
  perform finanzas.agente_registrar(p_usuario, 'registrar_ingreso',
    jsonb_build_object('descripcion', p_descripcion, 'monto', p_monto, 'fecha', v_fecha, 'recurrente', p_recurrente, 'categoria', p_categoria),
    jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

-- Obligaciones del ciclo en curso, para que el agente encuentre la clave antes de registrar un pago
create function finanzas.agente_buscar_obligacion(p_usuario uuid, p_query text default null, p_tipo text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_origen text := case p_tipo when 'fijo' then 'pago_fijo' else p_tipo end;
  v_filas jsonb;
begin
  if p_tipo is not null and p_tipo not in ('fijo', 'deuda_manual', 'credito', 'dividendo', 'tarjeta') then
    raise exception 'tipo inválido (fijo, deuda_manual, credito, dividendo o tarjeta)';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'obligacion_id', p.clave, 'nombre', p.nombre, 'tipo', p.origen, 'acreedor', p.acreedor, 'fecha', p.fecha,
    'monto_actual', p.monto, 'pagado_manual', p.pagado_manual, 'por_pagar', p.por_pagar, 'estado', p.estado
  ) order by p.fecha nulls last, p.nombre), '[]'::jsonb)
  into v_filas
  from finanzas.pagos_ciclo p
  where p.usuario_id = p_usuario and p.en_curso
    and (v_origen is null or p.origen = v_origen)
    and (p_query is null or p.clave = p_query
         or strpos(lower(p.nombre), lower(p_query)) > 0 or strpos(lower(coalesce(p.acreedor, '')), lower(p_query)) > 0);
  return v_filas;
end;
$$;

-- Pago manual de una obligación del ciclo en curso. Los casos de negocio (no existe, ambigua, ya pagada, de más) devuelven
-- exito = false con el detalle; los datos inválidos (monto, fecha) lanzan error.
create function finanzas.agente_registrar_pago(
  p_usuario uuid, p_obligacion text, p_monto bigint, p_fecha date default null, p_nota text default null, p_confirmar boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoy date := finanzas.hoy_chile();
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_item record;
  v_n int;
  v_id uuid;
  v_antes jsonb;
  v_despues jsonb;
  v_resumen text;
begin
  perform finanzas.agente_ritmo(p_usuario);
  if char_length(coalesce(p_obligacion, '')) not between 1 and 200 then raise exception 'indica la obligación (id o nombre)'; end if;
  if p_monto is null or p_monto not between 1 and 10000000 then raise exception 'monto fuera de rango (1 a 10.000.000)'; end if;
  if char_length(coalesce(p_nota, '')) > 140 then raise exception 'la nota admite hasta 140 caracteres'; end if;
  if v_fecha > v_hoy or v_fecha < v_hoy - 30 then raise exception 'la fecha debe estar en los últimos 30 días'; end if;

  select * into v_item from finanzas.pagos_ciclo p where p.usuario_id = p_usuario and p.en_curso and p.clave = p_obligacion;
  if not found then
    select count(*) into v_n from finanzas.pagos_ciclo p
    where p.usuario_id = p_usuario and p.en_curso and strpos(lower(p.nombre), lower(p_obligacion)) > 0;
    if v_n = 1 then
      select * into v_item from finanzas.pagos_ciclo p
      where p.usuario_id = p_usuario and p.en_curso and strpos(lower(p.nombre), lower(p_obligacion)) > 0;
    else
      return jsonb_build_object(
        'exito', false,
        'mensaje', case when v_n = 0 then 'No encontré esa obligación; estas son las del ciclo' else 'Hay varias que calzan; indica el obligacion_id de una' end,
        'candidatos', finanzas.agente_buscar_obligacion(p_usuario, case when v_n = 0 then null else p_obligacion end, null)
      );
    end if;
  end if;

  v_antes := jsonb_build_object('obligacion_id', v_item.clave, 'nombre', v_item.nombre, 'monto_actual', v_item.monto, 'por_pagar', v_item.por_pagar, 'estado', v_item.estado);
  if v_item.estado = 'pagado' and not p_confirmar then
    return jsonb_build_object('exito', false, 'requiere_confirmacion', true,
      'mensaje', format('%s ya figura pagada; repite con confirmar = true si quieres registrar otro pago', v_item.nombre), 'obligacion', v_antes);
  end if;
  if v_item.estado <> 'pagado' and p_monto > v_item.por_pagar and not p_confirmar then
    return jsonb_build_object('exito', false, 'requiere_confirmacion', true,
      'mensaje', format('El pago de $%s supera lo que falta de %s ($%s); repite con confirmar = true para registrarlo igual',
                        replace(to_char(p_monto, 'FM999,999,999'), ',', '.'), v_item.nombre, replace(to_char(v_item.por_pagar, 'FM999,999,999'), ',', '.')),
      'obligacion', v_antes);
  end if;

  insert into finanzas.pago_manual (usuario_id, ciclo, clave, monto, fecha, nota, origen)
  values (p_usuario, v_item.ciclo, v_item.clave, p_monto, v_fecha, p_nota, 'agente')
  returning pago_id into v_id;

  select jsonb_build_object('obligacion_id', p.clave, 'nombre', p.nombre, 'monto_actual', p.monto, 'pagado_manual', p.pagado_manual,
                            'por_pagar', p.por_pagar, 'estado', p.estado)
  into v_despues
  from finanzas.pagos_ciclo p where p.usuario_id = p_usuario and p.ciclo = v_item.ciclo and p.clave = v_item.clave;

  v_resumen := case
    when v_despues ->> 'estado' = 'pagado' then 'queda pagada'
    else format('pago parcial: faltan $%s', replace(to_char((v_despues ->> 'por_pagar')::bigint, 'FM999,999,999'), ',', '.'))
  end;
  perform finanzas.agente_registrar(p_usuario, 'registrar_pago',
    jsonb_build_object('obligacion', v_item.clave, 'monto', p_monto, 'fecha', v_fecha, 'nota', p_nota, 'confirmar', p_confirmar),
    jsonb_build_object('id', v_id));
  return jsonb_build_object(
    'exito', true,
    'mensaje', format('Pago de $%s registrado en %s: %s', replace(to_char(p_monto, 'FM999,999,999'), ',', '.'), v_item.nombre, v_resumen),
    'pago_id', v_id, 'obligacion_antes', v_antes, 'obligacion_actualizada', v_despues
  );
end;
$$;

-- Deshace solo lo que el agente creó en los últimos 7 días (según su registro); el sobre se desactiva, no se borra
create function finanzas.agente_deshacer(p_usuario uuid, p_tipo text, p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_herramienta text := case p_tipo when 'anotacion' then 'anotar_gasto' when 'sobre' then 'crear_sobre' when 'ingreso' then 'registrar_ingreso' when 'pago' then 'registrar_pago' end;
  v_filas int;
begin
  perform finanzas.agente_ritmo(p_usuario);
  if v_herramienta is null then raise exception 'tipo inválido (anotacion, sobre, ingreso o pago)'; end if;
  if not exists (
    select 1 from finanzas.agente_log
    where usuario_id = p_usuario and herramienta = v_herramienta and resultado ->> 'id' = p_id::text and creado > now() - interval '7 days'
  ) then
    return false;
  end if;
  if p_tipo = 'anotacion' then
    delete from finanzas.anotacion where anotacion_id = p_id and usuario_id = p_usuario and origen = 'agente';
  elsif p_tipo = 'ingreso' then
    delete from finanzas.ingreso where ingreso_id = p_id and usuario_id = p_usuario and origen = 'agente';
  elsif p_tipo = 'pago' then
    delete from finanzas.pago_manual where pago_id = p_id and usuario_id = p_usuario and origen = 'agente';
  else
    update finanzas.sobre set activo = false where sobre_id = p_id and usuario_id = p_usuario and origen = 'agente';
  end if;
  get diagnostics v_filas = row_count;
  if v_filas > 0 then
    perform finanzas.agente_registrar(p_usuario, 'deshacer', jsonb_build_object('tipo', p_tipo, 'id', p_id), jsonb_build_object('ok', true));
  end if;
  return v_filas > 0;
end;
$$;

revoke all on function
  finanzas.agente_registrar(uuid, text, jsonb, jsonb), finanzas.agente_ritmo(uuid),
  finanzas.agente_anotar_gasto(uuid, bigint, text, uuid, text, date),
  finanzas.agente_crear_sobre(uuid, text, bigint, finanzas.categoria, text, boolean),
  finanzas.agente_registrar_ingreso(uuid, text, bigint, date, boolean, text),
  finanzas.agente_buscar_obligacion(uuid, text, text),
  finanzas.agente_registrar_pago(uuid, text, bigint, date, text, boolean),
  finanzas.agente_deshacer(uuid, text, uuid)
from public;

create table finanzas.solicitud_actualizacion (
  solicitud_id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  pedida_por uuid references finanzas.usuario (usuario_id) on delete set null,
  origen text not null default 'app' check (origen in ('app', 'programada')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'corriendo', 'ok', 'parcial', 'error')),
  pasos jsonb not null default '{}'::jsonb,
  detalle text check (char_length(detalle) <= 500),
  creada timestamptz not null default now(),
  iniciada timestamptz,
  terminada timestamptz
);

create unique index solicitud_actualizacion_activa on finanzas.solicitud_actualizacion (usuario_id)
  where estado in ('pendiente', 'corriendo');
create index solicitud_actualizacion_usuario_idx on finanzas.solicitud_actualizacion (usuario_id, creada desc);

create table finanzas.foto_balance (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  fecha date not null,
  activos bigint not null,
  pasivos bigint not null,
  detalle jsonb not null default '[]'::jsonb,
  tomada timestamptz not null default now(),
  primary key (usuario_id, fecha)
);

create table finanzas.conciliacion (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  ambito text not null check (ambito in ('carga', 'tarjeta', 'caja')),
  sujeto text not null,
  detalle text not null,
  cuadra boolean,
  revisado timestamptz not null,
  primary key (usuario_id, ambito, sujeto)
);

alter table finanzas.solicitud_actualizacion enable row level security;
alter table finanzas.foto_balance enable row level security;
alter table finanzas.conciliacion enable row level security;

create policy solicitud_actualizacion_lectura_hogar on finanzas.solicitud_actualizacion
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy foto_balance_lectura_hogar on finanzas.foto_balance
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));
create policy conciliacion_lectura_hogar on finanzas.conciliacion
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));

create function finanzas.pedir_actualizacion()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_titular uuid := finanzas.titular_de_mi_hogar();
  v_id uuid;
begin
  if v_titular is null then
    raise exception 'usuario sin datos vinculados';
  end if;
  select s.solicitud_id into v_id from finanzas.solicitud_actualizacion s
  where s.usuario_id = v_titular and s.estado in ('pendiente', 'corriendo');
  if v_id is not null then
    return v_id;
  end if;
  if exists (
    select 1 from finanzas.solicitud_actualizacion s
    where s.usuario_id = v_titular and s.estado in ('ok', 'parcial') and s.terminada > now() - interval '10 minutes'
  ) then
    raise exception 'ya se actualizó hace menos de 10 minutos';
  end if;
  insert into finanzas.solicitud_actualizacion (usuario_id, pedida_por) values (v_titular, finanzas.mi_usuario_id())
  returning solicitud_id into v_id;
  return v_id;
end;
$$;

create function finanzas.tomar_foto_balance()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with partidas as (
    select s.usuario_id, 'activo'::text as lado, 'cuenta'::text as tipo, s.banco as entidad, s.producto_nombre as nombre, s.saldo_disponible::bigint as monto
    from finanzas.saldo_cuenta s
    union all
    select d.usuario_id, 'pasivo', d.tipo, d.banco, d.nombre, round(d.saldo_deuda_clp)::bigint
    from finanzas.deuda_producto d
    where coalesce(d.saldo_deuda_clp, 0) > 0
    union all
    select m.usuario_id, 'pasivo', m.tipo, coalesce(m.acreedor, 'anotada'), m.nombre, m.saldo
    from finanzas.deuda_manual m
    where m.activo and m.saldo > 0
  ),
  fotos as (
    insert into finanzas.foto_balance (usuario_id, fecha, activos, pasivos, detalle)
    select
      p.usuario_id,
      finanzas.hoy_chile(),
      coalesce(sum(p.monto) filter (where p.lado = 'activo'), 0),
      coalesce(sum(p.monto) filter (where p.lado = 'pasivo'), 0),
      jsonb_agg(jsonb_build_object('lado', p.lado, 'tipo', p.tipo, 'entidad', p.entidad, 'nombre', p.nombre, 'monto', p.monto)
        order by p.lado, p.monto desc)
    from partidas p
    group by p.usuario_id
    on conflict (usuario_id, fecha) do update
      set activos = excluded.activos, pasivos = excluded.pasivos, detalle = excluded.detalle, tomada = now()
    returning 1
  )
  select count(*)::int from fotos
$$;

create view finanzas.balance_actual with (security_invoker = true) as
select s.usuario_id, 'activo'::text as lado, 'cuenta'::text as tipo, s.banco as entidad, s.producto_nombre as nombre,
  s.saldo_disponible::bigint as monto, s.actualizado
from finanzas.saldo_cuenta s
union all
select d.usuario_id, 'pasivo', d.tipo, d.banco, d.nombre, round(d.saldo_deuda_clp)::bigint, d.actualizado
from finanzas.deuda_producto d
where coalesce(d.saldo_deuda_clp, 0) > 0
union all
select m.usuario_id, 'pasivo', m.tipo, coalesce(m.acreedor, 'anotada'), m.nombre, m.saldo, m.actualizado
from finanzas.deuda_manual m
where m.activo and m.saldo > 0;

create view finanzas.resultado_mensual with (security_invoker = true) as
select
  m.usuario_id,
  date_trunc('month', m.fecha_imputacion)::date as mes,
  m.tipo_flujo,
  m.categoria,
  (case when m.tipo_flujo = 'ingreso' then sum(m.monto) else -sum(m.monto) end)::bigint as monto,
  count(*)::int as cantidad
from finanzas.movimiento m
where m.tipo_flujo in ('ingreso', 'gasto', 'interes_comision')
  and m.fecha_imputacion <= finanzas.hoy_chile()
group by m.usuario_id, date_trunc('month', m.fecha_imputacion), m.tipo_flujo, m.categoria;

create view finanzas.libro with (security_invoker = true) as
select
  m.usuario_id, m.banco, m.producto_tipo, m.producto_nombre, m.movimiento_id, m.fecha, m.glosa, m.comercio,
  m.categoria, m.tipo_flujo, m.estado, m.monto,
  greatest(m.monto, 0)::bigint as abono,
  greatest(-m.monto, 0)::bigint as cargo,
  case when m.producto_tipo = 'cuenta' and s.saldo_disponible is not null then
    (s.saldo_disponible - coalesce(sum(m.monto) over (
      partition by m.usuario_id, m.banco, m.producto_nombre
      order by m.fecha desc, m.movimiento_id desc
      rows between unbounded preceding and 1 preceding
    ), 0))::bigint
  end as saldo
from finanzas.movimiento m
left join finanzas.saldo_cuenta s
  on s.usuario_id = m.usuario_id and s.banco = m.banco and s.producto_nombre = m.producto_nombre;

create view finanzas.conciliacion_saldos with (security_invoker = true) as
with cuentas as (
  select f.usuario_id, f.fecha, e->>'entidad' as banco, e->>'nombre' as nombre, (e->>'monto')::bigint as saldo
  from finanzas.foto_balance f
  cross join jsonb_array_elements(f.detalle) e
  where e->>'lado' = 'activo'
),
pares as (
  select c.*, lag(c.fecha) over w as fecha_anterior, lag(c.saldo) over w as saldo_anterior
  from cuentas c
  window w as (partition by c.usuario_id, c.banco, c.nombre order by c.fecha)
)
select
  p.usuario_id, p.banco, p.nombre, p.fecha_anterior as desde, p.fecha as hasta, p.saldo_anterior, p.saldo,
  x.movimientos,
  (p.saldo - p.saldo_anterior - x.movimientos)::bigint as diferencia
from pares p
cross join lateral (
  select coalesce(sum(m.monto), 0)::bigint as movimientos
  from finanzas.movimiento m
  where m.usuario_id = p.usuario_id and m.banco = p.banco and m.producto_nombre = p.nombre
    and m.fecha > p.fecha_anterior and m.fecha <= p.fecha
) x
where p.fecha_anterior is not null;

revoke all on finanzas.solicitud_actualizacion, finanzas.foto_balance, finanzas.conciliacion,
  finanzas.balance_actual, finanzas.resultado_mensual, finanzas.libro, finanzas.conciliacion_saldos from public, anon;
grant select on finanzas.solicitud_actualizacion, finanzas.foto_balance, finanzas.conciliacion,
  finanzas.balance_actual, finanzas.resultado_mensual, finanzas.libro, finanzas.conciliacion_saldos to authenticated;
grant all on finanzas.solicitud_actualizacion, finanzas.foto_balance, finanzas.conciliacion,
  finanzas.balance_actual, finanzas.resultado_mensual, finanzas.libro, finanzas.conciliacion_saldos to service_role;

revoke all on function finanzas.pedir_actualizacion(), finanzas.tomar_foto_balance() from public, anon, authenticated;
grant execute on function finanzas.pedir_actualizacion() to authenticated, service_role;
grant execute on function finanzas.tomar_foto_balance() to service_role;

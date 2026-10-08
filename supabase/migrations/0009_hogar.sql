create table finanzas.hogar (
  hogar_id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Hogar' check (char_length(nombre) between 1 and 60),
  titular_id uuid not null unique references finanzas.usuario (usuario_id) on delete cascade,
  creado timestamptz not null default now()
);

create table finanzas.miembro_hogar (
  hogar_id uuid not null references finanzas.hogar (hogar_id) on delete cascade,
  usuario_id uuid not null unique references finanzas.usuario (usuario_id) on delete cascade,
  unido timestamptz not null default now(),
  primary key (hogar_id, usuario_id)
);

create table finanzas.invitacion_hogar (
  hogar_id uuid not null references finanzas.hogar (hogar_id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  creada timestamptz not null default now(),
  primary key (hogar_id, email)
);

create table finanzas.producto_compartido (
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  banco text not null check (char_length(banco) <= 60),
  producto_nombre text not null check (char_length(producto_nombre) <= 120),
  primary key (usuario_id, banco, producto_nombre)
);

alter table finanzas.hogar enable row level security;
alter table finanzas.miembro_hogar enable row level security;
alter table finanzas.invitacion_hogar enable row level security;
alter table finanzas.producto_compartido enable row level security;

create policy producto_compartido_lectura_dueno on finanzas.producto_compartido
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));
create policy producto_compartido_alta_dueno on finanzas.producto_compartido
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy producto_compartido_baja_dueno on finanzas.producto_compartido
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

create function finanzas.usuarios_hogar()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (select finanzas.mi_usuario_id() as id),
  mio as (
    select h.hogar_id from finanzas.hogar h join yo on h.titular_id = yo.id
    union
    select m.hogar_id from finanzas.miembro_hogar m join yo on m.usuario_id = yo.id
  ),
  todos as (
    select h.titular_id as id from finanzas.hogar h join mio using (hogar_id)
    union
    select m.usuario_id from finanzas.miembro_hogar m join mio using (hogar_id)
  )
  select coalesce((select array_agg(t.id) from todos t), array[(select yo.id from yo)])
$$;

create function finanzas.titular_de_mi_hogar()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select h.titular_id from finanzas.miembro_hogar m join finanzas.hogar h using (hogar_id) where m.usuario_id = finanzas.mi_usuario_id()),
    finanzas.mi_usuario_id()
  )
$$;

create function finanzas.producto_visible(p_usuario uuid, p_banco text, p_producto text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_usuario = finanzas.mi_usuario_id()
    or (
      p_usuario = any (finanzas.usuarios_hogar())
      and exists (
        select 1 from finanzas.producto_compartido c
        where c.usuario_id = p_usuario and c.banco = p_banco and c.producto_nombre = p_producto
      )
    )
$$;

create function finanzas.agregado_visible(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_usuario = finanzas.mi_usuario_id()
    or (
      p_usuario = any (finanzas.usuarios_hogar())
      and not exists (
        select 1
        from (
          select s.banco, s.producto_nombre from finanzas.saldo_cuenta s where s.usuario_id = p_usuario
          union
          select d.banco, d.nombre from finanzas.deuda_producto d where d.usuario_id = p_usuario
        ) p
        where not exists (
          select 1 from finanzas.producto_compartido c
          where c.usuario_id = p_usuario and c.banco = p.banco and c.producto_nombre = p.producto_nombre
        )
      )
    )
$$;

create function finanzas.ciclo_actual()
returns table (ciclo date, inicio date, fin date)
language sql
stable
set search_path = ''
as $$
  select
    (date_trunc('month', y.base) + interval '1 month')::date,
    (date_trunc('month', y.base) + interval '24 days')::date,
    (date_trunc('month', y.base) + interval '1 month 23 days')::date
  from (
    select case when extract(day from x.hoy) >= 25 then x.hoy else (x.hoy - interval '1 month')::date end as base
    from (select finanzas.hoy_chile() as hoy) x
  ) y
$$;

create function finanzas.mi_hogar()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (select finanzas.mi_usuario_id() as id),
  h as (
    select h.hogar_id, h.nombre, h.titular_id
    from finanzas.hogar h, yo
    where h.titular_id = yo.id
       or exists (select 1 from finanzas.miembro_hogar m where m.hogar_id = h.hogar_id and m.usuario_id = yo.id)
  )
  select jsonb_build_object(
    'yo', (select jsonb_build_object('usuario_id', u.usuario_id, 'nombre', u.nombre_visible) from finanzas.usuario u join yo on u.usuario_id = yo.id),
    'rol', case
      when not exists (select 1 from h) then 'solo'
      when (select h.titular_id from h) = (select yo.id from yo) then 'titular'
      else 'miembro'
    end,
    'hogar_id', (select h.hogar_id from h),
    'titular', (select jsonb_build_object('usuario_id', u.usuario_id, 'nombre', u.nombre_visible) from finanzas.usuario u join h on u.usuario_id = h.titular_id),
    'miembros', coalesce((
      select jsonb_agg(jsonb_build_object('usuario_id', u.usuario_id, 'nombre', u.nombre_visible) order by m.unido)
      from finanzas.miembro_hogar m join h using (hogar_id) join finanzas.usuario u on u.usuario_id = m.usuario_id
    ), '[]'::jsonb),
    'invitaciones', case
      when (select h.titular_id from h) = (select yo.id from yo) then coalesce((
        select jsonb_agg(i.email order by i.creada) from finanzas.invitacion_hogar i join h using (hogar_id)
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
$$;

create function finanzas.invitar_hogar(p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_yo uuid := finanzas.mi_usuario_id();
  v_hogar uuid;
begin
  if v_yo is null then
    raise exception 'usuario sin datos vinculados';
  end if;
  if exists (select 1 from finanzas.miembro_hogar m where m.usuario_id = v_yo) then
    raise exception 'solo quien creó el hogar puede invitar';
  end if;
  select h.hogar_id into v_hogar from finanzas.hogar h where h.titular_id = v_yo;
  if v_hogar is null then
    insert into finanzas.hogar (titular_id) values (v_yo) returning hogar_id into v_hogar;
  end if;
  insert into finanzas.invitacion_hogar (hogar_id, email) values (v_hogar, lower(trim(p_email)))
  on conflict (hogar_id, email) do nothing;
end;
$$;

create function finanzas.cancelar_invitacion(p_email text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from finanzas.invitacion_hogar i
  using finanzas.hogar h
  where i.hogar_id = h.hogar_id and h.titular_id = finanzas.mi_usuario_id() and i.email = lower(trim(p_email))
$$;

create function finanzas.quitar_miembro(p_usuario uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from finanzas.miembro_hogar m
  using finanzas.hogar h
  where m.hogar_id = h.hogar_id
    and m.usuario_id = p_usuario
    and (h.titular_id = finanzas.mi_usuario_id() or m.usuario_id = finanzas.mi_usuario_id())
$$;

create function finanzas.aceptar_invitacion()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_hogar uuid;
  v_id uuid;
begin
  if auth.uid() is null or finanzas.mi_usuario_id() is not null then
    return false;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then
    return false;
  end if;
  select i.hogar_id into v_hogar from finanzas.invitacion_hogar i where i.email = v_email order by i.creada limit 1;
  if v_hogar is null then
    return false;
  end if;
  insert into finanzas.usuario (usuario_id, auth_user_id, nombre_visible)
  values (gen_random_uuid(), auth.uid(), initcap(split_part(split_part(v_email, '@', 1), '.', 1)))
  returning usuario_id into v_id;
  insert into finanzas.miembro_hogar (hogar_id, usuario_id) values (v_hogar, v_id);
  delete from finanzas.invitacion_hogar where email = v_email;
  return true;
end;
$$;

drop policy usuario_lectura_dueno on finanzas.usuario;
create policy usuario_lectura_hogar on finanzas.usuario
  for select to authenticated using (auth_user_id = (select auth.uid()) or usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy movimiento_lectura_dueno on finanzas.movimiento;
create policy movimiento_lectura_hogar on finanzas.movimiento
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.producto_visible(usuario_id, banco, producto_nombre));
drop policy saldo_cuenta_lectura_dueno on finanzas.saldo_cuenta;
create policy saldo_cuenta_lectura_hogar on finanzas.saldo_cuenta
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.producto_visible(usuario_id, banco, producto_nombre));
drop policy deuda_producto_lectura_dueno on finanzas.deuda_producto;
create policy deuda_producto_lectura_hogar on finanzas.deuda_producto
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.producto_visible(usuario_id, banco, nombre));
drop policy deuda_cuota_mes_lectura_dueno on finanzas.deuda_cuota_mes;
create policy deuda_cuota_mes_lectura_hogar on finanzas.deuda_cuota_mes
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.producto_visible(usuario_id, banco, nombre));
drop policy gasto_diario_lectura_dueno on finanzas.gasto_diario;
create policy gasto_diario_lectura_hogar on finanzas.gasto_diario
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));
drop policy resumen_mensual_lectura_dueno on finanzas.resumen_mensual;
create policy resumen_mensual_lectura_hogar on finanzas.resumen_mensual
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));
drop policy caja_ciclo_lectura_dueno on finanzas.caja_ciclo;
create policy caja_ciclo_lectura_hogar on finanzas.caja_ciclo
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));
drop policy caja_resumen_lectura_dueno on finanzas.caja_resumen;
create policy caja_resumen_lectura_hogar on finanzas.caja_resumen
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));
drop policy pago_fijo_lectura_dueno on finanzas.pago_fijo;
create policy pago_fijo_lectura_hogar on finanzas.pago_fijo
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy deuda_manual_lectura_dueno on finanzas.deuda_manual;
create policy deuda_manual_lectura_hogar on finanzas.deuda_manual
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy sobre_lectura_dueno on finanzas.sobre;
create policy sobre_lectura_hogar on finanzas.sobre
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy perfil_lectura_dueno on finanzas.perfil;
create policy perfil_lectura_hogar on finanzas.perfil
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy presupuesto_lectura_dueno on finanzas.presupuesto;
create policy presupuesto_lectura_hogar on finanzas.presupuesto
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy publicacion_lectura_dueno on finanzas.publicacion;
create policy publicacion_lectura_hogar on finanzas.publicacion
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy anotacion_lectura_dueno on finanzas.anotacion;
drop policy anotacion_alta_dueno on finanzas.anotacion;
drop policy anotacion_cambio_dueno on finanzas.anotacion;
drop policy anotacion_baja_dueno on finanzas.anotacion;
create policy anotacion_lectura_hogar on finanzas.anotacion
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy anotacion_alta_hogar on finanzas.anotacion
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy anotacion_cambio_hogar on finanzas.anotacion
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy anotacion_baja_hogar on finanzas.anotacion
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy compra_lectura_dueno on finanzas.compra;
drop policy compra_alta_dueno on finanzas.compra;
drop policy compra_cambio_dueno on finanzas.compra;
drop policy compra_baja_dueno on finanzas.compra;
create policy compra_lectura_hogar on finanzas.compra
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_alta_hogar on finanzas.compra
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_cambio_hogar on finanzas.compra
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_baja_hogar on finanzas.compra
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy compra_item_lectura_dueno on finanzas.compra_item;
drop policy compra_item_alta_dueno on finanzas.compra_item;
drop policy compra_item_cambio_dueno on finanzas.compra_item;
drop policy compra_item_baja_dueno on finanzas.compra_item;
create policy compra_item_lectura_hogar on finanzas.compra_item
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_item_alta_hogar on finanzas.compra_item
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_item_cambio_hogar on finanzas.compra_item
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy compra_item_baja_hogar on finanzas.compra_item
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
drop policy pago_marcado_lectura_dueno on finanzas.pago_marcado;
drop policy pago_marcado_alta_dueno on finanzas.pago_marcado;
drop policy pago_marcado_cambio_dueno on finanzas.pago_marcado;
drop policy pago_marcado_baja_dueno on finanzas.pago_marcado;
create policy pago_marcado_lectura_hogar on finanzas.pago_marcado
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_marcado_alta_hogar on finanzas.pago_marcado
  for insert to authenticated with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_marcado_cambio_hogar on finanzas.pago_marcado
  for update to authenticated
  using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]))
  with check (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy pago_marcado_baja_hogar on finanzas.pago_marcado
  for delete to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));

alter table finanzas.anotacion add column creado_por uuid default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete set null;
alter table finanzas.compra add column creado_por uuid default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete set null;
alter table finanzas.anotacion alter column usuario_id set default finanzas.titular_de_mi_hogar();
alter table finanzas.compra alter column usuario_id set default finanzas.titular_de_mi_hogar();
alter table finanzas.compra_item alter column usuario_id set default finanzas.titular_de_mi_hogar();
alter table finanzas.pago_marcado alter column usuario_id set default finanzas.titular_de_mi_hogar();

create or replace function finanzas.cerrar_compra(p_compra uuid, p_medio text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_sobre uuid;
  v_lugar text;
  v_total bigint;
  v_id uuid;
begin
  select c.usuario_id, c.sobre_id, c.lugar into v_usuario, v_sobre, v_lugar
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
  insert into finanzas.anotacion (usuario_id, sobre_id, monto, nota, medio)
  values (v_usuario, v_sobre, v_total, v_lugar, p_medio)
  returning anotacion_id into v_id;
  update finanzas.compra set abierta = false, anotacion_id = v_id, cerrada = now()
  where compra_id = p_compra;
  return v_id;
end;
$$;

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
  select
    u.usuario_id,
    c.ciclo,
    (select sum(s.saldo_disponible) from finanzas.saldo_cuenta s where s.usuario_id = u.usuario_id)::bigint as saldo_hoy,
    (
      select r.proximo_sueldo from finanzas.caja_resumen r
      where r.usuario_id = u.usuario_id and r.proximo_sueldo is not null
      order by r.ciclo desc
      limit 1
    ) as proximo_sueldo
  from finanzas.usuario u
  cross join finanzas.ciclo_actual() c
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
  select c.inicio as ciclo_inicio, c.fin as ciclo_fin from finanzas.ciclo_actual() c
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
  cross join ciclo c
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

revoke all on finanzas.hogar, finanzas.miembro_hogar, finanzas.invitacion_hogar, finanzas.producto_compartido from public, anon, authenticated;
grant select, insert, delete on finanzas.producto_compartido to authenticated;
grant all on finanzas.hogar, finanzas.miembro_hogar, finanzas.invitacion_hogar, finanzas.producto_compartido to service_role;

revoke all on function
  finanzas.usuarios_hogar(), finanzas.titular_de_mi_hogar(), finanzas.producto_visible(uuid, text, text),
  finanzas.agregado_visible(uuid), finanzas.ciclo_actual(), finanzas.mi_hogar(), finanzas.invitar_hogar(text),
  finanzas.cancelar_invitacion(text), finanzas.quitar_miembro(uuid), finanzas.aceptar_invitacion()
  from public, anon;
grant execute on function
  finanzas.usuarios_hogar(), finanzas.titular_de_mi_hogar(), finanzas.producto_visible(uuid, text, text),
  finanzas.agregado_visible(uuid), finanzas.ciclo_actual(), finanzas.mi_hogar(), finanzas.invitar_hogar(text),
  finanzas.cancelar_invitacion(text), finanzas.quitar_miembro(uuid), finanzas.aceptar_invitacion()
  to authenticated, service_role;

create table finanzas.uso_credito (
  usuario_id uuid not null references finanzas.usuario (usuario_id) on delete cascade,
  ciclo date not null,
  ciclo_inicio date not null,
  ciclo_fin date not null,
  compras_tarjeta bigint not null,
  n_compras int not null,
  giros_linea bigint not null,
  n_giros int not null,
  primary key (usuario_id, ciclo)
);

create table finanzas.tope_credito (
  usuario_id uuid not null default finanzas.mi_usuario_id() references finanzas.usuario (usuario_id) on delete cascade,
  tipo text not null check (tipo in ('tarjetas', 'linea')),
  inicial bigint not null check (inicial >= 0),
  meta bigint not null check (meta >= 0),
  bajada_pct numeric(4, 1) not null default 10 check (bajada_pct between 0 and 50),
  desde_ciclo date not null,
  actualizado timestamptz not null default now(),
  primary key (usuario_id, tipo),
  check (meta <= inicial)
);

create trigger tope_credito_actualizado before update on finanzas.tope_credito
  for each row execute function finanzas.tocar_actualizado();

alter table finanzas.uso_credito enable row level security;
alter table finanzas.tope_credito enable row level security;

create policy uso_credito_lectura_hogar on finanzas.uso_credito
  for select to authenticated using (usuario_id = (select finanzas.mi_usuario_id()) or finanzas.agregado_visible(usuario_id));

create policy tope_credito_lectura_hogar on finanzas.tope_credito
  for select to authenticated using (usuario_id = any ((select finanzas.usuarios_hogar())::uuid[]));
create policy tope_credito_alta_dueno on finanzas.tope_credito
  for insert to authenticated with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy tope_credito_cambio_dueno on finanzas.tope_credito
  for update to authenticated
  using (usuario_id = (select finanzas.mi_usuario_id()))
  with check (usuario_id = (select finanzas.mi_usuario_id()));
create policy tope_credito_baja_dueno on finanzas.tope_credito
  for delete to authenticated using (usuario_id = (select finanzas.mi_usuario_id()));

revoke all on finanzas.uso_credito, finanzas.tope_credito from public, anon;
grant select on finanzas.uso_credito to authenticated;
grant select, insert, update, delete on finanzas.tope_credito to authenticated;
grant all on finanzas.uso_credito, finanzas.tope_credito to service_role;

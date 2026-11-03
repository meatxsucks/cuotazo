-- Solo para probar en un Postgres local lo que Neon trae con la Data API y Neon Auth activas.
create role authenticated nologin;
create role anonymous nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant usage on schema auth to authenticated, anonymous;
create schema neon_auth;
create table neon_auth."user" (id uuid primary key, email text not null, "emailVerified" boolean not null default false);

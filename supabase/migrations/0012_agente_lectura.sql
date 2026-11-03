-- Lectura para el agente (MCP): solo vistas permitidas, siempre filtradas por el usuario que se pasa.
-- El dueño se salta RLS, así que el filtro por usuario_id es la barrera; solo el rol del agente puede ejecutarla.
create function finanzas.agente_leer(p_usuario uuid, p_vista text, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_filtro text := '';
  v_filas jsonb;
begin
  if p_vista not in ('lo_que_viene', 'pagos_ciclo', 'deudas_todas', 'estado_sobre', 'uso_credito', 'tope_credito', 'movimiento') then
    raise exception 'vista no permitida: %', p_vista;
  end if;
  if p_vista = 'movimiento' then
    v_filtro := ' and fecha_imputacion >= coalesce($2, date ''0001-01-01'') and fecha_imputacion <= coalesce($3, date ''9999-12-31'')';
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from finanzas.%I where usuario_id = $1%s limit 500) t',
    p_vista, v_filtro
  ) into v_filas using p_usuario, p_desde, p_hasta;
  return v_filas;
end;
$$;

revoke all on function finanzas.agente_leer(uuid, text, date, date) from public;

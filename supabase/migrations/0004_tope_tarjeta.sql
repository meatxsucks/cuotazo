alter table finanzas.presupuesto add column if not exists producto text check (producto is null or length(producto) <= 120);

alter table finanzas.presupuesto drop constraint presupuesto_tipo_check;
alter table finanzas.presupuesto add constraint presupuesto_tipo_check
  check (tipo = any (array['categoria', 'total', 'compras_credito', 'carga_cuotas', 'tope_tarjeta']));

alter table finanzas.presupuesto add constraint presupuesto_producto_tipo_check
  check ((tipo = 'tope_tarjeta') = (producto is not null));

drop index finanzas.presupuesto_unico_mes;
drop index finanzas.presupuesto_unico_recurrente;

create unique index presupuesto_unico_mes on finanzas.presupuesto
  (usuario_id, tipo, coalesce(categoria::text, ''), coalesce(producto, ''), mes) where mes is not null;
create unique index presupuesto_unico_recurrente on finanzas.presupuesto
  (usuario_id, tipo, coalesce(categoria::text, ''), coalesce(producto, '')) where mes is null;

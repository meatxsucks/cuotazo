INSERT INTO dw.regla_categoria (codigo, usuario_id, patron, banco, producto_tipo, signo, categoria, tipo_flujo, prioridad)
SELECT 'usuario:' || u.usuario_id || ':' || r.codigo, u.usuario_id, r.patron, r.banco, r.producto_tipo, r.signo, r.categoria, r.tipo_flujo, r.prioridad
FROM dw.dim_usuario u
CROSS JOIN (VALUES
    ('almacen_barrio', 'ALMACEN LOS AROMOS', NULL, NULL, NULL::smallint, 'supermercado', NULL, 40),
    ('picada_favorita', 'SANGUCHERIA EL EJEMPLO', NULL, NULL, -1::smallint, 'restaurantes_delivery', NULL, 42)
) AS r (codigo, patron, banco, producto_tipo, signo, categoria, tipo_flujo, prioridad)
WHERE u.usuario_id = '00000000-0000-0000-0000-000000000000'
ON CONFLICT (codigo) DO UPDATE
SET patron = EXCLUDED.patron, banco = EXCLUDED.banco, producto_tipo = EXCLUDED.producto_tipo, signo = EXCLUDED.signo,
    categoria = EXCLUDED.categoria, tipo_flujo = EXCLUDED.tipo_flujo, prioridad = EXCLUDED.prioridad, activa = TRUE

// Catálogo de categorías con nombre y color fijo por entidad

export interface InfoCategoria {
	id: string;
	nombre: string;
	claro: string;
	oscuro: string;
}

const LISTA: InfoCategoria[] = [
	{ id: 'supermercado', nombre: 'Supermercado', claro: '#2a78d6', oscuro: '#3987e5' },
	{ id: 'restaurantes_delivery', nombre: 'Restaurantes y delivery', claro: '#eb6834', oscuro: '#d95926' },
	{ id: 'transporte', nombre: 'Transporte', claro: '#1baf7a', oscuro: '#199e70' },
	{ id: 'combustible_auto', nombre: 'Combustible y auto', claro: '#eda100', oscuro: '#c98500' },
	{ id: 'salud', nombre: 'Salud', claro: '#e87ba4', oscuro: '#d55181' },
	{ id: 'educacion', nombre: 'Educación', claro: '#4a3aa7', oscuro: '#9085e9' },
	{ id: 'vivienda_servicios', nombre: 'Vivienda y servicios', claro: '#008300', oscuro: '#2f9e2f' },
	{ id: 'hogar', nombre: 'Hogar', claro: '#a0632b', oscuro: '#b87a43' },
	{ id: 'vestuario', nombre: 'Vestuario', claro: '#e34948', oscuro: '#e66767' },
	{ id: 'entretenimiento_suscripciones', nombre: 'Entretenimiento y suscripciones', claro: '#9b4dca', oscuro: '#b07ae0' },
	{ id: 'viajes', nombre: 'Viajes', claro: '#0e8fb3', oscuro: '#29a9cc' },
	{ id: 'tecnologia', nombre: 'Tecnología', claro: '#5b6b82', oscuro: '#8594ab' },
	{ id: 'mascotas', nombre: 'Mascotas', claro: '#7a8a1f', oscuro: '#9aab35' },
	{ id: 'seguros', nombre: 'Seguros', claro: '#0f6f6a', oscuro: '#2c9a93' },
	{ id: 'intereses_comisiones_impuestos', nombre: 'Intereses, comisiones e impuestos', claro: '#b3261e', oscuro: '#f07167' },
	{ id: 'transferencias_personas', nombre: 'Transferencias a personas', claro: '#3f51b5', oscuro: '#7986cb' },
	{ id: 'transferencia_interna', nombre: 'Transferencia entre cuentas', claro: '#8a8f99', oscuro: '#7c828c' },
	{ id: 'pago_tarjeta_credito', nombre: 'Pago de tarjeta', claro: '#78716c', oscuro: '#a8a29e' },
	{ id: 'pago_credito', nombre: 'Pago de crédito', claro: '#64748b', oscuro: '#94a3b8' },
	{ id: 'ingresos_sueldo', nombre: 'Sueldo', claro: '#15803d', oscuro: '#34d399' },
	{ id: 'ingresos_otros', nombre: 'Otros ingresos', claro: '#0d9488', oscuro: '#5eead4' },
	{ id: 'sin_categoria', nombre: 'Sin categoría', claro: '#9ca3af', oscuro: '#6b7280' }
];

export const CATEGORIAS: InfoCategoria[] = LISTA;
export const CATEGORIAS_GASTO = LISTA.filter(
	(c) => !['ingresos_sueldo', 'ingresos_otros', 'pago_tarjeta_credito', 'pago_credito', 'transferencia_interna'].includes(c.id)
);
const MAPA = new Map(LISTA.map((c) => [c.id, c]));

export function categoria(id: string): InfoCategoria {
	return MAPA.get(id) ?? { id, nombre: id.replaceAll('_', ' '), claro: '#9ca3af', oscuro: '#6b7280' };
}

export function nombreCategoria(id: string): string {
	return categoria(id).nombre;
}

// Variable CSS con el color de la categoría (definidas en app.css)
export function colorCategoria(id: string): string {
	return MAPA.has(id) ? `var(--cat-${id})` : 'var(--cat-sin_categoria)';
}

export const COLOR_OTRAS = 'var(--cat-otras)';

export function cssCategorias(modo: 'claro' | 'oscuro'): string {
	return LISTA.map((c) => `--cat-${c.id}: ${c[modo]};`).join('\n');
}

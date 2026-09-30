import { expect, test } from 'vitest';
import type { Movimiento, PagoFijo, Sobre } from '$lib/datos/tipos';
import { estadoSobres, nivelSobre, pagosFijosDelMes } from './presupuesto';

const sobre: Sobre = { sobre_id: 's', nombre: 'Supermercado', categoria: 'supermercado', monto: 100_000, periodo: 'semana', esencial: true, orden: 1, activo: true };
const mov = (fecha: string, monto: number, categoria = 'supermercado'): Movimiento => ({
	usuario_id: 'u', movimiento_id: fecha + monto, fecha, fecha_imputacion: fecha, banco: 'b', producto_tipo: 'tarjeta', producto_nombre: 'T',
	glosa: '', comercio: null, categoria, tipo_flujo: 'gasto', monto: -monto, monto_total_compra: null, cuota_actual: null, cuotas_total: null, estado: 'no_facturado'
});
const fijo: PagoFijo = { pago_fijo_id: 'p', nombre: 'Colegio', categoria: 'educacion', monto: 150_000, dia_vencimiento: 5, desde: '2026-01-01', hasta: null, meses_pausa: [1, 2], activo: true };

test('estado del sobre semanal: anotado, disponible y gasto sin anotar', () => {
	// 2026-09-30 es miércoles; la semana va del lunes 28 al domingo 4
	const [e] = estadoSobres(
		[sobre],
		[{ anotacion_id: 'a', sobre_id: 's', fecha: '2026-09-29', monto: 30_000, nota: null, medio: 'debito', movimiento_id: null }],
		[mov('2026-09-29', 30_000), mov('2026-09-30', 25_000), mov('2026-09-20', 99_000)],
		'2026-09-30'
	);
	expect(e).toMatchObject({ periodo_inicio: '2026-09-28', periodo_fin: '2026-10-04', anotado: 30_000, disponible: 70_000, porcentaje: 30, dias_restantes: 5, sin_anotar: 25_000 });
});

test('los pagos fijos no cuentan como gasto sin anotar', () => {
	const s = { ...sobre, categoria: 'educacion', periodo: 'mes' as const };
	const [e] = estadoSobres([s], [], [mov('2026-09-05', 150_000, 'educacion'), mov('2026-09-10', 20_000, 'educacion')], '2026-09-30', [fijo]);
	expect(e.sin_anotar).toBe(20_000);
});

test('pagos fijos del mes respetan pausas y fecha de inicio', () => {
	expect(pagosFijosDelMes([fijo], '2026-09-01')).toBe(150_000);
	expect(pagosFijosDelMes([fijo], '2027-01-01')).toBe(0);
	expect(pagosFijosDelMes([{ ...fijo, desde: '2026-12-01' }], '2026-10-01')).toBe(0);
});

test('color del sobre según avance', () => {
	expect([nivelSobre(50), nivelSobre(85), nivelSobre(100), nivelSobre(null)]).toEqual(['ok', 'aviso', 'excedido', 'ok']);
});

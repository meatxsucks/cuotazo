import { describe, expect, it, vi } from 'vitest';
import { responder } from './mcp';

const U = '11111111-1111-1111-1111-111111111111';
const nombres = (r: any) => r.result.tools.map((t: any) => t.name);
const llamar = (name: string, args: object, o: Parameters<typeof responder>[1]) => responder({ id: 1, method: 'tools/call', params: { name, arguments: args } }, o) as Promise<any>;
const lee = () => vi.fn().mockResolvedValue([{ r: [{ a: 1 }] }]);

describe('mcp: alcance por token', () => {
	it('con el token de lectura solo se ven herramientas de consulta', async () => {
		const n = nombres(await responder({ id: 1, method: 'tools/list' }, { usuario: U, leer: lee() }));
		expect(n).toEqual(expect.arrayContaining(['resumen', 'pagos_ciclo', 'movimientos', 'anotaciones', 'buscar_obligacion']));
		for (const w of ['anotar_gasto', 'crear_sobre', 'registrar_ingreso', 'registrar_pago', 'deshacer']) expect(n).not.toContain(w);
	});
	it('con el de escritura aparecen las que anotan', async () => {
		const n = nombres(await responder({ id: 1, method: 'tools/list' }, { usuario: U, leer: lee(), escribir: lee() }));
		expect(n).toEqual(expect.arrayContaining(['anotar_gasto', 'crear_sobre', 'registrar_ingreso', 'registrar_pago', 'deshacer']));
	});
	it('llamar a una herramienta de escritura sin ese token falla sin tocar la base', async () => {
		const leer = lee();
		const r = await llamar('registrar_pago', { obligacion: 'x', monto: 1000 }, { usuario: U, leer });
		expect(r.error.code).toBe(-32602);
		expect(leer).not.toHaveBeenCalled();
	});
	it('una notificación no lleva respuesta', async () => {
		expect(await responder({ method: 'notifications/initialized' }, { usuario: U, leer: lee() })).toBeNull();
	});
});

describe('mcp: lectura', () => {
	it('pasa usuario, vista y fechas a la función de lectura', async () => {
		const leer = vi.fn().mockResolvedValue([{ r: [{ a: 1 }] }]);
		const r = await llamar('movimientos', { desde: '2026-10-01', hasta: '2026-10-31' }, { usuario: U, leer });
		expect(leer.mock.calls[0][1]).toEqual([U, 'movimiento', '2026-10-01', '2026-10-31']);
		expect(r.result.content[0].text).toBe('[{"a":1}]');
	});
	it('rechaza fechas inválidas antes de consultar', async () => {
		const leer = lee();
		const r = await llamar('movimientos', { desde: "2026-10-01'; drop" }, { usuario: U, leer });
		expect(r.error.code).toBe(-32602);
		expect(leer).not.toHaveBeenCalled();
	});
	it('un fallo de lectura no filtra el detalle', async () => {
		const r = await llamar('resumen', {}, { usuario: U, leer: vi.fn().mockRejectedValue(new Error('password authentication failed')) });
		expect(r.result.isError).toBe(true);
		expect(JSON.stringify(r)).not.toContain('password');
	});
});

describe('mcp: escritura', () => {
	it('valida los tipos antes de llamar a la base', async () => {
		const escribir = lee();
		for (const args of [{ obligacion: 'x', monto: '350000' }, { obligacion: 'x', monto: 1.5 }, { monto: 1000 }, { obligacion: 'x', monto: 1000, confirmar: 'si' }]) {
			expect((await llamar('registrar_pago', args, { usuario: U, leer: lee(), escribir })).error.code).toBe(-32602);
		}
		expect((await llamar('deshacer', { tipo: 'usuario', id: 'no-es-uuid' }, { usuario: U, leer: lee(), escribir })).error.code).toBe(-32602);
		expect(escribir).not.toHaveBeenCalled();
	});
	it('registrar_pago entrega {exito, mensaje, datos_actualizados}', async () => {
		const escribir = vi.fn().mockResolvedValue([{ r: { exito: true, mensaje: 'Pago registrado', pago_id: 'p1', obligacion_actualizada: { estado: 'pagado' } } }]);
		const r = await llamar('registrar_pago', { obligacion: 'U Esli', monto: 350000, fecha: '2026-11-03' }, { usuario: U, leer: lee(), escribir });
		expect(escribir.mock.calls[0][1]).toEqual([U, 'U Esli', 350000, '2026-11-03', null, false]);
		expect(JSON.parse(r.result.content[0].text)).toEqual({ exito: true, mensaje: 'Pago registrado', datos_actualizados: { pago_id: 'p1', obligacion_actualizada: { estado: 'pagado' } } });
	});
	it('registrar_ingreso usa la categoría por defecto y envía todos los campos', async () => {
		const escribir = vi.fn().mockResolvedValue([{ r: 'id-1' }]);
		const r = await llamar('registrar_ingreso', { descripcion: 'Venta bicicleta', monto: 90000 }, { usuario: U, leer: lee(), escribir });
		expect(escribir.mock.calls[0][1]).toEqual([U, 'Venta bicicleta', 90000, null, false, 'otro']);
		expect(JSON.parse(r.result.content[0].text).datos_actualizados).toEqual({ ingreso_id: 'id-1' });
	});
	it('un tope de la base vuelve como exito = false con su explicación', async () => {
		const escribir = vi.fn().mockRejectedValue(Object.assign(new Error('monto fuera de rango (1 a 500.000)'), { code: 'P0001' }));
		const r = await llamar('anotar_gasto', { monto: 900000 }, { usuario: U, leer: lee(), escribir });
		expect(JSON.parse(r.result.content[0].text)).toEqual({ exito: false, mensaje: 'monto fuera de rango (1 a 500.000)' });
	});
	it('un error inesperado de la base no se filtra', async () => {
		const escribir = vi.fn().mockRejectedValue(Object.assign(new Error('connection refused to 10.0.0.1'), { code: '08006' }));
		const r = await llamar('anotar_gasto', { monto: 1000 }, { usuario: U, leer: lee(), escribir });
		expect(r.result.isError).toBe(true);
		expect(JSON.stringify(r)).not.toContain('10.0.0.1');
	});
});

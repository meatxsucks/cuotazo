import { expect, test } from 'vitest';
import type { DeudaProducto, PagoCiclo, PagoFijo, Sobre } from '$lib/datos/tipos';
import { balanceMes, frecuentes, pagosCicloDemo, planCiclo, sobresDelMes, totalCompra } from './mes';

const pago = (p: Partial<PagoCiclo>): PagoCiclo => ({
	ciclo: '2026-10-01', ciclo_inicio: '2026-09-25', ciclo_fin: '2026-10-24', en_curso: true, clave: p.nombre ?? 'x', origen: 'pago_fijo',
	nombre: 'x', acreedor: null, fecha: '2026-09-30', monto: 0, monto_minimo: null, pagado_banco: 0, automatico: false, estimado: false,
	marcado: null, estado: 'pendiente', por_pagar: 0, por_pagar_minimo: 0, comprometido: 0, ...p
});
const sobre: Sobre = { sobre_id: 's', nombre: 'Supermercado', categoria: 'supermercado', monto: 300_000, periodo: 'mes', esencial: true, orden: 1, activo: true };

const pagos = [
	pago({ nombre: 'Gas', monto: 50_000, por_pagar: 50_000, por_pagar_minimo: 50_000, comprometido: 50_000 }),
	pago({ nombre: 'Luz', monto: 70_000, estado: 'pagado', marcado: true, comprometido: 70_000 }),
	pago({ nombre: 'Visa', origen: 'tarjeta', fecha: '2026-10-09', monto: 1_000_000, monto_minimo: 50_000, pagado_banco: 800_000, estado: 'minimo', por_pagar: 200_000, comprometido: 1_000_000 }),
	pago({ nombre: 'Tienda', origen: 'tarjeta', monto: 900_000, monto_minimo: 120_000, pagado_banco: 120_000, estado: 'minimo', comprometido: 120_000 })
];

test('el gasto del sobre suma lo anotado y lo que llegó del banco sin anotar', () => {
	const [s] = sobresDelMes([sobre], [{ sobre_id: 's', periodo_inicio: '', periodo_fin: '', anotado: 40_000, disponible: 0, porcentaje: null, dias_restantes: 1, sin_anotar: 60_000 }], true);
	expect(s).toMatchObject({ presupuesto: 300_000, gastado: 100_000, queda: 200_000 });
	expect(sobresDelMes([sobre], [], false)[0].gastado).toBe(0);
});

test('balance: la tarjeta con el mínimo pagado y vencida solo cuenta lo pagado', () => {
	const sobres = sobresDelMes([sobre], [], true);
	const b = balanceMes(pagos, sobres, 2_000_000, 300_000);
	expect(b.pagos).toBe(50_000 + 70_000 + 1_000_000 + 120_000);
	expect(b.porPagar).toBe(250_000);
	expect(b.queda).toBe(2_000_000 - 1_240_000 - 300_000);
	expect(b.cierre).toBe(300_000 - 250_000 - 300_000);
});

test('plan: primero cuentas, después esenciales, y el resto de la tarjeta si alcanza', () => {
	const plan = planCiclo(pagos, sobresDelMes([sobre], [], true), 400_000);
	expect(plan.map((p) => [p.texto, p.monto, p.alcanza])).toEqual([
		['Paga las cuentas y cuotas pendientes', 50_000, true],
		['Guarda para lo esencial', 300_000, true],
		['Abona a Visa', 50_000, true]
	]);
	const corto = planCiclo(pagos, sobresDelMes([sobre], [], true), 100_000);
	expect(corto[1].alcanza).toBe(false);
	expect(corto[2]).toMatchObject({ texto: 'Resto de Visa', monto: 200_000, alcanza: false });
});

test('carro: total con cantidades y productos frecuentes con su último precio', () => {
	expect(totalCompra([{ cantidad: 1.5, precio: 1_000 }, { cantidad: 2, precio: 990 }])).toBe(3_480);
	expect(frecuentes([{ nombre: 'Leche', precio: 1_100 }, { nombre: 'pan', precio: 2_000 }, { nombre: 'leche ', precio: 990 }])).toEqual([
		{ nombre: 'Leche', precio: 1_100, veces: 2 },
		{ nombre: 'pan', precio: 2_000, veces: 1 }
	]);
});

test('réplica demo: fechas dentro del ciclo 25→24, pausas y marcas a mano', () => {
	const fijo: PagoFijo = { pago_fijo_id: 'f', nombre: 'Colegio', categoria: 'educacion', monto: 100_000, dia_vencimiento: 5, desde: '2026-01-01', hasta: null, meses_pausa: [11], activo: true };
	const visa = { banco: 'b', tipo: 'tarjeta', nombre: 'Visa', proximo_vencimiento: '2026-10-09', monto_facturado: 500_000, pago_minimo: 25_000, monto_pagado: 25_000, monto_por_facturar: 80_000 } as DeudaProducto;
	const filas = pagosCicloDemo('2026-09-30', { pagosFijos: [fijo], deudasManuales: [], deudas: [visa], marcas: { '2026-10-01|fijo:f': true } });
	const actual = filas.filter((f) => f.en_curso);
	expect(actual.map((f) => [f.nombre, f.fecha, f.estado, f.por_pagar])).toEqual([
		['Colegio', '2026-10-05', 'pagado', 0],
		['Visa', '2026-10-09', 'minimo', 475_000]
	]);
	const proximo = filas.filter((f) => !f.en_curso);
	expect(proximo.map((f) => [f.nombre, f.fecha, f.estimado])).toEqual([['Visa', '2026-11-09', true]]);
});

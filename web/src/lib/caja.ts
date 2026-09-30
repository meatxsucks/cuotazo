// Ciclo de caja de sueldo a sueldo, compromisos antes del sueldo y unión de deudas
import type { DeudaManual, DeudaProducto, DeudaTodas, GrupoCaja, LoQueViene, PagoFijo } from './datos/tipos';
import { pagoFijoVigente } from './deudas/presupuesto';
import { conDia, diaSemana, finDeMes, mesDe, sumarDias, sumarMeses } from './fechas';
import { nombreBanco } from './formato';

export const DIA_CORTE = 25;

export interface Ciclo {
	ciclo: string;
	inicio: string;
	fin: string;
}

/** El ciclo empieza el día de corte del mes M, termina el día anterior de M+1 y se etiqueta con M+1 */
export function cicloDe(fecha: string, corte = DIA_CORTE): Ciclo {
	const mes = mesDe(fecha);
	const base = Number(fecha.slice(8)) >= corte ? mes : sumarMeses(mes, -1);
	const siguiente = sumarMeses(base, 1);
	return { ciclo: siguiente, inicio: conDia(base, corte), fin: sumarDias(conDia(siguiente, corte), -1) };
}

function habilAnterior(f: string): string {
	let x = f;
	while (diaSemana(x) === 0 || diaSemana(x) === 6) x = sumarDias(x, -1);
	return x;
}

/** Día de sueldo del mes: el día de pago declarado o el último día hábil, corrido al hábil anterior */
export function diaDeSueldo(mes: string, diaPago?: number | null): string {
	return habilAnterior(diaPago ? conDia(mes, diaPago) : finDeMes(mes));
}

/** Próximo sueldo posterior a hoy (el de hoy se da por recibido) */
export function proximoSueldo(hoy: string, diaPago?: number | null): string {
	const este = diaDeSueldo(mesDe(hoy), diaPago);
	return este > hoy ? este : diaDeSueldo(sumarMeses(mesDe(hoy), 1), diaPago);
}

export const GRUPOS_CAJA: { id: GrupoCaja; nombre: string; entrada: boolean }[] = [
	{ id: 'sueldo', nombre: 'Sueldo', entrada: true },
	{ id: 'otros_ingresos', nombre: 'Otros ingresos', entrada: true },
	{ id: 'pago_tarjetas', nombre: 'Pago de tarjetas', entrada: false },
	{ id: 'pago_creditos', nombre: 'Créditos y línea', entrada: false },
	{ id: 'vivienda_servicios', nombre: 'Vivienda y servicios', entrada: false },
	{ id: 'gasto_debito', nombre: 'Compras con débito', entrada: false },
	{ id: 'transferencias_personas', nombre: 'Transferencias a personas', entrada: false },
	{ id: 'intereses_comisiones', nombre: 'Intereses y comisiones', entrada: false },
	{ id: 'traspasos_propios', nombre: 'Traspasos entre tus cuentas', entrada: false },
	{ id: 'sin_categoria', nombre: 'Sin categoría', entrada: false }
];

export function nombreGrupo(id: string): string {
	return GRUPOS_CAJA.find((g) => g.id === id)?.nombre ?? id.replaceAll('_', ' ');
}

function factorUf(d: DeudaProducto): number | null {
	return d.moneda === 'UF' && d.saldo_deuda && d.saldo_deuda_clp ? d.saldo_deuda_clp / d.saldo_deuda : null;
}

export function cuotaClp(d: DeudaProducto): number | null {
	if (d.valor_cuota == null) return null;
	if (d.moneda !== 'UF') return d.valor_cuota;
	const f = factorUf(d);
	return f ? Math.round(d.valor_cuota * f) : null;
}

/** Lo que falta pagar del último estado: facturado menos lo pagado; si no hay facturado, el mínimo */
export function aPagarTarjeta(d: DeudaProducto): number | null {
	if (d.monto_facturado != null) return Math.max(0, d.monto_facturado - (d.monto_pagado ?? 0));
	return d.pago_minimo;
}

function enRango(f: string | null, desde: string, hasta: string): f is string {
	return !!f && f >= desde && f <= hasta;
}

// Pagos fijos y cuotas manuales que vencen hoy se asumen pagados (se paga el día del sueldo)
function posteriorHasta(f: string | null, hoy: string, hasta: string): f is string {
	return !!f && f > hoy && f <= hasta;
}

export interface EntradaCompromisos {
	hoy: string;
	hasta: string;
	deudas: DeudaProducto[];
	pagosFijos: PagoFijo[];
	deudasManuales: DeudaManual[];
}

/** Compromisos entre hoy y el próximo sueldo (réplica de la vista lo_que_viene) */
export function compromisosHastaSueldo(e: EntradaCompromisos): LoQueViene[] {
	const filas: LoQueViene[] = [];
	const fila = (f: Omit<LoQueViene, 'disponible_para_vivir_ajustado' | 'monto_minimo'> & { monto_minimo?: number | null }) =>
		f.monto > 0 && filas.push({ monto_minimo: null, ...f, disponible_para_vivir_ajustado: null });

	for (const d of e.deudas) {
		if (!enRango(d.proximo_vencimiento, e.hoy, e.hasta)) continue;
		if (d.tipo === 'tarjeta' || d.tipo === 'linea') {
			const total = aPagarTarjeta(d) ?? 0;
			const minimo = d.pago_minimo != null ? Math.min(d.pago_minimo, total) : null;
			fila({
				fecha: d.proximo_vencimiento,
				origen: d.tipo,
				nombre: d.nombre,
				detalle: d.monto_facturado != null ? 'Total facturado' : 'Pago mínimo',
				monto: total,
				monto_minimo: d.monto_facturado != null ? minimo : null
			});
		} else {
			fila({
				fecha: d.proximo_vencimiento,
				origen: d.tipo === 'hipotecario' ? 'dividendo' : 'credito',
				nombre: d.nombre,
				detalle: d.tipo === 'hipotecario' ? 'Dividendo' : 'Cuota',
				monto: cuotaClp(d) ?? 0
			});
		}
	}

	const meses = [mesDe(e.hoy)];
	while (meses[meses.length - 1] < mesDe(e.hasta)) meses.push(sumarMeses(meses[meses.length - 1], 1));

	for (const p of e.pagosFijos) {
		for (const mes of meses) {
			const f = conDia(mes, p.dia_vencimiento);
			if (posteriorHasta(f, e.hoy, e.hasta) && pagoFijoVigente(p, mes)) {
				fila({ fecha: f, origen: 'pago_fijo', nombre: p.nombre, detalle: 'Pago fijo', monto: p.monto });
			}
		}
	}

	for (const d of e.deudasManuales) {
		if (!d.activo) continue;
		const monto = d.cuota_fija ?? d.cuota_minima ?? 0;
		const detalle = d.cuota_fija != null ? 'Cuota' : 'Pago mínimo';
		if (d.proximo_pago) {
			if (posteriorHasta(d.proximo_pago, e.hoy, e.hasta)) fila({ fecha: d.proximo_pago, origen: 'deuda_manual', nombre: d.nombre, detalle, monto });
			continue;
		}
		if (!d.dia_pago) continue;
		for (const mes of meses) {
			const f = conDia(mes, d.dia_pago);
			if (posteriorHasta(f, e.hoy, e.hasta)) fila({ fecha: f, origen: 'deuda_manual', nombre: d.nombre, detalle, monto });
		}
	}

	return filas.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || b.monto - a.monto);
}

/** Unión de deudas del banco y manuales (réplica de la vista deudas_todas) */
export function unirDeudas(deudas: DeudaProducto[], manuales: DeudaManual[]): DeudaTodas[] {
	const banco: DeudaTodas[] = deudas
		.map((d) => {
			const fija = d.tipo === 'consumo' || d.tipo === 'hipotecario';
			return {
				clave: `banco|${d.banco}|${d.tipo}|${d.nombre}`,
				origen: 'banco' as const,
				deuda_manual_id: null,
				nombre: d.nombre,
				acreedor: nombreBanco(d.banco),
				tipo: d.tipo,
				saldo_clp: Math.round(d.saldo_deuda_clp ?? d.saldo_deuda ?? d.usado ?? 0),
				tasa_mensual: d.tasa_mensual,
				cuota_minima: fija ? null : d.pago_minimo,
				cuota_fija: fija ? cuotaClp(d) : null,
				cuotas_restantes: fija && d.cuotas_total != null ? Math.max(0, d.cuotas_total - (d.cuotas_pagadas ?? 0)) : null,
				proximo_pago: d.proximo_vencimiento
			};
		})
		.filter((d) => d.saldo_clp > 0);
	const propias: DeudaTodas[] = manuales
		.filter((d) => d.activo && d.saldo > 0)
		.map((d) => ({
			clave: `manual|${d.deuda_manual_id}`,
			origen: 'manual',
			deuda_manual_id: d.deuda_manual_id,
			nombre: d.nombre,
			acreedor: d.acreedor ?? '',
			tipo: d.tipo,
			saldo_clp: Math.round(d.saldo),
			tasa_mensual: d.tasa_mensual,
			cuota_minima: d.cuota_minima,
			cuota_fija: d.cuota_fija,
			cuotas_restantes: d.cuotas_restantes,
			proximo_pago: d.proximo_pago
		}));
	return [...banco, ...propias];
}

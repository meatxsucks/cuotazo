import type { DeudaProducto, GastoDiario } from '@/datos/tipos';
import { hoyChile } from './fechas';

export interface TotalCategoria {
	categoria: string;
	monto: number;
	cantidad: number;
}

export function porCategoria(filas: GastoDiario[]): TotalCategoria[] {
	const mapa = new Map<string, TotalCategoria>();
	for (const g of filas) {
		const t = mapa.get(g.categoria) ?? { categoria: g.categoria, monto: 0, cantidad: 0 };
		t.monto += g.monto_gasto;
		t.cantidad += g.cantidad;
		mapa.set(g.categoria, t);
	}
	return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}

export interface Vencimiento {
	nombre: string;
	banco: string;
	tipo: string;
	fecha: string;
	monto: number | null;
	moneda: 'CLP' | 'UF';
	montoClp: number | null;
	detalle: string;
}

// Próximos pagos a partir de deuda_producto
export function vencimientos(deudas: DeudaProducto[], hoy = hoyChile()): Vencimiento[] {
	return deudas
		.filter((d) => d.proximo_vencimiento && d.proximo_vencimiento >= hoy)
		.map((d) => {
			const esTarjeta = d.tipo === 'tarjeta';
			const monto = esTarjeta ? d.pago_minimo : d.valor_cuota;
			const factor = d.moneda === 'UF' && d.saldo_deuda && d.saldo_deuda_clp ? d.saldo_deuda_clp / d.saldo_deuda : null;
			return {
				nombre: d.nombre,
				banco: d.banco,
				tipo: d.tipo,
				fecha: d.proximo_vencimiento!,
				monto,
				moneda: d.moneda,
				montoClp: d.moneda === 'UF' ? (monto != null && factor ? Math.round(monto * factor) : null) : monto,
				detalle: esTarjeta ? 'Pago mínimo' : d.tipo === 'hipotecario' ? 'Dividendo' : 'Cuota'
			};
		})
		.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

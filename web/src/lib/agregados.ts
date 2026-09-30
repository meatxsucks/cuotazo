import type { GastoDiario } from './datos/tipos';

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

// Tope mensual de compras con tarjeta y de giros de la línea, que baja un porcentaje cada ciclo hasta la meta
import type { TopeCredito } from './datos/tipos';

function mesesEntre(desde: string, hasta: string): number {
	return (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7));
}

/** Tope del ciclo: parte en `inicial` y baja `bajada_pct` cada ciclo, sin pasar bajo la meta; redondeado a mil */
export function topeDelCiclo(t: Pick<TopeCredito, 'inicial' | 'meta' | 'bajada_pct' | 'desde_ciclo'>, ciclo: string): number {
	const n = Math.max(0, mesesEntre(t.desde_ciclo, ciclo));
	const bruto = t.inicial * (1 - t.bajada_pct / 100) ** n;
	return Math.max(t.meta, Math.round(bruto / 1000) * 1000);
}

/** Tope sugerido: 10% bajo lo usado el ciclo anterior, redondeado a 10 mil */
export function topeSugerido(usoAnterior: number): number {
	return Math.max(10_000, Math.floor((usoAnterior * 0.9) / 10_000) * 10_000);
}

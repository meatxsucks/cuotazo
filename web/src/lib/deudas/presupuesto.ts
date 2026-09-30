// Pagos fijos por mes y sobres
import type { Anotacion, EstadoSobre, Movimiento, PagoFijo, Sobre } from '$lib/datos/tipos';
import { diaSemana, diasEntre, finDeMes, mesDe, sumarDias } from '$lib/fechas';

export const SEMANAS_POR_MES = 52 / 12;

/** Vigente en el mes: activo, dentro de desde/hasta y sin pausa ese mes */
export function pagoFijoVigente(p: PagoFijo, mes: string, respetarPausas = true): boolean {
	if (!p.activo) return false;
	if (mesDe(p.desde) > mes) return false;
	if (p.hasta && mesDe(p.hasta) < mes) return false;
	return !(respetarPausas && p.meses_pausa.includes(Number(mes.slice(5, 7))));
}

export function pagosFijosDelMes(lista: PagoFijo[], mes: string, respetarPausas = true): number {
	return lista.filter((p) => pagoFijoVigente(p, mes, respetarPausas)).reduce((s, p) => s + p.monto, 0);
}

export function mensualDeSobre(s: Pick<Sobre, 'monto' | 'periodo'>): number {
	return s.periodo === 'semana' ? Math.round(s.monto * SEMANAS_POR_MES) : s.monto;
}

export function montoParaPeriodo(mensual: number, periodo: Sobre['periodo']): number {
	return periodo === 'semana' ? Math.round(mensual / SEMANAS_POR_MES) : Math.round(mensual);
}

export function periodoSobre(periodo: Sobre['periodo'], hoy: string): { inicio: string; fin: string } {
	if (periodo === 'mes') return { inicio: mesDe(hoy), fin: finDeMes(hoy) };
	const inicio = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7));
	return { inicio, fin: sumarDias(inicio, 6) };
}

/** Réplica de la vista estado_sobre: anotado, disponible y gasto con tarjeta o cuenta sin anotar (sin contar pagos fijos) */
export function estadoSobres(sobres: Sobre[], anotaciones: Anotacion[], movimientos: Movimiento[], hoy: string, pagosFijos: PagoFijo[] = []): EstadoSobre[] {
	const esPagoFijo = (m: Movimiento) => pagosFijos.some((p) => p.activo && p.categoria === m.categoria && p.monto === Math.abs(m.monto));
	return sobres
		.filter((s) => s.activo)
		.map((s) => {
			const { inicio, fin } = periodoSobre(s.periodo, hoy);
			const propias = anotaciones.filter((a) => a.sobre_id === s.sobre_id && a.fecha >= inicio && a.fecha <= fin);
			const anotado = propias.reduce((t, a) => t + a.monto, 0);
			const anotadoBanco = propias.filter((a) => a.medio === 'debito' || a.medio === 'credito').reduce((t, a) => t + a.monto, 0);
			const banco = movimientos
				.filter(
					(m) =>
						m.categoria === s.categoria &&
						m.tipo_flujo === 'gasto' &&
						m.fecha >= inicio &&
						m.fecha <= fin &&
						(m.cuota_actual == null || m.cuota_actual === 1) &&
						!esPagoFijo(m)
				)
				.reduce((t, m) => t + Math.abs(m.monto_total_compra ?? m.monto), 0);
			return {
				sobre_id: s.sobre_id,
				periodo_inicio: inicio,
				periodo_fin: fin,
				anotado,
				disponible: s.monto - anotado,
				porcentaje: s.monto > 0 ? Math.round((1000 * anotado) / s.monto) / 10 : null,
				dias_restantes: diasEntre(hoy, fin) + 1,
				sin_anotar: Math.max(0, banco - anotadoBanco)
			};
		});
}

export interface SobreSugerido {
	nombre: string;
	categoria: string;
	periodo: Sobre['periodo'];
	esencial: boolean;
	/** mensual si no hay historia */
	porDefecto: number;
}

export const SOBRES_SUGERIDOS: SobreSugerido[] = [
	{ nombre: 'Supermercado', categoria: 'supermercado', periodo: 'semana', esencial: true, porDefecto: 320_000 },
	{ nombre: 'Bencina', categoria: 'combustible_auto', periodo: 'semana', esencial: true, porDefecto: 120_000 },
	{ nombre: 'Salud y médico', categoria: 'salud', periodo: 'mes', esencial: true, porDefecto: 60_000 },
	{ nombre: 'Actividades de los hijos', categoria: 'educacion', periodo: 'mes', esencial: true, porDefecto: 50_000 },
	{ nombre: 'Respiros', categoria: 'restaurantes_delivery', periodo: 'semana', esencial: false, porDefecto: 80_000 }
];

export const totalFilas = (filas: { monto: number; veces: number }[]) => filas.reduce((s, f) => s + f.monto * f.veces, 0);

/** Nivel de avance para colorear: ok bajo 80%, aviso hasta 100%, excedido desde 100% */
export function nivelSobre(porcentaje: number | null): 'ok' | 'aviso' | 'excedido' {
	if (porcentaje == null) return 'ok';
	return porcentaje >= 100 ? 'excedido' : porcentaje >= 80 ? 'aviso' : 'ok';
}

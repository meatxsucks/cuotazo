// Textos y formato de las alertas de presupuesto
import { CATEGORIAS_GASTO, nombreCategoria } from './categorias';
import type { EstadoAlerta, PresupuestoEntrada, TipoPresupuesto } from '@/datos/tipos';
import { clp, porcentaje } from './formato';

export const TIPOS: { id: TipoPresupuesto; nombre: string; descripcion: string }[] = [
	{ id: 'categoria', nombre: 'Por categoría', descripcion: 'Límite de gasto mensual en una categoría' },
	{ id: 'total', nombre: 'Gasto total', descripcion: 'Todo lo que gastas en el mes, con intereses y comisiones' },
	{ id: 'compras_credito', nombre: 'Compras en cuotas', descripcion: 'Tope de compras nuevas en cuotas con tarjeta' },
	{ id: 'carga_cuotas', nombre: 'Carga de cuotas', descripcion: 'Máximo de tu ingreso que se va en cuotas y dividendos' }
];

export const ESTADOS: Record<EstadoAlerta, { texto: string; clase: string; orden: number }> = {
	excedido: { texto: 'Excedido', clase: 'negativo', orden: 0 },
	aviso: { texto: 'Umbral cruzado', clase: 'aviso', orden: 1 },
	pronostico_excede: { texto: 'Se pasará', clase: 'pronostico', orden: 2 },
	ok: { texto: 'En rango', clase: 'ok', orden: 3 }
};

export function nombrePresupuesto(tipo: TipoPresupuesto, categoria: string | null): string {
	if (tipo === 'categoria' && categoria) return nombreCategoria(categoria);
	return TIPOS.find((t) => t.id === tipo)?.nombre ?? tipo;
}

export function valorAlerta(tipo: TipoPresupuesto, n: number | null | undefined): string {
	return tipo === 'carga_cuotas' ? porcentaje(n, n != null && Number.isInteger(n) ? 0 : 1) : clp(n);
}

export function hayAlerta(estado: EstadoAlerta): boolean {
	return estado !== 'ok';
}

export function entero(v: string | null | undefined): number {
	return Number(String(v ?? '').replace(/\D/g, ''));
}

export function leerUmbrales(v: string): number[] | null {
	const partes = v.split(/[,;\s]+/).filter(Boolean);
	const numeros = [...new Set(partes.map(Number))].sort((a, b) => a - b);
	if (!numeros.length || numeros.length > 5 || numeros.some((n) => !Number.isInteger(n) || n < 1 || n > 200)) return null;
	return numeros;
}

export interface CamposAlerta {
	presupuesto_id: string | null;
	tipo: TipoPresupuesto;
	categoria: string;
	monto: string;
	porcentaje: string;
	umbrales: string;
	vigencia: string;
	alerta_pronostico: boolean;
}

// Valida el formulario y arma el presupuesto; devuelve un texto si hay error
export function leerPresupuesto(f: CamposAlerta): PresupuestoEntrada | string {
	if (!TIPOS.some((t) => t.id === f.tipo)) return 'Elige qué quieres vigilar.';
	const categoria = f.tipo === 'categoria' ? f.categoria : null;
	if (f.tipo === 'categoria' && !CATEGORIAS_GASTO.some((c) => c.id === categoria)) return 'Elige una categoría.';
	let monto_limite: number | null = null;
	let porcentaje_limite: number | null = null;
	if (f.tipo === 'carga_cuotas') {
		porcentaje_limite = Math.round(Number(f.porcentaje.replace(',', '.')) * 100) / 100;
		if (!(porcentaje_limite > 0 && porcentaje_limite <= 100)) return 'El porcentaje debe estar entre 1 y 100.';
	} else {
		monto_limite = entero(f.monto);
		if (!monto_limite || monto_limite > 1_000_000_000) return 'Escribe un monto mayor a cero.';
	}
	const umbrales = leerUmbrales(f.umbrales);
	if (!umbrales) return 'Los umbrales van entre 1 y 200, separados por coma (máximo 5).';
	if (f.vigencia && !/^\d{4}-\d{2}-01$/.test(f.vigencia)) return 'Vigencia inválida.';
	return {
		presupuesto_id: f.presupuesto_id,
		tipo: f.tipo,
		categoria,
		mes: f.vigencia || null,
		monto_limite,
		porcentaje_limite,
		umbrales,
		alerta_pronostico: f.alerta_pronostico
	};
}

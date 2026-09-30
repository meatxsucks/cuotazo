// Réplica en TypeScript de las vistas de 0002_alertas_presupuesto.sql para el modo demo
import type {
	CreditoMes,
	DeudaCuotaMes,
	EstadoPresupuesto,
	GastoDiario,
	LiberacionCuota,
	Movimiento,
	Perfil,
	PlanAjuste,
	PlanCategoria,
	Presupuesto,
	PresupuestoSugerido,
	ResumenMensual
} from '@/datos/tipos';
import { diasEnMes, mesDe, sumarMeses } from '@/lib/fechas';

export interface BaseCalculo {
	movimientos: Movimiento[];
	gastoDiario: GastoDiario[];
	resumen: ResumenMensual[];
	cuotas: DeudaCuotaMes[];
	presupuestos: Presupuesto[];
	perfil: Perfil | null;
}

export const FIJOS = ['vivienda_servicios', 'seguros', 'salud', 'educacion', 'suscripciones_recurrentes', 'intereses_comisiones_impuestos'];
export const VARIABLES = [
	'supermercado', 'restaurantes_delivery', 'transporte', 'combustible_auto', 'hogar', 'vestuario', 'tecnologia',
	'viajes', 'mascotas', 'transferencias_personas', 'sin_categoria', 'entretenimiento_suscripciones'
];
export const ESENCIALES = ['supermercado', 'transporte', 'combustible_auto'];

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const redondear = (n: number, decimales = 0) => Math.round(n * 10 ** decimales) / 10 ** decimales;
const aMiles = (n: number) => Math.round(n / 1000) * 1000;
const milesAbajo = (n: number) => Math.floor(n / 1000) * 1000;
const enMes = (fecha: string, mes: string) => mesDe(fecha) === mes;

function ingresoDetectado(b: BaseCalculo, antesDe: string): number | null {
	const filas = b.resumen
		.filter((r) => r.mes < antesDe && r.ingresos > 0)
		.sort((x, y) => y.mes.localeCompare(x.mes))
		.slice(0, 3);
	return filas.length ? Math.round(suma(filas.map((r) => r.ingresos)) / filas.length) : null;
}

function ingresoReferencia(b: BaseCalculo, antesDe: string): number | null {
	return b.perfil?.ingreso_mensual_neto ?? ingresoDetectado(b, antesDe);
}

function cuotasDe(b: BaseCalculo, mes: string, tipo?: string): number {
	return suma(b.cuotas.filter((c) => c.mes === mes && (!tipo || c.tipo === tipo)).map((c) => c.monto));
}

function enVentana(mes: string, hoy: string): boolean {
	const actual = mesDe(hoy);
	return mes <= actual && mes >= sumarMeses(actual, -5);
}

export function creditoMes(b: BaseCalculo, mes: string, hoy: string): CreditoMes | null {
	if (!enVentana(mes, hoy)) return null;
	const compras = b.movimientos.filter(
		(m) =>
			m.producto_tipo === 'tarjeta' &&
			m.tipo_flujo === 'gasto' &&
			(m.cuotas_total ?? 0) > 1 &&
			((m.cuota_actual === 1 && enMes(m.fecha_imputacion, mes)) || (m.cuota_actual == null && enMes(m.fecha, mes)))
	);
	const cuotas = cuotasDe(b, mes);
	const ingreso = ingresoReferencia(b, mes);
	return {
		mes,
		compras_cuotas_monto: suma(compras.map((m) => Math.abs(m.monto_total_compra ?? m.monto))),
		compras_cuotas_cantidad: compras.length,
		cuotas_mes: cuotas,
		ingreso_referencia: ingreso,
		carga_porcentaje: ingreso ? redondear((100 * cuotas) / ingreso, 1) : null
	};
}

export function estadoPresupuestos(b: BaseCalculo, mes: string, hoy: string): EstadoPresupuesto[] {
	const credito = creditoMes(b, mes, hoy);
	if (!credito) return [];
	const actual = mesDe(hoy);
	const gasto = b.gastoDiario.filter((g) => enMes(g.fecha, mes));
	const aplicables = b.presupuestos.filter(
		(p) =>
			p.mes === mes ||
			(p.mes === null && !b.presupuestos.some((e) => e.tipo === p.tipo && e.categoria === p.categoria && e.mes === mes))
	);
	return aplicables.map((p) => {
		const limite = p.monto_limite ?? p.porcentaje_limite ?? 0;
		const consumido =
			p.tipo === 'categoria'
				? suma(gasto.filter((g) => g.categoria === p.categoria).map((g) => g.monto_gasto))
				: p.tipo === 'total'
					? suma(gasto.map((g) => g.monto_gasto))
					: p.tipo === 'compras_credito'
						? credito.compras_cuotas_monto
						: credito.carga_porcentaje;
		const enCurso = mes === actual;
		const porcentaje = consumido != null && limite > 0 ? redondear((100 * consumido) / limite, 1) : null;
		const proyectado =
			!enCurso || consumido == null
				? null
				: p.tipo === 'carga_cuotas'
					? consumido
					: Math.round((consumido * diasEnMes(mes)) / Number(hoy.slice(8)));
		const cruzados = porcentaje == null ? [] : p.umbrales.filter((u) => porcentaje >= u);
		const umbral = cruzados.length ? Math.max(...cruzados) : null;
		const excede = p.alerta_pronostico && enCurso && proyectado != null && proyectado > limite;
		const estado =
			consumido != null && consumido > 0 && consumido >= limite ? 'excedido' : umbral != null ? 'aviso' : excede ? 'pronostico_excede' : 'ok';
		return {
			presupuesto_id: p.presupuesto_id,
			tipo: p.tipo,
			categoria: p.categoria,
			mes,
			recurrente: p.mes === null,
			limite,
			consumido,
			porcentaje,
			proyectado_cierre: proyectado,
			umbral_cruzado: umbral,
			excede_pronostico: excede,
			estado,
			umbrales: [...p.umbrales],
			alerta_pronostico: p.alerta_pronostico,
			monto_limite: p.monto_limite,
			porcentaje_limite: p.porcentaje_limite,
			cantidad: p.tipo === 'compras_credito' ? credito.compras_cuotas_cantidad : null,
			cuotas_mes: p.tipo === 'carga_cuotas' ? credito.cuotas_mes : null,
			ingreso_referencia: p.tipo === 'carga_cuotas' ? credito.ingreso_referencia : null
		};
	});
}

export function presupuestosSugeridos(b: BaseCalculo, hoy: string): PresupuestoSugerido[] {
	const actual = mesDe(hoy);
	const desde = sumarMeses(actual, -3);
	const gasto = b.gastoDiario.filter((g) => g.fecha >= desde && g.fecha < actual);
	const meses = new Set(gasto.map((g) => mesDe(g.fecha))).size;
	if (!meses) return [];
	const porCategoria = new Map<string, number>();
	for (const g of gasto) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.monto_gasto);
	const lista: PresupuestoSugerido[] = [...porCategoria].map(([categoria, monto]) => ({
		tipo: 'categoria',
		categoria,
		monto_sugerido: aMiles(monto / meses),
		porcentaje_sugerido: null,
		meses_base: meses
	}));
	lista.push({ tipo: 'total', categoria: null, monto_sugerido: aMiles(suma(gasto.map((g) => g.monto_gasto)) / meses), porcentaje_sugerido: null, meses_base: meses });
	const compras = [1, 2, 3].map((i) => creditoMes(b, sumarMeses(actual, -i), hoy)?.compras_cuotas_monto ?? 0);
	lista.push({ tipo: 'compras_credito', categoria: null, monto_sugerido: aMiles(suma(compras) / meses), porcentaje_sugerido: null, meses_base: meses });
	const carga = creditoMes(b, actual, hoy)?.carga_porcentaje;
	if (carga != null) lista.push({ tipo: 'carga_cuotas', categoria: null, monto_sugerido: null, porcentaje_sugerido: Math.round(carga), meses_base: null });
	return lista.filter((s) => (s.monto_sugerido ?? s.porcentaje_sugerido ?? 0) > 0);
}

export interface GrupoGasto {
	grupo: string;
	promedio: number;
	gastado_mes: number;
	meses_base: number;
}

export function gastoReferencia(b: BaseCalculo, hoy: string): GrupoGasto[] {
	const actual = mesDe(hoy);
	const desde = sumarMeses(actual, -3);
	const hasta = sumarMeses(actual, 1);
	const mov = b.movimientos
		.filter(
			(m) =>
				(m.tipo_flujo === 'gasto' || m.tipo_flujo === 'interes_comision') &&
				(m.cuotas_total ?? 1) <= 1 &&
				m.fecha_imputacion >= desde &&
				m.fecha_imputacion < hasta
		)
		.map((m) => ({
			categoria: m.categoria,
			origen: m.comercio ?? m.glosa ?? '',
			mes: mesDe(m.fecha_imputacion),
			monto: -m.monto,
			enCurso: mesDe(m.fecha_imputacion) === actual
		}));
	const cerrados = mov.filter((m) => !m.enCurso);
	const meses = new Set(cerrados.map((m) => m.mes)).size;
	const mesesPorOrigen = new Map<string, Set<string>>();
	for (const m of cerrados) {
		if (m.categoria !== 'entretenimiento_suscripciones') continue;
		const s = mesesPorOrigen.get(m.origen) ?? new Set<string>();
		s.add(m.mes);
		mesesPorOrigen.set(m.origen, s);
	}
	const grupos = new Map<string, { cerrado: number; mes: number }>();
	for (const m of mov) {
		const recurrente = m.categoria === 'entretenimiento_suscripciones' && (mesesPorOrigen.get(m.origen)?.size ?? 0) >= 2;
		const grupo = recurrente ? 'suscripciones_recurrentes' : m.categoria;
		const g = grupos.get(grupo) ?? { cerrado: 0, mes: 0 };
		if (m.enCurso) g.mes += m.monto;
		else g.cerrado += m.monto;
		grupos.set(grupo, g);
	}
	return [...grupos].map(([grupo, g]) => ({
		grupo,
		promedio: meses ? Math.round(g.cerrado / meses) : 0,
		gastado_mes: g.mes,
		meses_base: meses
	}));
}

export function planAjuste(b: BaseCalculo, hoy: string): PlanAjuste[] {
	const actual = mesDe(hoy);
	const grupos = gastoReferencia(b, hoy);
	const sumar = (lista: string[], campo: 'promedio' | 'gastado_mes') => suma(grupos.filter((g) => lista.includes(g.grupo)).map((g) => g[campo]));
	const fijos = sumar(FIJOS, 'promedio');
	const vivienda = sumar(['vivienda_servicios'], 'promedio');
	const esenciales = suma(grupos.filter((g) => ESENCIALES.includes(g.grupo)).map((g) => milesAbajo(0.9 * g.promedio)));
	const detectado = ingresoDetectado(b, actual);
	const ingreso = b.perfil?.ingreso_mensual_neto ?? detectado;
	const meta = b.perfil?.meta_ahorro_mensual ?? 0;
	const tope = b.perfil?.tope_carga_cuotas_pct ?? 30;
	return [actual, sumarMeses(actual, 1)].map((mes) => {
		const enCurso = mes === actual;
		const compromisos = cuotasDe(b, mes);
		const gastosFijos = Math.max(fijos - Math.min(cuotasDe(b, mes, 'hipotecario'), vivienda), 0);
		const disponible = ingreso == null ? null : ingreso - compromisos - gastosFijos - meta;
		const gastado = enCurso ? sumar(VARIABLES, 'gastado_mes') : 0;
		const siguiente = cuotasDe(b, sumarMeses(mes, 1));
		const carga = ingreso ? redondear((100 * siguiente) / ingreso, 1) : null;
		return {
			mes,
			en_curso: enCurso,
			ingreso_referencia: ingreso,
			ingreso_declarado: b.perfil?.ingreso_mensual_neto != null,
			ingreso_detectado: detectado,
			compromisos,
			gastos_fijos: gastosFijos,
			meta_ahorro: meta,
			disponible_variable: disponible,
			gasto_variable_mes: gastado,
			restante_variable: disponible == null ? null : disponible - gastado,
			gasto_variable_promedio: sumar(VARIABLES, 'promedio'),
			esenciales_objetivo: esenciales,
			alcanza_esenciales: disponible == null ? null : disponible >= esenciales,
			compromisos_mes_siguiente: siguiente,
			carga_mes_siguiente_pct: carga,
			tope_carga_cuotas_pct: tope,
			compras_credito_sugerido:
				ingreso == null ? null : carga != null && carga > tope ? 0 : Math.max(Math.round((ingreso * tope) / 100) - siguiente, 0)
		};
	});
}

export function planCategorias(b: BaseCalculo, hoy: string): PlanCategoria[] {
	const cats = gastoReferencia(b, hoy)
		.filter((g) => VARIABLES.includes(g.grupo) && g.promedio > 0)
		.map((g) => ({ ...g, esencial: ESENCIALES.includes(g.grupo), tope: milesAbajo(0.9 * g.promedio) }));
	const esenciales = suma(cats.filter((c) => c.esencial).map((c) => c.tope));
	const discrecionales = suma(cats.filter((c) => !c.esencial).map((c) => c.tope));
	const actual = mesDe(hoy);
	const suscripciones = gastoReferencia(b, hoy).find((g) => g.grupo === 'suscripciones_recurrentes')?.promedio ?? 0;
	// Cuotas de compras anteriores ya imputadas este mes: la alerta por categoría las cuenta
	const comprometido = (categoria: string) =>
		suma(
			b.movimientos
				.filter((m) => m.tipo_flujo === 'gasto' && (m.cuotas_total ?? 0) > 1 && m.categoria === categoria && enMes(m.fecha_imputacion, actual))
				.map((m) => -m.monto)
		) + (categoria === 'entretenimiento_suscripciones' ? suscripciones : 0);
	return planAjuste(b, hoy).flatMap((p) =>
		cats
			.map((c) => {
				const disponible = p.disponible_variable ?? esenciales + discrecionales;
				const factor = discrecionales > 0 ? Math.min(1, Math.max(disponible - esenciales, 0) / discrecionales) : 0;
				const limite = c.esencial ? c.tope : milesAbajo(c.tope * factor);
				return {
					mes: p.mes,
					categoria: c.grupo,
					esencial: c.esencial,
					promedio: c.promedio,
					gastado_mes: p.en_curso ? c.gastado_mes : 0,
					limite_sugerido: limite,
					recorte: c.promedio - limite,
					recorte_pct: redondear((100 * (c.promedio - limite)) / c.promedio, 1),
					comprometido: comprometido(c.grupo),
					limite_alerta: limite + comprometido(c.grupo)
				};
			})
			.sort((x, y) => y.promedio - x.promedio)
	);
}

export function liberacionCuotas(b: BaseCalculo, hoy: string): LiberacionCuota[] {
	const actual = mesDe(hoy);
	const futuras = b.cuotas.filter((c) => c.mes >= actual).map((c) => c.mes);
	if (!futuras.length) return [];
	const ultimo = futuras.reduce((a, x) => (x > a ? x : a));
	const ingreso = ingresoReferencia(b, actual);
	const tope = b.perfil?.tope_carga_cuotas_pct ?? 30;
	const filas: Omit<LiberacionCuota, 'mes_bajo_tope'>[] = [];
	for (let mes = actual; mes <= ultimo; mes = sumarMeses(mes, 1)) {
		const compromisos = cuotasDe(b, mes);
		const carga = ingreso ? redondear((100 * compromisos) / ingreso, 1) : null;
		filas.push({ mes, compromisos, ingreso_referencia: ingreso, carga_pct: carga, tope_carga_cuotas_pct: tope, bajo_tope: carga == null ? null : carga <= tope });
	}
	const sobre = filas.filter((f) => f.carga_pct != null && f.carga_pct > tope).map((f) => f.mes);
	const ultimoSobre = sobre.length ? sobre[sobre.length - 1] : null;
	const mesBajo = ingreso == null ? null : ultimoSobre == null ? actual : ultimoSobre < ultimo ? sumarMeses(ultimoSobre, 1) : null;
	return filas.map((f) => ({ ...f, mes_bajo_tope: mesBajo }));
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { unirDeudas } from '$lib/caja';
import { frecuentes } from '$lib/mes';
import { ErrorDuplicado, ErrorNoDisponible } from './index';
import type {
	Anotacion,
	CajaCiclo,
	CajaResumen,
	Compra,
	DeudaManual,
	DeudaProducto,
	DeudaTodas,
	FiltroMovimientos,
	FuenteDatos,
	LoQueViene,
	Movimiento,
	PagoCiclo,
	PagoFijo,
	Producto,
	Sobre
} from './tipos';

const LOTE = 1000;

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null; count?: number | null }>;

async function todas<T>(consulta: (desde: number, hasta: number) => Respuesta<T>): Promise<T[]> {
	const filas: T[] = [];
	for (let desde = 0; ; desde += LOTE) {
		const { data, error } = await consulta(desde, desde + LOTE - 1);
		if (error) {
			if (falta(error)) throw new ErrorNoDisponible(error.message);
			throw new Error(error.message);
		}
		filas.push(...(data ?? []));
		if (!data || data.length < LOTE) return filas;
	}
}

type ErrorPg = { message: string; code?: string };

const CODIGOS_FALTA = new Set(['PGRST205', 'PGRST204', 'PGRST200', '42P01', '42703']);

// La tabla, vista o columna aún no existe (migración pendiente)
function falta(error: ErrorPg): boolean {
	return CODIGOS_FALTA.has(error.code ?? '') || /does not exist|could not find|schema cache/i.test(error.message);
}

function revisar(error: ErrorPg | null) {
	if (!error) return;
	if (error.code === '23505') throw new ErrorDuplicado(error.message);
	if (falta(error) || error.code === '23514') throw new ErrorNoDisponible(error.message);
	throw new Error(error.message);
}

// Lee todas las filas; null si el objeto no existe todavía
async function opcional<T>(consulta: (desde: number, hasta: number) => Respuesta<T>): Promise<T[] | null> {
	try {
		return await todas(consulta);
	} catch (e) {
		if (e instanceof ErrorNoDisponible) return null;
		throw e;
	}
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const texto = (v: unknown): string | null => (v == null ? null : String(v));

function limpiarBusqueda(t: string): string {
	return t.replace(/[,()%*\\]/g, ' ').trim();
}

// RLS resuelve el usuario desde auth.uid(); aquí no se filtra por usuario_id
export function crearFuenteSupabase(supabase: SupabaseClient): FuenteDatos {
	const db = supabase.schema('finanzas');
	let usuarioId: string | null = null;

	function movimientos(f: FiltroMovimientos, conteo: boolean) {
		let q = db.from('movimiento').select('*', conteo ? { count: 'exact' } : undefined);
		if (f.desde) q = q.gte('fecha_imputacion', f.desde);
		if (f.hasta) q = q.lte('fecha_imputacion', f.hasta);
		if (f.banco) q = q.eq('banco', f.banco);
		if (f.producto) q = q.eq('producto_nombre', f.producto);
		if (f.categoria) q = q.eq('categoria', f.categoria);
		if (f.tipo_flujo) q = q.eq('tipo_flujo', f.tipo_flujo);
		if (f.estado) q = q.eq('estado', f.estado);
		const t = f.texto ? limpiarBusqueda(f.texto) : '';
		if (t) q = q.or(`glosa.ilike.*${t}*,comercio.ilike.*${t}*`);
		return q.order('fecha_imputacion', { ascending: false }).order('fecha', { ascending: false }).order('movimiento_id', { ascending: false });
	}

	const fuente: FuenteDatos = {
		async usuario() {
			const { data, error } = await db.from('usuario').select('usuario_id, nombre_visible').limit(1).maybeSingle();
			if (error) throw new Error(error.message);
			usuarioId = data?.usuario_id ?? null;
			return data;
		},
		async resumenMensual(desde, hasta) {
			return todas((a, b) => db.from('resumen_mensual').select('*').gte('mes', desde).lte('mes', hasta).order('mes').range(a, b));
		},
		async gastoDiario(desde, hasta) {
			return todas((a, b) => db.from('gasto_diario').select('fecha, categoria, monto_gasto, cantidad').gte('fecha', desde).lte('fecha', hasta).order('fecha').range(a, b));
		},
		async movimientos(f) {
			if (!f.limite) {
				const filas = await todas<Movimiento>((a, b) => movimientos(f, false).range(a, b));
				return { filas, total: filas.length };
			}
			const desde = f.desplazamiento ?? 0;
			const { data, error, count } = await movimientos(f, true).range(desde, desde + f.limite - 1);
			if (error) throw new Error(error.message);
			return { filas: (data ?? []) as Movimiento[], total: count ?? 0 };
		},
		async productos() {
			const filas = await todas<Producto>((a, b) => db.from('movimiento').select('banco, producto_tipo, producto_nombre').range(a, b));
			const vistos = new Map<string, Producto>();
			for (const p of filas) vistos.set(`${p.banco}|${p.producto_nombre}`, p);
			return [...vistos.values()];
		},
		async deudas() {
			return todas((a, b) => db.from('deuda_producto').select('*').order('tipo').range(a, b));
		},
		async cuotasMes(desde, hasta) {
			return todas((a, b) => db.from('deuda_cuota_mes').select('mes, banco, tipo, nombre, monto').gte('mes', desde).lte('mes', hasta).order('mes').range(a, b));
		},
		async saldos() {
			return todas((a, b) => db.from('saldo_cuenta').select('banco, producto_nombre, saldo_disponible, actualizado').range(a, b));
		},
		async publicaciones() {
			return todas((a, b) => db.from('publicacion').select('tabla, publicado_en, filas').range(a, b));
		},
		async presupuestos() {
			return todas((a, b) =>
				db
					.from('presupuesto')
					.select('presupuesto_id, tipo, categoria, mes, monto_limite, porcentaje_limite, umbrales, alerta_pronostico')
					.order('presupuesto_id')
					.range(a, b)
			);
		},
		async guardarPresupuesto(p) {
			const { presupuesto_id, ...campos } = p;
			if (presupuesto_id) {
				const { error } = await db.from('presupuesto').update(campos).eq('presupuesto_id', presupuesto_id);
				return revisar(error);
			}
			const id = usuarioId ?? (await fuente.usuario())?.usuario_id;
			if (!id) throw new Error('Usuario sin datos vinculados');
			const { error } = await db.from('presupuesto').insert({ usuario_id: id, ...campos });
			revisar(error);
		},
		async borrarPresupuesto(presupuestoId) {
			const { error } = await db.from('presupuesto').delete().eq('presupuesto_id', presupuestoId);
			revisar(error);
		},
		async estadoPresupuestos(mes) {
			return todas((a, b) => db.from('estado_presupuesto').select('*').eq('mes', mes).order('presupuesto_id').range(a, b));
		},
		async presupuestosSugeridos() {
			return todas((a, b) =>
				db.from('presupuesto_sugerido').select('tipo, categoria, monto_sugerido, porcentaje_sugerido, meses_base').range(a, b)
			);
		},
		async creditoMes(mes) {
			const { data, error } = await db.from('credito_mes').select('*').eq('mes', mes).maybeSingle();
			revisar(error);
			return data;
		},
		async perfil() {
			const { data, error } = await db
				.from('perfil')
				.select('ingreso_mensual_neto, dia_pago, meta_ahorro_mensual, tope_carga_cuotas_pct, actualizado')
				.maybeSingle();
			revisar(error);
			return data;
		},
		async guardarPerfil(p) {
			const id = usuarioId ?? (await fuente.usuario())?.usuario_id;
			if (!id) throw new Error('Usuario sin datos vinculados');
			const { error } = await db
				.from('perfil')
				.upsert({ usuario_id: id, ...p, actualizado: new Date().toISOString() }, { onConflict: 'usuario_id' });
			revisar(error);
		},
		async planAjuste() {
			return todas((a, b) => db.from('plan_ajuste').select('*').order('mes').range(a, b));
		},
		async planCategorias() {
			return todas((a, b) => db.from('plan_ajuste_categoria').select('*').order('mes').order('promedio', { ascending: false }).range(a, b));
		},
		async liberacionCuotas() {
			return todas((a, b) => db.from('liberacion_cuotas').select('*').order('mes').range(a, b));
		},
		async cajaResumen() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('caja_resumen').select('*').order('ciclo', { ascending: false }).range(a, b));
			return filas?.map(normalizarCaja) ?? null;
		},
		async cajaCiclo(desde) {
			return opcional<CajaCiclo>((a, b) => db.from('caja_ciclo').select('*').gte('ciclo', desde).order('ciclo').range(a, b));
		},
		async loQueViene() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('lo_que_viene').select('*').range(a, b));
			return filas?.map(normalizarCompromiso) ?? null;
		},
		async deudasTodas() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('deudas_todas').select('*').range(a, b));
			if (filas) return filas.map(normalizarDeuda).filter((d) => d.saldo_clp > 0);
			const [deudas, manuales] = await Promise.all([fuente.deudas(), fuente.deudasManuales()]);
			return unirDeudas(deudas as DeudaProducto[], manuales ?? []);
		},
		async pagosFijos() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('pago_fijo').select('*').order('dia_vencimiento').range(a, b));
			return filas?.map(normalizarPagoFijo) ?? null;
		},
		async guardarPagoFijo(p) {
			const { pago_fijo_id, ...campos } = p;
			return guardar('pago_fijo', 'pago_fijo_id', pago_fijo_id, campos);
		},
		async borrarPagoFijo(id) {
			const { error } = await db.from('pago_fijo').delete().eq('pago_fijo_id', id);
			revisar(error);
		},
		async deudasManuales() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('deuda_manual').select('*').order('nombre').range(a, b));
			return filas?.map(normalizarDeudaManual) ?? null;
		},
		async guardarDeudaManual(d) {
			const { deuda_manual_id, ...campos } = d;
			return guardar('deuda_manual', 'deuda_manual_id', deuda_manual_id, campos);
		},
		async borrarDeudaManual(id) {
			const { error } = await db.from('deuda_manual').delete().eq('deuda_manual_id', id);
			revisar(error);
		},
		async sobres() {
			const filas = await opcional<Record<string, unknown>>((a, b) => db.from('sobre').select('*').order('orden').range(a, b));
			return filas?.map(normalizarSobre) ?? null;
		},
		async guardarSobre(x) {
			const { sobre_id, ...campos } = x;
			return guardar('sobre', 'sobre_id', sobre_id, campos);
		},
		async borrarSobre(id) {
			const { error } = await db.from('sobre').delete().eq('sobre_id', id);
			revisar(error);
		},
		async anotaciones(desde, hasta) {
			const filas = await opcional<Record<string, unknown>>((a, b) =>
				db.from('anotacion').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).range(a, b)
			);
			return filas?.map(normalizarAnotacion) ?? null;
		},
		async guardarAnotacion(x) {
			const id = usuarioId ?? (await fuente.usuario())?.usuario_id;
			if (!id) throw new Error('Usuario sin datos vinculados');
			const { data, error } = await db.from('anotacion').insert({ usuario_id: id, ...x }).select('anotacion_id').single();
			revisar(error);
			return String((data as { anotacion_id: string }).anotacion_id);
		},
		async borrarAnotacion(id) {
			const { error } = await db.from('anotacion').delete().eq('anotacion_id', id);
			revisar(error);
		},
		async estadoSobres() {
			return opcional((a, b) => db.from('estado_sobre').select('*').range(a, b));
		},
		async pagosCiclo() {
			const filas = await opcional<Record<string, unknown>>((a, b) =>
				db.from('pagos_ciclo').select('*').order('ciclo').order('fecha', { nullsFirst: false }).order('nombre').range(a, b)
			);
			return filas?.map(normalizarPagoCiclo) ?? null;
		},
		async marcarPago(ciclo, clave, pagado) {
			const { error } =
				pagado == null
					? await db.from('pago_marcado').delete().eq('ciclo', ciclo).eq('clave', clave)
					: await db
							.from('pago_marcado')
							.upsert({ usuario_id: await miId(), ciclo, clave, pagado, actualizado: new Date().toISOString() }, { onConflict: 'usuario_id,ciclo,clave' });
			revisar(error);
		},
		async compras(desde) {
			const filas = await opcional<Record<string, unknown>>((a, b) =>
				db.from('compra').select('*, compra_item(*)').or(`abierta.eq.true,creada.gte.${desde}`).order('creada', { ascending: false }).range(a, b)
			);
			return filas?.map(normalizarCompra) ?? null;
		},
		async crearCompra(sobreId, lugar) {
			const { data, error } = await db.from('compra').insert({ usuario_id: await miId(), sobre_id: sobreId, lugar }).select('compra_id').single();
			revisar(error);
			return String((data as { compra_id: string }).compra_id);
		},
		async agregarItem(compraId, item) {
			const { error } = await db.from('compra_item').insert({ usuario_id: await miId(), compra_id: compraId, ...item });
			revisar(error);
		},
		async borrarItem(itemId) {
			const { error } = await db.from('compra_item').delete().eq('item_id', itemId);
			revisar(error);
		},
		async cerrarCompra(compraId, medio) {
			const { error } = await db.rpc('cerrar_compra', { p_compra: compraId, p_medio: medio });
			revisar(error);
		},
		async descartarCompra(compraId) {
			const { error } = await db.from('compra').delete().eq('compra_id', compraId).eq('abierta', true);
			revisar(error);
		},
		async itemsFrecuentes() {
			const filas =
				(await opcional<Record<string, unknown>>((a, b) =>
					db.from('compra_item').select('nombre, precio, creado').order('creado', { ascending: false }).range(a, Math.min(b, a + 499))
				)) ?? [];
			return frecuentes(filas.map((r) => ({ nombre: String(r.nombre), precio: num(r.precio) ?? 0 })));
		}
	};

	async function miId(): Promise<string> {
		const id = usuarioId ?? (await fuente.usuario())?.usuario_id;
		if (!id) throw new Error('Usuario sin datos vinculados');
		return id;
	}

	async function guardar(tabla: string, clave: string, id: string | null, campos: Record<string, unknown>) {
		if (id) {
			const { error } = await db.from(tabla).update(campos).eq(clave, id);
			return revisar(error);
		}
		const usuario = usuarioId ?? (await fuente.usuario())?.usuario_id;
		if (!usuario) throw new Error('Usuario sin datos vinculados');
		const { error } = await db.from(tabla).insert({ usuario_id: usuario, ...campos });
		revisar(error);
	}
	return fuente;
}

function normalizarCaja(r: Record<string, unknown>): CajaResumen {
	const linea = r.financiado_con_linea;
	return {
		...(r as unknown as CajaResumen),
		datos_completos: r.datos_completos !== false,
		alerta_tarjeta_con_linea: r.alerta_tarjeta_con_linea === true || linea === true || (typeof linea === 'number' && linea > 0),
		monto_tarjeta_con_linea: num(r.monto_tarjeta_con_linea) ?? (typeof linea === 'number' ? linea : null)
	};
}

function normalizarPagoCiclo(r: Record<string, unknown>): PagoCiclo {
	return {
		...(r as unknown as PagoCiclo),
		monto: num(r.monto) ?? 0,
		monto_minimo: num(r.monto_minimo),
		pagado_banco: num(r.pagado_banco) ?? 0,
		por_pagar: num(r.por_pagar) ?? 0,
		por_pagar_minimo: num(r.por_pagar_minimo) ?? 0,
		comprometido: num(r.comprometido) ?? 0,
		marcado: r.marcado == null ? null : r.marcado === true
	};
}

function normalizarCompra(r: Record<string, unknown>): Compra {
	const items = (r.compra_item as Record<string, unknown>[] | null) ?? [];
	return {
		compra_id: String(r.compra_id),
		sobre_id: String(r.sobre_id),
		lugar: String(r.lugar),
		abierta: r.abierta === true,
		creada: String(r.creada),
		cerrada: texto(r.cerrada),
		items: items
			.map((i) => ({ item_id: String(i.item_id), nombre: String(i.nombre), cantidad: num(i.cantidad) ?? 1, precio: num(i.precio) ?? 0, creado: String(i.creado) }))
			.sort((a, b) => a.creado.localeCompare(b.creado))
			.map(({ creado: _, ...i }) => i)
	};
}

function normalizarCompromiso(r: Record<string, unknown>): LoQueViene {
	return {
		fecha: texto(r.fecha ?? r.fecha_pago ?? r.vencimiento),
		origen: String(r.origen ?? 'otro'),
		nombre: String(r.nombre ?? r.detalle ?? ''),
		detalle: texto(r.detalle ?? r.concepto),
		monto: Math.abs(num(r.monto) ?? 0),
		monto_minimo: num(r.monto_minimo ?? r.pago_minimo),
		disponible_para_vivir_ajustado: num(r.disponible_para_vivir_ajustado)
	};
}

function normalizarDeuda(r: Record<string, unknown>): DeudaTodas {
	const origen = r.origen === 'manual' ? 'manual' : 'banco';
	const manualId = texto(r.deuda_manual_id ?? (origen === 'manual' ? r.id : null));
	return {
		clave: origen === 'manual' ? `manual|${manualId}` : `banco|${r.banco ?? r.acreedor}|${r.tipo}|${r.nombre}`,
		origen,
		deuda_manual_id: manualId,
		nombre: String(r.nombre ?? ''),
		acreedor: String(r.acreedor ?? r.banco ?? ''),
		tipo: String(r.tipo ?? 'otro'),
		saldo_clp: Math.round(num(r.saldo_clp) ?? 0),
		tasa_mensual: num(r.tasa_mensual),
		cuota_minima: num(r.cuota_minima),
		// Sin cuota_fija en la vista, los créditos en cuotas usan su cuota mínima como cuota fija
		cuota_fija: num(r.cuota_fija) ?? (['consumo', 'hipotecario', 'automotriz', 'educacion'].includes(String(r.tipo)) ? num(r.cuota_minima) : null),
		cuotas_restantes: num(r.cuotas_restantes),
		proximo_pago: texto(r.proximo_pago)
	};
}

function normalizarPagoFijo(r: Record<string, unknown>): PagoFijo {
	return {
		pago_fijo_id: String(r.pago_fijo_id ?? r.id),
		nombre: String(r.nombre ?? ''),
		categoria: String(r.categoria ?? 'sin_categoria'),
		monto: num(r.monto) ?? 0,
		dia_vencimiento: num(r.dia_vencimiento) ?? 1,
		desde: String(r.desde ?? '2000-01-01'),
		hasta: texto(r.hasta),
		meses_pausa: Array.isArray(r.meses_pausa) ? r.meses_pausa.map(Number) : [],
		activo: r.activo !== false
	};
}

function normalizarDeudaManual(r: Record<string, unknown>): DeudaManual {
	return {
		deuda_manual_id: String(r.deuda_manual_id ?? r.id),
		nombre: String(r.nombre ?? ''),
		acreedor: texto(r.acreedor),
		tipo: (r.tipo as DeudaManual['tipo']) ?? 'otro',
		saldo: num(r.saldo) ?? 0,
		tasa_mensual: num(r.tasa_mensual),
		cuota_minima: num(r.cuota_minima),
		// Sin cuota_fija en la vista, los créditos en cuotas usan su cuota mínima como cuota fija
		cuota_fija: num(r.cuota_fija) ?? (['consumo', 'hipotecario', 'automotriz', 'educacion'].includes(String(r.tipo)) ? num(r.cuota_minima) : null),
		cuotas_restantes: num(r.cuotas_restantes),
		dia_pago: num(r.dia_pago),
		proximo_pago: texto(r.proximo_pago),
		activo: r.activo !== false
	};
}

function normalizarSobre(r: Record<string, unknown>): Sobre {
	return {
		sobre_id: String(r.sobre_id ?? r.id),
		nombre: String(r.nombre ?? ''),
		categoria: String(r.categoria ?? 'sin_categoria'),
		monto: num(r.monto) ?? 0,
		periodo: r.periodo === 'mes' ? 'mes' : 'semana',
		esencial: r.esencial === true,
		orden: num(r.orden) ?? 0,
		activo: r.activo !== false
	};
}

function normalizarAnotacion(r: Record<string, unknown>): Anotacion {
	return {
		anotacion_id: String(r.anotacion_id ?? r.id),
		sobre_id: String(r.sobre_id),
		fecha: String(r.fecha).slice(0, 10),
		monto: num(r.monto) ?? 0,
		nota: texto(r.nota),
		medio: (r.medio as Anotacion['medio']) ?? 'debito',
		movimiento_id: texto(r.movimiento_id),
		creado: texto(r.creado ?? r.creado_en)
	};
}

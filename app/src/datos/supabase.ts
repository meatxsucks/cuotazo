import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorDuplicado } from './errores';
import type { FiltroMovimientos, FuenteDatos, Movimiento, Producto } from './tipos';

const LOTE = 1000;

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

async function todas<T>(consulta: (desde: number, hasta: number) => Respuesta<T>): Promise<T[]> {
	const filas: T[] = [];
	for (let desde = 0; ; desde += LOTE) {
		const { data, error } = await consulta(desde, desde + LOTE - 1);
		if (error) throw new Error(error.message);
		filas.push(...(data ?? []));
		if (!data || data.length < LOTE) return filas;
	}
}

function revisar(error: { message: string; code?: string } | null) {
	if (!error) return;
	if (error.code === '23505') throw new ErrorDuplicado(error.message);
	throw new Error(error.message);
}

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
		}
	};
	return fuente;
}

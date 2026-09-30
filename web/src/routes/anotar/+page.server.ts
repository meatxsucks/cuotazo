import { fail } from '@sveltejs/kit';
import { CATEGORIAS_GASTO } from '$lib/categorias';
import { ErrorNoDisponible } from '$lib/datos';
import type { MedioPago, SobreEntrada } from '$lib/datos/tipos';
import { estadoSobres, montoParaPeriodo, periodoSobre, SOBRES_SUGERIDOS } from '$lib/deudas/presupuesto';
import { hoyChile } from '$lib/fechas';
import { entero, texto } from '$lib/formularios';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const d = locals.datos;
	const hoy = hoyChile();
	const sobres = await d.sobres();
	if (!sobres) return { hoy, sobres: null, estados: [], anotaciones: [], sugeridos: [] };
	const desde = [periodoSobre('semana', hoy).inicio, periodoSobre('mes', hoy).inicio].sort()[0];
	const [anotaciones, vista, sugeridos] = await Promise.all([d.anotaciones(desde, hoy), d.estadoSobres(), d.presupuestosSugeridos()]);
	// Sin la vista estado_sobre se calcula aquí con los movimientos del período
	const estados =
		vista ??
		estadoSobres(sobres, anotaciones ?? [], (await d.movimientos({ desde, hasta: hoy, tipo_flujo: 'gasto' })).filas, hoy, (await d.pagosFijos()) ?? []);
	const existentes = new Set(sobres.map((s) => s.categoria));
	return {
		hoy,
		sobres,
		estados,
		anotaciones: (anotaciones ?? []).filter((a) => {
			const s = sobres.find((x) => x.sobre_id === a.sobre_id);
			return s && a.fecha >= periodoSobre(s.periodo, hoy).inicio;
		}),
		sugeridos: SOBRES_SUGERIDOS.filter((s) => !existentes.has(s.categoria)).map((s) => {
			const promedio = sugeridos.find((x) => x.tipo === 'categoria' && x.categoria === s.categoria)?.monto_sugerido ?? null;
			return { ...s, promedio, monto: montoParaPeriodo(promedio ?? s.porDefecto, s.periodo) };
		})
	};
};

const MEDIOS = new Set<MedioPago>(['debito', 'credito', 'efectivo', 'otro']);
const CATEGORIAS = new Set(CATEGORIAS_GASTO.map((c) => c.id));
const SIN_TABLA = 'Los sobres necesitan una actualización de la base de datos que aún no está aplicada.';

async function intentar(accion: () => Promise<unknown>, error: string) {
	try {
		await accion();
		return null;
	} catch (e) {
		return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : error });
	}
}

function leerSobre(form: FormData, orden: number): SobreEntrada | string {
	const nombre = texto(form.get('nombre'), 40);
	if (!nombre) return 'Ponle nombre al sobre.';
	const categoria = String(form.get('categoria') ?? '');
	if (!CATEGORIAS.has(categoria)) return 'Elige una categoría.';
	const monto = entero(form.get('monto'));
	if (!monto || monto > 100_000_000) return 'Escribe un monto mayor a cero.';
	return {
		sobre_id: String(form.get('sobre_id') ?? '') || null,
		nombre,
		categoria,
		monto,
		periodo: form.get('periodo') === 'mes' ? 'mes' : 'semana',
		esencial: form.get('esencial') === 'si',
		orden: entero(form.get('orden')) ?? orden,
		activo: form.get('activo') !== 'no'
	};
}

export const actions: Actions = {
	anotar: async ({ request, locals }) => {
		const form = await request.formData();
		const sobreId = String(form.get('sobre_id') ?? '');
		const monto = entero(form.get('monto'));
		const medio = String(form.get('medio') ?? 'debito') as MedioPago;
		if (!sobreId) return fail(400, { error: 'Elige un sobre.' });
		if (!monto || monto > 50_000_000) return fail(400, { error: 'Escribe el monto de la compra.' });
		if (!MEDIOS.has(medio)) return fail(400, { error: 'Medio de pago inválido.' });
		try {
			const id = await locals.datos.guardarAnotacion({
				sobre_id: sobreId,
				fecha: hoyChile(),
				monto,
				nota: texto(form.get('nota'), 140) || null,
				medio,
				movimiento_id: null
			});
			return { ok: 'anotado', anotacion_id: id, sobre_id: sobreId, monto };
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : 'No pudimos anotar la compra. Intenta de nuevo.' });
		}
	},
	deshacer: async ({ request, locals }) => {
		const id = String((await request.formData()).get('anotacion_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		return (await intentar(() => locals.datos.borrarAnotacion(id), 'No pudimos borrar la compra.')) ?? { ok: 'deshecho' };
	},
	sobre: async ({ request, locals }) => {
		const sobres = (await locals.datos.sobres()) ?? [];
		const s = leerSobre(await request.formData(), sobres.reduce((m, x) => Math.max(m, x.orden), 0) + 1);
		if (typeof s === 'string') return fail(400, { error: s });
		return (await intentar(() => locals.datos.guardarSobre(s), 'No pudimos guardar el sobre.')) ?? { ok: s.sobre_id ? 'sobre_editado' : 'sobre_creado' };
	},
	borrarSobre: async ({ request, locals }) => {
		const id = String((await request.formData()).get('sobre_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		return (await intentar(() => locals.datos.borrarSobre(id), 'No pudimos borrar el sobre.')) ?? { ok: 'sobre_borrado' };
	},
	mover: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('sobre_id') ?? '');
		const paso = form.get('direccion') === 'arriba' ? -1 : 1;
		const lista = [...((await locals.datos.sobres()) ?? [])].sort((a, b) => a.orden - b.orden);
		const i = lista.findIndex((s) => s.sobre_id === id);
		const j = i + paso;
		if (i < 0 || j < 0 || j >= lista.length) return { ok: 'movido' };
		[lista[i], lista[j]] = [lista[j], lista[i]];
		const error = await intentar(async () => {
			for (const [k, s] of lista.entries()) if (s.orden !== k + 1) await locals.datos.guardarSobre({ ...s, orden: k + 1 });
		}, 'No pudimos ordenar los sobres.');
		return error ?? { ok: 'movido' };
	},
	sugeridos: async ({ request, locals }) => {
		const form = await request.formData();
		const elegidos = form.getAll('elegido').map(String);
		const sobres = (await locals.datos.sobres()) ?? [];
		let orden = sobres.reduce((m, x) => Math.max(m, x.orden), 0);
		const error = await intentar(async () => {
			for (const cat of elegidos) {
				const base = SOBRES_SUGERIDOS.find((s) => s.categoria === cat);
				const monto = entero(form.get(`monto_${cat}`));
				if (!base || !monto || sobres.some((s) => s.categoria === cat)) continue;
				await locals.datos.guardarSobre({ sobre_id: null, nombre: base.nombre, categoria: cat, monto, periodo: base.periodo, esencial: base.esencial, orden: ++orden, activo: true });
			}
		}, 'No pudimos crear los sobres.');
		return error ?? { ok: 'sobre_creado' };
	}
};

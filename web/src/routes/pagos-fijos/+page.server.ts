import { fail } from '@sveltejs/kit';
import { CATEGORIAS_GASTO } from '$lib/categorias';
import { ErrorNoDisponible } from '$lib/datos';
import type { PagoFijoEntrada } from '$lib/datos/tipos';
import { mesActual } from '$lib/fechas';
import { entero, mesDeCampo, texto } from '$lib/formularios';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const pagos = await locals.datos.pagosFijos();
	return { pagos, actual: mesActual() };
};

const CATEGORIAS = new Set(CATEGORIAS_GASTO.map((c) => c.id));

function leer(form: FormData): PagoFijoEntrada | string {
	const nombre = texto(form.get('nombre'));
	if (!nombre) return 'Ponle un nombre al pago.';
	const categoria = String(form.get('categoria') ?? '');
	if (!CATEGORIAS.has(categoria)) return 'Elige una categoría.';
	const monto = entero(form.get('monto'));
	if (!monto || monto > 1_000_000_000) return 'Escribe un monto mayor a cero.';
	const dia = entero(form.get('dia_vencimiento'));
	if (!dia || dia < 1 || dia > 31) return 'El día de pago va del 1 al 31.';
	const desde = mesDeCampo(form.get('desde')) ?? mesActual();
	const hasta = mesDeCampo(form.get('hasta'));
	if (hasta && hasta < desde) return 'El pago no puede terminar antes de empezar.';
	const meses = [...new Set(form.getAll('pausa').map(Number))].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
	return {
		pago_fijo_id: String(form.get('pago_fijo_id') ?? '') || null,
		nombre,
		categoria,
		monto,
		dia_vencimiento: dia,
		desde,
		hasta,
		meses_pausa: meses,
		activo: form.get('activo') !== 'no'
	};
}

const SIN_TABLA = 'Los pagos fijos necesitan una actualización de la base de datos que aún no está aplicada.';

export const actions: Actions = {
	guardar: async ({ request, locals }) => {
		const p = leer(await request.formData());
		if (typeof p === 'string') return fail(400, { error: p });
		try {
			await locals.datos.guardarPagoFijo(p);
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : 'No pudimos guardar el pago. Intenta de nuevo.' });
		}
		return { ok: p.pago_fijo_id ? 'editado' : 'creado' };
	},
	borrar: async ({ request, locals }) => {
		const id = String((await request.formData()).get('pago_fijo_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		try {
			await locals.datos.borrarPagoFijo(id);
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : 'No pudimos borrar el pago.' });
		}
		return { ok: 'borrado' };
	}
};

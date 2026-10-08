import { fail } from '@sveltejs/kit';
import { ErrorNoDisponible } from '$lib/datos';
import type { MedioPago } from '$lib/datos/tipos';
import { hoyChile, sumarDias } from '$lib/fechas';
import { decimal, entero, texto } from '$lib/formularios';
import { sobresDelMes } from '$lib/mes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const d = locals.datos;
	const [sobres, compras, estados, frecuentes, hogar] = await Promise.all([
		d.sobres(),
		d.compras(sumarDias(hoyChile(), -45)),
		d.estadoSobres(),
		d.itemsFrecuentes().catch(() => []),
		d.miHogar().catch(() => null)
	]);
	// Nombres de los demás del hogar, para mostrar quién hizo cada compra
	const otros = Object.fromEntries(
		[hogar?.titular, ...(hogar?.miembros ?? [])]
			.filter((p) => p && p.usuario_id !== hogar?.yo?.usuario_id)
			.map((p) => [p!.usuario_id, p!.nombre ?? 'Tu hogar'])
	);
	if (!sobres || !compras) return { disponible: false as const };
	return {
		disponible: true as const,
		sobres: sobresDelMes(sobres, estados ?? [], true),
		abierta: compras.find((c) => c.abierta) ?? null,
		recientes: compras.filter((c) => !c.abierta).slice(0, 15),
		lugares: [...new Set(compras.map((c) => c.lugar))].slice(0, 20),
		frecuentes,
		otros
	};
};

const MEDIOS = new Set<MedioPago>(['debito', 'credito', 'efectivo', 'otro']);
const SIN_TABLA = 'El carro necesita una actualización de la base de datos que aún no está aplicada.';

async function intentar(accion: () => Promise<unknown>, error: string, ok: string) {
	try {
		await accion();
		return { ok };
	} catch (e) {
		return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : error });
	}
}

export const actions: Actions = {
	nueva: async ({ request, locals }) => {
		const form = await request.formData();
		const sobreId = String(form.get('sobre_id') ?? '');
		const lugar = texto(form.get('lugar'), 60) || 'Supermercado';
		if (!sobreId) return fail(400, { error: 'Elige de qué sobre sale la compra.' });
		return intentar(() => locals.datos.crearCompra(sobreId, lugar), 'No pudimos abrir la compra.', 'nueva');
	},
	item: async ({ request, locals }) => {
		const form = await request.formData();
		const compraId = String(form.get('compra_id') ?? '');
		const nombre = texto(form.get('nombre'), 60);
		const cantidad = decimal(form.get('cantidad')) ?? 1;
		const precio = entero(form.get('precio'));
		if (!compraId) return fail(400, { error: 'Solicitud inválida.' });
		if (!nombre) return fail(400, { error: 'Escribe qué llevas.' });
		if (precio == null || precio > 50_000_000) return fail(400, { error: 'Escribe el precio.' });
		if (cantidad <= 0 || cantidad > 999) return fail(400, { error: 'Revisa la cantidad.' });
		return intentar(() => locals.datos.agregarItem(compraId, { nombre, cantidad, precio }), 'No pudimos agregar el producto.', 'item');
	},
	quitar: async ({ request, locals }) => {
		const id = String((await request.formData()).get('item_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		return intentar(() => locals.datos.borrarItem(id), 'No pudimos quitar el producto.', 'quitado');
	},
	cerrar: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('compra_id') ?? '');
		const medio = String(form.get('medio') ?? 'debito') as MedioPago;
		if (!id || !MEDIOS.has(medio)) return fail(400, { error: 'Solicitud inválida.' });
		return intentar(() => locals.datos.cerrarCompra(id, medio), 'No pudimos terminar la compra. Revisa que tenga productos.', 'cerrada');
	},
	descartar: async ({ request, locals }) => {
		const id = String((await request.formData()).get('compra_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		return intentar(() => locals.datos.descartarCompra(id), 'No pudimos descartar la compra.', 'descartada');
	}
};

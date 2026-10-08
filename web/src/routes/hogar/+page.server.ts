import { fail } from '@sveltejs/kit';
import { ErrorNoDisponible } from '$lib/datos';
import type { ProductoCompartido } from '$lib/datos/tipos';
import { nombreBanco } from '$lib/formato';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const d = locals.datos;
	const hogar = await d.miHogar();
	if (hogar.rol === 'miembro') return { hogar, productos: [], disponible: true };
	const [saldos, deudas, compartidos] = await Promise.all([d.saldos(), d.deudas(), d.compartidos()]);
	const clave = (banco: string, nombre: string) => `${banco}|${nombre}`;
	const marcados = new Set((compartidos ?? []).map((c) => clave(c.banco, c.producto_nombre)));
	const vistos = new Map<string, { clave: string; banco: string; nombre: string; tipo: string; compartido: boolean }>();
	for (const s of saldos) vistos.set(clave(s.banco, s.producto_nombre), { clave: clave(s.banco, s.producto_nombre), banco: s.banco, nombre: s.producto_nombre, tipo: 'Cuenta', compartido: false });
	for (const x of deudas) {
		const tipo = x.tipo === 'tarjeta' ? 'Tarjeta' : x.tipo === 'linea' ? 'Línea de crédito' : x.tipo === 'hipotecario' ? 'Crédito hipotecario' : 'Crédito';
		vistos.set(clave(x.banco, x.nombre), { clave: clave(x.banco, x.nombre), banco: x.banco, nombre: x.nombre, tipo, compartido: false });
	}
	const productos = [...vistos.values()]
		.map((p) => ({ ...p, compartido: marcados.has(p.clave) }))
		.sort((a, b) => nombreBanco(a.banco).localeCompare(nombreBanco(b.banco)) || a.nombre.localeCompare(b.nombre));
	return { hogar, productos, disponible: compartidos !== null };
};

const SIN_TABLA = 'El hogar necesita una actualización de la base de datos que aún no está aplicada.';

async function intentar(accion: () => Promise<unknown>, error: string, ok: string) {
	try {
		await accion();
		return { ok };
	} catch (e) {
		return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : error });
	}
}

export const actions: Actions = {
	invitar: async ({ request, locals }) => {
		const email = String((await request.formData()).get('email') ?? '').trim().toLowerCase();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return fail(400, { error: 'Escribe un correo válido.' });
		if (email === locals.usuario?.email?.toLowerCase()) return fail(400, { error: 'Ese es tu propio correo.' });
		return intentar(() => locals.datos.invitar(email), 'No pudimos crear la invitación.', 'invitado');
	},
	cancelar: async ({ request, locals }) => {
		const email = String((await request.formData()).get('email') ?? '');
		if (!email) return fail(400, { error: 'Solicitud inválida.' });
		return intentar(() => locals.datos.cancelarInvitacion(email), 'No pudimos cancelar la invitación.', 'cancelada');
	},
	quitar: async ({ request, locals }) => {
		const id = String((await request.formData()).get('usuario_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		return intentar(() => locals.datos.quitarMiembro(id), 'No pudimos quitar a esa persona.', 'quitado');
	},
	compartir: async ({ request, locals }) => {
		const lista: ProductoCompartido[] = (await request.formData())
			.getAll('producto')
			.map(String)
			.filter((v) => v.includes('|'))
			.map((v) => {
				const i = v.indexOf('|');
				return { banco: v.slice(0, i), producto_nombre: v.slice(i + 1) };
			});
		return intentar(() => locals.datos.guardarCompartidos(lista), 'No pudimos guardar qué compartes.', 'compartido');
	}
};

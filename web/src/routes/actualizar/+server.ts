import { error, json } from '@sveltejs/kit';
import { ErrorDuplicado, ErrorNoDisponible } from '$lib/datos';
import type { RequestHandler } from './$types';

// Estado de la última actualización, para el botón del encabezado
export const GET: RequestHandler = async ({ locals }) => {
	return json({ actualizacion: await locals.datos.ultimaActualizacion().catch(() => null) });
};

export const POST: RequestHandler = async ({ locals }) => {
	try {
		await locals.datos.pedirActualizacion();
	} catch (e) {
		if (e instanceof ErrorDuplicado) error(429, 'Ya se actualizó hace menos de 10 minutos.');
		if (e instanceof ErrorNoDisponible) error(503, 'La actualización necesita un cambio en la base de datos que aún no está aplicado.');
		error(500, 'No pudimos pedir la actualización.');
	}
	return json({ actualizacion: await locals.datos.ultimaActualizacion() });
};

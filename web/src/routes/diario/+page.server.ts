import { finDeMes, hoyChile, mesDeParametro } from '$lib/fechas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const mes = mesDeParametro(url.searchParams.get('mes'));
	const [pagina, productos] = await Promise.all([
		locals.datos.movimientos({ desde: mes, hasta: finDeMes(mes) }),
		locals.datos.productos()
	]);
	return { mes, hoy: hoyChile(), movimientos: pagina.filas, productos };
};

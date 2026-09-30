import { finDeMes, mesDeParametro, sumarMeses } from '$lib/fechas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const mes = mesDeParametro(url.searchParams.get('mes'));
	const cat = url.searchParams.get('cat') || null;
	const [gasto, detalle] = await Promise.all([
		locals.datos.gastoDiario(sumarMeses(mes, -5), finDeMes(mes)),
		cat ? locals.datos.movimientos({ categoria: cat, desde: mes, hasta: finDeMes(mes) }) : Promise.resolve(null)
	]);
	return { mes, cat, gasto, movimientos: detalle?.filas ?? [] };
};

import { finDeMes, mesDeParametro } from '$lib/fechas';
import type { PageServerLoad } from './$types';

const POR_PAGINA = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams;
	const mes = mesDeParametro(q.get('mes'));
	const filtro = {
		banco: q.get('banco') ?? '',
		producto: q.get('producto') ?? '',
		categoria: q.get('categoria') ?? '',
		tipo_flujo: q.get('tipo') ?? '',
		estado: q.get('estado') ?? '',
		texto: q.get('q') ?? ''
	};
	const pagina = Math.max(1, Number(q.get('p')) || 1);
	const [bancoProducto, nombreProducto] = filtro.producto.includes('|') ? filtro.producto.split('|') : ['', ''];

	const [resultado, productos] = await Promise.all([
		locals.datos.movimientos({
			desde: mes,
			hasta: finDeMes(mes),
			banco: filtro.banco || bancoProducto || undefined,
			producto: nombreProducto || undefined,
			categoria: filtro.categoria || undefined,
			tipo_flujo: filtro.tipo_flujo || undefined,
			estado: filtro.estado || undefined,
			texto: filtro.texto || undefined,
			limite: POR_PAGINA,
			desplazamiento: (pagina - 1) * POR_PAGINA
		}),
		locals.datos.productos()
	]);

	return { mes, filtro, pagina, porPagina: POR_PAGINA, filas: resultado.filas, total: resultado.total, productos };
};

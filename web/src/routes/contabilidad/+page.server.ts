import { mesActual, sumarMeses } from '$lib/fechas';
import type { PageServerLoad } from './$types';

const VISTAS = ['balance', 'resultados', 'libro', 'conciliacion'] as const;
type Vista = (typeof VISTAS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	const d = locals.datos;
	const pedida = url.searchParams.get('vista');
	const vista: Vista = VISTAS.includes(pedida as Vista) ? (pedida as Vista) : 'balance';

	if (vista === 'balance') {
		const [partidas, fotos] = await Promise.all([d.balanceActual(), d.fotosBalance()]);
		return { vista, partidas, fotos: (fotos ?? []).slice(-10) };
	}
	if (vista === 'resultados') {
		const mes = mesActual();
		const meses = [sumarMeses(mes, -2), sumarMeses(mes, -1), mes];
		return { vista, meses, filas: await d.resultadoMensual(meses[0]) };
	}
	if (vista === 'libro') {
		const productos = (await d.productos()).sort((a, b) => a.producto_tipo.localeCompare(b.producto_tipo) || a.producto_nombre.localeCompare(b.producto_nombre));
		const pedido = url.searchParams.get('producto') ?? '';
		const elegido = productos.find((p) => `${p.banco}|${p.producto_nombre}` === pedido) ?? productos[0] ?? null;
		const filas = elegido ? await d.libro(elegido.banco, elegido.producto_nombre, 200) : [];
		return { vista, productos, elegido, filas };
	}
	return { vista, conciliacion: await d.conciliacion() };
};

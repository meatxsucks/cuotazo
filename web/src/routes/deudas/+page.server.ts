import { finDeMes, mesActual, sumarMeses } from '$lib/fechas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actual = mesActual();
	const anterior = sumarMeses(actual, -1);
	const d = locals.datos;
	const [deudas, cuotas, resumen, facturados] = await Promise.all([
		d.deudas(),
		d.cuotasMes(sumarMeses(actual, 1), sumarMeses(actual, 12)),
		d.resumenMensual(sumarMeses(actual, -5), actual),
		d.movimientos({ estado: 'facturado', desde: anterior, hasta: finDeMes(anterior) })
	]);

	// Facturado del último período: cargos facturados del mes anterior por tarjeta
	const facturado: Record<string, number> = {};
	for (const m of facturados.filas) {
		if (m.producto_tipo !== 'tarjeta' || m.monto >= 0) continue;
		const k = `${m.banco}|${m.producto_nombre}`;
		facturado[k] = (facturado[k] ?? 0) - m.monto;
	}
	return { actual, anterior, deudas, cuotas, resumen, facturado };
};

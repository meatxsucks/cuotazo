import { fail } from '@sveltejs/kit';
import { cicloDe } from '$lib/caja';
import { ErrorNoDisponible } from '$lib/datos';
import { hoyChile, sumarDias } from '$lib/fechas';
import { entero } from '$lib/formularios';
import { balanceMes, planCiclo, sobresDelMes } from '$lib/mes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const d = locals.datos;
	const hoy = hoyChile();
	const enCurso = url.searchParams.get('ciclo') !== 'proximo';
	const [pagosCiclo, sobres, estados, saldos, perfil] = await Promise.all([d.pagosCiclo(), d.sobres(), d.estadoSobres(), d.saldos(), d.perfil()]);
	if (!pagosCiclo) return { disponible: false as const, enCurso, hoy };

	const actual = cicloDe(hoy);
	const pagos = pagosCiclo.filter((p) => p.en_curso === enCurso);
	const ciclo = pagos[0] ? { ciclo: pagos[0].ciclo, inicio: pagos[0].ciclo_inicio, fin: pagos[0].ciclo_fin } : enCurso ? actual : cicloDe(sumarDias(actual.fin, 1));
	const caja = enCurso ? await d.cajaCiclo(ciclo.ciclo) : null;
	const sueldo = caja?.filter((c) => c.ciclo === ciclo.ciclo && c.grupo === 'sueldo').reduce((t, c) => t + c.entradas, 0) ?? 0;
	const ingreso = sueldo || (perfil?.ingreso_mensual_neto ?? 0);
	const saldoHoy = saldos.reduce((t, s) => t + s.saldo_disponible, 0);
	const delMes = sobresDelMes(sobres ?? [], estados ?? [], enCurso);

	return {
		disponible: true as const,
		enCurso,
		hoy,
		ciclo,
		pagos,
		sobres: delMes,
		ingreso,
		ingresoReal: sueldo > 0,
		saldoHoy,
		balance: balanceMes(pagos, delMes, ingreso, enCurso ? saldoHoy : null),
		plan: enCurso ? planCiclo(pagos, delMes, saldoHoy) : []
	};
};

const SIN_TABLA = 'Esta pantalla necesita una actualización de la base de datos que aún no está aplicada.';

async function intentar(accion: () => Promise<unknown>, error: string, ok: string) {
	try {
		await accion();
		return { ok };
	} catch (e) {
		return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : error });
	}
}

export const actions: Actions = {
	marcar: async ({ request, locals }) => {
		const form = await request.formData();
		const ciclo = String(form.get('ciclo') ?? '');
		const clave = String(form.get('clave') ?? '');
		const valor = String(form.get('valor') ?? '');
		if (!/^\d{4}-\d{2}-01$/.test(ciclo) || !clave || !['pagado', 'pendiente', 'auto'].includes(valor)) return fail(400, { error: 'Solicitud inválida.' });
		const pagado = valor === 'auto' ? null : valor === 'pagado';
		return intentar(() => locals.datos.marcarPago(ciclo, clave, pagado), 'No pudimos guardar el pago. Intenta de nuevo.', 'marcado');
	},
	sobre: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('sobre_id') ?? '');
		const monto = entero(form.get('monto'));
		if (!monto || monto > 100_000_000) return fail(400, { error: 'Escribe un monto mayor a cero.' });
		const s = ((await locals.datos.sobres()) ?? []).find((x) => x.sobre_id === id);
		if (!s) return fail(400, { error: 'Sobre no encontrado.' });
		return intentar(() => locals.datos.guardarSobre({ ...s, monto }), 'No pudimos guardar el sobre.', 'sobre');
	},
	ingreso: async ({ request, locals }) => {
		const monto = entero((await request.formData()).get('ingreso'));
		if (!monto || monto < 1_000 || monto > 1_000_000_000) return fail(400, { error: 'Revisa el ingreso: escribe tu sueldo líquido mensual.' });
		const p = await locals.datos.perfil();
		return intentar(
			() =>
				locals.datos.guardarPerfil({
					ingreso_mensual_neto: monto,
					dia_pago: p?.dia_pago ?? null,
					meta_ahorro_mensual: p?.meta_ahorro_mensual ?? 0,
					tope_carga_cuotas_pct: p?.tope_carga_cuotas_pct ?? 30
				}),
			'No pudimos guardar el ingreso.',
			'ingreso'
		);
	}
};

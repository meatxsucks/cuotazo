import { fail } from '@sveltejs/kit';
import { porCategoria } from '$lib/agregados';
import { cicloDe, compromisosHastaSueldo, proximoSueldo } from '$lib/caja';
import { topeDelCiclo, topeSugerido } from '$lib/credito';
import { ErrorNoDisponible } from '$lib/datos';
import type { TipoTopeCredito, TopeCredito, UsoCredito } from '$lib/datos/tipos';
import { finDeMes, hoyChile, mesDeParametro, sumarDias, sumarMeses } from '$lib/fechas';
import { sobresDelMes } from '$lib/mes';
import { entero } from '$lib/formularios';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const mes = mesDeParametro(url.searchParams.get('mes'));
	const hoy = hoyChile();
	const d = locals.datos;
	const cicloHoy = cicloDe(hoy).ciclo;
	const [resumen, gasto, credito, perfil, deudas, saldos, publicaciones, cajaResumen, cajaCiclo, loQueViene, pagosFijos, manuales, sobres, estadosSobre, usoCredito, topesCredito] =
		await Promise.all([
			d.resumenMensual(sumarMeses(mes, -1), mes),
			d.gastoDiario(mes, finDeMes(mes)),
			d.creditoMes(mes),
			d.perfil(),
			d.deudas(),
			d.saldos(),
			d.publicaciones(),
			d.cajaResumen(),
			d.cajaCiclo(sumarMeses(cicloHoy, -5)),
			d.loQueViene(),
			d.pagosFijos(),
			d.deudasManuales(),
			d.sobres(),
			d.estadoSobres(),
			d.usoCredito().catch(() => null),
			d.topesCredito().catch(() => null)
		]);

	const cicloActual = cajaResumen?.find((c) => c.ciclo === cicloHoy);
	const sueldo = cicloActual?.proximo_sueldo ?? proximoSueldo(hoy, perfil?.dia_pago);
	// Sin la vista lo_que_viene se calcula aquí; lo que vence después del cierre del ciclo se paga con el próximo sueldo
	const hasta = cicloActual?.ciclo_fin ?? sumarDias(sueldo, -1);
	const compromisos =
		loQueViene ?? compromisosHastaSueldo({ hoy, hasta, deudas, pagosFijos: pagosFijos ?? [], deudasManuales: manuales ?? [] });

	const pedido = url.searchParams.get('ciclo');
	const cicloVer = pedido && /^\d{4}-\d{2}$/.test(pedido) ? `${pedido}-01` : cicloHoy;

	return {
		mes,
		hoy,
		actual: resumen.find((r) => r.mes === mes) ?? null,
		anterior: resumen.find((r) => r.mes === sumarMeses(mes, -1)) ?? null,
		categorias: porCategoria(gasto),
		sobres: sobresDelMes(sobres ?? [], estadosSobre ?? [], true),
		credito,
		tope: perfil?.tope_carga_cuotas_pct ?? 30,
		ingresoDeclarado: perfil?.ingreso_mensual_neto != null,
		deudas,
		saldos,
		saldosAl: publicaciones.find((p) => p.tabla === 'saldo_cuenta')?.publicado_en ?? saldos.find((s) => s.actualizado)?.actualizado ?? null,
		cajaResumen,
		cajaCiclo,
		cicloHoy,
		cicloVer,
		sueldo,
		compromisos,
		faltanTablas: pagosFijos === null || manuales === null,
		topesCredito: usoCredito && topesCredito ? armarTopes(usoCredito, topesCredito, hoy) : null
	};
};

// Uso del ciclo en curso contra su tope, para tarjetas y para la línea
function armarTopes(uso: UsoCredito[], topes: TopeCredito[], hoy: string) {
	const ciclo = cicloDe(hoy);
	const actual = uso.find((u) => u.ciclo === ciclo.ciclo);
	const anterior = uso.find((u) => u.ciclo === sumarMeses(ciclo.ciclo, -1));
	const fila = (tipo: TipoTopeCredito) => {
		const usado = (tipo === 'tarjetas' ? actual?.compras_tarjeta : actual?.giros_linea) ?? 0;
		const previo = (tipo === 'tarjetas' ? anterior?.compras_tarjeta : anterior?.giros_linea) ?? 0;
		const t = topes.find((x) => x.tipo === tipo) ?? null;
		return {
			tipo,
			usado,
			veces: (tipo === 'tarjetas' ? actual?.n_compras : actual?.n_giros) ?? 0,
			previo,
			config: t,
			tope: t ? topeDelCiclo(t, ciclo.ciclo) : null,
			proximo: t ? topeDelCiclo(t, sumarMeses(ciclo.ciclo, 1)) : null,
			sugerido: topeSugerido(previo || usado)
		};
	};
	return { ciclo, filas: [fila('tarjetas'), fila('linea')] };
}

export const actions: Actions = {
	topeCredito: async ({ request, locals }) => {
		const form = await request.formData();
		const tipo = String(form.get('tipo') ?? '') as TipoTopeCredito;
		const tope = entero(form.get('tope'));
		const meta = entero(form.get('meta')) ?? 0;
		const bajada = Number(String(form.get('bajada') ?? '10').replace(',', '.'));
		if (tipo !== 'tarjetas' && tipo !== 'linea') return fail(400, { error: 'Solicitud inválida.' });
		if (tope == null || tope > 100_000_000) return fail(400, { error: 'Escribe el tope de este ciclo.' });
		if (meta > tope) return fail(400, { error: 'La meta no puede ser mayor que el tope de este ciclo.' });
		if (!Number.isFinite(bajada) || bajada < 0 || bajada > 50) return fail(400, { error: 'La bajada por ciclo va de 0% a 50%.' });
		try {
			await locals.datos.guardarTopeCredito({ tipo, inicial: tope, meta, bajada_pct: bajada, desde_ciclo: cicloDe(hoyChile()).ciclo });
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? 'Los topes necesitan una actualización de la base de datos.' : 'No pudimos guardar el tope.' });
		}
		return { ok: 'tope' };
	}
};

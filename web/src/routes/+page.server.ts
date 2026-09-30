import { porCategoria } from '$lib/agregados';
import { cicloDe, compromisosHastaSueldo, proximoSueldo } from '$lib/caja';
import { finDeMes, hoyChile, mesDeParametro, sumarDias, sumarMeses } from '$lib/fechas';
import { sobresDelMes } from '$lib/mes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const mes = mesDeParametro(url.searchParams.get('mes'));
	const hoy = hoyChile();
	const d = locals.datos;
	const cicloHoy = cicloDe(hoy).ciclo;
	const [resumen, gasto, credito, perfil, deudas, saldos, publicaciones, cajaResumen, cajaCiclo, loQueViene, pagosFijos, manuales, sobres, estadosSobre] =
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
			d.estadoSobres()
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
		faltanTablas: pagosFijos === null || manuales === null
	};
};

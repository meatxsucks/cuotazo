import { fail } from '@sveltejs/kit';
import { ErrorDuplicado, ErrorNoDisponible } from '$lib/datos';
import type { DeudaManualEntrada, TipoDeudaManual } from '$lib/datos/tipos';
import { finDeMes, mesActual } from '$lib/fechas';
import { decimal, entero, fechaDeCampo, texto } from '$lib/formularios';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const d = locals.datos;
	const mes = mesActual();
	const [manuales, presupuestos, productos, movs] = await Promise.all([
		d.deudasManuales(),
		d.presupuestos(),
		d.deudas(),
		d.movimientos({ desde: mes, hasta: finDeMes(mes), tipo_flujo: 'gasto' })
	]);

	// Uso del mes por tarjeta: compras nuevas (la cuota 1 cuenta por el total de la compra)
	const uso = productos
		.filter((p) => p.tipo === 'tarjeta')
		.map((t) => {
			const clave = `${t.banco}|${t.nombre}`;
			const usado = movs.filas
				.filter((m) => m.producto_tipo === 'tarjeta' && `${m.banco}|${m.producto_nombre}` === clave && (m.cuota_actual == null || m.cuota_actual === 1))
				.reduce((s, m) => s + Math.abs(m.monto_total_compra ?? m.monto), 0);
			const tope = presupuestos.find((p) => p.tipo === 'tope_tarjeta' && p.producto === clave && p.mes === null) ?? null;
			return { clave, nombre: t.nombre, usado, tope };
		});

	return { sinTablas: manuales === null, manuales: manuales ?? [], uso };
};

const TIPOS = new Set<TipoDeudaManual>(['tarjeta', 'consumo', 'automotriz', 'educacion', 'otro']);
const SIN_TABLA = 'Las deudas anotadas a mano necesitan una actualización de la base de datos que aún no está aplicada.';

function leerDeuda(form: FormData): DeudaManualEntrada | string {
	const nombre = texto(form.get('nombre'));
	if (!nombre) return 'Ponle un nombre a la deuda.';
	const tipo = String(form.get('tipo') ?? '') as TipoDeudaManual;
	if (!TIPOS.has(tipo)) return 'Elige el tipo de deuda.';
	const saldo = entero(form.get('saldo'));
	if (!saldo || saldo > 10_000_000_000) return 'Escribe el saldo que debes.';
	const tasa = decimal(form.get('tasa_mensual'));
	if (tasa != null && (tasa < 0 || tasa > 10)) return 'La tasa mensual va entre 0% y 10%.';
	const cuotaFija = entero(form.get('cuota_fija'));
	const cuotaMinima = entero(form.get('cuota_minima'));
	const restantes = entero(form.get('cuotas_restantes'));
	const dia = entero(form.get('dia_pago'));
	if (dia != null && (dia < 1 || dia > 31)) return 'El día de pago va del 1 al 31.';
	return {
		deuda_manual_id: String(form.get('deuda_manual_id') ?? '') || null,
		nombre,
		acreedor: texto(form.get('acreedor')) || null,
		tipo,
		saldo,
		tasa_mensual: tasa,
		cuota_minima: cuotaFija ? null : cuotaMinima,
		cuota_fija: cuotaFija,
		cuotas_restantes: cuotaFija ? restantes : null,
		dia_pago: dia,
		proximo_pago: fechaDeCampo(form.get('proximo_pago')),
		activo: true
	};
}

export const actions: Actions = {
	deuda: async ({ request, locals }) => {
		const d = leerDeuda(await request.formData());
		if (typeof d === 'string') return fail(400, { error: d });
		try {
			await locals.datos.guardarDeudaManual(d);
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : 'No pudimos guardar la deuda.' });
		}
		return { ok: d.deuda_manual_id ? 'Deuda actualizada.' : 'Deuda agregada.' };
	},
	borrarDeuda: async ({ request, locals }) => {
		const id = String((await request.formData()).get('deuda_manual_id') ?? '');
		if (!id) return fail(400, { error: 'Solicitud inválida.' });
		try {
			await locals.datos.borrarDeudaManual(id);
		} catch (e) {
			return fail(500, { error: e instanceof ErrorNoDisponible ? SIN_TABLA : 'No pudimos borrar la deuda.' });
		}
		return { ok: 'Deuda borrada.' };
	},
	tope: async ({ request, locals }) => {
		const form = await request.formData();
		const tarjeta = String(form.get('tarjeta') ?? '');
		const monto = entero(form.get('monto'));
		if (!tarjeta.includes('|')) return fail(400, { error: 'Elige la tarjeta.' });
		const previo = (await locals.datos.presupuestos()).find((p) => p.tipo === 'tope_tarjeta' && p.producto === tarjeta && p.mes === null);
		try {
			if (!monto) {
				if (previo) await locals.datos.borrarPresupuesto(previo.presupuesto_id);
				return { ok: 'Límite quitado.' };
			}
			await locals.datos.guardarPresupuesto({
				presupuesto_id: previo?.presupuesto_id ?? null,
				tipo: 'tope_tarjeta',
				categoria: null,
				producto: tarjeta,
				mes: null,
				monto_limite: monto,
				porcentaje_limite: null,
				umbrales: [80, 100],
				alerta_pronostico: true
			});
		} catch (e) {
			if (e instanceof ErrorNoDisponible) return fail(500, { error: 'El límite por tarjeta necesita una actualización de la base de datos que aún no está aplicada.' });
			if (e instanceof ErrorDuplicado) return fail(409, { error: 'Esa tarjeta ya tiene un límite.' });
			return fail(500, { error: 'No pudimos guardar el límite.' });
		}
		return { ok: 'Límite guardado.' };
	}
};

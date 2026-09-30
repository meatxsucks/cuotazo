// Mes por ciclo de sueldo: pagos, sobres, balance y qué hacer con la plata que queda
import type { Ciclo } from './caja';
import { cicloDe, cuotaClp } from './caja';
import type { CompraItem, DeudaManual, DeudaProducto, EstadoPago, EstadoSobre, ItemFrecuente, PagoCiclo, PagoFijo, Sobre } from './datos/tipos';
import { mensualDeSobre, pagoFijoVigente } from './deudas/presupuesto';
import { conDia, mesDe, sumarDias, sumarMeses } from './fechas';
import { clp } from './formato';

export function totalCompra(items: Pick<CompraItem, 'cantidad' | 'precio'>[]): number {
	return Math.round(items.reduce((t, i) => t + i.cantidad * i.precio, 0));
}

/** Últimos precios por producto, del más comprado al menos */
export function frecuentes(filas: { nombre: string; precio: number }[], limite = 80): ItemFrecuente[] {
	const vistos = new Map<string, ItemFrecuente>();
	for (const f of filas) {
		const clave = f.nombre.trim().toLowerCase();
		const previo = vistos.get(clave);
		if (previo) previo.veces++;
		else vistos.set(clave, { nombre: f.nombre.trim(), precio: f.precio, veces: 1 });
	}
	return [...vistos.values()].sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre)).slice(0, limite);
}

export interface SobreMes {
	sobre: Sobre;
	presupuesto: number;
	gastado: number;
	queda: number;
}

/** Gasto del sobre: lo anotado más lo que llegó del banco sin anotar */
export function sobresDelMes(sobres: Sobre[], estados: EstadoSobre[], enCurso: boolean): SobreMes[] {
	return sobres
		.filter((s) => s.activo)
		.map((s) => {
			const e = estados.find((x) => x.sobre_id === s.sobre_id);
			const gastado = enCurso && e ? e.anotado + e.sin_anotar : 0;
			const presupuesto = s.periodo === 'semana' ? s.monto : mensualDeSobre(s);
			return { sobre: s, presupuesto, gastado, queda: presupuesto - gastado };
		});
}

export interface BalanceMes {
	ingreso: number;
	pagos: number;
	pagado: number;
	porPagar: number;
	sobres: number;
	gastadoSobres: number;
	/** ingreso − pagos − sobres */
	queda: number;
	/** saldo de hoy − lo que falta pagar − lo que falta de los sobres (solo ciclo en curso) */
	cierre: number | null;
}

export function balanceMes(pagos: PagoCiclo[], sobres: SobreMes[], ingreso: number, saldoHoy: number | null): BalanceMes {
	const total = pagos.reduce((t, p) => t + p.comprometido, 0);
	const porPagar = pagos.reduce((t, p) => t + p.por_pagar, 0);
	const presupuesto = sobres.reduce((t, s) => t + mensualDeSobre(s.sobre), 0);
	const gastado = sobres.reduce((t, s) => t + s.gastado, 0);
	const faltaSobres = sobres.reduce((t, s) => t + Math.max(s.queda, 0), 0);
	return {
		ingreso,
		pagos: total,
		pagado: total - porPagar,
		porPagar,
		sobres: presupuesto,
		gastadoSobres: gastado,
		queda: ingreso - total - presupuesto,
		cierre: saldoHoy == null ? null : saldoHoy - porPagar - faltaSobres
	};
}

export interface PasoPlan {
	texto: string;
	detalle: string | null;
	monto: number;
	alcanza: boolean;
}

const CUENTAS = new Set(['pago_fijo', 'deuda_manual']);

function nombres(p: PagoCiclo[]): string {
	const n = p.map((x) => x.nombre.replace(/\s*\(.*\)$/, ''));
	return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

/** Orden para usar la plata de hoy: cuentas, mínimos, esenciales y lo que sobre a la deuda que vence */
export function planCiclo(pagos: PagoCiclo[], sobres: SobreMes[], saldoHoy: number): PasoPlan[] {
	const pasos: PasoPlan[] = [];
	let caja = saldoHoy;
	const paso = (texto: string, detalle: string | null, monto: number) => {
		if (monto <= 0) return;
		pasos.push({ texto, detalle, monto, alcanza: caja >= monto });
		caja -= monto;
	};

	const cuentas = pagos.filter((p) => CUENTAS.has(p.origen) && p.por_pagar > 0);
	paso('Paga las cuentas y cuotas pendientes', nombres(cuentas), cuentas.reduce((t, p) => t + p.por_pagar, 0));

	const minimos = pagos.filter((p) => !CUENTAS.has(p.origen) && p.por_pagar_minimo > 0);
	paso(
		'Paga el mínimo de tarjetas y créditos',
		nombres(minimos),
		minimos.reduce((t, p) => t + p.por_pagar_minimo, 0)
	);

	const esenciales = sobres.filter((s) => s.sobre.esencial && s.queda > 0);
	paso('Guarda para lo esencial', esenciales.map((s) => s.sobre.nombre).join(', ') || null, esenciales.reduce((t, s) => t + s.queda, 0));

	const restos = pagos.filter((p) => !CUENTAS.has(p.origen) && p.por_pagar > p.por_pagar_minimo);
	for (const r of restos) {
		const resto = r.por_pagar - r.por_pagar_minimo;
		const abono = Math.min(resto, Math.max(caja, 0));
		if (abono > 0) {
			pasos.push({ texto: `Abona a ${r.nombre}`, detalle: `Te queda ${clp(resto)} de ese estado; lo que no pagues genera interés`, monto: abono, alcanza: true });
			caja -= abono;
		} else {
			pasos.push({ texto: `Resto de ${r.nombre}`, detalle: 'Hoy no alcanza: pasará al próximo estado con interés', monto: resto, alcanza: false });
		}
	}
	return pasos;
}

// Réplica de la vista pagos_ciclo para el modo demo

function fechaEnCiclo(c: Ciclo, dia: number): string {
	const a = conDia(mesDe(c.inicio), dia);
	return a >= c.inicio && a <= c.fin ? a : conDia(mesDe(c.fin), dia);
}

function siguiente(c: Ciclo): Ciclo {
	return { ciclo: sumarMeses(c.ciclo, 1), inicio: sumarDias(c.fin, 1), fin: sumarDias(conDia(sumarMeses(c.ciclo, 1), Number(c.inicio.slice(8))), -1) };
}

interface ItemBase {
	clave: string;
	origen: string;
	nombre: string;
	acreedor: string | null;
	fecha: string | null;
	monto: number;
	monto_minimo: number | null;
	pagado_banco: number;
	automatico: boolean;
	estimado: boolean;
}

export function pagosCicloDemo(
	hoy: string,
	e: { pagosFijos: PagoFijo[]; deudasManuales: DeudaManual[]; deudas: DeudaProducto[]; marcas: Record<string, boolean> }
): PagoCiclo[] {
	const c0 = cicloDe(hoy);
	const filas: PagoCiclo[] = [];
	for (const [n, c] of [c0, siguiente(c0)].entries()) {
		const items: ItemBase[] = [];
		for (const p of e.pagosFijos) {
			const f = fechaEnCiclo(c, p.dia_vencimiento);
			if (!pagoFijoVigente(p, mesDe(f))) continue;
			items.push({ clave: `fijo:${p.pago_fijo_id}`, origen: 'pago_fijo', nombre: p.nombre, acreedor: null, fecha: f, monto: p.monto, monto_minimo: p.monto, pagado_banco: 0, automatico: false, estimado: false });
		}
		for (const d of e.deudasManuales) {
			const monto = d.cuota_fija ?? d.cuota_minima ?? 0;
			if (!d.activo || d.saldo <= 0 || !d.dia_pago || monto <= 0) continue;
			items.push({ clave: `manual:${d.deuda_manual_id}`, origen: 'deuda_manual', nombre: d.nombre, acreedor: d.acreedor, fecha: fechaEnCiclo(c, d.dia_pago), monto, monto_minimo: d.cuota_minima ?? monto, pagado_banco: 0, automatico: false, estimado: false });
		}
		for (const d of e.deudas) {
			if (!d.proximo_vencimiento) continue;
			const dia = Number(d.proximo_vencimiento.slice(8));
			if (d.tipo === 'tarjeta' && d.monto_facturado) {
				const actual = d.proximo_vencimiento >= c.inicio && d.proximo_vencimiento <= c.fin;
				const proyectada = n === 1 && d.proximo_vencimiento >= c0.inicio && d.proximo_vencimiento <= c0.fin;
				if (actual)
					items.push({ clave: `tarjeta:${d.banco}:${d.nombre}`, origen: 'tarjeta', nombre: d.nombre, acreedor: d.banco, fecha: d.proximo_vencimiento, monto: d.monto_facturado, monto_minimo: d.pago_minimo, pagado_banco: d.monto_pagado ?? 0, automatico: true, estimado: false });
				else if (proyectada && d.monto_por_facturar)
					items.push({ clave: `tarjeta:${d.banco}:${d.nombre}`, origen: 'tarjeta', nombre: d.nombre, acreedor: d.banco, fecha: fechaEnCiclo(c, dia), monto: d.monto_por_facturar, monto_minimo: null, pagado_banco: 0, automatico: true, estimado: true });
			} else if (d.tipo === 'hipotecario' || d.tipo === 'consumo') {
				const monto = cuotaClp(d) ?? 0;
				if (monto > 0)
					items.push({ clave: `credito:${d.banco}:${d.nombre}`, origen: d.tipo === 'hipotecario' ? 'dividendo' : 'credito', nombre: d.nombre, acreedor: d.banco, fecha: fechaEnCiclo(c, dia), monto, monto_minimo: null, pagado_banco: 0, automatico: true, estimado: false });
			}
		}
		for (const i of items) {
			const marcado = e.marcas[`${c.ciclo}|${i.clave}`] ?? null;
			const estado: EstadoPago =
				marcado === true
					? 'pagado'
					: marcado === false
						? 'pendiente'
						: i.pagado_banco >= 0.99 * i.monto
							? 'pagado'
							: i.origen === 'tarjeta' && i.monto_minimo != null && i.pagado_banco > 0 && i.pagado_banco >= 0.99 * i.monto_minimo
								? 'minimo'
								: 'pendiente';
			const vencidoConMinimo = estado === 'minimo' && !!i.fecha && i.fecha <= hoy;
			filas.push({
				...i,
				ciclo: c.ciclo,
				ciclo_inicio: c.inicio,
				ciclo_fin: c.fin,
				en_curso: n === 0,
				marcado,
				estado,
				por_pagar: estado === 'pagado' || vencidoConMinimo ? 0 : Math.max(i.monto - i.pagado_banco, 0),
				por_pagar_minimo: estado === 'pendiente' ? Math.max((i.monto_minimo ?? i.monto) - i.pagado_banco, 0) : 0,
				comprometido: vencidoConMinimo ? Math.min(i.pagado_banco, i.monto) : i.monto
			});
		}
	}
	return filas.sort((a, b) => a.ciclo.localeCompare(b.ciclo) || (a.fecha ?? '9').localeCompare(b.fecha ?? '9') || a.nombre.localeCompare(b.nombre));
}

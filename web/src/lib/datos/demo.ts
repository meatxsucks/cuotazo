import { compromisosHastaSueldo, proximoSueldo, unirDeudas } from '$lib/caja';
import { estadoSobres } from '$lib/deudas/presupuesto';
import { frecuentes, pagosCicloDemo, totalCompra } from '$lib/mes';
import * as calculo from '$lib/demo/calculos';
import { generarDatosDemo, type DatosDemo } from '$lib/demo/generador';
import { hoyChile, sumarDias } from '$lib/fechas';
import { cumpleFiltro } from './filtro';
import { ErrorDuplicado } from './index';
import type { FuenteDatos, Producto } from './tipos';

let cache: { dia: string; datos: DatosDemo } | null = null;

// Regenera una vez al día; presupuestos y perfil editados viven en memoria del servidor
function datos(): DatosDemo {
	const dia = hoyChile();
	if (!cache || cache.dia !== dia) cache = { dia, datos: generarDatosDemo(dia) };
	return cache.datos;
}

const copia = <T>(x: T): T => structuredClone(x);

export const fuenteDemo: FuenteDatos = {
	async usuario() {
		return copia(datos().usuario);
	},
	async resumenMensual(desde, hasta) {
		return copia(datos().resumen.filter((r) => r.mes >= desde && r.mes <= hasta));
	},
	async gastoDiario(desde, hasta) {
		return copia(datos().gastoDiario.filter((g) => g.fecha >= desde && g.fecha <= hasta));
	},
	async movimientos(filtro) {
		const todas = datos().movimientos.filter((m) => cumpleFiltro(m, filtro));
		const inicio = filtro.desplazamiento ?? 0;
		const filas = filtro.limite ? todas.slice(inicio, inicio + filtro.limite) : todas.slice(inicio);
		return { filas: copia(filas), total: todas.length };
	},
	async productos() {
		const vistos = new Map<string, Producto>();
		for (const m of datos().movimientos) {
			vistos.set(`${m.banco}|${m.producto_nombre}`, { banco: m.banco, producto_tipo: m.producto_tipo, producto_nombre: m.producto_nombre });
		}
		return [...vistos.values()];
	},
	async deudas() {
		return copia(datos().deudas);
	},
	async cuotasMes(desde, hasta) {
		return copia(datos().cuotas.filter((c) => c.mes >= desde && c.mes <= hasta));
	},
	async saldos() {
		return copia(datos().saldos);
	},
	async publicaciones() {
		return copia(datos().publicaciones);
	},
	async presupuestos() {
		return copia(datos().presupuestos);
	},
	async guardarPresupuesto(p) {
		const lista = datos().presupuestos;
		const choca = lista.some(
			(e) => e.presupuesto_id !== p.presupuesto_id && e.tipo === p.tipo && e.categoria === p.categoria && e.mes === p.mes
		);
		if (choca) throw new ErrorDuplicado('Presupuesto duplicado');
		const existente = p.presupuesto_id ? lista.find((e) => e.presupuesto_id === p.presupuesto_id) : undefined;
		if (existente) Object.assign(existente, copia(p));
		else lista.push({ ...copia(p), presupuesto_id: crypto.randomUUID() });
	},
	async borrarPresupuesto(presupuestoId) {
		const d = datos();
		d.presupuestos = d.presupuestos.filter((p) => p.presupuesto_id !== presupuestoId);
	},
	async estadoPresupuestos(mes) {
		return calculo.estadoPresupuestos(datos(), mes, hoyChile());
	},
	async presupuestosSugeridos() {
		return calculo.presupuestosSugeridos(datos(), hoyChile());
	},
	async creditoMes(mes) {
		return calculo.creditoMes(datos(), mes, hoyChile());
	},
	async perfil() {
		return copia(datos().perfil);
	},
	async guardarPerfil(p) {
		datos().perfil = { ...copia(p), actualizado: new Date().toISOString() };
	},
	async planAjuste() {
		return calculo.planAjuste(datos(), hoyChile());
	},
	async planCategorias() {
		return calculo.planCategorias(datos(), hoyChile());
	},
	async liberacionCuotas() {
		return calculo.liberacionCuotas(datos(), hoyChile());
	},
	async cajaResumen() {
		const d = datos();
		const hoy = hoyChile();
		const sueldo = proximoSueldo(hoy, d.perfil?.dia_pago);
		const antes = compromisosDemo(d, hoy, sueldo).filter((c) => c.origen !== 'pago_fijo' && c.origen !== 'deuda_manual');
		return calculo.cajaResumen(d, hoy, antes.reduce((s, c) => s + c.monto, 0), sueldo);
	},
	async cajaCiclo(desde) {
		return calculo.cajaCiclo(datos(), desde, hoyChile());
	},
	async loQueViene() {
		const d = datos();
		const hoy = hoyChile();
		const filas = compromisosDemo(d, hoy, proximoSueldo(hoy, d.perfil?.dia_pago));
		const saldo = d.saldos.reduce((s, x) => s + x.saldo_disponible, 0);
		const ajustado = saldo - filas.reduce((s, c) => s + c.monto, 0);
		return filas.map((f) => ({ ...f, disponible_para_vivir_ajustado: ajustado }));
	},
	async deudasTodas() {
		const d = datos();
		return unirDeudas(d.deudas, d.deudasManuales);
	},
	async pagosFijos() {
		return copia(datos().pagosFijos);
	},
	async guardarPagoFijo(p) {
		guardarEn(datos().pagosFijos, 'pago_fijo_id', p);
	},
	async borrarPagoFijo(id) {
		const d = datos();
		d.pagosFijos = d.pagosFijos.filter((x) => x.pago_fijo_id !== id);
	},
	async deudasManuales() {
		return copia(datos().deudasManuales);
	},
	async guardarDeudaManual(x) {
		guardarEn(datos().deudasManuales, 'deuda_manual_id', x);
	},
	async borrarDeudaManual(id) {
		const d = datos();
		d.deudasManuales = d.deudasManuales.filter((x) => x.deuda_manual_id !== id);
	},
	async sobres() {
		return copia([...datos().sobres].sort((a, b) => a.orden - b.orden));
	},
	async guardarSobre(x) {
		guardarEn(datos().sobres, 'sobre_id', x);
	},
	async borrarSobre(id) {
		const d = datos();
		d.sobres = d.sobres.filter((x) => x.sobre_id !== id);
		d.anotaciones = d.anotaciones.filter((a) => a.sobre_id !== id);
	},
	async anotaciones(desde, hasta) {
		return copia(
			datos()
				.anotaciones.filter((a) => a.fecha >= desde && a.fecha <= hasta)
				.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado ?? '').localeCompare(a.creado ?? ''))
		);
	},
	async guardarAnotacion(a) {
		const id = crypto.randomUUID();
		datos().anotaciones.push({ ...copia(a), anotacion_id: id, creado: new Date().toISOString() });
		return id;
	},
	async borrarAnotacion(id) {
		const d = datos();
		d.anotaciones = d.anotaciones.filter((a) => a.anotacion_id !== id);
	},
	async estadoSobres() {
		const d = datos();
		return estadoSobres(d.sobres, d.anotaciones, d.movimientos, hoyChile(), d.pagosFijos);
	},
	async pagosCiclo() {
		return pagosCicloDemo(hoyChile(), datos());
	},
	async marcarPago(ciclo, clave, pagado) {
		const marcas = datos().marcas;
		if (pagado == null) delete marcas[`${ciclo}|${clave}`];
		else marcas[`${ciclo}|${clave}`] = pagado;
	},
	async compras(desde) {
		return copia(datos().compras.filter((c) => c.abierta || c.creada >= desde));
	},
	async crearCompra(sobreId, lugar) {
		const id = crypto.randomUUID();
		datos().compras.unshift({ compra_id: id, sobre_id: sobreId, lugar, abierta: true, creada: new Date().toISOString(), cerrada: null, creado_por: null, items: [] });
		return id;
	},
	async agregarItem(compraId, item) {
		compraDemo(compraId).items.push({ ...item, item_id: crypto.randomUUID() });
	},
	async borrarItem(itemId) {
		for (const c of datos().compras) c.items = c.items.filter((i) => i.item_id !== itemId);
	},
	async cerrarCompra(compraId, medio) {
		const c = compraDemo(compraId);
		const monto = totalCompra(c.items);
		if (!c.abierta || monto <= 0) throw new Error('La compra no tiene productos');
		await fuenteDemo.guardarAnotacion({ sobre_id: c.sobre_id, fecha: hoyChile(), monto, nota: c.lugar, medio, movimiento_id: null });
		c.abierta = false;
		c.cerrada = new Date().toISOString();
	},
	async descartarCompra(compraId) {
		const d = datos();
		d.compras = d.compras.filter((c) => !(c.compra_id === compraId && c.abierta));
	},
	async itemsFrecuentes() {
		return frecuentes(datos().compras.flatMap((c) => c.items));
	},
	async miHogar() {
		return copia(datos().hogar);
	},
	async aceptarInvitacion() {
		return false;
	},
	async invitar(email) {
		const h = datos().hogar;
		if (!h.invitaciones.includes(email)) h.invitaciones.push(email);
	},
	async cancelarInvitacion(email) {
		const h = datos().hogar;
		h.invitaciones = h.invitaciones.filter((e) => e !== email);
	},
	async quitarMiembro(id) {
		const h = datos().hogar;
		h.miembros = h.miembros.filter((m) => m.usuario_id !== id);
	},
	async compartidos() {
		return copia(datos().compartidos);
	},
	async guardarCompartidos(lista) {
		datos().compartidos = copia(lista);
	},
	async ultimaActualizacion() {
		return copia(datos().actualizacion);
	},
	// En demo la actualización termina al instante
	async pedirActualizacion() {
		const ahora = new Date().toISOString();
		const pasos = { santander: 'ok', falabella: 'ok', bci: 'ok', carga: 'ok', publicacion: 'ok' };
		datos().actualizacion = { solicitud_id: crypto.randomUUID(), origen: 'app', estado: 'ok', pasos, detalle: null, creada: ahora, iniciada: ahora, terminada: ahora };
	},
	async balanceActual() {
		return balanceDemo(datos());
	},
	async fotosBalance() {
		const d = datos();
		const hoy = hoyChile();
		const base = balanceDemo(d);
		const activos = base.filter((p) => p.lado === 'activo').reduce((t, p) => t + p.monto, 0);
		const pasivos = base.filter((p) => p.lado === 'pasivo').reduce((t, p) => t + p.monto, 0);
		return [6, 5, 4, 3, 2, 1, 0].map((n) => ({ fecha: sumarDias(hoy, -n * 5), activos: Math.round(activos * (1 - n * 0.04)), pasivos: Math.round(pasivos * (1 + n * 0.01)) }));
	},
	async resultadoMensual(desde) {
		const filas = new Map<string, { mes: string; tipo_flujo: 'ingreso' | 'gasto' | 'interes_comision'; categoria: string; monto: number; cantidad: number }>();
		for (const m of datos().movimientos) {
			if (!['ingreso', 'gasto', 'interes_comision'].includes(m.tipo_flujo) || m.fecha_imputacion < desde || m.fecha_imputacion > hoyChile()) continue;
			const mes = m.fecha_imputacion.slice(0, 8) + '01';
			const clave = `${mes}|${m.tipo_flujo}|${m.categoria}`;
			const f = filas.get(clave) ?? { mes, tipo_flujo: m.tipo_flujo as 'ingreso' | 'gasto' | 'interes_comision', categoria: m.categoria, monto: 0, cantidad: 0 };
			f.monto += m.tipo_flujo === 'ingreso' ? m.monto : -m.monto;
			f.cantidad++;
			filas.set(clave, f);
		}
		return [...filas.values()];
	},
	async libro(banco, producto, limite) {
		const d = datos();
		const movs = d.movimientos
			.filter((m) => m.banco === banco && m.producto_nombre === producto)
			.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.movimiento_id.localeCompare(a.movimiento_id));
		let saldo = d.saldos.find((s) => s.banco === banco && s.producto_nombre === producto)?.saldo_disponible ?? null;
		return movs.slice(0, limite).map((m) => {
			const fila = { movimiento_id: m.movimiento_id, fecha: m.fecha, glosa: m.glosa, comercio: m.comercio, categoria: m.categoria, estado: m.estado, abono: Math.max(m.monto, 0), cargo: Math.max(-m.monto, 0), saldo };
			if (saldo != null) saldo -= m.monto;
			return fila;
		});
	},
	async conciliacion() {
		const hoy = hoyChile();
		return [
			{ ambito: 'carga', sujeto: 'banco_demo · cuenta', detalle: '48 movimientos del banco, 0 duplicados descartados, 48 en la app', cuadra: true, revisado: hoy },
			{ ambito: 'carga', sujeto: 'banco_demo · tarjeta', detalle: '62 movimientos del banco, 2 duplicados descartados, 60 en la app', cuadra: true, revisado: hoy },
			{ ambito: 'tarjeta', sujeto: 'Visa Oro Banco Demo', detalle: 'Estado del último cierre: saldo anterior menos 31 movimientos da el monto facturado', cuadra: true, revisado: hoy },
			{ ambito: 'tarjeta', sujeto: 'Mastercard Tienda Demo', detalle: 'El banco no informa saldo anterior, no se puede cuadrar', cuadra: null, revisado: hoy },
			{ ambito: 'saldo', sujeto: 'Cuenta Corriente Banco Demo · banco_demo', detalle: 'Saldo anterior + movimientos difiere en 1.200 del saldo del banco', cuadra: false, revisado: hoy }
		];
	}
};

function balanceDemo(d: DatosDemo) {
	const activos = d.saldos.map((s) => ({ lado: 'activo' as const, tipo: 'cuenta', entidad: s.banco, nombre: s.producto_nombre, monto: s.saldo_disponible }));
	const bancos = d.deudas
		.filter((x) => (x.saldo_deuda_clp ?? 0) > 0)
		.map((x) => ({ lado: 'pasivo' as const, tipo: x.tipo, entidad: x.banco, nombre: x.nombre, monto: Math.round(x.saldo_deuda_clp ?? 0) }));
	const manuales = d.deudasManuales
		.filter((x) => x.activo && x.saldo > 0)
		.map((x) => ({ lado: 'pasivo' as const, tipo: x.tipo, entidad: x.acreedor ?? 'anotada', nombre: x.nombre, monto: x.saldo }));
	return [...activos, ...bancos, ...manuales];
}

function compraDemo(id: string) {
	const c = datos().compras.find((x) => x.compra_id === id);
	if (!c) throw new Error('Compra no encontrada');
	return c;
}

function compromisosDemo(d: DatosDemo, hoy: string, sueldo: string) {
	return compromisosHastaSueldo({ hoy, hasta: sumarDias(sueldo, -1), deudas: d.deudas, pagosFijos: d.pagosFijos, deudasManuales: d.deudasManuales });
}

// Crea o reemplaza por id; los ids nuevos se generan aquí
function guardarEn<T extends object, K extends keyof T>(lista: T[], clave: K, entrada: Omit<T, K> & { [P in K]: string | null }) {
	const id = entrada[clave];
	const i = id ? lista.findIndex((x) => x[clave] === id) : -1;
	const fila = { ...copia(entrada), [clave]: id ?? crypto.randomUUID() } as T;
	if (i >= 0) lista[i] = fila;
	else lista.push(fila);
}

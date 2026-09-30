import * as calculo from '@/demo/calculos';
import { generarDatosDemo, type DatosDemo } from '@/demo/generador';
import { hoyChile } from '@/lib/fechas';
import { ErrorDuplicado } from './errores';
import { cumpleFiltro } from './filtro';
import type { FuenteDatos, Producto } from './tipos';

let cache: { dia: string; datos: DatosDemo } | null = null;

// Regenera una vez al día; alertas y perfil editados viven en memoria hasta recargar
function datos(): DatosDemo {
	const dia = hoyChile();
	if (!cache || cache.dia !== dia) cache = { dia, datos: generarDatosDemo(dia) };
	return cache.datos;
}

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const pausa = () => new Promise<void>((r) => setTimeout(r, 0));

let secuencia = 0;
function nuevoId(): string {
	secuencia += 1;
	const azar = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
	return `demo-${Date.now().toString(16)}-${azar}-${secuencia}`;
}

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
		await pausa();
		const lista = datos().presupuestos;
		const choca = lista.some(
			(e) => e.presupuesto_id !== p.presupuesto_id && e.tipo === p.tipo && e.categoria === p.categoria && e.mes === p.mes
		);
		if (choca) throw new ErrorDuplicado('Presupuesto duplicado');
		const existente = p.presupuesto_id ? lista.find((e) => e.presupuesto_id === p.presupuesto_id) : undefined;
		if (existente) Object.assign(existente, copia(p));
		else lista.push({ ...copia(p), presupuesto_id: nuevoId() });
	},
	async borrarPresupuesto(presupuestoId) {
		await pausa();
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
		await pausa();
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
	}
};

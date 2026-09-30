import type { FiltroMovimientos, Movimiento } from './tipos';

export function normalizar(texto: string): string {
	return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function cumpleFiltro(m: Movimiento, f: FiltroMovimientos): boolean {
	if (f.desde && m.fecha_imputacion < f.desde) return false;
	if (f.hasta && m.fecha_imputacion > f.hasta) return false;
	if (f.banco && m.banco !== f.banco) return false;
	if (f.producto && m.producto_nombre !== f.producto) return false;
	if (f.categoria && m.categoria !== f.categoria) return false;
	if (f.tipo_flujo && m.tipo_flujo !== f.tipo_flujo) return false;
	if (f.estado && m.estado !== f.estado) return false;
	if (f.texto) {
		const t = normalizar(f.texto);
		if (!normalizar(`${m.glosa} ${m.comercio ?? ''}`).includes(t)) return false;
	}
	return true;
}

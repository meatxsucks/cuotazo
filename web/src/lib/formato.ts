// Formatos chilenos: $1.234.567, dd-mm-aaaa

const MESES = [
	'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
	'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function miles(n: number): string {
	return Math.round(Math.abs(n))
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function clp(n: number | null | undefined, conSigno = false): string {
	if (n == null || Number.isNaN(n)) return '—';
	const r = Math.round(n);
	const signo = r < 0 ? '−' : conSigno && r > 0 ? '+' : '';
	return `${signo}$${miles(r)}`;
}

export function clpCorto(n: number): string {
	const a = Math.abs(n);
	const s = n < 0 ? '−' : '';
	if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',').replace(/,0$/, '')}M`;
	if (a >= 1_000) return `${s}$${Math.round(a / 1_000)}k`;
	return `${s}$${Math.round(a)}`;
}

export function uf(n: number | null | undefined): string {
	if (n == null) return '—';
	const [ent, dec] = Math.abs(n).toFixed(2).split('.');
	return `UF ${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export function monto(n: number | null | undefined, moneda: 'CLP' | 'UF' = 'CLP'): string {
	return moneda === 'UF' ? uf(n) : clp(n);
}

export function fecha(iso: string | null | undefined): string {
	if (!iso) return '—';
	const [a, m, d] = iso.slice(0, 10).split('-');
	return `${d}-${m}-${a}`;
}

export function fechaHora(iso: string | null | undefined): string {
	if (!iso) return '—';
	const f = new Date(iso);
	const p = new Intl.DateTimeFormat('es-CL', {
		timeZone: 'America/Santiago',
		day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
	}).formatToParts(f);
	const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
	return `${v('day')}-${v('month')}-${v('year')} ${v('hour')}:${v('minute')}`;
}

export function mesLargo(mes: string): string {
	const [a, m] = mes.split('-').map(Number);
	const nombre = MESES[m - 1];
	return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${a}`;
}

export function mesCorto(mes: string): string {
	const m = Number(mes.split('-')[1]);
	return MESES[m - 1].slice(0, 3);
}

export function diaLargo(iso: string): string {
	const [a, m, d] = iso.split('-').map(Number);
	const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
	return `${dia[0].toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1]}`;
}

export function porcentaje(n: number | null | undefined, decimales = 0): string {
	if (n == null || !Number.isFinite(n)) return '—';
	const texto = n.toFixed(decimales);
	return `${Number(texto) === 0 ? (0).toFixed(decimales) : texto}%`.replace('.', ',');
}

export const NOMBRES_BANCO: Record<string, string> = {
	santander: 'Santander',
	falabella: 'Banco Falabella',
	bci: 'BCI',
	banco_demo: 'Banco Demo',
	banco_sur_demo: 'Banco Sur Demo',
	tienda_demo: 'Tienda Demo'
};

export function nombreBanco(b: string): string {
	return NOMBRES_BANCO[b] ?? b[0].toUpperCase() + b.slice(1);
}

export const NOMBRES_FLUJO: Record<string, string> = {
	ingreso: 'Ingreso',
	gasto: 'Gasto',
	transferencia_interna: 'Transferencia interna',
	pago_deuda: 'Pago de deuda',
	interes_comision: 'Interés o comisión'
};

export const NOMBRES_ESTADO: Record<string, string> = {
	contable: 'Contable',
	no_facturado: 'No facturado',
	facturado: 'Facturado',
	pendiente: 'Pendiente'
};

export const NOMBRES_DEUDA: Record<string, string> = {
	tarjeta: 'Tarjeta de crédito',
	linea: 'Línea de crédito',
	consumo: 'Crédito de consumo',
	hipotecario: 'Crédito hipotecario'
};

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

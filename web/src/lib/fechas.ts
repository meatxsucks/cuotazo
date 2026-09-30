// Fechas como texto ISO 'aaaa-mm-dd'; meses al día 1

const fmtChile = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/Santiago',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export function hoyChile(): string {
	return fmtChile.format(new Date());
}

export function mesDe(fecha: string): string {
	return fecha.slice(0, 7) + '-01';
}

export function mesActual(): string {
	return mesDe(hoyChile());
}

function partes(fecha: string): [number, number, number] {
	const [a, m, d] = fecha.split('-').map(Number);
	return [a, m, d];
}

function iso(a: number, m: number, d: number): string {
	return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function diasEnMes(mes: string): number {
	const [a, m] = partes(mes);
	return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function sumarMeses(mes: string, n: number): string {
	const [a, m] = partes(mes);
	const total = a * 12 + (m - 1) + n;
	return iso(Math.floor(total / 12), (total % 12) + 1, 1);
}

export function finDeMes(mes: string): string {
	return mes.slice(0, 8) + String(diasEnMes(mes)).padStart(2, '0');
}

export function sumarDias(fecha: string, n: number): string {
	const [a, m, d] = partes(fecha);
	const f = new Date(Date.UTC(a, m - 1, d + n));
	return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

export function diaSemana(fecha: string): number {
	const [a, m, d] = partes(fecha);
	return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function conDia(mes: string, dia: number): string {
	return mes.slice(0, 8) + String(Math.min(dia, diasEnMes(mes))).padStart(2, '0');
}

export function diasEntre(desde: string, hasta: string): number {
	const [a1, m1, d1] = partes(desde);
	const [a2, m2, d2] = partes(hasta);
	return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

// Lee ?mes=aaaa-mm; si no es válido, usa el mes en curso
export function mesDeParametro(valor: string | null): string {
	if (valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return valor + '-01';
	return mesActual();
}

export function parametroMes(mes: string): string {
	return mes.slice(0, 7);
}

export function listaMeses(hasta: string, cantidad: number): string[] {
	return Array.from({ length: cantidad }, (_, i) => sumarMeses(hasta, i - cantidad + 1));
}

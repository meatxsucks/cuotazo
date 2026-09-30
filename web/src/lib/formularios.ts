// Lectura de campos de formularios
export function entero(v: FormDataEntryValue | null): number | null {
	const d = String(v ?? '').replace(/\D/g, '');
	return d ? Number(d) : null;
}

/** Número con coma o punto decimal (tasas en %) */
export function decimal(v: FormDataEntryValue | null): number | null {
	const t = String(v ?? '').trim().replace('%', '').replace(',', '.');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

export function texto(v: FormDataEntryValue | null, max = 80): string {
	return String(v ?? '').trim().slice(0, max);
}

/** 'aaaa-mm' o 'aaaa-mm-dd' a 'aaaa-mm-01'; null si no es válido */
export function mesDeCampo(v: FormDataEntryValue | null): string | null {
	const t = String(v ?? '');
	return /^\d{4}-(0[1-9]|1[0-2])/.test(t) ? `${t.slice(0, 7)}-01` : null;
}

export function fechaDeCampo(v: FormDataEntryValue | null): string | null {
	const t = String(v ?? '');
	return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

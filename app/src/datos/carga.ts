import { useCallback, useEffect, useRef, useState } from 'react';

export interface Carga<T> {
	datos: T | null;
	error: string | null;
	cargando: boolean;
	recargar: () => Promise<void>;
}

// Carga asíncrona que conserva los datos previos mientras recarga
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]): Carga<T> {
	const [datos, setDatos] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [cargando, setCargando] = useState(true);
	const turno = useRef(0);
	const actual = useRef(fn);
	actual.current = fn;

	const recargar = useCallback(async () => {
		const mio = ++turno.current;
		setCargando(true);
		try {
			const r = await actual.current();
			if (mio !== turno.current) return;
			setDatos(r);
			setError(null);
		} catch (e) {
			if (mio !== turno.current) return;
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (mio === turno.current) setCargando(false);
		}
	}, []);

	useEffect(() => {
		recargar();
	}, deps);

	return { datos, error, cargando, recargar };
}

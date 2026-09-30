import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { modoDemo, supabase } from './cliente';
import { fuenteDemo } from './demo';
import { crearFuenteSupabase } from './supabase';
import type { FuenteDatos } from './tipos';

interface EstadoSesion {
	modoDemo: boolean;
	cargando: boolean;
	sesion: Session | null;
	email: string | null;
	fuente: FuenteDatos;
}

const Contexto = createContext<EstadoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
	const [sesion, setSesion] = useState<Session | null>(null);
	const [cargando, setCargando] = useState(!modoDemo);

	useEffect(() => {
		if (!supabase) return;
		supabase.auth.getSession().then(({ data }) => {
			setSesion(data.session);
			setCargando(false);
		});
		const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s));
		return () => data.subscription.unsubscribe();
	}, []);

	// La fuente se recrea al cambiar de usuario; RLS decide qué filas ve cada uno
	const idUsuario = sesion?.user.id ?? null;
	const fuente = useMemo(() => (supabase ? crearFuenteSupabase(supabase) : fuenteDemo), [idUsuario]);

	const valor = useMemo(
		() => ({ modoDemo, cargando, sesion, email: sesion?.user.email ?? null, fuente }),
		[cargando, sesion, fuente]
	);
	return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
	const v = useContext(Contexto);
	if (!v) throw new Error('useSesion fuera de ProveedorSesion');
	return v;
}

export function useFuente(): FuenteDatos {
	return useSesion().fuente;
}

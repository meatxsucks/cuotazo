import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { fuenteDemo } from '$lib/datos/demo';
import { crearFuenteSupabase } from '$lib/datos/supabase';

const RUTAS_PUBLICAS = ['/login', '/auth/'];

export const handle: Handle = async ({ event, resolve }) => {
	const url = env.PUBLIC_SUPABASE_URL;
	const clave = env.PUBLIC_SUPABASE_ANON_KEY;

	// Modo demostración: sin Supabase, datos sintéticos y sin login
	if (!url || !clave) {
		event.locals.modoDemo = true;
		event.locals.supabase = null;
		event.locals.usuario = null;
		event.locals.datos = fuenteDemo;
		return resolve(event);
	}

	const supabase = createServerClient(url, clave, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) event.cookies.set(name, value, { ...options, path: '/' });
			}
		}
	});

	// getUser valida el token contra Supabase Auth
	const { data } = await supabase.auth.getUser();
	const user = data.user;

	event.locals.modoDemo = false;
	event.locals.supabase = supabase;
	event.locals.usuario = user ? { id: user.id, email: user.email ?? '' } : null;
	event.locals.datos = crearFuenteSupabase(supabase);

	const ruta = event.url.pathname;
	const publica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r));
	if (!user && !publica) redirect(303, '/login');
	if (user && ruta === '/login') redirect(303, '/');

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};

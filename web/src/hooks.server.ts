import { DEFAULT_AUTH_SKIP_ROUTES, processAuthMiddleware } from '@neon/auth/server';
import { PostgrestClient } from '@supabase/postgrest-js';
import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { crearAuth, SAME_SITE } from '$lib/auth.server';
import { fuenteDemo } from '$lib/datos/demo';
import { crearFuenteSupabase } from '$lib/datos/supabase';

const RUTAS_PUBLICAS = [...DEFAULT_AUTH_SKIP_ROUTES, '/login'];

function conCookies(respuesta: Response, cookies: string[] = []): Response {
	for (const c of cookies) respuesta.headers.append('set-cookie', c);
	return respuesta;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { NEON_AUTH_URL: base, NEON_AUTH_COOKIE_SECRET: secreto, NEON_DATA_API_URL: api } = env;

	// Modo demostración: sin Neon, datos sintéticos y sin login
	if (!base || !secreto || !api) {
		event.locals.modoDemo = true;
		event.locals.auth = null;
		event.locals.usuario = null;
		event.locals.datos = fuenteDemo;
		return resolve(event);
	}

	event.locals.modoDemo = false;
	event.locals.auth = crearAuth(event, base, secreto);
	event.locals.usuario = null;
	event.locals.datos = fuenteDemo;
	const ruta = event.url.pathname;
	// El MCP del agente se autentica con su propio token, no con sesión de navegador
	if (ruta.startsWith('/api/auth') || ruta === '/mcp') return resolve(event);

	// Canjea el verificador que deja el callback de Google o del enlace mágico por la cookie de sesión
	const paso = await processAuthMiddleware({
		request: event.request,
		pathname: ruta,
		skipRoutes: RUTAS_PUBLICAS,
		loginUrl: '/login',
		baseUrl: base,
		cookieSecret: secreto,
		sameSite: SAME_SITE
	});
	if (paso.action !== 'allow') {
		return conCookies(new Response(null, { status: 303, headers: { location: paso.redirectUrl.toString() } }), paso.cookies);
	}

	const { data: sesion } = await event.locals.auth.getSession();
	const { data: token } = sesion?.user ? await event.locals.auth.token() : { data: null };
	if (sesion?.user && token?.token) {
		event.locals.usuario = { id: sesion.user.id, email: sesion.user.email ?? '' };
		// La Data API valida el JWT y RLS resuelve el usuario con auth.uid()
		const db = new PostgrestClient(api, { schema: 'finanzas', headers: { Authorization: `Bearer ${token.token}` } });
		event.locals.datos = crearFuenteSupabase(db);
	}

	const publica = RUTAS_PUBLICAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
	if (!event.locals.usuario && !publica) redirect(303, '/login');
	if (event.locals.usuario && ruta === '/login') redirect(303, '/');

	return conCookies(await resolve(event), paso.cookies);
};

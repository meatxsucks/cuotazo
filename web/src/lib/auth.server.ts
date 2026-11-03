import { createAuthServer, type NeonAuthServer } from '@neon/auth/server';
import type { RequestEvent } from '@sveltejs/kit';

export const SAME_SITE = 'lax' as const;

// El SDK expone en runtime todos los endpoints de Neon Auth, pero sus tipos 0.8 no traen token ni magicLink
export type Auth = NeonAuthServer & {
	token: () => Promise<{ data: { token: string } | null }>;
	signIn: { magicLink: (args: { email: string; callbackURL: string }) => Promise<{ error: { status?: number } | null }> };
};

// Sesión de Neon Auth para este request; la cookie vive en el dominio de la app (proxy en /api/auth)
export function crearAuth(event: RequestEvent, baseUrl: string, cookieSecret: string): Auth {
	return createAuthServer({
		baseUrl,
		cookieSecret,
		sameSite: SAME_SITE,
		context: () => ({
			getCookies: () => event.request.headers.get('cookie') ?? '',
			setCookie: (nombre, valor, opciones) => event.cookies.set(nombre, valor, { ...opciones, path: opciones.path ?? '/' }),
			getHeader: (nombre) => event.request.headers.get(nombre),
			getOrigin: () => event.url.origin,
			getFramework: () => 'sveltekit'
		})
	}) as Auth;
}

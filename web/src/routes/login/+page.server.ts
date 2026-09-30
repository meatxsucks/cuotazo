import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	return { errorEnlace: url.searchParams.get('error') === 'enlace' };
};

export const actions: Actions = {
	correo: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { email, error: 'Escribe un correo válido.' });
		if (!locals.supabase) return fail(400, { email, error: 'La app está en modo demostración: no necesitas iniciar sesión.' });

		const { error } = await locals.supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: `${url.origin}/auth/confirmar` }
		});
		if (error?.status === 429) return fail(429, { email, error: 'Se alcanzó el límite de correos por hora. Entra con Google o intenta más tarde.' });
		if (error) return fail(400, { email, error: 'No pudimos enviar el enlace. Intenta de nuevo en unos minutos.' });
		return { email, enviado: true };
	},
	google: async ({ locals, url }) => {
		if (!locals.supabase) return fail(400, { error: 'La app está en modo demostración: no necesitas iniciar sesión.' });
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/confirmar` }
		});
		if (error || !data.url) return fail(400, { error: 'No pudimos abrir el ingreso con Google.' });
		redirect(303, data.url);
	}
};

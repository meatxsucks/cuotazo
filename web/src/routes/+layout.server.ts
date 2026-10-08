import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const enLogin = url.pathname.startsWith('/login') || url.pathname.startsWith('/auth/');
	const conDatos = locals.modoDemo || (locals.usuario !== null && !enLogin);
	const d = locals.datos;
	let [perfil, publicaciones] = conDatos ? await Promise.all([d.usuario().catch(() => null), d.publicaciones().catch(() => [])]) : [null, []];
	// Primera entrada de alguien invitado a un hogar: queda vinculado al hogar del titular
	if (conDatos && !locals.modoDemo && perfil === null && (await d.aceptarInvitacion())) {
		[perfil, publicaciones] = await Promise.all([d.usuario().catch(() => null), d.publicaciones().catch(() => [])]);
	}
	const hogar = conDatos && perfil ? await d.miHogar().catch(() => null) : null;
	const actualizado = publicaciones.reduce<string | null>((max, p) => (!max || p.publicado_en > max ? p.publicado_en : max), null);
	return {
		modoDemo: locals.modoDemo,
		email: locals.usuario?.email ?? null,
		nombre: hogar?.yo?.nombre ?? perfil?.nombre_visible ?? null,
		vinculado: locals.modoDemo || perfil !== null,
		rol: hogar?.rol ?? 'solo',
		actualizado
	};
};

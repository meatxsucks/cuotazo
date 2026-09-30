import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const enLogin = url.pathname.startsWith('/login') || url.pathname.startsWith('/auth/');
	const conDatos = locals.modoDemo || (locals.usuario !== null && !enLogin);
	const [perfil, publicaciones] = conDatos
		? await Promise.all([locals.datos.usuario().catch(() => null), locals.datos.publicaciones().catch(() => [])])
		: [null, []];
	const actualizado = publicaciones.reduce<string | null>((max, p) => (!max || p.publicado_en > max ? p.publicado_en : max), null);
	return {
		modoDemo: locals.modoDemo,
		email: locals.usuario?.email ?? null,
		nombre: perfil?.nombre_visible ?? null,
		vinculado: locals.modoDemo || perfil !== null,
		actualizado
	};
};

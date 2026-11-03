import { handleAuthProxyRequest } from '@neon/auth/server';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SAME_SITE } from '$lib/auth.server';
import type { RequestHandler } from './$types';

const proxy: RequestHandler = ({ request, params }) => {
	if (!env.NEON_AUTH_URL || !env.NEON_AUTH_COOKIE_SECRET) error(404);
	return handleAuthProxyRequest({ request, path: params.ruta, baseUrl: env.NEON_AUTH_URL, cookieSecret: env.NEON_AUTH_COOKIE_SECRET, sameSite: SAME_SITE });
};

export const GET = proxy;
export const POST = proxy;

import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

// Destino del enlace mágico: acepta ?code= (PKCE) o ?token_hash=&type=
export const GET: RequestHandler = async ({ url, locals }) => {
	const supabase = locals.supabase;
	if (!supabase) redirect(303, '/');

	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const tipo = url.searchParams.get('type') as EmailOtpType | null;

	let ok = false;
	if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
	else if (tokenHash && tipo) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;

	redirect(303, ok ? '/' : '/login?error=enlace');
};

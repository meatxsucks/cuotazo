import type { EmailOtpType } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './cliente';

const RUTA_CONFIRMAR = 'auth/confirmar';

// Web: https://<dominio>/auth/confirmar · móvil: cuotazo://auth/confirmar
export function urlConfirmacion(): string {
	if (Platform.OS === 'web') return `${window.location.origin}/${RUTA_CONFIRMAR}`;
	return makeRedirectUri({ scheme: 'cuotazo', path: RUTA_CONFIRMAR });
}

export type ResultadoEnvio = { ok: true } | { ok: false; error: string };

export async function enviarEnlace(email: string): Promise<ResultadoEnvio> {
	if (!supabase) return { ok: false, error: 'La app está en modo demostración: no necesitas iniciar sesión.' };
	const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: urlConfirmacion() } });
	if (error?.status === 429) return { ok: false, error: 'Se alcanzó el límite de correos por hora. Entra con Google o intenta más tarde.' };
	if (error) return { ok: false, error: 'No pudimos enviar el enlace. Intenta de nuevo en unos minutos.' };
	return { ok: true };
}

// Web: redirección completa con PKCE · móvil: sesión de navegador y vuelta por deep link
export async function entrarConGoogle(): Promise<string | null> {
	if (!supabase) return 'La app está en modo demostración: no necesitas iniciar sesión.';
	const redirectTo = urlConfirmacion();
	const web = Platform.OS === 'web';
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: { redirectTo, skipBrowserRedirect: !web }
	});
	if (error || !data.url) return 'No pudimos abrir el ingreso con Google.';
	if (web) return null;
	const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
	if (r.type !== 'success') return r.type === 'cancel' || r.type === 'dismiss' ? null : 'No pudimos completar el ingreso con Google.';
	const code = new URL(r.url).searchParams.get('code');
	if (!code) return 'No pudimos completar el ingreso con Google.';
	return (await confirmar({ code })) ? null : 'No pudimos completar el ingreso con Google.';
}

// Destino del enlace mágico y de OAuth: acepta ?code= (PKCE) o ?token_hash=&type=
const enCurso = new Map<string, Promise<boolean>>();

export function confirmar(params: { code?: string; token_hash?: string; type?: string }): Promise<boolean> {
	const clave = params.code ?? params.token_hash ?? '';
	if (!enCurso.has(clave)) enCurso.set(clave, canjear(params));
	return enCurso.get(clave)!;
}

async function canjear(params: { code?: string; token_hash?: string; type?: string }): Promise<boolean> {
	if (!supabase) return false;
	if (params.code) return !(await supabase.auth.exchangeCodeForSession(params.code)).error;
	if (params.token_hash && params.type) {
		return !(await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: params.type as EmailOtpType })).error;
	}
	return false;
}

export async function salir(): Promise<void> {
	await supabase?.auth.signOut();
}

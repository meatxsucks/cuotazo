import { neon } from '@neondatabase/serverless';
import { error, json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { responder, type Ejecutar } from '$lib/mcp';
import type { RequestHandler } from './$types';

// Cada token se compara por hash. El de lectura usa el rol que solo ejecuta consultas; el de escritura, además,
// el rol que solo ejecuta las funciones que anotan (ADR-012).
function coincide(cabecera: string | null, esperadoHex: string | undefined): boolean {
	const token = cabecera?.match(/^Bearer (.+)$/)?.[1];
	if (!esperadoHex || !token) return false;
	const hash = createHash('sha256').update(token).digest();
	const ref = Buffer.from(esperadoHex, 'hex');
	return ref.length === hash.length && timingSafeEqual(hash, ref);
}

const ejecutor = (url: string): Ejecutar => {
	const sql = neon(url);
	return async (texto, params) => (await sql.query(texto, params)) as Record<string, unknown>[];
};

export const POST: RequestHandler = async ({ request }) => {
	if (!env.AGENTE_DB_URL || !env.AGENTE_USUARIO_ID || !env.AGENTE_TOKEN_SHA256) error(404);
	const cabecera = request.headers.get('authorization');
	const puedeEscribir = !!env.AGENTE_ESCRITURA_DB_URL && coincide(cabecera, env.AGENTE_ESCRITURA_SHA256);
	if (!puedeEscribir && !coincide(cabecera, env.AGENTE_TOKEN_SHA256)) return json({ error: 'no autorizado' }, { status: 401 });

	const msg = await request.json().catch(() => null);
	if (!msg || Array.isArray(msg) || typeof msg !== 'object') return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Petición inválida' } }, { status: 400 });

	const respuesta = await responder(msg, {
		usuario: env.AGENTE_USUARIO_ID,
		leer: ejecutor(env.AGENTE_DB_URL),
		escribir: puedeEscribir ? ejecutor(env.AGENTE_ESCRITURA_DB_URL!) : undefined
	});
	return respuesta ? json(respuesta) : new Response(null, { status: 202 });
};

export const GET: RequestHandler = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });

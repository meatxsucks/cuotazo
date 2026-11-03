import type { Auth } from '$lib/auth.server';
import type { FuenteDatos } from '$lib/datos/tipos';

declare global {
	namespace App {
		interface Locals {
			modoDemo: boolean;
			auth: Auth | null;
			usuario: { id: string; email: string } | null;
			datos: FuenteDatos;
		}
	}
}

export {};

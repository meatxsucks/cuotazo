import type { SupabaseClient } from '@supabase/supabase-js';
import type { FuenteDatos } from '$lib/datos/tipos';

declare global {
	namespace App {
		interface Locals {
			modoDemo: boolean;
			supabase: SupabaseClient | null;
			usuario: { id: string; email: string } | null;
			datos: FuenteDatos;
		}
	}
}

export {};

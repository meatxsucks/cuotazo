import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { almacenamiento } from './almacenamiento';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sin variables (o con EXPO_PUBLIC_DEMO=1) la app usa datos sintéticos y no pide login
export const modoDemo = process.env.EXPO_PUBLIC_DEMO === '1' || !url || !clave;

export const supabase: SupabaseClient | null = modoDemo
	? null
	: createClient(url!, clave!, {
			auth: {
				flowType: 'pkce',
				storage: almacenamiento,
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: false
			}
		});

// En móvil el refresco del token se pausa con la app en segundo plano
if (supabase && Platform.OS !== 'web') {
	AppState.addEventListener('change', (estado) => {
		if (estado === 'active') supabase.auth.startAutoRefresh();
		else supabase.auth.stopAutoRefresh();
	});
}

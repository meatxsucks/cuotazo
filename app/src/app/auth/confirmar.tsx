import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { confirmar } from '@/datos/auth';
import { modoDemo } from '@/datos/cliente';
import { useTema } from '@/tema/tema';

// Destino del enlace mágico y del ingreso con Google (web y deep link cuotazo://auth/confirmar)
export default function Confirmar() {
	const { c } = useTema();
	const params = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string }>();

	useEffect(() => {
		if (modoDemo) {
			router.replace('/');
			return;
		}
		confirmar(params).then((ok) => router.replace(ok ? '/' : { pathname: '/login', params: { error: 'enlace' } }));
	}, [params.code, params.token_hash, params.type]);

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.fondo }}>
			<ActivityIndicator color={c.acento} />
			<Text style={{ color: c.texto3 }}>Confirmando tu acceso…</Text>
		</View>
	);
}

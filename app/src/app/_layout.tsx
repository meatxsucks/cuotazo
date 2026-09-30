import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProveedorSesion } from '@/datos/sesion';
import { useTema } from '@/tema/tema';

function Raiz() {
	const { c, modo } = useTema();
	return (
		<View style={{ flex: 1, backgroundColor: c.fondo }}>
			<StatusBar style={modo === 'oscuro' ? 'light' : 'dark'} />
			<Slot />
		</View>
	);
}

export default function Layout() {
	return (
		<SafeAreaProvider>
			<ProveedorSesion>
				<Raiz />
			</ProveedorSesion>
		</SafeAreaProvider>
	);
}

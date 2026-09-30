import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hoyChile } from '@/lib/fechas';
import { fecha, fechaHora } from '@/lib/formato';
import { comunes } from '@/tema/comunes';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import type { Tema } from '@/tema/tokens';
import { Boton, Insignia, Tarjeta, Vacio } from './base';

export interface DatosApp {
	modoDemo: boolean;
	email: string | null;
	nombre: string | null;
	actualizado: string | null;
}

export const ContextoApp = createContext<DatosApp>({ modoDemo: false, email: null, nombre: null, actualizado: null });

export const ALTO_NAV = 64;

export function useTitulo(titulo: string) {
	useEffect(() => {
		if (Platform.OS === 'web') document.title = `${titulo} · Cuotazo`;
	}, [titulo]);
}

function textoActualizado(iso: string): string {
	const [f, h] = fechaHora(iso).split(' ');
	return f === fecha(hoyChile()) ? `hoy a las ${h}` : `el ${f} a las ${h}`;
}

// Contenedor de cada pantalla: desplazamiento, márgenes, cabecera y estado de carga
export function Pagina({
	titulo,
	subtitulo,
	derecha,
	cargando,
	error,
	sinDatos,
	onReintentar,
	children
}: {
	titulo: string;
	subtitulo?: string;
	derecha?: ReactNode;
	cargando?: boolean;
	error?: string | null;
	sinDatos?: boolean;
	onReintentar?: () => void;
	children?: ReactNode;
}) {
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);
	const { c } = useTema();
	const app = useContext(ContextoApp);
	const { escritorio } = useAncho();
	const insets = useSafeAreaInsets();
	useTitulo(titulo);

	const opacidad = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		Animated.timing(opacidad, { toValue: cargando && !sinDatos ? 0.6 : 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
	}, [cargando, sinDatos, opacidad]);

	const relleno = escritorio
		? { paddingTop: 32, paddingHorizontal: 40, paddingBottom: 48 }
		: { paddingTop: 20 + insets.top, paddingHorizontal: 16, paddingBottom: ALTO_NAV + insets.bottom + 28 };

	return (
		<ScrollView
			style={e.scroll}
			contentContainerStyle={relleno}
			keyboardShouldPersistTaps="handled"
			refreshControl={Platform.OS !== 'web' && onReintentar ? <RefreshControl refreshing={false} onRefresh={onReintentar} tintColor={c.acento} /> : undefined}
		>
			<View style={e.contenido}>
				{app.modoDemo || app.actualizado ? (
					<View style={[e.estado, escritorio && e.estadoEscritorio]}>
						{app.modoDemo && !escritorio ? <Insignia clase="aviso" texto="Demo · datos sintéticos" /> : null}
						{app.actualizado ? <Text style={e.estadoTexto}>Actualizado {textoActualizado(app.actualizado)}</Text> : null}
					</View>
				) : null}
				<View style={e.cabecera}>
					<View style={{ flexShrink: 1, minWidth: 0 }}>
						<Text style={k.h1} role="heading" aria-level={1}>
							{titulo}
						</Text>
						{subtitulo ? <Text style={e.subtitulo}>{subtitulo}</Text> : null}
					</View>
					{derecha}
				</View>
				{error ? (
					<Tarjeta>
						<Vacio icono="alerta" titulo="Algo salió mal">
							No pudimos cargar tus datos. Intenta de nuevo en un momento.
						</Vacio>
						{onReintentar ? (
							<View style={{ alignItems: 'center', marginBottom: 16 }}>
								<Boton texto="Reintentar" onPress={onReintentar} />
							</View>
						) : null}
					</Tarjeta>
				) : sinDatos ? (
					<Esqueleto />
				) : (
					<Animated.View style={{ gap: 16, opacity: opacidad }}>{children}</Animated.View>
				)}
			</View>
		</ScrollView>
	);
}

function Esqueleto() {
	const { c } = useTema();
	const pulso = useRef(new Animated.Value(0.5)).current;
	useEffect(() => {
		const a = Animated.loop(
			Animated.sequence([
				Animated.timing(pulso, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
				Animated.timing(pulso, { toValue: 0.5, duration: 600, useNativeDriver: Platform.OS !== 'web' })
			])
		);
		a.start();
		return () => a.stop();
	}, [pulso]);
	return (
		<Animated.View style={{ gap: 16, opacity: pulso }} aria-busy aria-label="Cargando">
			{[160, 96, 220].map((h, i) => (
				<View key={i} style={{ height: h, borderRadius: 16, backgroundColor: c.superficie2 }} />
			))}
		</Animated.View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		scroll: { flex: 1, backgroundColor: c.fondo },
		contenido: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 16 },
		estado: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 6, marginBottom: -2 },
		estadoEscritorio: { justifyContent: 'flex-end', marginTop: -12, marginBottom: -8 },
		estadoTexto: { fontSize: 12.5, color: c.texto3 },
		cabecera: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: 16, rowGap: 12, marginBottom: 4 },
		subtitulo: { color: c.texto3, fontSize: 14.4, marginTop: 2 }
	});
}

import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Boton, CampoTexto, Degradado, Mensaje } from '@/componentes/base';
import { Icono } from '@/componentes/Icono';
import { Logo } from '@/componentes/Navegacion';
import { useTitulo } from '@/componentes/Pagina';
import { enviarEnlace, entrarConGoogle } from '@/datos/auth';
import { useSesion } from '@/datos/sesion';
import { comunes } from '@/tema/comunes';
import { useEstilos, useTema } from '@/tema/tema';
import type { Tema } from '@/tema/tokens';

function LogoGoogle() {
	return (
		<Svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
			<Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
			<Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
			<Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
			<Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
		</Svg>
	);
}

export default function Login() {
	const { modoDemo, sesion, cargando } = useSesion();
	const { c } = useTema();
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);
	const params = useLocalSearchParams<{ error?: string }>();
	const [email, setEmail] = useState('');
	const [enviado, setEnviado] = useState(false);
	const [enviando, setEnviando] = useState(false);
	const [conGoogle, setConGoogle] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useTitulo('Ingresar');

	if (!cargando && sesion) return <Redirect href="/" />;

	async function enviar() {
		const limpio = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
			setError('Escribe un correo válido.');
			return;
		}
		setEnviando(true);
		setError(null);
		const r = await enviarEnlace(limpio);
		setEnviando(false);
		if (r.ok) setEnviado(true);
		else setError(r.error);
	}

	async function google() {
		setConGoogle(true);
		setError(null);
		const r = await entrarConGoogle();
		setConGoogle(false);
		if (r) setError(r);
	}

	return (
		<ScrollView style={{ flex: 1, backgroundColor: c.fondo }} contentContainerStyle={e.fondo} keyboardShouldPersistTaps="handled">
			<Degradado color={c.acentoSuave} hasta={0.7} />
			<View style={e.caja}>
				<View style={e.marca}>
					<Logo tam={38} />
					<Text style={e.marcaTexto}>Cuotazo</Text>
				</View>

				{modoDemo ? (
					<>
						<Text style={[k.h1, { fontSize: 24 }]} role="heading" aria-level={1}>
							Modo demostración
						</Text>
						<Text style={k.cuerpo}>La app no tiene Supabase configurado, así que muestra datos sintéticos y no necesita iniciar sesión.</Text>
						<Boton variante="primario" href="/" texto="Ver la demo" ancho />
					</>
				) : enviado ? (
					<View style={{ gap: 10, alignItems: 'flex-start' }}>
						<View style={e.iconoGrande}>
							<Icono nombre="correo" tam={26} color={c.acentoTinta} />
						</View>
						<Text style={[k.h1, { fontSize: 24 }]} role="heading" aria-level={1}>
							Revisa tu correo
						</Text>
						<Text style={k.cuerpo}>
							Te enviamos un enlace de acceso a <Text style={{ fontWeight: '700' }}>{email.trim().toLowerCase()}</Text>. Ábrelo en este mismo dispositivo.
						</Text>
						<Boton variante="fantasma" texto="Usar otro correo" onPress={() => setEnviado(false)} />
					</View>
				) : (
					<>
						<Text style={[k.h1, { fontSize: 24 }]} role="heading" aria-level={1}>
							Tus finanzas, claras
						</Text>
						<Text style={k.cuerpo}>Ingresa con tu correo: te enviaremos un enlace mágico, sin contraseñas.</Text>
						{params.error === 'enlace' ? <Mensaje tipo="error">El enlace expiró o ya se usó. Pide uno nuevo.</Mensaje> : null}
						{error ? <Mensaje tipo="error">{error}</Mensaje> : null}
						<Pressable role="button" onPress={google} disabled={conGoogle} style={e.google}>
							{conGoogle ? <ActivityIndicator color={c.texto2} /> : <LogoGoogle />}
							<Text style={e.googleTexto}>Continuar con Google</Text>
						</Pressable>
						<Text style={[k.tenue, { textAlign: 'center' }]}>o con tu correo</Text>
						<CampoTexto
							etiqueta="Correo electrónico"
							value={email}
							onChangeText={setEmail}
							placeholder="nombre@correo.cl"
							inputMode="email"
							autoComplete="email"
							autoCapitalize="none"
							autoCorrect={false}
							onSubmitEditing={enviar}
							style={{ minHeight: 46 }}
						/>
						<Boton variante="primario" texto={enviando ? 'Enviando…' : 'Enviar enlace de acceso'} deshabilitado={enviando} onPress={enviar} ancho />
					</>
				)}
				<View style={e.pie}>
					<Icono nombre="candado" tam={14} color={c.texto3} />
					<Text style={[k.tenue, { fontSize: 12.2, flex: 1 }]}>Solo tú ves tus datos. Nunca pedimos claves bancarias aquí.</Text>
				</View>
			</View>
		</ScrollView>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		fondo: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16 },
		caja: {
			width: '100%',
			maxWidth: 400,
			backgroundColor: c.superficie,
			borderWidth: 1,
			borderColor: c.borde,
			borderRadius: 22,
			boxShadow: c.sombraAlta,
			paddingVertical: 28,
			paddingHorizontal: 24,
			gap: 14
		},
		marca: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
		marcaTexto: { fontWeight: '700', letterSpacing: -0.32, fontSize: 16, color: c.texto },
		google: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 10,
			minHeight: 46,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: c.borde,
			backgroundColor: c.superficie,
			marginTop: 6
		},
		googleTexto: { fontWeight: '600', fontSize: 14.4, color: c.texto },
		iconoGrande: { width: 52, height: 52, borderRadius: 16, backgroundColor: c.acentoSuave, alignItems: 'center', justifyContent: 'center' },
		pie: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.borde }
	});
}

import { Link, type Href } from 'expo-router';
import { Children, isValidElement, useId, useState, type ReactNode } from 'react';
import {
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
	type PressableStateCallbackType,
	type StyleProp,
	type TextInputProps,
	type ViewStyle
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { comunes } from '@/tema/comunes';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { NUMEROS, radio, type Tema } from '@/tema/tokens';
import { Icono, type NombreIcono } from './Icono';

type EstadoPresion = PressableStateCallbackType & { hovered?: boolean };

// Degradado radial desde la esquina superior derecha, como el radial-gradient de la web
export function Degradado({ color, hasta = 0.6 }: { color: string; hasta?: number }) {
	const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<Svg width="100%" height="100%">
				<Defs>
					<RadialGradient id={id} cx="100%" cy="0%" rx="120%" ry="140%" fx="100%" fy="0%" gradientUnits="objectBoundingBox">
						<Stop offset="0" stopColor={color} stopOpacity={1} />
						<Stop offset={String(hasta)} stopColor={color} stopOpacity={0} />
					</RadialGradient>
				</Defs>
				<Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
			</Svg>
		</View>
	);
}

export function Tarjeta({
	children,
	estilo,
	degradado
}: {
	children: ReactNode;
	estilo?: StyleProp<ViewStyle>;
	degradado?: string | null;
}) {
	const e = useEstilos(comunes);
	return (
		<View style={[e.tarjeta, degradado ? { overflow: 'hidden' } : null, estilo]}>
			{degradado ? <Degradado color={degradado} /> : null}
			{children}
		</View>
	);
}

export function CabeceraTarjeta({
	titulo,
	subtitulo,
	derecha
}: {
	titulo: ReactNode;
	subtitulo?: ReactNode;
	derecha?: ReactNode;
}) {
	const e = useEstilos(comunes);
	return (
		<View style={e.tarjetaCabecera}>
			<View style={e.cabeceraTexto}>
				{typeof titulo === 'string' ? (
					<Text style={e.h2} role="heading" aria-level={2}>
						{titulo}
					</Text>
				) : (
					titulo
				)}
				{subtitulo != null ? typeof subtitulo === 'string' ? <Text style={e.tenue}>{subtitulo}</Text> : subtitulo : null}
			</View>
			{derecha}
		</View>
	);
}

export function EnlaceCabecera({ href, texto }: { href: Href; texto: string }) {
	const e = useEstilos(comunes);
	return (
		<Link href={href} style={e.enlaceCabecera}>
			{texto}
		</Link>
	);
}

export function Enlace({ href, children }: { href: Href; children: ReactNode }) {
	const e = useEstilos(comunes);
	return (
		<Link href={href} style={e.enlace}>
			{children}
		</Link>
	);
}

export function Punto({ color, tam = 10 }: { color: string; tam?: number }) {
	return <View style={{ width: tam, height: tam, borderRadius: 3, backgroundColor: color, flexShrink: 0 }} />;
}

export type ClaseInsignia = 'normal' | 'acento' | 'aviso' | 'negativo' | 'ok' | 'pronostico';

export function Insignia({ texto, clase = 'normal', icono }: { texto: string; clase?: ClaseInsignia; icono?: NombreIcono }) {
	const { c } = useTema();
	const [fondo, color] =
		clase === 'acento'
			? [c.acentoSuave, c.acentoTinta]
			: clase === 'aviso' || clase === 'pronostico'
				? [c.avisoSuave, c.aviso]
				: clase === 'negativo'
					? [c.negativoSuave, c.negativo]
					: clase === 'ok'
						? [c.positivoSuave, c.positivo]
						: [c.superficie2, c.texto2];
	return (
		<View style={[estilosFijos.insignia, { backgroundColor: fondo }]}>
			{icono ? <Icono nombre={icono} tam={12} grosor={2.5} color={color} /> : null}
			<Text style={[estilosFijos.insigniaTexto, { color }]} numberOfLines={1}>
				{texto}
			</Text>
		</View>
	);
}

export type VarianteBoton = 'normal' | 'primario' | 'fantasma';

export function Boton({
	texto,
	icono,
	onPress,
	variante = 'normal',
	chico,
	deshabilitado,
	ancho,
	color,
	expandido,
	etiqueta,
	href,
	iconoDerecha
}: {
	texto: string;
	icono?: NombreIcono;
	onPress?: () => void;
	variante?: VarianteBoton;
	chico?: boolean;
	deshabilitado?: boolean;
	ancho?: boolean;
	color?: string;
	expandido?: boolean;
	etiqueta?: string;
	href?: Href;
	iconoDerecha?: boolean;
}) {
	const { c } = useTema();
	const colorTexto = color ?? (variante === 'primario' ? c.acentoTexto : c.texto);
	const estilo = ({ pressed, hovered }: EstadoPresion): StyleProp<ViewStyle> => [
		estilosFijos.boton,
		chico && estilosFijos.botonChico,
		ancho && { alignSelf: 'stretch' },
		variante === 'primario'
			? { backgroundColor: c.acento, borderColor: c.acento, opacity: pressed ? 0.85 : 1 }
			: variante === 'fantasma'
				? { backgroundColor: hovered || pressed ? c.superficie2 : 'transparent', borderColor: 'transparent' }
				: { backgroundColor: hovered || pressed ? c.superficie2 : c.superficie, borderColor: c.bordeFuerte },
		deshabilitado && { opacity: 0.55 }
	];
	const contenido = (
		<>
			{icono && !iconoDerecha ? <Icono nombre={icono} tam={chico ? 15 : 16} color={colorTexto} /> : null}
			<Text style={[estilosFijos.botonTexto, chico && { fontSize: 13 }, { color: colorTexto }]} numberOfLines={1}>
				{texto}
			</Text>
			{icono && iconoDerecha ? <Icono nombre={icono} tam={chico ? 15 : 16} color={colorTexto} /> : null}
		</>
	);
	if (href) {
		return (
			<Link href={href} asChild>
				<Pressable style={estilo as (s: PressableStateCallbackType) => StyleProp<ViewStyle>} aria-label={etiqueta}>
					{contenido}
				</Pressable>
			</Link>
		);
	}
	return (
		<Pressable
			role="button"
			onPress={onPress}
			disabled={deshabilitado}
			aria-disabled={deshabilitado}
			aria-expanded={expandido}
			aria-label={etiqueta}
			style={estilo as (s: PressableStateCallbackType) => StyleProp<ViewStyle>}
		>
			{contenido}
		</Pressable>
	);
}

export function Vacio({
	icono = 'vacio',
	titulo,
	compacto,
	children
}: {
	icono?: NombreIcono;
	titulo: string;
	compacto?: boolean;
	children?: ReactNode;
}) {
	const { c } = useTema();
	const e = useEstilos(comunes);
	return (
		<View style={[estilosFijos.vacio, compacto && { paddingVertical: 24, paddingHorizontal: 12 }]}>
			<View
				style={[
					estilosFijos.vacioIcono,
					{ backgroundColor: c.superficie2 },
					compacto && { width: 42, height: 42, borderRadius: 13 }
				]}
			>
				<Icono nombre={icono} tam={compacto ? 20 : 26} color={c.texto3} />
			</View>
			<Text style={[e.texto, e.fuerte, { textAlign: 'center' }]}>{titulo}</Text>
			{children ? <Text style={[e.tenue, { textAlign: 'center', fontSize: 14.4 }]}>{children}</Text> : null}
		</View>
	);
}

export function Mensaje({ tipo, children }: { tipo: 'ok' | 'error'; children: ReactNode }) {
	const { c } = useTema();
	const color = tipo === 'ok' ? c.positivo : c.negativo;
	return (
		<View
			role={tipo === 'error' ? 'alert' : 'status'}
			style={[estilosFijos.mensaje, { backgroundColor: tipo === 'ok' ? c.positivoSuave : c.negativoSuave }]}
		>
			<Icono nombre={tipo === 'ok' ? 'ok' : 'alerta'} tam={18} color={color} />
			<Text style={{ color, fontSize: 14.4, fontWeight: '500', flex: 1 }}>{children}</Text>
		</View>
	);
}

// Rejilla que pasa a varias columnas desde 720 px de ancho (como .rejilla-2/.rejilla-3)
export function Rejilla({ columnas, children, desde = 720, espacio = 16 }: { columnas: number; children: ReactNode; desde?: number; espacio?: number }) {
	const { ventana } = useAncho();
	const hijos = Children.toArray(children).filter(isValidElement);
	const n = ventana >= desde ? columnas : 1;
	if (n === 1) return <View style={{ gap: espacio }}>{hijos}</View>;
	const filas: ReactNode[][] = [];
	for (let i = 0; i < hijos.length; i += n) filas.push(hijos.slice(i, i + n));
	return (
		<View style={{ gap: espacio }}>
			{filas.map((f, i) => (
				<View key={i} style={{ flexDirection: 'row', gap: espacio, alignItems: 'stretch' }}>
					{f.map((h, k) => (
						<View key={k} style={{ flex: 1, minWidth: 0 }}>
							{h}
						</View>
					))}
					{Array.from({ length: n - f.length }, (_, k) => (
						<View key={`v${k}`} style={{ flex: 1 }} />
					))}
				</View>
			))}
		</View>
	);
}

export function Casilla({
	marcada,
	onCambio,
	etiqueta,
	deshabilitada,
	children
}: {
	marcada: boolean;
	onCambio: (v: boolean) => void;
	etiqueta: string;
	deshabilitada?: boolean;
	children?: ReactNode;
}) {
	const { c } = useTema();
	return (
		<Pressable
			role="checkbox"
			aria-checked={marcada}
			aria-label={etiqueta}
			aria-disabled={deshabilitada}
			disabled={deshabilitada}
			onPress={() => onCambio(!marcada)}
			style={[estilosFijos.casillaFila, deshabilitada && { opacity: 0.55 }]}
		>
			<View
				style={[
					estilosFijos.caja,
					{ borderColor: marcada ? c.acento : c.bordeFuerte, backgroundColor: marcada ? c.acento : c.superficie }
				]}
			>
				{marcada ? <Icono nombre="ok" tam={13} grosor={3} color={c.acentoTexto} /> : null}
			</View>
			{children}
		</Pressable>
	);
}

export function Opcion({ elegida, onElegir, children, etiqueta }: { elegida: boolean; onElegir: () => void; children: ReactNode; etiqueta: string }) {
	const { c } = useTema();
	return (
		<Pressable role="radio" aria-checked={elegida} aria-label={etiqueta} onPress={onElegir} style={estilosFijos.casillaFila}>
			<View style={[estilosFijos.radio, { borderColor: elegida ? c.acento : c.bordeFuerte, backgroundColor: c.superficie }]}>
				{elegida ? <View style={[estilosFijos.radioPunto, { backgroundColor: c.acento }]} /> : null}
			</View>
			{children}
		</Pressable>
	);
}

function estilosCampo({ c }: Tema) {
	return StyleSheet.create({
		campo: { gap: 4, minWidth: 0 },
		etiqueta: { fontSize: 12, fontWeight: '600', color: c.texto3 },
		control: {
			minHeight: 40,
			paddingHorizontal: 12,
			paddingVertical: 8,
			borderRadius: radio.control,
			borderWidth: 1,
			borderColor: c.bordeFuerte,
			backgroundColor: c.superficie,
			fontSize: 14.4,
			color: c.texto,
			fontVariant: NUMEROS,
			width: '100%'
		},
		foco: { borderColor: c.acento, boxShadow: `0px 0px 0px 1px ${c.acento}` },
		adorno: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
		adornoTexto: { color: c.texto3, fontWeight: '600', fontSize: 14.4 },
		ayuda: { fontSize: 11.5, color: c.texto3, lineHeight: 16 }
	});
}

export function CampoTexto({
	etiqueta,
	prefijo,
	sufijo,
	ayuda,
	estilo,
	...resto
}: TextInputProps & { etiqueta?: string; prefijo?: string; sufijo?: string; ayuda?: string; estilo?: StyleProp<ViewStyle> }) {
	const { c } = useTema();
	const e = useEstilos(estilosCampo);
	const [foco, setFoco] = useState(false);
	return (
		<View style={[e.campo, estilo]}>
			{etiqueta ? <Text style={e.etiqueta}>{etiqueta}</Text> : null}
			<View>
				<TextInput
					placeholderTextColor={c.texto3}
					aria-label={resto['aria-label'] ?? etiqueta}
					{...resto}
					onFocus={(ev) => {
						setFoco(true);
						resto.onFocus?.(ev);
					}}
					onBlur={(ev) => {
						setFoco(false);
						resto.onBlur?.(ev);
					}}
					style={[
						e.control,
						foco && e.foco,
						prefijo ? { paddingLeft: 26 } : null,
						sufijo ? { paddingRight: 30 } : null,
						estilosFijos.sinContorno,
						resto.style
					]}
				/>
				{prefijo ? (
					<View style={[e.adorno, { left: 12 }]} pointerEvents="none">
						<Text style={e.adornoTexto}>{prefijo}</Text>
					</View>
				) : null}
				{sufijo ? (
					<View style={[e.adorno, { right: 12 }]} pointerEvents="none">
						<Text style={e.adornoTexto}>{sufijo}</Text>
					</View>
				) : null}
			</View>
			{ayuda ? <Text style={e.ayuda}>{ayuda}</Text> : null}
		</View>
	);
}

export function Etiqueta({ children }: { children: ReactNode }) {
	const e = useEstilos(estilosCampo);
	return <Text style={e.etiqueta}>{children}</Text>;
}

// Separa miles con punto mientras se escribe
export function conMiles(v: string): string {
	const d = v.replace(/\D/g, '').replace(/^0+/, '');
	return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

const estilosFijos = StyleSheet.create({
	insignia: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 1,
		borderRadius: 999,
		alignSelf: 'flex-start',
		flexShrink: 0
	},
	insigniaTexto: { fontSize: 11.5, fontWeight: '600', lineHeight: 18 },
	boton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		minHeight: 40,
		paddingHorizontal: 16,
		borderRadius: 12,
		borderWidth: 1
	},
	botonChico: { minHeight: 34, paddingHorizontal: 10 },
	botonTexto: { fontWeight: '600', fontSize: 14.4 },
	vacio: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 20, maxWidth: 460, alignSelf: 'center', width: '100%' },
	vacioIcono: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
	mensaje: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
	casillaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, flexShrink: 1 },
	caja: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
	radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
	radioPunto: { width: 9, height: 9, borderRadius: 5 },
	sinContorno: { outlineWidth: 0 } as ViewStyle
});


import { Link, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { salir } from '@/datos/auth';
import { useEstilos, useTema } from '@/tema/tema';
import type { Tema } from '@/tema/tokens';
import { Icono, type NombreIcono } from './Icono';
import { ALTO_NAV } from './Pagina';

interface Item {
	href: string;
	texto: string;
	icono: NombreIcono;
}

const ITEMS: Item[] = [
	{ href: '/', texto: 'Resumen', icono: 'resumen' },
	{ href: '/diario', texto: 'Diario', icono: 'diario' },
	{ href: '/categorias', texto: 'Categorías', icono: 'categorias' },
	{ href: '/deudas', texto: 'Deudas', icono: 'deudas' },
	{ href: '/presupuestos', texto: 'Alertas', icono: 'campana' },
	{ href: '/plan', texto: 'Plan', icono: 'plan' },
	{ href: '/movimientos', texto: 'Movimientos', icono: 'movimientos' }
];

// En móvil el Plan y las alertas quedan a un toque; el resto va en "Más"
const PRINCIPALES = ['/', '/diario', '/plan', '/presupuestos'].map((h) => ITEMS.find((i) => i.href === h)!);
const EXTRA = ITEMS.filter((i) => !PRINCIPALES.includes(i));

function useActivo() {
	const ruta = usePathname();
	return (href: string) => (href === '/' ? ruta === '/' : ruta.startsWith(href));
}

export function Logo({ tam = 32 }: { tam?: number }) {
	const { c } = useTema();
	return (
		<View style={{ width: tam, height: tam, borderRadius: tam * 0.31, backgroundColor: c.acento, alignItems: 'center', justifyContent: 'center' }}>
			<Icono nombre="tendencia" tam={tam * 0.56} grosor={2.4} color={c.acentoTexto} />
		</View>
	);
}

export function Lateral({ modoDemo, email, nombre }: { modoDemo: boolean; email: string | null; nombre: string | null }) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const activo = useActivo();
	return (
		<View style={e.lateral} role="navigation" aria-label="Navegación principal">
			<Link href="/" asChild>
				<Pressable style={e.marca} aria-label="Cuotazo, ir al resumen">
					<Logo />
					<Text style={e.marcaTexto}>Cuotazo</Text>
				</Pressable>
			</Link>
			<View style={{ gap: 2 }}>
				{ITEMS.map((it) => {
					const a = activo(it.href);
					return (
						<Link key={it.href} href={it.href as Href} asChild>
							<Pressable aria-current={a ? 'page' : undefined} style={[e.itemLateral, a && { backgroundColor: c.acentoSuave }]}>
								<Icono nombre={it.icono} tam={19} color={a ? c.acentoTinta : c.texto2} />
								<Text style={[e.itemLateralTexto, a && { color: c.acentoTinta }]}>{it.texto}</Text>
							</Pressable>
						</Link>
					);
				})}
			</View>
			<View style={e.pie}>
				{modoDemo ? (
					<View style={e.demo}>
						<Text style={[e.demoTexto, { fontWeight: '700' }]}>Modo demostración</Text>
						<Text style={e.demoTexto}>Datos sintéticos, no reales.</Text>
					</View>
				) : email ? (
					<>
						<View style={e.cuenta}>
							<View style={e.avatar}>
								<Text style={e.avatarTexto}>{(nombre ?? email)[0].toUpperCase()}</Text>
							</View>
							<Text style={e.correo} numberOfLines={1}>
								{nombre ?? email}
							</Text>
						</View>
						<Pressable role="button" onPress={() => salir()} style={e.itemLateral}>
							<Icono nombre="salir" tam={17} color={c.texto2} />
							<Text style={e.itemLateralTexto}>Cerrar sesión</Text>
						</Pressable>
					</>
				) : null}
			</View>
		</View>
	);
}

export function BarraInferior({ modoDemo, email }: { modoDemo: boolean; email: string | null }) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const activo = useActivo();
	const ruta = usePathname();
	const insets = useSafeAreaInsets();
	const [abierto, setAbierto] = useState(false);
	const extraActivo = EXTRA.some((i) => activo(i.href));

	useEffect(() => setAbierto(false), [ruta]);

	return (
		<>
			<View style={[e.inferior, { height: ALTO_NAV + insets.bottom, paddingBottom: insets.bottom }]} role="navigation" aria-label="Navegación principal">
				{PRINCIPALES.map((it) => {
					const a = activo(it.href);
					return (
						<Link key={it.href} href={it.href as Href} asChild>
							<Pressable style={e.itemInferior} aria-current={a ? 'page' : undefined} aria-label={it.texto}>
								{a ? <View style={e.marcaActiva} /> : null}
								<Icono nombre={it.icono} tam={22} color={a ? c.acentoTinta : c.texto3} />
								<Text style={[e.itemInferiorTexto, a && { color: c.acentoTinta }]}>{it.texto}</Text>
							</Pressable>
						</Link>
					);
				})}
				<Pressable style={e.itemInferior} role="button" aria-expanded={abierto} aria-label="Más" onPress={() => setAbierto(!abierto)}>
					{extraActivo || abierto ? <View style={e.marcaActiva} /> : null}
					<Icono nombre="mas" tam={22} grosor={2.6} color={extraActivo || abierto ? c.acentoTinta : c.texto3} />
					<Text style={[e.itemInferiorTexto, (extraActivo || abierto) && { color: c.acentoTinta }]}>Más</Text>
				</Pressable>
			</View>
			<Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
				<Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.velo }]} aria-label="Cerrar menú" onPress={() => setAbierto(false)} />
				<View style={[e.hoja, { bottom: ALTO_NAV + insets.bottom + 10 }]} role="menu">
					{EXTRA.map((it) => {
						const a = activo(it.href);
						return (
							<Link key={it.href} href={it.href as Href} asChild>
								<Pressable role="menuitem" style={[e.itemHoja, a && { backgroundColor: c.acentoSuave }]} onPress={() => setAbierto(false)}>
									<Icono nombre={it.icono} tam={20} color={a ? c.acentoTinta : c.texto} />
									<Text style={[e.itemHojaTexto, a && { color: c.acentoTinta }]}>{it.texto}</Text>
								</Pressable>
							</Link>
						);
					})}
					{modoDemo ? (
						<Text style={e.nota}>Modo demostración · datos sintéticos</Text>
					) : email ? (
						<>
							<Pressable role="menuitem" style={e.itemHoja} onPress={() => salir()}>
								<Icono nombre="salir" tam={20} color={c.texto} />
								<Text style={e.itemHojaTexto}>Cerrar sesión</Text>
							</Pressable>
							<Text style={e.nota} numberOfLines={1}>
								{email}
							</Text>
						</>
					) : null}
				</View>
			</Modal>
		</>
	);
}

function estilos({ c, modo }: Tema) {
	return StyleSheet.create({
		lateral: {
			width: 248,
			height: '100%',
			gap: 24,
			paddingVertical: 22,
			paddingHorizontal: 14,
			borderRightWidth: 1,
			borderRightColor: c.borde,
			backgroundColor: c.superficie
		},
		marca: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 10 },
		marcaTexto: { color: c.texto, fontWeight: '700', fontSize: 16.8, letterSpacing: -0.34 },
		itemLateral: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11 },
		itemLateralTexto: { color: c.texto2, fontWeight: '500', fontSize: 14.9 },
		pie: { marginTop: 'auto', gap: 8 },
		demo: { padding: 12, borderRadius: 12, backgroundColor: c.avisoSuave },
		demoTexto: { color: c.aviso, fontSize: 12.8 },
		cuenta: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, minWidth: 0 },
		avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.superficie3, alignItems: 'center', justifyContent: 'center' },
		avatarTexto: { fontWeight: '700', fontSize: 12.8, color: c.texto },
		correo: { fontSize: 13.6, color: c.texto, flex: 1 },
		inferior: {
			position: 'absolute',
			left: 0,
			right: 0,
			bottom: 0,
			flexDirection: 'row',
			backgroundColor: modo === 'oscuro' ? 'rgba(21,25,24,0.94)' : 'rgba(255,255,255,0.92)',
			backdropFilter: 'saturate(1.6) blur(16px)',
			borderTopWidth: 1,
			borderTopColor: c.borde
		} as object,
		itemInferior: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' },
		itemInferiorTexto: { fontSize: 10.9, fontWeight: '600', color: c.texto3 },
		marcaActiva: { position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.acento },
		hoja: {
			position: 'absolute',
			left: 12,
			right: 12,
			backgroundColor: c.superficie,
			borderWidth: 1,
			borderColor: c.borde,
			borderRadius: 18,
			boxShadow: c.sombraAlta,
			padding: 8
		},
		itemHoja: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12 },
		itemHojaTexto: { color: c.texto, fontWeight: '500', fontSize: 16 },
		nota: { fontSize: 12.5, color: c.texto3, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 4, borderTopWidth: 1, borderTopColor: c.borde, marginTop: 4 }
	});
}

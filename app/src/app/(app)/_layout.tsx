import { Redirect, Slot } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Tarjeta, Vacio } from '@/componentes/base';
import { BarraInferior, Lateral } from '@/componentes/Navegacion';
import { ContextoApp, Pagina } from '@/componentes/Pagina';
import { useCarga } from '@/datos/carga';
import { useSesion } from '@/datos/sesion';
import { useAncho, useTema } from '@/tema/tema';

export default function LayoutApp() {
	const { modoDemo, cargando, sesion, email, fuente } = useSesion();
	const { c } = useTema();
	const { escritorio } = useAncho();
	const conDatos = modoDemo || !!sesion;

	// Usuario vinculado y hora de la última publicación
	const perfil = useCarga(async () => {
		if (!conDatos) return null;
		const [u, pubs] = await Promise.all([fuente.usuario().catch(() => null), fuente.publicaciones().catch(() => [])]);
		const actualizado = pubs.reduce<string | null>((max, p) => (!max || p.publicado_en > max ? p.publicado_en : max), null);
		return { usuario: u, actualizado };
	}, [fuente, conDatos]);

	if (cargando) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fondo }}>
				<ActivityIndicator color={c.acento} />
			</View>
		);
	}
	if (!conDatos) return <Redirect href="/login" />;

	const vinculado = modoDemo || perfil.cargando || perfil.datos?.usuario != null;
	const valor = {
		modoDemo,
		email,
		nombre: perfil.datos?.usuario?.nombre_visible ?? null,
		actualizado: perfil.datos?.actualizado ?? null
	};

	return (
		<ContextoApp.Provider value={valor}>
			<View style={{ flex: 1, flexDirection: escritorio ? 'row' : 'column', backgroundColor: c.fondo }}>
				{escritorio ? <Lateral modoDemo={modoDemo} email={email} nombre={valor.nombre} /> : null}
				<View style={{ flex: 1, minWidth: 0 }}>
					{vinculado ? (
						<Slot />
					) : (
						<Pagina titulo="Cuotazo">
							<Tarjeta>
								<Vacio icono="enlace" titulo="Tu cuenta aún no tiene datos vinculados">
									Iniciaste sesión como {email}, pero todavía no hay bancos asociados a este usuario. Cuando se vincule tu cuenta y se
									publique la primera carga, aquí verás tus movimientos, deudas y presupuestos.
								</Vacio>
							</Tarjeta>
						</Pagina>
					)}
				</View>
				{escritorio ? null : <BarraInferior modoDemo={modoDemo} email={email} />}
			</View>
		</ContextoApp.Provider>
	);
}

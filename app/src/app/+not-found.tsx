import { View } from 'react-native';
import { Boton, Tarjeta, Vacio } from '@/componentes/base';
import { useTitulo } from '@/componentes/Pagina';
import { useTema } from '@/tema/tema';

export default function NoEncontrada() {
	const { c } = useTema();
	useTitulo('Página no encontrada');
	return (
		<View style={{ flex: 1, backgroundColor: c.fondo, padding: 16, justifyContent: 'center' }}>
			<Tarjeta estilo={{ maxWidth: 480, width: '100%', alignSelf: 'center' }}>
				<Vacio icono="alerta" titulo="Página no encontrada">
					La dirección no existe.
				</Vacio>
				<View style={{ alignItems: 'center', marginBottom: 12 }}>
					<Boton href="/" texto="Volver al resumen" />
				</View>
			</Tarjeta>
		</View>
	);
}

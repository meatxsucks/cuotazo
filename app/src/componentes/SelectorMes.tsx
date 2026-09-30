import { Pressable, StyleSheet, Text, View } from 'react-native';
import { mesActual, sumarMeses } from '@/lib/fechas';
import { mesLargo } from '@/lib/formato';
import { useEstilos, useTema } from '@/tema/tema';
import type { Tema } from '@/tema/tokens';
import { Icono } from './Icono';

export function SelectorMes({
	mes,
	minimo,
	maximo = mesActual(),
	onCambio
}: {
	mes: string;
	minimo?: string;
	maximo?: string;
	onCambio: (mes: string) => void;
}) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const anterior = sumarMeses(mes, -1);
	const siguiente = sumarMeses(mes, 1);
	const hayAnterior = !minimo || anterior >= minimo;
	const haySiguiente = siguiente <= maximo;
	return (
		<View style={e.selector} role="group" aria-label="Mes">
			<Pressable
				role="button"
				aria-label="Mes anterior"
				disabled={!hayAnterior}
				onPress={() => onCambio(anterior)}
				style={[e.flecha, !hayAnterior && e.apagada]}
			>
				<Icono nombre="izquierda" tam={18} color={c.texto2} />
			</Pressable>
			<Text style={e.mes}>{mesLargo(mes)}</Text>
			<Pressable
				role="button"
				aria-label="Mes siguiente"
				disabled={!haySiguiente}
				onPress={() => onCambio(siguiente)}
				style={[e.flecha, !haySiguiente && e.apagada]}
			>
				<Icono nombre="derecha" tam={18} color={c.texto2} />
			</Pressable>
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		selector: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 2,
			padding: 3,
			borderRadius: 12,
			backgroundColor: c.superficie,
			borderWidth: 1,
			borderColor: c.borde,
			alignSelf: 'flex-start'
		},
		flecha: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
		apagada: { opacity: 0.3 },
		mes: { minWidth: 128, textAlign: 'center', fontWeight: '600', fontSize: 14.4, color: c.texto }
	});
}

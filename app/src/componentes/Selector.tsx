import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { radio, type Tema } from '@/tema/tokens';
import { Etiqueta } from './base';
import { Icono } from './Icono';

export interface OpcionSelector {
	valor: string;
	texto: string;
	deshabilitada?: boolean;
}

// Reemplazo portable de <select>: abre una lista en un modal
export function Selector({
	etiqueta,
	valor,
	opciones,
	onCambio,
	placeholder = 'Elegir'
}: {
	etiqueta: string;
	valor: string;
	opciones: OpcionSelector[];
	onCambio: (v: string) => void;
	placeholder?: string;
}) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const { escritorio } = useAncho();
	const [abierto, setAbierto] = useState(false);
	const actual = opciones.find((o) => o.valor === valor);

	return (
		<View style={e.campo}>
			<Etiqueta>{etiqueta}</Etiqueta>
			<Pressable role="button" aria-label={`${etiqueta}: ${actual?.texto ?? placeholder}`} onPress={() => setAbierto(true)} style={e.control}>
				<Text style={[e.valor, !actual && { color: c.texto3 }]} numberOfLines={1}>
					{actual?.texto ?? placeholder}
				</Text>
				<Icono nombre="bajada" tam={12} grosor={2.5} color={c.texto3} />
			</Pressable>
			<Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
				<View style={[e.envoltura, escritorio ? e.centro : e.abajo]}>
					<Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.velo }]} aria-label="Cerrar" onPress={() => setAbierto(false)} />
					<View style={[e.hoja, escritorio && e.hojaEscritorio]} role="list" aria-label={etiqueta}>
						<Text style={e.titulo}>{etiqueta}</Text>
						<ScrollView style={{ flexGrow: 0 }}>
							{opciones.map((o) => {
								const elegida = o.valor === valor;
								return (
									<Pressable
										key={o.valor || '_'}
										role="button"
										aria-selected={elegida}
										disabled={o.deshabilitada}
										onPress={() => {
											onCambio(o.valor);
											setAbierto(false);
										}}
										style={[e.opcion, elegida && { backgroundColor: c.acentoSuave }, o.deshabilitada && { opacity: 0.45 }]}
									>
										<Text style={[e.opcionTexto, elegida && { color: c.acentoTinta, fontWeight: '600' }]} numberOfLines={1}>
											{o.texto}
										</Text>
										{elegida ? <Icono nombre="ok" tam={16} color={c.acentoTinta} /> : null}
									</Pressable>
								);
							})}
						</ScrollView>
					</View>
				</View>
			</Modal>
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		campo: { gap: 4, minWidth: 0, flex: 1 },
		control: {
			minHeight: 40,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			paddingHorizontal: 12,
			borderRadius: radio.control,
			borderWidth: 1,
			borderColor: c.bordeFuerte,
			backgroundColor: c.superficie
		},
		valor: { flex: 1, fontSize: 14.4, color: c.texto },
		envoltura: { flex: 1, padding: 12 },
		centro: { justifyContent: 'center', alignItems: 'center' },
		abajo: { justifyContent: 'flex-end' },
		hoja: {
			backgroundColor: c.superficie,
			borderRadius: 18,
			borderWidth: 1,
			borderColor: c.borde,
			boxShadow: c.sombraAlta,
			padding: 8,
			maxHeight: '75%'
		},
		hojaEscritorio: { width: 420, maxHeight: '70%' },
		titulo: { fontSize: 12, fontWeight: '600', color: c.texto3, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
		opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
		opcionTexto: { flex: 1, fontSize: 15, color: c.texto }
	});
}

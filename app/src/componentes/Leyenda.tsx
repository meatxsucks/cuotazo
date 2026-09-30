import { Text, View } from 'react-native';
import { useTema } from '@/tema/tema';
import { Punto } from './base';

export function Leyenda({ items }: { items: { id: string; nombre: string; color: string }[] }) {
	const { c } = useTema();
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 12 }}>
			{items.map((it) => (
				<View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
					<Punto color={it.color} />
					<Text style={{ fontSize: 12.5, color: c.texto2, flexShrink: 1 }} numberOfLines={1}>
						{it.nombre}
					</Text>
				</View>
			))}
		</View>
	);
}

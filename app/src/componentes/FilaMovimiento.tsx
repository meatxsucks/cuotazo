import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Movimiento } from '@/datos/tipos';
import { nombreCategoria } from '@/lib/categorias';
import { clp, fecha, fechasMovimiento, NOMBRES_ESTADO, nombreBanco } from '@/lib/formato';
import { useEstilos, useTema } from '@/tema/tema';
import { conAlfa, mezclar, NUMEROS, type Tema } from '@/tema/tokens';
import { Insignia } from './base';

export const FilaMovimiento = memo(function FilaMovimiento({ m, conFecha, ultima }: { m: Movimiento; conFecha?: boolean; ultima?: boolean }) {
	const t = useTema();
	const e = useEstilos(estilos);
	const color = t.cat(m.categoria);
	const entrada = m.monto > 0;
	const neutro = m.tipo_flujo === 'transferencia_interna' || m.tipo_flujo === 'pago_deuda';
	const titulo = m.comercio ?? m.glosa;
	const pendiente = m.estado === 'no_facturado' || m.estado === 'pendiente';
	const f = fechasMovimiento(m);
	return (
		<View style={[e.fila, ultima && { borderBottomWidth: 0 }]} role="listitem">
			<View style={[e.marca, { backgroundColor: mezclar(color, t.c.superficie, 20), boxShadow: `inset 0px 0px 0px 1.5px ${conAlfa(color, 0.55)}` }]} aria-hidden>
				<Text style={e.inicial}>{titulo.slice(0, 1).toUpperCase()}</Text>
			</View>
			<View style={e.cuerpo}>
				<Text style={e.titulo} numberOfLines={1}>
					{titulo}
				</Text>
				<Text style={e.meta} numberOfLines={1}>
					{conFecha ? `${fecha(f.mostrada)} · ` : ''}
					{nombreCategoria(m.categoria)} · {m.producto_nombre} · {nombreBanco(m.banco)}
				</Text>
				{m.cuotas_total || f.nota || pendiente ? (
					<View style={e.insignias}>
						{m.cuotas_total ? <Insignia clase="acento" texto={`Cuota ${m.cuota_actual}/${m.cuotas_total}`} /> : null}
						{f.nota ? <Insignia texto={f.nota} /> : null}
						{pendiente ? <Insignia clase="aviso" texto={NOMBRES_ESTADO[m.estado]} /> : null}
					</View>
				) : null}
			</View>
			<View style={e.monto}>
				<Text style={[e.valor, entrada && !neutro && { color: t.c.positivo }, neutro && { color: t.c.texto2 }]}>{clp(m.monto, true)}</Text>
				{m.monto_total_compra ? <Text style={e.total}>de {clp(m.monto_total_compra)}</Text> : null}
			</View>
		</View>
	);
});

function estilos({ c }: Tema) {
	return StyleSheet.create({
		fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borde },
		marca: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
		inicial: { color: c.texto, fontWeight: '700', fontSize: 13.6 },
		cuerpo: { flex: 1, minWidth: 0 },
		titulo: { fontWeight: '600', fontSize: 14.9, color: c.texto },
		meta: { fontSize: 12.5, color: c.texto3 },
		insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
		monto: { alignItems: 'flex-end', flexShrink: 0 },
		valor: { fontWeight: '600', fontSize: 14.9, fontVariant: NUMEROS, color: c.texto },
		total: { fontSize: 11.5, color: c.texto3, fontVariant: NUMEROS }
	});
}

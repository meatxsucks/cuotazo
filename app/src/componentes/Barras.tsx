import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useId } from 'react';
import type { EstadoAlerta } from '@/datos/tipos';
import { monto, porcentaje } from '@/lib/formato';
import { useTema } from '@/tema/tema';
import { conAlfa, NUMEROS } from '@/tema/tokens';

// Barra de consumo con umbrales, línea de límite y tramo proyectado al cierre
export function BarraAlerta({
	porcentaje: pct,
	proyectado = null,
	umbrales,
	estado,
	etiqueta,
	compacta
}: {
	porcentaje: number | null;
	proyectado?: number | null;
	umbrales: number[];
	estado: EstadoAlerta;
	etiqueta: string;
	compacta?: boolean;
}) {
	const { c } = useTema();
	const id = 'r' + useId().replace(/[^a-zA-Z0-9]/g, '');
	const escala = Math.min(150, Math.max(100, ...umbrales, pct ?? 0, proyectado ?? 0));
	const pos = (v: number) => (Math.min(v, escala) / escala) * 100;
	const actual = pct ?? 0;
	const marcas = [...new Set([...umbrales, 100])].sort((a, b) => a - b).filter((u) => u <= escala);
	const alto = compacta ? 8 : 12;
	const relleno = estado === 'ok' ? c.progresoOk : estado === 'excedido' ? c.progresoExceso : c.progresoAlerta;
	const raya = estado === 'ok' ? c.progresoOk : c.progresoExceso;
	const hayProyeccion = proyectado != null && proyectado > actual;

	return (
		<View style={{ paddingBottom: compacta ? 0 : 18 }}>
			<View
				role="meter"
				aria-label={etiqueta}
				aria-valuemin={0}
				aria-valuemax={escala}
				aria-valuenow={Math.round(actual)}
				aria-valuetext={`${Math.round(actual)}% usado${proyectado != null ? `, ${Math.round(proyectado)}% proyectado al cierre` : ''}`}
				style={{ height: alto, borderRadius: 999, backgroundColor: c.superficie3 }}
			>
				{hayProyeccion ? (
					<View
						style={{
							position: 'absolute',
							top: 0,
							bottom: 0,
							left: `${pos(actual)}%`,
							width: `${pos(proyectado!) - pos(actual)}%`,
							borderTopRightRadius: 999,
							borderBottomRightRadius: 999,
							borderWidth: 1,
							borderColor: conAlfa(raya, 0.55),
							overflow: 'hidden'
						}}
					>
						<Svg width="100%" height="100%">
							<Defs>
								<Pattern id={id} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
									<Line x1={0} y1={0} x2={0} y2={8} stroke={conAlfa(raya, 0.45)} strokeWidth={8} />
								</Pattern>
							</Defs>
							<Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
						</Svg>
					</View>
				) : null}
				<View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pos(actual)}%`, borderRadius: 999, backgroundColor: relleno }} />
				{marcas.map((u) => (
					<View
						key={u}
						style={{
							position: 'absolute',
							top: -3,
							bottom: -3,
							width: 2,
							marginLeft: -1,
							left: `${pos(u)}%`,
							borderRadius: 2,
							backgroundColor: u === 100 ? c.texto : c.texto3,
							opacity: u === 100 ? 0.8 : 0.55
						}}
					/>
				))}
			</View>
			{!compacta ? (
				<View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 14 }} aria-hidden>
					{marcas.map((u) => {
						const fin = u / escala > 0.92;
						return (
							<Text
								key={u}
								numberOfLines={1}
								style={[
									est.regla,
									{ color: u === 100 ? c.texto2 : c.texto3 },
									fin ? { right: `${100 - pos(u)}%`, textAlign: 'right' } : { left: `${pos(u)}%`, transform: [{ translateX: -24 }] }
								]}
							>
								{u === 100 ? 'Límite' : `${u}%`}
							</Text>
						);
					})}
				</View>
			) : null}
		</View>
	);
}

export function BarraUso({ usado, total, moneda = 'CLP' }: { usado: number; total: number; moneda?: 'CLP' | 'UF' }) {
	const { c } = useTema();
	const razon = total > 0 ? Math.min(1, Math.max(0, usado / total)) : 0;
	return (
		<View style={{ gap: 6 }}>
			<View
				role="progressbar"
				aria-label="Cupo usado"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(razon * 100)}
				style={{ height: 10, borderRadius: 999, backgroundColor: c.superficie3, overflow: 'hidden' }}
			>
				<View style={{ height: '100%', width: `${razon * 100}%`, borderRadius: 999, backgroundColor: razon >= 0.8 ? c.progresoExceso : c.acento }} />
			</View>
			<Text style={{ color: c.texto3, fontSize: 13.6, fontVariant: NUMEROS }}>
				{porcentaje(razon * 100)} del cupo de {monto(total, moneda)}
			</Text>
		</View>
	);
}

export function Pista({ razon, color, alto = 6 }: { razon: number; color: string; alto?: number }) {
	const { c } = useTema();
	return (
		<View style={{ height: alto, borderRadius: 999, backgroundColor: c.superficie2, overflow: 'hidden' }}>
			<View style={{ height: '100%', width: `${Math.max(0, Math.min(1, razon)) * 100}%`, borderRadius: 999, backgroundColor: color }} />
		</View>
	);
}

const est = StyleSheet.create({
	regla: { position: 'absolute', fontSize: 10.5, fontWeight: '600', width: 48, textAlign: 'center' }
});

import { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { LiberacionCuota } from '@/datos/tipos';
import { clp, mesCorto, mesLargo, porcentaje } from '@/lib/formato';
import { useTema } from '@/tema/tema';

const ALTO = 180;
const ABAJO = 22;
const ARRIBA = 14;

// Carga de cuotas por mes con la línea del tope; con más de 12 barras rotula una de cada 3
export function GraficoLiberacion({ filas, tope, mesBajo }: { filas: LiberacionCuota[]; tope: number; mesBajo: string | null }) {
	const { c } = useTema();
	const [ancho, setAncho] = useState(0);
	const maxCarga = Math.max(tope * 1.25, ...filas.map((l) => l.carga_pct ?? 0)) * 1.12;
	const altoPlot = ALTO - ABAJO - ARRIBA;
	const y = (v: number) => ARRIBA + altoPlot - (v / maxCarga) * altoPlot;
	const banda = filas.length ? ancho / filas.length : 0;
	const anchoBarra = Math.max(3, Math.min(34, banda - 4));
	const descripcion = `Carga de cuotas por mes respecto de tu ingreso, con tope de ${tope}%. ${filas
		.map((l) => `${mesLargo(l.mes)}: ${clp(l.compromisos)} (${porcentaje(l.carga_pct, 1)})`)
		.join('; ')}`;

	return (
		<View style={{ height: ALTO, marginTop: 8, marginBottom: 8 }} onLayout={(e) => setAncho(Math.floor(e.nativeEvent.layout.width))} role="img" aria-label={descripcion}>
			{ancho > 0 ? (
				<Svg width={ancho} height={ALTO}>
					{filas.map((l, i) => {
						const etiqueta = filas.length <= 12 || i % 3 === 0 || l.mes === mesBajo;
						const x = i * banda + (banda - anchoBarra) / 2;
						const v = l.carga_pct ?? 0;
						const libre = l.mes === mesBajo;
						const color = !l.bajo_tope ? c.progresoAlerta : c.progresoOk;
						const alto = Math.max(0, y(0) - y(v));
						return (
							<G key={l.mes}>
								{libre ? (
									<Rect x={x - 3} y={y(v) - 3} width={anchoBarra + 6} height={alto + 3} rx={8} fill="none" stroke={c.progresoOk} strokeWidth={2} />
								) : null}
								<Rect x={x} y={y(v)} width={anchoBarra} height={alto} rx={Math.min(6, anchoBarra / 2)} fill={color} />
								{etiqueta ? (
									<>
										<SvgText x={x + anchoBarra / 2} y={y(v) - 5} textAnchor="middle" fontSize={10.5} fontWeight="700" fill={c.texto2}>
											{String(Math.round(v))}
										</SvgText>
										<SvgText x={x + anchoBarra / 2} y={ALTO - 5} textAnchor="middle" fontSize={10.5} fontWeight="600" fill={c.texto3}>
											{mesCorto(l.mes)}
										</SvgText>
									</>
								) : null}
							</G>
						);
					})}
					<Line x1={0} x2={ancho} y1={y(tope)} y2={y(tope)} stroke={c.negativo} strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />
				</Svg>
			) : null}
		</View>
	);
}

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { clp, clpCorto } from '@/lib/formato';
import { useEstilos, useTema } from '@/tema/tema';
import { NUMEROS, type Tema } from '@/tema/tokens';
import { Punto } from './base';

export interface Serie {
	id: string;
	nombre: string;
	color: string;
	valores: number[];
}

const IZQ = 46;
const ABAJO = 24;
const ARRIBA = 10;
const DER = 4;

function paso(max: number): number {
	if (max <= 0) return 1;
	const bruto = max / 3;
	const mag = 10 ** Math.floor(Math.log10(bruto));
	const f = bruto / mag;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

function rectRedondeado(x: number, yTop: number, w: number, h: number, r: number): string {
	if (h <= 0) return '';
	const rr = Math.min(r, h, w / 2);
	const yb = yTop + h;
	return `M${x},${yb}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yb}Z`;
}

// Barras apiladas con eje en CLP, selección por toque y detalle al pasar el cursor
export function GraficoBarras({
	etiquetas,
	titulos = etiquetas,
	series,
	alto = 200,
	seleccionado = null,
	resaltado = null,
	onSeleccion,
	descripcion,
	anchoMaxBarra = 40
}: {
	etiquetas: string[];
	titulos?: string[];
	series: Serie[];
	alto?: number;
	seleccionado?: number | null;
	resaltado?: number | null;
	onSeleccion?: (i: number) => void;
	descripcion: string;
	anchoMaxBarra?: number;
}) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const [ancho, setAncho] = useState(0);
	const [hover, setHover] = useState<number | null>(null);
	const [tocado, setTocado] = useState<number | null>(null);

	const n = etiquetas.length;
	const totales = useMemo(() => etiquetas.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.valores[i] ?? 0), 0)), [etiquetas, series]);
	const maxTotal = Math.max(...totales, 0);
	const pasoY = paso(maxTotal);
	const maxY = Math.max(pasoY, Math.ceil(maxTotal / pasoY) * pasoY);
	const ticks = Array.from({ length: Math.round(maxY / pasoY) + 1 }, (_, i) => i * pasoY);
	const anchoPlot = Math.max(0, ancho - IZQ - DER);
	const altoPlot = alto - ABAJO - ARRIBA;
	const banda = n ? anchoPlot / n : 0;
	const anchoBarra = Math.max(2, Math.min(banda * 0.66, anchoMaxBarra));
	const cadaEtiqueta = Math.max(1, Math.ceil(28 / Math.max(banda, 1)));
	const y = (v: number) => ARRIBA + altoPlot - (v / maxY) * altoPlot;

	const barras = etiquetas.map((_, i) => {
		const x = IZQ + i * banda + (banda - anchoBarra) / 2;
		let acumulado = 0;
		const visibles = series.filter((s) => (s.valores[i] ?? 0) > 0);
		const segmentos = visibles.map((s, k) => {
			const v = s.valores[i];
			const y0 = y(acumulado);
			acumulado += v;
			const y1 = y(acumulado);
			const esTope = k === visibles.length - 1;
			const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));
			const d = esTope ? rectRedondeado(x, y1, anchoBarra, h, 4) : `M${x},${y1}h${anchoBarra}v${h}h${-anchoBarra}Z`;
			return { id: s.id, color: s.color, d };
		});
		return { i, segmentos };
	});

	const detalle = hover ?? tocado;
	const tooltipX = detalle == null ? 0 : Math.min(Math.max(IZQ + detalle * banda + banda / 2, 90), Math.max(90, ancho - 90));

	return (
		<View style={[e.grafico, { height: alto }]} onLayout={(ev) => setAncho(Math.floor(ev.nativeEvent.layout.width))} role="img" aria-label={descripcion}>
			{ancho > 0 ? (
				<>
					<Svg width={ancho} height={alto}>
						{ticks.map((t) => (
							<G key={t}>
								<Line x1={IZQ} x2={ancho - DER} y1={y(t)} y2={y(t)} stroke={t === 0 ? c.bordeFuerte : c.grilla} strokeWidth={1} />
								<SvgText x={IZQ - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={c.texto3}>
									{clpCorto(t)}
								</SvgText>
							</G>
						))}
						{barras.map((b) => {
							const atenuada = (seleccionado != null && seleccionado !== b.i) || (hover != null && hover !== b.i && seleccionado == null);
							const conEtiqueta =
								b.i === seleccionado || (b.i % cadaEtiqueta === 0 && (seleccionado == null || Math.abs(b.i - seleccionado) >= cadaEtiqueta));
							const fuerte = b.i === seleccionado || b.i === resaltado;
							return (
								<G key={b.i}>
									<G opacity={atenuada ? 0.35 : 1}>
										{b.segmentos.map((s) => (s.d ? <Path key={s.id} d={s.d} fill={s.color} /> : null))}
									</G>
									{conEtiqueta ? (
										<SvgText
											x={IZQ + b.i * banda + banda / 2}
											y={alto - 6}
											textAnchor="middle"
											fontSize={11}
											fontWeight={fuerte ? '700' : '400'}
											fill={fuerte ? c.texto : c.texto3}
										>
											{etiquetas[b.i]}
										</SvgText>
									) : null}
								</G>
							);
						})}
						{seleccionado != null && n ? (
							<Rect
								x={IZQ + seleccionado * banda + 1}
								y={ARRIBA - 4}
								width={Math.max(0, banda - 2)}
								height={altoPlot + 4}
								rx={6}
								fill="none"
								stroke={c.acento}
								strokeWidth={1.5}
								strokeDasharray="3 3"
							/>
						) : null}
					</Svg>
					{etiquetas.map((_, i) => {
						const props: PressableProps & { onHoverIn?: () => void; onHoverOut?: () => void } = {
							onHoverIn: () => setHover(i),
							onHoverOut: () => setHover((h) => (h === i ? null : h)),
							onPress: () => {
								if (onSeleccion) onSeleccion(i);
								else setTocado((t) => (t === i ? null : i));
							}
						};
						return (
							<Pressable
								key={i}
								{...props}
								role={onSeleccion ? 'button' : undefined}
								aria-label={`${titulos[i]}: ${clp(totales[i])}`}
								aria-pressed={onSeleccion ? seleccionado === i : undefined}
								style={[e.zona, { left: IZQ + i * banda, width: banda, height: alto - ABAJO + 4 }]}
							/>
						);
					})}
					{detalle != null ? (
						<View style={[e.tooltip, { left: tooltipX, bottom: alto + 8 }]} pointerEvents="none" role="tooltip">
							<Text style={e.tituloTooltip}>{titulos[detalle]}</Text>
							{series.length > 1
								? series
										.filter((s) => (s.valores[detalle] ?? 0) > 0)
										.map((s) => (
											<View key={s.id} style={e.filaTooltip}>
												<Punto color={s.color} />
												<Text style={e.nombreTooltip} numberOfLines={1}>
													{s.nombre}
												</Text>
												<Text style={e.valorTooltip}>{clp(s.valores[detalle])}</Text>
											</View>
										))
								: null}
							<View style={[e.filaTooltip, e.totalTooltip]}>
								<Text style={[e.nombreTooltip, { color: c.texto, fontWeight: '600' }]}>Total</Text>
								<Text style={[e.valorTooltip, { color: c.texto, fontWeight: '600' }]}>{clp(totales[detalle])}</Text>
							</View>
						</View>
					) : null}
				</>
			) : null}
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		grafico: { width: '100%', minWidth: 0, position: 'relative', userSelect: 'none' },
		zona: { position: 'absolute', top: 0 },
		tooltip: {
			position: 'absolute',
			width: 200,
			marginLeft: -100,
			paddingVertical: 10,
			paddingHorizontal: 12,
			borderRadius: 12,
			backgroundColor: c.superficie,
			borderWidth: 1,
			borderColor: c.bordeFuerte,
			boxShadow: c.sombraAlta,
			zIndex: 5
		},
		tituloTooltip: { fontWeight: '600', marginBottom: 4, fontSize: 12.8, color: c.texto },
		filaTooltip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
		nombreTooltip: { flex: 1, fontSize: 12.8, color: c.texto2 },
		valorTooltip: { fontSize: 12.8, color: c.texto2, fontVariant: NUMEROS },
		totalTooltip: { borderTopWidth: 1, borderTopColor: c.borde, marginTop: 4, paddingTop: 4 }
	});
}

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Boton, CabeceraTarjeta, EnlaceCabecera, Punto, Rejilla, Tarjeta, Vacio } from '@/componentes/base';
import { FilaMovimiento } from '@/componentes/FilaMovimiento';
import { GraficoBarras, type Serie } from '@/componentes/GraficoBarras';
import { Leyenda } from '@/componentes/Leyenda';
import { Pagina } from '@/componentes/Pagina';
import { SelectorMes } from '@/componentes/SelectorMes';
import { useCarga } from '@/datos/carga';
import { useFuente } from '@/datos/sesion';
import { nombreCategoria } from '@/lib/categorias';
import { finDeMes, listaMeses, mesDe, parametroMes, sumarMeses } from '@/lib/fechas';
import { clp, mesCorto, mesLargo, porcentaje } from '@/lib/formato';
import { useParamMes } from '@/lib/rutas';
import { comunes } from '@/tema/comunes';
import { useEstilos, useTema } from '@/tema/tema';
import { NUMEROS, type Tema } from '@/tema/tokens';

// Minigráfico de 6 meses; el último en el color de la categoría
function Minigrafico({ serie, color, apagado }: { serie: number[]; color: string; apagado: string }) {
	const max = Math.max(...serie);
	const ancho = 44;
	const alto = 24;
	const w = (ancho - 2 * (serie.length - 1)) / serie.length;
	return (
		<Svg width={ancho} height={alto} aria-hidden>
			{serie.map((v, i) => {
				const h = alto * (max ? Math.max(0.08, v / max) : 0.08);
				return <Rect key={i} x={i * (w + 2)} y={alto - h} width={w} height={h} rx={1.5} fill={i === serie.length - 1 ? color : apagado} />;
			})}
		</Svg>
	);
}

export default function Categorias() {
	const [mes, cambiarMes] = useParamMes();
	const { cat: catParam } = useLocalSearchParams<{ cat?: string }>();
	const cat = typeof catParam === 'string' && catParam ? catParam : null;
	const d = useFuente();
	const t = useTema();
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);

	const carga = useCarga(async () => {
		const [gasto, detalle] = await Promise.all([
			d.gastoDiario(sumarMeses(mes, -5), finDeMes(mes)),
			cat ? d.movimientos({ categoria: cat, desde: mes, hasta: finDeMes(mes) }) : Promise.resolve(null)
		]);
		return { mes, cat, gasto, movimientos: detalle?.filas ?? [] };
	}, [d, mes, cat]);
	const data = carga.datos;

	const calculo = useMemo(() => {
		if (!data) return null;
		const meses = listaMeses(data.mes, 6);
		const matriz = new Map<string, number[]>();
		for (const g of data.gasto) {
			const i = meses.indexOf(mesDe(g.fecha));
			if (i < 0) continue;
			if (!matriz.has(g.categoria)) matriz.set(g.categoria, Array(6).fill(0));
			matriz.get(g.categoria)![i] += g.monto_gasto;
		}
		const suma = (v: number[]) => v.reduce((s, x) => s + x, 0);
		const ordenadas = [...matriz.entries()].sort((a, b) => suma(b[1]) - suma(a[1]));
		let series: Serie[];
		if (data.cat) {
			series = [{ id: data.cat, nombre: nombreCategoria(data.cat), color: t.cat(data.cat), valores: matriz.get(data.cat) ?? Array(6).fill(0) }];
		} else {
			const resto = ordenadas.slice(6);
			series = ordenadas.slice(0, 6).map(([id, v]) => ({ id, nombre: nombreCategoria(id), color: t.cat(id), valores: v }));
			if (resto.length) series.push({ id: 'otras', nombre: 'Otras', color: t.otras, valores: meses.map((_, i) => resto.reduce((s, [, v]) => s + v[i], 0)) });
		}
		const delMes = ordenadas
			.map(([id, v]) => ({ id, monto: v[5], previo: v[4], serie: v }))
			.filter((x) => x.monto > 0)
			.sort((a, b) => b.monto - a.monto);
		return { meses, ordenadas, series, delMes, totalMes: delMes.reduce((s, x) => s + x.monto, 0) };
	}, [data, t]);

	const cambiarCat = (c: string | null) => router.setParams({ cat: c ?? undefined });
	const cabecera = { titulo: 'Categorías', subtitulo: 'En qué se va tu plata, mes a mes', derecha: <SelectorMes mes={mes} onCambio={cambiarMes} /> };
	if (!data || !calculo) return <Pagina {...cabecera} sinDatos={!carga.error} error={carga.error} onReintentar={carga.recargar} />;
	const { meses, ordenadas, series, delMes, totalMes } = calculo;

	return (
		<Pagina {...cabecera} cargando={carga.cargando} onReintentar={carga.recargar}>
			<Tarjeta>
				<CabeceraTarjeta
					titulo={data.cat ? nombreCategoria(data.cat) : 'Gasto por categoría'}
					subtitulo="Últimos 6 meses · toca un mes para verlo"
					derecha={data.cat ? <Boton variante="fantasma" icono="cerrar" texto="Todas" onPress={() => cambiarCat(null)} /> : null}
				/>
				{ordenadas.length ? (
					<>
						<GraficoBarras
							descripcion="Gasto por categoría en los últimos 6 meses"
							etiquetas={meses.map(mesCorto)}
							titulos={meses.map(mesLargo)}
							series={series}
							seleccionado={5}
							onSeleccion={(i) => cambiarMes(meses[i])}
							alto={230}
							anchoMaxBarra={56}
						/>
						{series.length > 1 ? <Leyenda items={series} /> : null}
					</>
				) : (
					<Vacio titulo="Sin gastos en estos meses" compacto />
				)}
			</Tarjeta>

			<Rejilla columnas={data.cat ? 2 : 1}>
				<Tarjeta estilo={{ flexGrow: 1 }}>
					<CabeceraTarjeta titulo={mesLargo(data.mes)} derecha={<Text style={[k.cifra, { fontSize: 18.4 }]}>{clp(totalMes)}</Text>} />
					{delMes.length ? (
						<View role="list">
							{delMes.map((x) => {
								const variacion = x.previo > 0 ? ((x.monto - x.previo) / x.previo) * 100 : null;
								const activa = data.cat === x.id;
								return (
									<Pressable
										key={x.id}
										role="button"
										aria-pressed={activa}
										onPress={() => cambiarCat(activa ? null : x.id)}
										style={[e.cat, activa && { backgroundColor: t.c.acentoSuave }]}
									>
										<Punto color={t.cat(x.id)} />
										<View style={{ flex: 1, minWidth: 0 }}>
											<Text style={e.nombre} numberOfLines={1}>
												{nombreCategoria(x.id)}
											</Text>
											<Text style={e.sub}>
												{porcentaje((x.monto / totalMes) * 100)} del mes
												{variacion != null ? (
													<Text>
														{' · '}
														<Text style={variacion > 5 ? e.sube : variacion < -5 ? e.baja : null}>
															{variacion > 0 ? '+' : ''}
															{porcentaje(variacion)}
														</Text>
													</Text>
												) : null}
											</Text>
										</View>
										<Minigrafico serie={x.serie} color={t.cat(x.id)} apagado={t.c.superficie3} />
										<Text style={e.valor}>{clp(x.monto)}</Text>
									</Pressable>
								);
							})}
						</View>
					) : (
						<Vacio titulo="Sin gastos este mes" compacto />
					)}
				</Tarjeta>

				{data.cat ? (
					<Tarjeta estilo={{ flexGrow: 1 }}>
						<CabeceraTarjeta
							titulo="Movimientos"
							subtitulo={`${nombreCategoria(data.cat)} · ${mesLargo(data.mes)}`}
							derecha={<EnlaceCabecera href={{ pathname: '/movimientos', params: { mes: parametroMes(data.mes), categoria: data.cat } }} texto="Ver en tabla" />}
						/>
						{data.movimientos.length ? (
							<View role="list">
								{data.movimientos.map((m, i) => (
									<FilaMovimiento key={m.movimiento_id} m={m} conFecha ultima={i === data.movimientos.length - 1} />
								))}
							</View>
						) : (
							<Vacio titulo="Sin movimientos" compacto>
								No hay movimientos de esta categoría en el mes.
							</Vacio>
						)}
					</Tarjeta>
				) : null}
			</Rejilla>
		</Pagina>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		cat: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 12 },
		nombre: { fontWeight: '600', fontSize: 14.7, color: c.texto },
		sub: { fontSize: 12.2, color: c.texto3 },
		sube: { color: c.negativo, fontWeight: '600' },
		baja: { color: c.positivo, fontWeight: '600' },
		valor: { fontWeight: '600', fontSize: 14.7, minWidth: 86, textAlign: 'right', color: c.texto, fontVariant: NUMEROS }
	});
}

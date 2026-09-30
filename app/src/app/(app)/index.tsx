import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BarraAlerta, Pista } from '@/componentes/Barras';
import { CabeceraTarjeta, Enlace, EnlaceCabecera, Insignia, Punto, Rejilla, Tarjeta, Vacio } from '@/componentes/base';
import { Icono } from '@/componentes/Icono';
import { Pagina } from '@/componentes/Pagina';
import { SelectorMes } from '@/componentes/SelectorMes';
import { useCarga } from '@/datos/carga';
import { useFuente } from '@/datos/sesion';
import { porCategoria, vencimientos } from '@/lib/agregados';
import { ESTADOS, hayAlerta, nombrePresupuesto, valorAlerta } from '@/lib/alertas';
import { nombreCategoria } from '@/lib/categorias';
import { diasEnMes, diasEntre, finDeMes, hoyChile, mesActual, parametroMes, sumarMeses } from '@/lib/fechas';
import { clp, fecha, mesLargo, monto, nombreBanco, porcentaje } from '@/lib/formato';
import { useParamMes } from '@/lib/rutas';
import { comunes } from '@/tema/comunes';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { conAlfa, NUMEROS, type Tema } from '@/tema/tokens';

export default function Resumen() {
	const [mes, cambiarMes] = useParamMes();
	const d = useFuente();
	const t = useTema();
	const { c } = t;
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);
	const { ventana, ancho720 } = useAncho();

	const carga = useCarga(async () => {
		const proximo = sumarMeses(mesActual(), 1);
		const enCurso = mes === mesActual();
		const [resumen, gasto, estados, credito, plan, perfil, deudas, saldos, cuotas] = await Promise.all([
			d.resumenMensual(sumarMeses(mes, -1), mes),
			d.gastoDiario(mes, finDeMes(mes)),
			d.estadoPresupuestos(mes),
			d.creditoMes(mes),
			enCurso ? d.planAjuste() : Promise.resolve([]),
			d.perfil(),
			d.deudas(),
			d.saldos(),
			d.cuotasMes(proximo, proximo)
		]);
		estados.sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden || (b.porcentaje ?? 0) - (a.porcentaje ?? 0));
		return {
			mes,
			hoy: hoyChile(),
			actual: resumen.find((r) => r.mes === mes) ?? null,
			anterior: resumen.find((r) => r.mes === sumarMeses(mes, -1)) ?? null,
			categorias: porCategoria(gasto),
			estados,
			credito,
			plan: plan.find((p) => p.en_curso) ?? null,
			tope: perfil?.tope_carga_cuotas_pct ?? 30,
			ingresoDeclarado: perfil?.ingreso_mensual_neto != null,
			vencimientos: vencimientos(deudas).slice(0, 5),
			saldos,
			comprometidoProximo: cuotas.reduce((s, x) => s + x.monto, 0),
			proximo
		};
	}, [d, mes]);

	const data = carga.datos;
	const cabecera = { titulo: 'Resumen', subtitulo: mes === mesActual() ? 'Así va tu mes' : 'Mes cerrado', derecha: <SelectorMes mes={mes} onCambio={cambiarMes} /> };
	if (!data) return <Pagina {...cabecera} sinDatos={!carga.error} error={carga.error} onReintentar={carga.recargar} />;

	const r = data.actual;
	const enCurso = data.mes === mesActual();
	const alerta = !!r && r.alerta_negativo && r.meses_completos && enCurso;
	const nombreMes = mesLargo(data.mes).split(' ')[0].toLowerCase();
	const top = data.categorias.slice(0, 5);
	const maxCat = top[0]?.monto ?? 0;
	const alertas = data.estados.filter((x) => hayAlerta(x.estado));
	const resumenAlertas = (['excedido', 'aviso', 'pronostico_excede'] as const)
		.map((x) => ({ n: alertas.filter((a) => a.estado === x).length, x }))
		.filter((x) => x.n > 0)
		.map(({ n, x }) =>
			x === 'excedido' ? `${n} ${n === 1 ? 'excedido' : 'excedidos'}` : x === 'aviso' ? `${n} con umbral cruzado` : `${n} que se ${n === 1 ? 'pasará' : 'pasarán'} al ritmo actual`
		);
	const cargaPct = data.credito?.carga_porcentaje ?? null;
	const p = data.plan;
	const diasRestantes = enCurso ? diasEnMes(data.mes) - Number(data.hoy.slice(8)) : 0;
	const variacionGasto = r && data.anterior && data.anterior.gastos > 0 ? ((r.gastos - data.anterior.gastos) / data.anterior.gastos) * 100 : null;
	const totalSaldos = data.saldos.reduce((s, x) => s + x.saldo_disponible, 0);
	const qMes = { mes: parametroMes(data.mes) };
	const enDias = (f: string) => {
		const n = diasEntre(data.hoy, f);
		return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`;
	};
	const cifraGrande = Math.max(32, Math.min(44, ventana * 0.07));
	const cifraMini = Math.max(17.6, Math.min(23.2, ventana * 0.046));

	return (
		<Pagina {...cabecera} cargando={carga.cargando} onReintentar={carga.recargar}>
			{alertas.length ? (
				<Link href={{ pathname: '/presupuestos', params: qMes }} asChild>
					<Pressable style={e.aviso} aria-label="Ver alertas de presupuesto">
						<View style={e.avisoIcono}>
							<Icono nombre="campana" tam={20} color={c.aviso} />
						</View>
						<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
							<Text style={[e.avisoTexto, { color: c.texto, fontWeight: '700' }]}>
								{alertas.length === 1 ? 'Un presupuesto necesita' : `${alertas.length} presupuestos necesitan`} atención{enCurso ? '' : ` en ${nombreMes}`}
							</Text>
							<Text style={e.avisoTexto}>{resumenAlertas.join(' · ')}</Text>
							<View style={e.chips}>
								{alertas.slice(0, 4).map((a) => (
									<Insignia key={a.presupuesto_id} clase={ESTADOS[a.estado].clase as 'negativo'} texto={nombrePresupuesto(a.tipo, a.categoria)} />
								))}
								{alertas.length > 4 ? <Insignia texto={`+${alertas.length - 4}`} /> : null}
							</View>
						</View>
						{ancho720 ? (
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<Text style={[k.enlaceCabecera, { fontWeight: '600' }]}>Ver alertas</Text>
								<Icono nombre="derecha" tam={16} color={c.acentoTinta} />
							</View>
						) : null}
					</Pressable>
				</Link>
			) : null}

			{!r ? (
				<Tarjeta>
					<Vacio titulo={`Sin datos para ${mesLargo(data.mes)}`}>Aún no hay movimientos publicados para este mes.</Vacio>
				</Tarjeta>
			) : (
				<>
					<Tarjeta degradado={alerta ? c.negativoSuave : c.acentoSuave} estilo={{ padding: 22, gap: 18 }}>
						<View style={[ancho720 && enCurso && { flexDirection: 'row', alignItems: 'flex-end' }, { gap: 18 }]}>
							<View style={[{ gap: 4 }, ancho720 && { flex: 1.4 }]}>
								<View style={[k.fila, { gap: 8 }]}>
									<Text style={k.etiqueta}>Flujo neto {enCurso ? 'a la fecha' : 'del mes'}</Text>
									{!r.meses_completos ? <Insignia clase="aviso" texto="Datos incompletos" /> : null}
								</View>
								<Text style={[e.cifraGrande, { fontSize: cifraGrande, lineHeight: cifraGrande * 1.1 }, r.flujo_neto < 0 && k.negativo]}>{clp(r.flujo_neto)}</Text>
								<Text style={k.tenue}>Ingresos − gastos − intereses y comisiones</Text>
							</View>
							{enCurso ? (
								<View style={[e.proyeccion, ancho720 ? e.proyeccionAncha : e.proyeccionAngosta]}>
									<Text style={k.etiqueta}>Proyección al cierre</Text>
									<Text style={[k.cifra, r.flujo_proyectado_cierre < 0 ? k.negativo : k.positivo]}>{clp(r.flujo_proyectado_cierre)}</Text>
									<Text style={k.tenue}>
										Gastos al ritmo actual e ingresos habituales · {diasRestantes === 1 ? 'queda 1 día' : `quedan ${diasRestantes} días`}
									</Text>
								</View>
							) : null}
						</View>
						{!r.meses_completos ? (
							<Text style={e.incompleto}>
								Faltan datos de alguna de tus cuentas en este mes, así que las cifras pueden quedar cortas{enCurso ? ' y no mostramos alerta de proyección' : ''}.
							</Text>
						) : null}
						{alerta ? (
							<View style={e.banner} role="alert">
								<Icono nombre="alerta" tam={20} color={c.negativo} />
								<View style={{ flex: 1, gap: 2 }}>
									<Text style={[e.bannerTexto, { color: c.negativo, fontWeight: '700' }]}>Al ritmo actual cerrarías {nombreMes} en negativo.</Text>
									<Text style={e.bannerTexto}>
										Si sigues gastando al ritmo de estos días, tus gastos superarían tus ingresos habituales. Revisa tus categorías con más gasto.
									</Text>
								</View>
							</View>
						) : null}
					</Tarjeta>

					<Rejilla columnas={ventana >= 900 ? 4 : 2} desde={0} espacio={ventana >= 900 ? 16 : 12}>
						<Tarjeta estilo={e.mini}>
							<Text style={k.etiqueta}>Ingresos</Text>
							<Text style={[k.cifra, k.positivo, { fontSize: cifraMini }]}>{clp(r.ingresos)}</Text>
						</Tarjeta>
						<Tarjeta estilo={e.mini}>
							<Text style={k.etiqueta}>Gastos</Text>
							<Text style={[k.cifra, { fontSize: cifraMini }]}>{clp(r.gastos)}</Text>
							{variacionGasto != null ? (
								<View style={[k.fila, { gap: 2 }]}>
									<Icono nombre={variacionGasto > 0 ? 'subida' : 'bajada'} tam={14} grosor={2.5} color={c.texto3} />
									<Text style={[k.tenue, { fontSize: 12 }]}>{porcentaje(Math.abs(variacionGasto))} vs mes anterior</Text>
								</View>
							) : null}
						</Tarjeta>
						<Tarjeta estilo={e.mini}>
							<Text style={k.etiqueta}>Intereses y comisiones</Text>
							<Text style={[k.cifra, { fontSize: cifraMini }, r.intereses_comisiones > 0 && k.negativo]}>{clp(r.intereses_comisiones)}</Text>
						</Tarjeta>
						<Tarjeta estilo={e.mini}>
							<Text style={k.etiqueta}>Pagos de deuda</Text>
							<Text style={[k.cifra, { fontSize: cifraMini }]}>{clp(r.pagos_deuda)}</Text>
						</Tarjeta>
					</Rejilla>

					{data.credito ? (
						<Rejilla columnas={p ? 3 : 2}>
							{p ? (
								<Tarjeta degradado={(p.restante_variable ?? 0) < 0 ? c.negativoSuave : null} estilo={{ flex: 1 }}>
									<CabeceraTarjeta titulo="Plan del mes" derecha={<EnlaceCabecera href="/plan" texto="Ver plan" />} />
									{p.disponible_variable == null ? (
										<Text style={k.tenue}>
											Declara tu ingreso en el <Enlace href="/plan">Plan</Enlace> para saber cuánto puedes gastar.
										</Text>
									) : p.disponible_variable < 0 ? (
										<>
											<Text style={[k.cifra, k.negativo]}>{clp(-p.disponible_variable)}</Text>
											<Text style={k.tenue}>bajo cero antes de gastar: tus cuotas y gastos fijos ya superan tu ingreso</Text>
										</>
									) : (p.restante_variable ?? 0) < 0 ? (
										<>
											<Text style={[k.cifra, k.negativo]}>{clp(-(p.restante_variable ?? 0))}</Text>
											<Text style={k.tenue}>sobre lo que tenías para gasto variable ({clp(p.disponible_variable)})</Text>
										</>
									) : (
										<>
											<Text style={[k.cifra, k.positivo]}>{clp(p.restante_variable)}</Text>
											<Text style={k.tenue}>te quedan para gasto variable {diasRestantes === 1 ? 'en el último día' : `en ${diasRestantes} días`}</Text>
										</>
									)}
									{!p.ingreso_declarado && p.disponible_variable != null ? (
										<Text style={[k.tenue, e.nota]}>
											Con ingreso estimado de {clp(p.ingreso_referencia)}. <Enlace href="/plan">Decláralo</Enlace> para afinar.
										</Text>
									) : null}
								</Tarjeta>
							) : null}
							<Tarjeta estilo={{ flex: 1 }}>
								<CabeceraTarjeta titulo={`Compras a crédito ${enCurso ? 'este mes' : `en ${nombreMes}`}`} />
								<Text style={k.cifra}>{clp(data.credito.compras_cuotas_monto)}</Text>
								<Text style={k.tenue}>
									{data.credito.compras_cuotas_cantidad
										? `${data.credito.compras_cuotas_cantidad} ${data.credito.compras_cuotas_cantidad === 1 ? 'compra nueva' : 'compras nuevas'} en cuotas; se pagan en los próximos meses`
										: 'Sin compras nuevas en cuotas'}
								</Text>
								<Text style={[k.tenue, e.nota]}>
									<Enlace href="/deudas">Ver cuotas comprometidas</Enlace>
								</Text>
							</Tarjeta>
							<Tarjeta estilo={{ flex: 1 }}>
								<CabeceraTarjeta titulo="Carga de cuotas" />
								{cargaPct != null ? (
									<>
										<Text style={[k.cifra, cargaPct > data.tope && k.negativo]}>
											{porcentaje(cargaPct, 1)} <Text style={e.de}>de tu ingreso</Text>
										</Text>
										<View style={{ marginTop: 12, marginBottom: 10 }}>
											<BarraAlerta
												porcentaje={(100 * cargaPct) / data.tope}
												umbrales={[100]}
												estado={cargaPct > data.tope ? 'excedido' : cargaPct > data.tope * 0.8 ? 'aviso' : 'ok'}
												etiqueta="Carga de cuotas respecto de tu tope"
												compacta
											/>
										</View>
										<Text style={k.tenue}>
											{clp(data.credito.cuotas_mes)} en cuotas y dividendos · tope {data.tope}%
										</Text>
										<Text style={[k.tenue, e.nota]}>
											Ingreso {data.ingresoDeclarado ? 'declarado' : 'estimado'}: {clp(data.credito.ingreso_referencia)}
										</Text>
									</>
								) : (
									<Text style={k.tenue}>
										Sin ingreso de referencia. <Enlace href="/plan">Declara tu ingreso</Enlace> para calcularla.
									</Text>
								)}
							</Tarjeta>
						</Rejilla>
					) : null}

					<Rejilla columnas={2}>
						<Tarjeta estilo={{ flex: 1 }}>
							<CabeceraTarjeta
								titulo="Alertas de presupuesto"
								derecha={<EnlaceCabecera href={{ pathname: '/presupuestos', params: qMes }} texto="Ver todas" />}
							/>
							{data.estados.length ? (
								<View style={{ gap: 14 }}>
									{data.estados.slice(0, 4).map((x) => (
										<View key={x.presupuesto_id} style={{ gap: 6 }}>
											<View style={[k.fila, { gap: 8 }]}>
												<Text style={e.nombreFila} numberOfLines={1}>
													{nombrePresupuesto(x.tipo, x.categoria)}
												</Text>
												<Text style={e.valor}>
													{valorAlerta(x.tipo, x.consumido)} <Text style={e.deChico}>/ {valorAlerta(x.tipo, x.limite)}</Text>
												</Text>
											</View>
											<BarraAlerta
												porcentaje={x.porcentaje}
												umbrales={x.umbrales}
												estado={x.estado}
												etiqueta={`Consumo de ${nombrePresupuesto(x.tipo, x.categoria)}`}
												compacta
											/>
										</View>
									))}
									{data.estados.length > 4 ? <Text style={[k.tenue, e.nota]}>Y {data.estados.length - 4} más en la pantalla de alertas.</Text> : null}
								</View>
							) : (
								<Vacio icono="campana" titulo="Sin alertas de presupuesto" compacto>
									<Enlace href={{ pathname: '/presupuestos', params: qMes }}>Define límites</Enlace> y te avisamos antes de pasarte.
								</Vacio>
							)}
						</Tarjeta>

						<Tarjeta estilo={{ flex: 1 }}>
							<CabeceraTarjeta titulo="Top categorías" derecha={<EnlaceCabecera href={{ pathname: '/categorias', params: qMes }} texto="Ver todas" />} />
							{top.length ? (
								<View style={{ gap: 14 }}>
									{top.map((x) => (
										<Link key={x.categoria} href={{ pathname: '/categorias', params: { ...qMes, cat: x.categoria } } as Href} asChild>
											<Pressable style={{ gap: 6 }} aria-label={`${nombreCategoria(x.categoria)}: ${clp(x.monto)}`}>
												<View style={[k.fila, { gap: 8 }]}>
													<Punto color={t.cat(x.categoria)} />
													<Text style={e.nombreFila} numberOfLines={1}>
														{nombreCategoria(x.categoria)}
													</Text>
													<Text style={e.valor}>{clp(x.monto)}</Text>
												</View>
												<Pista razon={maxCat ? x.monto / maxCat : 0} color={t.cat(x.categoria)} />
											</Pressable>
										</Link>
									))}
								</View>
							) : (
								<Vacio titulo="Sin gastos este mes" compacto />
							)}
						</Tarjeta>
					</Rejilla>
				</>
			)}

			<Rejilla columnas={2}>
				<Tarjeta estilo={{ flex: 1 }}>
					<CabeceraTarjeta titulo="Próximos vencimientos" derecha={<EnlaceCabecera href="/deudas" texto="Deudas" />} />
					{data.vencimientos.length ? (
						<View>
							{data.vencimientos.map((v, i) => (
								<View key={v.nombre + v.banco} style={[e.filaLista, i === data.vencimientos.length - 1 && { borderBottomWidth: 0 }]}>
									<View style={e.caja} aria-hidden>
										<Text style={e.cajaDia}>{v.fecha.slice(8)}</Text>
										<Text style={e.cajaMes}>{mesLargo(v.fecha).slice(0, 3).toUpperCase()}</Text>
									</View>
									<View style={e.cuerpo}>
										<Text style={e.titulo} numberOfLines={1}>
											{v.nombre}
										</Text>
										<Text style={e.sub} numberOfLines={1}>
											{nombreBanco(v.banco)} · {v.detalle} · {fecha(v.fecha)}
										</Text>
									</View>
									<View style={{ alignItems: 'flex-end', gap: 3 }}>
										<Text style={e.valor}>{v.moneda === 'UF' && v.montoClp ? clp(v.montoClp) : monto(v.monto, v.moneda)}</Text>
										<Insignia clase={diasEntre(data.hoy, v.fecha) <= 5 ? 'aviso' : 'normal'} texto={enDias(v.fecha)} />
									</View>
								</View>
							))}
						</View>
					) : (
						<Vacio icono="reloj" titulo="Nada por vencer" compacto>
							No hay pagos programados.
						</Vacio>
					)}
				</Tarjeta>

				<Tarjeta estilo={{ flex: 1 }}>
					<CabeceraTarjeta titulo="Cuentas y compromisos" />
					<View>
						{data.saldos.map((s) => (
							<View key={s.banco + s.producto_nombre} style={e.filaLista}>
								<View style={e.caja}>
									<Icono nombre="banco" tam={18} color={c.texto2} />
								</View>
								<View style={e.cuerpo}>
									<Text style={e.titulo} numberOfLines={1}>
										{s.producto_nombre}
									</Text>
									<Text style={e.sub}>{nombreBanco(s.banco)}</Text>
								</View>
								<Text style={e.valor}>{clp(s.saldo_disponible)}</Text>
							</View>
						))}
						<View style={[e.filaLista, { borderBottomWidth: 0 }]}>
							<View style={e.caja}>
								<Icono nombre="deudas" tam={18} color={c.texto2} />
							</View>
							<View style={e.cuerpo}>
								<Text style={e.titulo}>Deuda comprometida</Text>
								<Text style={e.sub} numberOfLines={1}>
									Cuotas y dividendos de {mesLargo(data.proximo).toLowerCase()}
								</Text>
							</View>
							<Text style={e.valor}>{clp(data.comprometidoProximo)}</Text>
						</View>
					</View>
					{data.saldos.length ? (
						<View style={e.totalSaldos}>
							<Text style={k.etiqueta}>Disponible en cuentas</Text>
							<Text style={[e.valor, { fontWeight: '700', fontSize: 16 }]}>{clp(totalSaldos)}</Text>
						</View>
					) : null}
				</Tarjeta>
			</Rejilla>
		</Pagina>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		aviso: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 12,
			paddingVertical: 14,
			paddingHorizontal: 16,
			borderRadius: 16,
			backgroundColor: c.avisoSuave,
			borderWidth: 1,
			borderColor: conAlfa(c.aviso, 0.3)
		},
		avisoIcono: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.superficie, alignItems: 'center', justifyContent: 'center' },
		avisoTexto: { fontSize: 13.8, color: c.texto2 },
		chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
		cifraGrande: { fontWeight: '800', letterSpacing: -1.5, fontVariant: NUMEROS, color: c.texto },
		proyeccion: { gap: 2 },
		proyeccionAngosta: { paddingTop: 14, borderTopWidth: 1, borderTopColor: c.borde },
		proyeccionAncha: { flex: 1, borderLeftWidth: 1, borderLeftColor: c.borde, paddingLeft: 22 },
		incompleto: { fontSize: 13.1, color: c.aviso, backgroundColor: c.avisoSuave, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, overflow: 'hidden' },
		banner: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 12, backgroundColor: c.negativoSuave },
		bannerTexto: { fontSize: 14.1, color: c.texto2 },
		mini: { paddingVertical: 14, paddingHorizontal: 16, gap: 4, flex: 1 },
		de: { fontSize: 15.2, fontWeight: '500', color: c.texto3, letterSpacing: 0 },
		deChico: { fontWeight: '500', color: c.texto3 },
		nota: { marginTop: 6, fontSize: 12 },
		nombreFila: { flex: 1, minWidth: 0, fontSize: 14.4, color: c.texto },
		valor: { fontWeight: '600', fontSize: 14.4, color: c.texto, fontVariant: NUMEROS },
		filaLista: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borde },
		caja: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.superficie2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
		cajaDia: { fontSize: 16, fontWeight: '700', color: c.texto, lineHeight: 17, fontVariant: NUMEROS },
		cajaMes: { fontSize: 10.9, fontWeight: '600', color: c.texto2, lineHeight: 12 },
		cuerpo: { flex: 1, minWidth: 0 },
		titulo: { fontWeight: '600', fontSize: 14.7, color: c.texto },
		sub: { fontSize: 12.2, color: c.texto3 },
		totalSaldos: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'baseline',
			marginTop: 8,
			paddingTop: 12,
			borderTopWidth: 1,
			borderTopColor: c.bordeFuerte,
			borderStyle: 'dashed'
		}
	});
}

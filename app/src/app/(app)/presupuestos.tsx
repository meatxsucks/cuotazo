import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BarraAlerta } from '@/componentes/Barras';
import { Boton, Casilla, conMiles, Enlace, Insignia, Mensaje, Punto, Rejilla, Tarjeta, Vacio } from '@/componentes/base';
import { FormularioAlerta } from '@/componentes/FormularioAlerta';
import { Icono } from '@/componentes/Icono';
import { Pagina } from '@/componentes/Pagina';
import { SelectorMes } from '@/componentes/SelectorMes';
import { useCarga } from '@/datos/carga';
import { ErrorDuplicado } from '@/datos/errores';
import { useFuente } from '@/datos/sesion';
import type { EstadoAlerta, EstadoPresupuesto, PresupuestoEntrada, TipoPresupuesto } from '@/datos/tipos';
import { entero, ESTADOS, nombrePresupuesto, TIPOS, valorAlerta } from '@/lib/alertas';
import { CATEGORIAS_GASTO } from '@/lib/categorias';
import { mesActual, sumarMeses } from '@/lib/fechas';
import { clp, mesLargo, porcentaje } from '@/lib/formato';
import { useParamMes } from '@/lib/rutas';
import { comunes } from '@/tema/comunes';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { NUMEROS, radio, type Tema } from '@/tema/tokens';

const ORDEN_TIPO: Record<string, number> = { total: 0, compras_credito: 1, carga_cuotas: 2, categoria: 3 };

export default function Presupuestos() {
	const [pedido, cambiarMes] = useParamMes();
	const d = useFuente();
	const t = useTema();
	const { c } = t;
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);
	const { ventana } = useAncho();
	const actual = mesActual();
	const minimo = sumarMeses(actual, -5);
	const mes = pedido > actual ? actual : pedido < minimo ? minimo : pedido;

	const [panel, setPanel] = useState<'nueva' | 'sugerencias' | null>(null);
	const [editando, setEditando] = useState<string | null>(null);
	const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
	const [enviando, setEnviando] = useState(false);
	const [elegidas, setElegidas] = useState<Record<string, boolean>>({});
	const [valores, setValores] = useState<Record<string, string>>({});

	const carga = useCarga(async () => {
		const [estados, presupuestos, sugeridos] = await Promise.all([d.estadoPresupuestos(mes), d.presupuestos(), d.presupuestosSugeridos()]);
		estados.sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden || (b.porcentaje ?? 0) - (a.porcentaje ?? 0));
		const recurrentes = new Set(presupuestos.filter((p) => p.mes === null).map((p) => `${p.tipo}|${p.categoria ?? ''}`));
		return {
			mes,
			estados,
			presupuestos,
			recurrentes,
			sugeridos: sugeridos
				.filter((s) => s.tipo !== 'categoria' || CATEGORIAS_GASTO.some((x) => x.id === s.categoria))
				.map((s) => ({ ...s, clave: `${s.tipo}|${s.categoria ?? ''}`, existe: recurrentes.has(`${s.tipo}|${s.categoria ?? ''}`) }))
				.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || (b.monto_sugerido ?? 0) - (a.monto_sugerido ?? 0))
		};
	}, [d, mes]);
	const data = carga.datos;

	async function guardar(p: PresupuestoEntrada): Promise<string | null> {
		try {
			await d.guardarPresupuesto(p);
		} catch (err) {
			return err instanceof ErrorDuplicado ? 'Ya tienes una alerta igual para esa vigencia. Edita la existente.' : 'No pudimos guardar la alerta. Intenta de nuevo.';
		}
		setAviso({ tipo: 'ok', texto: p.presupuesto_id ? 'Cambios guardados.' : 'Alerta creada.' });
		setPanel(null);
		setEditando(null);
		await carga.recargar();
		return null;
	}

	async function borrar(id: string) {
		setEnviando(true);
		try {
			await d.borrarPresupuesto(id);
			setAviso({ tipo: 'ok', texto: 'Alerta borrada.' });
			setEditando(null);
			await carga.recargar();
		} catch {
			setAviso({ tipo: 'error', texto: 'No pudimos borrar la alerta.' });
		}
		setEnviando(false);
	}

	function abrirSugerencias() {
		if (!data) return;
		setElegidas(Object.fromEntries(data.sugeridos.map((s) => [s.clave, !s.existe])));
		setValores(
			Object.fromEntries(
				data.sugeridos.map((s) => [s.clave, s.tipo === 'carga_cuotas' ? String(s.porcentaje_sugerido ?? '') : conMiles(String(s.monto_sugerido ?? ''))])
			)
		);
		setPanel(panel === 'sugerencias' ? null : 'sugerencias');
	}

	async function crearSugerencias() {
		if (!data) return;
		setEnviando(true);
		let creadas = 0;
		let omitidas = 0;
		let fallo = false;
		for (const s of data.sugeridos) {
			if (s.existe || !elegidas[s.clave]) continue;
			const valor = entero(valores[s.clave]);
			if (!valor) continue;
			const cargaCuotas = s.tipo === 'carga_cuotas';
			try {
				await d.guardarPresupuesto({
					presupuesto_id: null,
					tipo: s.tipo as TipoPresupuesto,
					categoria: s.tipo === 'categoria' ? s.categoria : null,
					mes: null,
					monto_limite: cargaCuotas ? null : valor,
					porcentaje_limite: cargaCuotas ? Math.min(valor, 100) : null,
					umbrales: [80, 100],
					alerta_pronostico: true
				});
				creadas++;
			} catch (err) {
				if (!(err instanceof ErrorDuplicado)) {
					fallo = true;
					break;
				}
				omitidas++;
			}
		}
		setEnviando(false);
		if (fallo) setAviso({ tipo: 'error', texto: 'No pudimos crear todas las alertas.' });
		else if (!creadas && !omitidas) {
			setAviso({ tipo: 'error', texto: 'Elige al menos una sugerencia.' });
			return;
		} else {
			setAviso({ tipo: 'ok', texto: `Creamos ${creadas} ${creadas === 1 ? 'alerta' : 'alertas'}${omitidas ? ` (${omitidas} ya existían)` : ''}.` });
			setPanel(null);
		}
		await carga.recargar();
	}

	const cabecera = {
		titulo: 'Alertas de presupuesto',
		subtitulo: 'Te avisamos al cruzar tus umbrales o si al ritmo actual te vas a pasar',
		derecha: (
			<SelectorMes
				mes={mes}
				minimo={minimo}
				maximo={actual}
				onCambio={(m) => {
					setAviso(null);
					cambiarMes(m);
				}}
			/>
		)
	};
	if (!data) return <Pagina {...cabecera} sinDatos={!carga.error} error={carga.error} onReintentar={carga.recargar} />;

	const enCurso = data.mes === actual;
	const nombreMes = mesLargo(data.mes).split(' ')[0].toLowerCase();
	const porId = new Map(data.presupuestos.map((p) => [p.presupuesto_id, p]));
	const conteo = (['excedido', 'aviso', 'pronostico_excede', 'ok'] as EstadoAlerta[]).map((x) => ({ estado: x, n: data.estados.filter((y) => y.estado === x).length }));
	const proyectadoPct = (x: EstadoPresupuesto) => (x.proyectado_cierre == null || !(x.limite > 0) ? null : (100 * x.proyectado_cierre) / x.limite);
	const colorEstado = (x: EstadoAlerta) => (x === 'excedido' ? c.progresoExceso : x === 'ok' ? c.progresoOk : c.progresoAlerta);
	const colorConteo = (x: EstadoAlerta, n: number) => (n === 0 ? c.texto3 : x === 'excedido' ? c.negativo : x === 'ok' ? c.positivo : c.aviso);
	const angosto = ventana <= 480;

	return (
		<Pagina {...cabecera} cargando={carga.cargando} onReintentar={carga.recargar}>
			{aviso ? <Mensaje tipo={aviso.tipo}>{aviso.texto}</Mensaje> : null}

			{data.estados.length ? (
				<View style={{ flexDirection: 'row', gap: 10 }} aria-label={`Estado de tus alertas en ${nombreMes}`}>
					{conteo.map((x) => (
						<Tarjeta key={x.estado} estilo={[e.mini, angosto && { padding: 10 }]}>
							<Text style={[k.cifra, { color: colorConteo(x.estado, x.n) }, angosto && { fontSize: 20 }]}>{x.n}</Text>
							<Text style={[k.etiqueta, { lineHeight: 15 }, angosto && { fontSize: 11.2 }]}>{ESTADOS[x.estado].texto}</Text>
						</Tarjeta>
					))}
				</View>
			) : null}

			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
				<Boton
					variante="primario"
					icono="mas_simple"
					texto="Nueva alerta"
					expandido={panel === 'nueva'}
					onPress={() => {
						setAviso(null);
						setPanel(panel === 'nueva' ? null : 'nueva');
					}}
				/>
				{data.sugeridos.length ? <Boton icono="chispa" texto="Usar sugerencias" expandido={panel === 'sugerencias'} onPress={abrirSugerencias} /> : null}
			</View>

			{panel === 'nueva' ? (
				<Tarjeta>
					<Text style={[k.h2, { marginBottom: 12 }]} role="heading" aria-level={2}>
						Nueva alerta
					</Text>
					<FormularioAlerta mes={data.mes} onGuardar={guardar} onCancelar={() => setPanel(null)} />
				</Tarjeta>
			) : panel === 'sugerencias' ? (
				<Tarjeta>
					<Text style={[k.h2, { marginBottom: 12 }]} role="heading" aria-level={2}>
						Sugerencias según tus últimos meses
					</Text>
					<Text style={k.tenue}>
						Promedio de los últimos {data.sugeridos.find((s) => s.meses_base)?.meses_base ?? 3} meses cerrados, redondeado a miles. Revisa los montos y marca las que
						quieras crear; quedan como alertas de todos los meses con umbrales 80% y 100%.
					</Text>
					<View style={{ marginVertical: 12 }}>
						{data.sugeridos.map((s) => {
							const nombre = nombrePresupuesto(s.tipo, s.categoria);
							return (
								<View key={s.clave} style={e.sugerencia}>
									<Casilla
										marcada={!!elegidas[s.clave] && !s.existe}
										deshabilitada={s.existe}
										etiqueta={nombre}
										onCambio={(v) => setElegidas({ ...elegidas, [s.clave]: v })}
									>
										<Punto color={s.categoria ? t.cat(s.categoria) : c.acento} />
										<Text style={[e.nombre, s.existe && { color: c.texto3 }]} numberOfLines={1}>
											{nombre}
										</Text>
									</Casilla>
									{s.existe ? (
										<Insignia texto="Ya existe" />
									) : (
										<View style={e.valor}>
											{s.tipo !== 'carga_cuotas' ? <Text style={e.adorno}>$</Text> : null}
											<TextInput
												style={e.entrada}
												inputMode="numeric"
												aria-label={`Límite para ${nombre}`}
												value={valores[s.clave] ?? ''}
												onChangeText={(v) => setValores({ ...valores, [s.clave]: s.tipo === 'carga_cuotas' ? v.replace(/[^\d]/g, '') : conMiles(v) })}
											/>
											{s.tipo === 'carga_cuotas' ? <Text style={e.adorno}>%</Text> : null}
										</View>
									)}
								</View>
							);
						})}
					</View>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
						<Boton variante="primario" icono="ok" texto="Crear alertas marcadas" deshabilitado={enviando} onPress={crearSugerencias} />
						<Boton variante="fantasma" texto="Cancelar" onPress={() => setPanel(null)} />
					</View>
				</Tarjeta>
			) : null}

			{data.estados.length ? (
				<Rejilla columnas={2}>
					{data.estados.map((x) => {
						const def = porId.get(x.presupuesto_id);
						const pp = proyectadoPct(x);
						const nombre = nombrePresupuesto(x.tipo, x.categoria);
						const clase = ESTADOS[x.estado].clase;
						return (
							<Tarjeta key={x.presupuesto_id} estilo={[e.alerta, { borderLeftColor: colorEstado(x.estado) }]}>
								<View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
									<View style={{ marginTop: 6 }}>
										<Punto color={x.categoria ? t.cat(x.categoria) : c.acento} />
									</View>
									<View style={{ flex: 1, minWidth: 0 }}>
										<Text style={k.h2} role="heading" aria-level={2}>
											{nombre}
										</Text>
										<Text style={[k.tenue, { fontSize: 12.2 }]}>
											{TIPOS.find((y) => y.id === x.tipo)?.nombre} ·{' '}
											{x.recurrente
												? 'Todos los meses'
												: `Solo ${nombreMes}${data.recurrentes.has(`${x.tipo}|${x.categoria ?? ''}`) ? ' (reemplaza al de todos los meses)' : ''}`}
										</Text>
									</View>
									<Insignia
										clase={clase === 'ok' ? 'ok' : (clase as 'negativo')}
										icono={x.estado === 'ok' ? undefined : x.estado === 'pronostico_excede' ? 'tendencia' : 'alerta'}
										texto={ESTADOS[x.estado].texto}
									/>
								</View>

								<View style={e.consumo}>
									<Text style={e.consumoCifra}>{valorAlerta(x.tipo, x.consumido)}</Text>
									<Text style={e.consumoDe}>
										de {valorAlerta(x.tipo, x.limite)}
										{x.tipo === 'carga_cuotas' ? ' de tu ingreso' : ''}
									</Text>
									{x.porcentaje != null && x.tipo !== 'carga_cuotas' ? <Text style={e.pct}>{porcentaje(x.porcentaje)}</Text> : null}
								</View>

								<BarraAlerta
									porcentaje={x.porcentaje}
									proyectado={x.tipo === 'carga_cuotas' ? null : pp}
									umbrales={x.umbrales}
									estado={x.estado}
									etiqueta={`Consumo de ${nombre}`}
								/>

								<View style={{ gap: 4 }}>
									{x.tipo === 'compras_credito' ? (
										<Text style={e.detalle}>
											{x.cantidad ?? 0} {x.cantidad === 1 ? 'compra nueva' : 'compras nuevas'} en cuotas este mes
										</Text>
									) : null}
									{x.tipo === 'carga_cuotas' ? (
										<Text style={e.detalle}>
											{x.ingreso_referencia ? (
												`Cuotas y dividendos ${clp(x.cuotas_mes)} sobre un ingreso de ${clp(x.ingreso_referencia)}`
											) : (
												<>
													Sin ingreso de referencia: decláralo en <Enlace href="/plan">Plan</Enlace>
												</>
											)}
										</Text>
									) : null}
									{enCurso && x.tipo !== 'carga_cuotas' && x.proyectado_cierre != null ? (
										<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
											<Icono nombre="tendencia" tam={14} color={x.excede_pronostico ? c.negativo : c.texto2} />
											<Text style={[e.detalle, { flex: 1 }, x.excede_pronostico && { color: c.negativo }]}>
												Al ritmo actual cierras en {valorAlerta(x.tipo, x.proyectado_cierre)}
												{pp != null ? ` (${porcentaje(pp)})` : ''}
												{!x.alerta_pronostico ? ' · sin aviso de pronóstico' : ''}
											</Text>
										</View>
									) : null}
									{x.umbral_cruzado != null && x.estado !== 'excedido' ? <Text style={e.detalle}>Cruzaste el umbral de {x.umbral_cruzado}%</Text> : null}
									{x.estado === 'excedido' && x.tipo !== 'carga_cuotas' ? (
										<Text style={[e.detalle, { color: c.negativo }]}>Te pasaste por {valorAlerta(x.tipo, (x.consumido ?? 0) - x.limite)}</Text>
									) : null}
								</View>

								{def ? (
									<>
										<View style={e.pie}>
											<Boton
												variante="fantasma"
												chico
												icono="editar"
												texto="Editar"
												expandido={editando === x.presupuesto_id}
												etiqueta={`Editar ${nombre}`}
												onPress={() => {
													setAviso(null);
													setEditando(editando === x.presupuesto_id ? null : x.presupuesto_id);
												}}
											/>
										</View>
										{editando === x.presupuesto_id ? (
											<View style={e.edicion}>
												<FormularioAlerta presupuesto={def} mes={data.mes} onGuardar={guardar} onCancelar={() => setEditando(null)} />
												<View style={e.borrar}>
													<Boton
														variante="fantasma"
														chico
														icono="borrar"
														color={c.negativo}
														texto="Borrar esta alerta"
														deshabilitado={enviando}
														onPress={() => borrar(x.presupuesto_id)}
													/>
												</View>
											</View>
										) : null}
									</>
								) : null}
							</Tarjeta>
						);
					})}
				</Rejilla>
			) : (
				<Tarjeta>
					<Vacio icono="campana" titulo={`Aún no tienes alertas para ${nombreMes}`}>
						Define límites y te avisamos al cruzar tus umbrales o si el pronóstico dice que te vas a pasar.
						{data.sugeridos.length ? ' Parte con «Usar sugerencias», calculadas con tus últimos meses.' : ''}
					</Vacio>
				</Tarjeta>
			)}

			<Text style={[k.tenue, { fontSize: 12.5 }]}>
				El pronóstico proyecta lo gastado a la fecha hasta fin de mes al mismo ritmo diario. La carga de cuotas compara las cuotas y dividendos del mes con tu ingreso
				declarado en <Enlace href="/plan">Plan</Enlace> o, si no lo has declarado, con el promedio de tus últimos 3 meses con ingresos.
			</Text>
		</Pagina>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		mini: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
		sugerencia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borde },
		nombre: { fontWeight: '600', fontSize: 14.4, color: c.texto, flexShrink: 1 },
		valor: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
		adorno: { color: c.texto3, fontWeight: '600' },
		entrada: {
			width: 118,
			minHeight: 40,
			textAlign: 'right',
			paddingHorizontal: 12,
			borderRadius: radio.control,
			borderWidth: 1,
			borderColor: c.bordeFuerte,
			backgroundColor: c.superficie,
			color: c.texto,
			fontSize: 14.4,
			fontVariant: NUMEROS
		},
		alerta: { gap: 12, borderLeftWidth: 4, flexGrow: 1 },
		consumo: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 4 },
		consumoCifra: { fontSize: 23.2, fontWeight: '700', letterSpacing: -0.7, color: c.texto, fontVariant: NUMEROS },
		consumoDe: { color: c.texto3, fontSize: 14.4, fontVariant: NUMEROS },
		pct: { marginLeft: 'auto', fontWeight: '700', color: c.texto2, fontSize: 14.4, fontVariant: NUMEROS },
		detalle: { fontSize: 13.1, color: c.texto2 },
		pie: { flexDirection: 'row', gap: 4, marginTop: 'auto', paddingTop: 8, borderTopWidth: 1, borderTopColor: c.borde },
		edicion: { padding: 14, borderRadius: 12, backgroundColor: c.superficie2 },
		borrar: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.bordeFuerte, flexDirection: 'row' }
	});
}

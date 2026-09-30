import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Boton, CabeceraTarjeta, CampoTexto, conMiles, Enlace, Insignia, Mensaje, Punto, Rejilla, Tarjeta, Vacio } from '@/componentes/base';
import { GraficoLiberacion } from '@/componentes/GraficoLiberacion';
import { Icono } from '@/componentes/Icono';
import { Pagina } from '@/componentes/Pagina';
import { useCarga } from '@/datos/carga';
import { ErrorDuplicado } from '@/datos/errores';
import { useFuente } from '@/datos/sesion';
import type { FuenteDatos, Perfil, PresupuestoEntrada } from '@/datos/tipos';
import { nombreCategoria } from '@/lib/categorias';
import { sumarMeses } from '@/lib/fechas';
import { clp, mesLargo, porcentaje } from '@/lib/formato';
import { comunes } from '@/tema/comunes';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { NUMEROS, type Tema } from '@/tema/tokens';

function entero(v: string): number | null {
	const d = v.replace(/\D/g, '');
	return d ? Number(d) : null;
}

// Crea o actualiza la alerta recurrente del tipo y categoría indicados
async function fijarRecurrente(datos: FuenteDatos, tipo: 'categoria' | 'compras_credito', categoria: string | null, monto: number) {
	const existentes = await datos.presupuestos();
	const previa = existentes.find((p) => p.mes === null && p.tipo === tipo && p.categoria === categoria);
	const entrada: PresupuestoEntrada = previa
		? { ...previa, monto_limite: monto }
		: { presupuesto_id: null, tipo, categoria, mes: null, monto_limite: monto, porcentaje_limite: null, umbrales: [80, 100], alerta_pronostico: true };
	await datos.guardarPresupuesto(entrada);
}

function FormularioPerfil({
	perfil,
	detectado,
	destacado,
	onGuardar
}: {
	perfil: Perfil | null;
	detectado: number | null;
	destacado: boolean;
	onGuardar: (campos: { ingreso: string; dia: string; meta: string; tope: string }) => Promise<void>;
}) {
	const { ventana } = useAncho();
	const k = useEstilos(comunes);
	const [ingreso, setIngreso] = useState(conMiles(String(perfil?.ingreso_mensual_neto ?? '')));
	const [dia, setDia] = useState(perfil?.dia_pago != null ? String(perfil.dia_pago) : '');
	const [meta, setMeta] = useState(conMiles(String(perfil?.meta_ahorro_mensual || '')));
	const [tope, setTope] = useState(String(perfil?.tope_carga_cuotas_pct ?? 30));
	const [enviando, setEnviando] = useState(false);
	const ancho = ventana >= 900;

	const campoIngreso = (
		<CampoTexto
			estilo={{ flex: ancho ? 1.4 : undefined }}
			etiqueta="Ingreso líquido mensual"
			prefijo="$"
			inputMode="numeric"
			placeholder={detectado ? conMiles(String(detectado)) : '1.500.000'}
			value={ingreso}
			onChangeText={(v) => setIngreso(conMiles(v))}
		/>
	);
	const campoDia = (
		<CampoTexto estilo={{ flex: ancho ? 0.7 : 1 }} etiqueta="Día de pago" inputMode="numeric" placeholder="30" value={dia} onChangeText={(v) => setDia(v.replace(/\D/g, '').slice(0, 2))} />
	);
	const campoMeta = (
		<CampoTexto estilo={{ flex: 1 }} etiqueta="Meta de ahorro mensual" prefijo="$" inputMode="numeric" placeholder="0" value={meta} onChangeText={(v) => setMeta(conMiles(v))} />
	);
	const campoTope = (
		<CampoTexto estilo={{ flex: 1 }} etiqueta="Tope de cuotas (% del ingreso)" inputMode="numeric" value={tope} onChangeText={(v) => setTope(v.replace(/\D/g, '').slice(0, 3))} />
	);
	const boton = (
		<Boton
			variante="primario"
			icono="ok"
			texto="Guardar"
			deshabilitado={enviando}
			onPress={async () => {
				setEnviando(true);
				await onGuardar({ ingreso, dia, meta, tope });
				setEnviando(false);
			}}
		/>
	);
	const nota = <Text style={[k.tenue, { fontSize: 12 }]}>Si te pagan a fin de mes, ese sueldo se cuenta para el mes siguiente.</Text>;

	if (ancho) {
		return (
			<View style={{ gap: 8 }}>
				<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
					{campoIngreso}
					{campoDia}
					{campoMeta}
					{campoTope}
					{boton}
				</View>
				{nota}
			</View>
		);
	}
	return (
		<View style={{ gap: 12 }} aria-label={destacado ? 'Declara tu ingreso' : 'Tus datos'}>
			{campoIngreso}
			<View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
				{campoDia}
				{campoMeta}
			</View>
			{nota}
			{campoTope}
			{boton}
		</View>
	);
}

export default function Plan() {
	const { mes: param } = useLocalSearchParams<{ mes?: string }>();
	const proximo = param === 'proximo';
	const d = useFuente();
	const t = useTema();
	const { c } = t;
	const e = useEstilos(estilos);
	const k = useEstilos(comunes);
	const { ventana, ancho720 } = useAncho();
	const [confirmando, setConfirmando] = useState(false);
	const [enviando, setEnviando] = useState(false);
	const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string; alertas?: boolean } | null>(null);
	const [versionPerfil, setVersionPerfil] = useState(0);

	const carga = useCarga(async () => {
		const [planes, categorias, liberacion, perfil] = await Promise.all([d.planAjuste(), d.planCategorias(), d.liberacionCuotas(), d.perfil()]);
		const plan = planes.find((p) => p.en_curso !== proximo) ?? null;
		return { proximo, plan, meses: planes.map((p) => p.mes), categorias: plan ? categorias.filter((x) => x.mes === plan.mes) : [], liberacion, perfil };
	}, [d, proximo]);
	const data = carga.datos;

	useEffect(() => setConfirmando(false), [proximo]);

	async function guardarPerfil(f: { ingreso: string; dia: string; meta: string; tope: string }) {
		const ingreso = entero(f.ingreso);
		const dia = entero(f.dia);
		const meta = entero(f.meta) ?? 0;
		const tope = entero(f.tope) ?? 30;
		const error =
			ingreso != null && (ingreso < 1_000 || ingreso > 1_000_000_000)
				? 'Revisa el ingreso: escribe tu sueldo líquido mensual.'
				: dia != null && (dia < 1 || dia > 31)
					? 'El día de pago va del 1 al 31.'
					: meta > 1_000_000_000
						? 'Revisa la meta de ahorro.'
						: tope < 1 || tope > 100
							? 'El tope de cuotas va del 1% al 100%.'
							: null;
		if (error) {
			setAviso({ tipo: 'error', texto: error });
			return;
		}
		try {
			await d.guardarPerfil({ ingreso_mensual_neto: ingreso, dia_pago: dia, meta_ahorro_mensual: meta, tope_carga_cuotas_pct: tope });
		} catch {
			setAviso({ tipo: 'error', texto: 'No pudimos guardar tus datos. Intenta de nuevo.' });
			return;
		}
		setAviso({ tipo: 'ok', texto: 'Guardamos tus datos. El plan ya usa tu ingreso declarado.' });
		await carga.recargar();
		setVersionPerfil((v) => v + 1);
	}

	async function convertir() {
		if (!data?.plan) return;
		setEnviando(true);
		const plan = data.plan;
		let n = 0;
		try {
			for (const x of data.categorias) {
				await fijarRecurrente(d, 'categoria', x.categoria, x.limite_alerta);
				n++;
			}
			if (plan.compras_credito_sugerido != null) {
				await fijarRecurrente(d, 'compras_credito', null, plan.compras_credito_sugerido);
				n++;
			}
			setAviso({ tipo: 'ok', texto: `Listo: ${n} alertas activas.`, alertas: true });
			setConfirmando(false);
		} catch (err) {
			const texto = err instanceof ErrorDuplicado ? 'Una de las alertas chocó con otra existente.' : 'No pudimos crear todas las alertas.';
			setAviso({ tipo: 'error', texto: `${texto} Revisa la pantalla de alertas.` });
		}
		setEnviando(false);
	}

	const pestanas =
		data && data.meses.length === 2 ? (
			<View style={e.pestanas} role="tablist" aria-label="Mes del plan">
				{[
					{ texto: 'Este mes', activa: !proximo, valor: undefined },
					{ texto: 'Próximo mes', activa: proximo, valor: 'proximo' }
				].map((x) => (
					<Pressable
						key={x.texto}
						role="tab"
						aria-selected={x.activa}
						onPress={() => {
							setAviso(null);
							router.setParams({ mes: x.valor });
						}}
						style={[e.pestana, x.activa && e.pestanaActiva]}
					>
						<Text style={[e.pestanaTexto, x.activa && { color: c.texto }]}>{x.texto}</Text>
					</Pressable>
				))}
			</View>
		) : null;
	const cabecera = { titulo: 'Plan', subtitulo: 'Cuánto puedes gastar después de cuotas y gastos fijos', derecha: pestanas };
	if (!data) return <Pagina {...cabecera} sinDatos={!carga.error} error={carga.error} onReintentar={carga.recargar} />;

	const p = data.plan;
	const nombreMes = p ? mesLargo(p.mes).split(' ')[0].toLowerCase() : '';
	const pedirIngreso = !data.perfil?.ingreso_mensual_neto;
	const totales = {
		promedio: data.categorias.reduce((s, x) => s + x.promedio, 0),
		limite: data.categorias.reduce((s, x) => s + x.limite_sugerido, 0)
	};
	const faltaEsenciales = p && p.disponible_variable != null ? p.esenciales_objetivo - Math.max(p.disponible_variable, 0) : 0;

	// Ventana visible: hasta 24 meses, o hasta 3 meses después de bajar del tope (mínimo 12)
	const libCompleta = data.liberacion;
	const iBajo = libCompleta.findIndex((l) => l.mes === libCompleta[0]?.mes_bajo_tope);
	const lib = libCompleta.slice(0, iBajo >= 0 ? Math.min(24, Math.max(12, iBajo + 3)) : 24);
	const ultimoMes = libCompleta.length ? libCompleta[libCompleta.length - 1].mes : null;
	const tope = lib[0]?.tope_carga_cuotas_pct ?? p?.tope_carga_cuotas_pct ?? 30;
	const mesBajo = lib[0]?.mes_bajo_tope ?? null;
	const filaBajo = lib.find((l) => l.mes === mesBajo);
	const minimo = lib.length ? lib.reduce((a, l) => ((l.carga_pct ?? 0) < (a.carga_pct ?? 0) ? l : a)) : null;
	const rojo = !!p && ((p.disponible_variable ?? 0) < 0 || (p.en_curso && (p.restante_variable ?? 0) < 0));
	const frase = Math.max(20, Math.min(25.6, ventana * 0.046));
	const tablaAncha = ancho720;

	const Fuerte = ({ children, color }: { children: string; color: string }) => <Text style={{ color, fontWeight: '700', fontVariant: NUMEROS }}>{children}</Text>;

	return (
		<Pagina {...cabecera} cargando={carga.cargando} onReintentar={carga.recargar}>
			{aviso ? (
				<Mensaje tipo={aviso.tipo}>
					{aviso.texto}
					{aviso.alertas ? (
						<>
							{' '}
							<Enlace href="/presupuestos">Ver alertas</Enlace>
						</>
					) : null}
				</Mensaje>
			) : null}

			{pedirIngreso ? (
				<Tarjeta degradado={c.avisoSuave} estilo={{ gap: 14, borderColor: c.aviso + '66' }}>
					<View>
						<Text style={k.h2} role="heading" aria-level={2}>
							¿Cuánto te pagan líquido al mes?
						</Text>
						<Text style={[k.cuerpo, { marginTop: 4 }]}>
							{p?.ingreso_detectado
								? `Por tus bancos estimamos ${clp(p.ingreso_detectado)}, pero hay meses sin sueldo visible. Sin tu ingreso real este plan es aproximado.`
								: 'No vemos ingresos en tus bancos. Sin tu ingreso este plan no se puede calcular.'}
						</Text>
					</View>
					<FormularioPerfil key={`d${versionPerfil}`} perfil={data.perfil} detectado={p?.ingreso_detectado ?? null} destacado onGuardar={guardarPerfil} />
				</Tarjeta>
			) : null}

			{!p ? (
				<Tarjeta>
					<Vacio icono="plan" titulo="Aún no hay datos para armar el plan">
						Cuando se publiquen tus movimientos verás aquí tu plan.
					</Vacio>
				</Tarjeta>
			) : (
				<>
					<Tarjeta degradado={rojo ? c.negativoSuave : c.acentoSuave} estilo={{ padding: 22, gap: 8 }}>
						<Text style={[e.frase, { fontSize: frase, lineHeight: frase * 1.25 }]}>
							{p.disponible_variable == null ? (
								'Declara tu ingreso para saber cuánto puedes gastar.'
							) : p.disponible_variable < 0 ? (
								<>
									{p.en_curso ? 'Este mes ya estás' : 'El próximo mes partes'} <Fuerte color={c.negativo}>{clp(-p.disponible_variable)}</Fuerte> bajo cero antes de
									gastar.
								</>
							) : p.en_curso && (p.restante_variable ?? 0) < 0 ? (
								<>
									Este mes ya te pasaste <Fuerte color={c.negativo}>{clp(-(p.restante_variable ?? 0))}</Fuerte> en gasto variable.
								</>
							) : p.en_curso ? (
								<>
									Este mes te quedan <Fuerte color={c.positivo}>{clp(p.restante_variable)}</Fuerte> para gasto variable.
								</>
							) : (
								<>
									En {nombreMes} tendrás <Fuerte color={c.positivo}>{clp(p.disponible_variable)}</Fuerte> para gasto variable.
								</>
							)}
						</Text>
						{p.disponible_variable != null && p.disponible_variable < 0 ? (
							<Text style={k.tenue}>Tus cuotas y gastos fijos superan tu ingreso{p.ingreso_declarado ? '' : ' estimado'}. Cada compra suma a ese hoyo.</Text>
						) : p.disponible_variable != null && p.en_curso && (p.restante_variable ?? 0) < 0 ? (
							<Text style={k.tenue}>
								Tenías {clp(p.disponible_variable)} y llevas {clp(p.gasto_variable_mes)}. Lo que queda del mes, idealmente solo lo esencial.
							</Text>
						) : p.disponible_variable != null && p.en_curso ? (
							<Text style={k.tenue}>
								De {clp(p.disponible_variable)} disponibles llevas gastados {clp(p.gasto_variable_mes)}.
							</Text>
						) : null}

						{p.ingreso_referencia != null ? (
							<>
								<View style={e.cascada}>
									<FilaCascada texto={`Ingreso ${p.ingreso_declarado ? 'declarado' : 'estimado'}`} valor={clp(p.ingreso_referencia)} />
									<FilaCascada texto={`Cuotas y dividendos de ${nombreMes}`} valor={`−${clp(p.compromisos)}`} />
									<FilaCascada texto="Gastos fijos" detalle="(cuentas, seguros, salud, educación, suscripciones, comisiones)" valor={`−${clp(p.gastos_fijos)}`} />
									{p.meta_ahorro > 0 ? <FilaCascada texto="Meta de ahorro" valor={`−${clp(p.meta_ahorro)}`} /> : null}
									<FilaCascada total texto="Para gasto variable" valor={clp(p.disponible_variable)} negativo={(p.disponible_variable ?? 0) < 0} />
									{p.en_curso ? (
										<>
											<FilaCascada texto="Ya gastado en variable" valor={`−${clp(p.gasto_variable_mes)}`} />
											<FilaCascada total texto="Te quedan" valor={clp(p.restante_variable)} negativo={(p.restante_variable ?? 0) < 0} />
										</>
									) : null}
								</View>
								<Text style={[k.tenue, { fontSize: 12.2 }]}>Tu gasto variable promedio es {clp(p.gasto_variable_promedio)} al mes.</Text>
							</>
						) : null}
					</Tarjeta>

					<Rejilla columnas={p.alcanza_esenciales === false ? 2 : 1}>
						{p.alcanza_esenciales === false ? (
							<Tarjeta estilo={{ flexGrow: 1, backgroundColor: c.avisoSuave, borderColor: c.aviso + '66' }}>
								<View style={e.tituloIcono}>
									<Icono nombre="alerta" tam={18} color={c.aviso} />
									<Text style={[k.h2, { color: c.aviso }]}>Lo esencial no alcanza</Text>
								</View>
								<Text style={k.cuerpo}>
									Supermercado, transporte y combustible al 90% de tu promedio suman {clp(p.esenciales_objetivo)}. Te faltan{' '}
									<Text style={{ fontWeight: '700' }}>{clp(faltaEsenciales)}</Text>, así que lo demás queda en $0 hasta que bajen tus cuotas o suba tu ingreso.
								</Text>
							</Tarjeta>
						) : null}
						<Tarjeta estilo={{ flexGrow: 1 }}>
							<View style={e.tituloIcono}>
								<Icono nombre="deudas" tam={18} color={c.texto} />
								<Text style={k.h2}>Compras nuevas en cuotas</Text>
							</View>
							{p.compras_credito_sugerido == null ? (
								<Text style={k.cuerpo}>Declara tu ingreso para calcular cuánto puedes comprar en cuotas.</Text>
							) : p.compras_credito_sugerido === 0 ? (
								<>
									<Text style={[k.cifra, k.negativo, { marginBottom: 4 }]}>$0</Text>
									<Text style={k.cuerpo}>
										No sumes cuotas nuevas: en {mesLargo(sumarMeses(p.mes, 1)).split(' ')[0].toLowerCase()} tus cuotas ya son {porcentaje(p.carga_mes_siguiente_pct, 1)} de tu
										ingreso y tu tope es {p.tope_carga_cuotas_pct}%.
									</Text>
								</>
							) : (
								<>
									<Text style={[k.cifra, k.positivo, { marginBottom: 4 }]}>
										{clp(p.compras_credito_sugerido)} <Text style={e.de}>al mes</Text>
									</Text>
									<Text style={k.cuerpo}>Es lo que puedes sumar en cuotas nuevas sin pasar tu tope de {p.tope_carga_cuotas_pct}% del ingreso.</Text>
								</>
							)}
						</Tarjeta>
					</Rejilla>

					<Tarjeta>
						<CabeceraTarjeta titulo={`Límites sugeridos para ${nombreMes}`} subtitulo="Lo esencial al 90% de tu promedio; lo demás se recorta hasta que cuadre." />
						{data.categorias.length ? (
							<>
								<View role="table" aria-label="Límites sugeridos por categoría">
									{tablaAncha ? (
										<View style={[e.filaTabla, { paddingTop: 0 }]} role="row">
											<Text style={[e.cabeceraTabla, { flex: 2 }]}>Categoría</Text>
											<Text style={[e.cabeceraTabla, e.der]}>Tu promedio</Text>
											<Text style={[e.cabeceraTabla, e.der]}>Límite</Text>
											<Text style={[e.cabeceraTabla, e.der]}>Recorte</Text>
										</View>
									) : null}
									{data.categorias.map((x) => {
										const nombre = x.categoria === 'entretenimiento_suscripciones' ? 'Entretenimiento (sin suscripciones fijas)' : nombreCategoria(x.categoria);
										const celdaCat = (
											<View style={[e.celdaCat, tablaAncha && { flex: 2 }]} role="cell">
												<Punto color={t.cat(x.categoria)} />
												<Text style={e.nombreCat} numberOfLines={1}>
													{nombre}
												</Text>
												{x.esencial ? <Insignia clase="acento" texto="Esencial" /> : null}
											</View>
										);
										const celdas = (
											<>
												<Celda etiqueta="Promedio" ancha={tablaAncha} valor={clp(x.promedio)} />
												<Celda
													etiqueta="Límite"
													ancha={tablaAncha}
													valor={clp(x.limite_sugerido)}
													fuerte
													nota={p.en_curso && x.gastado_mes > 0 ? `llevas ${clp(x.gastado_mes)}` : undefined}
													notaNegativa={x.gastado_mes > x.limite_sugerido}
												/>
												<Celda
													etiqueta="Recorte"
													ancha={tablaAncha}
													valor={`${x.recorte > 0 ? `−${clp(x.recorte)}` : '$0'} `}
													sufijo={porcentaje(x.recorte_pct)}
													negativo
												/>
											</>
										);
										return (
											<View key={x.categoria} style={[e.filaTabla, !tablaAncha && { flexWrap: 'wrap', rowGap: 4 }]} role="row">
												{celdaCat}
												{tablaAncha ? celdas : <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>{celdas}</View>}
											</View>
										);
									})}
									<View style={[e.filaTabla, { borderBottomWidth: 0 }, !tablaAncha && { flexWrap: 'wrap', rowGap: 4 }]} role="row">
										<Text style={[e.nombreCat, { fontWeight: '700' }, tablaAncha ? { flex: 2 } : { width: '100%' }]}>Total</Text>
										<View style={tablaAncha ? { flex: 3, flexDirection: 'row', gap: 10 } : { flexDirection: 'row', gap: 10, width: '100%' }}>
											<Celda etiqueta="Promedio" ancha={tablaAncha} valor={clp(totales.promedio)} fuerte />
											<Celda etiqueta="Límite" ancha={tablaAncha} valor={clp(totales.limite)} fuerte />
											<Celda etiqueta="Recorte" ancha={tablaAncha} valor={`−${clp(totales.promedio - totales.limite)}`} negativo fuerte />
										</View>
									</View>
								</View>
								<Text style={[k.tenue, { fontSize: 12.2 }]}>
									Promedio de compras al contado de los últimos 3 meses cerrados. Las compras en cuotas ya están en tus cuotas del mes.
								</Text>
								{confirmando ? (
									<View style={e.confirmar}>
										<Text style={[k.cuerpo, { color: c.texto }]}>
											Crearemos {data.categorias.length} alertas de todos los meses por categoría
											{p.compras_credito_sugerido != null ? ` y un tope de compras en cuotas de ${clp(p.compras_credito_sugerido)}` : ''}. Si ya tienes una alerta de todos
											los meses para esa categoría, actualizamos su límite.
										</Text>
										<Text style={[k.tenue, { fontSize: 12.2 }]}>
											La alerta cuenta todo el gasto de la categoría, así que a cada límite le sumamos las cuotas que ya tienes en ella este mes y, en entretenimiento, tus
											suscripciones fijas.
										</Text>
										<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
											<Boton variante="primario" icono="ok" texto="Sí, crear alertas" deshabilitado={enviando} onPress={convertir} />
											<Boton variante="fantasma" texto="Cancelar" onPress={() => setConfirmando(false)} />
										</View>
									</View>
								) : (
									<View style={{ marginTop: 14, flexDirection: 'row' }}>
										<Boton
											variante="primario"
											icono="campana"
											texto="Convertir en alertas"
											onPress={() => {
												setAviso(null);
												setConfirmando(true);
											}}
										/>
									</View>
								)}
							</>
						) : (
							<Vacio icono="categorias" titulo="Sin gasto variable para comparar" compacto>
								Necesitamos al menos un mes cerrado con movimientos.
							</Vacio>
						)}
					</Tarjeta>
				</>
			)}

			{lib.length ? (
				<Tarjeta>
					<CabeceraTarjeta
						titulo="Cuándo se liberan tus cuotas"
						subtitulo={
							<Text style={[k.cuerpo, { marginTop: 4 }]}>
								{lib[0].carga_pct == null ? (
									'Declara tu ingreso para ver qué parte se va en cuotas.'
								) : mesBajo === lib[0].mes ? (
									`Tus cuotas ya están bajo tu tope de ${tope}% del ingreso.`
								) : mesBajo && filaBajo ? (
									<>
										Si no compras nada más en cuotas, en <Text style={{ fontWeight: '700' }}>{mesLargo(mesBajo).toLowerCase()}</Text> tus cuotas bajan a{' '}
										<Text style={{ fontWeight: '700' }}>{porcentaje(filaBajo.carga_pct, 0)}</Text> de tu ingreso.
									</>
								) : minimo ? (
									`Aun sin compras nuevas, en los próximos ${lib.length - 1} meses tus cuotas no bajan de tu tope de ${tope}%; lo más bajo es ${porcentaje(minimo.carga_pct, 0)} en ${mesLargo(minimo.mes).toLowerCase()}.`
								) : null}
							</Text>
						}
					/>
					{lib[0].carga_pct != null ? (
						<>
							<GraficoLiberacion filas={lib} tope={tope} mesBajo={mesBajo} />
							<Text style={[k.tenue, { fontSize: 12.2 }]}>
								Línea roja: tu tope de {tope}%. Barras: % de tu ingreso {!pedirIngreso ? 'declarado' : 'estimado'} ({clp(lib[0].ingreso_referencia)}) que se va en cuotas,
								créditos y dividendo cada mes.
							</Text>
							{ultimoMes && libCompleta.length > lib.length ? (
								<Text style={[k.tenue, { fontSize: 12.2, marginTop: 4 }]}>
									Se muestran los próximos {lib.length} meses. Tus compromisos de largo plazo (como el dividendo) siguen hasta {mesLargo(ultimoMes).toLowerCase()}.
								</Text>
							) : null}
						</>
					) : null}
				</Tarjeta>
			) : null}

			{!pedirIngreso ? (
				<Tarjeta>
					<Text style={[k.h2, { marginBottom: 12 }]} role="heading" aria-level={2}>
						Tus datos
					</Text>
					<FormularioPerfil key={`p${versionPerfil}`} perfil={data.perfil} detectado={p?.ingreso_detectado ?? null} destacado={false} onGuardar={guardarPerfil} />
				</Tarjeta>
			) : null}

			<Text style={[k.tenue, { fontSize: 12.5 }]}>
				Cómo calculamos: ingreso (el que declaras o, si falta, el promedio de tus últimos 3 meses con ingresos) − cuotas y dividendos del mes − gastos fijos (promedio de 3
				meses, sin el dividendo) − meta de ahorro = lo que queda para gasto variable.
			</Text>
		</Pagina>
	);
}

function FilaCascada({ texto, detalle, valor, total, negativo }: { texto: string; detalle?: string; valor: string; total?: boolean; negativo?: boolean }) {
	const e = useEstilos(estilos);
	const { c } = useTema();
	return (
		<View style={e.filaCascada}>
			<View style={{ flex: 1, minWidth: 0 }}>
				<Text style={[e.dt, total && { fontWeight: '700', color: c.texto }]}>{texto}</Text>
				{detalle ? <Text style={e.dtDetalle}>{detalle}</Text> : null}
			</View>
			<Text style={[e.dd, total && { fontWeight: '800' }, negativo && { color: c.negativo }]}>{valor}</Text>
		</View>
	);
}

function Celda({
	etiqueta,
	valor,
	ancha,
	fuerte,
	negativo,
	nota,
	notaNegativa,
	sufijo
}: {
	etiqueta: string;
	valor: string;
	ancha: boolean;
	fuerte?: boolean;
	negativo?: boolean;
	nota?: string;
	notaNegativa?: boolean;
	sufijo?: string;
}) {
	const e = useEstilos(estilos);
	const { c } = useTema();
	return (
		<View style={{ flex: 1, minWidth: 0, alignItems: ancha ? 'flex-end' : 'flex-start' }} role="cell">
			{!ancha ? <Text style={e.celdaEtiqueta}>{etiqueta}</Text> : null}
			<Text style={[e.celdaValor, fuerte && { fontWeight: '700' }, negativo && { color: c.negativo }]} numberOfLines={1}>
				{valor}
				{sufijo ? <Text style={[e.celdaNota, { color: c.negativo }]}>{sufijo}</Text> : null}
			</Text>
			{nota ? <Text style={[e.celdaNota, notaNegativa && { color: c.negativo }]}>{nota}</Text> : null}
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		pestanas: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: c.superficie2, borderWidth: 1, borderColor: c.borde, alignSelf: 'flex-start' },
		pestana: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 9 },
		pestanaActiva: { backgroundColor: c.superficie, boxShadow: c.sombra },
		pestanaTexto: { fontSize: 13.8, fontWeight: '600', color: c.texto2 },
		frase: { fontWeight: '600', letterSpacing: -0.4, color: c.texto },
		cascada: { marginTop: 10, borderTopWidth: 1, borderTopColor: c.borde },
		filaCascada: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.borde },
		dt: { color: c.texto2, fontSize: 14.4 },
		dtDetalle: { color: c.texto3, fontSize: 11.5 },
		dd: { fontWeight: '600', fontSize: 14.4, color: c.texto, fontVariant: NUMEROS },
		tituloIcono: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
		de: { fontSize: 14.4, fontWeight: '500', color: c.texto3 },
		filaTabla: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borde },
		cabeceraTabla: { flex: 1, fontSize: 11.8, fontWeight: '600', color: c.texto3 },
		der: { textAlign: 'right' },
		celdaCat: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' },
		nombreCat: { fontWeight: '600', fontSize: 14.1, color: c.texto, flexShrink: 1 },
		celdaEtiqueta: { fontSize: 10.9, fontWeight: '600', color: c.texto3 },
		celdaValor: { fontSize: 14.1, color: c.texto, fontVariant: NUMEROS },
		celdaNota: { fontSize: 11.5, color: c.texto3, fontVariant: NUMEROS },
		confirmar: { marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: c.superficie2, gap: 8 }
	});
}

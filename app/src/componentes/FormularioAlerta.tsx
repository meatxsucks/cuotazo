import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Presupuesto, PresupuestoEntrada, TipoPresupuesto } from '@/datos/tipos';
import { leerPresupuesto, TIPOS } from '@/lib/alertas';
import { CATEGORIAS_GASTO } from '@/lib/categorias';
import { mesLargo } from '@/lib/formato';
import { useEstilos, useTema } from '@/tema/tema';
import type { Tema } from '@/tema/tokens';
import { Boton, CampoTexto, Casilla, conMiles, Etiqueta, Mensaje, Opcion } from './base';
import { Selector } from './Selector';

export function FormularioAlerta({
	presupuesto = null,
	mes,
	onGuardar,
	onCancelar
}: {
	presupuesto?: Presupuesto | null;
	mes: string;
	onGuardar: (p: PresupuestoEntrada) => Promise<string | null>;
	onCancelar: () => void;
}) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const [anchoForm, setAnchoForm] = useState(0);
	const [inicial] = useState(presupuesto);
	const [tipo, setTipo] = useState<TipoPresupuesto>(inicial?.tipo ?? 'categoria');
	const [categoria, setCategoria] = useState(inicial?.categoria ?? '');
	const [monto, setMonto] = useState(inicial?.monto_limite != null ? conMiles(String(inicial.monto_limite)) : '');
	const [pct, setPct] = useState(inicial?.porcentaje_limite != null ? String(inicial.porcentaje_limite).replace('.', ',') : '30');
	const [umbrales, setUmbrales] = useState((inicial?.umbrales ?? [80, 100]).join(', '));
	const [pronostico, setPronostico] = useState(inicial?.alerta_pronostico ?? true);
	const [vigencia, setVigencia] = useState(inicial?.mes ?? '');
	const [enviando, setEnviando] = useState(false);
	const [error, setError] = useState('');

	const mesVigencia = inicial?.mes ?? mes;
	const columnasTipo = anchoForm >= 700 ? 4 : 2;

	async function enviar() {
		const p = leerPresupuesto({
			presupuesto_id: inicial?.presupuesto_id ?? null,
			tipo,
			categoria,
			monto,
			porcentaje: pct,
			umbrales,
			vigencia,
			alerta_pronostico: pronostico
		});
		if (typeof p === 'string') {
			setError(p);
			return;
		}
		setEnviando(true);
		setError('');
		const r = await onGuardar(p);
		setEnviando(false);
		if (r) setError(r);
	}

	return (
		<View style={{ gap: 16 }} onLayout={(ev) => setAnchoForm(ev.nativeEvent.layout.width)}>
			<View style={{ gap: 6 }} role="radiogroup" aria-label="¿Qué quieres vigilar?">
				<Etiqueta>¿Qué quieres vigilar?</Etiqueta>
				<View style={{ gap: 8 }}>
					{Array.from({ length: Math.ceil(TIPOS.length / columnasTipo) }, (_, fila) => (
						<View key={fila} style={{ flexDirection: 'row', gap: 8 }}>
							{TIPOS.slice(fila * columnasTipo, fila * columnasTipo + columnasTipo).map((t) => {
								const elegido = tipo === t.id;
								return (
									<Pressable
										key={t.id}
										role="radio"
										aria-checked={elegido}
										onPress={() => setTipo(t.id)}
										style={[e.tipo, elegido && { borderColor: c.acento, backgroundColor: c.acentoSuave }]}
									>
										<Text style={e.tipoNombre}>{t.nombre}</Text>
										<Text style={e.tipoDesc}>{t.descripcion}</Text>
									</Pressable>
								);
							})}
						</View>
					))}
				</View>
			</View>

			<View style={[e.campos, anchoForm >= 620 && { flexDirection: 'row' }]}>
				{tipo === 'categoria' ? (
					<Selector
						etiqueta="Categoría"
						valor={categoria}
						placeholder="Elige una categoría"
						opciones={CATEGORIAS_GASTO.map((x) => ({ valor: x.id, texto: x.nombre }))}
						onCambio={setCategoria}
					/>
				) : null}
				{tipo === 'carga_cuotas' ? (
					<CampoTexto
						estilo={{ flex: 1 }}
						etiqueta="Máximo de tu ingreso en cuotas"
						sufijo="%"
						inputMode="decimal"
						value={pct}
						onChangeText={setPct}
						ayuda="Cuotas y dividendos del mes ÷ tu ingreso de referencia."
					/>
				) : (
					<CampoTexto
						estilo={{ flex: 1 }}
						etiqueta={tipo === 'compras_credito' ? 'Tope de compras nuevas en cuotas' : 'Límite mensual'}
						prefijo="$"
						inputMode="numeric"
						placeholder="150.000"
						value={monto}
						onChangeText={(v) => setMonto(conMiles(v))}
					/>
				)}
				<CampoTexto
					estilo={{ flex: 1 }}
					etiqueta="Umbrales de aviso (%)"
					inputMode="numeric"
					value={umbrales}
					onChangeText={setUmbrales}
					ayuda="Separados por coma, por ejemplo 50, 80, 100."
				/>
			</View>

			<View style={{ gap: 6 }} role="radiogroup" aria-label="¿Cuándo aplica?">
				<Etiqueta>¿Cuándo aplica?</Etiqueta>
				<View style={e.vigencia}>
					<Opcion etiqueta="Todos los meses" elegida={vigencia === ''} onElegir={() => setVigencia('')}>
						<Text style={e.textoOpcion}>Todos los meses</Text>
					</Opcion>
					<Opcion etiqueta={`Solo ${mesLargo(mesVigencia).toLowerCase()}`} elegida={vigencia !== ''} onElegir={() => setVigencia(mesVigencia)}>
						<Text style={e.textoOpcion}>Solo {inicial?.mes ? mesLargo(inicial.mes).toLowerCase() : mesLargo(mes).split(' ')[0].toLowerCase()}</Text>
					</Opcion>
				</View>
			</View>

			<Casilla marcada={pronostico} onCambio={setPronostico} etiqueta="Avisarme si el pronóstico dice que me voy a pasar al cierre del mes">
				<Text style={[e.textoOpcion, { flex: 1 }]}>Avisarme si el pronóstico dice que me voy a pasar al cierre del mes</Text>
			</Casilla>

			{error ? <Mensaje tipo="error">{error}</Mensaje> : null}

			<View style={e.acciones}>
				<Boton variante="primario" icono="ok" texto={inicial ? 'Guardar cambios' : 'Crear alerta'} deshabilitado={enviando} onPress={enviar} />
				<Boton variante="fantasma" texto="Cancelar" onPress={onCancelar} />
			</View>
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		tipo: {
			gap: 2,
			paddingVertical: 10,
			paddingHorizontal: 12,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: c.bordeFuerte,
			backgroundColor: c.superficie,
			flex: 1,
			minWidth: 0
		},
		tipoNombre: { fontWeight: '600', fontSize: 14, color: c.texto },
		tipoDesc: { fontSize: 11.8, color: c.texto3, lineHeight: 15 },
		campos: { gap: 12 },
		vigencia: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 },
		textoOpcion: { fontSize: 14.4, color: c.texto },
		acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
	});
}

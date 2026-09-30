import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, CabeceraTarjeta, Tarjeta, Vacio } from '@/componentes/base';
import { FilaMovimiento } from '@/componentes/FilaMovimiento';
import { FILTRO_VACIO, Filtros, type ValoresFiltro } from '@/componentes/Filtros';
import { GraficoBarras } from '@/componentes/GraficoBarras';
import { Pagina } from '@/componentes/Pagina';
import { SelectorMes } from '@/componentes/SelectorMes';
import { useCarga } from '@/datos/carga';
import { cumpleFiltro } from '@/datos/filtro';
import { useFuente } from '@/datos/sesion';
import type { Movimiento } from '@/datos/tipos';
import { conDia, diasEnMes, finDeMes, hoyChile, mesDe } from '@/lib/fechas';
import { clp, diaLargo, mesLargo, NOMBRES_FLUJO } from '@/lib/formato';
import { useParamMes } from '@/lib/rutas';
import { comunes } from '@/tema/comunes';
import { useEstilos, useTema } from '@/tema/tema';

export default function Diario() {
	const [mes, cambiarMes] = useParamMes();
	const d = useFuente();
	const t = useTema();
	const k = useEstilos(comunes);
	const [filtro, setFiltro] = useState<ValoresFiltro>(FILTRO_VACIO);
	const [dia, setDia] = useState<number | null>(null);

	const carga = useCarga(async () => {
		const [pagina, productos] = await Promise.all([d.movimientos({ desde: mes, hasta: finDeMes(mes) }), d.productos()]);
		return { mes, hoy: hoyChile(), movimientos: pagina.filas, productos };
	}, [d, mes]);
	const data = carga.datos;

	// Por defecto, el último día con movimientos del mes
	useEffect(() => {
		if (!data) return;
		setDia(data.movimientos.length ? Math.max(...data.movimientos.map((m) => Number(m.fecha_imputacion.slice(8)))) : null);
	}, [data]);

	const calculo = useMemo(() => {
		if (!data) return null;
		const [bancoProducto, nombreProducto] = filtro.producto ? filtro.producto.split('|') : ['', ''];
		const filtrados = data.movimientos.filter(
			(m) =>
				cumpleFiltro(m, {
					banco: filtro.banco || undefined,
					producto: nombreProducto || undefined,
					categoria: filtro.categoria || undefined,
					tipo_flujo: filtro.tipo_flujo || undefined,
					texto: filtro.texto || undefined
				}) && (!bancoProducto || m.banco === bancoProducto)
		);
		const valor = (m: Movimiento) => {
			if (filtro.tipo_flujo) return Math.abs(m.monto);
			return m.tipo_flujo === 'gasto' || m.tipo_flujo === 'interes_comision' ? -m.monto : 0;
		};
		const nDias = diasEnMes(data.mes);
		const v = Array<number>(nDias).fill(0);
		for (const m of filtrados) v[Number(m.fecha_imputacion.slice(8)) - 1] += valor(m);
		const porDia = v.map((x) => Math.max(0, x));
		const total = porDia.reduce((s, x) => s + x, 0);
		const diasTranscurridos = mesDe(data.hoy) === data.mes ? Number(data.hoy.slice(8)) : nDias;
		return { filtrados, valor, porDia, total, diasTranscurridos };
	}, [data, filtro]);

	const cabecera = { titulo: 'Diario', subtitulo: 'Tu gasto día a día', derecha: <SelectorMes mes={mes} onCambio={cambiarMes} /> };
	if (!data || !calculo) return <Pagina {...cabecera} sinDatos={!carga.error} error={carga.error} onReintentar={carga.recargar} />;

	const { filtrados, valor, porDia, total, diasTranscurridos } = calculo;
	const lista = dia == null ? filtrados : filtrados.filter((m) => Number(m.fecha_imputacion.slice(8)) === dia);
	const totalLista = lista.reduce((s, m) => s + valor(m), 0);
	const queMide = filtro.tipo_flujo ? NOMBRES_FLUJO[filtro.tipo_flujo] : 'Gasto';
	const colorBarras = filtro.categoria ? t.cat(filtro.categoria) : t.c.acento;
	const hayFiltros = Object.values(filtro).some(Boolean);

	return (
		<Pagina {...cabecera} cargando={carga.cargando} onReintentar={carga.recargar}>
			<Filtros filtro={filtro} onCambio={setFiltro} productos={data.productos} />

			<Tarjeta>
				<CabeceraTarjeta
					titulo={`${queMide} por día`}
					subtitulo={hayFiltros ? 'Con los filtros aplicados' : 'Gastos e intereses; cada cuota en su mes'}
					derecha={
						<View style={{ alignItems: 'flex-end' }}>
							<Text style={k.cifra}>{clp(total)}</Text>
							<Text style={[k.tenue, k.num]}>{clp(total / Math.max(1, diasTranscurridos))} al día</Text>
						</View>
					}
				/>
				<GraficoBarras
					descripcion={`${queMide} por día en ${mesLargo(data.mes)}`}
					etiquetas={porDia.map((_, i) => String(i + 1))}
					titulos={porDia.map((_, i) => diaLargo(conDia(data.mes, i + 1)))}
					series={[{ id: 'total', nombre: queMide, color: colorBarras, valores: porDia }]}
					seleccionado={dia == null ? null : dia - 1}
					resaltado={mesDe(data.hoy) === data.mes ? Number(data.hoy.slice(8)) - 1 : null}
					onSeleccion={(i) => setDia(dia === i + 1 ? null : i + 1)}
					alto={210}
					anchoMaxBarra={22}
				/>
				<Text style={[k.tenue, { marginTop: 10, fontSize: 12 }]}>Toca una barra para ver ese día; tócala de nuevo para ver el mes completo.</Text>
			</Tarjeta>

			<Tarjeta>
				<CabeceraTarjeta
					titulo={dia == null ? `Todo ${mesLargo(data.mes).toLowerCase()}` : diaLargo(conDia(data.mes, dia))}
					subtitulo={`${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}`}
					derecha={
						<View style={[k.fila, { gap: 8 }]}>
							{dia != null ? <Boton variante="fantasma" texto="Ver mes" onPress={() => setDia(null)} /> : null}
							<Text style={[k.cifra, { fontSize: 18.4 }]}>{clp(totalLista)}</Text>
						</View>
					}
				/>
				{lista.length ? (
					<View role="list">
						{lista.map((m, i) => (
							<FilaMovimiento key={m.movimiento_id} m={m} conFecha={dia == null} ultima={i === lista.length - 1} />
						))}
					</View>
				) : (
					<Vacio titulo={hayFiltros ? 'Nada coincide con los filtros' : 'Sin movimientos este día'} compacto>
						{hayFiltros ? 'Prueba quitando algún filtro.' : 'Elige otro día en el gráfico.'}
					</Vacio>
				)}
			</Tarjeta>
		</Pagina>
	);
}

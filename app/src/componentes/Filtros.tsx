import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Producto } from '@/datos/tipos';
import { CATEGORIAS } from '@/lib/categorias';
import { NOMBRES_ESTADO, NOMBRES_FLUJO, nombreBanco } from '@/lib/formato';
import { useAncho, useEstilos, useTema } from '@/tema/tema';
import { radio, type Tema } from '@/tema/tokens';
import { Boton, CampoTexto } from './base';
import { Icono } from './Icono';
import { Selector } from './Selector';

export interface ValoresFiltro {
	banco: string;
	producto: string;
	categoria: string;
	tipo_flujo: string;
	texto: string;
	estado: string;
}

export const FILTRO_VACIO: ValoresFiltro = { banco: '', producto: '', categoria: '', tipo_flujo: '', texto: '', estado: '' };

export function Filtros({
	filtro,
	onCambio,
	productos,
	conEstado
}: {
	filtro: ValoresFiltro;
	onCambio: (f: ValoresFiltro) => void;
	productos: Producto[];
	conEstado?: boolean;
}) {
	const { c } = useTema();
	const e = useEstilos(estilos);
	const { escritorio } = useAncho();
	const [abierto, setAbierto] = useState(false);
	const [texto, setTexto] = useState(filtro.texto);
	const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
	const ultimo = useRef(filtro);
	ultimo.current = filtro;

	useEffect(() => setTexto(filtro.texto), [filtro.texto]);
	useEffect(() => () => {
		if (espera.current) clearTimeout(espera.current);
	}, []);

	const bancos = [...new Set(productos.map((p) => p.banco))].sort();
	const visibles = productos
		.filter((p) => !filtro.banco || p.banco === filtro.banco)
		.sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
	const activos = [filtro.banco, filtro.producto, filtro.categoria, filtro.tipo_flujo, conEstado ? filtro.estado : ''].filter(Boolean).length;

	const cambiar = (parcial: Partial<ValoresFiltro>) => onCambio({ ...ultimo.current, ...parcial });

	function escribir(v: string) {
		setTexto(v);
		if (espera.current) clearTimeout(espera.current);
		espera.current = setTimeout(() => cambiar({ texto: v }), 300);
	}

	const selects = [
			<Selector
				key="Banco"
				etiqueta="Banco"
				valor={filtro.banco}
				opciones={[{ valor: '', texto: 'Todos' }, ...bancos.map((b) => ({ valor: b, texto: nombreBanco(b) }))]}
				onCambio={(v) => cambiar({ banco: v, producto: filtro.producto && !filtro.producto.startsWith(v + '|') ? '' : filtro.producto })}
			/>,
			<Selector
				key="Producto"
				etiqueta="Producto"
				valor={filtro.producto}
				opciones={[
					{ valor: '', texto: 'Todos' },
					...visibles.map((p) => ({ valor: `${p.banco}|${p.producto_nombre}`, texto: `${p.producto_nombre} · ${nombreBanco(p.banco)}` }))
				]}
				onCambio={(v) => cambiar({ producto: v })}
			/>,
			<Selector
				key="Categoría"
				etiqueta="Categoría"
				valor={filtro.categoria}
				opciones={[{ valor: '', texto: 'Todas' }, ...CATEGORIAS.map((x) => ({ valor: x.id, texto: x.nombre }))]}
				onCambio={(v) => cambiar({ categoria: v })}
			/>,
			<Selector
				key="Tipo de flujo"
				etiqueta="Tipo de flujo"
				valor={filtro.tipo_flujo}
				opciones={[{ valor: '', texto: 'Todos' }, ...Object.entries(NOMBRES_FLUJO).map(([valor, t]) => ({ valor, texto: t }))]}
				onCambio={(v) => cambiar({ tipo_flujo: v })}
			/>,
			conEstado ? (
				<Selector
					key="Estado"
					etiqueta="Estado"
					valor={filtro.estado}
					opciones={[{ valor: '', texto: 'Todos' }, ...Object.entries(NOMBRES_ESTADO).map(([valor, t]) => ({ valor, texto: t }))]}
					onCambio={(v) => cambiar({ estado: v })}
				/>
			) : null
	].filter(Boolean);

	const limpiar =
		activos || filtro.texto ? (
			<Boton
				variante="fantasma"
				icono="cerrar"
				texto="Limpiar"
				onPress={() => {
					setTexto('');
					onCambio({ ...FILTRO_VACIO });
				}}
			/>
		) : null;

	const buscador = (
		<View style={e.buscar}>
			<CampoTexto
				value={texto}
				onChangeText={escribir}
				placeholder="Buscar comercio o glosa"
				aria-label="Buscar por glosa o comercio"
				autoCorrect={false}
				autoCapitalize="none"
				style={e.entrada}
			/>
			<View style={e.lupa} pointerEvents="none">
				<Icono nombre="buscar" tam={17} color={c.texto3} />
			</View>
		</View>
	);

	if (escritorio) {
		return (
			<View style={e.filaEscritorio}>
				<View style={{ flexBasis: 280, flexShrink: 1 }}>{buscador}</View>
				{selects}
				{limpiar}
			</View>
		);
	}

	const grupos = selects;
	return (
		<View style={{ gap: 10 }}>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<View style={{ flex: 1, minWidth: 0 }}>{buscador}</View>
				<Boton icono="filtro" texto={activos ? `Filtros · ${activos}` : 'Filtros'} expandido={abierto} onPress={() => setAbierto(!abierto)} />
			</View>
			{abierto ? (
				<View style={e.panel}>
					{Array.from({ length: Math.ceil(grupos.length / 2) }, (_, i) => (
						<View key={i} style={{ flexDirection: 'row', gap: 10 }}>
							{grupos[i * 2]}
							{grupos[i * 2 + 1] ?? <View style={{ flex: 1 }} />}
						</View>
					))}
					{limpiar}
				</View>
			) : null}
		</View>
	);
}

function estilos({ c }: Tema) {
	return StyleSheet.create({
		buscar: { position: 'relative', justifyContent: 'center' },
		entrada: { paddingLeft: 36, minHeight: 44 },
		lupa: { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' },
		filaEscritorio: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
		panel: { gap: 10, padding: 14, borderRadius: radio.tarjeta, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.borde }
	});
}

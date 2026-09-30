<script lang="ts">
	import FilaMovimiento from '$lib/componentes/FilaMovimiento.svelte';
	import Filtros from '$lib/componentes/Filtros.svelte';
	import GraficoBarras from '$lib/componentes/GraficoBarras.svelte';
	import SelectorMes from '$lib/componentes/SelectorMes.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { colorCategoria } from '$lib/categorias';
	import { cumpleFiltro } from '$lib/datos/filtro';
	import type { Movimiento } from '$lib/datos/tipos';
	import { conDia, diasEnMes, mesDe } from '$lib/fechas';
	import { clp, diaLargo, mesLargo, NOMBRES_FLUJO } from '$lib/formato';

	let { data } = $props();

	let filtro = $state({ banco: '', producto: '', categoria: '', tipo_flujo: '', texto: '' });
	// Por defecto, el último día con movimientos del mes
	let dia = $derived<number | null>(
		data.movimientos.length ? Math.max(...data.movimientos.map((m) => Number(m.fecha_imputacion.slice(8)))) : null
	);

	const filtrados = $derived(
		data.movimientos.filter((m) =>
			cumpleFiltro(m, {
				banco: filtro.banco || undefined,
				producto: filtro.producto ? filtro.producto.split('|')[1] : undefined,
				categoria: filtro.categoria || undefined,
				tipo_flujo: filtro.tipo_flujo || undefined,
				texto: filtro.texto || undefined
			}) && (!filtro.producto || m.banco === filtro.producto.split('|')[0])
		)
	);

	function valor(m: Movimiento): number {
		if (filtro.tipo_flujo) return Math.abs(m.monto);
		return m.tipo_flujo === 'gasto' || m.tipo_flujo === 'interes_comision' ? -m.monto : 0;
	}

	const nDias = $derived(diasEnMes(data.mes));
	const porDia = $derived.by(() => {
		const v = Array<number>(nDias).fill(0);
		for (const m of filtrados) v[Number(m.fecha_imputacion.slice(8)) - 1] += valor(m);
		return v.map((x) => Math.max(0, x));
	});
	const total = $derived(porDia.reduce((s, x) => s + x, 0));
	const diasTranscurridos = $derived(mesDe(data.hoy) === data.mes ? Number(data.hoy.slice(8)) : nDias);
	const lista = $derived(dia == null ? filtrados : filtrados.filter((m) => Number(m.fecha_imputacion.slice(8)) === dia));
	const totalLista = $derived(lista.reduce((s, m) => s + valor(m), 0));
	const queMide = $derived(filtro.tipo_flujo ? NOMBRES_FLUJO[filtro.tipo_flujo] : 'Gasto');
	const colorBarras = $derived(filtro.categoria ? colorCategoria(filtro.categoria) : 'var(--acento)');
	const hayFiltros = $derived(Object.values(filtro).some(Boolean));
</script>

<svelte:head><title>Diario · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Diario</h1>
			<p class="subtitulo">Tu gasto día a día</p>
		</div>
		<SelectorMes mes={data.mes} />
	</header>

	<Filtros bind:filtro productos={data.productos} />

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>{queMide} por día</h2>
				<p class="tenue">{hayFiltros ? 'Con los filtros aplicados' : 'Gastos e intereses; cada cuota en su mes'}</p>
			</div>
			<div class="totales">
				<p class="cifra num">{clp(total)}</p>
				<p class="tenue num">{clp(total / Math.max(1, diasTranscurridos))} al día</p>
			</div>
		</div>
		<GraficoBarras
			descripcion="{queMide} por día en {mesLargo(data.mes)}"
			etiquetas={porDia.map((_, i) => String(i + 1))}
			titulos={porDia.map((_, i) => diaLargo(conDia(data.mes, i + 1)))}
			series={[{ id: 'total', nombre: queMide, color: colorBarras, valores: porDia }]}
			seleccionado={dia == null ? null : dia - 1}
			resaltado={mesDe(data.hoy) === data.mes ? Number(data.hoy.slice(8)) - 1 : null}
			onseleccion={(i) => (dia = dia === i + 1 ? null : i + 1)}
			alto={210}
			anchoMaxBarra={22}
		/>
		<p class="tenue ayuda">Toca una barra para ver ese día; tócala de nuevo para ver el mes completo.</p>
	</section>

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>{dia == null ? `Todo ${mesLargo(data.mes).toLowerCase()}` : diaLargo(conDia(data.mes, dia))}</h2>
				<p class="tenue">{lista.length} {lista.length === 1 ? 'movimiento' : 'movimientos'}</p>
			</div>
			<div class="acciones">
				{#if dia != null}<button class="boton fantasma" type="button" onclick={() => (dia = null)}>Ver mes</button>{/if}
				<p class="cifra num chica">{clp(totalLista)}</p>
			</div>
		</div>
		{#if lista.length}
			<ul class="movs">
				{#each lista as m (m.movimiento_id)}
					<FilaMovimiento {m} conFecha={dia == null} />
				{/each}
			</ul>
		{:else}
			<Vacio titulo={hayFiltros ? 'Nada coincide con los filtros' : 'Sin movimientos este día'} compacto>
				{hayFiltros ? 'Prueba quitando algún filtro.' : 'Elige otro día en el gráfico.'}
			</Vacio>
		{/if}
	</section>
</div>

<style>
	.totales {
		text-align: right;
		flex: none;
	}

	.ayuda {
		margin-top: 10px;
		font-size: 0.75rem;
	}

	.acciones {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.chica {
		font-size: 1.15rem;
	}

	.movs {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>

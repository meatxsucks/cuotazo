<script lang="ts">
	import { goto } from '$app/navigation';
	import FilaMovimiento from '$lib/componentes/FilaMovimiento.svelte';
	import GraficoBarras, { type Serie } from '$lib/componentes/GraficoBarras.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Leyenda from '$lib/componentes/Leyenda.svelte';
	import SelectorMes from '$lib/componentes/SelectorMes.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { COLOR_OTRAS, colorCategoria, nombreCategoria } from '$lib/categorias';
	import { listaMeses, mesDe, parametroMes } from '$lib/fechas';
	import { clp, mesCorto, mesLargo, porcentaje } from '$lib/formato';

	let { data } = $props();

	const meses = $derived(listaMeses(data.mes, 6));
	const matriz = $derived.by(() => {
		const m = new Map<string, number[]>();
		for (const g of data.gasto) {
			const i = meses.indexOf(mesDe(g.fecha));
			if (i < 0) continue;
			if (!m.has(g.categoria)) m.set(g.categoria, Array(6).fill(0));
			m.get(g.categoria)![i] += g.monto_gasto;
		}
		return m;
	});
	const ordenadas = $derived([...matriz.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0)));

	const series = $derived.by((): Serie[] => {
		if (data.cat) {
			return [{ id: data.cat, nombre: nombreCategoria(data.cat), color: colorCategoria(data.cat), valores: matriz.get(data.cat) ?? Array(6).fill(0) }];
		}
		const principales = ordenadas.slice(0, 6);
		const resto = ordenadas.slice(6);
		const s: Serie[] = principales.map(([id, v]) => ({ id, nombre: nombreCategoria(id), color: colorCategoria(id), valores: v }));
		if (resto.length) {
			s.push({ id: 'otras', nombre: 'Otras', color: COLOR_OTRAS, valores: meses.map((_, i) => resto.reduce((t, [, v]) => t + v[i], 0)) });
		}
		return s;
	});

	const delMes = $derived(
		ordenadas
			.map(([id, v]) => ({ id, monto: v[5], previo: v[4], serie: v }))
			.filter((c) => c.monto > 0)
			.sort((a, b) => b.monto - a.monto)
	);
	const totalMes = $derived(delMes.reduce((s, c) => s + c.monto, 0));

	function enlace(params: Record<string, string | null>): string {
		const u = new URLSearchParams({ mes: parametroMes(data.mes) });
		if (data.cat) u.set('cat', data.cat);
		for (const [k, v] of Object.entries(params)) v == null ? u.delete(k) : u.set(k, v);
		return `/categorias?${u}`;
	}
</script>

<svelte:head><title>Categorías · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Categorías</h1>
			<p class="subtitulo">En qué se va tu plata, mes a mes</p>
		</div>
		<SelectorMes mes={data.mes} />
	</header>

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>{data.cat ? nombreCategoria(data.cat) : 'Gasto por categoría'}</h2>
				<p class="tenue">Últimos 6 meses · toca un mes para verlo</p>
			</div>
			{#if data.cat}
				<a class="boton fantasma" href={enlace({ cat: null })} data-sveltekit-noscroll><Icono nombre="cerrar" tam={16} /> Todas</a>
			{/if}
		</div>
		{#if ordenadas.length}
			<GraficoBarras
				descripcion="Gasto por categoría en los últimos 6 meses"
				etiquetas={meses.map(mesCorto)}
				titulos={meses.map(mesLargo)}
				{series}
				seleccionado={5}
				onseleccion={(i) => goto(enlace({ mes: parametroMes(meses[i]) }), { noScroll: true })}
				alto={230}
				anchoMaxBarra={56}
			/>
			{#if series.length > 1}<Leyenda items={series} />{/if}
		{:else}
			<Vacio titulo="Sin gastos en estos meses" compacto />
		{/if}
	</section>

	<div class="rejilla" class:rejilla-2={!!data.cat}>
		<section class="tarjeta">
			<div class="tarjeta-cabecera">
				<h2>{mesLargo(data.mes)}</h2>
				<p class="cifra num chica">{clp(totalMes)}</p>
			</div>
			{#if delMes.length}
				<ul class="cats">
					{#each delMes as c (c.id)}
						{@const variacion = c.previo > 0 ? ((c.monto - c.previo) / c.previo) * 100 : null}
						{@const maxSerie = Math.max(...c.serie)}
						<li>
							<a href={enlace({ cat: data.cat === c.id ? null : c.id })} class:activa={data.cat === c.id} data-sveltekit-noscroll>
								<span class="punto" style:background={colorCategoria(c.id)}></span>
								<span class="info">
									<span class="nombre">{nombreCategoria(c.id)}</span>
									<span class="tenue">
										{porcentaje((c.monto / totalMes) * 100)} del mes
										{#if variacion != null}
											· <span class:sube={variacion > 5} class:baja={variacion < -5}>{variacion > 0 ? '+' : ''}{porcentaje(variacion)}</span>
										{/if}
									</span>
								</span>
								<span class="chispa" aria-hidden="true">
									{#each c.serie as v, i (i)}
										<span style:height="{maxSerie ? Math.max(8, (v / maxSerie) * 100) : 8}%" style:background={i === 5 ? colorCategoria(c.id) : undefined}></span>
									{/each}
								</span>
								<span class="num valor">{clp(c.monto)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<Vacio titulo="Sin gastos este mes" compacto />
			{/if}
		</section>

		{#if data.cat}
			<section class="tarjeta">
				<div class="tarjeta-cabecera">
					<div>
						<h2>Movimientos</h2>
						<p class="tenue">{nombreCategoria(data.cat)} · {mesLargo(data.mes)}</p>
					</div>
					<a href="/movimientos?mes={parametroMes(data.mes)}&categoria={data.cat}">Ver en tabla</a>
				</div>
				{#if data.movimientos.length}
					<ul class="movs">
						{#each data.movimientos as m (m.movimiento_id)}
							<FilaMovimiento {m} conFecha />
						{/each}
					</ul>
				{:else}
					<Vacio titulo="Sin movimientos" compacto>No hay movimientos de esta categoría en el mes.</Vacio>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.chica {
		font-size: 1.15rem;
	}

	.cats,
	.movs {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cats a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 10px;
		margin: 0 -10px;
		border-radius: 12px;
		color: inherit;
	}

	.cats a:hover {
		background: var(--superficie-2);
	}

	.cats a.activa {
		background: var(--acento-suave);
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.nombre {
		font-weight: 600;
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.info .tenue {
		font-size: 0.76rem;
	}

	.sube {
		color: var(--negativo);
		font-weight: 600;
	}

	.baja {
		color: var(--positivo);
		font-weight: 600;
	}

	.chispa {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 24px;
		width: 44px;
		flex: none;
	}

	.chispa span {
		flex: 1;
		border-radius: 2px 2px 0 0;
		background: var(--superficie-3);
	}

	.valor {
		font-weight: 650;
		font-size: 0.92rem;
		min-width: 86px;
		text-align: right;
	}
</style>

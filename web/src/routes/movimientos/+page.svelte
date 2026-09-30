<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FilaMovimiento from '$lib/componentes/FilaMovimiento.svelte';
	import Filtros, { type ValoresFiltro } from '$lib/componentes/Filtros.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import SelectorMes from '$lib/componentes/SelectorMes.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { colorCategoria, nombreCategoria } from '$lib/categorias';
	import { parametroMes } from '$lib/fechas';
	import { clp, fecha, NOMBRES_ESTADO, NOMBRES_FLUJO, nombreBanco } from '$lib/formato';

	let { data } = $props();

	let filtro = $state<ValoresFiltro>(untrack(() => ({ ...data.filtro })));
	$effect.pre(() => {
		const f = data.filtro;
		untrack(() => (filtro = { ...f }));
	});

	const paginas = $derived(Math.max(1, Math.ceil(data.total / data.porPagina)));
	const desde = $derived(data.total ? (data.pagina - 1) * data.porPagina + 1 : 0);
	const hasta = $derived(Math.min(data.total, data.pagina * data.porPagina));

	function aplicar() {
		const u = new URLSearchParams({ mes: parametroMes(data.mes) });
		const pares: [string, string | undefined][] = [
			['banco', filtro.banco],
			['producto', filtro.producto],
			['categoria', filtro.categoria],
			['tipo', filtro.tipo_flujo],
			['estado', filtro.estado],
			['q', filtro.texto.trim()]
		];
		for (const [k, v] of pares) if (v) u.set(k, v);
		goto(`/movimientos?${u}`, { keepFocus: true, noScroll: true, replaceState: true });
	}

	function enlacePagina(p: number): string {
		const u = new URLSearchParams(page.url.searchParams);
		u.set('p', String(p));
		return `/movimientos?${u}`;
	}

	const etiquetaEstado = (e: string) => NOMBRES_ESTADO[e] ?? e;
</script>

<svelte:head><title>Movimientos · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Movimientos</h1>
			<p class="subtitulo">{data.total} {data.total === 1 ? 'movimiento' : 'movimientos'} en el mes</p>
		</div>
		<SelectorMes mes={data.mes} />
	</header>

	<Filtros bind:filtro productos={data.productos} conEstado oncambio={aplicar} />

	<section class="tarjeta tabla-tarjeta">
		{#if data.filas.length}
			<div class="tabla-envoltura">
				<table>
					<thead>
						<tr>
							<th scope="col">Fecha</th>
							<th scope="col">Descripción</th>
							<th scope="col">Categoría</th>
							<th scope="col">Producto</th>
							<th scope="col">Cuota</th>
							<th scope="col">Estado</th>
							<th scope="col" class="der">Monto</th>
						</tr>
					</thead>
					<tbody>
						{#each data.filas as m (m.movimiento_id)}
							<tr>
								<td class="num fecha">
									{fecha(m.fecha_imputacion)}
									{#if m.fecha !== m.fecha_imputacion}<small>Compra {fecha(m.fecha)}</small>{/if}
								</td>
								<td class="desc">
									<span class="principal">{m.comercio ?? m.glosa}</span>
									{#if m.comercio}<small>{m.glosa}</small>{/if}
								</td>
								<td>
									<span class="cat"><span class="punto" style:background={colorCategoria(m.categoria)}></span>{nombreCategoria(m.categoria)}</span>
									<small>{NOMBRES_FLUJO[m.tipo_flujo]}</small>
								</td>
								<td>
									{m.producto_nombre}
									<small>{nombreBanco(m.banco)}</small>
								</td>
								<td class="num">
									{#if m.cuotas_total}<span class="insignia acento">{m.cuota_actual}/{m.cuotas_total}</span>{:else}<span class="tenue">—</span>{/if}
								</td>
								<td>
									<span
										class="insignia"
										class:aviso={m.estado === 'no_facturado' || m.estado === 'pendiente'}
										class:acento={m.estado === 'facturado'}>{etiquetaEstado(m.estado)}</span
									>
								</td>
								<td class="num der monto" class:positivo={m.monto > 0 && m.tipo_flujo === 'ingreso'}>
									{clp(m.monto, true)}
									{#if m.monto_total_compra}<small>de {clp(m.monto_total_compra)}</small>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<ul class="lista-movil">
				{#each data.filas as m (m.movimiento_id)}
					<FilaMovimiento {m} conFecha />
				{/each}
			</ul>
			<nav class="paginacion" aria-label="Paginación">
				<span class="tenue num">{desde}–{hasta} de {data.total}</span>
				<div class="botones">
					{#if data.pagina > 1}
						<a class="boton" href={enlacePagina(data.pagina - 1)} aria-label="Página anterior"><Icono nombre="izquierda" tam={16} /> Anterior</a>
					{/if}
					<span class="tenue num">Página {data.pagina} de {paginas}</span>
					{#if data.pagina < paginas}
						<a class="boton" href={enlacePagina(data.pagina + 1)} aria-label="Página siguiente">Siguiente <Icono nombre="derecha" tam={16} /></a>
					{/if}
				</div>
			</nav>
		{:else}
			<Vacio titulo="No hay movimientos" icono="buscar">Prueba con otro mes o quita algún filtro.</Vacio>
		{/if}
	</section>
</div>

<style>
	.tabla-envoltura {
		display: none;
	}

	.lista-movil {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	@media (min-width: 960px) {
		.tabla-tarjeta {
			padding: 8px 0 0;
		}

		.tabla-envoltura {
			display: block;
			overflow-x: auto;
		}

		.lista-movil {
			display: none;
		}
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}

	th {
		text-align: left;
		font-size: 0.72rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--texto-3);
		padding: 10px 14px;
		border-bottom: 1px solid var(--borde);
		white-space: nowrap;
	}

	td {
		padding: 11px 14px;
		border-bottom: 1px solid var(--borde);
		vertical-align: top;
	}

	tbody tr:hover {
		background: var(--superficie-2);
	}

	td small {
		display: block;
		color: var(--texto-3);
		font-size: 0.74rem;
		margin-top: 1px;
	}

	.fecha {
		white-space: nowrap;
	}

	.desc {
		max-width: 300px;
	}

	.desc .principal {
		font-weight: 600;
	}

	.desc small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cat {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.der {
		text-align: right;
	}

	.monto {
		font-weight: 650;
		white-space: nowrap;
	}

	.paginacion {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 14px 0 0;
	}

	@media (min-width: 960px) {
		.paginacion {
			padding: 14px 18px 16px;
		}
	}

	.botones {
		display: flex;
		align-items: center;
		gap: 10px;
	}
</style>

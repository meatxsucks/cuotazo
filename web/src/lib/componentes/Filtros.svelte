<script lang="ts" module>
	export interface ValoresFiltro {
		banco: string;
		producto: string;
		categoria: string;
		tipo_flujo: string;
		texto: string;
		estado?: string;
	}
</script>

<script lang="ts">
	import { CATEGORIAS } from '$lib/categorias';
	import type { Producto } from '$lib/datos/tipos';
	import { NOMBRES_ESTADO, NOMBRES_FLUJO, nombreBanco } from '$lib/formato';
	import Icono from './Icono.svelte';

	let {
		filtro = $bindable(),
		productos,
		conEstado = false,
		oncambio
	}: { filtro: ValoresFiltro; productos: Producto[]; conEstado?: boolean; oncambio?: () => void } = $props();

	let abierto = $state(false);

	const bancos = $derived([...new Set(productos.map((p) => p.banco))].sort());
	const productosVisibles = $derived(
		productos.filter((p) => !filtro.banco || p.banco === filtro.banco).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre))
	);
	const activos = $derived(
		[filtro.banco, filtro.producto, filtro.categoria, filtro.tipo_flujo, conEstado ? filtro.estado : ''].filter(Boolean).length
	);

	function limpiar() {
		filtro.banco = '';
		filtro.producto = '';
		filtro.categoria = '';
		filtro.tipo_flujo = '';
		filtro.texto = '';
		if (conEstado) filtro.estado = '';
		oncambio?.();
	}

	function cambioBanco() {
		if (filtro.producto && !filtro.producto.startsWith(filtro.banco + '|')) filtro.producto = '';
		oncambio?.();
	}

	let espera: ReturnType<typeof setTimeout>;
	function cambioTexto() {
		clearTimeout(espera);
		espera = setTimeout(() => oncambio?.(), 300);
	}
</script>

<div class="filtros">
	<div class="linea">
		<label class="buscar">
			<span class="sr-only">Buscar por glosa o comercio</span>
			<Icono nombre="buscar" tam={17} />
			<input
				class="control"
				type="search"
				placeholder="Buscar comercio o glosa"
				bind:value={filtro.texto}
				oninput={cambioTexto}
				autocomplete="off"
			/>
		</label>
		<button class="boton alternar" type="button" aria-expanded={abierto} onclick={() => (abierto = !abierto)}>
			<Icono nombre="filtro" tam={16} /> Filtros {#if activos}<span class="contador">{activos}</span>{/if}
		</button>
	</div>
	<div class="selects" class:abierto>
		<label class="campo">
			<span>Banco</span>
			<select class="control" bind:value={filtro.banco} onchange={cambioBanco}>
				<option value="">Todos</option>
				{#each bancos as b (b)}<option value={b}>{nombreBanco(b)}</option>{/each}
			</select>
		</label>
		<label class="campo">
			<span>Producto</span>
			<select class="control" bind:value={filtro.producto} onchange={() => oncambio?.()}>
				<option value="">Todos</option>
				{#each productosVisibles as p (p.banco + p.producto_nombre)}
					<option value="{p.banco}|{p.producto_nombre}">{p.producto_nombre} · {nombreBanco(p.banco)}</option>
				{/each}
			</select>
		</label>
		<label class="campo">
			<span>Categoría</span>
			<select class="control" bind:value={filtro.categoria} onchange={() => oncambio?.()}>
				<option value="">Todas</option>
				{#each CATEGORIAS as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
			</select>
		</label>
		<label class="campo">
			<span>Tipo de flujo</span>
			<select class="control" bind:value={filtro.tipo_flujo} onchange={() => oncambio?.()}>
				<option value="">Todos</option>
				{#each Object.entries(NOMBRES_FLUJO) as [id, nombre] (id)}<option value={id}>{nombre}</option>{/each}
			</select>
		</label>
		{#if conEstado}
			<label class="campo">
				<span>Estado</span>
				<select class="control" bind:value={filtro.estado} onchange={() => oncambio?.()}>
					<option value="">Todos</option>
					{#each Object.entries(NOMBRES_ESTADO) as [id, nombre] (id)}<option value={id}>{nombre}</option>{/each}
				</select>
			</label>
		{/if}
		{#if activos || filtro.texto}
			<button class="boton fantasma limpiar" type="button" onclick={limpiar}><Icono nombre="cerrar" tam={16} /> Limpiar</button>
		{/if}
	</div>
</div>

<style>
	.filtros {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.linea {
		display: flex;
		gap: 8px;
	}

	.buscar {
		position: relative;
		flex: 1;
		min-width: 0;
		color: var(--texto-3);
	}

	.buscar :global(svg) {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
	}

	.buscar input {
		padding-left: 36px;
		min-height: 44px;
	}

	.alternar {
		min-height: 44px;
	}

	.contador {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--acento);
		color: var(--acento-texto);
		font-size: 0.72rem;
	}

	.selects {
		display: none;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding: 14px;
		border-radius: var(--radio);
		background: var(--superficie);
		border: 1px solid var(--borde);
	}

	.selects.abierto {
		display: grid;
	}

	.limpiar {
		grid-column: 1 / -1;
	}

	@media (min-width: 960px) {
		.filtros {
			flex-direction: row;
			align-items: flex-end;
		}

		.linea {
			flex: 0 1 280px;
		}

		.alternar {
			display: none;
		}

		.selects,
		.selects.abierto {
			display: flex;
			flex: 1;
			align-items: flex-end;
			padding: 0;
			border: 0;
			background: none;
			min-width: 0;
		}

		.selects .campo {
			flex: 1;
			min-width: 0;
		}

		.limpiar {
			flex: none;
		}
	}
</style>

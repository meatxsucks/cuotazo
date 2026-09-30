<script lang="ts">
	import { page } from '$app/state';
	import { mesLargo } from '$lib/formato';
	import { mesActual, parametroMes, sumarMeses } from '$lib/fechas';
	import Icono from './Icono.svelte';

	let { mes, minimo, maximo = mesActual() }: { mes: string; minimo?: string; maximo?: string } = $props();

	function enlace(m: string): string {
		const u = new URL(page.url);
		u.searchParams.set('mes', parametroMes(m));
		u.searchParams.delete('p');
		u.searchParams.delete('dia');
		return u.pathname + u.search;
	}

	const anterior = $derived(sumarMeses(mes, -1));
	const siguiente = $derived(sumarMeses(mes, 1));
	const hayAnterior = $derived(!minimo || anterior >= minimo);
	const haySiguiente = $derived(siguiente <= maximo);
</script>

<div class="selector" role="group" aria-label="Mes">
	{#if hayAnterior}
		<a href={enlace(anterior)} aria-label="Mes anterior" data-sveltekit-noscroll><Icono nombre="izquierda" tam={18} /></a>
	{:else}
		<span class="off" aria-hidden="true"><Icono nombre="izquierda" tam={18} /></span>
	{/if}
	<span class="mes">{mesLargo(mes)}</span>
	{#if haySiguiente}
		<a href={enlace(siguiente)} aria-label="Mes siguiente" data-sveltekit-noscroll><Icono nombre="derecha" tam={18} /></a>
	{:else}
		<span class="off" aria-hidden="true"><Icono nombre="derecha" tam={18} /></span>
	{/if}
</div>

<style>
	.selector {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		border-radius: 12px;
		background: var(--superficie);
		border: 1px solid var(--borde);
	}

	a,
	.off {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		color: var(--texto-2);
	}

	a:hover {
		background: var(--superficie-2);
	}

	.off {
		opacity: 0.3;
	}

	.mes {
		min-width: 128px;
		text-align: center;
		font-weight: 650;
		font-size: 0.9rem;
	}
</style>

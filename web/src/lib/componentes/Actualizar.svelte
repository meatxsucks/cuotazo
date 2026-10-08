<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icono from './Icono.svelte';
	import type { Actualizacion } from '$lib/datos/tipos';

	let { texto }: { texto: string | null } = $props();

	const PASOS: [string, string][] = [
		['santander', 'Santander'],
		['falabella', 'Falabella'],
		['bci', 'BCI'],
		['carga', 'Carga'],
		['publicacion', 'Publicación']
	];
	const ACTIVOS = new Set(['pendiente', 'corriendo']);

	let actual = $state<Actualizacion | null>(null);
	let error = $state<string | null>(null);
	let pidiendo = $state(false);
	let temporizador: ReturnType<typeof setTimeout> | null = null;

	const enCurso = $derived(!!actual && ACTIVOS.has(actual.estado));
	const reciente = $derived(!!actual?.terminada && Date.now() - Date.parse(actual.terminada) < 3_600_000);
	const esperando = $derived(actual?.estado === 'pendiente' && Date.now() - Date.parse(actual.creada) > 180_000);
	const fallidos = $derived(
		actual ? PASOS.filter(([k]) => actual!.pasos[k] && !['ok', 'corriendo'].includes(actual!.pasos[k])).map(([k, n]) => `${n}: ${actual!.pasos[k]}`) : []
	);

	async function consultar() {
		const antes = actual?.estado;
		const r = await fetch('/actualizar').catch(() => null);
		if (!r?.ok) return;
		actual = (await r.json()).actualizacion;
		if (antes && ACTIVOS.has(antes) && actual && !ACTIVOS.has(actual.estado)) await invalidateAll();
		programar();
	}

	function programar() {
		if (temporizador) clearTimeout(temporizador);
		if (enCurso) temporizador = setTimeout(consultar, 4000);
	}

	async function pedir() {
		pidiendo = true;
		error = null;
		const r = await fetch('/actualizar', { method: 'POST' }).catch(() => null);
		pidiendo = false;
		if (!r?.ok) {
			error = r ? ((await r.json().catch(() => null))?.message ?? 'No pudimos pedir la actualización.') : 'Sin conexión.';
			return;
		}
		actual = (await r.json()).actualizacion;
		if (actual && !ACTIVOS.has(actual.estado)) await invalidateAll();
		programar();
	}

	onMount(() => {
		consultar();
		return () => {
			if (temporizador) clearTimeout(temporizador);
		};
	});
</script>

<div class="actualizar">
	{#if texto && !enCurso}<span>{texto}</span>{/if}
	{#if enCurso && actual}
		<span class="pasos" role="status">
			{#each PASOS as [clave, nombre] (clave)}
				{@const p = actual.pasos[clave]}
				<span class="paso" class:ok={p === 'ok'} class:mal={p && p !== 'ok' && p !== 'corriendo'} class:activo={p === 'corriendo'}>
					{#if p === 'ok'}<Icono nombre="ok" tam={12} />{/if}{nombre}
				</span>
			{/each}
		</span>
		{#if esperando}<span class="aviso">Esperando al equipo que actualiza (¿está encendido?)</span>{/if}
	{/if}
	<button class="boton fantasma chico" type="button" onclick={pedir} disabled={pidiendo || enCurso} aria-label="Actualizar datos de los bancos">
		<span class:gira={enCurso || pidiendo}><Icono nombre="deshacer" tam={14} /></span>
		{enCurso ? (actual?.estado === 'pendiente' ? 'En cola…' : 'Actualizando…') : 'Actualizar'}
	</button>
	{#if error}<span class="aviso">{error}</span>{/if}
	{#if !enCurso && reciente && actual && actual.estado !== 'ok'}
		<span class="aviso" title={fallidos.join(' · ')}>
			{actual.estado === 'error' ? actual.detalle ?? 'La actualización falló' : `Parcial: ${fallidos.map((f) => f.split(':')[0]).join(', ') || 'revisar'} sin actualizar`}
		</span>
	{/if}
</div>

<style>
	.actualizar {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
	}
	.boton.chico {
		min-height: 28px;
		padding: 0 10px;
		font-size: 0.78rem;
	}
	.pasos {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.paso {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--superficie-2);
		color: var(--texto-3);
		font-weight: 600;
	}
	.paso.ok {
		background: var(--positivo-suave);
		color: var(--positivo);
	}
	.paso.mal {
		background: var(--aviso-suave);
		color: var(--aviso);
	}
	.paso.activo {
		background: var(--acento-suave);
		color: var(--acento-tinta);
	}
	.aviso {
		color: var(--aviso);
	}
	.gira {
		display: inline-flex;
		animation: girar 1s linear infinite;
	}
	@keyframes girar {
		to {
			transform: rotate(-360deg);
		}
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { CATEGORIAS_GASTO } from '$lib/categorias';
	import type { Sobre } from '$lib/datos/tipos';
	import { SEMANAS_POR_MES, totalFilas } from '$lib/deudas/presupuesto';
	import { clp } from '$lib/formato';
	import Icono from './Icono.svelte';

	let { sobre = null, envio, oncancelar }: { sobre?: Sobre | null; envio: SubmitFunction; oncancelar: () => void } = $props();

	// svelte-ignore state_referenced_locally
	let monto = $state(sobre?.monto ?? 0);
	// svelte-ignore state_referenced_locally
	let periodo = $state<Sobre['periodo']>(sobre?.periodo ?? 'semana');
	let ayuda = $state(false);
	let filas = $state([{ monto: 0, veces: 1 }]);

	const totalMes = $derived(totalFilas(filas));
	const sugerido = $derived(periodo === 'semana' ? Math.round(totalMes / SEMANAS_POR_MES) : totalMes);
	const miles = (v: number) => (v ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
	const leer = (e: Event & { currentTarget: HTMLInputElement }) => {
		const d = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, '');
		e.currentTarget.value = miles(Number(d));
		return Number(d || 0);
	};
</script>

<form method="POST" action="?/sobre" use:enhance={envio} class="form-sobre">
	<input type="hidden" name="sobre_id" value={sobre?.sobre_id ?? ''} />
	{#if sobre}<input type="hidden" name="orden" value={sobre.orden} />{/if}
	<div class="rejilla-form">
		<label class="campo ancho">
			<span>Nombre</span>
			<input class="control" name="nombre" maxlength="40" required value={sobre?.nombre ?? ''} placeholder="Ej: Supermercado" />
		</label>
		<label class="campo">
			<span>Monto</span>
			<span class="prefijo">
				<span aria-hidden="true">$</span>
				<input class="control num" name="monto" inputmode="numeric" required value={miles(monto)} oninput={(e) => (monto = leer(e))} />
			</span>
		</label>
		<label class="campo">
			<span>Cada</span>
			<select class="control" name="periodo" bind:value={periodo}>
				<option value="semana">Semana</option>
				<option value="mes">Mes</option>
			</select>
		</label>
		<label class="campo">
			<span>Categoría de tus bancos</span>
			<select class="control" name="categoria">
				{#each CATEGORIAS_GASTO as c (c.id)}
					<option value={c.id} selected={(sobre?.categoria ?? 'supermercado') === c.id}>{c.nombre}</option>
				{/each}
			</select>
		</label>
		<label class="campo">
			<span>Tipo</span>
			<select class="control" name="esencial">
				<option value="si" selected={sobre?.esencial ?? true}>Esencial</option>
				<option value="no" selected={sobre ? !sobre.esencial : false}>Respiro</option>
			</select>
		</label>
		{#if sobre}
			<label class="campo">
				<span>Estado</span>
				<select class="control" name="activo">
					<option value="si" selected={sobre.activo}>Activo</option>
					<option value="no" selected={!sobre.activo}>En pausa</option>
				</select>
			</label>
		{/if}
	</div>

	<button class="enlace" type="button" aria-expanded={ayuda} onclick={() => (ayuda = !ayuda)}>
		<Icono nombre={ayuda ? 'subida' : 'bajada'} tam={15} /> Calcular el monto: cuánto gastas por vez × veces al mes
	</button>
	{#if ayuda}
		<div class="ayuda">
			{#each filas as f, i (i)}
				<div class="fila-ayuda">
					<span class="prefijo">
						<span aria-hidden="true">$</span>
						<input class="control num" inputmode="numeric" placeholder="Por vez" aria-label="Monto por vez, fila {i + 1}" value={miles(f.monto)} oninput={(e) => (filas[i].monto = leer(e))} />
					</span>
					<span class="por" aria-hidden="true">×</span>
					<input class="control num veces" inputmode="numeric" aria-label="Veces al mes, fila {i + 1}" value={f.veces} oninput={(e) => (filas[i].veces = Number(e.currentTarget.value.replace(/\D/g, '')) || 0)} />
					<span class="tenue">al mes</span>
					{#if filas.length > 1}
						<button class="boton fantasma icono" type="button" aria-label="Quitar fila {i + 1}" onclick={() => filas.splice(i, 1)}><Icono nombre="cerrar" tam={15} /></button>
					{/if}
				</div>
			{/each}
			<button class="boton fantasma" type="button" onclick={() => filas.push({ monto: 0, veces: 1 })}><Icono nombre="mas_simple" tam={15} /> Otra fila</button>
			<p class="tenue">Total {clp(totalMes)} al mes{periodo === 'semana' ? ` ≈ ${clp(sugerido)} a la semana` : ''}.</p>
			<button class="boton" type="button" disabled={!totalMes} onclick={() => (monto = sugerido)}>Usar {clp(sugerido)}</button>
		</div>
	{/if}

	<div class="acciones">
		<button class="boton primario" type="submit"><Icono nombre="ok" tam={16} /> {sobre ? 'Guardar sobre' : 'Crear sobre'}</button>
		<button class="boton fantasma" type="button" onclick={oncancelar}>Cancelar</button>
	</div>
</form>

<style>
	.form-sobre {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 0 4px;
	}

	.enlace {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		border: 0;
		background: none;
		padding: 0;
		color: var(--acento-tinta);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		text-align: left;
	}

	.ayuda {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		border-radius: 12px;
		background: var(--superficie-2);
	}

	.fila-ayuda {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
	}

	.fila-ayuda .prefijo {
		flex: 1;
		min-width: 0;
	}

	.veces {
		width: 64px;
		flex: none;
	}

	.por {
		font-weight: 700;
		color: var(--texto-3);
	}

	.icono {
		width: 34px;
		min-height: 34px;
		padding: 0;
	}

	.acciones {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>

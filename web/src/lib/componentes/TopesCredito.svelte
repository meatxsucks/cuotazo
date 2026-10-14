<script lang="ts">
	import { enhance } from '$app/forms';
	import BarraProgreso from './BarraProgreso.svelte';
	import CampoMonto from './CampoMonto.svelte';
	import type { TipoTopeCredito, TopeCredito } from '$lib/datos/tipos';
	import { diasEntre } from '$lib/fechas';
	import { clp, fecha } from '$lib/formato';

	interface Fila {
		tipo: TipoTopeCredito;
		usado: number;
		veces: number;
		previo: number;
		config: TopeCredito | null;
		tope: number | null;
		proximo: number | null;
		sugerido: number;
	}

	let {
		ciclo,
		filas,
		hoy,
		editable,
		error
	}: { ciclo: { inicio: string; fin: string }; filas: Fila[]; hoy: string; editable: boolean; error: string | null } = $props();

	const NOMBRES: Record<TipoTopeCredito, [string, string, string]> = {
		tarjetas: ['Tarjetas de crédito', 'compras nuevas', 'compras'],
		linea: ['Línea de crédito', 'lo que sacaste', 'giros']
	};
	const dias = $derived(Math.max(1, diasEntre(hoy, ciclo.fin) + 1));
	const corto = (iso: string) => fecha(iso).slice(0, 5);
</script>

<section class="tarjeta topes">
	<div class="tarjeta-cabecera">
		<h2>Topes de crédito</h2>
		<span class="tenue chica">{corto(ciclo.inicio)} al {corto(ciclo.fin)} · quedan {dias} {dias === 1 ? 'día' : 'días'}</span>
	</div>
	{#if error}<p class="aviso-caja error">{error}</p>{/if}
	<div class="filas">
		{#each filas as f (f.tipo)}
			{@const [titulo, que, unidad] = NOMBRES[f.tipo]}
			{@const queda = f.tope != null ? f.tope - f.usado : null}
			<div class="fila" class:pasado={queda != null && queda < 0}>
				<div class="arriba">
					<p class="titulo">{titulo} <span class="tenue">· {que}</span></p>
					<p class="num">
						<strong>{clp(f.usado)}</strong>
						{#if f.tope != null}<span class="tenue"> de {clp(f.tope)}</span>{/if}
					</p>
				</div>
				{#if f.tope != null}
					<BarraProgreso valor={f.usado} limite={Math.max(f.tope, 1)} />
					<p class="chica">
						{#if queda != null && queda < 0}
							<span class="negativo">Te pasaste {clp(-queda)}.</span> Lo que queda del ciclo, sin {f.tipo === 'tarjetas' ? 'tarjeta' : 'línea'}.
						{:else}
							Te quedan <strong class="num">{clp(queda ?? 0)}</strong> · {clp((queda ?? 0) / dias)} por día
						{/if}
					</p>
					<p class="tenue chica">
						{f.veces} {unidad} este ciclo · anterior {clp(f.previo)}{#if f.proximo != null && f.config}{` · próximo ciclo ${clp(f.proximo)}${f.proximo < f.tope ? ` (−${f.config.bajada_pct}%)` : ' (meta)'}`}{/if}
					</p>
				{:else}
					<p class="tenue chica">Sin tope · {f.veces} {unidad} este ciclo · anterior {clp(f.previo)}</p>
				{/if}
				{#if editable}
					<details class="ajuste" open={f.tope == null}>
						<summary>{f.tope == null ? 'Ponerle tope' : 'Cambiar tope'}</summary>
						<form method="POST" action="?/topeCredito" use:enhance={() => async ({ update }) => update({ reset: false })} class="form-tope">
							<input type="hidden" name="tipo" value={f.tipo} />
							<CampoMonto nombre="tope" etiqueta="Tope de este ciclo" valor={f.tope ?? f.sugerido} requerido />
							<CampoMonto nombre="meta" etiqueta="Meta" valor={f.config?.meta ?? (f.tipo === 'linea' ? 0 : Math.round((f.tope ?? f.sugerido) * 0.55 / 10_000) * 10_000)} />
							<label class="campo bajada">
								<span>Baja cada ciclo</span>
								<span class="prefijo sufijo">
									<span aria-hidden="true">%</span>
									<input class="control num" name="bajada" inputmode="decimal" value={f.config?.bajada_pct ?? 10} />
								</span>
							</label>
							<button class="boton primario" type="submit">Guardar</button>
						</form>
					</details>
				{/if}
			</div>
		{/each}
	</div>
	<p class="tenue chica nota">
		Tarjetas: compras nuevas del ciclo, las en cuotas por su total. Línea: lo que la cuenta sacó de la línea para cubrir pagos. Cada ciclo el tope
		baja solo hasta la meta.
	</p>
</section>

<style>
	.filas {
		display: grid;
		gap: 18px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 720px) {
		.filas {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.fila {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.arriba {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.titulo {
		font-weight: 650;
	}
	.chica {
		font-size: 0.8rem;
	}
	.ajuste summary {
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--acento-tinta);
	}
	.form-tope {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		align-items: end;
		margin-top: 8px;
	}
	.form-tope .boton {
		grid-column: 1 / -1;
	}
	.nota {
		margin-top: 12px;
	}
</style>

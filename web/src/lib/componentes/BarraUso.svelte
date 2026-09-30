<script lang="ts">
	import { monto, porcentaje } from '$lib/formato';

	let { usado, total, moneda = 'CLP' }: { usado: number; total: number; moneda?: 'CLP' | 'UF' } = $props();
	const razon = $derived(total > 0 ? Math.min(1, Math.max(0, usado / total)) : 0);
</script>

<div class="uso">
	<div class="pista" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(razon * 100)} aria-label="Cupo usado">
		<span class:alto={razon >= 0.8} style:width="{razon * 100}%"></span>
	</div>
	<p class="tenue num">{porcentaje(razon * 100)} del cupo de {monto(total, moneda)}</p>
</div>

<style>
	.uso {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pista {
		height: 10px;
		border-radius: 999px;
		background: var(--superficie-3);
		overflow: hidden;
	}

	span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--acento);
	}

	span.alto {
		background: var(--progreso-exceso);
	}
</style>

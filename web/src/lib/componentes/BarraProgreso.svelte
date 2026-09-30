<script lang="ts">
	let { valor, limite, alto = 8 }: { valor: number; limite: number; alto?: number } = $props();

	const razon = $derived(limite > 0 ? valor / limite : 0);
	const nivel = $derived(razon > 1 ? 'exceso' : razon >= 0.8 ? 'alerta' : 'ok');
</script>

<div
	class="pista"
	style:height="{alto}px"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(Math.min(razon, 1) * 100)}
	aria-label="Avance del presupuesto"
>
	<div class="relleno {nivel}" style:width="{Math.min(razon, 1) * 100}%"></div>
</div>

<style>
	.pista {
		width: 100%;
		background: var(--superficie-3);
		border-radius: 999px;
		overflow: hidden;
	}

	.relleno {
		height: 100%;
		border-radius: 999px;
		transition: width 0.4s ease;
	}

	.ok {
		background: var(--progreso-ok);
	}

	.alerta {
		background: var(--progreso-alerta);
	}

	.exceso {
		background: var(--progreso-exceso);
	}
</style>

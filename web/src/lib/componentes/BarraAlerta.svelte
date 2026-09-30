<script lang="ts">
	import type { EstadoAlerta } from '$lib/datos/tipos';

	let {
		porcentaje,
		proyectado = null,
		umbrales,
		estado,
		etiqueta,
		compacta = false
	}: {
		porcentaje: number | null;
		proyectado?: number | null;
		umbrales: number[];
		estado: EstadoAlerta;
		etiqueta: string;
		compacta?: boolean;
	} = $props();

	// Escala hasta el mayor de 100%, umbrales, consumo y proyección, con tope visual de 150%
	const escala = $derived(Math.min(150, Math.max(100, ...umbrales, porcentaje ?? 0, proyectado ?? 0)));
	const pos = (v: number) => `${(Math.min(v, escala) / escala) * 100}%`;
	const actual = $derived(porcentaje ?? 0);
	const marcas = $derived([...new Set([...umbrales, 100])].sort((a, b) => a - b));
</script>

<div class="barra" class:compacta>
	<div
		class="pista"
		role="meter"
		aria-valuemin={0}
		aria-valuemax={escala}
		aria-valuenow={Math.round(actual)}
		aria-label={etiqueta}
		aria-valuetext="{Math.round(actual)}% usado{proyectado != null ? `, ${Math.round(proyectado)}% proyectado al cierre` : ''}"
	>
		{#if proyectado != null && proyectado > actual}
			<div class="proyeccion {estado}" style:left={pos(actual)} style:width="calc({pos(proyectado)} - {pos(actual)})"></div>
		{/if}
		<div class="relleno {estado}" style:width={pos(actual)}></div>
		{#each marcas as u (u)}
			{#if u <= escala}
				<span class="marca" class:limite={u === 100} style:left={pos(u)}></span>
			{/if}
		{/each}
	</div>
	{#if !compacta}
		<div class="reglas" aria-hidden="true">
			{#each marcas as u (u)}
				{#if u <= escala}
					<span style:left={pos(u)} class:limite={u === 100} class:fin={u / escala > 0.92}>{u === 100 ? 'Límite' : `${u}%`}</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.barra {
		position: relative;
		padding-bottom: 18px;
	}

	.barra.compacta {
		padding-bottom: 0;
	}

	.pista {
		position: relative;
		height: 12px;
		border-radius: 999px;
		background: var(--superficie-3);
	}

	.compacta .pista {
		height: 8px;
	}

	.relleno,
	.proyeccion {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		border-radius: 999px;
		transition: width 0.4s ease;
	}

	.relleno.ok {
		background: var(--progreso-ok);
	}

	.relleno.aviso,
	.relleno.pronostico_excede {
		background: var(--progreso-alerta);
	}

	.relleno.excedido {
		background: var(--progreso-exceso);
	}

	.proyeccion {
		border-radius: 0 999px 999px 0;
		background: repeating-linear-gradient(-45deg, var(--proyeccion-raya) 0 4px, transparent 4px 8px);
		box-shadow: inset 0 0 0 1px var(--proyeccion-borde);
	}

	.proyeccion.ok {
		--proyeccion-raya: color-mix(in srgb, var(--progreso-ok) 45%, transparent);
		--proyeccion-borde: color-mix(in srgb, var(--progreso-ok) 60%, transparent);
	}

	.proyeccion.aviso,
	.proyeccion.pronostico_excede,
	.proyeccion.excedido {
		--proyeccion-raya: color-mix(in srgb, var(--progreso-exceso) 40%, transparent);
		--proyeccion-borde: color-mix(in srgb, var(--progreso-exceso) 55%, transparent);
	}

	.marca {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		margin-left: -1px;
		border-radius: 2px;
		background: var(--texto-3);
		opacity: 0.55;
	}

	.marca.limite {
		background: var(--texto);
		opacity: 0.8;
	}

	.reglas {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 14px;
		font-size: 0.66rem;
		font-weight: 600;
		color: var(--texto-3);
	}

	.reglas span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	.reglas span.fin {
		transform: translateX(-100%);
	}

	.reglas span.limite {
		color: var(--texto-2);
	}
</style>

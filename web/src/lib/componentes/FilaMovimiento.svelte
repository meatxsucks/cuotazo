<script lang="ts">
	import type { Movimiento } from '$lib/datos/tipos';
	import { colorCategoria, nombreCategoria } from '$lib/categorias';
	import { clp, fecha, NOMBRES_ESTADO, nombreBanco } from '$lib/formato';

	let { m, conFecha = false }: { m: Movimiento; conFecha?: boolean } = $props();

	const entrada = $derived(m.monto > 0);
	const neutro = $derived(m.tipo_flujo === 'transferencia_interna' || m.tipo_flujo === 'pago_deuda');
</script>

<li class="fila">
	<span class="marca" style:--c={colorCategoria(m.categoria)} aria-hidden="true">
		{(m.comercio ?? m.glosa).slice(0, 1).toUpperCase()}
	</span>
	<div class="cuerpo">
		<p class="titulo">{m.comercio ?? m.glosa}</p>
		<p class="meta">
			{#if conFecha}<span class="num">{fecha(m.fecha_imputacion)}</span> ·{/if}
			{nombreCategoria(m.categoria)} · {m.producto_nombre}
			<span class="banco">{nombreBanco(m.banco)}</span>
		</p>
		{#if m.cuotas_total || m.fecha !== m.fecha_imputacion || m.estado === 'no_facturado' || m.estado === 'pendiente'}
			<p class="insignias">
				{#if m.cuotas_total}<span class="insignia acento num">Cuota {m.cuota_actual}/{m.cuotas_total}</span>{/if}
				{#if m.fecha !== m.fecha_imputacion}<span class="insignia num">Compra {fecha(m.fecha)}</span>{/if}
				{#if m.estado === 'no_facturado' || m.estado === 'pendiente'}<span class="insignia aviso">{NOMBRES_ESTADO[m.estado]}</span>{/if}
			</p>
		{/if}
	</div>
	<div class="monto">
		<p class="num valor" class:positivo={entrada && !neutro} class:neutro>{clp(m.monto, true)}</p>
		{#if m.monto_total_compra}<p class="tenue num">de {clp(m.monto_total_compra)}</p>{/if}
	</div>
</li>

<style>
	.fila {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--borde);
	}

	.fila:last-child {
		border-bottom: 0;
	}

	.marca {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 11px;
		background: color-mix(in srgb, var(--c) 20%, var(--superficie));
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
		color: var(--texto);
		font-weight: 700;
		font-size: 0.85rem;
	}

	.cuerpo {
		flex: 1;
		min-width: 0;
	}

	.titulo {
		font-weight: 600;
		font-size: 0.93rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		font-size: 0.78rem;
		color: var(--texto-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.banco::before {
		content: '· ';
	}

	.insignias {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.monto {
		text-align: right;
		flex: none;
	}

	.valor {
		font-weight: 650;
		font-size: 0.93rem;
	}

	.neutro {
		color: var(--texto-2);
	}

	.tenue {
		font-size: 0.72rem;
	}
</style>

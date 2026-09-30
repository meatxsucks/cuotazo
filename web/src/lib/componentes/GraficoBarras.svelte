<script lang="ts" module>
	export interface Serie {
		id: string;
		nombre: string;
		color: string;
		valores: number[];
	}
</script>

<script lang="ts">
	import { clp, clpCorto } from '$lib/formato';

	let {
		etiquetas,
		titulos = etiquetas,
		series,
		alto = 200,
		seleccionado = null,
		resaltado = null,
		onseleccion,
		descripcion,
		anchoMaxBarra = 40
	}: {
		etiquetas: string[];
		titulos?: string[];
		series: Serie[];
		alto?: number;
		seleccionado?: number | null;
		resaltado?: number | null;
		onseleccion?: (i: number) => void;
		descripcion: string;
		anchoMaxBarra?: number;
	} = $props();

	let ancho = $state(0);
	let hover = $state<number | null>(null);

	const IZQ = 46;
	const ABAJO = 24;
	const ARRIBA = 10;
	const DER = 4;

	const n = $derived(etiquetas.length);
	const totales = $derived(etiquetas.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.valores[i] ?? 0), 0)));

	function paso(max: number): number {
		if (max <= 0) return 1;
		const bruto = max / 3;
		const mag = 10 ** Math.floor(Math.log10(bruto));
		const f = bruto / mag;
		return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
	}

	const pasoY = $derived(paso(Math.max(...totales, 0)));
	const maxY = $derived(Math.max(pasoY, Math.ceil(Math.max(...totales, 0) / pasoY) * pasoY));
	const ticks = $derived(Array.from({ length: Math.round(maxY / pasoY) + 1 }, (_, i) => i * pasoY));
	const anchoPlot = $derived(Math.max(0, ancho - IZQ - DER));
	const altoPlot = $derived(alto - ABAJO - ARRIBA);
	const banda = $derived(n ? anchoPlot / n : 0);
	const anchoBarra = $derived(Math.max(2, Math.min(banda * 0.66, anchoMaxBarra)));
	const cadaEtiqueta = $derived(Math.max(1, Math.ceil(28 / Math.max(banda, 1))));

	const y = (v: number) => ARRIBA + altoPlot - (v / maxY) * altoPlot;

	function rectRedondeado(x: number, yTop: number, w: number, h: number, r: number): string {
		if (h <= 0) return '';
		const rr = Math.min(r, h, w / 2);
		const yb = yTop + h;
		return `M${x},${yb}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yb}Z`;
	}

	const barras = $derived(
		etiquetas.map((_, i) => {
			const x = IZQ + i * banda + (banda - anchoBarra) / 2;
			let acumulado = 0;
			const visibles = series.filter((s) => (s.valores[i] ?? 0) > 0);
			const segmentos = visibles.map((s, k) => {
				const v = s.valores[i];
				const y0 = y(acumulado);
				acumulado += v;
				const y1 = y(acumulado);
				const esTope = k === visibles.length - 1;
				const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));
				const d = esTope ? rectRedondeado(x, y1, anchoBarra, h, 4) : `M${x},${y1}h${anchoBarra}v${h}h${-anchoBarra}Z`;
				return { id: s.id, color: s.color, d };
			});
			return { i, x, segmentos };
		})
	);

	const tooltipX = $derived(hover == null ? 0 : Math.min(Math.max(IZQ + hover * banda + banda / 2, 90), Math.max(90, ancho - 90)));
</script>

<div class="grafico" bind:clientWidth={ancho} style:height="{alto}px">
	{#if ancho > 0}
		<svg width={ancho} height={alto} role="img" aria-label={descripcion}>
			{#each ticks as t (t)}
				<line x1={IZQ} x2={ancho - DER} y1={y(t)} y2={y(t)} class="grilla" class:base={t === 0} />
				<text x={IZQ - 8} y={y(t)} dy="0.32em" text-anchor="end" class="eje">{clpCorto(t)}</text>
			{/each}
			{#each barras as b (b.i)}
				<g class="barra" class:atenuada={(seleccionado != null && seleccionado !== b.i) || (hover != null && hover !== b.i && seleccionado == null)}>
					{#each b.segmentos as s (s.id)}
						<path d={s.d} fill={s.color} />
					{/each}
				</g>
				{#if b.i === seleccionado || (b.i % cadaEtiqueta === 0 && (seleccionado == null || Math.abs(b.i - seleccionado) >= cadaEtiqueta))}
					<text
						x={IZQ + b.i * banda + banda / 2}
						y={alto - 6}
						text-anchor="middle"
						class="eje"
						class:fuerte={b.i === seleccionado || b.i === resaltado}>{etiquetas[b.i]}</text
					>
				{/if}
			{/each}
			{#if seleccionado != null && n}
				<rect
					x={IZQ + seleccionado * banda + 1}
					y={ARRIBA - 4}
					width={Math.max(0, banda - 2)}
					height={altoPlot + 4}
					rx="6"
					class="marco"
				/>
			{/if}
			{#each etiquetas as _, i (i)}
				{#if onseleccion}
					<rect
						x={IZQ + i * banda}
						y={0}
						width={banda}
						height={alto - ABAJO + 4}
						fill="transparent"
						class="clic"
						role="button"
						tabindex="0"
						aria-label="{titulos[i]}: {clp(totales[i])}"
						aria-pressed={seleccionado === i}
						onpointerenter={() => (hover = i)}
						onpointerleave={() => (hover = null)}
						onfocus={() => (hover = i)}
						onblur={() => (hover = null)}
						onclick={() => onseleccion(i)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onseleccion(i);
							}
						}}
					/>
				{:else}
					<rect
						x={IZQ + i * banda}
						y={0}
						width={banda}
						height={alto - ABAJO + 4}
						fill="transparent"
						role="presentation"
						onpointerenter={() => (hover = i)}
						onpointerleave={() => (hover = null)}
					/>
				{/if}
			{/each}
		</svg>
		{#if hover != null}
			<div class="tooltip" style:left="{tooltipX}px" role="tooltip">
				<p class="titulo">{titulos[hover]}</p>
				{#if series.length > 1}
					{#each series.filter((s) => (s.valores[hover!] ?? 0) > 0) as s (s.id)}
						<p class="fila"><span class="punto" style:background={s.color}></span><span class="nombre">{s.nombre}</span><span class="num">{clp(s.valores[hover!])}</span></p>
					{/each}
				{/if}
				<p class="fila total"><span class="nombre">Total</span><span class="num">{clp(totales[hover])}</span></p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.grafico {
		position: relative;
		width: 100%;
		min-width: 0;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
	}

	svg {
		display: block;
		overflow: visible;
	}

	.grilla {
		stroke: var(--grilla);
		stroke-width: 1;
	}

	.grilla.base {
		stroke: var(--borde-fuerte);
	}

	.eje {
		font-size: 11px;
		fill: var(--texto-3);
		font-variant-numeric: tabular-nums;
	}

	.eje.fuerte {
		fill: var(--texto);
		font-weight: 700;
	}

	.barra {
		transition: opacity 0.15s;
	}

	.barra.atenuada {
		opacity: 0.35;
	}

	.marco {
		fill: none;
		stroke: var(--acento);
		stroke-width: 1.5;
		stroke-dasharray: 3 3;
	}

	.clic {
		cursor: pointer;
		outline: none;
	}

	.tooltip {
		position: absolute;
		top: -8px;
		transform: translate(-50%, -100%);
		min-width: 160px;
		max-width: 240px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--superficie);
		border: 1px solid var(--borde-fuerte);
		box-shadow: var(--sombra-alta);
		font-size: 0.8rem;
		pointer-events: none;
		z-index: 5;
	}

	.titulo {
		font-weight: 650;
		margin-bottom: 4px;
	}

	.fila {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--texto-2);
	}

	.fila .nombre {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fila.total {
		color: var(--texto);
		font-weight: 650;
		border-top: 1px solid var(--borde);
		margin-top: 4px;
		padding-top: 4px;
	}
</style>

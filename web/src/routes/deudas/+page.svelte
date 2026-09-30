<script lang="ts">
	import BarraUso from '$lib/componentes/BarraUso.svelte';
	import GraficoBarras, { type Serie } from '$lib/componentes/GraficoBarras.svelte';
	import Leyenda from '$lib/componentes/Leyenda.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import type { DeudaProducto } from '$lib/datos/tipos';
	import { aPagarTarjeta } from '$lib/caja';
	import { diasEntre, hoyChile, listaMeses, sumarMeses } from '$lib/fechas';
	import { clp, fecha, fechaHora, mesCorto, mesLargo, monto, NOMBRES_DEUDA, nombreBanco, porcentaje, uf } from '$lib/formato';

	let { data } = $props();

	const ORDEN = ['tarjeta', 'linea', 'consumo', 'hipotecario'];
	const deudas = $derived([...data.deudas].sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre)));
	const tarjetas = $derived(deudas.filter((d) => d.tipo === 'tarjeta'));
	const lineas = $derived(deudas.filter((d) => d.tipo === 'linea'));
	const creditos = $derived(deudas.filter((d) => d.tipo === 'consumo' || d.tipo === 'hipotecario'));

	const deudaTotal = $derived(deudas.reduce((s, d) => s + (d.saldo_deuda_clp ?? 0), 0));
	const actualizado = $derived(deudas.reduce<string | null>((m, d) => (d.actualizado && (!m || d.actualizado > m) ? d.actualizado : m), null));

	const mesesFuturos = $derived(listaMeses(sumarMeses(data.actual, 12), 12));
	const productosCuota = $derived.by(() => {
		const vistos = new Map<string, { banco: string; tipo: string; nombre: string }>();
		for (const c of data.cuotas) vistos.set(`${c.banco}|${c.tipo}|${c.nombre}`, c);
		return [...vistos.entries()].sort((a, b) => ORDEN.indexOf(a[1].tipo) - ORDEN.indexOf(b[1].tipo) || a[0].localeCompare(b[0]));
	});
	const seriesCuotas = $derived(
		productosCuota.map(([k, p], i): Serie => ({
			id: k,
			nombre: p.nombre,
			color: `var(--serie-${(i % 8) + 1})`,
			valores: mesesFuturos.map((m) =>
				data.cuotas.filter((c) => c.mes === m && `${c.banco}|${c.tipo}|${c.nombre}` === k).reduce((s, c) => s + c.monto, 0)
			)
		}))
	);
	const comprometidoProximo = $derived(seriesCuotas.reduce((s, x) => s + x.valores[0], 0));
	const comprometido12 = $derived(seriesCuotas.reduce((s, x) => s + x.valores.reduce((t, v) => t + v, 0), 0));

	const mesesPasados = $derived(listaMeses(data.actual, 6));
	const intereses = $derived(mesesPasados.map((m) => data.resumen.find((r) => r.mes === m)?.intereses_comisiones ?? 0));
	const totalIntereses = $derived(intereses.reduce((s, x) => s + x, 0));

	function factorUf(d: DeudaProducto): number | null {
		return d.moneda === 'UF' && d.saldo_deuda && d.saldo_deuda_clp ? d.saldo_deuda_clp / d.saldo_deuda : null;
	}
</script>

<svelte:head><title>Deudas · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Deudas</h1>
			<p class="subtitulo">Tarjetas, líneas y créditos{actualizado ? ` · saldos al ${fechaHora(actualizado)}` : ''}</p>
		</div>
		<a class="boton" href="/deudas/anotadas">Deudas anotadas y límites</a>
	</header>

	{#if !deudas.length}
		<div class="tarjeta"><Vacio icono="deudas" titulo="Sin productos de crédito">No encontramos tarjetas, líneas ni créditos asociados.</Vacio></div>
	{:else}
		<section class="cifras">
			<div class="tarjeta destacado">
				<p class="etiqueta">Deuda total</p>
				<p class="cifra-grande">{clp(deudaTotal)}</p>
				<p class="tenue">UF convertidas al valor del día</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Comprometido en {mesLargo(sumarMeses(data.actual, 1)).split(' ')[0].toLowerCase()}</p>
				<p class="cifra">{clp(comprometidoProximo)}</p>
				<p class="tenue">{clp(comprometido12)} en 12 meses</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Intereses y comisiones</p>
				<p class="cifra negativo">{clp(totalIntereses)}</p>
				<p class="tenue">Últimos 6 meses</p>
			</div>
		</section>

		{#if tarjetas.length || lineas.length}
			<h2 class="seccion">Tarjetas y líneas</h2>
			<div class="rejilla rejilla-2">
				{#each [...tarjetas, ...lineas] as d (d.banco + d.nombre)}
					{@const fac = data.facturado[`${d.banco}|${d.nombre}`]}
					<article class="tarjeta producto">
						<header>
							<div>
								<p class="tipo">{NOMBRES_DEUDA[d.tipo]}</p>
								<h3>{d.nombre}</h3>
								<p class="tenue">{nombreBanco(d.banco)}</p>
							</div>
							{#if d.proximo_vencimiento}
								{@const dias = diasEntre(hoyChile(), d.proximo_vencimiento)}
								<span class="insignia" class:aviso={dias <= 5}>Pagar {dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`} · {fecha(d.proximo_vencimiento)}</span>
							{/if}
						</header>
						{#if d.cupo_total}
							<BarraUso usado={d.usado ?? 0} total={d.cupo_total} moneda={d.moneda} />
						{/if}
						<dl>
							<div><dt>Usado</dt><dd class="num">{monto(d.usado, d.moneda)}</dd></div>
							<div><dt>Disponible</dt><dd class="num">{monto(d.disponible, d.moneda)}</dd></div>
							{#if d.tipo === 'tarjeta'}
								<div>
									<dt>Facturado</dt>
									<dd class="num">
										{clp(d.monto_facturado ?? fac ?? null)}
										{#if d.fecha_facturacion}<small>al {fecha(d.fecha_facturacion)}</small>{/if}
									</dd>
								</div>
								<div><dt>Pago mínimo</dt><dd class="num">{monto(d.pago_minimo, d.moneda)}</dd></div>
								{#if d.monto_facturado !== undefined}
									<div>
										<dt>Pagado del estado</dt>
										<dd class="num">{clp(d.monto_pagado ?? 0)}<small>{aPagarTarjeta(d) ? `falta ${clp(aPagarTarjeta(d))}` : 'estado pagado'}</small></dd>
									</div>
									<div>
										<dt>Por facturar</dt>
										<dd class="num">
											{clp(d.monto_por_facturar)}
											{#if d.fecha_proxima_facturacion}<small>factura el {fecha(d.fecha_proxima_facturacion)}</small>{/if}
										</dd>
									</div>
								{/if}
							{/if}
							<div><dt>Tasa mensual</dt><dd class="num">{porcentaje(d.tasa_mensual, 2)}</dd></div>
							<div><dt>CAE</dt><dd class="num">{porcentaje(d.cae, 1)}</dd></div>
						</dl>
					</article>
				{/each}
			</div>
		{/if}

		{#if creditos.length}
			<h2 class="seccion">Créditos</h2>
			<div class="rejilla rejilla-2">
				{#each creditos as d (d.banco + d.nombre)}
					{@const f = factorUf(d)}
					{@const avance = d.cuotas_total ? (d.cuotas_pagadas ?? 0) / d.cuotas_total : 0}
					<article class="tarjeta producto">
						<header>
							<div>
								<p class="tipo">{NOMBRES_DEUDA[d.tipo]}</p>
								<h3>{d.nombre}</h3>
								<p class="tenue">{nombreBanco(d.banco)}{d.moneda === 'UF' ? ' · en UF' : ''}</p>
							</div>
							{#if d.proximo_vencimiento}<span class="insignia">Próxima cuota {fecha(d.proximo_vencimiento)}</span>{/if}
						</header>
						<div class="saldo">
							<p class="etiqueta">Saldo adeudado</p>
							{#if d.moneda === 'UF'}
								<p class="cifra num">{uf(d.saldo_deuda)}</p>
								<p class="tenue num">≈ {clp(d.saldo_deuda_clp)}</p>
							{:else}
								<p class="cifra num">{clp(d.saldo_deuda)}</p>
							{/if}
						</div>
						{#if d.cuotas_total}
							<div class="avance">
								<div class="pista" role="progressbar" aria-valuemin={0} aria-valuemax={d.cuotas_total} aria-valuenow={d.cuotas_pagadas ?? 0} aria-label="Cuotas pagadas">
									<span style:width="{avance * 100}%"></span>
								</div>
								<p class="tenue num"><strong class="secundario">{d.cuotas_pagadas}/{d.cuotas_total}</strong> cuotas pagadas · {porcentaje(avance * 100)}</p>
							</div>
						{/if}
						<dl>
							<div>
								<dt>{d.tipo === 'hipotecario' ? 'Dividendo' : 'Cuota'}</dt>
								<dd class="num">
									{monto(d.valor_cuota, d.moneda)}
									{#if f && d.valor_cuota}<small>≈ {clp(d.valor_cuota * f)}</small>{/if}
								</dd>
							</div>
							<div><dt>Término</dt><dd class="num">{fecha(d.fecha_termino)}</dd></div>
							<div><dt>Tasa mensual</dt><dd class="num">{porcentaje(d.tasa_mensual, 2)}</dd></div>
							<div><dt>CAE</dt><dd class="num">{porcentaje(d.cae, 2)}</dd></div>
						</dl>
					</article>
				{/each}
			</div>
		{/if}
	{/if}

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>Deuda comprometida por mes</h2>
				<p class="tenue">Próximos 12 meses: facturación proyectada, cuotas y dividendos</p>
			</div>
		</div>
		{#if seriesCuotas.length}
			<GraficoBarras
				descripcion="Deuda comprometida por mes en los próximos 12 meses, apilada por producto"
				etiquetas={mesesFuturos.map(mesCorto)}
				titulos={mesesFuturos.map(mesLargo)}
				series={seriesCuotas}
				alto={240}
			/>
			<Leyenda items={seriesCuotas} />
		{:else}
			<Vacio titulo="Sin compromisos futuros" compacto />
		{/if}
	</section>

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>Intereses y comisiones pagados</h2>
				<p class="tenue">Por mes, últimos 6 meses</p>
			</div>
			<p class="cifra num chica">{clp(totalIntereses)}</p>
		</div>
		<GraficoBarras
			descripcion="Intereses y comisiones pagados por mes"
			etiquetas={mesesPasados.map(mesCorto)}
			titulos={mesesPasados.map(mesLargo)}
			series={[{ id: 'intereses', nombre: 'Intereses y comisiones', color: 'var(--cat-intereses_comisiones_impuestos)', valores: intereses }]}
			alto={180}
			anchoMaxBarra={48}
		/>
	</section>
</div>

<style>
	.cifras {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.destacado {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.mini {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
	}

	.mini .cifra {
		font-size: clamp(1.1rem, 4.6vw, 1.45rem);
	}

	@media (min-width: 900px) {
		.cifras {
			grid-template-columns: 1.4fr 1fr 1fr;
			gap: 16px;
		}

		.destacado {
			grid-column: auto;
		}
	}

	.seccion {
		margin-top: 8px;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--texto-3);
	}

	.producto {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.producto header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px 10px;
	}

	.producto header > div {
		flex: 1 1 180px;
		min-width: 0;
	}

	.tipo {
		font-size: 0.72rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--acento-tinta);
	}

	h3 {
		margin: 2px 0 0;
		font-size: 1.05rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 16px;
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid var(--borde);
	}

	dt {
		font-size: 0.74rem;
		color: var(--texto-3);
		font-weight: 550;
	}

	dd {
		margin: 2px 0 0;
		font-weight: 650;
		font-size: 0.95rem;
	}

	dd small {
		display: block;
		font-weight: 500;
		font-size: 0.75rem;
		color: var(--texto-3);
	}

	.avance {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pista {
		height: 8px;
		border-radius: 999px;
		background: var(--superficie-3);
		overflow: hidden;
	}

	.pista span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--acento);
	}

	.chica {
		font-size: 1.15rem;
	}
</style>

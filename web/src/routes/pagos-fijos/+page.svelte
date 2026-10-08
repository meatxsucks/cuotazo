<script lang="ts">
	import { enhance } from '$app/forms';
	import CampoMonto from '$lib/componentes/CampoMonto.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { CATEGORIAS_GASTO, colorCategoria, nombreCategoria } from '$lib/categorias';
	import type { PagoFijo } from '$lib/datos/tipos';
	import { pagoFijoVigente, pagosFijosDelMes } from '$lib/deudas/presupuesto';
	import { sumarMeses } from '$lib/fechas';
	import { clp, MESES_CORTOS, mesLargo } from '$lib/formato';

	let { data, form } = $props();
	const puedeEditar = $derived(data.rol !== 'miembro');

	let editando = $state<string | null>(null);
	let creando = $state(false);
	let enviando = $state(false);

	const pagos = $derived(data.pagos ?? []);
	const proximo = $derived(sumarMeses(data.actual, 1));
	const totalMes = $derived(pagosFijosDelMes(pagos, data.actual));
	const totalProximo = $derived(pagosFijosDelMes(pagos, proximo));
	const ahorroPausas = $derived(
		pagos.filter((p) => p.activo && p.meses_pausa.length).reduce((s, p) => s + p.monto * p.meses_pausa.length, 0)
	);

	function envio() {
		enviando = true;
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			enviando = false;
			if (result.type === 'success') {
				editando = null;
				creando = false;
			}
		};
	}

	function estado(p: PagoFijo): string {
		if (!p.activo) return 'Desactivado';
		if (p.desde.slice(0, 7) > data.actual.slice(0, 7)) return `Empieza en ${mesLargo(p.desde).toLowerCase()}`;
		if (!pagoFijoVigente(p, data.actual)) return 'En pausa este mes';
		return `Día ${p.dia_vencimiento}`;
	}
</script>

{#snippet formulario(p: PagoFijo | null)}
	<form method="POST" action="?/guardar" use:enhance={envio} class="formulario">
		<input type="hidden" name="pago_fijo_id" value={p?.pago_fijo_id ?? ''} />
		<div class="rejilla-form">
			<label class="campo ancho">
				<span>Nombre</span>
				<input class="control" name="nombre" maxlength="80" required value={p?.nombre ?? ''} placeholder="Ej: Colegio, arriendo, plan celular" />
			</label>
			<CampoMonto nombre="monto" etiqueta="Monto mensual" valor={p?.monto ?? null} requerido />
			<label class="campo">
				<span>Día de pago</span>
				<input class="control num" name="dia_vencimiento" inputmode="numeric" required value={p?.dia_vencimiento ?? ''} placeholder="5" />
			</label>
			<label class="campo">
				<span>Categoría</span>
				<select class="control" name="categoria">
					{#each CATEGORIAS_GASTO as c (c.id)}
						<option value={c.id} selected={(p?.categoria ?? 'vivienda_servicios') === c.id}>{c.nombre}</option>
					{/each}
				</select>
			</label>
			<label class="campo">
				<span>Desde</span>
				<input class="control" type="month" name="desde" value={(p?.desde ?? data.actual).slice(0, 7)} />
			</label>
		</div>
		<fieldset class="pausas">
			<legend>Meses sin pago <span class="tenue">(marca los meses en que se pausa, por ejemplo vacaciones)</span></legend>
			<div class="casillas-mes">
				{#each MESES_CORTOS as m, i (m)}
					<label>
						<input type="checkbox" name="pausa" value={i + 1} checked={p?.meses_pausa.includes(i + 1) ?? false} />
						{m}
					</label>
				{/each}
			</div>
		</fieldset>
		{#if p}
			<label class="interruptor">
				<input type="checkbox" checked={p.activo} onchange={(e) => ((e.currentTarget.nextElementSibling as HTMLInputElement).value = e.currentTarget.checked ? 'si' : 'no')} />
				<input type="hidden" name="activo" value={p.activo ? 'si' : 'no'} />
				<span>Activo</span>
			</label>
		{/if}
		<div class="acciones">
			<button class="boton primario" type="submit" disabled={enviando}><Icono nombre="ok" tam={16} /> {p ? 'Guardar cambios' : 'Agregar pago'}</button>
			<button class="boton fantasma" type="button" onclick={() => ((editando = null), (creando = false))}>Cancelar</button>
		</div>
	</form>
{/snippet}

<svelte:head><title>Pagos fijos · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Pagos fijos</h1>
			<p class="subtitulo">Lo que pagas todos los meses aunque no pase por tus tarjetas</p>
		</div>
		{#if data.pagos && !creando && puedeEditar}
			<button class="boton primario" type="button" onclick={() => ((creando = true), (editando = null))}><Icono nombre="mas_simple" tam={16} /> Nuevo pago</button>
		{/if}
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{:else if form?.ok}
		<p class="aviso-caja ok" role="status">
			<Icono nombre="ok" tam={18} />
			{form.ok === 'creado' ? 'Pago agregado.' : form.ok === 'editado' ? 'Cambios guardados.' : 'Pago borrado.'}
		</p>
	{/if}

	{#if !data.pagos}
		<section class="tarjeta">
			<Vacio icono="reloj" titulo="Pagos fijos aún no disponibles">Esta sección necesita una actualización de la base de datos. Mientras tanto el resto de la app funciona igual.</Vacio>
		</section>
	{:else}
		<section class="cifras">
			<div class="tarjeta mini">
				<p class="etiqueta">{mesLargo(data.actual)}</p>
				<p class="cifra">{clp(totalMes)}</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">{mesLargo(proximo)}</p>
				<p class="cifra">{clp(totalProximo)}</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Liberado por pausas en el año</p>
				<p class="cifra positivo">{clp(ahorroPausas)}</p>
			</div>
		</section>

		{#if creando}
			<section class="tarjeta">
				<h2 class="titulo-form">Nuevo pago fijo</h2>
				{@render formulario(null)}
			</section>
		{/if}

		<section class="tarjeta">
			{#if pagos.length}
				<ul class="pagos">
					{#each pagos as p (p.pago_fijo_id)}
						<li class:inactivo={!pagoFijoVigente(p, data.actual)}>
							<div class="fila">
								<span class="punto" style:background={colorCategoria(p.categoria)}></span>
								<span class="cuerpo">
									<span class="titulo">{p.nombre}</span>
									<span class="tenue">
										{nombreCategoria(p.categoria)} · {estado(p)}{p.meses_pausa.length ? ` · pausa en ${p.meses_pausa.map((m) => MESES_CORTOS[m - 1].toLowerCase()).join(', ')}` : ''}
									</span>
								</span>
								<span class="num valor">{clp(p.monto)}</span>
								{#if puedeEditar}
									<button class="boton fantasma icono" type="button" aria-label="Editar {p.nombre}" onclick={() => ((editando = editando === p.pago_fijo_id ? null : p.pago_fijo_id), (creando = false))}>
										<Icono nombre="editar" tam={17} />
									</button>
									<form method="POST" action="?/borrar" use:enhance={envio}>
										<input type="hidden" name="pago_fijo_id" value={p.pago_fijo_id} />
										<button class="boton fantasma icono" type="submit" aria-label="Borrar {p.nombre}" onclick={(e) => { if (!confirm(`¿Borrar ${p.nombre}?`)) e.preventDefault(); }}>
											<Icono nombre="borrar" tam={17} />
										</button>
									</form>
								{/if}
							</div>
							{#if editando === p.pago_fijo_id}
								{@render formulario(p)}
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<Vacio icono="reloj" titulo="Aún no tienes pagos fijos">Agrega el colegio, el arriendo o las clases de las niñas para verlos en Lo que viene.</Vacio>
			{/if}
		</section>
		<p class="tenue nota">Los pagos fijos aparecen en <a href="/mes">Mes</a> y en <a href="/">Lo que viene</a>, respetando las pausas y la fecha de inicio.</p>
	{/if}
</div>

<style>
	.cifras {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.mini {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 14px;
	}

	.mini .cifra {
		font-size: clamp(0.98rem, 4.2vw, 1.4rem);
	}

	.titulo-form {
		margin-bottom: 12px;
	}

	.pagos {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.pagos li {
		border-bottom: 1px solid var(--borde);
		padding: 8px 0;
	}

	.pagos li:last-child {
		border-bottom: 0;
	}

	.fila {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.inactivo .titulo,
	.inactivo .valor {
		color: var(--texto-3);
	}

	.cuerpo {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.titulo {
		font-weight: 600;
		font-size: 0.93rem;
	}

	.cuerpo .tenue {
		font-size: 0.78rem;
	}

	.valor {
		font-weight: 650;
	}

	.icono {
		min-height: 36px;
		width: 36px;
		padding: 0;
	}

	.formulario {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 12px 0 6px;
	}

	.pausas {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pausas legend {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--texto-2);
		margin-bottom: 8px;
	}

	.interruptor {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
	}

	.acciones {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.nota {
		font-size: 0.8rem;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import FormularioSobre from '$lib/componentes/FormularioSobre.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { colorCategoria } from '$lib/categorias';
	import type { MedioPago, Sobre } from '$lib/datos/tipos';
	import { nivelSobre } from '$lib/deudas/presupuesto';
	import { clp, fecha } from '$lib/formato';

	let { data, form } = $props();
	const puedeEditar = $derived(data.rol !== 'miembro');

	const MEDIOS: { id: MedioPago; nombre: string }[] = [
		{ id: 'debito', nombre: 'Débito' },
		{ id: 'credito', nombre: 'Crédito' },
		{ id: 'efectivo', nombre: 'Efectivo' },
		{ id: 'otro', nombre: 'Otro' }
	];
	const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'borrar'];

	const activos = $derived((data.sobres ?? []).filter((s) => s.activo).sort((a, b) => a.orden - b.orden));
	let elegido = $state<string | null>(null);
	let digitos = $state('');
	let nota = $state('');
	let medio = $state<MedioPago>('debito');
	let guardando = $state(false);
	let editando = $state<string | null>(null);
	let ultimo = $state<{ id: string; sobre: string; monto: number } | null>(null);

	const sobreId = $derived(elegido ?? activos[0]?.sobre_id ?? null);
	const sobre = $derived(activos.find((s) => s.sobre_id === sobreId) ?? null);
	const monto = $derived(Number(digitos || 0));
	const estadoDe = (id: string) => data.estados.find((e) => e.sobre_id === id) ?? null;
	const periodoTexto = (s: Sobre) => (s.periodo === 'semana' ? 'esta semana' : 'este mes');
	const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	const ultimoEstado = $derived(ultimo ? estadoDe(ultimo.sobre) : null);
	const ultimoSobre = $derived(ultimo ? (data.sobres ?? []).find((s) => s.sobre_id === ultimo!.sobre) : null);
	const sinAnotar = $derived(
		data.estados
			.filter((e) => e.sin_anotar >= 1000)
			.map((e) => ({ ...e, sobre: (data.sobres ?? []).find((s) => s.sobre_id === e.sobre_id) }))
			.filter((e) => e.sobre?.activo)
	);

	function tecla(t: string) {
		if (t === 'borrar') digitos = digitos.slice(0, -1);
		else if ((digitos + t).replace(/^0+/, '').length <= 8) digitos = (digitos + t).replace(/^0+/, '');
	}

	const anotar: SubmitFunction = () => {
		guardando = true;
		return async ({ result, update }) => {
			await update({ reset: false, invalidateAll: true });
			guardando = false;
			if (result.type === 'success' && result.data?.ok === 'anotado') {
				ultimo = { id: String(result.data.anotacion_id), sobre: String(result.data.sobre_id), monto: Number(result.data.monto) };
				digitos = '';
				nota = '';
			}
		};
	};

	const simple: SubmitFunction = () => {
		guardando = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			guardando = false;
			if (result.type === 'success') {
				editando = null;
				if (result.data?.ok === 'deshecho') ultimo = null;
			}
		};
	};
</script>

<svelte:head><title>Anotar compra · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Anotar compra</h1>
			<p class="subtitulo">Anota en el momento y gasta lo justo en cada sobre</p>
		</div>
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{/if}

	{#if !data.sobres}
		<section class="tarjeta">
			<Vacio icono="sobre" titulo="Los sobres aún no están disponibles">Esta sección necesita una actualización de la base de datos. El resto de la app funciona igual.</Vacio>
		</section>
	{:else if !activos.length}
		<section class="tarjeta">
			<Vacio icono="sobre" titulo="Arma tus sobres" compacto>Un sobre es un monto para la semana o el mes. Elige los sugeridos o crea el tuyo más abajo.</Vacio>
		</section>
	{:else}
		{#if ultimo && ultimoSobre && ultimoEstado}
			{@const nivel = nivelSobre(ultimoEstado.porcentaje)}
			<div class="resultado {nivel}" role="status" aria-live="polite">
				<div class="resultado-texto">
					<span class="tenue">Anotaste {clp(ultimo.monto)} en {ultimoSobre.nombre}</span>
					{#if ultimoEstado.disponible >= 0}
						<strong>Te quedan {clp(ultimoEstado.disponible)} en {ultimoSobre.nombre} {periodoTexto(ultimoSobre)}</strong>
					{:else}
						<strong>Te pasaste {clp(-ultimoEstado.disponible)} en {ultimoSobre.nombre} {periodoTexto(ultimoSobre)}</strong>
					{/if}
				</div>
				<form method="POST" action="?/deshacer" use:enhance={simple}>
					<input type="hidden" name="anotacion_id" value={ultimo.id} />
					<button class="boton" type="submit" disabled={guardando}><Icono nombre="deshacer" tam={16} /> Deshacer</button>
				</form>
			</div>
		{/if}

		<form method="POST" action="?/anotar" use:enhance={anotar} class="anotador tarjeta">
			<fieldset class="sobres">
				<legend class="sr-only">Sobre</legend>
				{#each activos as s (s.sobre_id)}
					{@const e = estadoDe(s.sobre_id)}
					{@const nivel = nivelSobre(e?.porcentaje ?? null)}
					<label class="sobre-boton" class:elegido={s.sobre_id === sobreId}>
						<input type="radio" name="sobre_id" value={s.sobre_id} checked={s.sobre_id === sobreId} onchange={() => (elegido = s.sobre_id)} />
						<span class="sobre-nombre"><span class="punto" style:background={colorCategoria(s.categoria)}></span>{s.nombre}</span>
						<span class="sobre-queda num {nivel}">{e ? (e.disponible >= 0 ? clp(e.disponible) : `−${clp(-e.disponible)}`) : clp(s.monto)}</span>
						<span class="pista-sobre"><span class={nivel} style:width="{Math.min(100, e?.porcentaje ?? 0)}%"></span></span>
					</label>
				{/each}
			</fieldset>

			<div class="pantalla" aria-live="polite">
				<span class="moneda">$</span><span class="num">{digitos ? miles(monto) : '0'}</span>
			</div>
			<input type="hidden" name="monto" value={monto || ''} />
			<div class="teclado" role="group" aria-label="Teclado numérico">
				{#each TECLAS as t (t)}
					<button type="button" class="tecla" class:borrar={t === 'borrar'} aria-label={t === 'borrar' ? 'Borrar un dígito' : t} onclick={() => tecla(t)}>
						{#if t === 'borrar'}<Icono nombre="izquierda" tam={22} />{:else}{t}{/if}
					</button>
				{/each}
			</div>

			<div class="medios" role="radiogroup" aria-label="Medio de pago">
				{#each MEDIOS as m (m.id)}
					<label class:elegido={medio === m.id}>
						<input type="radio" name="medio" value={m.id} bind:group={medio} />
						{m.nombre}
					</label>
				{/each}
			</div>
			<label class="campo">
				<span class="sr-only">Nota</span>
				<input class="control" name="nota" maxlength="140" placeholder="Nota (opcional)" bind:value={nota} />
			</label>
			<button class="boton primario guardar" type="submit" disabled={!monto || !sobre || guardando}>
				<Icono nombre="ok" tam={20} /> Anotar {monto ? clp(monto) : ''}{sobre ? ` en ${sobre.nombre}` : ''}
			</button>
		</form>

		{#each sinAnotar as e (e.sobre_id)}
			<p class="aviso-caja info"><Icono nombre="alerta" tam={18} /> Hay {clp(e.sin_anotar)} con tarjeta en {e.sobre?.nombre} que no anotaste {e.sobre ? periodoTexto(e.sobre) : ''}.</p>
		{/each}

		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Lo anotado en el período</h2></div>
			{#if data.anotaciones.length}
				<ul class="anotadas">
					{#each data.anotaciones as a (a.anotacion_id)}
						{@const s = (data.sobres ?? []).find((x) => x.sobre_id === a.sobre_id)}
						<li>
							<span class="punto" style:background={s ? colorCategoria(s.categoria) : 'var(--cat-otras)'}></span>
							<span class="cuerpo">
								<span class="titulo">{s?.nombre ?? 'Sobre borrado'}{a.nota ? ` · ${a.nota}` : ''}</span>
								<span class="tenue">{fecha(a.fecha)} · {MEDIOS.find((m) => m.id === a.medio)?.nombre}</span>
							</span>
							<span class="num valor">{clp(a.monto)}</span>
							<form method="POST" action="?/deshacer" use:enhance={simple}>
								<input type="hidden" name="anotacion_id" value={a.anotacion_id} />
								<button class="boton fantasma icono" type="submit" aria-label="Borrar compra de {clp(a.monto)}"><Icono nombre="borrar" tam={16} /></button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="tenue">Aún no anotas compras en este período.</p>
			{/if}
		</section>
	{/if}

	{#if data.sobres}
		<section class="tarjeta">
			<div class="tarjeta-cabecera">
				<h2>Tus sobres</h2>
				{#if editando !== 'nuevo' && puedeEditar}
					<button class="boton" type="button" onclick={() => (editando = 'nuevo')}><Icono nombre="mas_simple" tam={16} /> Nuevo sobre</button>
				{/if}
			</div>
			{#if editando === 'nuevo'}
				<FormularioSobre envio={simple} oncancelar={() => (editando = null)} />
			{/if}
			{#if data.sugeridos.length && puedeEditar}
				<form method="POST" action="?/sugeridos" use:enhance={simple} class="sugeridos">
					<p class="tenue">Sugeridos con tu promedio de gasto de los últimos 3 meses:</p>
					{#each data.sugeridos as s (s.categoria)}
						<label class="sugerido">
							<input type="checkbox" name="elegido" value={s.categoria} checked />
							<span class="cuerpo">
								<span class="titulo">{s.nombre}</span>
								<span class="tenue">{s.esencial ? 'Esencial' : 'Respiro'} · por {s.periodo}{s.promedio ? ` · promedio ${clp(s.promedio)} al mes` : ''}</span>
							</span>
							<span class="prefijo mini">
								<span aria-hidden="true">$</span>
								<input class="control num" name="monto_{s.categoria}" inputmode="numeric" value={miles(s.monto)} aria-label="Monto de {s.nombre}" />
							</span>
						</label>
					{/each}
					<button class="boton primario" type="submit" disabled={guardando}>Crear sobres elegidos</button>
				</form>
			{/if}
			<ul class="lista-sobres">
				{#each [...data.sobres].sort((a, b) => a.orden - b.orden) as s, i (s.sobre_id)}
					<li class:pausado={!s.activo}>
						<div class="fila-sobre">
							<span class="punto" style:background={colorCategoria(s.categoria)}></span>
							<span class="cuerpo">
								<span class="titulo">{s.nombre}</span>
								<span class="tenue">{clp(s.monto)} por {s.periodo} · {s.esencial ? 'esencial' : 'respiro'}{s.activo ? '' : ' · en pausa'}</span>
							</span>
							{#if puedeEditar}
								<form method="POST" action="?/mover" use:enhance={simple} class="mover">
									<input type="hidden" name="sobre_id" value={s.sobre_id} />
									<button class="boton fantasma icono" name="direccion" value="arriba" disabled={i === 0} aria-label="Subir {s.nombre}"><Icono nombre="subida" tam={16} /></button>
									<button class="boton fantasma icono" name="direccion" value="abajo" disabled={i === data.sobres.length - 1} aria-label="Bajar {s.nombre}"><Icono nombre="bajada" tam={16} /></button>
								</form>
								<button class="boton fantasma icono" type="button" aria-label="Editar {s.nombre}" onclick={() => (editando = editando === s.sobre_id ? null : s.sobre_id)}><Icono nombre="editar" tam={16} /></button>
							{/if}
						</div>
						{#if editando === s.sobre_id}
							<FormularioSobre sobre={s} envio={simple} oncancelar={() => (editando = null)} />
							<form method="POST" action="?/borrarSobre" use:enhance={simple}>
								<input type="hidden" name="sobre_id" value={s.sobre_id} />
								<button class="boton fantasma peligro" type="submit" onclick={(e) => { if (!confirm(`¿Borrar el sobre ${s.nombre} y lo anotado en él?`)) e.preventDefault(); }}>
									<Icono nombre="borrar" tam={16} /> Borrar sobre
								</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="tenue nota">Los sobres se siguen día a día en <a href="/mes">Mes</a>; para compras con detalle usa el <a href="/carro">Carro</a>.</p>
		</section>
	{/if}
</div>

<style>
	.resultado {
		position: sticky;
		top: 8px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: var(--radio);
		border: 1px solid;
		box-shadow: var(--sombra-alta);
	}

	.resultado.ok {
		background: var(--positivo-suave);
		border-color: color-mix(in srgb, var(--positivo) 35%, transparent);
	}

	.resultado.aviso {
		background: var(--aviso-suave);
		border-color: color-mix(in srgb, var(--aviso) 40%, transparent);
	}

	.resultado.excedido {
		background: var(--negativo-suave);
		border-color: color-mix(in srgb, var(--negativo) 40%, transparent);
	}

	.resultado-texto {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.resultado strong {
		font-size: 1.02rem;
		line-height: 1.3;
	}

	.resultado.ok strong {
		color: var(--positivo);
	}

	.resultado.aviso strong {
		color: var(--aviso);
	}

	.resultado.excedido strong {
		color: var(--negativo);
	}

	.anotador {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 560px;
		width: 100%;
	}

	.sobres {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.sobre-boton {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 76px;
		padding: 10px 12px;
		border-radius: 14px;
		border: 2px solid var(--borde);
		background: var(--superficie-2);
		cursor: pointer;
	}

	.sobre-boton input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.sobre-boton.elegido {
		border-color: var(--acento);
		background: var(--acento-suave);
	}

	.sobre-boton:has(input:focus-visible) {
		outline: 2px solid var(--acento);
		outline-offset: 2px;
	}

	.sobre-nombre {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 650;
		font-size: 0.9rem;
		line-height: 1.2;
	}

	.sobre-queda {
		font-size: 1.1rem;
		font-weight: 750;
	}

	.sobre-queda.aviso {
		color: var(--aviso);
	}

	.sobre-queda.excedido {
		color: var(--negativo);
	}

	.pista-sobre {
		height: 5px;
		border-radius: 999px;
		background: var(--superficie-3);
		overflow: hidden;
		margin-top: auto;
	}

	.pista-sobre span {
		display: block;
		height: 100%;
		background: var(--progreso-ok);
	}

	.pista-sobre span.aviso {
		background: var(--progreso-alerta);
	}

	.pista-sobre span.excedido {
		background: var(--progreso-exceso);
	}

	.pantalla {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 4px;
		padding: 6px 0;
		font-size: 2.6rem;
		font-weight: 750;
		letter-spacing: -0.03em;
	}

	.moneda {
		font-size: 1.6rem;
		color: var(--texto-3);
	}

	.teclado {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.tecla {
		display: grid;
		place-items: center;
		min-height: 54px;
		border-radius: 14px;
		border: 1px solid var(--borde);
		background: var(--superficie-2);
		font-size: 1.4rem;
		font-weight: 650;
		cursor: pointer;
		touch-action: manipulation;
	}

	.tecla:active {
		background: var(--superficie-3);
	}

	.tecla.borrar {
		color: var(--texto-2);
	}

	.medios {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}

	.medios label {
		display: grid;
		place-items: center;
		min-height: 40px;
		border-radius: 11px;
		border: 1px solid var(--borde-fuerte);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.medios input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.medios label.elegido {
		background: var(--acento);
		border-color: var(--acento);
		color: var(--acento-texto);
	}

	.medios label:has(input:focus-visible) {
		outline: 2px solid var(--acento);
		outline-offset: 2px;
	}

	.guardar {
		min-height: 56px;
		font-size: 1.05rem;
		white-space: normal;
		text-align: center;
	}

	.anotadas,
	.lista-sobres {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.anotadas li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--borde);
	}

	.anotadas li:last-child,
	.lista-sobres li:last-child {
		border-bottom: 0;
	}

	.cuerpo {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.titulo {
		font-weight: 600;
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cuerpo .tenue {
		font-size: 0.78rem;
	}

	.valor {
		font-weight: 650;
	}

	.icono {
		width: 36px;
		min-height: 36px;
		padding: 0;
	}

	.lista-sobres li {
		padding: 8px 0;
		border-bottom: 1px solid var(--borde);
	}

	.fila-sobre {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pausado .titulo {
		color: var(--texto-3);
	}

	.mover {
		display: flex;
	}

	.sugeridos {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		margin-bottom: 12px;
		border-radius: 12px;
		background: var(--superficie-2);
	}

	.sugerido {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.prefijo.mini {
		width: 130px;
		flex: none;
	}

	.peligro {
		color: var(--negativo);
	}

	.nota {
		margin-top: 10px;
		font-size: 0.8rem;
	}

	@media (min-width: 960px) {
		.sobres {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>

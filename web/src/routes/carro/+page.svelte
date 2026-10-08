<script lang="ts">
	import { enhance } from '$app/forms';
	import BarraProgreso from '$lib/componentes/BarraProgreso.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { clp, fechaHora } from '$lib/formato';
	import { totalCompra } from '$lib/mes';
	import { tick } from 'svelte';

	let { data, form } = $props();

	let nombre = $state('');
	let precio = $state('');
	let cantidad = $state('1');
	let campoNombre = $state<HTMLInputElement | null>(null);

	const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	const abierta = $derived(data.disponible ? data.abierta : null);
	const sobreDe = (id: string) => (data.disponible ? data.sobres.find((s) => s.sobre.sobre_id === id) : undefined);
	const sobreAbierta = $derived(abierta ? sobreDe(abierta.sobre_id) : undefined);
	const total = $derived(abierta ? totalCompra(abierta.items) : 0);
	const sugerido = $derived(data.disponible ? (data.sobres.find((s) => s.sobre.categoria === 'supermercado') ?? data.sobres[0]) : undefined);

	function elegirNombre() {
		const f = data.disponible ? data.frecuentes.find((x) => x.nombre.toLowerCase() === nombre.trim().toLowerCase()) : undefined;
		if (f && !precio) precio = miles(f.precio);
	}

	function agregar() {
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				nombre = '';
				precio = '';
				cantidad = '1';
				await tick();
				campoNombre?.focus();
			}
		};
	}
</script>

<svelte:head><title>Carro · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Carro</h1>
			<p class="subtitulo">Anota lo que llevas mientras compras y mira cuánto te queda en el sobre</p>
		</div>
		<a class="boton fantasma" href="/anotar">Gasto suelto</a>
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{:else if form?.ok === 'cerrada'}
		<p class="aviso-caja ok" role="status"><Icono nombre="ok" tam={18} /> Compra guardada en el sobre.</p>
	{/if}

	{#if !data.disponible}
		<section class="tarjeta">
			<Vacio icono="sobre" titulo="El carro aún no está disponible">Necesita sobres y una actualización de la base de datos.</Vacio>
		</section>
	{:else if abierta}
		<section class="tarjeta carro">
			<div class="tarjeta-cabecera">
				<h2>{abierta.lugar}</h2>
				<span class="tenue"
					>{sobreAbierta?.sobre.nombre ?? 'Sin sobre'}{#if abierta.creado_por && data.otros[abierta.creado_por]}{` · la abrió ${data.otros[abierta.creado_por]}`}{/if}</span
				>
			</div>

			<form method="POST" action="?/item" use:enhance={agregar} class="agregar">
				<input type="hidden" name="compra_id" value={abierta.compra_id} />
				<label class="campo que">
					<span>Producto</span>
					<input
						class="control"
						name="nombre"
						list="frecuentes"
						maxlength="60"
						required
						autocomplete="off"
						placeholder="Leche, pan, pollo…"
						bind:value={nombre}
						bind:this={campoNombre}
						onchange={elegirNombre}
					/>
				</label>
				<label class="campo cant">
					<span>Cant.</span>
					<input class="control num" name="cantidad" inputmode="decimal" bind:value={cantidad} />
				</label>
				<label class="campo precio">
					<span>Precio</span>
					<span class="prefijo">
						<span aria-hidden="true">$</span>
						<input
							class="control num"
							name="precio"
							inputmode="numeric"
							required
							autocomplete="off"
							placeholder="0"
							value={precio}
							oninput={(e) => {
								const d = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, '');
								precio = d ? miles(Number(d)) : '';
								e.currentTarget.value = precio;
							}}
						/>
					</span>
				</label>
				<button class="boton primario" type="submit" aria-label="Agregar"><Icono nombre="mas_simple" tam={18} /></button>
				<datalist id="frecuentes">
					{#each data.frecuentes as f (f.nombre)}<option value={f.nombre}>{clp(f.precio)}</option>{/each}
				</datalist>
			</form>

			<ul class="items">
				{#each abierta.items as i (i.item_id)}
					<li>
						<span class="cantidad num">{i.cantidad !== 1 ? `${String(i.cantidad).replace('.', ',')} ×` : ''}</span>
						<span class="nombre">{i.nombre}</span>
						<span class="num">{clp(i.cantidad * i.precio)}</span>
						<form method="POST" action="?/quitar" use:enhance>
							<input type="hidden" name="item_id" value={i.item_id} />
							<button class="boton fantasma chico" type="submit" aria-label="Quitar {i.nombre}"><Icono nombre="cerrar" tam={15} /></button>
						</form>
					</li>
				{:else}
					<li class="tenue">Agrega el primer producto.</li>
				{/each}
			</ul>

			<div class="total">
				<p class="etiqueta">Total</p>
				<p class="cifra-grande num">{clp(total)}</p>
				{#if sobreAbierta}
					<BarraProgreso valor={sobreAbierta.gastado + total} limite={sobreAbierta.presupuesto} />
					<p class="tenue">
						{#if sobreAbierta.queda - total >= 0}
							Después de esta compra te quedan <strong class="positivo">{clp(sobreAbierta.queda - total)}</strong> en {sobreAbierta.sobre.nombre}.
						{:else}
							Con esta compra te pasas <strong class="negativo">{clp(total - sobreAbierta.queda)}</strong> en {sobreAbierta.sobre.nombre}.
						{/if}
					</p>
				{/if}
			</div>

			<div class="cerrar">
				<form method="POST" action="?/cerrar" use:enhance class="fila-form">
					<input type="hidden" name="compra_id" value={abierta.compra_id} />
					<label class="campo">
						<span>Pagaste con</span>
						<select class="control" name="medio">
							<option value="debito">Débito</option>
							<option value="credito">Tarjeta de crédito</option>
							<option value="efectivo">Efectivo</option>
						</select>
					</label>
					<button class="boton primario" type="submit" disabled={!abierta.items.length}><Icono nombre="ok" tam={16} /> Terminar compra</button>
				</form>
				<form method="POST" action="?/descartar" use:enhance>
					<input type="hidden" name="compra_id" value={abierta.compra_id} />
					<button class="boton fantasma" type="submit" onclick={(e) => { if (!confirm('¿Descartar esta compra?')) e.preventDefault(); }}>Descartar</button>
				</form>
			</div>
		</section>
	{:else if !data.sobres.length}
		<section class="tarjeta">
			<Vacio icono="sobre" titulo="Primero crea un sobre">Las compras se descuentan de un sobre, por ejemplo Supermercado. <a href="/anotar">Crear sobres</a></Vacio>
		</section>
	{:else}
		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Nueva compra</h2></div>
			<form method="POST" action="?/nueva" use:enhance class="rejilla-form">
				<label class="campo">
					<span>Dónde</span>
					<input class="control" name="lugar" list="lugares" maxlength="60" placeholder="Supermercado" />
					<datalist id="lugares">
						{#each data.lugares as l (l)}<option value={l}></option>{/each}
					</datalist>
				</label>
				<label class="campo">
					<span>Sale del sobre</span>
					<select class="control" name="sobre_id">
						{#each data.sobres as s (s.sobre.sobre_id)}
							<option value={s.sobre.sobre_id} selected={s === sugerido}>{s.sobre.nombre} · quedan {clp(s.queda)}</option>
						{/each}
					</select>
				</label>
				<div class="ancho">
					<button class="boton primario" type="submit"><Icono nombre="mas_simple" tam={16} /> Empezar</button>
				</div>
			</form>
		</section>
	{/if}

	{#if data.disponible && data.recientes.length}
		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Compras recientes</h2></div>
			<ul class="recientes">
				{#each data.recientes as c (c.compra_id)}
					<li>
						<details>
							<summary>
								<span class="nombre">{c.lugar}</span>
								<span class="tenue"
									>{fechaHora(c.cerrada ?? c.creada).slice(0, 10)} · {c.items.length} productos{#if c.creado_por && data.otros[c.creado_por]}{` · por ${data.otros[c.creado_por]}`}{/if}</span
								>
								<strong class="num">{clp(totalCompra(c.items))}</strong>
							</summary>
							<ul class="items">
								{#each c.items as i (i.item_id)}
									<li>
										<span class="cantidad num">{i.cantidad !== 1 ? `${String(i.cantidad).replace('.', ',')} ×` : ''}</span>
										<span class="nombre">{i.nombre}</span>
										<span class="num">{clp(i.cantidad * i.precio)}</span>
									</li>
								{/each}
							</ul>
						</details>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.agregar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 64px 110px auto;
		gap: 8px;
		align-items: end;
	}
	@media (max-width: 520px) {
		.agregar {
			grid-template-columns: 56px minmax(0, 1fr) auto;
		}
		.agregar .que {
			grid-column: 1 / -1;
		}
	}
	.items,
	.recientes {
		padding: 0;
	}
	.items {
		list-style: none;
		display: flex;
		flex-direction: column;
		margin-top: 12px;
	}
	.items li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
	}
	.items li + li {
		border-top: 1px solid var(--borde);
	}
	.items .nombre {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.items .cantidad {
		color: var(--texto-3);
		font-size: 0.85rem;
	}
	.total {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid var(--borde-fuerte);
	}
	.cerrar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	.fila-form {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.boton.chico {
		min-height: 30px;
		padding: 0 8px;
	}
	.recientes {
		list-style: none;
	}
	.recientes > li + li {
		border-top: 1px solid var(--borde);
	}
	.recientes summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 12px;
		padding: 10px 0;
		cursor: pointer;
		list-style: none;
	}
	.recientes summary .nombre {
		font-weight: 600;
	}
	.recientes summary strong {
		grid-row: 1 / 3;
		grid-column: 2;
		align-self: center;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import BarraAlerta from '$lib/componentes/BarraAlerta.svelte';
	import CampoMonto from '$lib/componentes/CampoMonto.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import type { DeudaManual } from '$lib/datos/tipos';
	import { clp, fecha, porcentaje } from '$lib/formato';

	let { data, form } = $props();

	const TIPOS_MANUAL = [
		{ id: 'tarjeta', nombre: 'Tarjeta' },
		{ id: 'consumo', nombre: 'Crédito de consumo o avance' },
		{ id: 'automotriz', nombre: 'Crédito automotriz' },
		{ id: 'educacion', nombre: 'Crédito universitario' },
		{ id: 'otro', nombre: 'Otra' }
	];
	const nombreTipo = (id: string) => TIPOS_MANUAL.find((t) => t.id === id)?.nombre ?? id;

	let editando = $state<string | null>(null);
	let enviando = $state(false);

	const miles = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	const soloDigitos = (e: Event & { currentTarget: HTMLInputElement }) => {
		const d = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, '');
		e.currentTarget.value = d ? miles(Number(d)) : '';
	};

	function envio() {
		enviando = true;
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			enviando = false;
			if (result.type === 'success') editando = null;
		};
	}
</script>

{#snippet formularioDeuda(d: DeudaManual | null)}
	<form method="POST" action="?/deuda" use:enhance={envio} class="formulario">
		<input type="hidden" name="deuda_manual_id" value={d?.deuda_manual_id ?? ''} />
		<div class="rejilla-form">
			<label class="campo ancho">
				<span>Nombre</span>
				<input class="control" name="nombre" maxlength="80" required value={d?.nombre ?? ''} placeholder="Ej: Crédito automotriz, avance en efectivo" />
			</label>
			<label class="campo">
				<span>Tipo</span>
				<select class="control" name="tipo">
					{#each TIPOS_MANUAL as t (t.id)}
						<option value={t.id} selected={(d?.tipo ?? 'consumo') === t.id}>{t.nombre}</option>
					{/each}
				</select>
			</label>
			<label class="campo">
				<span>A quién le debes</span>
				<input class="control" name="acreedor" maxlength="80" value={d?.acreedor ?? ''} />
			</label>
			<CampoMonto nombre="saldo" etiqueta="Saldo que debes" valor={d?.saldo ?? null} requerido />
			<label class="campo">
				<span>Tasa mensual</span>
				<span class="prefijo sufijo">
					<span aria-hidden="true">%</span>
					<input class="control num" name="tasa_mensual" inputmode="decimal" value={d?.tasa_mensual != null ? String(d.tasa_mensual).replace('.', ',') : ''} placeholder="2,5" />
				</span>
			</label>
			<CampoMonto nombre="cuota_fija" etiqueta="Cuota fija (créditos)" valor={d?.cuota_fija ?? null} />
			<label class="campo">
				<span>Cuotas que faltan</span>
				<input class="control num" name="cuotas_restantes" inputmode="numeric" value={d?.cuotas_restantes ?? ''} />
			</label>
			<CampoMonto nombre="cuota_minima" etiqueta="Pago mínimo (tarjetas)" valor={d?.cuota_minima ?? null} />
			<label class="campo">
				<span>Día de pago</span>
				<input class="control num" name="dia_pago" inputmode="numeric" value={d?.dia_pago ?? ''} />
			</label>
			<label class="campo">
				<span>Primer pago (si empieza más adelante)</span>
				<input class="control" type="date" name="proximo_pago" value={d?.proximo_pago ?? ''} />
			</label>
		</div>
		<div class="acciones">
			<button class="boton primario" type="submit" disabled={enviando}><Icono nombre="ok" tam={16} /> {d ? 'Guardar' : 'Agregar deuda'}</button>
			<button class="boton fantasma" type="button" onclick={() => (editando = null)}>Cancelar</button>
		</div>
	</form>
	{#if d}
		<form method="POST" action="?/borrarDeuda" use:enhance={envio} class="borrar">
			<input type="hidden" name="deuda_manual_id" value={d.deuda_manual_id} />
			<button class="boton fantasma peligro" type="submit" onclick={(e) => { if (!confirm(`¿Borrar ${d.nombre}?`)) e.preventDefault(); }}>
				<Icono nombre="borrar" tam={16} /> Borrar deuda
			</button>
		</form>
	{/if}
{/snippet}

<svelte:head><title>Deudas anotadas · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Deudas anotadas</h1>
			<p class="subtitulo">Lo que debes fuera de tus bancos conectados, y un límite de uso por tarjeta</p>
		</div>
		<a class="boton fantasma" href="/deudas"><Icono nombre="izquierda" tam={16} /> Deudas</a>
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{:else if form?.ok}
		<p class="aviso-caja ok" role="status"><Icono nombre="ok" tam={18} /> {form.ok}</p>
	{/if}

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<h2>A mano</h2>
			{#if !data.sinTablas && editando !== 'nueva'}
				<button class="boton" type="button" onclick={() => (editando = 'nueva')}><Icono nombre="mas_simple" tam={16} /> Agregar deuda</button>
			{/if}
		</div>
		{#if data.sinTablas}
			<p class="aviso-caja info">Anotar deudas a mano necesita una actualización de la base de datos.</p>
		{/if}
		{#if editando === 'nueva'}
			<div class="nueva">{@render formularioDeuda(null)}</div>
		{/if}
		{#if data.manuales.length}
			<ul class="deudas">
				{#each data.manuales as m (m.deuda_manual_id)}
					<li>
						<div class="deuda">
							<span class="cuerpo">
								<span class="titulo">{m.nombre}</span>
								<span class="tenue">
									{nombreTipo(m.tipo)}{#if m.acreedor} · {m.acreedor}{/if}
									· {m.cuota_fija ? `cuota ${clp(m.cuota_fija)}` : m.cuota_minima ? `mínimo ${clp(m.cuota_minima)}` : 'sin cuota'}
									{#if m.dia_pago} · día {m.dia_pago}{:else if m.proximo_pago} · pago {fecha(m.proximo_pago)}{/if}
									{#if m.tasa_mensual != null} · {porcentaje(m.tasa_mensual, 2)} mensual{/if}
								</span>
							</span>
							<span class="num">{clp(m.saldo)}</span>
							<button class="boton fantasma icono" type="button" aria-label="Editar {m.nombre}" onclick={() => (editando = editando === m.deuda_manual_id ? null : m.deuda_manual_id)}>
								<Icono nombre="editar" tam={17} />
							</button>
						</div>
						{#if editando === m.deuda_manual_id}
							{@render formularioDeuda(m)}
						{/if}
					</li>
				{/each}
			</ul>
		{:else if !data.sinTablas}
			<Vacio icono="deudas" titulo="Sin deudas anotadas" compacto>Agrega créditos o tarjetas que no vienen de tus bancos conectados.</Vacio>
		{/if}
	</section>

	{#if data.uso.length}
		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Límite de uso por tarjeta</h2></div>
			<p class="tenue explica">Un tope mensual de compras nuevas por tarjeta. Las compras en cuotas cuentan por su total.</p>
			<ul class="topes">
				{#each data.uso as u (u.clave)}
					{@const limite = u.tope?.monto_limite ?? null}
					{@const pct = limite ? (100 * u.usado) / limite : null}
					<li>
						<div class="fila-top">
							<span class="titulo">{u.nombre}</span>
							<span class="num">{clp(u.usado)}{#if limite}<span class="tenue"> / {clp(limite)}</span>{/if}</span>
						</div>
						{#if limite}
							<BarraAlerta porcentaje={pct} umbrales={[80, 100]} estado={pct! >= 100 ? 'excedido' : pct! >= 80 ? 'aviso' : 'ok'} etiqueta="Uso de {u.nombre}" compacta />
							<p class="tenue chica">{pct! >= 100 ? `Te pasaste por ${clp(u.usado - limite)}` : `Te quedan ${clp(limite - u.usado)} este mes`}</p>
						{/if}
						<form method="POST" action="?/tope" use:enhance={envio} class="form-tope">
							<input type="hidden" name="tarjeta" value={u.clave} />
							<span class="prefijo">
								<span aria-hidden="true">$</span>
								<input class="control num" name="monto" inputmode="numeric" value={limite ? miles(limite) : ''} placeholder="Sin límite" aria-label="Límite mensual de {u.nombre}" oninput={soloDigitos} />
							</span>
							<button class="boton" type="submit" disabled={enviando}>Guardar</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.nueva {
		padding: 4px 0 12px;
		border-bottom: 1px solid var(--borde);
		margin-bottom: 8px;
	}
	.deudas,
	.topes {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.deudas li {
		padding: 12px 0;
		border-bottom: 1px solid var(--borde);
	}
	.deudas li:last-child {
		border-bottom: 0;
	}
	.deuda {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.icono {
		min-height: 36px;
		width: 36px;
		padding: 0;
	}
	.formulario {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 12px;
	}
	.acciones {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.borrar {
		margin-top: 8px;
	}
	.peligro {
		color: var(--negativo);
	}
	.explica {
		margin: -4px 0 14px;
	}
	.topes {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.topes li {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fila-top {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.9rem;
	}
	.chica {
		font-size: 0.78rem;
	}
	.form-tope {
		display: flex;
		gap: 8px;
		max-width: 360px;
	}
	.form-tope .prefijo {
		flex: 1;
	}
</style>

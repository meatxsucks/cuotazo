<script lang="ts">
	import { enhance } from '$app/forms';
	import BarraProgreso from '$lib/componentes/BarraProgreso.svelte';
	import CampoMonto from '$lib/componentes/CampoMonto.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import type { PagoCiclo } from '$lib/datos/tipos';
	import { diasEntre } from '$lib/fechas';
	import { clp, mesCorto, mesLargo } from '$lib/formato';

	let { data, form } = $props();
	const puedeEditar = $derived(data.rol !== 'miembro');

	const dia = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${mesCorto(iso)}` : 'sin fecha');
	const pct = (n: number) => (data.disponible && data.balance.ingreso > 0 ? `${Math.round((100 * n) / data.balance.ingreso)}%` : '');

	const ORDEN = { pendiente: 0, minimo: 1, pagado: 2 };
	const pagos = $derived(
		data.disponible ? [...data.pagos].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || (a.fecha ?? '9').localeCompare(b.fecha ?? '9')) : []
	);
	const diasCierre = $derived(data.disponible ? Math.max(1, diasEntre(data.hoy, data.ciclo.fin) + 1) : 1);

	function textoEstado(p: PagoCiclo): string {
		if (p.estado === 'pagado') return p.marcado ? 'Pagado' : 'Pagado · visto en el banco';
		if (p.estado === 'minimo') return p.por_pagar > 0 ? `Mínimo cubierto · quedan ${clp(p.por_pagar)}` : 'Mínimo pagado · el resto pasa al próximo estado';
		if (p.estimado) return 'Estimado';
		if (p.monto_minimo != null && p.monto_minimo < p.monto) return `Mínimo ${clp(p.monto_minimo)}`;
		return p.fecha && p.fecha < data.hoy ? 'Pendiente' : `Vence el ${dia(p.fecha)}`;
	}
</script>

<svelte:head><title>Mes · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Mes</h1>
			{#if data.disponible}
				<p class="subtitulo">Del {dia(data.ciclo.inicio)} al {dia(data.ciclo.fin)} · lo paga el sueldo de {mesLargo(data.ciclo.inicio).split(' ')[0].toLowerCase()}</p>
			{/if}
		</div>
		<nav class="pestanas" aria-label="Ciclo">
			<a href="/mes" class:activa={data.enCurso} aria-current={data.enCurso ? 'page' : undefined}>Este mes</a>
			<a href="/mes?ciclo=proximo" class:activa={!data.enCurso} aria-current={!data.enCurso ? 'page' : undefined}>Próximo</a>
		</nav>
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{/if}

	{#if !data.disponible}
		<section class="tarjeta">
			<Vacio icono="reloj" titulo="El mes aún no está disponible">Esta pantalla necesita una actualización de la base de datos. El resto de la app funciona igual.</Vacio>
		</section>
	{:else}
		{@const b = data.balance}
		<section class="tarjeta balance">
			<table>
				<tbody>
					<tr>
						<th scope="row">{data.ingresoReal ? 'Sueldo que entró' : 'Sueldo esperado'}</th>
						<td class="num positivo">{clp(b.ingreso)}</td>
						<td class="num tenue">100%</td>
					</tr>
					<tr>
						<th scope="row">Pagos del mes <span class="tenue">({data.pagos.length})</span></th>
						<td class="num">−{clp(b.pagos)}</td>
						<td class="num tenue">{pct(b.pagos)}</td>
					</tr>
					<tr>
						<th scope="row">Sobres <span class="tenue">(súper, bencina…)</span></th>
						<td class="num">−{clp(b.sobres)}</td>
						<td class="num tenue">{pct(b.sobres)}</td>
					</tr>
					<tr class="total">
						<th scope="row">{b.queda >= 0 ? 'Te queda' : 'Te falta'}</th>
						<td class="num" class:positivo={b.queda >= 0} class:negativo={b.queda < 0}>{clp(Math.abs(b.queda))}</td>
						<td class="num tenue">{pct(b.queda)}</td>
					</tr>
				</tbody>
			</table>
			{#if data.enCurso && b.cierre != null}
				<p class="cierre">
					Hoy tienes <strong class="num">{clp(data.saldoHoy)}</strong> en tus cuentas. Si pagas lo pendiente y gastas lo que queda en los sobres, al {dia(data.ciclo.fin)}
					{#if b.cierre >= 0}
						te quedan <strong class="num positivo">{clp(b.cierre)}</strong>.
					{:else}
						te faltan <strong class="num negativo">{clp(-b.cierre)}</strong>, que terminarían en tarjeta.
					{/if}
				</p>
			{:else if !data.enCurso && puedeEditar}
				<details class="ajuste">
					<summary>Cambiar sueldo esperado</summary>
					<form method="POST" action="?/ingreso" use:enhance class="fila-form">
						<CampoMonto nombre="ingreso" etiqueta="Sueldo líquido" valor={b.ingreso || null} requerido />
						<button class="boton" type="submit">Guardar</button>
					</form>
				</details>
			{/if}
		</section>

		{#if data.plan.length}
			<section class="tarjeta">
				<div class="tarjeta-cabecera"><h2>Qué hacer con los {clp(data.saldoHoy)}</h2></div>
				<ol class="plan">
					{#each data.plan as p, i (i)}
						<li class:falta={!p.alcanza}>
							<span class="marca" aria-hidden="true"><Icono nombre={p.alcanza ? 'ok' : 'alerta'} tam={15} /></span>
							<div>
								<p><strong>{p.texto}</strong> <span class="num">{clp(p.monto)}</span></p>
								{#if p.detalle}<p class="tenue">{p.detalle}</p>{/if}
								{#if !p.alcanza}<p class="tenue negativo">No alcanza con lo que tienes hoy.</p>{/if}
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<section class="tarjeta">
			<div class="tarjeta-cabecera">
				<h2>Pagos</h2>
				<span class="tenue num">{b.porPagar > 0 ? `faltan ${clp(b.porPagar)}` : 'todo pagado'}</span>
			</div>
			<BarraProgreso valor={b.pagado} limite={Math.max(b.pagos, 1)} />
			<ul class="pagos">
				{#each pagos as p (p.clave)}
					<li class={p.estado}>
						<div class="que">
							<p class="nombre">{p.nombre}</p>
							<p class="tenue">{textoEstado(p)}</p>
						</div>
						<p class="num monto">{clp(p.estado === 'pendiente' ? p.por_pagar : p.por_pagar || p.comprometido)}</p>
						{#if data.enCurso}
							<form method="POST" action="?/marcar" use:enhance>
								<input type="hidden" name="ciclo" value={p.ciclo} />
								<input type="hidden" name="clave" value={p.clave} />
								{#if p.marcado != null}
									<input type="hidden" name="valor" value="auto" />
									<button class="boton fantasma chico" type="submit" title="Volver a como estaba"><Icono nombre="deshacer" tam={15} /></button>
								{:else if p.estado === 'pendiente'}
									<input type="hidden" name="valor" value="pagado" />
									<button class="boton chico" type="submit" aria-label="Marcar {p.nombre} como pagado"><Icono nombre="ok" tam={15} /><span class="solo-ancho">Pagado</span></button>
								{:else}
									<span class="insignia acento"><Icono nombre="ok" tam={12} /></span>
								{/if}
							</form>
						{/if}
					</li>
				{:else}
					<li class="tenue">No hay pagos conocidos en este ciclo.</li>
				{/each}
			</ul>
			<p class="tenue nota">Tarjetas y créditos se marcan solos cuando el banco muestra el pago; las cuentas las marcas tú. <a href="/pagos-fijos">Editar pagos fijos</a></p>
		</section>

		<section class="tarjeta">
			<div class="tarjeta-cabecera">
				<h2>Sobres</h2>
				<a href="/carro">Anotar compra</a>
			</div>
			<ul class="sobres">
				{#each data.sobres as s (s.sobre.sobre_id)}
					<li>
						<div class="fila">
							<p class="nombre">{s.sobre.nombre}{#if s.sobre.periodo === 'semana'}<span class="tenue periodo">por semana</span>{/if}</p>
							<p class="num"><strong>{clp(s.gastado)}</strong> <span class="tenue">de {clp(s.presupuesto)}</span></p>
						</div>
						<BarraProgreso valor={s.gastado} limite={s.presupuesto} />
						<div class="fila">
							<p class="tenue">
								{#if !data.enCurso}
									Presupuesto del mes
								{:else if s.queda >= 0}
									Quedan {clp(s.queda)}{#if s.sobre.periodo === 'mes'}{` · ${clp(s.queda / diasCierre)} por día`}{/if}
								{:else}
									<span class="negativo">Te pasaste {clp(-s.queda)}</span>
								{/if}
							</p>
							{#if puedeEditar}
							<details class="ajuste">
								<summary>Cambiar</summary>
								<form method="POST" action="?/sobre" use:enhance class="fila-form">
									<input type="hidden" name="sobre_id" value={s.sobre.sobre_id} />
									<CampoMonto nombre="monto" etiqueta={s.sobre.periodo === 'semana' ? 'Por semana' : 'Por mes'} valor={s.sobre.monto} requerido />
									<button class="boton" type="submit">Guardar</button>
								</form>
							</details>
							{/if}
						</div>
					</li>
				{:else}
					<li class="tenue">Aún no tienes sobres. Créalos en <a href="/anotar">Anotar</a>.</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.pestanas {
		display: inline-flex;
		background: var(--superficie-2);
		border-radius: 12px;
		padding: 3px;
	}
	.pestanas a {
		padding: 6px 14px;
		border-radius: 9px;
		font-weight: 600;
		font-size: 0.88rem;
		color: var(--texto-2);
		text-decoration: none;
	}
	.pestanas a.activa {
		background: var(--superficie);
		color: var(--texto);
		box-shadow: var(--sombra);
	}
	.balance table {
		width: 100%;
		border-collapse: collapse;
	}
	.balance th {
		text-align: left;
		font-weight: 550;
		padding: 8px 0;
	}
	.balance td {
		text-align: right;
		padding: 8px 0 8px 12px;
		white-space: nowrap;
	}
	.balance tr + tr {
		border-top: 1px solid var(--borde);
	}
	.balance .total th,
	.balance .total td:nth-child(2) {
		font-weight: 750;
		font-size: 1.15rem;
	}
	.cierre {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--borde);
		color: var(--texto-2);
		font-size: 0.92rem;
	}
	.plan,
	.pagos,
	.sobres {
		padding: 0;
	}
	.plan {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.plan li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.plan .marca {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: var(--acento-suave);
		color: var(--acento-tinta);
		flex: none;
	}
	.plan li.falta .marca {
		background: var(--negativo-suave);
		color: var(--negativo);
	}
	.pagos,
	.sobres {
		list-style: none;
		display: flex;
		flex-direction: column;
		margin-top: 8px;
	}
	.pagos li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
	}
	.pagos li + li,
	.sobres li + li {
		border-top: 1px solid var(--borde);
	}
	.pagos .que {
		flex: 1;
		min-width: 0;
	}
	.pagos .nombre {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.sobres .nombre {
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.periodo {
		margin-left: 6px;
	}
	.solo-ancho {
		display: none;
	}
	@media (min-width: 560px) {
		.solo-ancho {
			display: inline;
		}
	}
	.pagos li.pagado .nombre,
	.pagos li.pagado .monto {
		color: var(--texto-3);
	}
	.pagos .monto {
		font-weight: 650;
		white-space: nowrap;
	}
	.boton.chico {
		min-height: 32px;
		padding: 0 10px;
		font-size: 0.82rem;
	}
	.sobres li {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 0;
	}
	.fila {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.ajuste summary {
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--acento-tinta);
	}
	.fila-form {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		margin-top: 8px;
	}
	.nota {
		margin-top: 10px;
	}
</style>

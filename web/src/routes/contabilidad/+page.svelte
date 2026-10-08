<script lang="ts">
	import { goto } from '$app/navigation';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { colorCategoria, nombreCategoria } from '$lib/categorias';
	import type { Conciliacion, PartidaBalance, ResultadoMes } from '$lib/datos/tipos';
	import { clp, fecha, mesLargo, NOMBRES_DEUDA, nombreBanco } from '$lib/formato';

	let { data } = $props();

	const VISTAS = [
		['balance', 'Balance'],
		['resultados', 'Resultados'],
		['libro', 'Libro'],
		['conciliacion', 'Conciliación']
	] as const;
	const TIPOS: Record<string, string> = { ...NOMBRES_DEUDA, cuenta: 'Cuenta', automotriz: 'Crédito automotriz', educacion: 'Crédito universitario', otro: 'Otra deuda' };
	const AMBITOS: Record<string, string> = {
		carga: 'Carga desde el banco',
		tarjeta: 'Estados de cuenta',
		saldo: 'Saldos de cuentas',
		caja: 'Caja por ciclo'
	};

	const suma = (xs: { monto: number }[]) => xs.reduce((t, x) => t + x.monto, 0);
	const mesCorto = (m: string) => mesLargo(m).split(' ')[0].slice(0, 3);

	function partidas(lado: 'activo' | 'pasivo'): PartidaBalance[] {
		return data.vista === 'balance' ? (data.partidas ?? []).filter((p) => p.lado === lado).sort((a, b) => b.monto - a.monto) : [];
	}

	// Estado de resultados: filas por categoría con una columna por mes
	function bloque(tipo: ResultadoMes['tipo_flujo']) {
		if (data.vista !== 'resultados') return [];
		const filas = (data.filas ?? []).filter((f) => f.tipo_flujo === tipo);
		const categorias = [...new Set(filas.map((f) => f.categoria))];
		return categorias
			.map((c) => ({ categoria: c, montos: data.meses.map((m) => suma(filas.filter((f) => f.categoria === c && f.mes === m))) }))
			.sort((a, b) => b.montos[b.montos.length - 1] - a.montos[a.montos.length - 1]);
	}
	function total(tipo: ResultadoMes['tipo_flujo']) {
		return data.vista === 'resultados' ? data.meses.map((m) => suma((data.filas ?? []).filter((f) => f.tipo_flujo === tipo && f.mes === m))) : [];
	}

	function grupos(lista: Conciliacion[]) {
		return Object.keys(AMBITOS)
			.map((a) => ({ ambito: a, filas: lista.filter((c) => c.ambito === a) }))
			.filter((g) => g.filas.length);
	}
</script>

{#snippet filaPartida(p: PartidaBalance)}
	<li>
		<span class="cuerpo">
			<span class="titulo">{p.nombre}</span>
			<span class="tenue">{TIPOS[p.tipo] ?? p.tipo} · {nombreBanco(p.entidad)}</span>
		</span>
		<span class="num" class:negativo={p.monto < 0}>{clp(p.monto)}</span>
	</li>
{/snippet}

{#snippet filaResultado(nombre: string, montos: number[], fuerte = false, signo = false)}
	<tr class:fuerte>
		<th scope="row">{nombre}</th>
		{#each montos as m, i (i)}
			<td class="num" class:negativo={signo && m < 0} class:positivo={signo && m > 0}>{signo ? clp(m, true) : clp(m)}</td>
		{/each}
	</tr>
{/snippet}

<svelte:head><title>Contabilidad · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Contabilidad</h1>
			<p class="subtitulo">Lo que tienes, lo que debes, cómo te fue en el mes y si todo cuadra</p>
		</div>
		<nav class="pestanas" aria-label="Vista">
			{#each VISTAS as [id, nombre] (id)}
				<a href="?vista={id}" class:activa={data.vista === id} aria-current={data.vista === id ? 'page' : undefined}>{nombre}</a>
			{/each}
		</nav>
	</header>

	{#if data.vista === 'balance'}
		{#if !data.partidas}
			<section class="tarjeta"><Vacio icono="banco" titulo="Balance aún no disponible">Falta una actualización de la base de datos.</Vacio></section>
		{:else}
			{@const activos = partidas('activo')}
			{@const pasivos = partidas('pasivo')}
			{@const patrimonio = suma(activos) - suma(pasivos)}
			<section class="tarjeta">
				<table class="balance">
					<tbody>
						<tr><th scope="row">Lo que tienes (cuentas)</th><td class="num positivo">{clp(suma(activos))}</td></tr>
						<tr><th scope="row">Lo que debes (tarjetas, créditos, deudas)</th><td class="num">−{clp(suma(pasivos))}</td></tr>
						<tr class="fuerte">
							<th scope="row">Patrimonio</th>
							<td class="num" class:negativo={patrimonio < 0} class:positivo={patrimonio >= 0}>{clp(patrimonio, true)}</td>
						</tr>
					</tbody>
				</table>
				<p class="tenue nota">Deudas por su saldo total (el hipotecario y el CAE pesan mucho); el valor de la casa o el auto no se cuenta como activo.</p>
			</section>
			<div class="rejilla rejilla-2">
				<section class="tarjeta">
					<div class="tarjeta-cabecera"><h2>Activos</h2><span class="num">{clp(suma(activos))}</span></div>
					<ul class="partidas">{#each activos as p (p.entidad + p.nombre)}{@render filaPartida(p)}{/each}</ul>
				</section>
				<section class="tarjeta">
					<div class="tarjeta-cabecera"><h2>Pasivos</h2><span class="num">{clp(suma(pasivos))}</span></div>
					<ul class="partidas">{#each pasivos as p (p.entidad + p.nombre)}{@render filaPartida(p)}{/each}</ul>
				</section>
			</div>
			<section class="tarjeta">
				<div class="tarjeta-cabecera"><h2>Evolución</h2></div>
				{#if data.fotos.length < 2}
					<p class="tenue">Se guarda una foto del balance en cada actualización. Con dos o más fotos verás aquí cómo cambia tu patrimonio.</p>
				{:else}
					{@const primera = data.fotos[0]}
					{@const ultima = data.fotos[data.fotos.length - 1]}
					{@const cambio = ultima.activos - ultima.pasivos - (primera.activos - primera.pasivos)}
					<p class="secundario">
						Desde el {fecha(primera.fecha)} tu patrimonio
						{cambio >= 0 ? 'mejoró' : 'empeoró'} <strong class="num" class:positivo={cambio >= 0} class:negativo={cambio < 0}>{clp(Math.abs(cambio))}</strong>.
					</p>
					<table class="tabla">
						<thead><tr><th>Fecha</th><th class="num">Activos</th><th class="num">Pasivos</th><th class="num">Patrimonio</th></tr></thead>
						<tbody>
							{#each [...data.fotos].reverse() as f (f.fecha)}
								<tr>
									<td>{fecha(f.fecha)}</td>
									<td class="num">{clp(f.activos)}</td>
									<td class="num">{clp(f.pasivos)}</td>
									<td class="num" class:negativo={f.activos - f.pasivos < 0}>{clp(f.activos - f.pasivos, true)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/if}
	{:else if data.vista === 'resultados'}
		{#if !data.filas}
			<section class="tarjeta"><Vacio icono="categorias" titulo="Resultados aún no disponibles">Falta una actualización de la base de datos.</Vacio></section>
		{:else}
			{@const ingresos = total('ingreso')}
			{@const gastos = total('gasto')}
			{@const intereses = total('interes_comision')}
			{@const resultado = ingresos.map((x, i) => x - gastos[i] - intereses[i])}
			<section class="tarjeta">
				<div class="desplaza">
					<table class="tabla resultados">
						<thead>
							<tr><th></th>{#each data.meses as m (m)}<th class="num">{mesCorto(m)}</th>{/each}</tr>
						</thead>
						<tbody>
							{@render filaResultado('Ingresos', ingresos, true)}
							{#each bloque('ingreso') as f (f.categoria)}{@render filaResultado(nombreCategoria(f.categoria), f.montos)}{/each}
							{@render filaResultado('Gastos', gastos, true)}
							{#each bloque('gasto') as f (f.categoria)}
								<tr>
									<th scope="row"><span class="punto" style:background={colorCategoria(f.categoria)}></span> {nombreCategoria(f.categoria)}</th>
									{#each f.montos as m, i (i)}<td class="num">{clp(m)}</td>{/each}
								</tr>
							{/each}
							{@render filaResultado('Intereses y comisiones', intereses, true)}
							{@render filaResultado('Resultado del mes', resultado, true, true)}
						</tbody>
					</table>
				</div>
				<p class="tenue nota">
					Por mes de imputación: una compra en cuotas pesa una cuota cada mes. Pagos de tarjeta y traspasos entre tus cuentas no son gasto.
					El mes en curso va a la fecha de hoy.
				</p>
			</section>
		{/if}
	{:else if data.vista === 'libro'}
		<section class="tarjeta">
			{#if data.productos.length}
				<label class="campo elegir">
					<span>Cuenta o tarjeta</span>
					<select class="control" onchange={(e) => goto(`?vista=libro&producto=${encodeURIComponent(e.currentTarget.value)}`)}>
						{#each data.productos as p (p.banco + p.producto_nombre)}
							<option value="{p.banco}|{p.producto_nombre}" selected={data.elegido?.banco === p.banco && data.elegido?.producto_nombre === p.producto_nombre}>
								{p.producto_nombre} · {nombreBanco(p.banco)}
							</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if !data.filas}
				<Vacio icono="movimientos" titulo="Libro aún no disponible" compacto>Falta una actualización de la base de datos.</Vacio>
			{:else if !data.filas.length}
				<Vacio icono="movimientos" titulo="Sin movimientos" compacto>No hay movimientos para este producto.</Vacio>
			{:else}
				{@const conSaldo = data.filas.some((f) => f.saldo != null)}
				<div class="desplaza">
					<table class="tabla libro">
						<thead>
							<tr><th>Fecha</th><th>Detalle</th><th class="num">Entra</th><th class="num">Sale</th>{#if conSaldo}<th class="num">Saldo</th>{/if}</tr>
						</thead>
						<tbody>
							{#each data.filas as f (f.movimiento_id)}
								<tr>
									<td class="nowrap">{fecha(f.fecha).slice(0, 5)}</td>
									<td class="detalle">
										<span>{f.comercio ?? f.glosa ?? '—'}</span>
										<span class="tenue">{nombreCategoria(f.categoria)}{f.estado !== 'contable' ? ` · ${f.estado.replace('_', ' ')}` : ''}</span>
									</td>
									<td class="num positivo">{f.abono ? clp(f.abono) : ''}</td>
									<td class="num">{f.cargo ? clp(f.cargo) : ''}</td>
									{#if conSaldo}<td class="num" class:negativo={(f.saldo ?? 0) < 0}>{f.saldo != null ? clp(f.saldo) : ''}</td>{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="tenue nota">
					{conSaldo ? 'El saldo se reconstruye hacia atrás desde el saldo de hoy del banco. ' : ''}Los bancos entregan solo los últimos movimientos (≈ 50 por cuenta).
				</p>
			{/if}
		</section>
	{:else}
		{#if !data.conciliacion}
			<section class="tarjeta"><Vacio icono="ok" titulo="Conciliación aún no disponible">Falta una actualización de la base de datos.</Vacio></section>
		{:else}
			{@const malas = data.conciliacion.filter((c) => c.cuadra === false).length}
			{@const sinEvaluar = data.conciliacion.filter((c) => c.cuadra === null).length}
			<section class="tarjeta">
				<p class="frase">
					{#if malas}
						<Icono nombre="alerta" tam={18} /> <strong>{malas} {malas === 1 ? 'diferencia' : 'diferencias'}</strong> para revisar
					{:else}
						<Icono nombre="ok" tam={18} /> <strong>Todo cuadra</strong>
					{/if}
					<span class="tenue">· {data.conciliacion.length} verificaciones{sinEvaluar ? `, ${sinEvaluar} sin datos para evaluar` : ''}</span>
				</p>
			</section>
			{#each grupos(data.conciliacion) as g (g.ambito)}
				<section class="tarjeta">
					<div class="tarjeta-cabecera"><h2>{AMBITOS[g.ambito]}</h2></div>
					<ul class="verificaciones">
						{#each g.filas as c (c.sujeto)}
							<li>
								<span class="marca" class:mal={c.cuadra === false} class:nula={c.cuadra === null} aria-label={c.cuadra === false ? 'No cuadra' : c.cuadra === null ? 'Sin evaluar' : 'Cuadra'}>
									<Icono nombre={c.cuadra === false ? 'alerta' : c.cuadra === null ? 'mas' : 'ok'} tam={14} />
								</span>
								<span class="cuerpo">
									<span class="titulo">{c.sujeto}</span>
									<span class="tenue">{c.detalle}</span>
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			<p class="tenue nota">
				Se revisa en cada actualización: que cada movimiento del banco llegue a la app sin duplicarse, que cada estado de cuenta cuadre
				(saldo anterior − movimientos = facturado) y que el saldo de cada cuenta calce con sus movimientos entre dos actualizaciones.
			</p>
		{/if}
	{/if}
</div>

<style>
	.pestanas {
		display: inline-flex;
		flex-wrap: wrap;
		background: var(--superficie-2);
		border-radius: 12px;
		padding: 3px;
	}
	.pestanas a {
		padding: 6px 12px;
		border-radius: 9px;
		font-weight: 600;
		font-size: 0.86rem;
		color: var(--texto-2);
		text-decoration: none;
	}
	.pestanas a.activa {
		background: var(--superficie);
		color: var(--texto);
		box-shadow: var(--sombra);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		text-align: left;
		font-weight: 550;
	}
	td.num,
	th.num {
		text-align: right;
		white-space: nowrap;
	}
	.balance th,
	.balance td {
		padding: 9px 0;
	}
	.balance td {
		padding-left: 12px;
		text-align: right;
	}
	.balance tr + tr,
	.tabla tbody tr {
		border-top: 1px solid var(--borde);
	}
	tr.fuerte th,
	tr.fuerte td {
		font-weight: 750;
	}
	.balance tr.fuerte th,
	.balance tr.fuerte td {
		font-size: 1.15rem;
	}
	.tabla th,
	.tabla td {
		padding: 8px 6px;
		font-size: 0.88rem;
		vertical-align: top;
	}
	.tabla thead th {
		color: var(--texto-3);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.resultados tr:not(.fuerte) th {
		padding-left: 18px;
		font-weight: 450;
		color: var(--texto-2);
	}
	.desplaza {
		overflow-x: auto;
	}
	.partidas,
	.verificaciones {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.partidas li,
	.verificaciones li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 0;
	}
	.partidas li + li,
	.verificaciones li + li {
		border-top: 1px solid var(--borde);
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
	}
	.cuerpo .tenue {
		font-size: 0.78rem;
	}
	.libro .detalle {
		display: flex;
		flex-direction: column;
		min-width: 160px;
	}
	.libro .detalle .tenue {
		font-size: 0.75rem;
	}
	.nowrap {
		white-space: nowrap;
	}
	.elegir {
		max-width: 420px;
		margin-bottom: 12px;
	}
	.frase {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	.marca {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: var(--positivo-suave);
		color: var(--positivo);
		flex: none;
	}
	.marca.mal {
		background: var(--aviso-suave);
		color: var(--aviso);
	}
	.marca.nula {
		background: var(--superficie-2);
		color: var(--texto-3);
	}
	.nota {
		margin-top: 10px;
	}
</style>

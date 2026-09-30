<script lang="ts">
	import BarraAlerta from '$lib/componentes/BarraAlerta.svelte';
	import BarraProgreso from '$lib/componentes/BarraProgreso.svelte';
	import BarraUso from '$lib/componentes/BarraUso.svelte';
	import Icono from '$lib/componentes/Icono.svelte';
	import SelectorMes from '$lib/componentes/SelectorMes.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { aPagarTarjeta, GRUPOS_CAJA, nombreGrupo } from '$lib/caja';
	import { colorCategoria, nombreCategoria } from '$lib/categorias';
	import { diasEnMes, diasEntre, hoyChile, mesActual, parametroMes, sumarMeses } from '$lib/fechas';
	import { clp, diaLargo, fecha, fechaHora, mesLargo, nombreBanco, porcentaje } from '$lib/formato';

	let { data } = $props();

	const r = $derived(data.actual);
	const alerta = $derived(!!r && r.alerta_negativo && r.meses_completos && data.mes === mesActual());
	const enCurso = $derived(data.mes === mesActual());
	const nombreMes = $derived(mesLargo(data.mes).split(' ')[0].toLowerCase());
	const top = $derived(data.categorias.slice(0, 5));
	const maxCat = $derived(top[0]?.monto ?? 0);
	const carga = $derived(data.credito?.carga_porcentaje ?? null);
	const diasRestantes = $derived(enCurso ? diasEnMes(data.mes) - Number(data.hoy.slice(8)) : 0);
	const variacionGasto = $derived(
		r && data.anterior && data.anterior.gastos > 0 ? ((r.gastos - data.anterior.gastos) / data.anterior.gastos) * 100 : null
	);

	const totalSaldos = $derived(data.saldos.reduce((s, x) => s + x.saldo_disponible, 0));
	const rotativas = $derived(
		data.deudas.filter((d) => d.tipo === 'tarjeta' || d.tipo === 'linea').sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'tarjeta' ? -1 : 1))
	);

	const cicloR = $derived(data.cajaResumen?.find((c) => c.ciclo === data.cicloVer) ?? null);
	const cicloPrevio = $derived(data.cajaResumen?.find((c) => c.ciclo === sumarMeses(data.cicloHoy, -1)) ?? null);
	const filasCiclo = $derived((data.cajaCiclo ?? []).filter((f) => f.ciclo === data.cicloVer));
	const gruposCiclo = $derived(
		GRUPOS_CAJA.map((g) => {
			const f = filasCiclo.find((x) => x.grupo === g.id);
			return { ...g, entradas: f?.entradas ?? 0, salidas: f?.salidas ?? 0 };
		}).filter((g) => g.entradas > 0 || g.salidas > 0)
	);
	const maxGrupo = $derived(Math.max(1, ...gruposCiclo.map((g) => Math.max(g.entradas, g.salidas))));
	const ciclos = $derived((data.cajaResumen ?? []).slice(0, 6));

	const sumaCompromisos = $derived(data.compromisos.reduce((s, c) => s + c.monto, 0));
	const paraVivir = $derived(data.compromisos[0]?.disponible_para_vivir_ajustado ?? totalSaldos - sumaCompromisos);
	const ahorroMinimos = $derived(data.compromisos.reduce((s, c) => s + (c.monto_minimo != null ? c.monto - c.monto_minimo : 0), 0));
	const diasSueldo = $derived(Math.max(1, diasEntre(data.hoy, data.sueldo)));

	function enDias(f: string): string {
		const n = diasEntre(data.hoy, f);
		return n < 0 ? 'vencido' : n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`;
	}

	function textoHora(iso: string): string {
		const [f, h] = fechaHora(iso).split(' ');
		return f === fecha(hoyChile()) ? `hoy a las ${h}` : `el ${f} a las ${h}`;
	}

	const rangoCiclo = (inicio: string, fin: string) => `${Number(inicio.slice(8))} ${mesLargo(inicio).slice(0, 3).toLowerCase()} – ${Number(fin.slice(8))} ${mesLargo(fin).slice(0, 3).toLowerCase()}`;
	const nombreCiclo = (ciclo: string) => mesLargo(ciclo).split(' ')[0].toLowerCase();
</script>

<svelte:head><title>Resumen · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Resumen</h1>
			<p class="subtitulo">Tu plata real hoy y lo que viene hasta el sueldo</p>
		</div>
	</header>

	<div class="rejilla rejilla-caja">
		<section class="tarjeta hoy">
			<div class="tarjeta-cabecera">
				<h2>Plata disponible hoy</h2>
				{#if data.saldosAl}<span class="tenue chica">Saldos {textoHora(data.saldosAl)}</span>{/if}
			</div>
			<p class="cifra-grande" class:negativo={totalSaldos < 0}>{clp(totalSaldos)}</p>
			{#if data.saldos.length}
				<ul class="lista">
					{#each data.saldos as s (s.banco + s.producto_nombre)}
						<li>
							<span class="icono-caja"><Icono nombre="banco" tam={18} /></span>
							<span class="cuerpo">
								<span class="titulo">{s.producto_nombre}</span>
								<span class="tenue">{nombreBanco(s.banco)}{s.actualizado ? ` · ${fechaHora(s.actualizado).split(' ')[1]}` : ''}</span>
							</span>
							<span class="num valor">{clp(s.saldo_disponible)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="tenue">Aún no hay saldos de cuentas publicados.</p>
			{/if}
		</section>

		<section class="tarjeta viene" class:rojo={paraVivir < 0}>
			<div class="tarjeta-cabecera">
				<h2>Lo que viene</h2>
				<span class="tenue chica">hasta el {fecha(data.sueldo)}</span>
			</div>
			<p class="cifra-media num" class:positivo={paraVivir >= 0} class:negativo={paraVivir < 0}>
				{paraVivir >= 0 ? '' : '−'}{clp(Math.abs(paraVivir))}
			</p>
			<p class="tenue chica">
				{paraVivir >= 0 ? `para vivir · ${clp(paraVivir / diasSueldo)} por día` : 'te faltan para cubrir lo que vence antes del sueldo'}
			</p>
			{#if data.compromisos.length}
				<details class="detalle-viene">
					<summary>
						{data.compromisos.length} {data.compromisos.length === 1 ? 'pago' : 'pagos'} por <strong class="num">{clp(sumaCompromisos)}</strong>
					</summary>
				{#if ahorroMinimos > 0}
					<p class="tenue chica">
						Pagando solo mínimos {paraVivir + ahorroMinimos >= 0 ? 'te quedarían' : 'igual te faltarían'}
						<strong class="num">{clp(Math.abs(paraVivir + ahorroMinimos))}</strong>, pero el resto cobra intereses.
					</p>
				{/if}
				<ul class="lista compacta">
					{#each data.compromisos as c, i (i)}
						<li>
							<span class="fecha-caja num" aria-hidden="true">
								<strong>{c.fecha ? c.fecha.slice(8) : '—'}</strong>
								<small>{c.fecha ? mesLargo(c.fecha).slice(0, 3).toLowerCase() : ''}</small>
							</span>
							<span class="cuerpo">
								<span class="titulo">{c.nombre}</span>
								<span class="tenue">{c.detalle ?? ''}{c.monto_minimo != null ? ` · mínimo ${clp(c.monto_minimo)}` : ''}</span>
							</span>
							<span class="num valor">{clp(c.monto)}</span>
						</li>
					{/each}
				</ul>
				<p class="tenue chica">
					{#if data.faltanTablas}
						Aún no se suman pagos fijos ni deudas manuales.
					{:else}
						Incluye tarjetas, créditos, <a href="/pagos-fijos">pagos fijos</a> y <a href="/deudas/anotadas">deudas anotadas</a>.
					{/if}
				</p>
				</details>
			{:else}
				<p class="tenue chica">No hay pagos conocidos antes del sueldo.</p>
			{/if}
		</section>
	</div>

	{#if rotativas.length}
		<section class="tarjeta">
			<div class="tarjeta-cabecera">
				<h2>Tus tarjetas y línea</h2>
				<a href="/deudas">Ver deudas</a>
			</div>
			<div class="tarjetas-credito">
				{#each rotativas as t (t.banco + t.nombre)}
					{@const dias = t.proximo_vencimiento ? diasEntre(data.hoy, t.proximo_vencimiento) : null}
					{@const aPagar = t.tipo === 'tarjeta' ? aPagarTarjeta(t) : null}
					<a class="credito" class:urgente={dias != null && dias >= 0 && dias <= 5 && (aPagar ?? 0) > 0} href="/deudas">
						<span class="credito-cabeza">
							<span class="cuerpo">
								<span class="titulo">{t.nombre}</span>
								<span class="tenue">{nombreBanco(t.banco)}</span>
							</span>
							{#if t.proximo_vencimiento && t.tipo === 'tarjeta'}
								<span class="insignia" class:aviso={dias != null && dias <= 5}>Pagar {enDias(t.proximo_vencimiento)}</span>
							{/if}
						</span>
						{#if t.cupo_total}
							<BarraUso usado={t.usado ?? 0} total={t.cupo_total} />
						{/if}
						<span class="datos">
							<span><small>Disponible</small><strong class="num">{clp(t.disponible)}</strong></span>
							{#if t.tipo === 'tarjeta'}
								<span><small>A pagar</small><strong class="num">{clp(t.monto_facturado !== undefined ? aPagar : null)}</strong></span>
								<span><small>Mínimo</small><strong class="num">{clp(t.pago_minimo)}</strong></span>
								<span><small>Por facturar</small><strong class="num">{clp(t.monto_por_facturar)}</strong></span>
							{:else}
								<span><small>Usado</small><strong class="num">{clp(t.usado)}</strong></span>
								<span><small>Tasa mensual</small><strong class="num">{porcentaje(t.tasa_mensual, 2)}</strong></span>
							{/if}
						</span>
						{#if t.proximo_vencimiento && t.tipo === 'tarjeta'}
							<span class="tenue pie-credito">Fecha de pago {fecha(t.proximo_vencimiento)}{t.fecha_proxima_facturacion ? ` · próxima facturación ${fecha(t.fecha_proxima_facturacion)}` : ''}</span>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section class="tarjeta">
		<div class="tarjeta-cabecera">
			<div>
				<h2>Caja del ciclo</h2>
				<p class="tenue chica">Del sueldo al día anterior del siguiente, solo movimientos de tus cuentas</p>
			</div>
		</div>
		{#if !data.cajaResumen}
			<Vacio icono="reloj" titulo="La caja por ciclo aún no está disponible" compacto>Aparecerá cuando se actualice la base de datos.</Vacio>
		{:else if !cicloR}
			<Vacio icono="reloj" titulo="Sin movimientos en este ciclo" compacto />
		{:else}
			<p class="rango">
				<strong>{rangoCiclo(cicloR.ciclo_inicio, cicloR.ciclo_fin)}</strong>
				<span class="tenue">· sueldo que financia {nombreCiclo(cicloR.ciclo)}{cicloR.ciclo === data.cicloHoy ? ' · en curso' : ''}</span>
			</p>
			<div class="caja-totales">
				<div><p class="etiqueta">Entró</p><p class="cifra positivo">{clp(cicloR.entradas)}</p></div>
				<div><p class="etiqueta">Salió</p><p class="cifra">{clp(cicloR.salidas)}</p></div>
				<div><p class="etiqueta">Neto</p><p class="cifra" class:negativo={cicloR.neto < 0} class:positivo={cicloR.neto >= 0}>{clp(cicloR.neto, true)}</p></div>
			</div>
			{#if !cicloR.datos_completos}
				<p class="incompleto">Faltan datos de alguna cuenta en este ciclo (por ejemplo, un sueldo que llegó a una cuenta no conectada); las cifras pueden quedar cortas.</p>
			{/if}
			{#each [cicloR, cicloR.ciclo === data.cicloHoy ? cicloPrevio : null] as c, i (i)}
				{#if c?.alerta_tarjeta_con_linea}
					<div class="banner" role="alert">
						<Icono nombre="alerta" tam={20} />
						<div>
							<strong>{i === 0 ? 'Pagaste la tarjeta con la línea de crédito' : 'El ciclo anterior pagaste la tarjeta con la línea de crédito'}</strong>
							<span>
								{c.monto_tarjeta_con_linea ? `${clp(c.monto_tarjeta_con_linea)} salieron de la línea para pagar tarjeta. ` : ''}Así la deuda no baja: solo
								cambia de lugar y paga intereses dos veces. <a href="/mes">Ver el mes</a>
							</span>
						</div>
					</div>
				{/if}
			{/each}
			<ul class="grupos">
				{#each gruposCiclo as g (g.id)}
					<li>
						<span class="fila-top">
							<span class="nombre">{g.nombre}</span>
							<span class="num valor" class:positivo={g.entradas > 0 && !g.salidas}>{g.entradas > 0 ? clp(g.entradas, true) : clp(-g.salidas)}</span>
						</span>
						<span class="pista">
							<span class:entrada={g.entradas > 0} style:width="{(Math.max(g.entradas, g.salidas) / maxGrupo) * 100}%"></span>
						</span>
					</li>
				{/each}
			</ul>
			{#if ciclos.length > 1}
				<nav class="ciclos" aria-label="Ciclos anteriores">
					{#each ciclos as c (c.ciclo)}
						<a href="?ciclo={c.ciclo.slice(0, 7)}{data.mes !== mesActual() ? `&mes=${parametroMes(data.mes)}` : ''}" class:activo={c.ciclo === data.cicloVer} data-sveltekit-noscroll>
							<span class="tenue">{nombreCiclo(c.ciclo)}{c.datos_completos ? '' : ' *'}</span>
							<strong class="num" class:negativo={c.neto < 0}>{clp(c.neto, true)}</strong>
						</a>
					{/each}
				</nav>
				<p class="nota">Neto por ciclo, nombrado por el mes que financia el sueldo. * datos incompletos.</p>
			{/if}
		{/if}
	</section>

	<header class="seccion-consumo">
		<div>
			<h2 class="titulo-seccion">Consumo del mes</h2>
			<p class="tenue chica">Lo que compraste y cuándo se imputa, sin importar con qué lo pagaste</p>
		</div>
		<SelectorMes mes={data.mes} />
	</header>

	{#if !r}
		<div class="tarjeta">
			<Vacio titulo="Sin datos para {mesLargo(data.mes)}">Aún no hay movimientos publicados para este mes.</Vacio>
		</div>
	{:else}
		<section class="tarjeta flujo" class:alerta>
			<div class="flujo-principal">
				<p class="etiqueta">
					Balance de consumo {enCurso ? 'a la fecha' : 'del mes'}
					{#if !r.meses_completos}<span class="insignia aviso">Datos incompletos</span>{/if}
				</p>
				<p class="cifra-grande" class:negativo={r.flujo_neto < 0}>{clp(r.flujo_neto)}</p>
				<p class="tenue">Ingresos − gastos − intereses y comisiones</p>
			</div>
			{#if enCurso}
				<div class="proyeccion">
					<p class="etiqueta">Proyección al cierre</p>
					<p class="cifra num" class:negativo={r.flujo_proyectado_cierre < 0} class:positivo={r.flujo_proyectado_cierre >= 0}>
						{clp(r.flujo_proyectado_cierre)}
					</p>
					<p class="tenue">Gastos al ritmo actual e ingresos habituales · {diasRestantes === 1 ? 'queda 1 día' : `quedan ${diasRestantes} días`}</p>
				</div>
			{/if}
			{#if !r.meses_completos}
				<p class="incompleto">
					Faltan datos de alguna de tus cuentas en este mes, así que las cifras pueden quedar cortas{enCurso ? ' y no mostramos alerta de proyección' : ''}.
				</p>
			{/if}
			{#if alerta}
				<div class="banner" role="alert">
					<Icono nombre="alerta" tam={20} />
					<div>
						<strong>Al ritmo actual cerrarías {nombreMes} en negativo.</strong>
						<span>
							Si sigues gastando al ritmo de estos días, tus gastos superarían tus ingresos habituales.
							Revisa tus categorías con más gasto.
						</span>
					</div>
				</div>
			{/if}
		</section>

		<section class="cifras" aria-label="Totales del mes">
			<div class="tarjeta mini">
				<p class="etiqueta">Ingresos</p>
				<p class="cifra positivo">{clp(r.ingresos)}</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Gastos</p>
				<p class="cifra">{clp(r.gastos)}</p>
				{#if variacionGasto != null}
					<p class="tenue variacion">
						<Icono nombre={variacionGasto > 0 ? 'subida' : 'bajada'} tam={14} grosor={2.5} />
						{porcentaje(Math.abs(variacionGasto))} vs mes anterior
					</p>
				{/if}
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Intereses y comisiones</p>
				<p class="cifra" class:negativo={r.intereses_comisiones > 0}>{clp(r.intereses_comisiones)}</p>
			</div>
			<div class="tarjeta mini">
				<p class="etiqueta">Pagos de deuda</p>
				<p class="cifra">{clp(r.pagos_deuda)}</p>
			</div>
		</section>

		{#if data.credito}
			<div class="rejilla rejilla-2">
				<section class="tarjeta">
					<div class="tarjeta-cabecera">
						<h2>Compras a crédito {enCurso ? 'este mes' : `en ${nombreMes}`}</h2>
					</div>
					<p class="cifra num">{clp(data.credito.compras_cuotas_monto)}</p>
					<p class="tenue">
						{#if data.credito.compras_cuotas_cantidad}
							{data.credito.compras_cuotas_cantidad} {data.credito.compras_cuotas_cantidad === 1 ? 'compra nueva' : 'compras nuevas'} en cuotas;
							se pagan en los próximos meses
						{:else}
							Sin compras nuevas en cuotas
						{/if}
					</p>
					<p class="nota"><a href="/deudas">Ver cuotas comprometidas</a></p>
				</section>
				<section class="tarjeta">
					<div class="tarjeta-cabecera">
						<h2>Carga de cuotas</h2>
					</div>
					{#if carga != null}
						<p class="cifra num" class:negativo={carga > data.tope}>{porcentaje(carga, 1)} <span class="de">de tu ingreso</span></p>
						<div class="espacio">
							<BarraAlerta
								porcentaje={(100 * carga) / data.tope}
								umbrales={[100]}
								estado={carga > data.tope ? 'excedido' : carga > data.tope * 0.8 ? 'aviso' : 'ok'}
								etiqueta="Carga de cuotas respecto de tu tope"
								compacta
							/>
						</div>
						<p class="tenue">
							{clp(data.credito.cuotas_mes)} en cuotas y dividendos · tope {data.tope}%
						</p>
						<p class="nota">
							Ingreso {data.ingresoDeclarado ? 'declarado' : 'estimado'}: {clp(data.credito.ingreso_referencia)}
						</p>
					{:else}
						<p class="tenue">Sin ingreso de referencia. <a href="/mes?ciclo=proximo">Declara tu sueldo</a> para calcularla.</p>
					{/if}
				</section>
			</div>
		{/if}

		<div class="rejilla rejilla-2">
			<section class="tarjeta">
				<div class="tarjeta-cabecera">
					<h2>Sobres del mes</h2>
					<a href="/mes">Ver mes</a>
				</div>
				{#if data.sobres.length}
					<ul class="mini-sobres">
						{#each data.sobres as s (s.sobre.sobre_id)}
							<li>
								<span class="fila-top">
									<span class="nombre">{s.sobre.nombre}</span>
									<span class="num valor">{clp(s.gastado)} <span class="de">/ {clp(s.presupuesto)}</span></span>
								</span>
								<BarraProgreso valor={s.gastado} limite={s.presupuesto} alto={6} />
							</li>
						{/each}
					</ul>
				{:else}
					<Vacio icono="sobre" titulo="Sin sobres" compacto>
						<a href="/anotar">Crea sobres</a> para súper, bencina y lo esencial, y míralos día a día.
					</Vacio>
				{/if}
			</section>

			<section class="tarjeta">
				<div class="tarjeta-cabecera">
					<h2>Top categorías</h2>
					<a href="/categorias?mes={parametroMes(data.mes)}">Ver todas</a>
				</div>
				{#if top.length}
					<ul class="top">
						{#each top as c (c.categoria)}
							<li>
								<a href="/categorias?mes={parametroMes(data.mes)}&cat={c.categoria}">
									<span class="fila-top">
										<span class="punto" style:background={colorCategoria(c.categoria)}></span>
										<span class="nombre">{nombreCategoria(c.categoria)}</span>
										<span class="num valor">{clp(c.monto)}</span>
									</span>
									<span class="pista"><span style:width="{(c.monto / maxCat) * 100}%" style:background={colorCategoria(c.categoria)}></span></span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<Vacio titulo="Sin gastos este mes" compacto />
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.chica {
		font-size: 0.78rem;
	}

	@media (min-width: 900px) {
		.rejilla-caja {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
			align-items: start;
		}
	}

	.hoy {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background:
			radial-gradient(120% 140% at 100% 0%, var(--acento-suave), transparent 60%),
			var(--superficie);
	}

	.hoy .tarjeta-cabecera,
	.viene .tarjeta-cabecera {
		margin-bottom: 4px;
	}

	.viene {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.viene.rojo {
		background:
			radial-gradient(120% 140% at 100% 0%, var(--negativo-suave), transparent 60%),
			var(--superficie);
	}

	.cifra-media {
		font-size: 1.6rem;
		font-weight: 750;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.detalle-viene summary {
		cursor: pointer;
		font-size: 0.88rem;
		color: var(--texto-2);
		padding: 6px 0;
	}

	.detalle-viene[open] summary {
		margin-bottom: 4px;
	}

	.lista.compacta li {
		padding: 7px 0;
	}

	.lista.compacta .fecha-caja {
		width: 38px;
		height: 38px;
	}

	.tarjetas-credito {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
	}

	@media (min-width: 720px) {
		.tarjetas-credito {
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		}
	}

	.credito {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border-radius: 14px;
		border: 1px solid var(--borde);
		background: var(--superficie-2);
		color: var(--texto);
		min-width: 0;
	}

	.credito:hover {
		border-color: var(--borde-fuerte);
	}

	.credito.urgente {
		border-color: color-mix(in srgb, var(--aviso) 55%, transparent);
		background: var(--aviso-suave);
	}

	.credito-cabeza {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.datos {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 12px;
	}

	.datos span {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.datos small {
		font-size: 0.72rem;
		color: var(--texto-3);
		font-weight: 550;
	}

	.datos strong {
		font-size: 0.95rem;
	}


	.pie-credito {
		font-size: 0.75rem;
	}

	.rango {
		font-size: 0.9rem;
		margin-bottom: 10px;
	}

	.caja-totales {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}

	.caja-totales .cifra {
		font-size: clamp(1.02rem, 4.4vw, 1.45rem);
	}

	.grupos {
		list-style: none;
		padding: 0;
		margin: 14px 0 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.grupos li {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.grupos .pista span {
		background: var(--texto-3);
		opacity: 0.55;
	}

	.grupos .pista span.entrada {
		background: var(--positivo);
		opacity: 1;
	}

	.ciclos {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin-top: 16px;
		padding-bottom: 4px;
	}

	.ciclos a {
		display: flex;
		flex-direction: column;
		flex: none;
		min-width: 92px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 1px solid var(--borde);
		color: var(--texto);
		font-size: 0.85rem;
	}

	.ciclos a.activo {
		border-color: var(--acento);
		background: var(--acento-suave);
	}

	.seccion-consumo {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 10px 16px;
		margin-top: 12px;
		padding-top: 18px;
		border-top: 1px solid var(--borde);
	}

	.titulo-seccion {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.mini-sobres {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.mini-sobres li {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.flujo {
		display: grid;
		gap: 18px;
		grid-template-columns: minmax(0, 1fr);
		padding: 22px;
		background:
			radial-gradient(120% 140% at 100% 0%, var(--acento-suave), transparent 60%),
			var(--superficie);
	}

	.flujo.alerta {
		background:
			radial-gradient(120% 140% at 100% 0%, var(--negativo-suave), transparent 60%),
			var(--superficie);
	}

	.flujo-principal {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.proyeccion {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 14px;
		border-top: 1px solid var(--borde);
	}

	.incompleto {
		font-size: 0.82rem;
		color: var(--aviso);
		background: var(--aviso-suave);
		padding: 10px 12px;
		border-radius: 10px;
	}

	.flujo-principal .etiqueta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.banner {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		border-radius: 12px;
		background: var(--negativo-suave);
		color: var(--negativo);
		font-size: 0.88rem;
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 1px;
	}

	.banner div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.banner span {
		color: var(--texto-2);
	}

	@media (min-width: 720px) {
		.flujo {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			align-items: end;
		}

		.proyeccion {
			border-top: 0;
			padding-top: 0;
			border-left: 1px solid var(--borde);
			padding-left: 22px;
		}

		.banner,
		.incompleto {
			grid-column: 1 / -1;
		}
	}

	.cifras {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	@media (min-width: 900px) {
		.cifras {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 16px;
		}
	}

	.mini {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.mini .cifra {
		font-size: clamp(1.1rem, 4.6vw, 1.45rem);
	}

	.variacion {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 0.75rem;
	}

	.de {
		font-size: 0.95rem;
		font-weight: 550;
		color: var(--texto-3);
		letter-spacing: 0;
	}

	.espacio {
		margin: 12px 0 10px;
	}

	.nota {
		margin-top: 6px;
		font-size: 0.75rem;
	}

	.top {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.top a {
		display: flex;
		flex-direction: column;
		gap: 6px;
		color: inherit;
	}

	.fila-top {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
	}

	.fila-top .nombre {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.valor {
		font-weight: 650;
	}

	.pista {
		height: 6px;
		border-radius: 999px;
		background: var(--superficie-2);
		overflow: hidden;
	}

	.pista span {
		display: block;
		height: 100%;
		border-radius: 999px;
	}

	.lista {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.lista li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--borde);
	}

	.lista li:last-child {
		border-bottom: 0;
	}

	.fecha-caja,
	.icono-caja {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--superficie-2);
		line-height: 1.05;
		color: var(--texto-2);
	}

	.fecha-caja strong {
		font-size: 1rem;
		color: var(--texto);
	}

	.fecha-caja small {
		font-size: 0.68rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.cuerpo {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.cuerpo .titulo {
		font-weight: 600;
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cuerpo .tenue {
		font-size: 0.76rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

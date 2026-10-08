<script lang="ts">
	import { enhance } from '$app/forms';
	import Icono from '$lib/componentes/Icono.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { nombreBanco } from '$lib/formato';

	let { data, form } = $props();

	const h = $derived(data.hogar);
	const titular = $derived(h.titular?.nombre ?? 'quien creó el hogar');
	const MENSAJES: Record<string, string> = {
		invitado: 'Invitación guardada. Cuotazo no envía correos: avísale tú que entre con ese correo.',
		cancelada: 'Invitación cancelada.',
		quitado: 'Listo.',
		compartido: 'Guardado. Tu hogar ve solo lo marcado.'
	};
	const confirmar = (texto: string) => (e: MouseEvent) => {
		if (!confirm(texto)) e.preventDefault();
	};
</script>

<svelte:head><title>Hogar · Cuotazo</title></svelte:head>

<div class="pagina">
	<header class="pagina-cabecera">
		<div>
			<h1>Hogar</h1>
			<p class="subtitulo">Comparte el tablero para ver la economía de la casa en conjunto</p>
		</div>
	</header>

	{#if form?.error}
		<p class="aviso-caja error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
	{:else if form?.ok}
		<p class="aviso-caja ok" role="status"><Icono nombre="ok" tam={18} /> {MENSAJES[form.ok] ?? 'Listo.'}</p>
	{/if}

	{#if h.rol === 'miembro'}
		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Estás en el hogar de {titular}</h2></div>
			<p class="secundario">
				Ves las cuentas y tarjetas que comparte, los pagos del mes y los sobres. Puedes usar el carro, anotar gastos y marcar
				pagos. Los pagos fijos, las deudas y los sobres los edita {titular}.
			</p>
			<ul class="personas">
				{#if h.titular}<li><span class="avatar">{(h.titular.nombre ?? 'T')[0]}</span> {h.titular.nombre ?? 'Titular'} <span class="insignia">titular</span></li>{/if}
				{#each h.miembros as m (m.usuario_id)}
					<li><span class="avatar">{(m.nombre ?? 'M')[0]}</span> {m.nombre ?? 'Miembro'}{#if m.usuario_id === h.yo?.usuario_id} <span class="insignia acento">tú</span>{/if}</li>
				{/each}
			</ul>
			{#if h.yo}
				<form method="POST" action="?/quitar" use:enhance>
					<input type="hidden" name="usuario_id" value={h.yo.usuario_id} />
					<button class="boton fantasma peligro" type="submit" onclick={confirmar('¿Salir del hogar? Dejarás de ver sus datos.')}>Salir del hogar</button>
				</form>
			{/if}
		</section>
	{:else}
		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Quiénes están</h2></div>
			<ul class="personas">
				<li><span class="avatar">{(h.yo?.nombre ?? data.email ?? 'T')[0].toUpperCase()}</span> Tú <span class="insignia">titular</span></li>
				{#each h.miembros as m (m.usuario_id)}
					<li>
						<span class="avatar">{(m.nombre ?? 'M')[0]}</span>
						<span class="crece">{m.nombre ?? 'Miembro'}</span>
						<form method="POST" action="?/quitar" use:enhance>
							<input type="hidden" name="usuario_id" value={m.usuario_id} />
							<button class="boton fantasma peligro chico" type="submit" onclick={confirmar(`¿Quitar a ${m.nombre ?? 'esta persona'} del hogar?`)}>Quitar</button>
						</form>
					</li>
				{/each}
				{#each h.invitaciones as email (email)}
					<li>
						<span class="avatar pendiente"><Icono nombre="correo" tam={14} /></span>
						<span class="crece">{email} <span class="tenue">· invitación pendiente</span></span>
						<form method="POST" action="?/cancelar" use:enhance>
							<input type="hidden" name="email" value={email} />
							<button class="boton fantasma chico" type="submit">Cancelar</button>
						</form>
					</li>
				{/each}
			</ul>
			<form method="POST" action="?/invitar" use:enhance class="invitar">
				<label class="campo crece">
					<span>Invitar por correo</span>
					<input class="control" type="email" name="email" required maxlength="254" placeholder="correo@ejemplo.com" autocomplete="off" />
				</label>
				<button class="boton primario" type="submit"><Icono nombre="mas_simple" tam={16} /> Invitar</button>
			</form>
			<p class="tenue nota">
				Cuotazo no le envía nada: avísale tú que entre a cuotazo.vercel.app con <strong>Entrar con Google</strong> usando ese mismo correo. Al entrar queda en tu hogar: ve lo
				que marques abajo, usa el carro, anota gastos y marca pagos. No puede editar pagos fijos, deudas ni sobres.
			</p>
		</section>

		<section class="tarjeta">
			<div class="tarjeta-cabecera"><h2>Qué ve tu hogar</h2></div>
			{#if !data.disponible}
				<Vacio icono="candado" titulo="Aún no disponible" compacto>Falta una actualización de la base de datos.</Vacio>
			{:else if data.productos.length}
				<form method="POST" action="?/compartir" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<ul class="productos">
						{#each data.productos as p (p.clave)}
							<li>
								<label>
									<input type="checkbox" name="producto" value={p.clave} checked={p.compartido} />
									<span class="crece">
										<span class="nombre">{p.nombre}</span>
										<span class="tenue">{p.tipo} · {nombreBanco(p.banco)}</span>
									</span>
								</label>
							</li>
						{/each}
					</ul>
					<button class="boton primario" type="submit"><Icono nombre="ok" tam={16} /> Guardar</button>
				</form>
				<p class="tenue nota">
					Lo no marcado queda solo para ti. Los pagos fijos, sobres y compras del carro son del hogar y los ven todos. Los totales
					del mes y la caja del ciclo se muestran solo si compartes todas tus cuentas y tarjetas.
				</p>
			{:else}
				<Vacio icono="banco" titulo="Sin cuentas todavía" compacto>Cuando se carguen tus bancos podrás elegir qué compartir.</Vacio>
			{/if}
		</section>
	{/if}
</div>

<style>
	.personas,
	.productos {
		list-style: none;
		padding: 0;
		margin: 0 0 12px;
	}
	.personas li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
	}
	.personas li + li,
	.productos li + li {
		border-top: 1px solid var(--borde);
	}
	.avatar {
		display: inline-grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: var(--acento-suave);
		color: var(--acento-tinta);
		font-weight: 700;
		font-size: 0.85rem;
		flex: none;
	}
	.avatar.pendiente {
		background: var(--superficie-2);
		color: var(--texto-3);
	}
	.crece {
		flex: 1;
		min-width: 0;
	}
	.invitar {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.productos label {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		cursor: pointer;
	}
	.productos input {
		width: 18px;
		height: 18px;
		accent-color: var(--acento);
	}
	.productos .crece {
		display: flex;
		flex-direction: column;
	}
	.productos .nombre {
		font-weight: 600;
	}
	.boton.chico {
		min-height: 32px;
		padding: 0 10px;
		font-size: 0.82rem;
	}
	.peligro {
		color: var(--negativo);
	}
	.nota {
		margin-top: 10px;
	}
</style>

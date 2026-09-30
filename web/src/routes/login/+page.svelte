<script lang="ts">
	import { enhance } from '$app/forms';
	import Icono from '$lib/componentes/Icono.svelte';

	let { data, form } = $props();
	let enviando = $state(false);
</script>

<svelte:head><title>Ingresar · Cuotazo</title></svelte:head>

<div class="fondo">
	<main class="caja">
		<div class="marca">
			<span class="logo" aria-hidden="true"><Icono nombre="tendencia" tam={22} grosor={2.4} /></span>
			<span>Cuotazo</span>
		</div>

		{#if data.modoDemo}
			<h1>Modo demostración</h1>
			<p class="secundario">
				La app no tiene Supabase configurado, así que muestra datos sintéticos y no necesita iniciar sesión.
			</p>
			<a class="boton primario ancho" href="/">Ver la demo</a>
		{:else if form?.enviado}
			<div class="enviado">
				<span class="icono-grande"><Icono nombre="correo" tam={26} /></span>
				<h1>Revisa tu correo</h1>
				<p class="secundario">Te enviamos un enlace de acceso a <strong>{form.email}</strong>. Ábrelo en este mismo dispositivo.</p>
				<a class="boton fantasma" href="/login">Usar otro correo</a>
			</div>
		{:else}
			<h1>Tus finanzas, claras</h1>
			<p class="secundario">Ingresa con tu correo: te enviaremos un enlace mágico, sin contraseñas.</p>

			{#if data.errorEnlace}
				<p class="error" role="alert"><Icono nombre="alerta" tam={18} /> El enlace expiró o ya se usó. Pide uno nuevo.</p>
			{/if}
			{#if form?.error}
				<p class="error" role="alert"><Icono nombre="alerta" tam={18} /> {form.error}</p>
			{/if}

			<form method="POST" action="?/google">
				<button class="boton ancho google" type="submit">
					<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
					Continuar con Google
				</button>
			</form>
			<p class="separador tenue">o con tu correo</p>

			<form
				method="POST"
				action="?/correo"
				use:enhance={() => {
					enviando = true;
					return async ({ update }) => {
						await update();
						enviando = false;
					};
				}}
			>
				<label class="campo">
					<span>Correo electrónico</span>
					<input class="control" type="email" name="email" autocomplete="email" required placeholder="nombre@correo.cl" value={form?.email ?? ''} />
				</label>
				<button class="boton primario ancho" type="submit" disabled={enviando}>
					{enviando ? 'Enviando…' : 'Enviar enlace de acceso'}
				</button>
			</form>
		{/if}
		<p class="pie tenue"><Icono nombre="candado" tam={14} /> Solo tú ves tus datos. Nunca pedimos claves bancarias aquí.</p>
	</main>
</div>

<style>
	.fondo {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background:
			radial-gradient(60% 50% at 20% 0%, var(--acento-suave), transparent 70%),
			radial-gradient(50% 40% at 100% 100%, var(--acento-suave), transparent 70%),
			var(--fondo);
	}

	.caja {
		width: 100%;
		max-width: 400px;
		background: var(--superficie);
		border: 1px solid var(--borde);
		border-radius: 22px;
		box-shadow: var(--sombra-alta);
		padding: 28px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.marca {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-bottom: 10px;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--acento);
		color: var(--acento-texto);
	}

	h1 {
		font-size: 1.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 6px;
	}

	.control {
		min-height: 46px;
	}

	.ancho {
		width: 100%;
		min-height: 46px;
	}

	.google {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: var(--superficie);
		border: 1px solid var(--borde);
		color: var(--texto);
		font-weight: 600;
	}

	.separador {
		text-align: center;
		font-size: 0.85rem;
		margin: 2px 0 -4px;
	}

	.error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--negativo-suave);
		color: var(--negativo);
		font-size: 0.88rem;
	}

	.enviado {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}

	.icono-grande {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 16px;
		background: var(--acento-suave);
		color: var(--acento-tinta);
	}

	.pie {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.76rem;
		margin-top: 8px;
		padding-top: 14px;
		border-top: 1px solid var(--borde);
	}
</style>

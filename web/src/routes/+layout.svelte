<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { navigating, page } from '$app/state';
	import Actualizar from '$lib/componentes/Actualizar.svelte';
	import Navegacion from '$lib/componentes/Navegacion.svelte';
	import Vacio from '$lib/componentes/Vacio.svelte';
	import { cssCategorias } from '$lib/categorias';
	import { hoyChile } from '$lib/fechas';
	import { fecha, fechaHora } from '$lib/formato';

	let { data, children } = $props();

	const estilosCategorias = `<style>:root{${cssCategorias('claro')}}@media (prefers-color-scheme: dark){:root{${cssCategorias('oscuro')}}}</style>`;
	const esLogin = $derived(page.url.pathname.startsWith('/login'));

	function textoActualizado(iso: string): string {
		const [f, h] = fechaHora(iso).split(' ');
		return f === fecha(hoyChile()) ? `hoy a las ${h}` : `el ${f} a las ${h}`;
	}
</script>

<svelte:head>
	{@html estilosCategorias}
</svelte:head>

{#if navigating.to}
	<div class="progreso" role="progressbar" aria-label="Cargando"></div>
{/if}

{#if esLogin}
	{@render children()}
{:else}
	<div class="app">
		<Navegacion modoDemo={data.modoDemo} email={data.email} nombre={data.nombre} />
		<main class:cargando={!!navigating.to}>
			{#if data.vinculado}
				<div class="estado-datos">
					{#if data.modoDemo}<span class="insignia aviso demo">Demo · datos sintéticos</span>{/if}
					<Actualizar texto={data.actualizado ? `Actualizado ${textoActualizado(data.actualizado)}` : null} />
				</div>
			{/if}
			{#if data.vinculado}
				{@render children()}
			{:else}
				<Vacio icono="enlace" titulo="Tu cuenta aún no tiene datos vinculados">
					Iniciaste sesión como <strong>{data.email}</strong>, pero todavía no hay bancos asociados a este usuario.
					Cuando se vincule tu cuenta y se publique la primera carga, aquí verás tus movimientos, deudas y presupuestos.
				</Vacio>
			{/if}
		</main>
	</div>
{/if}

<style>
	.app {
		min-height: 100vh;
	}

	main {
		padding: 20px 16px calc(var(--nav-alto) + env(safe-area-inset-bottom) + 28px);
		max-width: 1180px;
		margin: 0 auto;
		min-width: 0;
		transition: opacity 0.2s;
	}

	main.cargando {
		opacity: 0.6;
	}

	.estado-datos {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		font-size: 0.78rem;
		color: var(--texto-3);
		margin-bottom: 14px;
	}

	.progreso {
		position: fixed;
		inset: 0 0 auto 0;
		height: 3px;
		z-index: 50;
		background: linear-gradient(90deg, transparent, var(--acento), transparent);
		background-size: 50% 100%;
		background-repeat: no-repeat;
		animation: barrido 1s ease-in-out infinite;
	}

	@keyframes barrido {
		from {
			background-position: -50% 0;
		}
		to {
			background-position: 150% 0;
		}
	}

	@media (min-width: 960px) {
		.app {
			display: grid;
			grid-template-columns: 248px minmax(0, 1fr);
		}

		main {
			padding: 32px 40px 48px;
			width: 100%;
		}

		.estado-datos {
			justify-content: flex-end;
			margin: -12px 0 8px;
		}

		.demo {
			display: none;
		}
	}
</style>

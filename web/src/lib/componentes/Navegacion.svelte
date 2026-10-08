<script lang="ts">
	import { page } from '$app/state';
	import Icono from './Icono.svelte';

	let { modoDemo, email, nombre }: { modoDemo: boolean; email: string | null; nombre: string | null } = $props();

	const ITEMS = [
		{ href: '/', texto: 'Resumen', corto: 'Resumen', icono: 'resumen' },
		{ href: '/mes', texto: 'Mes', corto: 'Mes', icono: 'plan' },
		{ href: '/deudas', texto: 'Deudas', corto: 'Deudas', icono: 'deudas' },
		{ href: '/carro', texto: 'Carro', corto: 'Carro', icono: 'sobre' },
		{ href: '/contabilidad', texto: 'Contabilidad', corto: 'Contabilidad', icono: 'banco' },
		{ href: '/movimientos', texto: 'Movimientos', corto: 'Movimientos', icono: 'movimientos' },
		{ href: '/pagos-fijos', texto: 'Pagos fijos', corto: 'Fijos', icono: 'fijos' },
		{ href: '/anotar', texto: 'Sobres', corto: 'Sobres', icono: 'presupuestos' },
		{ href: '/diario', texto: 'Diario', corto: 'Diario', icono: 'diario' },
		{ href: '/categorias', texto: 'Categorías', corto: 'Categorías', icono: 'categorias' },
		{ href: '/hogar', texto: 'Hogar', corto: 'Hogar', icono: 'personas' }
	];
	const PRINCIPALES = ITEMS.slice(0, 3);
	const EXTRA = ITEMS.slice(4);

	let menuAbierto = $state(false);
	const activo = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	const extraActivo = $derived(EXTRA.some((i) => activo(i.href)));

	$effect(() => {
		page.url.pathname;
		menuAbierto = false;
	});
</script>

<aside class="lateral" aria-label="Navegación principal">
	<a class="marca" href="/">
		<span class="logo" aria-hidden="true"><Icono nombre="tendencia" tam={18} grosor={2.4} /></span>
		<span>Cuotazo</span>
	</a>
	<nav>
		{#each ITEMS as item (item.href)}
			<a href={item.href} class:activo={activo(item.href)} class:destacado={item.href === '/carro'} aria-current={activo(item.href) ? 'page' : undefined}>
				<Icono nombre={item.icono} tam={19} />
				<span>{item.texto}</span>
			</a>
		{/each}
	</nav>
	<div class="pie">
		{#if modoDemo}
			<div class="demo">
				<strong>Modo demostración</strong>
				<span>Datos sintéticos, no reales.</span>
			</div>
		{:else if email}
			<div class="cuenta">
				<span class="avatar" aria-hidden="true">{(nombre ?? email)[0].toUpperCase()}</span>
				<span class="correo" title={email}>{nombre ?? email}</span>
			</div>
			<form method="POST" action="/salir">
				<button class="boton fantasma salir" type="submit"><Icono nombre="salir" tam={17} /> Cerrar sesión</button>
			</form>
		{/if}
	</div>
</aside>

<nav class="inferior" aria-label="Navegación principal">
	{#each PRINCIPALES.slice(0, 2) as item (item.href)}
		<a href={item.href} class:activo={activo(item.href)} aria-current={activo(item.href) ? 'page' : undefined}>
			<Icono nombre={item.icono} tam={22} />
			<span>{item.corto}</span>
		</a>
	{/each}
	<a href="/carro" class="anotar" class:activo={activo('/carro')} aria-current={activo('/carro') ? 'page' : undefined} aria-label="Carro de compras">
		<span class="mas-grande"><Icono nombre="mas_simple" tam={26} grosor={2.6} /></span>
	</a>
	{#each PRINCIPALES.slice(2) as item (item.href)}
		<a href={item.href} class:activo={activo(item.href)} aria-current={activo(item.href) ? 'page' : undefined}>
			<Icono nombre={item.icono} tam={22} />
			<span>{item.corto}</span>
		</a>
	{/each}
	<button
		type="button"
		class:activo={extraActivo || menuAbierto}
		aria-expanded={menuAbierto}
		aria-controls="menu-mas"
		onclick={() => (menuAbierto = !menuAbierto)}
	>
		<Icono nombre="mas" tam={22} grosor={2.6} />
		<span>Más</span>
	</button>
</nav>

{#if menuAbierto}
	<button class="velo" type="button" aria-label="Cerrar menú" onclick={() => (menuAbierto = false)}></button>
	<div class="hoja" id="menu-mas" role="menu">
		{#each EXTRA as item (item.href)}
			<a role="menuitem" href={item.href} class:activo={activo(item.href)}>
				<Icono nombre={item.icono} tam={20} />
				<span>{item.texto}</span>
			</a>
		{/each}
		{#if modoDemo}
			<p class="nota">Modo demostración · datos sintéticos</p>
		{:else if email}
			<form method="POST" action="/salir">
				<button role="menuitem" type="submit"><Icono nombre="salir" tam={20} /><span>Cerrar sesión</span></button>
			</form>
			<p class="nota">{email}</p>
		{/if}
	</div>
{/if}

<style>
	.lateral {
		display: none;
	}

	.inferior {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 30;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		height: calc(var(--nav-alto) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: color-mix(in srgb, var(--superficie) 88%, transparent);
		backdrop-filter: saturate(1.6) blur(16px);
		-webkit-backdrop-filter: saturate(1.6) blur(16px);
		border-top: 1px solid var(--borde);
	}

	.inferior a,
	.inferior button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--texto-3);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		position: relative;
	}

	.inferior .activo {
		color: var(--acento-tinta);
	}

	.inferior .anotar::before {
		display: none;
	}

	.mas-grande {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		margin-top: -18px;
		border-radius: 18px;
		background: var(--acento);
		color: var(--acento-texto);
		box-shadow: var(--sombra-alta);
		border: 3px solid var(--fondo);
	}

	.inferior .activo::before {
		content: '';
		position: absolute;
		top: 0;
		width: 28px;
		height: 3px;
		border-radius: 0 0 3px 3px;
		background: var(--acento);
	}

	.velo {
		position: fixed;
		inset: 0;
		z-index: 31;
		background: rgb(0 0 0 / 0.3);
		border: 0;
	}

	.hoja {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(var(--nav-alto) + env(safe-area-inset-bottom) + 10px);
		z-index: 32;
		background: var(--superficie);
		border: 1px solid var(--borde);
		border-radius: 18px;
		box-shadow: var(--sombra-alta);
		padding: 8px;
		display: flex;
		flex-direction: column;
	}

	.hoja a,
	.hoja button {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 12px;
		border-radius: 12px;
		color: var(--texto);
		font-weight: 550;
		background: none;
		border: 0;
		width: 100%;
		text-align: left;
		cursor: pointer;
	}

	.hoja a.activo {
		background: var(--acento-suave);
		color: var(--acento-tinta);
	}

	.nota {
		font-size: 0.78rem;
		color: var(--texto-3);
		padding: 8px 12px 4px;
		border-top: 1px solid var(--borde);
		margin-top: 4px;
	}

	@media (min-width: 960px) {
		.inferior,
		.hoja,
		.velo {
			display: none;
		}

		.lateral {
			position: sticky;
			top: 0;
			height: 100vh;
			display: flex;
			flex-direction: column;
			gap: 24px;
			padding: 22px 14px;
			border-right: 1px solid var(--borde);
			background: var(--superficie);
		}

		.marca {
			display: flex;
			align-items: center;
			gap: 10px;
			color: var(--texto);
			font-weight: 700;
			font-size: 1.05rem;
			letter-spacing: -0.02em;
			padding: 0 8px;
		}

		.logo {
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border-radius: 10px;
			background: var(--acento);
			color: var(--acento-texto);
		}

		nav {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		nav a {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 10px 12px;
			border-radius: 11px;
			color: var(--texto-2);
			font-weight: 550;
			font-size: 0.93rem;
		}

		nav a:hover {
			background: var(--superficie-2);
			color: var(--texto);
		}

		nav a.destacado {
			margin: 6px 0;
			border: 1px dashed color-mix(in srgb, var(--acento) 55%, transparent);
			color: var(--acento-tinta);
		}

		nav a.activo {
			background: var(--acento-suave);
			color: var(--acento-tinta);
		}

		.pie {
			margin-top: auto;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.demo {
			display: flex;
			flex-direction: column;
			padding: 12px;
			border-radius: 12px;
			background: var(--aviso-suave);
			color: var(--aviso);
			font-size: 0.8rem;
		}

		.cuenta {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 0 8px;
			min-width: 0;
		}

		.avatar {
			display: grid;
			place-items: center;
			flex: none;
			width: 30px;
			height: 30px;
			border-radius: 50%;
			background: var(--superficie-3);
			font-weight: 700;
			font-size: 0.8rem;
		}

		.correo {
			font-size: 0.85rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.salir {
			width: 100%;
			justify-content: flex-start;
			color: var(--texto-2);
		}
	}
</style>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icono from './Icono.svelte';

	let { icono = 'vacio', titulo, compacto = false, children }: { icono?: string; titulo: string; compacto?: boolean; children?: Snippet } =
		$props();
</script>

<div class="vacio" class:compacto>
	<span class="icono"><Icono nombre={icono} tam={compacto ? 20 : 26} /></span>
	<p class="titulo">{titulo}</p>
	{#if children}<p class="texto">{@render children()}</p>{/if}
</div>

<style>
	.vacio {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 48px 20px;
		max-width: 460px;
		margin: 0 auto;
	}

	.compacto {
		padding: 24px 12px;
	}

	.icono {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 18px;
		background: var(--superficie-2);
		color: var(--texto-3);
		margin-bottom: 4px;
	}

	.compacto .icono {
		width: 42px;
		height: 42px;
		border-radius: 13px;
	}

	.titulo {
		font-weight: 650;
	}

	.texto {
		color: var(--texto-3);
		font-size: 0.9rem;
	}
</style>

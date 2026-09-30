<script lang="ts">
	import { page } from '$app/state';
	import Vacio from '$lib/componentes/Vacio.svelte';
</script>

<svelte:head><title>Error · Cuotazo</title></svelte:head>

<div class="tarjeta">
	<Vacio icono="alerta" titulo={page.status === 404 ? 'Página no encontrada' : 'Algo salió mal'}>
		{page.status === 404 ? 'La dirección no existe.' : 'No pudimos cargar tus datos. Intenta de nuevo en un momento.'}
		<a href="/">Volver al resumen</a>
	</Vacio>
</div>

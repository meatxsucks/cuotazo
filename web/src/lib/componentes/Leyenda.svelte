<script lang="ts">
	let { items }: { items: { id: string; nombre: string; color: string }[] } = $props();
</script>

<ul class="leyenda">
	{#each items as it (it.id)}
		<li><span class="punto" style:background={it.color}></span>{it.nombre}</li>
	{/each}
</ul>

<style>
	.leyenda {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		font-size: 0.78rem;
		color: var(--texto-2);
	}

	li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>

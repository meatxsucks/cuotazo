<script lang="ts">
	let {
		nombre,
		etiqueta,
		valor = null,
		requerido = false,
		marcador = '0',
		ancho = false,
		oncambio
	}: {
		nombre: string;
		etiqueta: string;
		valor?: number | null;
		requerido?: boolean;
		marcador?: string;
		ancho?: boolean;
		oncambio?: (n: number | null) => void;
	} = $props();

	const miles = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));

	function formatear(e: Event & { currentTarget: HTMLInputElement }) {
		const d = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, '');
		e.currentTarget.value = d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
		oncambio?.(d ? Number(d) : null);
	}
</script>

<label class="campo" class:ancho>
	<span>{etiqueta}</span>
	<span class="prefijo">
		<span aria-hidden="true">$</span>
		<input class="control num" name={nombre} inputmode="numeric" autocomplete="off" placeholder={marcador} value={miles(valor)} oninput={formatear} required={requerido} />
	</span>
</label>

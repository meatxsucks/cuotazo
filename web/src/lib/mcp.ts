// Servidor MCP mínimo (JSON-RPC sobre HTTP, sin estado) para el agente (ADR-012).
// Con el token de lectura solo ve las herramientas de consulta; con el de escritura, también las que anotan.
export type Ejecutar = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
export type Opciones = { usuario: string; leer: Ejecutar; escribir?: Ejecutar };

type Args = Record<string, unknown>;
type Peticion = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Def = {
	name: string;
	description: string;
	inputSchema: object;
	escribe?: boolean;
	ejecutar: (a: Args, o: Opciones & { escribir: Ejecutar }) => Promise<unknown>;
};

class Invalido extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const falta = (k: string) => new Invalido(`Falta ${k}`);

function ent(a: Args, k: string, req: boolean): number | null {
	const v = a[k];
	if (v === undefined || v === null) {
		if (req) throw falta(k);
		return null;
	}
	if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Invalido(`${k} debe ser un entero`);
	return v;
}
function txt(a: Args, k: string, req: boolean, max = 200): string | null {
	const v = a[k];
	if (v === undefined || v === null) {
		if (req) throw falta(k);
		return null;
	}
	if (typeof v !== 'string' || v.length > max) throw new Invalido(`${k} debe ser texto de hasta ${max} caracteres`);
	return v;
}
function fecha(a: Args, k: string): string | null {
	const v = a[k];
	if (v === undefined || v === null) return null;
	if (typeof v !== 'string' || !FECHA_RE.test(v)) throw new Invalido(`${k} debe ser AAAA-MM-DD`);
	return v;
}
function uuid(a: Args, k: string, req: boolean): string | null {
	const v = txt(a, k, req, 36);
	if (v !== null && !UUID.test(v)) throw new Invalido(`${k} debe ser un id`);
	return v;
}
function opcion(a: Args, k: string, valores: string[], porDefecto: string | null, req = false): string | null {
	const v = a[k];
	if (v === undefined || v === null) {
		if (req) throw falta(k);
		return porDefecto;
	}
	if (typeof v !== 'string' || !valores.includes(v)) throw new Invalido(`${k} debe ser uno de: ${valores.join(', ')}`);
	return v;
}
function bool(a: Args, k: string): boolean | null {
	const v = a[k];
	if (v === undefined || v === null) return null;
	if (typeof v !== 'boolean') throw new Invalido(`${k} debe ser verdadero o falso`);
	return v;
}

const F = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'AAAA-MM-DD' };
const objeto = (properties: object = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const SIN_ARGS = objeto();
const RANGO = objeto({ desde: F, hasta: F });
const CATEGORIAS = ['salario', 'freelance', 'venta', 'devolucion', 'otro'];

const LEER = 'select finanzas.agente_leer($1::uuid, $2::text, $3::date, $4::date) as r';
const vista = (vista: string, rango = false): Def['ejecutar'] => async (a, o) => {
	const filas = await o.leer(LEER, [o.usuario, vista, rango ? fecha(a, 'desde') : null, rango ? fecha(a, 'hasta') : null]);
	return filas[0]?.r ?? [];
};

// Los datos de negocio rechazados por la base (topes, fechas) vuelven como exito = false con su explicación
const escribe = (sql: string, params: (a: Args, u: string) => unknown[], salida: (r: unknown) => object): Def['ejecutar'] => async (a, o) => {
	const p = params(a, o.usuario);
	try {
		const filas = await o.escribir(sql, p);
		return salida(filas[0]?.r);
	} catch (e) {
		if ((e as { code?: string }).code === 'P0001') return { exito: false, mensaje: (e as Error).message };
		throw e;
	}
};

const HERRAMIENTAS: Def[] = [
	{ name: 'resumen', description: 'Disponible hoy, lo que viene hasta el cierre del ciclo, próximo sueldo e ingresos adicionales.', inputSchema: SIN_ARGS, ejecutar: vista('lo_que_viene') },
	{ name: 'pagos_ciclo', description: 'Pagos del ciclo (cuentas, tarjetas, créditos) con su estado, lo pagado en el banco y lo anotado a mano.', inputSchema: SIN_ARGS, ejecutar: vista('pagos_ciclo') },
	{ name: 'deudas', description: 'Tarjetas, líneas, créditos y deudas anotadas.', inputSchema: SIN_ARGS, ejecutar: vista('deudas_todas') },
	{ name: 'sobres', description: 'Estado de los sobres de gasto del mes.', inputSchema: SIN_ARGS, ejecutar: vista('estado_sobre') },
	{
		name: 'topes_credito',
		description: 'Uso de crédito por ciclo (compras con tarjeta y giros de línea) y topes definidos.',
		inputSchema: SIN_ARGS,
		ejecutar: async (_a, o) => ({ uso: await vista('uso_credito')({}, o), topes: await vista('tope_credito')({}, o) })
	},
	{ name: 'movimientos', description: 'Movimientos bancarios por fecha de imputación (máx. 500).', inputSchema: RANGO, ejecutar: vista('movimiento', true) },
	{ name: 'anotaciones', description: 'Gastos anotados a mano (por la persona o el agente) por fecha, para comparar contra los sobres.', inputSchema: RANGO, ejecutar: vista('anotacion', true) },
	{ name: 'ingresos', description: 'Ingresos adicionales al sueldo, por fecha.', inputSchema: RANGO, ejecutar: vista('ingreso', true) },
	{ name: 'pagos_manuales', description: 'Pagos anotados a mano contra obligaciones, por fecha.', inputSchema: RANGO, ejecutar: vista('pago_manual', true) },
	{
		name: 'buscar_obligacion',
		description: 'Busca obligaciones del ciclo en curso por nombre o acreedor; devuelve el obligacion_id que usa registrar_pago.',
		inputSchema: objeto({ query: { type: 'string' }, tipo: { type: 'string', enum: ['fijo', 'deuda_manual', 'credito', 'dividendo', 'tarjeta'] } }),
		ejecutar: async (a, o) => {
			const filas = await o.leer('select finanzas.agente_buscar_obligacion($1::uuid, $2::text, $3::text) as r', [
				o.usuario,
				txt(a, 'query', false),
				opcion(a, 'tipo', ['fijo', 'deuda_manual', 'credito', 'dividendo', 'tarjeta'], null)
			]);
			return filas[0]?.r ?? [];
		}
	},
	{
		name: 'anotar_gasto',
		description: 'Anota un gasto suelto (monto 1 a 500.000, hasta 30 días atrás). Opcionalmente en un sobre.',
		escribe: true,
		inputSchema: objeto(
			{ monto: { type: 'integer' }, nota: { type: 'string', maxLength: 140 }, sobre_id: { type: 'string' }, medio: { type: 'string', enum: ['debito', 'credito', 'efectivo', 'otro'] }, fecha: F },
			['monto']
		),
		ejecutar: escribe(
			'select finanzas.agente_anotar_gasto($1::uuid, $2::bigint, $3::text, $4::uuid, $5::text, $6::date) as r',
			(a, u) => [u, ent(a, 'monto', true), txt(a, 'nota', false, 140), uuid(a, 'sobre_id', false), opcion(a, 'medio', ['debito', 'credito', 'efectivo', 'otro'], 'debito'), fecha(a, 'fecha')],
			(id) => ({ exito: true, mensaje: 'Gasto anotado', datos_actualizados: { anotacion_id: id } })
		)
	},
	{
		name: 'crear_sobre',
		description: 'Crea un sobre de presupuesto (monto hasta 2.000.000). Máximo 20 sobres creados por el agente.',
		escribe: true,
		inputSchema: objeto(
			{ nombre: { type: 'string', maxLength: 40 }, monto: { type: 'integer' }, categoria: { type: 'string' }, periodo: { type: 'string', enum: ['mes', 'semana'] }, esencial: { type: 'boolean' } },
			['nombre', 'monto']
		),
		ejecutar: escribe(
			'select finanzas.agente_crear_sobre($1::uuid, $2::text, $3::bigint, $4::finanzas.categoria, $5::text, $6::boolean) as r',
			(a, u) => [u, txt(a, 'nombre', true, 40), ent(a, 'monto', true), txt(a, 'categoria', false, 60), opcion(a, 'periodo', ['mes', 'semana'], 'mes'), bool(a, 'esencial') ?? false],
			(id) => ({ exito: true, mensaje: 'Sobre creado', datos_actualizados: { sobre_id: id } })
		)
	},
	{
		name: 'registrar_ingreso',
		description: 'Registra un ingreso fuera del sueldo (monto 1 a 5.000.000, hasta 30 días atrás). Suma a ingresos_adicionales y al disponible; no toca proximo_sueldo.',
		escribe: true,
		inputSchema: objeto(
			{ descripcion: { type: 'string', maxLength: 140 }, monto: { type: 'integer' }, fecha: F, recurrente: { type: 'boolean' }, categoria: { type: 'string', enum: CATEGORIAS } },
			['descripcion', 'monto']
		),
		ejecutar: escribe(
			'select finanzas.agente_registrar_ingreso($1::uuid, $2::text, $3::bigint, $4::date, $5::boolean, $6::text) as r',
			(a, u) => [u, txt(a, 'descripcion', true, 140), ent(a, 'monto', true), fecha(a, 'fecha'), bool(a, 'recurrente') ?? false, opcion(a, 'categoria', CATEGORIAS, 'otro')],
			(id) => ({ exito: true, mensaje: 'Ingreso registrado', datos_actualizados: { ingreso_id: id } })
		)
	},
	{
		name: 'registrar_pago',
		description:
			'Registra un pago manual de una obligación del ciclo en curso (id de buscar_obligacion o nombre). Pago parcial permitido. Si paga de más o ya estaba pagada, devuelve requiere_confirmacion; repite con confirmar = true.',
		escribe: true,
		inputSchema: objeto(
			{ obligacion: { type: 'string' }, monto: { type: 'integer' }, fecha: F, nota: { type: 'string', maxLength: 140 }, confirmar: { type: 'boolean' } },
			['obligacion', 'monto']
		),
		ejecutar: escribe(
			'select finanzas.agente_registrar_pago($1::uuid, $2::text, $3::bigint, $4::date, $5::text, $6::boolean) as r',
			(a, u) => [u, txt(a, 'obligacion', true, 200), ent(a, 'monto', true), fecha(a, 'fecha'), txt(a, 'nota', false, 140), bool(a, 'confirmar') ?? false],
			(r) => {
				const { exito, mensaje, ...resto } = (typeof r === 'string' ? JSON.parse(r) : r) as Record<string, unknown>;
				return { exito, mensaje, datos_actualizados: resto };
			}
		)
	},
	{
		name: 'deshacer',
		description: 'Deshace algo que el agente anotó en los últimos 7 días: gasto, ingreso, pago o sobre (el sobre se desactiva).',
		escribe: true,
		inputSchema: objeto({ tipo: { type: 'string', enum: ['anotacion', 'ingreso', 'pago', 'sobre'] }, id: { type: 'string' } }, ['tipo', 'id']),
		ejecutar: escribe(
			'select finanzas.agente_deshacer($1::uuid, $2::text, $3::uuid) as r',
			(a, u) => [u, opcion(a, 'tipo', ['anotacion', 'ingreso', 'pago', 'sobre'], null, true), uuid(a, 'id', true)],
			(ok) => ({ exito: ok === true, mensaje: ok === true ? 'Deshecho' : 'No encontré nada del agente para deshacer con ese id (solo los últimos 7 días)' })
		)
	}
];

const ok = (id: Peticion['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const falla = (id: Peticion['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// Devuelve la respuesta JSON-RPC, o null si era una notificación (no lleva respuesta)
export async function responder(msg: Peticion, o: Opciones): Promise<object | null> {
	if (msg.id === undefined) return null;
	const visibles = HERRAMIENTAS.filter((h) => !h.escribe || o.escribir);
	switch (msg.method) {
		case 'initialize':
			return ok(msg.id, {
				protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-03-26',
				capabilities: { tools: {} },
				serverInfo: { name: 'cuotazo', version: '1.1.0' }
			});
		case 'ping':
			return ok(msg.id, {});
		case 'tools/list':
			return ok(msg.id, { tools: visibles.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
		case 'tools/call': {
			const h = visibles.find((x) => x.name === msg.params?.name);
			if (!h) return falla(msg.id, -32602, 'Herramienta desconocida');
			try {
				const datos = await h.ejecutar((msg.params?.arguments ?? {}) as Args, o as Opciones & { escribir: Ejecutar });
				return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(datos) }] });
			} catch (e) {
				if (e instanceof Invalido) return falla(msg.id, -32602, e.message);
				return ok(msg.id, { isError: true, content: [{ type: 'text', text: 'No se pudo completar la operación.' }] });
			}
		}
		default:
			return falla(msg.id, -32601, 'Método no soportado');
	}
}

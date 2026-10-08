// Datos sintéticos con la forma del contrato; nunca datos reales
import type {
	Actualizacion,
	Anotacion,
	Compra,
	DeudaCuotaMes,
	Hogar,
	ProductoCompartido,
	DeudaManual,
	PagoFijo,
	Sobre,
	DeudaProducto,
	GastoDiario,
	Movimiento,
	Perfil,
	Presupuesto,
	ProductoTipo,
	Publicacion,
	ResumenMensual,
	SaldoCuenta,
	TipoFlujo,
	Usuario
} from '$lib/datos/tipos';
import {
	conDia,
	diaSemana,
	diasEnMes,
	diasEntre,
	finDeMes,
	hoyChile,
	listaMeses,
	mesDe,
	sumarDias,
	sumarMeses
} from '$lib/fechas';

export interface DatosDemo {
	usuario: Usuario;
	movimientos: Movimiento[];
	gastoDiario: GastoDiario[];
	resumen: ResumenMensual[];
	deudas: DeudaProducto[];
	cuotas: DeudaCuotaMes[];
	saldos: SaldoCuenta[];
	presupuestos: Presupuesto[];
	perfil: Perfil | null;
	publicaciones: Publicacion[];
	pagosFijos: PagoFijo[];
	deudasManuales: DeudaManual[];
	sobres: Sobre[];
	anotaciones: Anotacion[];
	/** ciclo|clave → pagado, marcas a mano del modo demo */
	marcas: Record<string, boolean>;
	compras: Compra[];
	hogar: Hogar;
	compartidos: ProductoCompartido[];
	actualizacion: Actualizacion | null;
}

const USUARIO_ID = '00000000-0000-4000-8000-000000000001';
const PAREJA_ID = '00000000-0000-4000-8000-000000000002';

interface Prod {
	banco: string;
	producto_tipo: ProductoTipo;
	producto_nombre: string;
}

const CC: Prod = { banco: 'banco_demo', producto_tipo: 'cuenta', producto_nombre: 'Cuenta Corriente Banco Demo' };
const CUENTA_VISTA: Prod = { banco: 'banco_sur_demo', producto_tipo: 'cuenta', producto_nombre: 'Cuenta Vista Banco Sur Demo' };
const VISA: Prod = { banco: 'banco_demo', producto_tipo: 'tarjeta', producto_nombre: 'Visa Oro Banco Demo' };
const MASTERCARD: Prod = { banco: 'tienda_demo', producto_tipo: 'tarjeta', producto_nombre: 'Mastercard Tienda Demo' };
const LINEA: Prod = { banco: 'banco_demo', producto_tipo: 'linea', producto_nombre: 'Línea de Crédito Banco Demo' };

function azar(semilla: number) {
	let a = semilla >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function ultimoDiaHabil(mes: string): string {
	let f = finDeMes(mes);
	while (diaSemana(f) === 0 || diaSemana(f) === 6) f = sumarDias(f, -1);
	return f;
}

export function generarDatosDemo(hoy = hoyChile()): DatosDemo {
	const r = azar(20260929);
	const entre = (a: number, b: number) => Math.round((a + r() * (b - a)) / 10) * 10;
	const elegir = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];

	const mesHoy = mesDe(hoy);
	const inicio = sumarMeses(mesHoy, -5);
	const movimientos: Movimiento[] = [];
	let n = 0;

	function mov(
		fecha: string,
		p: Prod,
		glosa: string,
		comercio: string | null,
		categoria: string,
		tipo_flujo: TipoFlujo,
		monto: number,
		cuotas?: { total: number; actual: number; compra: number; imputacion: string }
	) {
		const imputacion = cuotas?.imputacion ?? fecha;
		if (imputacion > hoy || imputacion < inicio) return;
		const esTarjeta = p.producto_tipo === 'tarjeta';
		const estado = esTarjeta
			? mesDe(imputacion) === mesHoy
				? 'no_facturado'
				: 'facturado'
			: diasEntre(fecha, hoy) <= 1
				? 'pendiente'
				: 'contable';
		movimientos.push({
			usuario_id: USUARIO_ID,
			movimiento_id: `demo-${String(++n).padStart(5, '0')}`,
			fecha,
			fecha_imputacion: imputacion,
			...p,
			glosa,
			comercio,
			categoria,
			tipo_flujo,
			monto: Math.round(monto),
			monto_total_compra: cuotas ? cuotas.compra : null,
			cuota_actual: cuotas ? cuotas.actual : null,
			cuotas_total: cuotas ? cuotas.total : null,
			estado
		});
	}

	// Compras en cuotas vigentes: [meses atrás, día, tarjeta, comercio, categoría, total, cuotas]
	const comprasCuotas: [number, number, Prod, string, string, number, number][] = [
		[7, 18, VISA, 'PC Factory', 'tecnologia', 899_990, 12],
		[5, 9, VISA, 'Aerolínea Demo', 'viajes', 642_000, 6],
		[4, 21, MASTERCARD, 'Tienda Demo Online', 'hogar', 549_990, 10],
		[3, 12, MASTERCARD, 'Paris', 'vestuario', 119_990, 3],
		[2, 6, VISA, 'Aerolínea Demo', 'viajes', 238_400, 4],
		[1, 14, VISA, 'Apple Store', 'tecnologia', 1_199_990, 12],
		[1, 25, MASTERCARD, 'Sodimac', 'hogar', 329_990, 6],
		[0, 4, MASTERCARD, 'Taller Automotriz Ñuñoa', 'combustible_auto', 486_000, 3],
		[0, 8, MASTERCARD, 'Tienda Demo Online', 'hogar', 789_990, 12],
		[0, 19, VISA, 'Multitienda Online', 'vestuario', 259_990, 6]
	];
	const cuotasFuturas: { mes: string; prod: Prod; monto: number }[] = [];
	const cuotasPorMes: { mes: string; prod: Prod; monto: number }[] = [];
	const gastoTarjetaMes = new Map<string, number>();
	for (const [atras, dia, prod, comercio, cat, total, cuotas] of comprasCuotas) {
		const mesCompra = sumarMeses(mesHoy, -atras);
		const valor = Math.round(total / cuotas);
		for (let k = 1; k <= cuotas; k++) {
			const mesCuota = sumarMeses(mesCompra, k - 1);
			const imputacion = conDia(mesCuota, dia);
			cuotasPorMes.push({ mes: mesCuota, prod, monto: valor });
			if (imputacion <= hoy) {
				mov(conDia(mesCompra, dia), prod, `${comercio.toUpperCase()} ${String(k).padStart(2, '0')}/${String(cuotas).padStart(2, '0')}`, comercio, cat, 'gasto', -valor, {
					total: cuotas,
					actual: k,
					compra: total,
					imputacion
				});
				const clave = `${prod.producto_nombre}|${mesCuota}`;
				gastoTarjetaMes.set(clave, (gastoTarjetaMes.get(clave) ?? 0) + valor);
			} else {
				cuotasFuturas.push({ mes: mesCuota, prod, monto: valor });
			}
		}
	}

	const cuotaConsumo = 189_450;
	const personas = ['Persona 3f2a', 'Persona 9c41', 'Persona b7e0', 'Persona 51dd'];
	const pagosFijos = pagosFijosDemo(inicio, mesHoy);
	const usoLinea = 300_000;

	for (let f = inicio; f <= hoy; f = sumarDias(f, 1)) {
		const d = Number(f.slice(8));
		const mes = mesDe(f);
		const finde = diaSemana(f) === 0 || diaSemana(f) === 6;
		const inicioDia = movimientos.length;

		// Recurrentes
		if (d === 1) {
			mov(f, VISA, 'NETFLIX.COM', 'Netflix', 'entretenimiento_suscripciones', 'gasto', -10_990);
			mov(f, CC, 'COMISION MANTENCION PLAN', null, 'intereses_comisiones_impuestos', 'interes_comision', -7_990);
			mov(f, LINEA, 'INTERESES LINEA DE CREDITO', null, 'intereses_comisiones_impuestos', 'interes_comision', -entre(3_200, 9_800));
		}
		if (d === 2) mov(f, CC, 'TRASPASO A CTA VISTA *******', null, 'transferencia_interna', 'transferencia_interna', -60_000);
		if (d === 2) mov(f, CUENTA_VISTA, 'TRASPASO DESDE CTA *******', null, 'transferencia_interna', 'transferencia_interna', 60_000);
		if (d === 3) mov(f, VISA, 'SPOTIFY P1F2A9C', 'Spotify', 'entretenimiento_suscripciones', 'gasto', -6_990);
		if (d === 5) {
			mov(f, CC, 'PAGO GASTOS COMUNES EDIFICIO', 'Gastos comunes', 'vivienda_servicios', 'gasto', -entre(118_000, 136_000));
		}
		if (d === 6) mov(f, VISA, 'PLATZI.COM', 'Platzi', 'educacion', 'gasto', -23_990);
		if (d === 8) mov(f, CC, 'PAC ENEL DISTRIBUCION', 'Enel', 'vivienda_servicios', 'gasto', -entre(36_000, 54_000));
		if (d === 10) {
			mov(f, CC, 'PAC AGUAS ANDINAS', 'Aguas Andinas', 'vivienda_servicios', 'gasto', -entre(13_000, 21_000));
			mov(f, CC, 'CARGO CUOTA CREDITO CONSUMO', null, 'sin_categoria', 'pago_deuda', -cuotaConsumo);
		}
		if (d === 11) mov(f, CC, 'PAC METROGAS', 'Metrogas', 'vivienda_servicios', 'gasto', -entre(18_000, 46_000));
		if (d === 12) mov(f, VISA, 'DISNEY PLUS', 'Disney+', 'entretenimiento_suscripciones', 'gasto', -9_990);
		if (d === 14) mov(f, VISA, 'MOVISTAR HOGAR FIBRA', 'Movistar', 'vivienda_servicios', 'gasto', -29_990);
		// La Mastercard se paga al mínimo
		if (d === 15) {
			const previo = gastoTarjetaMes.get(`${MASTERCARD.producto_nombre}|${sumarMeses(mes, -1)}`);
			if (previo) {
				const minimo = Math.round(((previo + SALDO_ROTATIVO_MC) * 0.06) / 10) * 10;
				mov(f, CC, 'PAGO TARJETA MASTERCARD ************', 'Tienda Demo', 'pago_tarjeta_credito', 'pago_deuda', -minimo);
				mov(f, MASTERCARD, 'PAGO RECIBIDO GRACIAS', null, 'pago_tarjeta_credito', 'transferencia_interna', minimo);
			}
		}
		for (const p of pagosFijos) {
			if (d === p.dia_vencimiento && pagoVigente(p, mes)) mov(f, CC, `PAC ${p.nombre.toUpperCase()}`, p.nombre, p.categoria, 'gasto', -p.monto);
		}
		// Rueda: la Visa se paga con plata sacada de la línea y la línea se repone tras el sueldo
		if (d === 20) {
			mov(f, LINEA, 'GIRO A CUENTA CORRIENTE', null, 'transferencia_interna', 'transferencia_interna', -usoLinea);
			mov(f, CC, 'TRASPASO DESDE LINEA DE CREDITO', null, 'transferencia_interna', 'transferencia_interna', usoLinea);
		}
		if (d === 2 && mes !== inicio) {
			mov(f, CC, 'PAGO LINEA DE CREDITO', null, 'pago_credito', 'pago_deuda', -usoLinea);
			mov(f, LINEA, 'ABONO LINEA DE CREDITO', null, 'pago_credito', 'transferencia_interna', usoLinea);
		}
		if (d === 18) mov(f, VISA, 'HDI SEGUROS AUTO', 'HDI Seguros', 'seguros', 'gasto', -32_400);
		if (d === 20) {
			const previo = gastoTarjetaMes.get(`${VISA.producto_nombre}|${sumarMeses(mes, -1)}`);
			if (previo) {
				mov(f, CC, 'PAGO TARJETA VISA ************', 'Banco Demo', 'pago_tarjeta_credito', 'pago_deuda', -previo);
				mov(f, VISA, 'MONTO CANCELADO', null, 'pago_tarjeta_credito', 'transferencia_interna', previo);
			}
		}
		if (d === 22) mov(f, VISA, 'AUTOPASE TAG', 'Autopase', 'transporte', 'gasto', -entre(16_000, 31_000));
		if (d === 23) mov(f, CC, 'IMPUESTO TIMBRES Y ESTAMPILLAS', null, 'intereses_comisiones_impuestos', 'interes_comision', -entre(900, 2_400));
		// Hace dos meses el sueldo llegó a una cuenta no conectada
		if (f === ultimoDiaHabil(mes) && mes !== sumarMeses(mesHoy, -2)) mov(f, CC, 'REMUNERACION EMPRESA ANDES SPA', null, 'ingresos_sueldo', 'ingreso', 2_450_000);
		if (d === 12 && mes === sumarMeses(mesHoy, -2)) mov(f, CC, 'TRANSF. RECIBIDA VENTA MARKETPLACE', null, 'ingresos_otros', 'ingreso', 85_000);
		if (d === 16 && (Number(mes.slice(5, 7)) % 2 === 0)) mov(f, CUENTA_VISTA, 'CONSULTA MEDICA CLINICA', 'Clínica Santa María', 'salud', 'gasto', -45_000);

		// Variables
		const super_ = finde ? 0.55 : 0.28;
		if (r() < super_) {
			const [nombre, tarjeta] = elegir<[string, Prod]>([
				['Líder', VISA], ['Jumbo', VISA], ['Unimarc', CC], ['Tottus', MASTERCARD], ['Santa Isabel', CC], ['Tottus', MASTERCARD]
			]);
			const monto = finde ? entre(38_000, 96_000) : entre(6_500, 32_000);
			mov(f, tarjeta, `${nombre.toUpperCase()} ${elegir(['PROVIDENCIA', 'ÑUÑOA', 'LAS CONDES', 'LA REINA'])}`, nombre, 'supermercado', 'gasto', -monto);
		}
		if (r() < (finde ? 0.45 : 0.22)) {
			const nombre = elegir(['Rappi', 'PedidosYa', 'Uber Eats', 'Starbucks', 'Juan Maestro', 'Dominó', 'Tanta']);
			mov(f, elegir([VISA, VISA, MASTERCARD, CC]), nombre.toUpperCase(), nombre, 'restaurantes_delivery', 'gasto', -entre(5_900, 29_000));
		}
		if (r() < (finde ? 0.3 : 0.38)) {
			const nombre = elegir(['Uber', 'Uber', 'Cabify', 'DiDi']);
			mov(f, VISA, `${nombre.toUpperCase()} *TRIP`, nombre, 'transporte', 'gasto', -entre(3_400, 12_800));
		}
		if (diaSemana(f) === 1) mov(f, CC, 'CARGA TARJETA BIP!', 'Red Metropolitana', 'transporte', 'gasto', -10_000);
		if (r() < 0.12) {
			const nombre = elegir(['Copec', 'Shell', 'Aramco', 'Copec']);
			mov(f, elegir([VISA, MASTERCARD]), `${nombre.toUpperCase()} ESTACION`, nombre, 'combustible_auto', 'gasto', -entre(24_000, 56_000));
		}
		if (r() < 0.07) {
			const nombre = elegir(['Cruz Verde', 'Salcobrand', 'Farmacias Ahumada']);
			mov(f, elegir([CC, VISA]), nombre.toUpperCase(), nombre, 'salud', 'gasto', -entre(4_800, 34_000));
		}
		if (r() < 0.035) {
			const nombre = elegir(['H&M', 'Zara', 'Tienda Demo', 'Paris']);
			mov(f, MASTERCARD, nombre.toUpperCase(), nombre, 'vestuario', 'gasto', -entre(14_990, 69_990));
		}
		if (r() < 0.035) {
			const nombre = elegir(['Sodimac', 'Easy', 'IKEA']);
			mov(f, MASTERCARD, nombre.toUpperCase(), nombre, 'hogar', 'gasto', -entre(7_990, 58_000));
		}
		if (r() < 0.03) mov(f, VISA, 'SUPERZOO', 'Superzoo', 'mascotas', 'gasto', -entre(12_000, 46_000));
		if (r() < 0.04) mov(f, CC, `TRANSF. A ${elegir(personas)}`, null, 'transferencias_personas', 'gasto', -entre(10_000, 60_000));
		if (r() < 0.025) mov(f, CC, elegir(['TRANSF. RECIBIDA VENTA MARKETPLACE', 'DEVOLUCION COMPRA']), null, 'ingresos_otros', 'ingreso', entre(18_000, 120_000));
		if (r() < 0.03) mov(f, CUENTA_VISTA, elegir(['PANADERIA LA ESPIGA', 'FERIA LIBRE']), null, 'supermercado', 'gasto', -entre(3_000, 14_000));

		// Acumula consumo mensual de tarjetas para el pago del mes siguiente
		for (const m of movimientos.slice(inicioDia)) {
			if (m.producto_tipo !== 'tarjeta' || m.monto >= 0) continue;
			const k = `${m.producto_nombre}|${mes}`;
			gastoTarjetaMes.set(k, (gastoTarjetaMes.get(k) ?? 0) - m.monto);
		}
	}

	movimientos.sort((a, b) =>
		a.fecha_imputacion === b.fecha_imputacion ? b.movimiento_id.localeCompare(a.movimiento_id) : b.fecha_imputacion.localeCompare(a.fecha_imputacion)
	);

	// gasto_diario
	const gd = new Map<string, GastoDiario>();
	for (const m of movimientos) {
		if (m.tipo_flujo !== 'gasto' && m.tipo_flujo !== 'interes_comision') continue;
		const k = `${m.fecha_imputacion}|${m.categoria}`;
		const g = gd.get(k) ?? { fecha: m.fecha_imputacion, categoria: m.categoria, monto_gasto: 0, cantidad: 0 };
		g.monto_gasto += -m.monto;
		g.cantidad += 1;
		gd.set(k, g);
	}
	const gastoDiario = [...gd.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));

	// resumen_mensual
	const resumen: ResumenMensual[] = [];
	for (const mes of listaMeses(mesHoy, 6)) {
		const delMes = movimientos.filter((m) => mesDe(m.fecha_imputacion) === mes);
		const suma = (t: TipoFlujo) => delMes.filter((m) => m.tipo_flujo === t).reduce((s, m) => s + Math.abs(m.monto), 0);
		const ingresos = suma('ingreso');
		const gastos = suma('gasto');
		const intereses = suma('interes_comision');
		const flujo = ingresos - gastos - intereses;
		const cerrados = resumen.slice(-3);
		const promedioIngresos = cerrados.length ? cerrados.reduce((s, x) => s + x.ingresos, 0) / cerrados.length : 0;
		const factor = diasEnMes(mes) / Number(hoy.slice(8));
		const proyectado = mes === mesHoy ? Math.round(Math.max(ingresos, promedioIngresos) - (gastos + intereses) * factor) : flujo;
		resumen.push({
			mes,
			ingresos,
			gastos,
			pagos_deuda: suma('pago_deuda'),
			intereses_comisiones: intereses,
			flujo_neto: flujo,
			flujo_proyectado_cierre: proyectado,
			alerta_negativo: proyectado < 0,
			meses_completos: mes !== inicio
		});
	}

	// deuda_producto
	const actualizado = `${hoy}T08:15:00-03:00`;
	const noFacturado = (p: Prod) => gastoTarjetaMes.get(`${p.producto_nombre}|${mesHoy}`) ?? 0;
	const futuras = (p: Prod) => cuotasFuturas.filter((c) => c.prod === p).reduce((s, c) => s + c.monto, 0);
	const facturadoPrevio = (p: Prod) => gastoTarjetaMes.get(`${p.producto_nombre}|${sumarMeses(mesHoy, -1)}`) ?? 0;
	const proximoDia = (dia: number) => {
		const f = conDia(mesHoy, dia);
		return f > hoy ? f : conDia(sumarMeses(mesHoy, 1), dia);
	};
	// Estado facturado a pagar en el próximo vencimiento; lo comprado después queda por facturar
	const tarjeta = (p: Prod, cupo: number, vencimiento: string, tasa: number, cae: number, rotativo: number, pctMinimo: number): DeudaProducto => {
		const facturado = facturadoPrevio(p) + rotativo;
		const porFacturar = noFacturado(p);
		const usado = porFacturar + futuras(p) + facturado;
		const facturacion = sumarDias(vencimiento, -20) <= hoy ? sumarDias(vencimiento, -20) : sumarDias(vencimiento, -50);
		return {
			banco: p.banco, tipo: 'tarjeta', nombre: p.producto_nombre, moneda: 'CLP',
			cupo_total: cupo, usado, disponible: cupo - usado, saldo_deuda: usado,
			valor_cuota: null, cuotas_pagadas: null, cuotas_total: null, fecha_termino: null,
			proximo_vencimiento: vencimiento,
			pago_minimo: Math.round((facturado * pctMinimo) / 10) * 10,
			tasa_mensual: tasa, cae, saldo_deuda_clp: usado, actualizado,
			monto_facturado: facturado,
			fecha_facturacion: facturacion,
			monto_pagado: 0,
			monto_por_facturar: porFacturar,
			fecha_proxima_facturacion: sumarDias(facturacion, 30)
		};
	};
	const pagadasConsumo = 24 + 5;
	const deudas: DeudaProducto[] = [
		tarjeta(MASTERCARD, 4_200_000, sumarDias(hoy, 4), 2.79, 39.6, SALDO_ROTATIVO_MC, 0.06),
		tarjeta(VISA, 4_800_000, proximoDia(20), 2.35, 33.1, 0, 0.05),
		{
			banco: LINEA.banco, tipo: 'linea', nombre: LINEA.producto_nombre, moneda: 'CLP',
			cupo_total: 1_000_000, usado: 640_000, disponible: 360_000, saldo_deuda: 640_000,
			valor_cuota: null, cuotas_pagadas: null, cuotas_total: null, fecha_termino: null,
			proximo_vencimiento: null, pago_minimo: null, tasa_mensual: 1.95, cae: 26.4,
			saldo_deuda_clp: 640_000, actualizado
		},
		{
			banco: 'banco_demo', tipo: 'consumo', nombre: 'Crédito de Consumo Banco Demo', moneda: 'CLP',
			cupo_total: null, usado: null, disponible: null,
			saldo_deuda: cuotaConsumo * (36 - pagadasConsumo) - 412_300,
			valor_cuota: cuotaConsumo, cuotas_pagadas: pagadasConsumo, cuotas_total: 36,
			fecha_termino: conDia(sumarMeses(mesHoy, 36 - pagadasConsumo), 10),
			proximo_vencimiento: proximoDia(10), pago_minimo: null, tasa_mensual: 1.29, cae: 17.8,
			saldo_deuda_clp: cuotaConsumo * (36 - pagadasConsumo) - 412_300, actualizado
		}
	];

	// deuda_cuota_mes: 5 meses atrás a 12 adelante; la cuota de tarjeta se paga el mes siguiente a su imputación
	const cuotas: DeudaCuotaMes[] = [];
	for (let i = -5; i <= 12; i++) {
		const mes = sumarMeses(mesHoy, i);
		for (const p of [MASTERCARD, VISA]) {
			const facturacion = cuotasPorMes
				.filter((c) => c.prod === p && c.mes === sumarMeses(mes, -1))
				.reduce((s, c) => s + c.monto, 0);
			if (facturacion > 0) cuotas.push({ mes, banco: p.banco, tipo: 'tarjeta', nombre: p.producto_nombre, monto: facturacion });
		}
		if (i <= 36 - pagadasConsumo) cuotas.push({ mes, banco: 'banco_demo', tipo: 'consumo', nombre: 'Crédito de Consumo Banco Demo', monto: cuotaConsumo });
	}

	// saldo_cuenta
	const sumaCuenta = (p: Prod, desde = inicio) =>
		movimientos
			.filter((m) => m.banco === p.banco && m.producto_nombre === p.producto_nombre && m.producto_tipo === 'cuenta' && m.fecha >= desde)
			.reduce((s, m) => s + m.monto, 0);
	// Saldo de la cuenta sueldo: lo que quedó del ciclo anterior más lo movido desde el último sueldo
	const ultimoSueldo = movimientos.find((m) => m.categoria === 'ingresos_sueldo')?.fecha ?? inicio;
	const saldos: SaldoCuenta[] = [
		{ banco: CC.banco, producto_nombre: CC.producto_nombre, saldo_disponible: Math.max(84_320, 312_000 + sumaCuenta(CC, ultimoSueldo)), actualizado },
		{ banco: CUENTA_VISTA.banco, producto_nombre: CUENTA_VISTA.producto_nombre, saldo_disponible: Math.max(12_300, 36_450 + sumaCuenta(CUENTA_VISTA, sumarMeses(mesHoy, -1))), actualizado }
	];

	const presupuestos = presupuestosDemo(hoy, gastoDiario, movimientos);
	presupuestos.push({
		presupuesto_id: '00000000-0000-4000-9000-000000000010',
		tipo: 'tope_tarjeta',
		categoria: null,
		producto: `${MASTERCARD.banco}|${MASTERCARD.producto_nombre}`,
		mes: null,
		monto_limite: 900_000,
		porcentaje_limite: null,
		umbrales: [80, 100],
		alerta_pronostico: true
	});

	const publicaciones: Publicacion[] = [
		['movimiento', movimientos.length], ['gasto_diario', gastoDiario.length], ['resumen_mensual', resumen.length],
		['deuda_producto', deudas.length], ['deuda_cuota_mes', cuotas.length], ['saldo_cuenta', saldos.length]
	].map(([tabla, filas]) => ({ tabla: String(tabla), publicado_en: actualizado, filas: Number(filas) }));

	return {
		publicaciones,
		usuario: { usuario_id: USUARIO_ID, nombre_visible: 'Cuenta demo' },
		movimientos,
		gastoDiario,
		resumen,
		deudas,
		cuotas,
		saldos,
		presupuestos,
		perfil: { ingreso_mensual_neto: 2_450_000, dia_pago: null, meta_ahorro_mensual: 0, tope_carga_cuotas_pct: 30, actualizado: actualizado },
		pagosFijos,
		deudasManuales: deudasManualesDemo(hoy),
		sobres: sobresDemo(),
		anotaciones: anotacionesDemo(hoy),
		marcas: {},
		compras: comprasDemo(hoy),
		hogar: {
			rol: 'titular',
			hogar_id: idDemo(10, 1),
			yo: { usuario_id: USUARIO_ID, nombre: 'Titular Demo' },
			titular: { usuario_id: USUARIO_ID, nombre: 'Titular Demo' },
			miembros: [{ usuario_id: PAREJA_ID, nombre: 'Pareja Demo' }],
			invitaciones: []
		},
		compartidos: [CC, CUENTA_VISTA, VISA].map((p) => ({ banco: p.banco, producto_nombre: p.producto_nombre })),
		actualizacion: null
	};
}

const SALDO_ROTATIVO_MC = 820_000;

function pagoVigente(p: PagoFijo, mes: string): boolean {
	return p.activo && mesDe(p.desde) <= mes && (!p.hasta || mesDe(p.hasta) >= mes) && !p.meses_pausa.includes(Number(mes.slice(5, 7)));
}

const idDemo = (serie: number, n: number) => `00000000-0000-4000-${serie}000-${String(n).padStart(12, '0')}`;

function pagosFijosDemo(inicio: string, mesHoy: string): PagoFijo[] {
	const base = { hasta: null, activo: true, desde: inicio };
	return [
		{ ...base, pago_fijo_id: idDemo(7, 6), nombre: 'Arriendo', categoria: 'vivienda_servicios', monto: 480_000, dia_vencimiento: 5, meses_pausa: [] },
		{ ...base, pago_fijo_id: idDemo(7, 7), nombre: 'Seguro del auto', categoria: 'seguros', monto: 29_900, dia_vencimiento: 12, meses_pausa: [], desde: sumarMeses(mesHoy, 3) },
		{ ...base, pago_fijo_id: idDemo(7, 1), nombre: 'Jardín infantil', categoria: 'educacion', monto: 185_000, dia_vencimiento: 5, meses_pausa: [1, 2] },
		{ ...base, pago_fijo_id: idDemo(7, 2), nombre: 'Furgón escolar', categoria: 'transporte', monto: 65_000, dia_vencimiento: 5, meses_pausa: [1, 2] },
		{ ...base, pago_fijo_id: idDemo(7, 3), nombre: 'Clases de natación', categoria: 'entretenimiento_suscripciones', monto: 38_000, dia_vencimiento: 10, meses_pausa: [1, 2] },
		{ ...base, pago_fijo_id: idDemo(7, 4), nombre: 'Plan celular', categoria: 'vivienda_servicios', monto: 19_990, dia_vencimiento: 16, meses_pausa: [] },
		{ ...base, pago_fijo_id: idDemo(7, 5), nombre: 'Seguro complementario de salud', categoria: 'seguros', monto: 24_500, dia_vencimiento: 21, meses_pausa: [] }
	];
}

function deudasManualesDemo(hoy: string): DeudaManual[] {
	const mes = mesDe(hoy);
	const proximo = (dia: number) => (conDia(mes, dia) > hoy ? conDia(mes, dia) : conDia(sumarMeses(mes, 1), dia));
	const base = { activo: true, cuota_minima: null, cuota_fija: null, cuotas_restantes: null };
	return [
		{ ...base, deuda_manual_id: idDemo(8, 1), nombre: 'Súper avance Tienda Demo', acreedor: 'Tienda Demo', tipo: 'consumo', saldo: 1_460_000, tasa_mensual: 3.12, cuota_fija: 128_400, cuotas_restantes: 14, dia_pago: 15, proximo_pago: proximo(15) },
		{ ...base, deuda_manual_id: idDemo(8, 2), nombre: 'Crédito automotriz', acreedor: 'Financiera Demo', tipo: 'automotriz', saldo: 7_900_000, tasa_mensual: 1.45, cuota_fija: 254_000, cuotas_restantes: 48, dia_pago: 5, proximo_pago: conDia(sumarMeses(mes, 3), 5) },
		{ ...base, deuda_manual_id: idDemo(8, 3), nombre: 'Crédito universitario', acreedor: 'Institución Demo', tipo: 'educacion', saldo: 5_400_000, tasa_mensual: 0.17, cuota_fija: 55_000, cuotas_restantes: 110, dia_pago: 10, proximo_pago: proximo(10) },
		{ ...base, deuda_manual_id: idDemo(8, 4), nombre: 'Tarjeta Multitienda Demo', acreedor: 'Multitienda Demo', tipo: 'tarjeta', saldo: 420_000, tasa_mensual: 3.35, cuota_minima: 32_000, dia_pago: 10, proximo_pago: proximo(10) },
		{ ...base, deuda_manual_id: idDemo(8, 5), nombre: 'Tarjeta de supermercado', acreedor: 'Supermercado Demo', tipo: 'tarjeta', saldo: 185_000, tasa_mensual: null, cuota_minima: 15_000, dia_pago: 25, proximo_pago: null }
	];
}

function sobresDemo(): Sobre[] {
	const base = { activo: true };
	return [
		{ ...base, sobre_id: idDemo(6, 1), nombre: 'Supermercado', categoria: 'supermercado', monto: 90_000, periodo: 'semana', esencial: true, orden: 1 },
		{ ...base, sobre_id: idDemo(6, 2), nombre: 'Bencina', categoria: 'combustible_auto', monto: 35_000, periodo: 'semana', esencial: true, orden: 2 },
		{ ...base, sobre_id: idDemo(6, 3), nombre: 'Salud y médico', categoria: 'salud', monto: 60_000, periodo: 'mes', esencial: true, orden: 3 },
		{ ...base, sobre_id: idDemo(6, 4), nombre: 'Actividades de los hijos', categoria: 'educacion', monto: 45_000, periodo: 'mes', esencial: true, orden: 4 },
		{ ...base, sobre_id: idDemo(6, 5), nombre: 'Respiros', categoria: 'restaurantes_delivery', monto: 30_000, periodo: 'semana', esencial: false, orden: 5 }
	];
}

function anotacionesDemo(hoy: string): Anotacion[] {
	const lunes = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7));
	const dia = (atras: number) => (sumarDias(hoy, -atras) < lunes ? lunes : sumarDias(hoy, -atras));
	const a = (n: number, sobre: number, atras: number, monto: number, nota: string | null, medio: Anotacion['medio']): Anotacion => ({
		anotacion_id: idDemo(5, n),
		sobre_id: idDemo(6, sobre),
		fecha: dia(atras),
		monto,
		nota,
		medio,
		movimiento_id: null,
		creado: `${dia(atras)}T12:0${n}:00-03:00`
	});
	return [
		a(1, 1, 2, 38_500, 'Compra de la semana', 'debito'),
		a(2, 2, 1, 20_000, null, 'debito'),
		a(3, 5, 1, 8_900, 'Café y pan', 'efectivo'),
		a(4, 3, 3, 25_000, 'Consulta', 'debito')
	];
}

function comprasDemo(hoy: string): Compra[] {
	const item = (n: number, nombre: string, cantidad: number, precio: number) => ({ item_id: idDemo(8, n), nombre, cantidad, precio });
	return [
		{
			compra_id: idDemo(9, 1),
			sobre_id: idDemo(6, 1),
			lugar: 'Supermercado del barrio',
			abierta: false,
			creada: `${sumarDias(hoy, -2)}T11:00:00-03:00`,
			cerrada: `${sumarDias(hoy, -2)}T11:40:00-03:00`,
			creado_por: PAREJA_ID,
			items: [
				item(1, 'Leche', 6, 1_090),
				item(2, 'Pan', 1, 2_400),
				item(3, 'Arroz', 2, 1_590),
				item(4, 'Pollo', 1, 6_990),
				item(5, 'Detergente', 1, 8_490),
				item(6, 'Fruta y verdura', 1, 9_800)
			]
		}
	];
}

// Límites derivados del consumo del mes para mostrar los cuatro tipos y todos los estados
function presupuestosDemo(hoy: string, gastoDiario: GastoDiario[], movimientos: Movimiento[]): Presupuesto[] {
	const mes = mesDe(hoy);
	const factor = diasEnMes(mes) / Number(hoy.slice(8));
	const gasto = (cat?: string) =>
		gastoDiario.filter((g) => mesDe(g.fecha) === mes && (!cat || g.categoria === cat)).reduce((s, g) => s + g.monto_gasto, 0);
	const limite = (consumido: number, razon: number) => Math.max(10_000, Math.round(consumido / razon / 1000) * 1000);
	const holgado = Math.min(0.6, 0.7 / factor);
	const pronostico: { razon: number; umbrales: number[] } =
		1 / factor < 0.8
			? { razon: (1 / factor + 0.8) / 2, umbrales: [80, 100] }
			: factor > 1
				? { razon: (1 / factor + 1) / 2, umbrales: [100] }
				: { razon: 0.7, umbrales: [80, 100] };
	const comprasMes = movimientos.some((m) => m.cuota_actual === 1 && (m.cuotas_total ?? 0) > 1 && mesDe(m.fecha_imputacion) === mes);
	const id = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
	const base = { mes: null, porcentaje_limite: null, umbrales: [80, 100], alerta_pronostico: true };
	return [
		{ ...base, presupuesto_id: id(1), tipo: 'total', categoria: null, monto_limite: limite(gasto(), pronostico.razon), umbrales: pronostico.umbrales },
		{ ...base, presupuesto_id: id(2), tipo: 'compras_credito', categoria: null, monto_limite: comprasMes ? 400_000 : 1_500_000 },
		{ ...base, presupuesto_id: id(3), tipo: 'carga_cuotas', categoria: null, monto_limite: null, porcentaje_limite: 35 },
		{ ...base, presupuesto_id: id(4), tipo: 'categoria', categoria: 'supermercado', monto_limite: limite(gasto('supermercado'), holgado) },
		{ ...base, presupuesto_id: id(5), tipo: 'categoria', categoria: 'restaurantes_delivery', monto_limite: limite(gasto('restaurantes_delivery'), holgado) },
		{ ...base, presupuesto_id: id(6), tipo: 'categoria', categoria: 'restaurantes_delivery', mes, monto_limite: limite(gasto('restaurantes_delivery'), 0.88) },
		{ ...base, presupuesto_id: id(7), tipo: 'categoria', categoria: 'combustible_auto', monto_limite: limite(gasto('combustible_auto'), 1.25) },
		{ ...base, presupuesto_id: id(8), tipo: 'categoria', categoria: 'transporte', monto_limite: limite(gasto('transporte'), holgado), alerta_pronostico: false },
		{ ...base, presupuesto_id: id(9), tipo: 'categoria', categoria: 'entretenimiento_suscripciones', monto_limite: limite(gasto('entretenimiento_suscripciones'), holgado), umbrales: [50, 80, 100] }
	];
}

// Datos sintéticos con la forma del contrato; nunca datos reales
import type {
	DeudaCuotaMes,
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
} from '@/datos/tipos';
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
} from '@/lib/fechas';

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
}

const USUARIO_ID = '00000000-0000-4000-8000-000000000001';
const VALOR_UF = 40_250;

interface Prod {
	banco: string;
	producto_tipo: ProductoTipo;
	producto_nombre: string;
}

const CC: Prod = { banco: 'santander', producto_tipo: 'cuenta', producto_nombre: 'Cuenta Corriente' };
const BCI_CC: Prod = { banco: 'bci', producto_tipo: 'cuenta', producto_nombre: 'Cuenta Corriente' };
const VISA: Prod = { banco: 'santander', producto_tipo: 'tarjeta', producto_nombre: 'Visa Oro Banco Demo' };
const CMR: Prod = { banco: 'falabella', producto_tipo: 'tarjeta', producto_nombre: 'Mastercard Tienda Demo' };
const LINEA: Prod = { banco: 'santander', producto_tipo: 'linea', producto_nombre: 'Línea de Crédito' };

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
		cuotas?: { total: number; actual: number; compra: number; imputacion: string },
		imputacionSueldo?: string
	) {
		const imputacion = cuotas?.imputacion ?? imputacionSueldo ?? fecha;
		if ((imputacion > hoy && !imputacionSueldo) || imputacion < inicio || fecha > hoy) return;
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
		[5, 9, VISA, 'LATAM Airlines', 'viajes', 642_000, 6],
		[4, 21, CMR, 'Falabella.com', 'hogar', 549_990, 10],
		[3, 12, CMR, 'Paris', 'vestuario', 119_990, 3],
		[2, 6, VISA, 'Sky Airline', 'viajes', 238_400, 4],
		[1, 14, VISA, 'Apple Store', 'tecnologia', 1_199_990, 12],
		[1, 25, CMR, 'Sodimac', 'hogar', 329_990, 6],
		[0, 4, CMR, 'Taller Automotriz Ñuñoa', 'combustible_auto', 486_000, 3],
		[0, 8, CMR, 'Falabella.com', 'hogar', 789_990, 12],
		[0, 19, VISA, 'Ripley.com', 'vestuario', 259_990, 6]
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

	const dividendoUf = 12.5;
	const dividendoClp = Math.round(dividendoUf * VALOR_UF);
	const cuotaConsumo = 189_450;
	const personas = ['Persona 3f2a', 'Persona 9c41', 'Persona b7e0', 'Persona 51dd'];

	// El sueldo llega el último día hábil; desde el día 25 financia el mes siguiente (hace dos meses llegó a una cuenta no conectada)
	const sueldo = (f: string) => {
		const imputacion = Number(f.slice(8)) >= 25 ? sumarMeses(mesDe(f), 1) : f;
		if (mesDe(imputacion) === sumarMeses(mesHoy, -2)) return;
		mov(f, CC, 'REMUNERACION EMPRESA ANDES SPA', null, 'ingresos_sueldo', 'ingreso', 2_450_000, undefined, imputacion);
	};
	sueldo(ultimoDiaHabil(sumarMeses(inicio, -1)));

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
		if (d === 2) mov(f, CC, 'TRASPASO A CTA BCI *******', null, 'transferencia_interna', 'transferencia_interna', -150_000);
		if (d === 2) mov(f, BCI_CC, 'TRASPASO DESDE CTA *******', null, 'transferencia_interna', 'transferencia_interna', 150_000);
		if (d === 3) mov(f, VISA, 'SPOTIFY P1F2A9C', 'Spotify', 'entretenimiento_suscripciones', 'gasto', -6_990);
		if (d === 5) {
			mov(f, CC, 'PAGO GASTOS COMUNES EDIFICIO', 'Gastos comunes', 'vivienda_servicios', 'gasto', -entre(118_000, 136_000));
			mov(f, CC, 'PAC DIVIDENDO CREDITO HIPOTECARIO *****', 'BCI Hipotecario', 'vivienda_servicios', 'gasto', -dividendoClp);
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
		if (d === 15) {
			const previo = gastoTarjetaMes.get(`${CMR.producto_nombre}|${sumarMeses(mes, -1)}`);
			if (previo) {
				mov(f, CC, 'PAGO TARJETA CMR ************', 'CMR Falabella', 'pago_tarjeta_credito', 'pago_deuda', -previo);
				mov(f, CMR, 'PAGO RECIBIDO GRACIAS', null, 'pago_tarjeta_credito', 'transferencia_interna', previo);
			}
		}
		if (d === 18) mov(f, VISA, 'HDI SEGUROS AUTO', 'HDI Seguros', 'seguros', 'gasto', -32_400);
		if (d === 20) {
			const previo = gastoTarjetaMes.get(`${VISA.producto_nombre}|${sumarMeses(mes, -1)}`);
			if (previo) {
				mov(f, CC, 'PAGO TARJETA VISA ************', 'Santander', 'pago_tarjeta_credito', 'pago_deuda', -previo);
				mov(f, VISA, 'MONTO CANCELADO', null, 'pago_tarjeta_credito', 'transferencia_interna', previo);
			}
		}
		if (d === 22) mov(f, VISA, 'AUTOPASE TAG', 'Autopase', 'transporte', 'gasto', -entre(16_000, 31_000));
		if (d === 23) mov(f, CC, 'IMPUESTO TIMBRES Y ESTAMPILLAS', null, 'intereses_comisiones_impuestos', 'interes_comision', -entre(900, 2_400));
		if (f === ultimoDiaHabil(mes)) sueldo(f);
		if (d === 12 && mes === sumarMeses(mesHoy, -2)) mov(f, CC, 'TRANSF. RECIBIDA VENTA MARKETPLACE', null, 'ingresos_otros', 'ingreso', 85_000);
		if (d === 16 && (Number(mes.slice(5, 7)) % 2 === 0)) mov(f, BCI_CC, 'CONSULTA MEDICA CLINICA', 'Clínica Santa María', 'salud', 'gasto', -45_000);

		// Variables
		const super_ = finde ? 0.55 : 0.28;
		if (r() < super_) {
			const [nombre, tarjeta] = elegir<[string, Prod]>([
				['Líder', VISA], ['Jumbo', VISA], ['Unimarc', CC], ['Tottus', CMR], ['Santa Isabel', CC], ['Tottus', CMR]
			]);
			const monto = finde ? entre(38_000, 96_000) : entre(6_500, 32_000);
			mov(f, tarjeta, `${nombre.toUpperCase()} ${elegir(['PROVIDENCIA', 'ÑUÑOA', 'LAS CONDES', 'LA REINA'])}`, nombre, 'supermercado', 'gasto', -monto);
		}
		if (r() < (finde ? 0.45 : 0.22)) {
			const nombre = elegir(['Rappi', 'PedidosYa', 'Uber Eats', 'Starbucks', 'Juan Maestro', 'Dominó', 'Tanta']);
			mov(f, elegir([VISA, VISA, CMR, CC]), nombre.toUpperCase(), nombre, 'restaurantes_delivery', 'gasto', -entre(5_900, 29_000));
		}
		if (r() < (finde ? 0.3 : 0.38)) {
			const nombre = elegir(['Uber', 'Uber', 'Cabify', 'DiDi']);
			mov(f, VISA, `${nombre.toUpperCase()} *TRIP`, nombre, 'transporte', 'gasto', -entre(3_400, 12_800));
		}
		if (diaSemana(f) === 1) mov(f, CC, 'CARGA TARJETA BIP!', 'Red Metropolitana', 'transporte', 'gasto', -10_000);
		if (r() < 0.12) {
			const nombre = elegir(['Copec', 'Shell', 'Aramco', 'Copec']);
			mov(f, elegir([VISA, CMR]), `${nombre.toUpperCase()} ESTACION`, nombre, 'combustible_auto', 'gasto', -entre(24_000, 56_000));
		}
		if (r() < 0.07) {
			const nombre = elegir(['Cruz Verde', 'Salcobrand', 'Farmacias Ahumada']);
			mov(f, elegir([CC, VISA]), nombre.toUpperCase(), nombre, 'salud', 'gasto', -entre(4_800, 34_000));
		}
		if (r() < 0.035) {
			const nombre = elegir(['H&M', 'Zara', 'Falabella', 'Paris']);
			mov(f, CMR, nombre.toUpperCase(), nombre, 'vestuario', 'gasto', -entre(14_990, 69_990));
		}
		if (r() < 0.035) {
			const nombre = elegir(['Sodimac', 'Easy', 'IKEA']);
			mov(f, CMR, nombre.toUpperCase(), nombre, 'hogar', 'gasto', -entre(7_990, 58_000));
		}
		if (r() < 0.03) mov(f, VISA, 'SUPERZOO', 'Superzoo', 'mascotas', 'gasto', -entre(12_000, 46_000));
		if (r() < 0.04) mov(f, CC, `TRANSF. A ${elegir(personas)}`, null, 'transferencias_personas', 'gasto', -entre(10_000, 60_000));
		if (r() < 0.025) mov(f, CC, elegir(['TRANSF. RECIBIDA VENTA MARKETPLACE', 'DEVOLUCION COMPRA']), null, 'ingresos_otros', 'ingreso', entre(18_000, 120_000));
		if (r() < 0.03) mov(f, BCI_CC, elegir(['PANADERIA LA ESPIGA', 'FERIA LIBRE']), null, 'supermercado', 'gasto', -entre(3_000, 14_000));

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
	const tarjeta = (p: Prod, cupo: number, venc: number, tasa: number, cae: number): DeudaProducto => {
		const pendientePago = proximoDia(venc) > conDia(mesHoy, venc) ? 0 : facturadoPrevio(p);
		const usado = noFacturado(p) + futuras(p) + pendientePago;
		return {
			banco: p.banco, tipo: 'tarjeta', nombre: p.producto_nombre, moneda: 'CLP',
			cupo_total: cupo, usado, disponible: cupo - usado, saldo_deuda: usado,
			valor_cuota: null, cuotas_pagadas: null, cuotas_total: null, fecha_termino: null,
			proximo_vencimiento: proximoDia(venc),
			pago_minimo: Math.round(Math.max(pendientePago, noFacturado(p)) * 0.05 / 10) * 10,
			tasa_mensual: tasa, cae, saldo_deuda_clp: usado, actualizado
		};
	};
	const pagadasConsumo = 24 + 5;
	const pagadasHipo = 63 + 5;
	const saldoUf = 2_846.31 - 5 * 7.4;
	const deudas: DeudaProducto[] = [
		tarjeta(CMR, 2_800_000, 15, 2.79, 39.6),
		tarjeta(VISA, 4_000_000, 20, 2.35, 33.1),
		{
			banco: LINEA.banco, tipo: 'linea', nombre: LINEA.producto_nombre, moneda: 'CLP',
			cupo_total: 1_000_000, usado: 215_000, disponible: 785_000, saldo_deuda: 215_000,
			valor_cuota: null, cuotas_pagadas: null, cuotas_total: null, fecha_termino: null,
			proximo_vencimiento: null, pago_minimo: null, tasa_mensual: 1.95, cae: 26.4,
			saldo_deuda_clp: 215_000, actualizado
		},
		{
			banco: 'santander', tipo: 'consumo', nombre: 'Crédito de Consumo', moneda: 'CLP',
			cupo_total: null, usado: null, disponible: null,
			saldo_deuda: cuotaConsumo * (36 - pagadasConsumo) - 412_300,
			valor_cuota: cuotaConsumo, cuotas_pagadas: pagadasConsumo, cuotas_total: 36,
			fecha_termino: conDia(sumarMeses(mesHoy, 36 - pagadasConsumo), 10),
			proximo_vencimiento: proximoDia(10), pago_minimo: null, tasa_mensual: 1.29, cae: 17.8,
			saldo_deuda_clp: cuotaConsumo * (36 - pagadasConsumo) - 412_300, actualizado
		},
		{
			banco: 'bci', tipo: 'hipotecario', nombre: 'Crédito Hipotecario', moneda: 'UF',
			cupo_total: null, usado: null, disponible: null, saldo_deuda: Math.round(saldoUf * 100) / 100,
			valor_cuota: dividendoUf, cuotas_pagadas: pagadasHipo, cuotas_total: 300,
			fecha_termino: conDia(sumarMeses(mesHoy, 300 - pagadasHipo), 5),
			proximo_vencimiento: proximoDia(5), pago_minimo: null, tasa_mensual: 0.36, cae: 4.85,
			saldo_deuda_clp: Math.round(saldoUf * VALOR_UF), actualizado
		}
	];

	// deuda_cuota_mes: 5 meses atrás a 12 adelante; la cuota de tarjeta se paga el mes siguiente a su imputación
	const cuotas: DeudaCuotaMes[] = [];
	for (let i = -5; i <= 12; i++) {
		const mes = sumarMeses(mesHoy, i);
		for (const p of [CMR, VISA]) {
			const facturacion = cuotasPorMes
				.filter((c) => c.prod === p && c.mes === sumarMeses(mes, -1))
				.reduce((s, c) => s + c.monto, 0);
			if (facturacion > 0) cuotas.push({ mes, banco: p.banco, tipo: 'tarjeta', nombre: p.producto_nombre, monto: facturacion });
		}
		if (i <= 36 - pagadasConsumo) cuotas.push({ mes, banco: 'santander', tipo: 'consumo', nombre: 'Crédito de Consumo', monto: cuotaConsumo });
		cuotas.push({ mes, banco: 'bci', tipo: 'hipotecario', nombre: 'Crédito Hipotecario', monto: dividendoClp });
	}

	// saldo_cuenta
	const sumaCuenta = (p: Prod) =>
		movimientos.filter((m) => m.banco === p.banco && m.producto_nombre === p.producto_nombre && m.producto_tipo === 'cuenta').reduce((s, m) => s + m.monto, 0);
	const saldos: SaldoCuenta[] = [
		{ banco: 'santander', producto_nombre: CC.producto_nombre, saldo_disponible: Math.max(184_320, 2_140_000 + sumaCuenta(CC)), actualizado },
		{ banco: 'bci', producto_nombre: BCI_CC.producto_nombre, saldo_disponible: 96_450 + sumaCuenta(BCI_CC), actualizado }
	];

	const presupuestos = presupuestosDemo(hoy, gastoDiario, movimientos);

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
		perfil: null
	};
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

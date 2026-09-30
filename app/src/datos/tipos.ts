// Formas del contrato de presentación (esquema finanzas)

export type Banco = 'santander' | 'falabella' | 'bci' | (string & {});
export type ProductoTipo = 'cuenta' | 'tarjeta' | 'linea';
export type TipoFlujo = 'ingreso' | 'gasto' | 'transferencia_interna' | 'pago_deuda' | 'interes_comision';
export type EstadoMovimiento = 'contable' | 'no_facturado' | 'facturado' | 'pendiente';
export type TipoDeuda = 'tarjeta' | 'linea' | 'consumo' | 'hipotecario';

export interface Usuario {
	usuario_id: string;
	nombre_visible: string | null;
}

export interface Movimiento {
	usuario_id: string;
	movimiento_id: string;
	fecha: string;
	fecha_imputacion: string;
	banco: Banco;
	producto_tipo: ProductoTipo;
	producto_nombre: string;
	glosa: string;
	comercio: string | null;
	categoria: string;
	tipo_flujo: TipoFlujo;
	monto: number;
	monto_total_compra: number | null;
	cuota_actual: number | null;
	cuotas_total: number | null;
	estado: EstadoMovimiento;
}

export interface GastoDiario {
	fecha: string;
	categoria: string;
	monto_gasto: number;
	cantidad: number;
}

export interface ResumenMensual {
	mes: string;
	ingresos: number;
	gastos: number;
	pagos_deuda: number;
	intereses_comisiones: number;
	flujo_neto: number;
	flujo_proyectado_cierre: number;
	alerta_negativo: boolean;
	meses_completos: boolean;
}

export interface DeudaProducto {
	banco: Banco;
	tipo: TipoDeuda;
	nombre: string;
	moneda: 'CLP' | 'UF';
	cupo_total: number | null;
	usado: number | null;
	disponible: number | null;
	saldo_deuda: number | null;
	valor_cuota: number | null;
	cuotas_pagadas: number | null;
	cuotas_total: number | null;
	fecha_termino: string | null;
	proximo_vencimiento: string | null;
	pago_minimo: number | null;
	tasa_mensual: number | null;
	cae: number | null;
	saldo_deuda_clp: number | null;
	actualizado: string | null;
}

export interface DeudaCuotaMes {
	mes: string;
	banco: Banco;
	tipo: TipoDeuda;
	nombre: string;
	monto: number;
}

export interface SaldoCuenta {
	banco: Banco;
	producto_nombre: string;
	saldo_disponible: number;
	actualizado: string | null;
}

export interface Publicacion {
	tabla: string;
	publicado_en: string;
	filas: number;
}

export type TipoPresupuesto = 'categoria' | 'total' | 'compras_credito' | 'carga_cuotas';
export type EstadoAlerta = 'ok' | 'aviso' | 'excedido' | 'pronostico_excede';

// mes nulo = recurrente; con mes, solo ese mes y con prioridad sobre el recurrente
export interface Presupuesto {
	presupuesto_id: string;
	tipo: TipoPresupuesto;
	categoria: string | null;
	mes: string | null;
	monto_limite: number | null;
	porcentaje_limite: number | null;
	umbrales: number[];
	alerta_pronostico: boolean;
}

export type PresupuestoEntrada = Omit<Presupuesto, 'presupuesto_id'> & { presupuesto_id: string | null };

// limite y consumido en CLP, salvo carga_cuotas (% del ingreso)
export interface EstadoPresupuesto {
	presupuesto_id: string;
	tipo: TipoPresupuesto;
	categoria: string | null;
	mes: string;
	recurrente: boolean;
	limite: number;
	consumido: number | null;
	porcentaje: number | null;
	proyectado_cierre: number | null;
	umbral_cruzado: number | null;
	excede_pronostico: boolean;
	estado: EstadoAlerta;
	umbrales: number[];
	alerta_pronostico: boolean;
	monto_limite: number | null;
	porcentaje_limite: number | null;
	cantidad: number | null;
	cuotas_mes: number | null;
	ingreso_referencia: number | null;
}

export interface PresupuestoSugerido {
	tipo: TipoPresupuesto;
	categoria: string | null;
	monto_sugerido: number | null;
	porcentaje_sugerido: number | null;
	meses_base: number | null;
}

export interface CreditoMes {
	mes: string;
	compras_cuotas_monto: number;
	compras_cuotas_cantidad: number;
	cuotas_mes: number;
	ingreso_referencia: number | null;
	carga_porcentaje: number | null;
}

export interface Perfil {
	ingreso_mensual_neto: number | null;
	dia_pago: number | null;
	meta_ahorro_mensual: number;
	tope_carga_cuotas_pct: number;
	actualizado: string | null;
}

export type PerfilEntrada = Omit<Perfil, 'actualizado'>;

export interface PlanAjuste {
	mes: string;
	en_curso: boolean;
	ingreso_referencia: number | null;
	ingreso_declarado: boolean;
	ingreso_detectado: number | null;
	compromisos: number;
	gastos_fijos: number;
	meta_ahorro: number;
	disponible_variable: number | null;
	gasto_variable_mes: number;
	restante_variable: number | null;
	gasto_variable_promedio: number;
	esenciales_objetivo: number;
	alcanza_esenciales: boolean | null;
	compromisos_mes_siguiente: number;
	carga_mes_siguiente_pct: number | null;
	tope_carga_cuotas_pct: number;
	compras_credito_sugerido: number | null;
}

export interface PlanCategoria {
	mes: string;
	categoria: string;
	esencial: boolean;
	promedio: number;
	gastado_mes: number;
	limite_sugerido: number;
	recorte: number;
	recorte_pct: number;
	comprometido: number;
	limite_alerta: number;
}

export interface LiberacionCuota {
	mes: string;
	compromisos: number;
	ingreso_referencia: number | null;
	carga_pct: number | null;
	tope_carga_cuotas_pct: number;
	bajo_tope: boolean | null;
	mes_bajo_tope: string | null;
}

export interface Producto {
	banco: Banco;
	producto_tipo: ProductoTipo;
	producto_nombre: string;
}

export interface FiltroMovimientos {
	desde?: string;
	hasta?: string;
	banco?: string;
	producto?: string;
	categoria?: string;
	tipo_flujo?: string;
	estado?: string;
	texto?: string;
	limite?: number;
	desplazamiento?: number;
}

export interface PaginaMovimientos {
	filas: Movimiento[];
	total: number;
}

// desde/hasta filtran por fecha_imputacion
// Capa única de acceso a datos: implementaciones Supabase y demo
export interface FuenteDatos {
	usuario(): Promise<Usuario | null>;
	resumenMensual(desde: string, hasta: string): Promise<ResumenMensual[]>;
	gastoDiario(desde: string, hasta: string): Promise<GastoDiario[]>;
	movimientos(filtro: FiltroMovimientos): Promise<PaginaMovimientos>;
	productos(): Promise<Producto[]>;
	deudas(): Promise<DeudaProducto[]>;
	cuotasMes(desde: string, hasta: string): Promise<DeudaCuotaMes[]>;
	saldos(): Promise<SaldoCuenta[]>;
	publicaciones(): Promise<Publicacion[]>;
	presupuestos(): Promise<Presupuesto[]>;
	guardarPresupuesto(p: PresupuestoEntrada): Promise<void>;
	borrarPresupuesto(presupuestoId: string): Promise<void>;
	estadoPresupuestos(mes: string): Promise<EstadoPresupuesto[]>;
	presupuestosSugeridos(): Promise<PresupuestoSugerido[]>;
	creditoMes(mes: string): Promise<CreditoMes | null>;
	perfil(): Promise<Perfil | null>;
	guardarPerfil(p: PerfilEntrada): Promise<void>;
	planAjuste(): Promise<PlanAjuste[]>;
	planCategorias(): Promise<PlanCategoria[]>;
	liberacionCuotas(): Promise<LiberacionCuota[]>;
}

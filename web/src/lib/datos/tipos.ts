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

export type RolHogar = 'solo' | 'titular' | 'miembro';

export interface PersonaHogar {
	usuario_id: string;
	nombre: string | null;
}

// Hogar compartido: el titular es dueño de los datos; los miembros ven lo compartido y anotan
export interface Hogar {
	rol: RolHogar;
	hogar_id: string | null;
	yo: PersonaHogar | null;
	titular: PersonaHogar | null;
	miembros: PersonaHogar[];
	/** correos invitados que aún no entran (solo los ve el titular) */
	invitaciones: string[];
}

export type EstadoActualizacion = 'pendiente' | 'corriendo' | 'ok' | 'parcial' | 'error';

// Pedido de actualización que atiende el equipo donde corren los extractores
export interface Actualizacion {
	solicitud_id: string;
	origen: 'app' | 'programada';
	estado: EstadoActualizacion;
	/** paso → 'corriendo' | 'ok' | motivo del error (santander, falabella, bci, carga, publicacion) */
	pasos: Record<string, string>;
	detalle: string | null;
	creada: string;
	iniciada: string | null;
	terminada: string | null;
}

export interface PartidaBalance {
	lado: 'activo' | 'pasivo';
	tipo: string;
	entidad: string;
	nombre: string;
	monto: number;
}

export interface FotoBalance {
	fecha: string;
	activos: number;
	pasivos: number;
}

export interface ResultadoMes {
	mes: string;
	tipo_flujo: 'ingreso' | 'gasto' | 'interes_comision';
	categoria: string;
	monto: number;
	cantidad: number;
}

export interface FilaLibro {
	movimiento_id: string;
	fecha: string;
	glosa: string | null;
	comercio: string | null;
	categoria: string;
	estado: string;
	abono: number;
	cargo: number;
	/** saldo después del movimiento; solo en cuentas */
	saldo: number | null;
}

export interface Conciliacion {
	ambito: 'carga' | 'tarjeta' | 'caja' | 'saldo';
	sujeto: string;
	detalle: string;
	/** null = no se pudo evaluar */
	cuadra: boolean | null;
	revisado: string | null;
}

export interface ProductoCompartido {
	banco: string;
	producto_nombre: string;
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
	// Columnas de facturación (migración de caja); pueden faltar en bases anteriores
	monto_facturado?: number | null;
	fecha_facturacion?: string | null;
	monto_pagado?: number | null;
	monto_por_facturar?: number | null;
	fecha_proxima_facturacion?: string | null;
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

export type TipoPresupuesto = 'categoria' | 'total' | 'compras_credito' | 'carga_cuotas' | 'tope_tarjeta';
export type EstadoAlerta = 'ok' | 'aviso' | 'excedido' | 'pronostico_excede';

// mes nulo = recurrente; con mes, solo ese mes y con prioridad sobre el recurrente
export interface Presupuesto {
	presupuesto_id: string;
	tipo: TipoPresupuesto;
	categoria: string | null;
	producto?: string | null;
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

export type GrupoCaja =
	| 'sueldo'
	| 'otros_ingresos'
	| 'vivienda_servicios'
	| 'pago_tarjetas'
	| 'pago_creditos'
	| 'transferencias_personas'
	| 'traspasos_propios'
	| 'gasto_debito'
	| 'intereses_comisiones'
	| 'sin_categoria';

export interface CajaCiclo {
	ciclo: string;
	ciclo_inicio: string;
	ciclo_fin: string;
	grupo: GrupoCaja;
	entradas: number;
	salidas: number;
	cantidad: number;
}

export interface CajaResumen {
	ciclo: string;
	ciclo_inicio: string;
	ciclo_fin: string;
	entradas: number;
	salidas: number;
	neto: number;
	saldo_hoy: number | null;
	comprometido_proximo: number | null;
	disponible_para_vivir: number | null;
	proximo_sueldo: string | null;
	datos_completos: boolean;
	alerta_tarjeta_con_linea?: boolean | null;
	monto_tarjeta_con_linea?: number | null;
}

export type OrigenCompromiso = 'tarjeta' | 'linea' | 'credito' | 'dividendo' | 'pago_fijo' | 'deuda_manual';

export interface LoQueViene {
	fecha: string | null;
	origen: OrigenCompromiso | (string & {});
	nombre: string;
	detalle: string | null;
	monto: number;
	/** mínimo de la tarjeta, si el monto es el total facturado */
	monto_minimo: number | null;
	disponible_para_vivir_ajustado: number | null;
}

export interface PagoFijo {
	pago_fijo_id: string;
	nombre: string;
	categoria: string;
	monto: number;
	dia_vencimiento: number;
	desde: string;
	hasta: string | null;
	meses_pausa: number[];
	activo: boolean;
}

export type PagoFijoEntrada = Omit<PagoFijo, 'pago_fijo_id'> & { pago_fijo_id: string | null };

export type TipoDeudaManual = 'tarjeta' | 'consumo' | 'automotriz' | 'educacion' | 'otro';

export interface DeudaManual {
	deuda_manual_id: string;
	nombre: string;
	acreedor: string | null;
	tipo: TipoDeudaManual;
	saldo: number;
	tasa_mensual: number | null;
	cuota_minima: number | null;
	cuota_fija: number | null;
	cuotas_restantes: number | null;
	dia_pago: number | null;
	proximo_pago: string | null;
	activo: boolean;
}

export type DeudaManualEntrada = Omit<DeudaManual, 'deuda_manual_id'> & { deuda_manual_id: string | null };

// Unión de deudas del banco y manuales (vista deudas_todas)
export interface DeudaTodas {
	clave: string;
	origen: 'banco' | 'manual';
	deuda_manual_id: string | null;
	nombre: string;
	acreedor: string;
	tipo: string;
	saldo_clp: number;
	tasa_mensual: number | null;
	cuota_minima: number | null;
	cuota_fija: number | null;
	cuotas_restantes: number | null;
	proximo_pago: string | null;
}

export type PeriodoSobre = 'semana' | 'mes';
export type MedioPago = 'debito' | 'credito' | 'efectivo' | 'otro';

export interface Sobre {
	sobre_id: string;
	nombre: string;
	categoria: string;
	monto: number;
	periodo: PeriodoSobre;
	esencial: boolean;
	orden: number;
	activo: boolean;
}

export type SobreEntrada = Omit<Sobre, 'sobre_id'> & { sobre_id: string | null };

export interface Anotacion {
	anotacion_id: string;
	sobre_id: string;
	fecha: string;
	monto: number;
	nota: string | null;
	medio: MedioPago;
	movimiento_id: string | null;
	creado?: string | null;
}

export type AnotacionEntrada = Omit<Anotacion, 'anotacion_id' | 'creado'>;

// Por sobre y período en curso (vista estado_sobre)
export interface EstadoSobre {
	sobre_id: string;
	periodo_inicio: string;
	periodo_fin: string;
	anotado: number;
	disponible: number;
	porcentaje: number | null;
	dias_restantes: number;
	sin_anotar: number;
}

export type EstadoPago = 'pagado' | 'minimo' | 'pendiente';

// Pagos del ciclo de sueldo en curso y del siguiente (vista pagos_ciclo)
export interface PagoCiclo {
	ciclo: string;
	ciclo_inicio: string;
	ciclo_fin: string;
	en_curso: boolean;
	clave: string;
	origen: OrigenCompromiso | (string & {});
	nombre: string;
	acreedor: string | null;
	fecha: string | null;
	monto: number;
	monto_minimo: number | null;
	pagado_banco: number;
	/** se detecta con los movimientos del banco */
	automatico: boolean;
	estimado: boolean;
	/** true/false si se marcó a mano; null si no */
	marcado: boolean | null;
	estado: EstadoPago;
	por_pagar: number;
	por_pagar_minimo: number;
	/** lo que sale de la caja del ciclo por este pago */
	comprometido: number;
}

export interface CompraItem {
	item_id: string;
	nombre: string;
	cantidad: number;
	precio: number;
}

export interface Compra {
	compra_id: string;
	sobre_id: string;
	lugar: string;
	abierta: boolean;
	creada: string;
	cerrada: string | null;
	/** quién abrió la compra; null en compras anteriores al hogar */
	creado_por: string | null;
	items: CompraItem[];
}

export interface ItemFrecuente {
	nombre: string;
	precio: number;
	veces: number;
}

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
	// null = la tabla o vista todavía no existe en la base
	cajaResumen(): Promise<CajaResumen[] | null>;
	cajaCiclo(desde: string): Promise<CajaCiclo[] | null>;
	loQueViene(): Promise<LoQueViene[] | null>;
	deudasTodas(): Promise<DeudaTodas[] | null>;
	pagosFijos(): Promise<PagoFijo[] | null>;
	guardarPagoFijo(p: PagoFijoEntrada): Promise<void>;
	borrarPagoFijo(id: string): Promise<void>;
	deudasManuales(): Promise<DeudaManual[] | null>;
	guardarDeudaManual(d: DeudaManualEntrada): Promise<void>;
	borrarDeudaManual(id: string): Promise<void>;
	sobres(): Promise<Sobre[] | null>;
	guardarSobre(s: SobreEntrada): Promise<void>;
	borrarSobre(id: string): Promise<void>;
	anotaciones(desde: string, hasta: string): Promise<Anotacion[] | null>;
	guardarAnotacion(a: AnotacionEntrada): Promise<string>;
	borrarAnotacion(id: string): Promise<void>;
	estadoSobres(): Promise<EstadoSobre[] | null>;
	pagosCiclo(): Promise<PagoCiclo[] | null>;
	/** null borra la marca y vuelve a la detección automática */
	marcarPago(ciclo: string, clave: string, pagado: boolean | null): Promise<void>;
	compras(desde: string): Promise<Compra[] | null>;
	crearCompra(sobreId: string, lugar: string): Promise<string>;
	agregarItem(compraId: string, item: Omit<CompraItem, 'item_id'>): Promise<void>;
	borrarItem(itemId: string): Promise<void>;
	cerrarCompra(compraId: string, medio: MedioPago): Promise<void>;
	descartarCompra(compraId: string): Promise<void>;
	itemsFrecuentes(): Promise<ItemFrecuente[]>;
	miHogar(): Promise<Hogar>;
	/** Si el correo con que entró tiene invitación, lo une al hogar; true si quedó vinculado */
	aceptarInvitacion(): Promise<boolean>;
	invitar(email: string): Promise<void>;
	cancelarInvitacion(email: string): Promise<void>;
	quitarMiembro(usuarioId: string): Promise<void>;
	compartidos(): Promise<ProductoCompartido[] | null>;
	guardarCompartidos(lista: ProductoCompartido[]): Promise<void>;
	ultimaActualizacion(): Promise<Actualizacion | null>;
	pedirActualizacion(): Promise<void>;
	balanceActual(): Promise<PartidaBalance[] | null>;
	fotosBalance(): Promise<FotoBalance[] | null>;
	resultadoMensual(desde: string): Promise<ResultadoMes[] | null>;
	libro(banco: string, producto: string, limite: number): Promise<FilaLibro[] | null>;
	conciliacion(): Promise<Conciliacion[] | null>;
}

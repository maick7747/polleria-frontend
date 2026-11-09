export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiList<T> {
  data: T[];
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
    total_alertas?: number;
    total_insumos?: number;
    total_ok?: number;
    total_bajo?: number;
    total_critico?: number;
    valor_inventario?: number;
    prioritarios?: number;
    sla_min?: number;
    total_activos?: number;
    categorias?: { nombre: string; total: number }[];
    margen_promedio?: number;
    food_cost_promedio?: number;
    costo_promedio?: number;
    sobre_30?: number;
    mejor?: { id: number; nombre: string; margen: number; food_cost_pct: number } | null;
    menor?: { id: number; nombre: string; margen: number; food_cost_pct: number } | null;
  };
}

export interface LoginUsuarioDto {
  id: number;
  nombre: string;
  email: string;
  usuario: string;
  telefono: string | null;
  roles: string[];
  permisos: string[];
  activo: boolean;
}

export interface LoginResponseDto {
  token: string;
  token_type: string;
  expires_in: number;
  usuario: LoginUsuarioDto;
  roles: string[];
  permisos: string[];
}

export interface MesaDto {
  id: number;
  numero: number;
  estado: string;
  activa: boolean;
  cuenta_abierta?: CuentaDto | null;
}

export interface DetallePedidoDto {
  id: number;
  pedido_id: number;
  platillo_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;
  estado_preparacion: string;
  fecha_inicio_prep: string | null;
  fecha_listo: string | null;
  platillo_nombre?: string | null;
}

export interface ClienteDto {
  id?: number;
  nombre: string;
  tipo_documento?: string | null;
  numero_documento?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  referencia?: string | null;
}

export interface PedidoDto {
  id: number;
  numero: string;
  fecha_pedido: string;
  canal: string;
  tipo_consumo: string;
  mesa_id: number | null;
  cuenta_id: number | null;
  cliente_id: number | null;
  repartidor_id: number | null;
  usuario_cajero_id: number;
  estado: string;
  estado_pago: string;
  metodo_pago: string | null;
  subtotal: number;
  igv: number;
  total: number;
  comision_plataforma: number;
  costo_delivery: number;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  observaciones: string | null;
  comprobante_tipo: string;
  comprobante_numero: string | null;
  cliente_nombre?: string | null;
  fecha_entrega: string | null;
  detalles?: DetallePedidoDto[];
  idempotente?: boolean;
}

export interface PedidoListoDto {
  id: number;
  numero: string;
  canal: string;
  tipo_consumo: string;
  mesa_numero: number | null;
  cuenta_id: number | null;
  fecha_listo: string | null;
  minutos_esperando: number;
  detalles: DetallePedidoDto[];
}

export interface PagoDto {
  id: number;
  pedido_id: number | null;
  cuenta_id: number | null;
  metodo: string;
  monto: number;
  es_contraentrega: boolean;
  fecha: string;
  usuario_id: number;
}

export interface CuentaResumenDto {
  id: number;
  mesa_id: number;
  estado: string;
  total: number;
  fecha_apertura: string;
  usuario_apertura_id: number;
  usuario_apertura_nombre?: string | null;
  fecha_cierre: string | null;
  usuario_cierre_id: number | null;
  comprobante_tipo: string;
  comprobante_numero: string | null;
  mesa_numero?: number | null;
  cliente_id?: number | null;
  cliente?: ClienteDto | null;
  subtotal?: number;
  igv?: number;
  total_consolidado?: number;
  rondas?: number;
  pedidos?: number[];
}

export interface CuentaDto {
  id: number;
  mesa_id: number;
  estado: string;
  total: number;
  fecha_apertura: string;
  usuario_apertura_id: number;
  usuario_apertura_nombre?: string | null;
  fecha_cierre: string | null;
  usuario_cierre_id: number | null;
  comprobante_tipo: string;
  comprobante_numero: string | null;
  mesa_numero?: number | null;
  cliente_id?: number | null;
  cliente?: ClienteDto | null;
  subtotal?: number;
  igv?: number;
  total_consolidado?: number;
  rondas?: number;
  pedidos?: PedidoDto[];
  pagos?: PagoDto[];
}

export interface ComprobanteDto {
  tipo: string;
  numero: string;
  total: number;
  fecha: string;
}

export interface TableroDto {
  generado_en: string;
  mesas: MesaDto[];
  cuentas: CuentaDto[];
}

export interface CobroResponseDto {
  cuenta: CuentaDto;
  pago: PagoDto;
  comprobante: ComprobanteDto;
  vuelto: number;
}

export interface KdsPedidoDto {
  id: number;
  numero: string;
  canal: string;
  tipo_consumo: string;
  mesa_id?: number | null;
  mesa_numero: number | null;
  cuenta_id?: number | null;
  estado: string;
  estado_pago: string;
  metodo_pago: string | null;
  estado_entrega: string | null;
  prioridad: string;
  subtotal: number;
  igv: number;
  total: number;
  fecha_pedido: string;
  fecha_inicio_prep: string | null;
  fecha_listo: string | null;
  tiempo_min: number;
  sla_min: number;
  prioritario: boolean;
  observaciones: string | null;
  detalles: DetallePedidoDto[];
}

export interface KdsMetaDto {
  total: number;
  prioritarios: number;
  sla_min: number;
  generado_en: string;
}

export interface KdsEstadoLineaDto {
  id: number;
  pedido_id: number;
  platillo_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;
  estado_preparacion: string;
  fecha_inicio_prep: string | null;
  fecha_listo: string | null;
  platillo_nombre: string | null;
}

export interface KdsEstadoResponseDto {
  pedido_id: number;
  pedido_numero: string;
  pedido_estado: string;
  todas_listas: boolean;
  linea: KdsEstadoLineaDto;
}

export interface InsumoDto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad_medida: string;
  stock_actual: number;
  stock_minimo: number;
  umbral_merma_pct: number;
  costo_promedio: number;
  activo: boolean;
}

export interface MovimientoDto {
  id: number;
  insumo_id: number;
  tipo: string;
  cantidad: number;
  stock_resultante: number;
  referencia_tipo: string;
  referencia_id: number | null;
  usuario_id: number;
  observacion: string | null;
  fecha: string;
  insumo?: string | null;
  usuario?: string | null;
}

export interface MovimientoQueryDto {
  page?: number;
  limit?: number;
  tipo?: string;
  insumo_id?: number;
  desde?: string;
  hasta?: string;
  sort?: string;
}

export interface AjusteResponseDto {
  movimientos: MovimientoDto[];
  total: number;
}

export interface CuadreResumenDto {
  total_ventas: number;
  total_gastos: number;
  total_reembolsos: number;
  total_egresos: number;
  monto_esperado: number;
  efectivo_contado: number | null;
  pagos_digitales: number;
  total_real: number | null;
  diferencia: number | null;
  alerta: boolean;
}

export interface CuadreDto {
  id: number;
  fecha: string;
  estado: string;
  fondo_inicial: number;
  usuario_apertura_id: number;
  fecha_apertura: string;
  total_ventas: number;
  total_egresos: number;
  monto_esperado: number;
  efectivo_contado: number | null;
  pagos_digitales: number;
  total_real: number | null;
  diferencia: number | null;
  observaciones: string | null;
  usuario_cierre_id: number | null;
  fecha_cierre: string | null;
  resumen?: CuadreResumenDto;
}

export interface DashboardTopPlatilloDto {
  platillo_id: number;
  platillo: string | null;
  cantidad: number;
  monto: number;
}

export interface DashboardKpisDto {
  ventas: number;
  egresos: number;
  ganancia_neta: number;
  pedidos: number;
  ticket_promedio: number;
  cuentas_abiertas: number;
  mesas_ocupadas: number;
  pedidos_en_cocina: number;
  mermas_pendientes: number;
  devoluciones_pendientes: number;
  alertas_stock: number;
}

export interface DashboardDto {
  fecha: string;
  kpis: DashboardKpisDto;
  top_platillos: DashboardTopPlatilloDto[];
}

export interface ProveedorDto {
  id: number;
  ruc: string;
  razon_social: string;
  contacto_nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  email: string | null;
  activo: boolean;
}

export type EstadoCompraDto = 'ordenada' | 'recibida' | 'cancelada';

export interface CompraDetalleDto {
  id: number;
  compra_id: number;
  insumo_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  insumo: string;
  unidad_medida: string;
}

export interface PagoCompraDto {
  id: number;
  compra_id: number;
  metodo: string;
  monto: number;
  observacion: string | null;
  fecha?: string;
  usuario_id?: number;
}

export interface CompraDto {
  id: number;
  proveedor_id: number;
  fecha: string;
  estado: EstadoCompraDto;
  total: number;
  usuario_id: number;
  notas: string | null;
  fecha_recepcion: string | null;
  creado_en: string;
  motivo_cancelacion: string | null;
  fecha_cancelacion: string | null;
  proveedor: { id: number; ruc: string; razon_social: string } | null;
  items: number;
  detalles?: CompraDetalleDto[];
  pagos?: PagoCompraDto[];
}

export interface SugerenciaCompraDto {
  insumo_id: number;
  codigo: string;
  nombre: string;
  unidad_medida: string;
  stock_actual: number;
  stock_minimo: number;
  cantidad_sugerida: number;
  costo_promedio: number;
}

export interface SugerenciaMetaDto {
  total: number;
  generado_en: string;
  criterio: string;
}

export interface SugerenciaResponseDto {
  data: SugerenciaCompraDto[];
  meta: SugerenciaMetaDto;
}

export interface GastoDto {
  id: number;
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  metodo_pago: string;
  descuenta_caja_chica: boolean;
  comprobante_url: string | null;
  usuario_id: number;
  creado_en: string;
  registrado_por: string | null;
}

export interface GastoResumenCategoriaDto {
  categoria: string;
  registros: number;
  total: number;
}

export interface GastoResumenDto {
  desde: string;
  hasta: string;
  total: number;
  registros: number;
  por_categoria: GastoResumenCategoriaDto[];
}

export interface IngredientePlatoDto {
  insumo_id: number;
  insumo?: string | null;
  cantidad: number;
  unidad_medida?: string | null;
  costo_promedio?: number | null;
}

export interface PlatoDto {
  id: number;
  categoria_id?: number | null;
  nombre: string;
  descripcion?: string | null;
  precio_venta: number;
  activo: boolean;
  categoria?: string | null;
  ingredientes?: IngredientePlatoDto[] | null;
}

export interface ActivoMantenimientoRefDto {
  id: number;
  tipo: string;
  fecha: string;
  estado: string;
}

export interface ActivoDto {
  id: number;
  nombre: string;
  categoria: string;
  cantidad: number;
  costo_adquisicion: number;
  vida_util_meses: number | null;
  fecha_adquisicion: string;
  estado: string;
  fecha_baja?: string | null;
  motivo_baja?: string | null;
  usuario_id?: number;
  proveedor?: string | null;
  garantia_meses?: number | null;
  observaciones?: string | null;
  proximo_mantenimiento?: string | null;
  antiguedad_meses?: number;
  meses_uso?: number;
  edad_meses?: number;
  vida_util_vencida?: boolean;
  mantenimientos?: number;
  ultimo_mantenimiento?: ActivoMantenimientoRefDto | string | null;
}

export interface ActivoAlertaDto {
  activo_id: number;
  activo: string;
  mantenimiento_id?: number;
  tipo: string;
  severidad: string;
  mensaje: string;
}

export interface MantenimientoDto {
  id: number;
  activo_id: number;
  tipo: string;
  fecha: string;
  programada_para?: string | null;
  descripcion: string;
  costo_reparacion: number;
  costo_reposicion: number;
  decision?: string | null;
  estado: string;
  usuario_id?: number;
  fecha_autorizacion?: string | null;
}

export interface UsuarioRolDto {
  id?: number;
  nombre: string;
}

export interface UsuarioDto {
  id: number;
  nombre: string;
  email: string;
  usuario: string;
  telefono: string | null;
  activo: boolean;
  roles: Array<string | UsuarioRolDto>;
  permisos: string[];
  ultimo_acceso: string | null;
  creado_en: string;
}

export interface RolDto {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  permisos?: string[];
}

export interface PermisoDto {
  id: number;
  codigo: string;
  descripcion: string;
  modulo?: string | null;
  activo?: boolean;
}

export interface TipoMermaDto {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface MermaDto {
  id: number;
  tipo_merma_id: number | null;
  tipo_merma: string | null;
  insumo_id: number | null;
  insumo: string | null;
  platillo_id: number | null;
  platillo: string | null;
  cantidad: number;
  costo_estimado: number;
  clasificacion: string;
  causa_raiz: string | null;
  motivo: string;
  fecha: string;
  estado: string;
  usuario_registro_id: number;
  registrado_por: string | null;
  usuario_aprueba_id: number | null;
  fecha_resolucion: string | null;
  observacion_resolucion: string | null;
  origen: string | null;
  creado_en: string | null;
}

export interface DevolucionDto {
  id: number;
  pedido_id: number;
  pedido_numero: string | null;
  pedido_detalle_id: number | null;
  platillo_id: number | null;
  platillo: string | null;
  fecha_reporte: string;
  motivo: string;
  detalle: string | null;
  monto_reembolsado: number;
  estado: string;
  resolucion: string | null;
  decidido_por_id: number | null;
  fecha_resolucion: string | null;
  merma_id: number | null;
}

// ---------------------------------------------------------------------------
// Fase 2 — Reportes, clientes, delivery y cuadre histórico
// ---------------------------------------------------------------------------

export interface ReporteTipoDto {
  tipo: string;
  nombre?: string | null;
  descripcion?: string | null;
}

export interface ReportesTiposDto {
  data: Array<string | ReporteTipoDto>;
  meta?: { total?: number };
}

export interface ReporteMetaDto {
  rango?: { desde: string | null; hasta: string | null };
  limite_filas?: number;
  canal?: string | null;
  limitacion?: string | null;
  [clave: string]: unknown;
}

export interface ReporteAgrupadoDto {
  clave?: string | number | null;
  nombre?: string | null;
  etiqueta?: string | null;
  canal?: string | null;
  metodo?: string | null;
  dia?: string | null;
  fecha?: string | null;
  tipo?: string | null;
  categoria?: string | null;
  estado?: string | null;
  resolucion?: string | null;
  clasificacion?: string | null;
  platillo?: string | null;
  proveedor?: string | null;
  rol?: string | null;
  cantidad?: number;
  registros?: number;
  usuarios?: number;
  insumos?: number;
  activos?: number;
  monto?: number;
  total?: number;
  costo?: number;
  valor?: number;
  reembolsado?: number;
  [clave: string]: unknown;
}

export interface ReporteVentaDetalleDto {
  fecha?: string;
  canal?: string;
  metodo?: string;
  monto?: number;
  sujeto?: string | null;
}

export interface ReporteVentasDto {
  tipo?: string;
  desde?: string | null;
  hasta?: string | null;
  total: number;
  cantidad_pagos?: number;
  cantidad_tickets?: number;
  ticket_promedio?: number;
  por_canal?: ReporteAgrupadoDto[];
  por_metodo?: ReporteAgrupadoDto[];
  por_dia?: ReporteAgrupadoDto[];
  top_platillos?: ReporteAgrupadoDto[];
  detalle?: ReporteVentaDetalleDto[];
  meta?: ReporteMetaDto;
}

export interface ReporteCostosBloqueDto {
  registros?: number;
  total?: number;
  por_proveedor?: ReporteAgrupadoDto[];
  por_categoria?: ReporteAgrupadoDto[];
  por_tipo?: ReporteAgrupadoDto[];
}

export interface ReporteCostosDto {
  tipo?: string;
  desde?: string | null;
  hasta?: string | null;
  compras?: ReporteCostosBloqueDto;
  gastos?: ReporteCostosBloqueDto;
  mermas?: ReporteCostosBloqueDto;
  total_costos?: number;
  meta?: ReporteMetaDto;
}

export interface ReporteMermaDto {
  tipo?: string;
  desde?: string | null;
  hasta?: string | null;
  total_costo?: number;
  registros?: number;
  por_tipo?: ReporteAgrupadoDto[];
  por_clasificacion?: ReporteAgrupadoDto[];
  meta?: ReporteMetaDto;
}

export interface ReporteDevolucionDetalleDto {
  id?: number;
  pedido_id?: number;
  motivo?: string;
  estado?: string;
  resolucion?: string | null;
  monto_reembolsado?: number;
  fecha?: string;
}

export interface ReporteDevolucionesDto {
  tipo?: string;
  desde?: string | null;
  hasta?: string | null;
  registros?: number;
  monto_reembolsado?: number;
  por_estado?: ReporteAgrupadoDto[];
  por_resolucion?: ReporteAgrupadoDto[];
  detalle?: ReporteDevolucionDetalleDto[];
  meta?: ReporteMetaDto;
}

export interface ReporteInventarioInsumoDto {
  id?: number;
  codigo?: string;
  nombre?: string;
  categoria?: string;
  unidad_medida?: string;
  stock_actual?: number;
  stock_minimo?: number;
  costo_promedio?: number;
  valor?: number;
  estado?: string;
}

export interface ReporteInventarioDto {
  tipo?: string;
  total_insumos?: number;
  valor_total?: number;
  bajo_minimo?: number;
  por_categoria?: ReporteAgrupadoDto[];
  insumos?: ReporteInventarioInsumoDto[];
  meta?: ReporteMetaDto;
}

export interface ReporteActivoDto {
  id?: number;
  nombre?: string;
  categoria?: string;
  estado?: string;
  cantidad?: number;
  vida_util_meses?: number | null;
  antiguedad_meses?: number;
  vida_util_vencida?: boolean;
  mantenimientos?: number;
}

export interface ReporteActivosDto {
  tipo?: string;
  total_activos?: number;
  valor_adquisicion?: number;
  en_reparacion?: number;
  dados_de_baja?: number;
  costo_mantenimientos?: number;
  por_categoria?: ReporteAgrupadoDto[];
  activos?: ReporteActivoDto[];
  meta?: ReporteMetaDto;
}

export interface ReportePersonalUsuarioDto {
  id?: number;
  nombre?: string;
  email?: string;
  roles?: string[];
  permisos?: number;
  activo?: boolean;
  ultimo_acceso?: string | null;
}

export interface ReportePersonalDto {
  tipo?: string;
  total_usuarios?: number;
  por_rol?: ReporteAgrupadoDto[];
  usuarios?: ReportePersonalUsuarioDto[];
  meta?: ReporteMetaDto;
}

export type ReporteRespuestaDto =
  | ReporteVentasDto
  | ReporteCostosDto
  | ReporteMermaDto
  | ReporteDevolucionesDto
  | ReporteInventarioDto
  | ReporteActivosDto
  | ReportePersonalDto;

export interface ClienteListaDto {
  id: number;
  nombre: string;
  tipo_documento?: string | null;
  numero_documento?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  referencia?: string | null;
  creado_en?: string | null;
}

export interface DeliveryPropioPedidoDto {
  id: number;
  numero?: string;
  fecha_pedido?: string;
  fecha_entrega?: string | null;
  canal?: string;
  tipo_consumo?: string;
  estado?: string;
  estado_pago?: string;
  estado_entrega?: string | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  repartidor_id?: number | null;
  repartidor_nombre?: string | null;
  direccion_entrega?: string | null;
  referencia_entrega?: string | null;
  observaciones?: string | null;
  minutos_desde_pedido?: number | null;
  subtotal?: number;
  igv?: number;
  total?: number;
  costo_delivery?: number;
  comision_plataforma?: number;
  metodo_pago?: string | null;
  detalles?: DetallePedidoDto[];
}

export interface EntregaResponseDto {
  pedido: DeliveryPropioPedidoDto;
  pago?: PagoDto;
  vuelto?: number;
}

export interface DeliveryExternoPedidoDto {
  id: number;
  numero?: string;
  fecha_pedido?: string;
  plataforma?: string;
  canal?: string;
  estado?: string;
  estado_pago?: string;
  estado_entrega?: string | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  direccion_entrega?: string | null;
  referencia_entrega?: string | null;
  observaciones?: string | null;
  detalles?: DetallePedidoDto[];
  comision_pct?: number;
  monto_bruto?: number;
  comision?: number;
  monto_neto?: number;
  total?: number;
}

export interface LiquidacionDeliveryDto {
  id: number | null;
  plataforma: string;
  fecha: string;
  monto_bruto: number;
  comision: number;
  monto_neto: number;
  pedidos?: number;
  referencia?: string | null;
  origen?: string | null;
  persistido?: boolean;
  limitacion?: string | null;
}

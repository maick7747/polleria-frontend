export interface ApiList<T> {
  data: T[];
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
    total_alertas?: number;
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

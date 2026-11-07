export type ClasificacionMerma = 'evitable' | 'inevitable';

export type EstadoMerma = 'pendiente' | 'aprobada' | 'rechazada';

export type OrigenMerma = 'registro_manual' | 'devolucion' | 'cancelacion';

export type EstadoDevolucion = 'pendiente' | 'aceptada' | 'rechazada';

export type ResolucionDevolucion =
  | 're_preparar'
  | 'corregir'
  | 'reembolso_total'
  | 'reembolso_parcial';

export type CategoriaGasto =
  | 'servicios_basicos'
  | 'alquiler'
  | 'mantenimiento'
  | 'personal'
  | 'transporte'
  | 'limpieza'
  | 'impuestos'
  | 'otros';

export type CategoriaActivo = 'cocina' | 'salon' | 'delivery' | 'oficina' | 'limpieza';

export type EstadoActivo = 'activo' | 'en_reparacion' | 'dado_de_baja';

export type TipoMantenimiento = 'preventivo' | 'correctivo';

export type EstadoMantenimiento = 'programado' | 'en_proceso' | 'completado';

export interface Merma {
  id: number;
  tipo: string;
  insumoId?: number;
  insumoNombre?: string;
  platilloId?: number;
  platilloNombre?: string;
  cantidad: number;
  costoEstimado: number;
  clasificacion: ClasificacionMerma;
  causaRaiz: string;
  motivo: string;
  fecha: string;
  estado: EstadoMerma;
  origen: OrigenMerma;
  usuarioRegistroId: number;
  usuarioApruebaId?: number;
  observacionResolucion?: string;
}

export interface Devolucion {
  id: number;
  pedidoId: number;
  pedidoNumero: string;
  pedidoDetalleId?: number;
  fechaReporte: string;
  motivo: string;
  detalle: string;
  montoReembolsado: number;
  estado: EstadoDevolucion;
  resolucion?: ResolucionDevolucion;
  decididoPorId?: number;
  fechaResolucion?: string;
  mermaId?: number;
}

export interface Gasto {
  id: number;
  fecha: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  metodoPago: 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia';
  descuentaCajaChica: boolean;
  comprobanteUrl?: string;
  usuarioId: number;
}

export interface Mantenimiento {
  id: number;
  activoId: number;
  tipo: TipoMantenimiento;
  fecha: string;
  programadaPara?: string;
  descripcion: string;
  costoReparacion: number;
  costoReposicion: number;
  decision?: 'reparar' | 'reemplazar';
  estado: EstadoMantenimiento;
  usuarioId: number;
}

export interface Activo {
  id: number;
  nombre: string;
  categoria: CategoriaActivo;
  cantidad: number;
  costoAdquisicion: number;
  vidaUtilMeses: number;
  fechaAdquisicion: string;
  estado: EstadoActivo;
  ultimoMantenimiento?: string;
  proximoMantenimiento?: string;
  proveedor?: string;
  garantiaMeses?: number;
  observaciones?: string;
  fechaBaja?: string;
  motivoBaja?: string;
  usuarioId: number;
}

export interface Reporte {
  id: number;
  nombre: string;
  tipo: 'ventas' | 'costos' | 'merma' | 'devoluciones' | 'inventario' | 'activos' | 'personal';
  periodo: string;
  generadoEn: string;
  url?: string;
}

export interface Configuracion {
  id: number;
  clave: string;
  valor: string;
  descripcion: string;
  actualizadoEn: string;
}

export interface TopPlato {
  nombre: string;
  monto: number;
  unidades: number;
  porcentaje: number;
}

export interface PuntoSerie {
  dia: string;
  monto: number;
}

export interface ComandaResumen {
  id: number;
  numero: string;
  estado: string;
  estadoTono: 'neutral' | 'warning' | 'danger';
  canal: string;
  detalle: string;
  monto: number;
  hora: string;
}

export interface KpiResumen {
  ventasHoy: number;
  ventasAyer: number;
  metaVentas: number;
  deltaPct: number;
  actualizado: string;
  totalPlatosCarta: number;
  pedidosTop: number;
  ingresosTop: number;
  mejorDia: string;
  mejorDiaMonto: number;
  topPlatos: TopPlato[];
  serieSemana: PuntoSerie[];
}

import type {
  Activo,
  CanalPedido,
  CategoriaActivo,
  CategoriaGasto,
  CategoriaInsumo,
  CategoriaPlatillo,
  ComprobanteTipo,
  Cuenta,
  DatosCliente,
  Devolucion,
  EstadoActivo,
  EstadoCuenta,
  EstadoDevolucion,
  EstadoMantenimiento,
  EstadoMerma,
  EstadoMesa,
  EstadoPago,
  EstadoPedido,
  EstadoPreparacion,
  Gasto,
  Insumo,
  Mantenimiento,
  Merma,
  Mesa,
  MetodoPago,
  MovimientoStock,
  OrigenMerma,
  Pago,
  Pedido,
  PedidoDetalle,
  Permiso,
  Plato,
  ResolucionDevolucion,
  RolNombre,
  Ronda,
  TipoConsumo,
  TipoMantenimiento,
  UnidadMedida,
  Usuario,
} from '../models';
import type {
  EntradaCompra,
  EstadoOrden,
  EstadoSugerencia,
  OrdenCompra,
  SugerenciaCompra,
} from '../data/compras.service';
import type {
  ActivoAlertaDto,
  ActivoDto,
  ClienteDto,
  ClienteListaDto,
  CompraDto,
  CuentaDto,
  CuentaResumenDto,
  DeliveryExternoPedidoDto,
  DeliveryPropioPedidoDto,
  DetallePedidoDto,
  DevolucionDto,
  GastoDto,
  InsumoDto,
  KdsPedidoDto,
  LiquidacionDeliveryDto,
  MantenimientoDto,
  MermaDto,
  MesaDto,
  MovimientoDto,
  PagoDto,
  PedidoDto,
  PermisoDto,
  PlatoDto,
  ReporteAgrupadoDto,
  ReporteTipoDto,
  RolDto,
  SugerenciaCompraDto,
  TipoMermaDto,
  UsuarioDto,
} from './api.types';
import { formatearMoneda } from '../utils/format';
import { cursoDe, estacionDe } from '../utils/kds';

const METODOS: readonly MetodoPago[] = ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'];

const ESTADOS_PEDIDO: readonly EstadoPedido[] = [
  'borrador',
  'en_cocina',
  'servido',
  'cobrado',
  'cancelado',
];

const ESTADOS_CUENTA: readonly EstadoCuenta[] = ['abierta', 'cobrada', 'cancelada'];

const ESTADOS_PREPARACION: readonly EstadoPreparacion[] = [
  'pendiente',
  'en_preparacion',
  'listo',
];

const CATEGORIAS_INSUMO: readonly CategoriaInsumo[] = [
  'alimento',
  'bebida',
  'limpieza',
  'empaque',
  'insumo_general',
];

const UNIDADES: readonly UnidadMedida[] = ['kg', 'g', 'l', 'ml', 'und', 'docena'];

export function toMesa(dto: MesaDto): Mesa {
  // `GET /mesas` devuelve un `cuenta_abierta` parcial (sin pedidos); solo se
  // mapea cuando el detalle (`GET /mesas/:id`) trae los pedidos completos.
  const cuentaAbierta =
    dto.cuenta_abierta && Array.isArray(dto.cuenta_abierta.pedidos)
      ? toCuenta(dto.cuenta_abierta)
      : null;
  return {
    id: dto.id,
    numero: dto.numero,
    estado: dto.estado === 'ocupada' ? 'ocupada' : 'libre',
    activa: dto.activa,
    cuentaAbierta,
  };
}

export function toCanal(canal: string): CanalPedido {
  switch (canal) {
    case 'whatsapp':
      return 'whatsapp';
    case 'delivery_propio':
    case 'telefono':
      return 'delivery_propio';
    case 'rappi':
      return 'rappi';
    case 'llamafood':
      return 'llamafood';
    default:
      return 'local';
  }
}

function toTipoConsumo(tipo: string): TipoConsumo {
  if (tipo === 'delivery') {
    return 'delivery';
  }
  return tipo === 'para_llevar' ? 'para_llevar' : 'sala';
}

function toEstadoPedido(estado: string): EstadoPedido {
  return ESTADOS_PEDIDO.find((valor) => valor === estado) ?? 'borrador';
}

function toEstadoCuenta(estado: string): EstadoCuenta {
  return ESTADOS_CUENTA.find((valor) => valor === estado) ?? 'cancelada';
}

function toEstadoPago(estado: string): EstadoPago {
  if (estado === 'pagado' || estado === 'contraentrega_pendiente') {
    return estado;
  }
  return 'pendiente';
}

function toEstadoPreparacion(estado: string): EstadoPreparacion {
  return ESTADOS_PREPARACION.find((valor) => valor === estado) ?? 'pendiente';
}

function toMetodoPago(metodo: string | null): MetodoPago | undefined {
  if (metodo === null) {
    return undefined;
  }
  return METODOS.find((valor) => valor === metodo);
}

function toComprobanteTipo(tipo: string): ComprobanteTipo {
  if (tipo === 'boleta' || tipo === 'ticket') {
    return tipo;
  }
  return 'ninguno';
}

export function toDetalle(dto: DetallePedidoDto): PedidoDetalle {
  const nombre = dto.platillo_nombre ?? `Platillo ${dto.platillo_id}`;
  return {
    id: dto.id,
    platilloId: dto.platillo_id,
    nombre,
    cantidad: dto.cantidad,
    precioUnitario: dto.precio_unitario,
    subtotal: dto.subtotal,
    notas: dto.notas ?? undefined,
    estadoPreparacion: toEstadoPreparacion(dto.estado_preparacion),
    fechaInicioPrep: dto.fecha_inicio_prep ?? undefined,
    fechaListo: dto.fecha_listo ?? undefined,
    // Respuestas antiguas no traen estación/curso: se infieren por nombre.
    estacion: estacionDe({ estacion: dto.estacion ?? undefined, nombre }),
    curso: cursoDe({ curso: dto.curso ?? undefined, nombre }),
    prepMin:
      typeof dto.prep_min === 'number' && Number.isFinite(dto.prep_min)
        ? dto.prep_min
        : undefined,
    entregadoEn: dto.entregado_en ?? undefined,
  };
}

export function toRonda(dto: PedidoDto, numero: number): Ronda {
  return {
    id: dto.id,
    numero,
    creadaEn: dto.fecha_pedido,
    estado: toEstadoPedido(dto.estado),
    items: (dto.detalles ?? []).map(toDetalle),
    total: dto.total,
  };
}

export function toPedido(dto: PedidoDto): Pedido {
  return {
    id: dto.id,
    numero: dto.numero,
    fechaPedido: dto.fecha_pedido,
    canal: toCanal(dto.canal),
    tipoConsumo: toTipoConsumo(dto.tipo_consumo),
    mesaId: dto.mesa_id,
    cuentaId: dto.cuenta_id,
    rondaId: null,
    clienteNombre: dto.cliente_nombre ?? undefined,
    repartidorId: dto.repartidor_id ?? undefined,
    usuarioCajeroId: dto.usuario_cajero_id,
    estado: toEstadoPedido(dto.estado),
    estadoPago: toEstadoPago(dto.estado_pago),
    metodoPago: toMetodoPago(dto.metodo_pago),
    subtotal: dto.subtotal,
    igv: dto.igv,
    total: dto.total,
    comisionPlataforma: dto.comision_plataforma,
    costoDelivery: dto.costo_delivery,
    direccionEntrega: dto.direccion_entrega ?? undefined,
    referenciaEntrega: dto.referencia_entrega ?? undefined,
    observaciones: dto.observaciones ?? undefined,
    comprobanteTipo: toComprobanteTipo(dto.comprobante_tipo),
    items: (dto.detalles ?? []).map(toDetalle),
    fechaEntrega: dto.fecha_entrega ?? undefined,
    estadoEntrega: toEstadoEntrega(dto.estado_entrega),
  };
}

export function toPedidoKds(dto: KdsPedidoDto): Pedido {
  const items = dto.detalles.map(toDetalle);
  const todosEntregados =
    dto.todos_entregados ??
    (items.length > 0 && items.every((item) => Boolean(item.entregadoEn)));
  return {
    id: dto.id,
    numero: dto.numero,
    fechaPedido: dto.fecha_pedido,
    canal: toCanal(dto.canal),
    tipoConsumo: toTipoConsumo(dto.tipo_consumo),
    mesaId: dto.mesa_id ?? null,
    mesaNumero: dto.mesa_numero ?? undefined,
    cuentaId: dto.cuenta_id ?? null,
    rondaId: null,
    usuarioCajeroId: 0,
    estado: toEstadoPedido(dto.estado),
    estadoPago: toEstadoPago(dto.estado_pago),
    metodoPago: toMetodoPago(dto.metodo_pago),
    subtotal: dto.subtotal,
    igv: dto.igv,
    total: dto.total,
    comisionPlataforma: 0,
    costoDelivery: 0,
    observaciones: dto.observaciones ?? undefined,
    comprobanteTipo: 'ticket',
    items,
    estadoEntrega: toEstadoEntrega(dto.estado_entrega),
    listo: dto.listo ?? (items.length > 0 && items.every((item) => item.estadoPreparacion === 'listo')),
    todosEntregados,
  };
}

function toEstadoEntrega(estado: string | null | undefined): Pedido['estadoEntrega'] {
  if (estado === 'entregado' || estado === 'en_camino' || estado === 'pendiente') {
    return estado;
  }
  return undefined;
}

function toDatosCliente(dto: ClienteDto): DatosCliente {
  return {
    tipoDocumento: dto.tipo_documento === 'RUC' ? 'RUC' : 'DNI',
    numeroDocumento: dto.numero_documento ?? '',
    nombre: dto.nombre,
    telefono: dto.telefono ?? undefined,
    correo: dto.correo ?? undefined,
  };
}

export function toCuenta(dto: CuentaDto): Cuenta {
  const rondas = (dto.pedidos ?? []).map((pedido, indice) => toRonda(pedido, indice + 1));
  return {
    id: dto.id,
    mesaId: dto.mesa_id,
    mesaNumero: dto.mesa_numero ?? undefined,
    estado: toEstadoCuenta(dto.estado),
    total: dto.total,
    fechaApertura: dto.fecha_apertura,
    usuarioAperturaId: dto.usuario_apertura_id,
    usuarioAperturaNombre: dto.usuario_apertura_nombre ?? undefined,
    fechaCierre: dto.fecha_cierre ?? undefined,
    usuarioCierreId: dto.usuario_cierre_id ?? undefined,
    comprobanteTipo: toComprobanteTipo(dto.comprobante_tipo),
    comprobanteNumero: dto.comprobante_numero ?? undefined,
    ...(dto.cliente ? { cliente: toDatosCliente(dto.cliente) } : {}),
    rondas,
  };
}

// Resumen de lista: `GET /cuentas` devuelve `pedidos` como ids y `rondas`
// como conteo, así que no se mapean rondas completas.
export function toCuentaResumen(dto: CuentaResumenDto): Cuenta {
  return {
    id: dto.id,
    mesaId: dto.mesa_id,
    mesaNumero: dto.mesa_numero ?? undefined,
    estado: toEstadoCuenta(dto.estado),
    total: dto.total,
    fechaApertura: dto.fecha_apertura,
    usuarioAperturaId: dto.usuario_apertura_id,
    usuarioAperturaNombre: dto.usuario_apertura_nombre ?? undefined,
    fechaCierre: dto.fecha_cierre ?? undefined,
    usuarioCierreId: dto.usuario_cierre_id ?? undefined,
    comprobanteTipo: toComprobanteTipo(dto.comprobante_tipo),
    comprobanteNumero: dto.comprobante_numero ?? undefined,
    ...(dto.cliente ? { cliente: toDatosCliente(dto.cliente) } : {}),
    rondas: [],
  };
}

export function toPago(dto: PagoDto): Pago {
  return {
    id: dto.id,
    pedidoId: dto.pedido_id,
    cuentaId: dto.cuenta_id,
    metodo: METODOS.find((valor) => valor === dto.metodo) ?? 'efectivo',
    monto: dto.monto,
    esContraentrega: dto.es_contraentrega,
    fecha: dto.fecha,
    usuarioId: dto.usuario_id,
  };
}

export function toInsumo(dto: InsumoDto): Insumo {
  return {
    id: dto.id,
    codigo: dto.codigo,
    nombre: dto.nombre,
    categoria: CATEGORIAS_INSUMO.find((valor) => valor === dto.categoria) ?? 'insumo_general',
    unidadMedida: UNIDADES.find((valor) => valor === dto.unidad_medida) ?? 'und',
    stockActual: dto.stock_actual,
    stockMinimo: dto.stock_minimo,
    umbralMermaPct: dto.umbral_merma_pct,
    costoPromedio: dto.costo_promedio,
    activo: dto.activo,
  };
}

export function toMovimiento(dto: MovimientoDto): MovimientoStock {
  const referencias: readonly MovimientoStock['referenciaTipo'][] = [
    'compra',
    'pedido',
    'merma',
    'devolucion',
    'ajuste',
  ];
  const tipos: readonly MovimientoStock['tipo'][] = [
    'entrada',
    'salida',
    'merma',
    'ajuste',
    'devolucion',
  ];
  return {
    id: dto.id,
    insumoId: dto.insumo_id,
    tipo: tipos.find((valor) => valor === dto.tipo) ?? 'ajuste',
    cantidad: dto.cantidad,
    stockResultante: dto.stock_resultante,
    referenciaTipo:
      referencias.find((valor) => valor === dto.referencia_tipo) ?? 'ajuste',
    referenciaId: dto.referencia_id ?? 0,
    usuarioId: dto.usuario_id,
    observacion: dto.observacion ?? '',
    fecha: dto.fecha,
  };
}

const CATEGORIAS_GASTO: readonly CategoriaGasto[] = [
  'servicios_basicos',
  'alquiler',
  'mantenimiento',
  'personal',
  'transporte',
  'limpieza',
  'impuestos',
  'otros',
];

const fechaCorta = (fecha: string | null | undefined): string => {
  if (!fecha) {
    return '—';
  }
  const limpia = fecha.slice(0, 10);
  return limpia.length === 10
    ? `${limpia.slice(8, 10)}/${limpia.slice(5, 7)}/${limpia.slice(0, 4)}`
    : limpia;
};

function toEstadoOrden(estado: string): EstadoOrden {
  if (estado === 'recibida') {
    return 'recibida';
  }
  if (estado === 'cancelada') {
    return 'cancelada';
  }
  return 'enviada';
}

export function toCompra(dto: CompraDto): OrdenCompra {
  const estado = toEstadoOrden(dto.estado);
  return {
    id: dto.id,
    codigo: `OC-${String(dto.id).padStart(4, '0')}`,
    proveedor: dto.proveedor?.razon_social ?? '—',
    proveedorId: dto.proveedor_id ?? dto.proveedor?.id ?? null,
    fecha: (dto.fecha ?? '').slice(0, 10),
    entrega:
      estado === 'recibida'
        ? `Recibida ${fechaCorta(dto.fecha_recepcion)}`
        : estado === 'cancelada'
          ? 'Cancelada'
          : 'Entrega pendiente',
    condicion: dto.notas?.trim() || '—',
    estado,
    items: Number(dto.items ?? dto.detalles?.length ?? 0),
    total: Number(dto.total ?? 0),
    notas: dto.notas ?? undefined,
    fechaRecepcion: dto.fecha_recepcion ?? null,
    motivoCancelacion: dto.motivo_cancelacion ?? null,
  };
}

export function toEntrada(dto: CompraDto): EntradaCompra {
  return {
    id: dto.id,
    codigo: `E-${String(dto.id).padStart(4, '0')}`,
    proveedor: dto.proveedor?.razon_social ?? '—',
    fecha: (dto.fecha_recepcion ?? dto.fecha ?? '').slice(0, 10),
    items: Number(dto.items ?? dto.detalles?.length ?? 0),
    total: Number(dto.total ?? 0),
  };
}

export function toSugerencia(dto: SugerenciaCompraDto): SugerenciaCompra {
  const minimo = Number(dto.stock_minimo ?? 0);
  const actual = Number(dto.stock_actual ?? 0);
  const ratio = minimo > 0 ? actual / minimo : 1;
  const estado: EstadoSugerencia = ratio <= 0.6 ? 'critico' : ratio <= 1 ? 'bajo' : 'ok';
  return {
    id: dto.insumo_id,
    insumoId: dto.insumo_id,
    nombre: dto.nombre,
    // El endpoint de sugerencia no expone al proveedor por insumo.
    proveedor: '—',
    proveedorId: null,
    categoria: dto.codigo,
    unidad: dto.unidad_medida,
    stock: actual,
    stockMinimo: minimo,
    sugerido: Number(dto.cantidad_sugerida ?? 0),
    precioUnitario: Number(dto.costo_promedio ?? 0),
    estado,
    seleccionada: true,
  };
}

export function toGasto(dto: GastoDto): Gasto {
  return {
    id: dto.id,
    fecha: (dto.fecha ?? '').slice(0, 10),
    categoria: CATEGORIAS_GASTO.find((valor) => valor === dto.categoria) ?? 'otros',
    descripcion: dto.descripcion,
    monto: Number(dto.monto ?? 0),
    metodoPago: METODOS.find((valor) => valor === dto.metodo_pago) ?? 'efectivo',
    descuentaCajaChica: Boolean(dto.descuenta_caja_chica),
    comprobanteUrl: dto.comprobante_url ?? undefined,
    usuarioId: dto.usuario_id,
    creadoEn: dto.creado_en,
    registradoPor: dto.registrado_por ?? undefined,
  };
}

export function toPlato(dto: PlatoDto): Plato {
  return {
    id: dto.id,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    categoria: (dto.categoria ?? 'Pollos') as CategoriaPlatillo,
    precioVenta: Number(dto.precio_venta),
    activo: Boolean(dto.activo),
    ingredientes: (dto.ingredientes ?? []).map((ingrediente) => ({
      insumoId: ingrediente.insumo_id,
      nombre: ingrediente.insumo ?? '',
      cantidad: Number(ingrediente.cantidad),
      unidadMedida: (ingrediente.unidad_medida ?? 'und') as UnidadMedida,
      costoUnitario: Number(ingrediente.costo_promedio ?? 0),
    })),
  };
}

const ESTADOS_MERMA: readonly EstadoMerma[] = ['pendiente', 'aprobada', 'rechazada'];

const ORIGENES_MERMA: readonly OrigenMerma[] = [
  'registro_manual',
  'devolucion',
  'cancelacion',
];

export function toTipoMerma(dto: TipoMermaDto): {
  id: number;
  nombre: string;
  descripcion: string;
} {
  return {
    id: dto.id,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
  };
}

export function toMerma(dto: MermaDto): Merma {
  return {
    id: dto.id,
    tipo: dto.tipo_merma ?? 'Sin tipo',
    insumoId: dto.insumo_id ?? undefined,
    insumoNombre: dto.insumo ?? undefined,
    platilloId: dto.platillo_id ?? undefined,
    platilloNombre: dto.platillo ?? undefined,
    cantidad: Number(dto.cantidad ?? 0),
    costoEstimado: Number(dto.costo_estimado ?? 0),
    clasificacion: dto.clasificacion === 'inevitable' ? 'inevitable' : 'evitable',
    causaRaiz: dto.causa_raiz ?? '',
    motivo: dto.motivo,
    fecha: (dto.fecha ?? '').slice(0, 10),
    estado: ESTADOS_MERMA.find((valor) => valor === dto.estado) ?? 'pendiente',
    origen: ORIGENES_MERMA.find((valor) => valor === dto.origen) ?? 'registro_manual',
    usuarioRegistroId: dto.usuario_registro_id,
    usuarioApruebaId: dto.usuario_aprueba_id ?? undefined,
    observacionResolucion: dto.observacion_resolucion ?? undefined,
  };
}

const ESTADOS_DEVOLUCION: readonly EstadoDevolucion[] = [
  'pendiente',
  'aceptada',
  'rechazada',
];

const RESOLUCIONES_DEVOLUCION: readonly ResolucionDevolucion[] = [
  're_preparar',
  'corregir',
  'reembolso_total',
  'reembolso_parcial',
];

export function toDevolucion(dto: DevolucionDto): Devolucion {
  return {
    id: dto.id,
    pedidoId: dto.pedido_id,
    pedidoNumero: dto.pedido_numero ?? `Pedido ${dto.pedido_id}`,
    pedidoDetalleId: dto.pedido_detalle_id ?? undefined,
    fechaReporte: dto.fecha_reporte,
    motivo: dto.motivo,
    detalle: dto.detalle ?? '',
    montoReembolsado: Number(dto.monto_reembolsado ?? 0),
    estado: ESTADOS_DEVOLUCION.find((valor) => valor === dto.estado) ?? 'pendiente',
    resolucion: RESOLUCIONES_DEVOLUCION.find((valor) => valor === dto.resolucion),
    decididoPorId: dto.decidido_por_id ?? undefined,
    fechaResolucion: dto.fecha_resolucion ?? undefined,
    mermaId: dto.merma_id ?? undefined,
  };
}

const CATEGORIAS_ACTIVO: readonly CategoriaActivo[] = [
  'cocina',
  'salon',
  'delivery',
  'oficina',
  'limpieza',
];

const ESTADOS_ACTIVO: readonly EstadoActivo[] = ['activo', 'en_reparacion', 'dado_de_baja'];

const TIPOS_MANTENIMIENTO: readonly TipoMantenimiento[] = ['preventivo', 'correctivo'];

const ESTADOS_MANTENIMIENTO: readonly EstadoMantenimiento[] = [
  'programado',
  'en_proceso',
  'completado',
];

const ROLES_SISTEMA: readonly RolNombre[] = [
  'Mozo',
  'Cajero',
  'Cocinero',
  'Repartidor',
  'Dueño/Admin',
  'Admin',
];

export interface ActivoVista extends Activo {
  antiguedadMeses?: number;
  vidaUtilVencida?: boolean;
  totalMantenimientos?: number;
}

export interface AlertaActivo {
  id: number;
  activoId: number;
  activo: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  mantenimientoId?: number;
}

export interface MovimientoDetalle extends MovimientoStock {
  insumo?: string;
  usuario?: string;
}

export interface UsuarioVista extends Usuario {
  usuario?: string;
  creadoEn?: string;
  turnos: string[];
}

export interface RolCatalogo {
  id: number;
  nombre: string;
  descripcion: string;
  activo: boolean;
  permisos: string[];
}

function fechaDeUltimo(dto: ActivoDto): string | undefined {
  const ultimo = dto.ultimo_mantenimiento;
  if (!ultimo) {
    return undefined;
  }
  if (typeof ultimo === 'string') {
    return ultimo.slice(0, 10);
  }
  return typeof ultimo.fecha === 'string' ? ultimo.fecha.slice(0, 10) : undefined;
}

export function toActivo(dto: ActivoDto): ActivoVista {
  const antiguedad = dto.antiguedad_meses ?? dto.meses_uso ?? dto.edad_meses;
  return {
    id: dto.id,
    nombre: dto.nombre,
    categoria: CATEGORIAS_ACTIVO.find((valor) => valor === dto.categoria) ?? 'cocina',
    cantidad: Number(dto.cantidad ?? 1),
    costoAdquisicion: Number(dto.costo_adquisicion ?? 0),
    vidaUtilMeses: Number(dto.vida_util_meses ?? 0),
    fechaAdquisicion: (dto.fecha_adquisicion ?? '').slice(0, 10),
    estado: ESTADOS_ACTIVO.find((valor) => valor === dto.estado) ?? 'activo',
    ultimoMantenimiento: fechaDeUltimo(dto),
    proximoMantenimiento: dto.proximo_mantenimiento?.slice(0, 10) ?? undefined,
    proveedor: dto.proveedor ?? undefined,
    garantiaMeses: dto.garantia_meses ?? undefined,
    observaciones: dto.observaciones ?? undefined,
    fechaBaja: dto.fecha_baja ?? undefined,
    motivoBaja: dto.motivo_baja ?? undefined,
    usuarioId: dto.usuario_id ?? 0,
    antiguedadMeses: antiguedad !== undefined ? Number(antiguedad) : undefined,
    vidaUtilVencida: dto.vida_util_vencida,
    totalMantenimientos: dto.mantenimientos,
  };
}

export function toAlerta(dto: ActivoAlertaDto, id: number): AlertaActivo {
  return {
    id,
    activoId: dto.activo_id,
    activo: dto.activo,
    tipo: dto.tipo,
    severidad: dto.severidad,
    mensaje: dto.mensaje,
    mantenimientoId: dto.mantenimiento_id,
  };
}

export function toMantenimiento(dto: MantenimientoDto): Mantenimiento {
  return {
    id: dto.id,
    activoId: dto.activo_id,
    tipo: TIPOS_MANTENIMIENTO.find((valor) => valor === dto.tipo) ?? 'preventivo',
    fecha: (dto.fecha ?? '').slice(0, 10),
    programadaPara: dto.programada_para?.slice(0, 10) ?? undefined,
    descripcion: dto.descripcion,
    costoReparacion: Number(dto.costo_reparacion ?? 0),
    costoReposicion: Number(dto.costo_reposicion ?? 0),
    decision:
      dto.decision === 'reparar' || dto.decision === 'reemplazar' ? dto.decision : undefined,
    estado: ESTADOS_MANTENIMIENTO.find((valor) => valor === dto.estado) ?? 'programado',
    usuarioId: dto.usuario_id ?? 0,
  };
}

function nombreRol(dto: string | { nombre?: string }): string {
  return typeof dto === 'string' ? dto : (dto?.nombre ?? '');
}

export function toUsuario(dto: UsuarioDto): UsuarioVista {
  const roles = (Array.isArray(dto.roles) ? dto.roles : [])
    .map(nombreRol)
    .filter((nombre): nombre is RolNombre =>
      ROLES_SISTEMA.some((valor) => valor === nombre),
    );
  return {
    id: dto.id,
    nombre: dto.nombre,
    email: dto.email,
    telefono: dto.telefono ?? '',
    activo: Boolean(dto.activo),
    roles,
    permisos: Array.isArray(dto.permisos) ? [...dto.permisos] : [],
    turnos: Array.isArray(dto.turnos) ? [...dto.turnos] : [],
    ultimoAcceso: dto.ultimo_acceso ?? undefined,
    usuario: dto.usuario,
    creadoEn: dto.creado_en,
  };
}

export function toRol(dto: RolDto): RolCatalogo {
  return {
    id: dto.id,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    activo: dto.activo !== false,
    permisos: Array.isArray(dto.permisos) ? [...dto.permisos] : [],
  };
}

export function toPermiso(dto: PermisoDto): Permiso {
  return {
    id: dto.id,
    codigo: dto.codigo,
    descripcion: dto.descripcion,
    modulo: dto.modulo ?? '',
    activo: dto.activo !== false,
  };
}

export function toMovimientoDetalle(dto: MovimientoDto): MovimientoDetalle {
  return {
    ...toMovimiento(dto),
    insumo: dto.insumo ?? undefined,
    usuario: dto.usuario ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Fase 2 — Clientes
// ---------------------------------------------------------------------------

export interface ClienteResumen {
  id: number;
  nombre: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  direccion?: string;
  referencia?: string;
  creadoEn?: string;
}

export function toClienteResumen(dto: ClienteListaDto): ClienteResumen {
  return {
    id: dto.id,
    nombre: dto.nombre,
    tipoDocumento: dto.tipo_documento ?? undefined,
    numeroDocumento: dto.numero_documento ?? undefined,
    telefono: dto.telefono ?? undefined,
    direccion: dto.direccion ?? undefined,
    referencia: dto.referencia ?? undefined,
    creadoEn: dto.creado_en ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Fase 2 — Delivery propio y externo
// ---------------------------------------------------------------------------

export function resumenItems(detalles: DetallePedidoDto[] | undefined): string {
  const items = detalles ?? [];
  if (items.length === 0) {
    return 'Sin ítems';
  }
  return items
    .map((item) => `${item.cantidad}× ${item.platillo_nombre ?? `Platillo ${item.platillo_id}`}`)
    .join(' · ');
}

export interface DeliveryPropioVista {
  id: number;
  numero: string;
  fecha: string;
  canal: string;
  estado: string;
  estadoPago: string;
  estadoEntrega: string | null;
  clienteId: number | null;
  clienteNombre: string;
  repartidorId: number | null;
  repartidorNombre: string | null;
  direccion: string;
  referencia: string;
  observaciones: string;
  minutos: number;
  subtotal: number;
  igv: number;
  total: number;
  costoDelivery: number;
  metodoPago: string | null;
  items: PedidoDetalle[];
  detalleTexto: string;
}

export function toDeliveryPropio(dto: DeliveryPropioPedidoDto): DeliveryPropioVista {
  return {
    id: dto.id,
    numero: dto.numero ?? `#${dto.id}`,
    fecha: dto.fecha_pedido ?? '',
    canal: dto.canal ?? 'delivery_propio',
    estado: dto.estado ?? 'borrador',
    estadoPago: dto.estado_pago ?? 'pendiente',
    estadoEntrega: dto.estado_entrega ?? null,
    clienteId: dto.cliente_id ?? null,
    clienteNombre: dto.cliente_nombre?.trim() || 'Sin cliente',
    repartidorId: dto.repartidor_id ?? null,
    repartidorNombre: dto.repartidor_nombre ?? null,
    direccion: dto.direccion_entrega?.trim() || 'Sin dirección',
    referencia: dto.referencia_entrega?.trim() || '',
    observaciones: dto.observaciones?.trim() || '',
    minutos: Number(dto.minutos_desde_pedido ?? 0),
    subtotal: Number(dto.subtotal ?? 0),
    igv: Number(dto.igv ?? 0),
    total: Number(dto.total ?? 0),
    costoDelivery: Number(dto.costo_delivery ?? 0),
    metodoPago: dto.metodo_pago ?? null,
    items: (dto.detalles ?? []).map(toDetalle),
    detalleTexto: resumenItems(dto.detalles),
  };
}

export interface DeliveryExternoVista {
  id: number;
  numero: string;
  fecha: string;
  plataforma: string;
  estado: string;
  estadoPago: string;
  clienteNombre: string;
  direccion: string;
  referencia: string;
  observaciones: string;
  minutos: number;
  comisionPct: number;
  montoBruto: number;
  comision: number;
  montoNeto: number;
  total: number;
  items: PedidoDetalle[];
  detalleTexto: string;
}

export function toDeliveryExterno(dto: DeliveryExternoPedidoDto): DeliveryExternoVista {
  const plataforma = dto.plataforma ?? dto.canal ?? 'rappi';
  const bruto = Number(dto.monto_bruto ?? dto.total ?? 0);
  const comision = Number(dto.comision ?? 0);
  return {
    id: dto.id,
    numero: dto.numero ?? `#${dto.id}`,
    fecha: dto.fecha_pedido ?? '',
    plataforma,
    estado: dto.estado ?? 'borrador',
    estadoPago: dto.estado_pago ?? 'pendiente',
    clienteNombre: dto.cliente_nombre?.trim() || 'Sin cliente',
    direccion: dto.direccion_entrega?.trim() || 'Sin dirección',
    referencia: dto.referencia_entrega?.trim() || '',
    observaciones: dto.observaciones?.trim() || '',
    minutos: 0,
    comisionPct: Number(dto.comision_pct ?? 0),
    montoBruto: bruto,
    comision,
    montoNeto: Number(dto.monto_neto ?? bruto - comision),
    total: Number(dto.total ?? bruto),
    items: (dto.detalles ?? []).map(toDetalle),
    detalleTexto: resumenItems(dto.detalles),
  };
}

export interface LiquidacionVista {
  id: number | null;
  plataforma: string;
  fecha: string;
  montoBruto: number;
  comision: number;
  montoNeto: number;
  pedidos: number;
  referencia: string;
  origen: string;
}

export function toLiquidacion(dto: LiquidacionDeliveryDto): LiquidacionVista {
  return {
    id: dto.id,
    plataforma: dto.plataforma,
    fecha: dto.fecha ?? '',
    montoBruto: Number(dto.monto_bruto ?? 0),
    comision: Number(dto.comision ?? 0),
    montoNeto: Number(dto.monto_neto ?? 0),
    pedidos: Number(dto.pedidos ?? 0),
    referencia: dto.referencia ?? '',
    origen: dto.origen ?? '',
  };
}

// ---------------------------------------------------------------------------
// Fase 2 — Reportes (vista lista para renderizar con el diseño actual)
// ---------------------------------------------------------------------------

export type ReporteTipoId =
  | 'ventas'
  | 'costos'
  | 'merma'
  | 'devoluciones'
  | 'inventario'
  | 'activos'
  | 'personal';

const TIPOS_REPORTE: readonly ReporteTipoId[] = [
  'ventas',
  'costos',
  'merma',
  'devoluciones',
  'inventario',
  'activos',
  'personal',
];

export interface ReporteFilaVista {
  label: string;
  monto: string;
  pct: number;
  tono: 'brand' | 'soft' | 'neutral';
}

export interface ReporteVista {
  kpiLabel: string;
  kpiValor: string;
  prefijo: string;
  variacion: string;
  secundarioUno: { label: string; valor: string };
  secundarioDos: { label: string; valor: string };
  seccion: string;
  seccionMeta: string;
  filas: ReporteFilaVista[];
  pieIzquierda: string;
  pieDerecha: string;
  resumen: string;
}

type FilaCruda = Record<string, unknown>;

const numeroSeguro = (valor: unknown): number => {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const montoTexto = (valor: number): string =>
  valor.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CLAVES_ETIQUETA = [
  'nombre',
  'etiqueta',
  'label',
  'canal',
  'metodo',
  'dia',
  'fecha',
  'clave',
  'tipo',
  'categoria',
  'estado',
  'resolucion',
  'clasificacion',
  'platillo',
  'proveedor',
  'rol',
  'plataforma',
] as const;

function etiquetaDe(fila: FilaCruda, indice: number): string {
  for (const clave of CLAVES_ETIQUETA) {
    const valor = fila[clave];
    if (typeof valor === 'string' && valor.trim()) {
      return valor;
    }
  }
  return `Fila ${indice + 1}`;
}

function valorDe(fila: FilaCruda, claves: readonly string[]): number {
  for (const clave of claves) {
    const valor = fila[clave];
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return valor;
    }
    if (typeof valor === 'string' && valor.trim() && Number.isFinite(Number(valor))) {
      return Number(valor);
    }
  }
  return 0;
}

function filasVista(
  lista: unknown,
  claves: readonly string[],
  formato: (valor: number) => string,
  limite = 8,
): ReporteFilaVista[] {
  if (!Array.isArray(lista)) {
    return [];
  }
  const filas = (lista as FilaCruda[]).slice(0, limite).map((fila, indice) => ({
    label: etiquetaDe(fila, indice),
    valor: valorDe(fila, claves),
  }));
  const maximo = filas.reduce((mayor, fila) => Math.max(mayor, fila.valor), 0);
  return filas.map((fila, indice) => ({
    label: fila.label,
    monto: formato(fila.valor),
    pct: maximo > 0 ? Math.max(4, Math.round((fila.valor / maximo) * 100)) : 0,
    tono: indice === 0 ? 'brand' : indice < 3 ? 'soft' : 'neutral',
  }));
}

const soloNumero = (valor: number): string => String(valor);

function bloque(dto: Record<string, unknown>, clave: string): Record<string, unknown> {
  const valor = dto[clave];
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
}

function cantidadFilas(lista: unknown): number {
  return Array.isArray(lista) ? lista.length : 0;
}

function limitacionDe(dto: Record<string, unknown>): string {
  const meta = bloque(dto, 'meta');
  const limitacion = meta['limitacion'];
  return typeof limitacion === 'string' ? limitacion : '';
}

export function toTiposReporte(data: Array<string | ReporteTipoDto>): ReporteTipoId[] {
  const ids: ReporteTipoId[] = [];
  for (const item of data) {
    const tipo = typeof item === 'string' ? item : item.tipo;
    const normalizado = String(tipo || '').toLowerCase();
    const encontrado = TIPOS_REPORTE.find((valor) => valor === normalizado);
    if (encontrado && !ids.includes(encontrado)) {
      ids.push(encontrado);
    }
  }
  return ids.length > 0 ? ids : [...TIPOS_REPORTE];
}

export function toReporteVista(tipo: string, payload: unknown): ReporteVista {
  const dto =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  switch (tipo) {
    case 'costos': {
      const compras = bloque(dto, 'compras');
      const gastos = bloque(dto, 'gastos');
      const mermas = bloque(dto, 'mermas');
      const totalCompras = numeroSeguro(compras['total']);
      const totalGastos = numeroSeguro(gastos['total']);
      const totalMermas = numeroSeguro(mermas['total']);
      const total = numeroSeguro(dto['total_costos']);
      const rubros = [
        { label: 'Compras de insumos', valor: totalCompras },
        { label: 'Gastos operativos', valor: totalGastos },
        { label: 'Merma aprobada', valor: totalMermas },
      ];
      const maximo = rubros.reduce((mayor, fila) => Math.max(mayor, fila.valor), 0);
      return {
        kpiLabel: 'Costo operativo',
        kpiValor: montoTexto(total),
        prefijo: 'S/',
        variacion: 'real',
        secundarioUno: { label: 'Compras', valor: formatearMoneda(totalCompras) },
        secundarioDos: { label: 'Gastos', valor: formatearMoneda(totalGastos) },
        seccion: 'Costos por rubro',
        seccionMeta: 'monto del período',
        filas: rubros.map((fila) => ({
          label: fila.label,
          monto: formatearMoneda(fila.valor),
          pct: maximo > 0 ? Math.max(4, Math.round((fila.valor / maximo) * 100)) : 0,
          tono: fila === rubros[0] ? 'brand' : fila === rubros[1] ? 'soft' : 'neutral',
        })),
        pieIzquierda: `${numeroSeguro(compras['registros'])} compras · ${numeroSeguro(
          gastos['registros'],
        )} gastos · ${numeroSeguro(mermas['registros'])} mermas`,
        pieDerecha: `Merma S/ ${montoTexto(totalMermas)} · food cost incluido`,
        resumen: `Compras + gastos + merma · S/ ${montoTexto(total)}`,
      };
    }
    case 'merma': {
      const total = numeroSeguro(dto['total_costo']);
      const registros = numeroSeguro(dto['registros']);
      const clasificaciones = cantidadFilas(dto['por_clasificacion']);
      return {
        kpiLabel: 'Costo de merma',
        kpiValor: montoTexto(total),
        prefijo: 'S/',
        variacion: 'real',
        secundarioUno: { label: 'Registros', valor: String(registros) },
        secundarioDos: { label: 'Clasificaciones', valor: String(clasificaciones) },
        seccion: 'Merma por tipo',
        seccionMeta: 'costo estimado',
        filas: filasVista(dto['por_tipo'], ['costo', 'total', 'monto'], formatearMoneda),
        pieIzquierda: `${registros} registros aprobados · ${cantidadFilas(dto['por_tipo'])} tipos`,
        pieDerecha: `Merma evitable e inevitable separadas en el detalle`,
        resumen: `${registros} registros · S/ ${montoTexto(total)}`,
      };
    }
    case 'devoluciones': {
      const reembolsado = numeroSeguro(dto['monto_reembolsado']);
      const registros = numeroSeguro(dto['registros']);
      return {
        kpiLabel: 'Monto reembolsado',
        kpiValor: montoTexto(reembolsado),
        prefijo: 'S/',
        variacion: 'real',
        secundarioUno: { label: 'Registros', valor: String(registros) },
        secundarioDos: {
          label: 'Resoluciones',
          valor: String(cantidadFilas(dto['por_resolucion'])),
        },
        seccion: 'Devoluciones por estado',
        seccionMeta: 'casos del período',
        filas: filasVista(dto['por_estado'], ['registros'], (valor) => `${valor} casos`),
        pieIzquierda: `${registros} casos · ${cantidadFilas(dto['por_resolucion'])} resoluciones`,
        pieDerecha: `Reembolsado S/ ${montoTexto(reembolsado)}`,
        resumen: `${registros} registros · S/ ${montoTexto(reembolsado)} reembolsado`,
      };
    }
    case 'inventario': {
      const totalInsumos = numeroSeguro(dto['total_insumos']);
      const valorTotal = numeroSeguro(dto['valor_total']);
      const bajoMinimo = numeroSeguro(dto['bajo_minimo']);
      return {
        kpiLabel: 'Insumos bajo mínimo',
        kpiValor: String(bajoMinimo),
        prefijo: '',
        variacion: bajoMinimo > 0 ? 'alerta' : 'ok',
        secundarioUno: { label: 'Valorizado', valor: formatearMoneda(valorTotal) },
        secundarioDos: { label: 'Insumos', valor: String(totalInsumos) },
        seccion: 'Inventario por categoría',
        seccionMeta: 'valorización actual',
        filas: filasVista(dto['por_categoria'], ['valor', 'total'], formatearMoneda),
        pieIzquierda: `${totalInsumos} insumos activos · ${bajoMinimo} bajo mínimo`,
        pieDerecha: `Valorizado S/ ${montoTexto(valorTotal)}`,
        resumen: `${totalInsumos} insumos · ${bajoMinimo} alertas`,
      };
    }
    case 'activos': {
      const totalActivos = numeroSeguro(dto['total_activos']);
      const valor = numeroSeguro(dto['valor_adquisicion']);
      const reparacion = numeroSeguro(dto['en_reparacion']);
      return {
        kpiLabel: 'Activos registrados',
        kpiValor: String(totalActivos),
        prefijo: '',
        variacion: `${reparacion} en reparación`,
        secundarioUno: { label: 'Valor adquisición', valor: formatearMoneda(valor) },
        secundarioDos: { label: 'En reparación', valor: String(reparacion) },
        seccion: 'Activos por categoría',
        seccionMeta: 'valor de adquisición',
        filas: filasVista(dto['por_categoria'], ['valor', 'total'], formatearMoneda),
        pieIzquierda: `${totalActivos} activos · ${reparacion} en reparación · ${numeroSeguro(
          dto['dados_de_baja'],
        )} de baja`,
        pieDerecha: `Mantenimientos S/ ${montoTexto(numeroSeguro(dto['costo_mantenimientos']))}`,
        resumen: `${totalActivos} activos · S/ ${montoTexto(valor)}`,
      };
    }
    case 'personal': {
      const totalUsuarios = numeroSeguro(dto['total_usuarios']);
      return {
        kpiLabel: 'Usuarios activos',
        kpiValor: String(totalUsuarios),
        prefijo: '',
        variacion: 'multi-rol',
        secundarioUno: { label: 'Roles', valor: String(cantidadFilas(dto['por_rol'])) },
        secundarioDos: { label: 'Usuarios', valor: String(cantidadFilas(dto['usuarios'])) },
        seccion: 'Usuarios por rol',
        seccionMeta: 'asignaciones activas',
        filas: filasVista(dto['por_rol'], ['usuarios', 'cantidad', 'total'], soloNumero),
        pieIzquierda: `${totalUsuarios} usuarios activos · RBAC multi-rol`,
        pieDerecha: `Permisos granulares por rol`,
        resumen: `${totalUsuarios} usuarios · ${cantidadFilas(dto['por_rol'])} roles`,
      };
    }
    default: {
      const total = numeroSeguro(dto['total']);
      const pagos = numeroSeguro(dto['cantidad_pagos']);
      const tickets = numeroSeguro(dto['cantidad_tickets']);
      return {
        kpiLabel: 'Ventas netas',
        kpiValor: montoTexto(total),
        prefijo: 'S/',
        variacion: 'real',
        secundarioUno: { label: 'Pagos', valor: String(pagos) },
        secundarioDos: {
          label: 'Ticket promedio',
          valor: formatearMoneda(numeroSeguro(dto['ticket_promedio'])),
        },
        seccion: 'Ventas por canal',
        seccionMeta: 'monto cobrado',
        filas: filasVista(dto['por_canal'], ['monto', 'total'], formatearMoneda),
        pieIzquierda: `${tickets} tickets · ${pagos} pagos`,
        pieDerecha: `Ticket promedio S/ ${montoTexto(numeroSeguro(dto['ticket_promedio']))}`,
        resumen: `${pagos} pagos · ${tickets} tickets · S/ ${montoTexto(total)}`,
      };
    }
  }
}

export function limitacionReporte(payload: unknown): string | null {
  const dto =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const limitacion = limitacionDe(dto);
  return limitacion.trim() || null;
}

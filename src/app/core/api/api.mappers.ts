import type {
  CanalPedido,
  CategoriaInsumo,
  CategoriaPlatillo,
  ComprobanteTipo,
  Cuenta,
  EstadoCuenta,
  EstadoMesa,
  EstadoPago,
  EstadoPedido,
  EstadoPreparacion,
  Insumo,
  Mesa,
  MetodoPago,
  MovimientoStock,
  Pago,
  Pedido,
  PedidoDetalle,
  Plato,
  Ronda,
  TipoConsumo,
  UnidadMedida,
} from '../models';
import type {
  CuentaDto,
  DetallePedidoDto,
  InsumoDto,
  KdsPedidoDto,
  MesaDto,
  MovimientoDto,
  PagoDto,
  PedidoDto,
  PlatoDto,
} from './api.types';

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
  return {
    id: dto.id,
    platilloId: dto.platillo_id,
    nombre: dto.platillo_nombre ?? `Platillo ${dto.platillo_id}`,
    cantidad: dto.cantidad,
    precioUnitario: dto.precio_unitario,
    subtotal: dto.subtotal,
    notas: dto.notas ?? undefined,
    estadoPreparacion: toEstadoPreparacion(dto.estado_preparacion),
    fechaInicioPrep: dto.fecha_inicio_prep ?? undefined,
    fechaListo: dto.fecha_listo ?? undefined,
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
  };
}

export function toPedidoKds(dto: KdsPedidoDto): Pedido {
  return {
    id: dto.id,
    numero: dto.numero,
    fechaPedido: dto.fecha_pedido,
    canal: toCanal(dto.canal),
    tipoConsumo: toTipoConsumo(dto.tipo_consumo),
    mesaId: dto.mesa_id ?? null,
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
    items: dto.detalles.map(toDetalle),
  };
}

export function toCuenta(dto: CuentaDto): Cuenta {
  const rondas = (dto.pedidos ?? []).map((pedido, indice) => toRonda(pedido, indice + 1));
  return {
    id: dto.id,
    mesaId: dto.mesa_id,
    estado: toEstadoCuenta(dto.estado),
    total: dto.total,
    fechaApertura: dto.fecha_apertura,
    usuarioAperturaId: dto.usuario_apertura_id,
    usuarioAperturaNombre: dto.usuario_apertura_nombre ?? undefined,
    fechaCierre: dto.fecha_cierre ?? undefined,
    usuarioCierreId: dto.usuario_cierre_id ?? undefined,
    comprobanteTipo: toComprobanteTipo(dto.comprobante_tipo),
    comprobanteNumero: dto.comprobante_numero ?? undefined,
    ...(dto.cliente
      ? {
          cliente: {
            tipoDocumento: dto.cliente.tipo_documento === 'RUC' ? 'RUC' : 'DNI',
            numeroDocumento: dto.cliente.numero_documento ?? '',
            nombre: dto.cliente.nombre,
            telefono: dto.cliente.telefono ?? undefined,
          },
        }
      : {}),
    rondas,
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

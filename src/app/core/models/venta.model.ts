export type EstadoMesa = 'libre' | 'ocupada';

export type EstadoCuenta = 'abierta' | 'cobrada' | 'cancelada';

export type ComprobanteTipo = 'ticket' | 'boleta' | 'ninguno';

export type TipoDocumentoCliente = 'DNI' | 'RUC';

export interface DatosCliente {
  tipoDocumento: TipoDocumentoCliente;
  numeroDocumento: string;
  nombre: string;
  telefono?: string;
  correo?: string;
}

export type EstadoPedido = 'borrador' | 'en_cocina' | 'servido' | 'cobrado' | 'cancelado';

export type EstadoPago = 'pendiente' | 'pagado' | 'contraentrega_pendiente';

export type EstadoPreparacion = 'pendiente' | 'en_preparacion' | 'listo';

export type CanalPedido = 'local' | 'whatsapp' | 'delivery_propio' | 'rappi' | 'llamafood';

export type TipoConsumo = 'sala' | 'para_llevar' | 'delivery';

export type MetodoPago = 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia';

export interface Mesa {
  id: number;
  numero: number;
  estado: EstadoMesa;
  activa: boolean;
  cuentaAbierta?: Cuenta | null;
}

export interface PedidoDetalle {
  id: number;
  platilloId: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notas?: string;
  estadoPreparacion: EstadoPreparacion;
  fechaInicioPrep?: string;
  fechaListo?: string;
}

export interface Ronda {
  id: number;
  numero: number;
  creadaEn: string;
  estado: EstadoPedido;
  items: PedidoDetalle[];
  total: number;
}

export interface Cuenta {
  id: number;
  mesaId: number;
  mesaNumero?: number;
  estado: EstadoCuenta;
  total: number;
  fechaApertura: string;
  usuarioAperturaId: number;
  usuarioAperturaNombre?: string;
  fechaCierre?: string;
  usuarioCierreId?: number;
  comprobanteTipo: ComprobanteTipo;
  comprobanteNumero?: string;
  cliente?: DatosCliente;
  rondas: Ronda[];
}

export interface Pedido {
  id: number;
  numero: string;
  fechaPedido: string;
  canal: CanalPedido;
  tipoConsumo: TipoConsumo;
  mesaId: number | null;
  cuentaId: number | null;
  rondaId: number | null;
  clienteNombre?: string;
  repartidorId?: number;
  usuarioCajeroId: number;
  estado: EstadoPedido;
  estadoPago: EstadoPago;
  metodoPago?: MetodoPago;
  subtotal: number;
  igv: number;
  total: number;
  comisionPlataforma: number;
  costoDelivery: number;
  direccionEntrega?: string;
  referenciaEntrega?: string;
  observaciones?: string;
  comprobanteTipo: ComprobanteTipo;
  items: PedidoDetalle[];
  fechaEntrega?: string;
}

export interface Pago {
  id: number;
  pedidoId: number | null;
  cuentaId: number | null;
  metodo: MetodoPago;
  monto: number;
  esContraentrega: boolean;
  fecha: string;
  usuarioId: number;
}

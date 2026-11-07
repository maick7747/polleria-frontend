import type {
  Activo,
  Configuracion,
  Cuenta,
  Devolucion,
  Gasto,
  IngredienteFicha,
  Insumo,
  KpiResumen,
  Mantenimiento,
  Merma,
  Mesa,
  MovimientoStock,
  Pago,
  Pedido,
  PedidoDetalle,
  Permiso,
  PermisosPorRol,
  Plato,
  Reporte,
  Rol,
  RolNombre,
  Ronda,
  Usuario,
} from '../models';

export interface UsuarioMock extends Usuario {
  password: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const MOCK_PERMISOS: readonly Permiso[] = [
  { id: 1, codigo: 'venta.registrar', descripcion: 'Registrar pedidos y rondas', modulo: 'venta-local', activo: true },
  { id: 2, codigo: 'caja.cobrar', descripcion: 'Cerrar cuentas y registrar pagos', modulo: 'cerrar-cuenta', activo: true },
  { id: 3, codigo: 'cocina.kds', descripcion: 'Operar el KDS de cocina', modulo: 'cocina', activo: true },
  { id: 4, codigo: 'delivery.propio', descripcion: 'Gestionar delivery propio y reparto', modulo: 'delivery-propio', activo: true },
  { id: 5, codigo: 'delivery.externo', descripcion: 'Gestionar pedidos de apps externas', modulo: 'delivery-externo', activo: true },
  { id: 6, codigo: 'compras.gestionar', descripcion: 'Registrar compras y proveedores', modulo: 'compras', activo: true },
  { id: 7, codigo: 'gastos.registrar', descripcion: 'Registrar gastos operativos', modulo: 'gastos', activo: true },
  { id: 8, codigo: 'merma.gestionar', descripcion: 'Registrar y aprobar mermas', modulo: 'merma', activo: true },
  { id: 9, codigo: 'devoluciones.gestionar', descripcion: 'Gestionar devoluciones y reembolsos', modulo: 'devoluciones', activo: true },
  { id: 10, codigo: 'menu.gestionar', descripcion: 'Administrar fichas técnicas y menú', modulo: 'fichas-tecnicas', activo: true },
  { id: 11, codigo: 'caja.cuadrar', descripcion: 'Abrir y cuadrar la caja diaria', modulo: 'cuadre-caja', activo: true },
  { id: 12, codigo: 'activos.gestionar', descripcion: 'Gestionar activos y mantenimientos', modulo: 'activos', activo: true },
  { id: 13, codigo: 'reportes.ver', descripcion: 'Consultar reportes y KPIs', modulo: 'reportes', activo: true },
  { id: 14, codigo: 'inventario.gestionar', descripcion: 'Verificar y ajustar inventario', modulo: 'inventario', activo: true },
  { id: 15, codigo: 'config.gestionar', descripcion: 'Administrar usuarios, roles y configuración', modulo: 'configuracion', activo: true },
];

export const MOCK_ROLES: readonly Rol[] = [
  { id: 1, nombre: 'Mozo', descripcion: 'Toma pedidos en sala y agrega rondas; no cobra.', activo: true },
  { id: 2, nombre: 'Cajero', descripcion: 'Cobra cuentas, gestiona delivery, devoluciones y cuadre.', activo: true },
  { id: 3, nombre: 'Cocinero', descripcion: 'Opera KDS, merma, fichas técnicas e inventario.', activo: true },
  { id: 4, nombre: 'Repartidor', descripcion: 'Entrega pedidos de delivery propio.', activo: true },
  { id: 5, nombre: 'Dueño/Admin', descripcion: 'Acceso total a operación, reportes y configuración.', activo: true },
  { id: 6, nombre: 'Admin', descripcion: 'Administración técnica: compras, gastos, activos y reportes.', activo: true },
];

export const PERMISOS_POR_ROL: PermisosPorRol = {
  Mozo: ['venta.registrar'],
  Cajero: [
    'venta.registrar',
    'caja.cobrar',
    'delivery.propio',
    'delivery.externo',
    'devoluciones.gestionar',
    'caja.cuadrar',
  ],
  Cocinero: ['cocina.kds', 'merma.gestionar', 'menu.gestionar', 'inventario.gestionar'],
  Repartidor: ['delivery.propio'],
  'Dueño/Admin': MOCK_PERMISOS.map((p) => p.codigo),
  Admin: ['compras.gestionar', 'gastos.registrar', 'activos.gestionar', 'reportes.ver', 'config.gestionar'],
};

const permisosDe = (roles: RolNombre[]): string[] => [
  ...new Set(roles.flatMap((rol) => PERMISOS_POR_ROL[rol])),
];

const usuario = (
  id: number,
  nombre: string,
  email: string,
  telefono: string,
  roles: RolNombre[],
  password: string,
): UsuarioMock => ({
  id,
  nombre,
  email,
  telefono,
  activo: true,
  roles,
  permisos: permisosDe(roles),
  password,
});

export const MOCK_USUARIOS: readonly UsuarioMock[] = [
  usuario(1, 'Maick Vicente', 'dueno@fratellis.pe', '987 654 321', ['Dueño/Admin'], 'dueno123'),
  usuario(2, 'Yair Salamán', 'mozo@fratellis.pe', '987 654 322', ['Mozo'], 'mozo123'),
  usuario(3, 'Rosa Quispe', 'cajero@fratellis.pe', '987 654 323', ['Cajero', 'Mozo'], 'cajero123'),
  usuario(4, 'Julio Ramos', 'cocina@fratellis.pe', '987 654 324', ['Cocinero'], 'cocina123'),
  usuario(5, 'Luis Paredes', 'reparto@fratellis.pe', '987 654 325', ['Repartidor'], 'reparto123'),
  usuario(6, 'Sofía Torres', 'tecnico@fratellis.pe', '987 654 326', ['Admin'], 'tecnico123'),
];

export const MOCK_MESAS: readonly Mesa[] = Array.from({ length: 10 }, (_, i): Mesa => ({
  id: i + 1,
  numero: i + 1,
  estado: [2, 4, 7].includes(i + 1) ? 'ocupada' : 'libre',
  activa: true,
}));

const detalle = (
  id: number,
  platilloId: number,
  nombre: string,
  cantidad: number,
  precioUnitario: number,
  estadoPreparacion: PedidoDetalle['estadoPreparacion'] = 'pendiente',
  notas?: string,
): PedidoDetalle => ({
  id,
  platilloId,
  nombre,
  cantidad,
  precioUnitario,
  subtotal: round2(cantidad * precioUnitario),
  estadoPreparacion,
  notas,
});

const ronda = (id: number, numero: number, creadaEn: string, items: PedidoDetalle[]): Ronda => ({
  id,
  numero,
  creadaEn,
  estado: 'en_cocina',
  items,
  total: round2(items.reduce((s, i) => s + i.subtotal, 0)),
});

export const MOCK_CUENTAS: readonly Cuenta[] = [
  {
    id: 1,
    mesaId: 2,
    estado: 'abierta',
    total: 64.5,
    fechaApertura: '2026-10-14T16:56:00-05:00',
    usuarioAperturaId: 2,
    comprobanteTipo: 'boleta',
    rondas: [
      ronda(1, 1, '2026-10-14T16:56:00-05:00', [
        detalle(1, 1, '1/4 de pollo', 1, 12.9, 'listo'),
        detalle(2, 5, 'Papas fritas', 1, 8.9, 'listo'),
        detalle(3, 7, 'Chicha morada', 1, 6.9, 'listo'),
      ]),
      ronda(2, 2, '2026-10-14T17:12:00-05:00', [
        detalle(4, 2, '1/2 pollo', 1, 22.9, 'en_preparacion'),
        detalle(5, 8, 'Ensalada fresca', 1, 7.9, 'pendiente'),
        detalle(6, 9, 'Gaseosa', 1, 5, 'pendiente'),
      ]),
    ],
  },
  {
    id: 2,
    mesaId: 4,
    estado: 'abierta',
    total: 75.3,
    fechaApertura: '2026-10-14T16:40:00-05:00',
    usuarioAperturaId: 3,
    comprobanteTipo: 'boleta',
    rondas: [
      ronda(3, 1, '2026-10-14T16:40:00-05:00', [
        detalle(7, 1, '1/4 de pollo', 1, 12.9, 'listo'),
        detalle(8, 5, 'Papas fritas', 1, 8.9, 'listo'),
        detalle(9, 7, 'Chicha morada', 1, 6.9, 'listo'),
      ]),
      ronda(4, 2, '2026-10-14T17:02:00-05:00', [
        detalle(10, 2, '1/2 pollo', 1, 22.9, 'en_preparacion'),
        detalle(11, 7, 'Chicha morada', 1, 6.9, 'pendiente'),
      ]),
      ronda(5, 3, '2026-10-14T17:18:00-05:00', [
        detalle(12, 5, 'Papas fritas', 1, 8.9, 'pendiente'),
        detalle(13, 8, 'Ensalada fresca', 1, 7.9, 'pendiente'),
      ]),
    ],
  },
  {
    id: 3,
    mesaId: 7,
    estado: 'abierta',
    total: 46.6,
    fechaApertura: '2026-10-14T17:06:00-05:00',
    usuarioAperturaId: 2,
    comprobanteTipo: 'ticket',
    rondas: [
      ronda(6, 1, '2026-10-14T17:06:00-05:00', [
        detalle(14, 2, '1/2 pollo', 1, 22.9, 'en_preparacion'),
        detalle(15, 5, 'Papas fritas', 1, 8.9, 'pendiente'),
        detalle(16, 7, 'Chicha morada', 1, 6.9, 'pendiente'),
        detalle(17, 8, 'Ensalada fresca', 1, 7.9, 'pendiente'),
      ]),
    ],
  },
];

const pedido = (
  id: number,
  numero: string,
  fechaPedido: string,
  canal: Pedido['canal'],
  tipoConsumo: Pedido['tipoConsumo'],
  estado: Pedido['estado'],
  total: number,
  items: PedidoDetalle[],
  extra: Partial<Pedido> = {},
): Pedido => {
  const subtotal = round2(total / 1.18);
  return {
    id,
    numero,
    fechaPedido,
    canal,
    tipoConsumo,
    mesaId: null,
    cuentaId: null,
    rondaId: null,
    usuarioCajeroId: 3,
    estado,
    estadoPago: estado === 'cobrado' ? 'pagado' : 'pendiente',
    metodoPago: estado === 'cobrado' ? 'efectivo' : undefined,
    subtotal,
    igv: round2(total - subtotal),
    total,
    comisionPlataforma: 0,
    costoDelivery: 0,
    comprobanteTipo: 'ticket',
    items,
    ...extra,
  };
};

export const MOCK_PEDIDOS: readonly Pedido[] = [
  pedido(1, '#0124', '2026-10-14T17:18:00-05:00', 'local', 'sala', 'en_cocina', 45, [
    detalle(101, 1, '1/4 de pollo', 1, 12.9, 'en_preparacion'),
    detalle(102, 2, '1/2 pollo', 1, 22.9, 'pendiente'),
    detalle(103, 5, 'Papas fritas', 1, 8.9, 'pendiente'),
  ], { mesaId: 4, cuentaId: 2, rondaId: 5 }),
  pedido(2, '#0123', '2026-10-14T17:04:00-05:00', 'rappi', 'delivery', 'en_cocina', 62.5, [
    detalle(104, 3, 'Pollo entero', 1, 42.9, 'en_preparacion'),
    detalle(105, 5, 'Papas fritas', 1, 8.9, 'en_preparacion'),
    detalle(106, 7, 'Chicha morada', 1, 6.9, 'listo'),
  ], {
    comisionPlataforma: 15.63,
    direccionEntrega: 'Jr. Puno 245',
    clienteNombre: 'Andrea R.',
  }),
  pedido(3, '#0122', '2026-10-14T16:52:00-05:00', 'delivery_propio', 'delivery', 'en_cocina', 38, [
    detalle(107, 2, '1/2 pollo', 1, 22.9, 'en_preparacion'),
    detalle(108, 5, 'Papas fritas', 1, 8.9, 'listo'),
  ], {
    direccionEntrega: 'Jr. Puno 512',
    repartidorId: 5,
    clienteNombre: 'Marco T.',
    costoDelivery: 5,
  }),
  pedido(4, '#0121', '2026-10-14T16:40:00-05:00', 'local', 'para_llevar', 'en_cocina', 29, [
    detalle(109, 1, '1/4 de pollo', 2, 12.9, 'listo'),
    detalle(110, 9, 'Gaseosa', 1, 5, 'listo'),
  ]),
  pedido(5, '#0120', '2026-10-14T16:20:00-05:00', 'local', 'sala', 'servido', 64.5, [
    detalle(111, 1, '1/4 de pollo', 1, 12.9, 'listo'),
    detalle(112, 2, '1/2 pollo', 1, 22.9, 'listo'),
    detalle(113, 5, 'Papas fritas', 1, 8.9, 'listo'),
    detalle(114, 7, 'Chicha morada', 1, 6.9, 'listo'),
  ], { mesaId: 2, cuentaId: 1, rondaId: 2 }),
  pedido(6, '#0119', '2026-10-14T16:05:00-05:00', 'delivery_propio', 'delivery', 'en_cocina', 54.2, [
    detalle(115, 3, 'Pollo entero', 1, 42.9, 'en_preparacion'),
    detalle(116, 8, 'Ensalada fresca', 1, 7.9, 'pendiente'),
  ], {
    direccionEntrega: 'Av. Ferrocarril 973',
    repartidorId: 5,
    clienteNombre: 'Lucía P.',
    costoDelivery: 4,
  }),
  pedido(7, '#0118', '2026-10-14T15:58:00-05:00', 'delivery_propio', 'delivery', 'en_cocina', 48.9, [
    detalle(117, 2, '1/2 pollo', 2, 22.9, 'pendiente'),
  ], {
    direccionEntrega: 'Calle Real 120',
    repartidorId: 5,
    clienteNombre: 'Diego S.',
  }),
  pedido(8, '#0117', '2026-10-14T15:40:00-05:00', 'llamafood', 'delivery', 'en_cocina', 46.6, [
    detalle(118, 2, '1/2 pollo', 1, 22.9, 'listo'),
    detalle(119, 8, 'Ensalada fresca', 1, 7.9, 'en_preparacion'),
    detalle(120, 7, 'Chicha morada', 1, 6.9, 'listo'),
  ], { comisionPlataforma: 9.32, direccionEntrega: 'Jr. Loreto 88', clienteNombre: 'Paola M.' }),
  pedido(9, '#0116', '2026-10-14T15:10:00-05:00', 'local', 'sala', 'cobrado', 72, [
    detalle(121, 3, 'Pollo entero', 1, 42.9, 'listo'),
    detalle(122, 5, 'Papas fritas', 2, 8.9, 'listo'),
  ], { mesaId: 9 }),
  pedido(10, '#0115', '2026-10-14T14:55:00-05:00', 'whatsapp', 'para_llevar', 'cobrado', 35, [
    detalle(123, 1, '1/4 de pollo', 2, 12.9, 'listo'),
    detalle(124, 9, 'Gaseosa', 2, 5, 'listo'),
  ]),
];

export const MOCK_PAGOS: readonly Pago[] = [
  { id: 1, pedidoId: 9, cuentaId: null, metodo: 'efectivo', monto: 72, esContraentrega: false, fecha: '2026-10-14T15:24:00-05:00', usuarioId: 3 },
  { id: 2, pedidoId: 10, cuentaId: null, metodo: 'yape', monto: 35, esContraentrega: false, fecha: '2026-10-14T15:08:00-05:00', usuarioId: 3 },
  { id: 3, pedidoId: null, cuentaId: null, metodo: 'tarjeta', monto: 128.4, esContraentrega: false, fecha: '2026-10-14T13:40:00-05:00', usuarioId: 3 },
  { id: 4, pedidoId: null, cuentaId: null, metodo: 'efectivo', monto: 214.6, esContraentrega: false, fecha: '2026-10-14T12:55:00-05:00', usuarioId: 3 },
];

export const MOCK_INSUMOS: readonly Insumo[] = [
  { id: 1, codigo: 'INS-0001', nombre: 'Pollo entero', categoria: 'alimento', unidadMedida: 'kg', stockActual: 18.5, stockMinimo: 25, umbralMermaPct: 30, costoPromedio: 12.8, activo: true },
  { id: 2, codigo: 'INS-0002', nombre: 'Papa', categoria: 'alimento', unidadMedida: 'kg', stockActual: 12, stockMinimo: 20, umbralMermaPct: 8, costoPromedio: 3.2, activo: true },
  { id: 3, codigo: 'INS-0003', nombre: 'Ají amarillo', categoria: 'alimento', unidadMedida: 'kg', stockActual: 2.1, stockMinimo: 3, umbralMermaPct: 10, costoPromedio: 8.5, activo: true },
  { id: 4, codigo: 'INS-0004', nombre: 'Arroz', categoria: 'alimento', unidadMedida: 'kg', stockActual: 30, stockMinimo: 10, umbralMermaPct: 2, costoPromedio: 4.1, activo: true },
  { id: 5, codigo: 'INS-0005', nombre: 'Carbón', categoria: 'insumo_general', unidadMedida: 'kg', stockActual: 40, stockMinimo: 15, umbralMermaPct: 0, costoPromedio: 2.9, activo: true },
  { id: 6, codigo: 'INS-0006', nombre: 'Aceite', categoria: 'alimento', unidadMedida: 'l', stockActual: 8, stockMinimo: 5, umbralMermaPct: 3, costoPromedio: 9.4, activo: true },
  { id: 7, codigo: 'INS-0007', nombre: 'Gaseosa', categoria: 'bebida', unidadMedida: 'und', stockActual: 48, stockMinimo: 24, umbralMermaPct: 1, costoPromedio: 2.5, activo: true },
  { id: 8, codigo: 'INS-0008', nombre: 'Chicha morada', categoria: 'bebida', unidadMedida: 'l', stockActual: 20, stockMinimo: 10, umbralMermaPct: 2, costoPromedio: 3.1, activo: true },
  { id: 9, codigo: 'INS-0009', nombre: 'Sal', categoria: 'alimento', unidadMedida: 'kg', stockActual: 12, stockMinimo: 4, umbralMermaPct: 0, costoPromedio: 1.2, activo: true },
  { id: 10, codigo: 'INS-0010', nombre: 'Limón', categoria: 'alimento', unidadMedida: 'kg', stockActual: 9, stockMinimo: 6, umbralMermaPct: 12, costoPromedio: 4.8, activo: true },
  { id: 11, codigo: 'INS-0011', nombre: 'Caja para llevar', categoria: 'empaque', unidadMedida: 'und', stockActual: 120, stockMinimo: 60, umbralMermaPct: 1, costoPromedio: 0.65, activo: true },
  { id: 12, codigo: 'INS-0012', nombre: 'Leña', categoria: 'insumo_general', unidadMedida: 'kg', stockActual: 25, stockMinimo: 15, umbralMermaPct: 0, costoPromedio: 1.9, activo: true },
];

const ingrediente = (
  insumoId: number,
  nombre: string,
  cantidad: number,
  unidadMedida: IngredienteFicha['unidadMedida'],
  costoUnitario: number,
): IngredienteFicha => ({ insumoId, nombre, cantidad, unidadMedida, costoUnitario });

export const MOCK_PLATOS: readonly Plato[] = [
  {
    id: 1,
    nombre: '1/4 de pollo',
    descripcion: 'Cuarto de pollo a la brasa con papas y ensalada.',
    categoria: 'Pollos',
    precioVenta: 12.9,
    activo: true,
    ingredientes: [
      ingrediente(1, 'Pollo entero', 0.25, 'kg', 12.8),
      ingrediente(2, 'Papa', 0.2, 'kg', 3.2),
      ingrediente(10, 'Limón', 0.02, 'kg', 4.8),
    ],
  },
  {
    id: 2,
    nombre: '1/2 pollo',
    descripcion: 'Medio pollo a la brasa con papas y ensalada.',
    categoria: 'Pollos',
    precioVenta: 22.9,
    activo: true,
    ingredientes: [
      ingrediente(1, 'Pollo entero', 0.5, 'kg', 12.8),
      ingrediente(2, 'Papa', 0.3, 'kg', 3.2),
      ingrediente(10, 'Limón', 0.03, 'kg', 4.8),
    ],
  },
  {
    id: 3,
    nombre: 'Pollo entero',
    descripcion: 'Pollo entero a la brasa para compartir.',
    categoria: 'Pollos',
    precioVenta: 42.9,
    activo: true,
    ingredientes: [
      ingrediente(1, 'Pollo entero', 1, 'kg', 12.8),
      ingrediente(2, 'Papa', 0.5, 'kg', 3.2),
      ingrediente(10, 'Limón', 0.05, 'kg', 4.8),
    ],
  },
  {
    id: 4,
    nombre: 'Combo a lo millar',
    descripcion: 'Pollo, papas, ensalada y bebida personal.',
    categoria: 'Combos',
    precioVenta: 28.9,
    activo: true,
    ingredientes: [
      ingrediente(1, 'Pollo entero', 0.6, 'kg', 12.8),
      ingrediente(2, 'Papa', 0.3, 'kg', 3.2),
      ingrediente(8, 'Chicha morada', 0.25, 'l', 3.1),
    ],
  },
  {
    id: 5,
    nombre: 'Papas fritas',
    descripcion: 'Porción de papas fritas crocantes.',
    categoria: 'Guarniciones',
    precioVenta: 8.9,
    activo: true,
    ingredientes: [
      ingrediente(2, 'Papa', 0.3, 'kg', 3.2),
      ingrediente(6, 'Aceite', 0.05, 'l', 9.4),
      ingrediente(9, 'Sal', 0.005, 'kg', 1.2),
    ],
  },
  {
    id: 6,
    nombre: 'Arroz chaufa',
    descripcion: 'Arroz salteado al wok con verduras.',
    categoria: 'Guarniciones',
    precioVenta: 11.9,
    activo: true,
    ingredientes: [
      ingrediente(4, 'Arroz', 0.25, 'kg', 4.1),
      ingrediente(6, 'Aceite', 0.03, 'l', 9.4),
    ],
  },
  {
    id: 7,
    nombre: 'Chicha morada',
    descripcion: 'Vaso de chicha morada de la casa.',
    categoria: 'Bebidas',
    precioVenta: 6.9,
    activo: true,
    ingredientes: [ingrediente(8, 'Chicha morada', 0.3, 'l', 3.1)],
  },
  {
    id: 8,
    nombre: 'Ensalada fresca',
    descripcion: 'Ensalada de la casa con limón y sal.',
    categoria: 'Entradas',
    precioVenta: 7.9,
    activo: true,
    ingredientes: [
      ingrediente(10, 'Limón', 0.04, 'kg', 4.8),
      ingrediente(9, 'Sal', 0.003, 'kg', 1.2),
    ],
  },
  {
    id: 9,
    nombre: 'Gaseosa',
    descripcion: 'Gaseosa personal 500 ml.',
    categoria: 'Bebidas',
    precioVenta: 5,
    activo: true,
    ingredientes: [ingrediente(7, 'Gaseosa', 1, 'und', 2.5)],
  },
];

export const MOCK_MOVIMIENTOS: readonly MovimientoStock[] = [
  { id: 1, insumoId: 1, tipo: 'entrada', cantidad: 40, stockResultante: 58.5, referenciaTipo: 'compra', referenciaId: 1, usuarioId: 1, observacion: 'Compra recibida · proveedor Avícola Andina', fecha: '2026-10-14T09:10:00-05:00' },
  { id: 2, insumoId: 2, tipo: 'entrada', cantidad: 30, stockResultante: 42, referenciaTipo: 'compra', referenciaId: 1, usuarioId: 1, observacion: 'Compra recibida · proveedor Mercado Mayorista', fecha: '2026-10-14T09:12:00-05:00' },
  { id: 3, insumoId: 1, tipo: 'salida', cantidad: 40, stockResultante: 18.5, referenciaTipo: 'pedido', referenciaId: 5, usuarioId: 4, observacion: 'Consumo de producción · turno tarde', fecha: '2026-10-14T15:30:00-05:00' },
  { id: 4, insumoId: 1, tipo: 'merma', cantidad: 3.5, stockResultante: 15, referenciaTipo: 'merma', referenciaId: 1, usuarioId: 4, observacion: 'Merma aprobada · pollo quemado', fecha: '2026-10-14T16:10:00-05:00' },
  { id: 5, insumoId: 2, tipo: 'salida', cantidad: 25, stockResultante: 17, referenciaTipo: 'pedido', referenciaId: 6, usuarioId: 4, observacion: 'Consumo de producción · guarniciones', fecha: '2026-10-14T16:20:00-05:00' },
  { id: 6, insumoId: 3, tipo: 'ajuste', cantidad: -0.4, stockResultante: 2.1, referenciaTipo: 'ajuste', referenciaId: 1, usuarioId: 4, observacion: 'Ajuste por conteo físico', fecha: '2026-10-14T17:05:00-05:00' },
];

export const MOCK_MERMAS: readonly Merma[] = [
  {
    id: 1,
    tipo: 'Pollo',
    insumoId: 1,
    insumoNombre: 'Pollo entero',
    cantidad: 3.5,
    costoEstimado: 45,
    clasificacion: 'evitable',
    causaRaiz: 'Exceso de tiempo en parrilla',
    motivo: 'Pollo quemado durante el turno tarde',
    fecha: '2026-10-14',
    estado: 'aprobada',
    origen: 'registro_manual',
    usuarioRegistroId: 4,
    usuarioApruebaId: 1,
  },
  {
    id: 2,
    tipo: 'Guarniciones',
    insumoId: 2,
    insumoNombre: 'Papa',
    cantidad: 5,
    costoEstimado: 40,
    clasificacion: 'evitable',
    causaRaiz: 'Sobreproducción',
    motivo: 'Porción de papas no vendida al cierre de turno',
    fecha: '2026-10-14',
    estado: 'pendiente',
    origen: 'registro_manual',
    usuarioRegistroId: 4,
  },
];

export const MOCK_DEVOLUCIONES: readonly Devolucion[] = [
  {
    id: 1,
    pedidoId: 2,
    pedidoNumero: '#0123',
    pedidoDetalleId: 104,
    fechaReporte: '2026-10-14T17:22:00-05:00',
    motivo: 'Plato frío',
    detalle: 'El cliente reporta que el pollo llegó frío por demora del reparto.',
    montoReembolsado: 0,
    estado: 'pendiente',
  },
  {
    id: 2,
    pedidoId: 9,
    pedidoNumero: '#0116',
    fechaReporte: '2026-10-14T15:40:00-05:00',
    motivo: 'Falta un acompañamiento',
    detalle: 'No se incluyó la ensalada en el pedido.',
    montoReembolsado: 7.9,
    estado: 'aceptada',
    resolucion: 'reembolso_parcial',
    decididoPorId: 1,
    fechaResolucion: '2026-10-14T15:48:00-05:00',
  },
];

export const MOCK_GASTOS: readonly Gasto[] = [
  { id: 1, fecha: '2026-10-14', categoria: 'servicios_basicos', descripcion: 'Recibo de luz del local', monto: 180, metodoPago: 'efectivo', descuentaCajaChica: true, usuarioId: 1 },
  { id: 2, fecha: '2026-10-14', categoria: 'limpieza', descripcion: 'Insumos de limpieza', monto: 45, metodoPago: 'yape', descuentaCajaChica: false, usuarioId: 6 },
  { id: 3, fecha: '2026-10-13', categoria: 'transporte', descripcion: 'Movilidad de compras', monto: 25, metodoPago: 'efectivo', descuentaCajaChica: true, usuarioId: 1 },
];

export const MOCK_ACTIVOS: readonly Activo[] = [
  { id: 1, nombre: 'Horno a la brasa', categoria: 'cocina', cantidad: 1, costoAdquisicion: 3800, vidaUtilMeses: 60, fechaAdquisicion: '2024-03-12', estado: 'activo', ultimoMantenimiento: '2026-09-02', proximoMantenimiento: '2026-12-02', proveedor: 'Brasa Andina S.A.C.', garantiaMeses: 24, observaciones: 'Uso intensivo en turno tarde.', usuarioId: 1 },
  { id: 2, nombre: 'Refrigeradora industrial', categoria: 'cocina', cantidad: 1, costoAdquisicion: 4200, vidaUtilMeses: 72, fechaAdquisicion: '2023-08-20', estado: 'activo', ultimoMantenimiento: '2026-08-15', proximoMantenimiento: '2026-11-15', proveedor: 'Frío Andino S.A.C.', garantiaMeses: 36, observaciones: 'Mantiene insumos perecederos.', usuarioId: 1 },
  { id: 3, nombre: 'Motocicleta de reparto', categoria: 'delivery', cantidad: 1, costoAdquisicion: 6500, vidaUtilMeses: 84, fechaAdquisicion: '2025-01-10', estado: 'en_reparacion', ultimoMantenimiento: '2026-10-01', proximoMantenimiento: '2026-10-20', proveedor: 'Moto Repuestos Huancayo', garantiaMeses: 24, observaciones: 'En taller por cambio de frenos.', usuarioId: 1 },
  { id: 4, nombre: 'Freidora eléctrica', categoria: 'cocina', cantidad: 1, costoAdquisicion: 1200, vidaUtilMeses: 48, fechaAdquisicion: '2024-11-05', estado: 'activo', ultimoMantenimiento: '2026-07-10', proximoMantenimiento: '2027-01-10', proveedor: 'Equipos Perú', garantiaMeses: 12, observaciones: 'Revisión mensual de resistencias.', usuarioId: 1 },
  { id: 5, nombre: 'Laptop de caja', categoria: 'oficina', cantidad: 1, costoAdquisicion: 2800, vidaUtilMeses: 48, fechaAdquisicion: '2025-02-18', estado: 'activo', proximoMantenimiento: '2027-02-18', proveedor: 'CompuCenter', garantiaMeses: 24, observaciones: 'Registro de caja y reportes.', usuarioId: 6 },
];

export const MOCK_MANTENIMIENTOS: readonly Mantenimiento[] = [
  { id: 1, activoId: 3, tipo: 'correctivo', fecha: '2026-10-12', programadaPara: '2026-10-20', descripcion: 'Cambio de frenos y revisión de motor', costoReparacion: 240, costoReposicion: 6500, decision: 'reparar', estado: 'en_proceso', usuarioId: 1 },
  { id: 2, activoId: 1, tipo: 'preventivo', fecha: '2026-12-02', programadaPara: '2026-12-02', descripcion: 'Limpieza profunda y calibración', costoReparacion: 0, costoReposicion: 0, estado: 'programado', usuarioId: 1 },
];

export const MOCK_REPORTES: readonly Reporte[] = [
  { id: 1, nombre: 'Ventas por día', tipo: 'ventas', periodo: '14/10/2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 2, nombre: 'Costos operativos', tipo: 'costos', periodo: 'Octubre 2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 3, nombre: 'Merma por tipo', tipo: 'merma', periodo: 'Octubre 2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 4, nombre: 'Devoluciones y tendencia', tipo: 'devoluciones', periodo: 'Octubre 2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 5, nombre: 'Stock y alertas', tipo: 'inventario', periodo: '14/10/2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 6, nombre: 'Activos y mantenimiento', tipo: 'activos', periodo: 'Octubre 2026', generadoEn: '2026-10-14T17:00:00-05:00' },
  { id: 7, nombre: 'Personal y roles', tipo: 'personal', periodo: 'Octubre 2026', generadoEn: '2026-10-14T17:00:00-05:00' },
];

export const MOCK_CONFIGURACION: readonly Configuracion[] = [
  { id: 1, clave: 'igv_pct', valor: '18', descripcion: 'IGV aplicado a las ventas (%)', actualizadoEn: '2026-10-01T09:00:00-05:00' },
  { id: 2, clave: 'meta_ventas_diaria', valor: '3000', descripcion: 'Meta diaria de ventas (S/)', actualizadoEn: '2026-10-01T09:00:00-05:00' },
  { id: 3, clave: 'kds_sla_min', valor: '30', descripcion: 'Minutos antes de marcar una comanda como prioritaria', actualizadoEn: '2026-10-01T09:00:00-05:00' },
  { id: 4, clave: 'comision_rappi_pct', valor: '25', descripcion: 'Comisión de Rappi (%)', actualizadoEn: '2026-10-01T09:00:00-05:00' },
  { id: 5, clave: 'comision_llamafood_pct', valor: '20', descripcion: 'Comisión de LlamaFood (%)', actualizadoEn: '2026-10-01T09:00:00-05:00' },
  { id: 6, clave: 'nombre_negocio', valor: "Fratelli's Restaurante", descripcion: 'Nombre comercial', actualizadoEn: '2026-10-01T09:00:00-05:00' },
];

export const MOCK_KPIS: KpiResumen = {
  ventasHoy: 2450,
  ventasAyer: 2187.5,
  metaVentas: 3000,
  deltaPct: 12,
  actualizado: '17:20',
  totalPlatosCarta: 18,
  pedidosTop: 19,
  ingresosTop: 2450,
  mejorDia: 'sábado',
  mejorDiaMonto: 452,
  topPlatos: [
    { nombre: '1/4 de pollo', monto: 544, unidades: 54, porcentaje: 70 },
    { nombre: 'Pollo entero', monto: 782, unidades: 76, porcentaje: 100 },
    { nombre: 'Combo a lo millar', monto: 708, unidades: 69, porcentaje: 90 },
    { nombre: 'Papas fritas', monto: 259, unidades: 37, porcentaje: 33 },
    { nombre: 'Chicha morada', monto: 230, unidades: 46, porcentaje: 29 },
  ],
  serieSemana: [
    { dia: 'L', monto: 1850 },
    { dia: 'M', monto: 2210 },
    { dia: 'M', monto: 1980 },
    { dia: 'J', monto: 2640 },
    { dia: 'V', monto: 2310 },
    { dia: 'S', monto: 2980 },
    { dia: 'D', monto: 2450 },
  ],
};

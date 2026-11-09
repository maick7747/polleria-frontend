import { describe, expect, it } from 'vitest';
import {
  toCanal,
  toCuenta,
  toCuentaResumen,
  toPago,
  toPlato,
} from './api.mappers';
import type {
  CuentaDto,
  CuentaResumenDto,
  DetallePedidoDto,
  PagoDto,
  PedidoDto,
  PlatoDto,
} from './api.types';

const detalleDto = (
  overrides: Partial<DetallePedidoDto> = {},
): DetallePedidoDto => ({
  id: 1,
  pedido_id: 10,
  platillo_id: 1,
  cantidad: 1,
  precio_unitario: 12.9,
  subtotal: 12.9,
  notas: null,
  estado_preparacion: 'listo',
  fecha_inicio_prep: null,
  fecha_listo: null,
  platillo_nombre: '1/4 de pollo',
  ...overrides,
});

const pedidoDto = (overrides: Partial<PedidoDto> = {}): PedidoDto => ({
  id: 10,
  numero: 'PED-2026-000010',
  fecha_pedido: '2026-10-14T16:56:00-05:00',
  canal: 'local',
  tipo_consumo: 'sala',
  mesa_id: 2,
  cuenta_id: 1,
  cliente_id: null,
  repartidor_id: null,
  usuario_cajero_id: 2,
  estado: 'en_cocina',
  estado_pago: 'pendiente',
  metodo_pago: null,
  subtotal: 12.9,
  igv: 1.97,
  total: 15.22,
  comision_plataforma: 0,
  costo_delivery: 0,
  direccion_entrega: null,
  referencia_entrega: null,
  observaciones: null,
  comprobante_tipo: 'boleta',
  comprobante_numero: null,
  fecha_entrega: null,
  detalles: [detalleDto({ pedido_id: 10 })],
  ...overrides,
});

const cuentaDto = (overrides: Partial<CuentaDto> = {}): CuentaDto => ({
  id: 1,
  mesa_id: 2,
  estado: 'abierta',
  total: 64.5,
  fecha_apertura: '2026-10-14T16:56:00-05:00',
  usuario_apertura_id: 2,
  usuario_apertura_nombre: 'Maick Vicente',
  fecha_cierre: null,
  usuario_cierre_id: null,
  comprobante_tipo: 'boleta',
  comprobante_numero: null,
  mesa_numero: 7,
  pedidos: [],
  ...overrides,
});

const cuentaResumenDto = (
  overrides: Partial<CuentaResumenDto> = {},
): CuentaResumenDto => ({
  id: 1,
  mesa_id: 2,
  estado: 'abierta',
  total: 64.5,
  fecha_apertura: '2026-10-14T16:56:00-05:00',
  usuario_apertura_id: 2,
  usuario_apertura_nombre: 'Maick Vicente',
  fecha_cierre: null,
  usuario_cierre_id: null,
  comprobante_tipo: 'boleta',
  comprobante_numero: null,
  mesa_numero: 7,
  pedidos: [],
  ...overrides,
});

describe('toCanal', () => {
  it('mapea los canales conocidos a su tipo de pedido', () => {
    expect(toCanal('whatsapp')).toBe('whatsapp');
    expect(toCanal('delivery_propio')).toBe('delivery_propio');
    expect(toCanal('rappi')).toBe('rappi');
    expect(toCanal('llamafood')).toBe('llamafood');
    expect(toCanal('local')).toBe('local');
  });

  it('trata "telefono" como delivery propio', () => {
    expect(toCanal('telefono')).toBe('delivery_propio');
  });

  it('cae a "local" ante un canal desconocido', () => {
    expect(toCanal('uber_eats')).toBe('local');
  });
});

describe('toCuenta', () => {
  it('construye las rondas a partir de pedidos[] numerándolas en orden', () => {
    const cuenta = toCuenta(
      cuentaDto({
        pedidos: [
          pedidoDto({ id: 10, total: 15.22 }),
          pedidoDto({
            id: 11,
            numero: 'PED-2026-000011',
            fecha_pedido: '2026-10-14T17:12:00-05:00',
            total: 22.9,
            detalles: [
              detalleDto({
                id: 2,
                pedido_id: 11,
                platillo_id: 5,
                platillo_nombre: null,
                subtotal: 22.9,
              }),
            ],
          }),
        ],
      }),
    );

    expect(cuenta.rondas).toHaveLength(2);
    expect(cuenta.rondas.map((ronda) => ronda.numero)).toEqual([1, 2]);
    expect(cuenta.rondas.map((ronda) => ronda.id)).toEqual([10, 11]);
    expect(cuenta.rondas[1].creadaEn).toBe('2026-10-14T17:12:00-05:00');
    expect(cuenta.rondas[1].total).toBe(22.9);
    expect(cuenta.rondas[1].estado).toBe('en_cocina');
    expect(cuenta.rondas[0].items[0].platilloId).toBe(1);
    expect(cuenta.rondas[0].items[0].nombre).toBe('1/4 de pollo');
    expect(cuenta.rondas[0].items[0].cantidad).toBe(1);
  });

  it('usa el nombre por defecto cuando el detalle no trae platillo_nombre', () => {
    const cuenta = toCuenta(
      cuentaDto({
        pedidos: [pedidoDto()],
      }),
    );
    // El helper fija `platillo_nombre`; se reemplaza por un detalle sin nombre.
    const sinNombre = toCuenta(
      cuentaDto({
        pedidos: [
          pedidoDto({
            detalles: [
              detalleDto({ platillo_id: 7, platillo_nombre: null }),
            ],
          }),
        ],
      }),
    );
    expect(sinNombre.rondas[0].items[0].nombre).toBe('Platillo 7');
    expect(cuenta.rondas[0].items).toHaveLength(1);
  });

  it('deja rondas vacías cuando el DTO no trae pedidos', () => {
    const cuenta = toCuenta(cuentaDto({ pedidos: undefined }));
    expect(cuenta.rondas).toEqual([]);
  });

  it('mapea los campos de cabecera y el comprobante', () => {
    const cuenta = toCuenta(cuentaDto());
    expect(cuenta.id).toBe(1);
    expect(cuenta.mesaId).toBe(2);
    expect(cuenta.mesaNumero).toBe(7);
    expect(cuenta.estado).toBe('abierta');
    expect(cuenta.total).toBe(64.5);
    expect(cuenta.usuarioAperturaId).toBe(2);
    expect(cuenta.usuarioAperturaNombre).toBe('Maick Vicente');
    expect(cuenta.comprobanteTipo).toBe('boleta');
    expect(cuenta.fechaCierre).toBeUndefined();
  });

  it('mapea el cliente cuando viene anidado y lo omite cuando es null', () => {
    const conCliente = toCuenta(
      cuentaDto({
        cliente: {
          id: 8,
          nombre: 'Pollos Andinos S.A.C.',
          tipo_documento: 'RUC',
          numero_documento: '20601234567',
          telefono: null,
        },
      }),
    );
    expect(conCliente.cliente).toEqual({
      tipoDocumento: 'RUC',
      numeroDocumento: '20601234567',
      nombre: 'Pollos Andinos S.A.C.',
      telefono: undefined,
    });

    const sinCliente = toCuenta(cuentaDto({ cliente: null }));
    expect(sinCliente.cliente).toBeUndefined();
  });

  it('normaliza estados y comprobantes desconocidos', () => {
    const cuenta = toCuenta(
      cuentaDto({ estado: 'anulada_por_error', comprobante_tipo: 'factura' }),
    );
    expect(cuenta.estado).toBe('cancelada');
    expect(cuenta.comprobanteTipo).toBe('ninguno');
  });
});

describe('toCuentaResumen', () => {
  it('ignora pedidos/rondas y devuelve la lista sin rondas completas', () => {
    // `GET /cuentas` devuelve `pedidos` como ids y `rondas` como conteo;
    // el mapper debe limitarse a la cabecera.
    const dto = cuentaResumenDto({
      rondas: 3,
      pedidos: [10, 11, 12],
    });
    const resumen = toCuentaResumen(dto);

    expect(resumen.rondas).toEqual([]);
    expect(resumen.id).toBe(1);
    expect(resumen.total).toBe(64.5);
    expect(resumen.mesaNumero).toBe(7);
    expect(resumen.usuarioAperturaNombre).toBe('Maick Vicente');
    expect(resumen.comprobanteTipo).toBe('boleta');
  });

  it('mapea estado cobrado con su comprobante', () => {
    const resumen = toCuentaResumen(
      cuentaResumenDto({
        estado: 'cobrada',
        comprobante_numero: 'B001-0000123',
        fecha_cierre: '2026-10-14T20:00:00-05:00',
        usuario_cierre_id: 3,
      }),
    );
    expect(resumen.estado).toBe('cobrada');
    expect(resumen.comprobanteNumero).toBe('B001-0000123');
    expect(resumen.fechaCierre).toBe('2026-10-14T20:00:00-05:00');
    expect(resumen.usuarioCierreId).toBe(3);
  });
});

describe('toPago', () => {
  const pagoDto = (overrides: Partial<PagoDto> = {}): PagoDto => ({
    id: 1,
    pedido_id: null,
    cuenta_id: 1,
    metodo: 'yape',
    monto: 64.5,
    es_contraentrega: false,
    fecha: '2026-10-14T20:00:00-05:00',
    usuario_id: 2,
    ...overrides,
  });

  it('conserva el método de pago válido y la referencia a la cuenta', () => {
    const pago = toPago(pagoDto());
    expect(pago.metodo).toBe('yape');
    expect(pago.cuentaId).toBe(1);
    expect(pago.pedidoId).toBeNull();
    expect(pago.monto).toBe(64.5);
    expect(pago.esContraentrega).toBe(false);
    expect(pago.usuarioId).toBe(2);
  });

  it('cae a efectivo cuando el método no es reconocido', () => {
    expect(toPago(pagoDto({ metodo: 'bitcoin' })).metodo).toBe('efectivo');
  });
});

describe('toPlato', () => {
  const platoDto = (overrides: Partial<PlatoDto> = {}): PlatoDto => ({
    id: 1,
    nombre: '1/4 de pollo',
    descripcion: 'Pollo a la brasa con papas',
    precio_venta: 12.9,
    activo: true,
    categoria: 'Pollos',
    ingredientes: [
      {
        insumo_id: 3,
        insumo: 'Pollo entero',
        cantidad: 0.25,
        unidad_medida: 'kg',
        costo_promedio: 14.5,
      },
    ],
    ...overrides,
  });

  it('normaliza la categoría, la descripción y los ingredientes', () => {
    const plato = toPlato(platoDto());
    expect(plato.nombre).toBe('1/4 de pollo');
    expect(plato.categoria).toBe('Pollos');
    expect(plato.precioVenta).toBe(12.9);
    expect(plato.activo).toBe(true);
    expect(plato.ingredientes).toEqual([
      {
        insumoId: 3,
        nombre: 'Pollo entero',
        cantidad: 0.25,
        unidadMedida: 'kg',
        costoUnitario: 14.5,
      },
    ]);
  });

  it('aplica valores por defecto cuando faltan datos del plato', () => {
    const plato = toPlato(
      platoDto({
        descripcion: null,
        categoria: null,
        activo: false,
        ingredientes: [
          { insumo_id: 4, cantidad: 2, unidad_medida: null, costo_promedio: null },
        ],
      }),
    );
    expect(plato.descripcion).toBe('');
    expect(plato.categoria).toBe('Pollos');
    expect(plato.activo).toBe(false);
    expect(plato.ingredientes[0].nombre).toBe('');
    expect(plato.ingredientes[0].unidadMedida).toBe('und');
    expect(plato.ingredientes[0].costoUnitario).toBe(0);
  });
});

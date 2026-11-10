import { describe, expect, it } from 'vitest';
import type { Pedido, PedidoDetalle } from '../models';
import {
  agruparAllDay,
  agruparAllDayMeta,
  cursoDe,
  estadoLinea,
  estacionDe,
  listoParaEntregar,
  pedidoCerrado,
  progresoRonda,
} from './kds';

const detalle = (overrides: Partial<PedidoDetalle> = {}): PedidoDetalle => ({
  id: 1,
  platilloId: 1,
  nombre: '1/4 Pollo a la brasa',
  cantidad: 1,
  precioUnitario: 20,
  subtotal: 20,
  estadoPreparacion: 'pendiente',
  estacion: 'parrilla',
  curso: 'fondo',
  ...overrides,
});

const pedido = (items: PedidoDetalle[]): Pedido => ({
  id: 10,
  numero: 'PED-2026-000010',
  fechaPedido: '2026-11-09T13:00:00-05:00',
  canal: 'local',
  tipoConsumo: 'sala',
  mesaId: 3,
  mesaNumero: 3,
  cuentaId: 8,
  rondaId: null,
  usuarioCajeroId: 0,
  estado: 'en_cocina',
  estadoPago: 'pendiente',
  subtotal: 20,
  igv: 3.6,
  total: 23.6,
  comisionPlataforma: 0,
  costoDelivery: 0,
  comprobanteTipo: 'ticket',
  items,
});

describe('KDS · estado de línea', () => {
  it('prioriza entregado sobre el estado de preparación', () => {
    expect(estadoLinea(detalle({ estadoPreparacion: 'listo' }))).toBe('listo');
    expect(
      estadoLinea(
        detalle({ estadoPreparacion: 'listo', entregadoEn: '2026-11-09T13:10:00-05:00' }),
      ),
    ).toBe('entregado');
  });

  it('una ronda ignorada entrega solo sus líneas activas', () => {
    const conEntregada = pedido([
      detalle({ id: 1, estadoPreparacion: 'listo' }),
      detalle({
        id: 2,
        estadoPreparacion: 'listo',
        entregadoEn: '2026-11-09T13:10:00-05:00',
      }),
    ]);
    expect(listoParaEntregar(conEntregada)).toBe(true);

    const conPendiente = pedido([
      detalle({ id: 1, estadoPreparacion: 'listo' }),
      detalle({ id: 2, estadoPreparacion: 'en_preparacion' }),
    ]);
    expect(listoParaEntregar(conPendiente)).toBe(false);
    expect(pedidoCerrado(conPendiente)).toBe(false);
  });

  it('separa progreso de cocina y bar', () => {
    const progreso = progresoRonda([
      detalle({ id: 1, estacion: 'parrilla', estadoPreparacion: 'listo' }),
      detalle({ id: 2, estacion: 'frituras', estadoPreparacion: 'pendiente' }),
      detalle({ id: 3, estacion: 'bar', nombre: 'Inca Kola 1.5 L', estadoPreparacion: 'listo' }),
    ]);
    expect(progreso).toEqual({ cocinaOk: 1, cocinaTotal: 2, barOk: 1, barTotal: 1 });
  });
});

describe('KDS · estación y curso', () => {
  it('respeta los valores del backend y cae a la heurística si faltan', () => {
    expect(estacionDe({ estacion: 'bar', nombre: 'Pollo entero' })).toBe('bar');
    expect(estacionDe({ nombre: 'Inca Kola 1.5 L' })).toBe('bar');
    expect(estacionDe({ nombre: 'Papas fritas' })).toBe('frituras');
    expect(estacionDe({ nombre: 'Ensalada fresca' })).toBe('frios');
    expect(estacionDe({ nombre: '1/4 Pollo a la brasa' })).toBe('parrilla');

    expect(cursoDe({ curso: 'postre', nombre: 'Pollo' })).toBe('postre');
    expect(cursoDe({ nombre: 'Papa a la huancaína' })).toBe('entrada');
    expect(cursoDe({ nombre: 'Mousse de maracuyá' })).toBe('postre');
    expect(cursoDe({ nombre: 'Arroz chaufa' })).toBe('fondo');
  });
});

describe('KDS · all-day', () => {
  it('suma líneas activas por plato/estación y excluye entregadas', () => {
    const resumen = agruparAllDay([
      detalle({ id: 1, platilloId: 3, nombre: '1/4 Pollo', cantidad: 2, estadoPreparacion: 'en_preparacion' }),
      detalle({ id: 2, platilloId: 3, nombre: '1/4 Pollo', cantidad: 1, estadoPreparacion: 'pendiente' }),
      detalle({ id: 3, platilloId: 3, nombre: '1/4 Pollo', cantidad: 5, entregadoEn: '2026-11-09T13:10:00-05:00' }),
      detalle({ id: 4, platilloId: 7, nombre: 'Inca Kola 1.5 L', cantidad: 2, estacion: 'bar' }),
      detalle({ id: 5, platilloId: 9, nombre: 'Papas fritas', cantidad: 1, estacion: 'frituras' }),
    ]);

    expect(resumen.total).toBe(6);
    expect(resumen.grupos.map((grupo) => grupo.estacion)).toEqual([
      'parrilla',
      'frituras',
      'bar',
    ]);
    const pollo = resumen.grupos[0].filas[0];
    expect(pollo).toMatchObject({ platilloId: 3, cantidad: 3, enFuego: 2 });
  });

  it('aplica los filtros de estación y curso', () => {
    const items = [
      detalle({ id: 1, estacion: 'parrilla', curso: 'fondo', cantidad: 1 }),
      detalle({ id: 2, estacion: 'frios', curso: 'entrada', cantidad: 2 }),
      detalle({ id: 3, estacion: 'bar', curso: 'fondo', cantidad: 3 }),
    ];

    const soloBar = agruparAllDay(items, { estacion: 'bar' });
    expect(soloBar.total).toBe(3);
    expect(soloBar.grupos).toHaveLength(1);

    const soloEntradas = agruparAllDay(items, { curso: 'entrada' });
    expect(soloEntradas.total).toBe(2);
    expect(soloEntradas.grupos[0].estacion).toBe('frios');
  });

  it('mapea meta.all_day del backend y filtra por estación', () => {
    const meta = [
      { platillo_id: 3, platillo_nombre: '1/4 Pollo', estacion: 'parrilla', cantidad: 4, en_fuego: 2 },
      { platillo_id: 7, platillo_nombre: 'Inca Kola 1.5 L', estacion: 'bar', cantidad: 2, en_fuego: 0 },
    ];

    const todo = agruparAllDayMeta(meta);
    expect(todo.total).toBe(6);

    const bar = agruparAllDayMeta(meta, { estacion: 'bar' });
    expect(bar.total).toBe(2);
    expect(bar.grupos[0].filas[0].nombre).toBe('Inca Kola 1.5 L');
  });
});

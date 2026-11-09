import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CanalPedido,
  EstadoPago,
  EstadoPedido,
  Pedido,
  PedidoDetalle,
  TipoConsumo,
} from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed, mensajeError } from '../api/api.helpers';
import type {
  ApiList,
  KdsEstadoLineaDto,
  KdsEstadoResponseDto,
  KdsPedidoDto,
  PageMeta,
  PedidoDto,
} from '../api/api.types';
import { toPedido, toPedidoKds } from '../api/api.mappers';
import { MOCK_PEDIDOS } from './mock-data';

export interface PedidosQuery {
  page?: number;
  limit?: number;
  estado?: string;
  canal?: string;
  desde?: string;
  hasta?: string;
}

export interface PedidosMeta extends PageMeta {
  prioritarios?: number;
  sla_min?: number;
}

export interface NuevoPedido {
  canal: CanalPedido;
  tipoConsumo: TipoConsumo;
  mesaId: number | null;
  cuentaId: number | null;
  rondaId: number | null;
  items: PedidoDetalle[];
  clienteNombre?: string;
  direccionEntrega?: string;
  referenciaEntrega?: string;
  observaciones?: string;
  costoDelivery?: number;
  comisionPlataforma?: number;
  estadoPago?: EstadoPago;
  totalFinal?: number;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly api = inject(ApiClient);

  private secuencia = 1000;

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly meta = signal<PedidosMeta | null>(null);

  readonly pedidos = signal<Pedido[]>(
    USE_API
      ? []
      : MOCK_PEDIDOS.map((pedido) => ({
          ...pedido,
          items: pedido.items.map((item) => ({ ...item })),
        })),
  );

  readonly activos = computed<Pedido[]>(() =>
    this.pedidos().filter(
      (pedido) => pedido.estado !== 'cobrado' && pedido.estado !== 'cancelado',
    ),
  );

  readonly enCocina = computed<Pedido[]>(() =>
    this.pedidos().filter((pedido) => pedido.estado === 'en_cocina'),
  );

  readonly cobrados = computed<Pedido[]>(() =>
    this.pedidos().filter((pedido) => pedido.estado === 'cobrado'),
  );

  porId(id: number): Pedido | undefined {
    return this.pedidos().find((pedido) => pedido.id === id);
  }

  async cargar(opciones: PedidosQuery = {}): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    const limit = opciones.limit ?? 100;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<PedidoDto>>('/pedidos', {
          page: opciones.page ?? 1,
          limit,
          estado: opciones.estado || undefined,
          canal: opciones.canal || undefined,
          desde: opciones.desde || undefined,
          hasta: opciones.hasta || undefined,
        }),
      );
      this.pedidos.set(respuesta.data.map(toPedido));
      this.meta.set({
        page: respuesta.meta.page ?? 1,
        limit: respuesta.meta.limit ?? limit,
        total: respuesta.meta.total ?? respuesta.data.length,
        pages: respuesta.meta.pages ?? 0,
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarKds(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      const resultado = await firstValueFrom(
        this.api.getConEtag<ApiList<KdsPedidoDto>>('/kds/pedidos'),
      );
      // 304: el KDS no cambió; se conserva la lista actual sin repintar.
      if (resultado.changed && resultado.data) {
        const respuesta = resultado.data;
        this.pedidos.set(respuesta.data.map(toPedidoKds));
        this.meta.set({
          page: 1,
          limit: respuesta.data.length,
          total: respuesta.meta.total ?? respuesta.data.length,
          pages: 1,
          prioritarios: respuesta.meta.prioritarios,
          sla_min: respuesta.meta.sla_min,
        });
      }
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  crear(entrada: NuevoPedido): Pedido {
    const subtotalItems = round2(entrada.items.reduce((suma, item) => suma + item.subtotal, 0));
    const costoDelivery = entrada.costoDelivery ?? 0;
    const subtotal =
      entrada.totalFinal === undefined ? subtotalItems : round2(entrada.totalFinal / 1.18);
    const igv =
      entrada.totalFinal === undefined
        ? round2(subtotalItems * 0.18)
        : round2(entrada.totalFinal - subtotal);
    const totalPedido =
      entrada.totalFinal ?? round2(subtotalItems + igv + costoDelivery);
    const nuevo: Pedido = {
      id: ++this.secuencia,
      numero: `#${String(this.secuencia).padStart(4, '0')}`,
      fechaPedido: new Date().toISOString(),
      canal: entrada.canal,
      tipoConsumo: entrada.tipoConsumo,
      mesaId: entrada.mesaId,
      cuentaId: entrada.cuentaId,
      rondaId: entrada.rondaId,
      clienteNombre: entrada.clienteNombre,
      usuarioCajeroId: 3,
      estado: 'en_cocina',
      estadoPago: entrada.estadoPago ?? 'pendiente',
      subtotal,
      igv,
      total: totalPedido,
      comisionPlataforma: entrada.comisionPlataforma ?? 0,
      costoDelivery,
      direccionEntrega: entrada.direccionEntrega,
      referenciaEntrega: entrada.referenciaEntrega,
      observaciones: entrada.observaciones,
      comprobanteTipo: 'ticket',
      items: entrada.items,
    };
    this.pedidos.update((lista) => [nuevo, ...lista]);
    return nuevo;
  }

  cambiarEstado(id: number, estado: EstadoPedido): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) => (pedido.id === id ? { ...pedido, estado } : pedido)),
    );
  }

  asignarRepartidor(pedidoId: number, repartidorId: number): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) =>
        pedido.id === pedidoId ? { ...pedido, repartidorId } : pedido,
      ),
    );
  }

  async marcarItemListo(pedidoId: number, itemId: number): Promise<boolean> {
    if (USE_API) {
      try {
        const respuesta = await firstValueFrom(
          this.api.patch<KdsEstadoResponseDto>(
            `/kds/pedidos/${pedidoId}/platos/${itemId}/estado`,
            { estado: 'listo' },
          ),
        );
        this.aplicarLinea(pedidoId, respuesta.linea, respuesta.pedido_estado);
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    this.marcarItemListoLocal(pedidoId, itemId);
    return true;
  }

  private aplicarLinea(
    pedidoId: number,
    linea: KdsEstadoLineaDto,
    pedidoEstado: string,
  ): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) => {
        if (pedido.id !== pedidoId) {
          return pedido;
        }
        const items = pedido.items.map((item) =>
          item.id === linea.id
            ? {
                ...item,
                estadoPreparacion: 'listo' as const,
                fechaListo: linea.fecha_listo ?? new Date().toISOString(),
              }
            : item,
        );
        const estado: EstadoPedido =
          pedidoEstado === 'en_cocina' ? 'en_cocina' : pedido.estado;
        return { ...pedido, items, estado };
      }),
    );
  }

  private marcarItemListoLocal(pedidoId: number, itemId: number): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) =>
        pedido.id === pedidoId
          ? {
              ...pedido,
              items: pedido.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      estadoPreparacion: 'listo',
                      fechaListo: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : pedido,
      ),
    );
  }
}

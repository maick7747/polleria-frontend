import { computed, inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Pedido, PedidoDetalle } from '../models';
import { minutosEntre } from '../utils/format';
import { agruparAllDay, estadoLinea, pedidoCerrado } from '../utils/kds';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import type {
  ApiList,
  KdsAllDayDto,
  KdsEntregaPlatoResponseDto,
  KdsEntregaRondaResponseDto,
  KdsEstadoResponseDto,
  KdsMetaDto,
  KdsPedidoDto,
  KdsTodoListoResponseDto,
  PedidoListoDto,
} from '../api/api.types';
import { toPedidoKds } from '../api/api.mappers';
import { PedidosService } from './pedidos.service';

export const UMBRAL_KDS_MIN = 30;

export interface ComandaKds {
  pedidoId: number;
  numero: string;
  origen: 'Local' | 'Delivery' | 'Externo';
  referencia: string;
  creadoEn: string;
  minutos: number;
  prioritaria: boolean;
  items: PedidoDetalle[];
}

export interface KdsAllDayItem {
  platilloId: number;
  platilloNombre: string;
  estacion: string;
  cantidad: number;
  enFuego: number;
}

export interface KdsMeta {
  total: number;
  prioritarios: number;
  slaMin: number;
  generadoEn: string;
  allDay: KdsAllDayItem[];
  allDayTotal: number;
}

export interface KdsListado {
  changed: boolean;
  pedidos: Pedido[];
  meta: KdsMeta | null;
}

@Injectable({ providedIn: 'root' })
export class CocinaService {
  private readonly pedidos = inject(PedidosService);
  private readonly api = inject(ApiClient);

  readonly comandas = computed<ComandaKds[]>(() =>
    this.pedidos.enCocina().map((pedido) => {
      const minutos = minutosEntre(pedido.fechaPedido, Date.now());
      return {
        pedidoId: pedido.id,
        numero: pedido.numero,
        origen: this.origen(pedido),
        referencia: this.referencia(pedido),
        creadoEn: pedido.fechaPedido,
        minutos,
        prioritaria: minutos > UMBRAL_KDS_MIN,
        items: pedido.items,
      };
    }),
  );

  readonly enCola = computed<number>(() =>
    this.comandas().filter((comanda) =>
      comanda.items.every((item) => item.estadoPreparacion === 'pendiente'),
    ).length,
  );

  readonly prioritarias = computed<ComandaKds[]>(() =>
    this.comandas().filter((comanda) => comanda.prioritaria),
  );

  readonly listos = computed<number>(() =>
    this.comandas().reduce(
      (suma, comanda) =>
        suma + comanda.items.filter((item) => item.estadoPreparacion === 'listo').length,
      0,
    ),
  );

  marcarListo(pedidoId: number, itemId: number): Promise<boolean> {
    return this.pedidos.marcarItemListo(pedidoId, itemId);
  }

  /**
   * `GET /api/kds/pedidos` con ETag. En un 304 devuelve `changed: false` para
   * que la pantalla conserve el estado y no repinte.
   */
  async listKds(): Promise<KdsListado> {
    if (!USE_API) {
      return this.listKdsDemo();
    }
    const resultado = await firstValueFrom(
      this.api.getConEtag<ApiList<KdsPedidoDto>>('/kds/pedidos'),
    );
    if (!resultado.changed || !resultado.data) {
      return { changed: false, pedidos: [], meta: null };
    }
    const respuesta = resultado.data;
    return {
      changed: true,
      pedidos: respuesta.data.map(toPedidoKds),
      meta: this.toMeta(respuesta.meta),
    };
  }

  /** `PATCH /api/kds/pedidos/:id/platos/:detalleId/estado`. */
  async marcarEstado(
    pedidoId: number,
    detalleId: number,
    estado: 'en_preparacion' | 'listo',
  ): Promise<boolean> {
    if (USE_API) {
      await firstValueFrom(
        this.api.patch<KdsEstadoResponseDto>(
          `/kds/pedidos/${pedidoId}/platos/${detalleId}/estado`,
          { estado },
        ),
      );
      return true;
    }
    this.actualizarLocal(pedidoId, (pedido) => ({
      ...pedido,
      items: pedido.items.map((item) =>
        item.id === detalleId ? this.conEstado(item, estado) : item,
      ),
    }));
    return true;
  }

  /** `PATCH /api/kds/pedidos/:id/platos/:detalleId/entregar`. */
  async entregarPlato(pedidoId: number, detalleId: number): Promise<boolean> {
    if (USE_API) {
      await firstValueFrom(
        this.api.patch<KdsEntregaPlatoResponseDto>(
          `/kds/pedidos/${pedidoId}/platos/${detalleId}/entregar`,
          {},
        ),
      );
      return true;
    }
    const ahora = new Date().toISOString();
    this.actualizarLocal(pedidoId, (pedido) => {
      const items = pedido.items.map((item) =>
        item.id === detalleId && !item.entregadoEn
          ? { ...item, entregadoEn: ahora }
          : item,
      );
      return this.conEntrega(pedido, items, ahora);
    });
    return true;
  }

  /** `PATCH /api/kds/pedidos/:id/entregar` (ronda completa). */
  async entregarRonda(pedidoId: number): Promise<boolean> {
    if (USE_API) {
      await firstValueFrom(
        this.api.patch<KdsEntregaRondaResponseDto>(
          `/kds/pedidos/${pedidoId}/entregar`,
          {},
        ),
      );
      return true;
    }
    const ahora = new Date().toISOString();
    this.actualizarLocal(pedidoId, (pedido) => {
      const items = pedido.items.map((item) =>
        item.entregadoEn ? item : { ...item, entregadoEn: ahora },
      );
      return this.conEntrega(pedido, items, ahora);
    });
    return true;
  }

  /** `PATCH /api/kds/pedidos/:id/listo` (atajo "todo listo"). */
  async marcarTodoListo(pedidoId: number): Promise<boolean> {
    if (USE_API) {
      await firstValueFrom(
        this.api.patch<KdsTodoListoResponseDto>(`/kds/pedidos/${pedidoId}/listo`, {}),
      );
      return true;
    }
    const ahora = new Date().toISOString();
    this.actualizarLocal(pedidoId, (pedido) => ({
      ...pedido,
      estado: 'servido',
      listo: true,
      items: pedido.items.map((item) => {
        if (item.entregadoEn) {
          return item;
        }
        const estado = estadoLinea(item);
        if (estado === 'pendiente' || estado === 'en_preparacion') {
          return this.conEstado(item, 'listo', ahora);
        }
        return item;
      }),
    }));
    return true;
  }

  // Avisos reales del backend: pedidos servidos que todavía no se cobran.
  async pedidosListos(): Promise<PedidoListoDto[]> {
    if (!USE_API) {
      return [];
    }
    const resultado = await firstValueFrom(
      this.api.getConEtag<ApiList<PedidoListoDto>>('/pedidos-listos'),
    );
    // 304: se devuelve el array cacheado (misma referencia) para que el
    // consumidor no repinte la lista.
    return resultado.data?.data ?? [];
  }

  private toMeta(meta: ApiList<unknown>['meta']): KdsMeta {
    const allDay = (meta.all_day ?? []) as KdsAllDayDto[];
    return {
      total: meta.total ?? 0,
      prioritarios: meta.prioritarios ?? 0,
      slaMin: meta.sla_min ?? UMBRAL_KDS_MIN,
      generadoEn: '',
      allDay: allDay.map((item) => ({
        platilloId: item.platillo_id,
        platilloNombre: item.platillo_nombre,
        estacion: item.estacion,
        cantidad: item.cantidad,
        enFuego: item.en_fuego,
      })),
      allDayTotal: meta.all_day_total ?? allDay.reduce((suma, item) => suma + item.cantidad, 0),
    };
  }

  // Modo demo: KDS armado con los pedidos mock en memoria.
  private listKdsDemo(): KdsListado {
    const pedidos = this.pedidos
      .pedidos()
      .filter(
        (pedido) =>
          (pedido.estado === 'en_cocina' || pedido.estado === 'servido') &&
          !pedidoCerrado(pedido),
      );
    const resumen = agruparAllDay(pedidos.flatMap((pedido) => pedido.items));
    return {
      changed: true,
      pedidos,
      meta: {
        total: pedidos.length,
        prioritarios: 0,
        slaMin: UMBRAL_KDS_MIN,
        generadoEn: '',
        allDay: resumen.grupos.flatMap((grupo) =>
          grupo.filas.map((fila) => ({
            platilloId: fila.platilloId ?? 0,
            platilloNombre: fila.nombre,
            estacion: grupo.estacion,
            cantidad: fila.cantidad,
            enFuego: fila.enFuego,
          })),
        ),
        allDayTotal: resumen.total,
      },
    };
  }

  private actualizarLocal(
    pedidoId: number,
    cambio: (pedido: Pedido) => Pedido,
  ): void {
    this.pedidos.pedidos.update((lista) =>
      lista.map((pedido) => (pedido.id === pedidoId ? cambio(pedido) : pedido)),
    );
  }

  private conEstado(
    item: PedidoDetalle,
    estado: 'en_preparacion' | 'listo',
    fecha: string = new Date().toISOString(),
  ): PedidoDetalle {
    return {
      ...item,
      estadoPreparacion: estado,
      fechaInicioPrep:
        estado === 'en_preparacion' ? (item.fechaInicioPrep ?? fecha) : item.fechaInicioPrep,
      fechaListo: estado === 'listo' ? fecha : item.fechaListo,
    };
  }

  private conEntrega(
    pedido: Pedido,
    items: PedidoDetalle[],
    ahora: string,
  ): Pedido {
    const todos = items.length > 0 && items.every((item) => Boolean(item.entregadoEn));
    return {
      ...pedido,
      items,
      todosEntregados: todos,
      estadoEntrega: todos ? 'entregado' : (pedido.estadoEntrega ?? 'pendiente'),
      fechaEntrega: todos ? (pedido.fechaEntrega ?? ahora) : pedido.fechaEntrega,
    };
  }

  private origen(pedido: Pedido): ComandaKds['origen'] {
    if (pedido.canal === 'local') {
      return 'Local';
    }
    if (pedido.canal === 'delivery_propio') {
      return 'Delivery';
    }
    return 'Externo';
  }

  private referencia(pedido: Pedido): string {
    if (pedido.mesaId !== null) {
      return `Mesa ${String(pedido.mesaId).padStart(2, '0')}`;
    }
    if (pedido.canal === 'delivery_propio') {
      return pedido.direccionEntrega ?? 'Delivery propio';
    }
    if (pedido.canal === 'rappi') {
      return 'Rappi';
    }
    if (pedido.canal === 'llamafood') {
      return 'LlamaFood';
    }
    return pedido.tipoConsumo === 'para_llevar' ? 'Mostrador' : 'Local';
  }
}

import { computed, inject, Injectable } from '@angular/core';
import type { Pedido, PedidoDetalle } from '../models';
import { minutosEntre } from '../utils/format';
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

@Injectable({ providedIn: 'root' })
export class CocinaService {
  private readonly pedidos = inject(PedidosService);

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

import { computed, inject, Injectable } from '@angular/core';
import type { CanalPedido, EstadoPedido, Pedido, PedidoDetalle } from '../models';
import { round2 } from '../utils/format';
import { MOCK_USUARIOS } from './mock-data';
import { PedidosService } from './pedidos.service';

export type PlataformaExterna = Extract<CanalPedido, 'rappi' | 'llamafood'>;

export const COMISION_PLATAFORMA: Record<PlataformaExterna, number> = {
  rappi: 25,
  llamafood: 20,
};

export const COSTO_DELIVERY_PROPIO = 5;

export interface NuevoDeliveryPropio {
  clienteNombre: string;
  direccionEntrega: string;
  referenciaEntrega?: string;
  observaciones?: string;
  items: PedidoDetalle[];
}

export interface NuevoDeliveryExterno {
  plataforma: PlataformaExterna;
  clienteNombre: string;
  direccionEntrega: string;
  referenciaEntrega?: string;
  observaciones?: string;
  items: PedidoDetalle[];
}

@Injectable({ providedIn: 'root' })
export class DeliveryService {
  private readonly pedidos = inject(PedidosService);

  readonly propios = computed<Pedido[]>(() =>
    this.pedidos.pedidos().filter((pedido) => pedido.canal === 'delivery_propio'),
  );

  readonly externos = computed<Pedido[]>(() =>
    this.pedidos
      .pedidos()
      .filter((pedido) => pedido.canal === 'rappi' || pedido.canal === 'llamafood'),
  );

  readonly enCamino = computed<Pedido[]>(() =>
    [...this.propios(), ...this.externos()].filter(
      (pedido) => pedido.estado === 'servido' || pedido.estadoPago === 'contraentrega_pendiente',
    ),
  );

  readonly pendientes = computed<Pedido[]>(() =>
    [...this.propios(), ...this.externos()].filter(
      (pedido) => pedido.estado === 'en_cocina' || pedido.estado === 'borrador',
    ),
  );

  readonly repartidores = computed(() =>
    MOCK_USUARIOS.filter((usuario) => usuario.roles.includes('Repartidor')),
  );

  asignar(pedidoId: number, repartidorId: number): void {
    this.pedidos.asignarRepartidor(pedidoId, repartidorId);
  }

  cambiarEstado(pedidoId: number, estado: EstadoPedido): void {
    this.pedidos.cambiarEstado(pedidoId, estado);
  }

  crearPropio(entrada: NuevoDeliveryPropio): Pedido {
    return this.pedidos.crear({
      canal: 'delivery_propio',
      tipoConsumo: 'delivery',
      mesaId: null,
      cuentaId: null,
      rondaId: null,
      items: entrada.items,
      clienteNombre: entrada.clienteNombre,
      direccionEntrega: entrada.direccionEntrega,
      referenciaEntrega: entrada.referenciaEntrega,
      observaciones: entrada.observaciones,
      costoDelivery: COSTO_DELIVERY_PROPIO,
      estadoPago: 'contraentrega_pendiente',
    });
  }

  crearExterno(entrada: NuevoDeliveryExterno): Pedido {
    const total = round2(entrada.items.reduce((suma, item) => suma + item.subtotal, 0));
    const comision = round2((total * COMISION_PLATAFORMA[entrada.plataforma]) / 100);
    return this.pedidos.crear({
      canal: entrada.plataforma,
      tipoConsumo: 'delivery',
      mesaId: null,
      cuentaId: null,
      rondaId: null,
      items: entrada.items,
      clienteNombre: entrada.clienteNombre,
      direccionEntrega: entrada.direccionEntrega,
      referenciaEntrega: entrada.referenciaEntrega,
      observaciones: entrada.observaciones,
      comisionPlataforma: comision,
      totalFinal: total,
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { COSTO_DELIVERY_PROPIO, DeliveryService } from '../../core/data/delivery.service';
import type { PedidoDetalle } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type CanalPropio = 'whatsapp' | 'telefono';

const ITEMS_INICIALES: readonly PedidoDetalle[] = [
  {
    id: 1,
    platilloId: 2,
    nombre: '1/2 Pollo a la brasa',
    cantidad: 1,
    precioUnitario: 32,
    subtotal: 32,
    notas: 'Con papas y ensalada · sin ají',
    estadoPreparacion: 'pendiente',
  },
  {
    id: 2,
    platilloId: 5,
    nombre: 'Papas fritas',
    cantidad: 1,
    precioUnitario: 8,
    subtotal: 8,
    notas: 'Porción adicional · bien cocidas',
    estadoPreparacion: 'pendiente',
  },
  {
    id: 3,
    platilloId: 7,
    nombre: 'Chicha morada 1 L',
    cantidad: 1,
    precioUnitario: 12,
    subtotal: 12,
    notas: 'Botella descartable · helada',
    estadoPreparacion: 'pendiente',
  },
];

@Component({
  selector: 'app-delivery-propio-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-propio.page.html',
  styleUrl: './delivery-propio.page.css',
})
export class DeliveryPropioPage {
  private readonly delivery = inject(DeliveryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly numeroPedido = '#D-207';
  readonly clienteNombre = 'María Fernanda Rojas';
  readonly clienteTelefono = '+51 987 654 321';
  readonly direccion = 'Jr. Puno 441';
  readonly referencia = 'Portón azul frente al parque';
  readonly distrito = 'El Tambo, Huancayo · a 2.4 km del local';
  readonly entregaEstimada = '18:15 · 25 min';

  readonly canal = signal<CanalPropio>('whatsapp');
  readonly items = signal<PedidoDetalle[]>(
    ITEMS_INICIALES.map((item) => ({ ...item })),
  );
  readonly observaciones = signal(
    'Tocar el timbre 2 veces. Sin cubiertos. Enviar harto ají aparte.',
  );
  readonly toast = signal('');

  readonly totalItems = computed<number>(() =>
    this.items().reduce((suma, item) => suma + item.cantidad, 0),
  );

  readonly subtotal = computed<number>(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly igv = computed<number>(() => round2(this.subtotal() * 0.18));

  readonly deliveryCosto = COSTO_DELIVERY_PROPIO;

  readonly total = computed<number>(() =>
    round2(this.subtotal() + this.igv() + this.deliveryCosto),
  );

  readonly puedeEnviar = computed<boolean>(
    () => this.items().length > 0 && this.toast() === '',
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  cambiarCantidad(itemId: number, delta: number): void {
    this.items.update((lista) =>
      lista.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const cantidad = Math.max(1, item.cantidad + delta);
        return {
          ...item,
          cantidad,
          subtotal: round2(cantidad * item.precioUnitario),
        };
      }),
    );
  }

  onObservacion(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  enviar(): void {
    if (!this.puedeEnviar()) {
      return;
    }
    const pedido = this.delivery.crearPropio({
      clienteNombre: this.clienteNombre,
      direccionEntrega: this.direccion,
      referenciaEntrega: this.referencia,
      observaciones: this.observaciones().trim() || undefined,
      items: this.items(),
    });
    this.toast.set(`${pedido.numero} enviado a cocina · se cobra contraentrega`);
    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 950);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  COMISION_PLATAFORMA,
  DeliveryService,
  type PlataformaExterna,
} from '../../core/data/delivery.service';
import type { PedidoDetalle } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface ComisionFila {
  etiqueta: string;
  pct: number;
  monto: number;
  activa: boolean;
}

const ITEMS_PEDIDO: readonly PedidoDetalle[] = [
  {
    id: 1,
    platilloId: 2,
    nombre: '1/2 Pollo a la brasa',
    cantidad: 1,
    precioUnitario: 42,
    subtotal: 42,
    notas: 'Con papas y ensalada',
    estadoPreparacion: 'en_preparacion',
  },
  {
    id: 2,
    platilloId: 5,
    nombre: 'Papas fritas',
    cantidad: 1,
    precioUnitario: 12,
    subtotal: 12,
    notas: 'Porción grande',
    estadoPreparacion: 'en_preparacion',
  },
  {
    id: 3,
    platilloId: 7,
    nombre: 'Chicha morada 1 L',
    cantidad: 1,
    precioUnitario: 8.5,
    subtotal: 8.5,
    notas: 'Sin hielo',
    estadoPreparacion: 'en_preparacion',
  },
];

@Component({
  selector: 'app-delivery-externo-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-externo.page.html',
  styleUrl: './delivery-externo.page.css',
})
export class DeliveryExternoPage {
  private readonly delivery = inject(DeliveryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly numeroPedido = '#D-208';
  readonly clienteNombre = 'Lucía Ramírez';
  readonly clienteTelefono = '+51 964 221 908';
  readonly direccion = 'Av. Ferrocarril 512, El Tambo';
  readonly referencia = 'Portón negro, segundo piso';
  readonly observaciones = 'Sin ají, papas bien cocidas. Empaque para llevar sellado.';

  readonly items: readonly PedidoDetalle[] = ITEMS_PEDIDO;

  readonly plataforma = signal<PlataformaExterna>('rappi');
  readonly toast = signal('');

  readonly etiquetaPlataforma = computed<string>(() =>
    this.plataforma() === 'rappi' ? 'Rappi' : 'LlamaFood',
  );

  readonly comisionPct = computed<number>(() => COMISION_PLATAFORMA[this.plataforma()]);

  readonly total = computed<number>(() =>
    round2(this.items.reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly comisiones = computed<ComisionFila[]>(() => {
    const total = this.total();
    return (['rappi', 'llamafood'] as const).map((plataforma) => {
      const activa = this.plataforma() === plataforma;
      const pct = COMISION_PLATAFORMA[plataforma];
      return {
        etiqueta: `Comisión ${plataforma === 'rappi' ? 'Rappi' : 'LlamaFood'}`,
        pct,
        monto: activa ? round2((total * pct) / 100) : 0,
        activa,
      };
    });
  });

  readonly comision = computed<number>(
    () => this.comisiones().find((fila) => fila.activa)?.monto ?? 0,
  );

  readonly neto = computed<number>(() => round2(this.total() - this.comision()));

  readonly margen = computed<number>(() => 100 - this.comisionPct());

  readonly puedeAceptar = computed<boolean>(() => this.toast() === '');

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  aceptar(): void {
    if (!this.puedeAceptar()) {
      return;
    }
    const pedido = this.delivery.crearExterno({
      plataforma: this.plataforma(),
      clienteNombre: this.clienteNombre,
      direccionEntrega: this.direccion,
      referenciaEntrega: this.referencia,
      observaciones: this.observaciones,
      items: [...this.items],
    });
    this.toast.set(`${pedido.numero} aceptado · ${this.etiquetaPlataforma()}`);
    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 950);
  }

  rechazar(): void {
    this.toast.set(`${this.numeroPedido} rechazado · ${this.etiquetaPlataforma()}`);
    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/dashboard']);
    }, 950);
  }
}

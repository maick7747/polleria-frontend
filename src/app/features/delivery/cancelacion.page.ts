import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { InventarioService } from '../../core/data/inventario.service';
import { PedidosService } from '../../core/data/pedidos.service';
import { formatearMoneda } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface ItemCancelacion {
  nombre: string;
  cantidad: number;
  precio: number;
  insumoId: number;
  insumoNombre: string;
  insumoCantidad: number;
  unidad: string;
}

const ITEMS_AFECTADOS: readonly ItemCancelacion[] = [
  {
    nombre: '1/2 Pollo a la brasa',
    cantidad: 1,
    precio: 42,
    insumoId: 1,
    insumoNombre: 'Pollo entero',
    insumoCantidad: 0.9,
    unidad: 'kg',
  },
  {
    nombre: 'Papas fritas',
    cantidad: 1,
    precio: 12,
    insumoId: 2,
    insumoNombre: 'Papa',
    insumoCantidad: 0.4,
    unidad: 'kg',
  },
  {
    nombre: 'Chicha morada 1 L',
    cantidad: 1,
    precio: 8.5,
    insumoId: 8,
    insumoNombre: 'Chicha morada',
    insumoCantidad: 1,
    unidad: 'l',
  },
];

@Component({
  selector: 'app-cancelacion-delivery-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cancelacion.page.html',
  styleUrl: './cancelacion.page.css',
})
export class CancelacionDeliveryPage {
  private readonly inventario = inject(InventarioService);
  private readonly pedidos = inject(PedidosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly numero = '#D-208';
  readonly plataforma = 'Rappi';
  readonly cliente = 'Lucía Ramírez';
  readonly direccion = 'Av. Ferrocarril 512, El Tambo';
  readonly estadoActual = 'En cocina · no despachado';
  readonly referencia = 'Portón negro, segundo piso';

  readonly items = ITEMS_AFECTADOS;
  readonly motivos = [
    'Cliente canceló',
    'Sin stock',
    'Demora en cocina',
    'Dirección errada',
  ] as const;

  readonly motivo = signal<string>(this.motivos[0]);
  readonly confirmado = signal<boolean>(false);
  readonly toast = signal<string>('');

  readonly total = computed<number>(() =>
    this.items.reduce((suma, item) => suma + item.precio * item.cantidad, 0),
  );

  readonly totalAfectados = computed<number>(() =>
    this.items.reduce((suma, item) => suma + item.cantidad, 0),
  );

  readonly nombrePedido = computed<string>(() => `Cancelar pedido · ${this.plataforma} ${this.numero}`);

  readonly subtitulo = computed<string>(
    () =>
      `Pedido ya aceptado · aún no despachado · ${this.confirmado() ? 'cancelación registrada' : 'cancelación con reversa de stock'}`,
  );

  readonly insumosRepuestos = computed<string>(() =>
    this.items.map((item) => item.insumoNombre.toLowerCase()).join(', '),
  );

  readonly puedeConfirmar = computed<boolean>(() => !this.confirmado());

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  elegirMotivo(motivo: string): void {
    if (this.confirmado()) {
      return;
    }
    this.motivo.set(motivo);
  }

  confirmar(): void {
    if (this.confirmado()) {
      return;
    }
    this.confirmado.set(true);

    const usuarioId = this.auth.usuario()?.id ?? 3;
    const pedido = this.pedidos.pedidos().find((actual) => actual.numero === this.numero);
    const referenciaId = pedido?.id ?? 0;

    for (const item of this.items) {
      this.inventario.registrarMovimiento(
        item.insumoId,
        'devolucion',
        item.insumoCantidad,
        'devolucion',
        referenciaId,
        usuarioId,
        `Reversa por cancelación ${this.numero} · ${this.motivo()}`,
      );
    }

    if (pedido) {
      this.pedidos.cambiarEstado(pedido.id, 'cancelado');
    }

    this.toast.set(
      `Pedido ${this.numero} cancelado · ${this.items.length} insumos repuestos`,
    );
    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 950);
  }

  mantener(): void {
    void this.router.navigate(['/delivery-externo']);
  }
}

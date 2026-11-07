import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ComprasService,
  type EstadoOrden,
  type EstadoSugerencia,
} from '../../core/data/compras.service';
import { formatearMoneda, formatearNumero } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type TabCompras = 'sugerencia' | 'ordenes' | 'entradas';

@Component({
  selector: 'app-compras-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compras.page.html',
  styleUrl: './compras.page.css',
})
export class ComprasPage {
  private readonly compras = inject(ComprasService);
  private readonly destroyRef = inject(DestroyRef);
  private temporizador: number | null = null;

  readonly tab = signal<TabCompras>('sugerencia');
  readonly busqueda = signal<string>('');
  readonly proveedorFiltro = signal<string>('todos');
  readonly toast = signal<string>('');

  readonly sugerencias = this.compras.sugerencias;
  readonly ordenes = this.compras.ordenes;
  readonly entradas = this.compras.entradas;
  readonly conteos = this.compras.conteos;
  readonly subtotal = this.compras.subtotal;
  readonly igv = this.compras.igv;
  readonly total = this.compras.total;
  readonly ordenActiva = this.compras.ordenActiva;

  readonly moneda = formatearMoneda;
  readonly numero = formatearNumero;

  readonly proveedores = computed<string[]>(() => {
    const lista: string[] = [];
    for (const sugerencia of this.sugerencias()) {
      if (!lista.includes(sugerencia.proveedor)) {
        lista.push(sugerencia.proveedor);
      }
    }
    return lista;
  });

  readonly filasSugerencia = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const proveedor = this.proveedorFiltro();
    return this.sugerencias().filter((sugerencia) => {
      const coincideProveedor = proveedor === 'todos' || sugerencia.proveedor === proveedor;
      const coincideTexto =
        !termino ||
        sugerencia.nombre.toLowerCase().includes(termino) ||
        sugerencia.proveedor.toLowerCase().includes(termino);
      return coincideProveedor && coincideTexto;
    });
  });

  readonly filasOrdenes = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    return this.ordenes().filter((orden) => {
      if (!termino) {
        return true;
      }
      return (
        orden.codigo.toLowerCase().includes(termino) ||
        orden.proveedor.toLowerCase().includes(termino)
      );
    });
  });

  readonly filasEntradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    return this.entradas().filter((entrada) => {
      if (!termino) {
        return true;
      }
      return (
        entrada.codigo.toLowerCase().includes(termino) ||
        entrada.proveedor.toLowerCase().includes(termino)
      );
    });
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  cambiarTab(tab: TabCompras): void {
    this.tab.set(tab);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  onProveedor(event: Event): void {
    this.proveedorFiltro.set((event.target as HTMLSelectElement).value);
  }

  alternar(id: number): void {
    this.compras.alternarSugerencia(id);
  }

  generarOrden(): void {
    const orden = this.compras.crearOrden();
    if (!orden) {
      this.mostrarToast('Selecciona al menos un insumo');
      return;
    }
    this.tab.set('ordenes');
    this.mostrarToast(`Orden ${orden.codigo} generada`);
  }

  cantidad(valor: number, unidad: string): string {
    const redondeado = Math.round(valor * 10) / 10;
    const texto = Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
    return `${texto} ${unidad}`;
  }

  monto(valor: number): string {
    return valor.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  textoEstado(estado: EstadoSugerencia): string {
    if (estado === 'critico') {
      return 'Crítico';
    }
    if (estado === 'bajo') {
      return 'Bajo';
    }
    return 'OK';
  }

  tonoEstado(estado: EstadoSugerencia): ChipVariant {
    if (estado === 'critico') {
      return 'danger';
    }
    if (estado === 'bajo') {
      return 'warning';
    }
    return 'neutral';
  }

  textoOrden(estado: EstadoOrden): string {
    if (estado === 'enviada') {
      return 'Enviada';
    }
    if (estado === 'recibida') {
      return 'Recibida';
    }
    return 'Borrador';
  }

  tonoOrden(estado: EstadoOrden): ChipVariant {
    if (estado === 'enviada') {
      return 'info';
    }
    if (estado === 'recibida') {
      return 'success';
    }
    return 'warning';
  }

  private mostrarToast(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => {
      this.toast.set('');
      this.temporizador = null;
    }, 2200);
  }
}

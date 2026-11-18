import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FichasService } from '../../../core/data/fichas.service';
import { InventarioService } from '../../../core/data/inventario.service';
import type { PedidoDetalle, Plato } from '../../../core/models';
import { ChipComponent, type ChipVariant } from '../chip/chip';
import { IconComponent } from '../icon/icon';
import { PanelComponent } from '../panel/panel';

export interface StockPlato {
  etiqueta: string;
  tono: ChipVariant;
}

/**
 * Menú de platos con categorías, búsqueda y badge de stock.
 *
 * Es la misma pieza que usa el pedido local (`/venta-local/pedido/:mesaId`) y
 * la que reutilizan las altas de delivery propio/externo a través de
 * `app-selector-platos`. No conoce el carrito: solo emite `agregar`.
 */
@Component({
  selector: 'app-menu-platos',
  standalone: true,
  imports: [PanelComponent, ChipComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu-platos.html',
  styleUrl: './menu-platos.css',
})
export class MenuPlatosComponent {
  private readonly fichas = inject(FichasService);
  private readonly inventario = inject(InventarioService);

  /** Líneas del pedido en curso; se usan para pintar el badge `xN`. */
  readonly items = input<readonly PedidoDetalle[]>([]);
  readonly mostrarStock = input<boolean>(true);
  readonly titulo = input<string>('Menú');
  readonly agregar = output<Plato>();

  readonly categoriaActiva = signal<string>('');
  readonly busqueda = signal<string>('');

  readonly cargando = this.fichas.cargando;
  readonly error = this.fichas.error;

  readonly categorias = computed<string[]>(() => {
    const lista: string[] = [];
    for (const plato of this.fichas.activos()) {
      if (!lista.includes(plato.categoria)) {
        lista.push(plato.categoria);
      }
    }
    return lista;
  });

  readonly platosVisibles = computed<Plato[]>(() => {
    const categoria = this.categoriaActiva();
    const termino = this.busqueda().trim().toLowerCase();
    return this.fichas.activos().filter((plato) => {
      const coincideCategoria = !categoria || plato.categoria === categoria;
      const coincideTexto =
        !termino || plato.nombre.toLowerCase().includes(termino);
      return coincideCategoria && coincideTexto;
    });
  });

  constructor() {
    // El pedido local ya dispara la carga en su `inicializar`; si el menú se
    // monta antes (delivery), lo carga aquí. Nunca duplica una carga en curso.
    if (this.fichas.platos().length === 0 && !this.fichas.cargando()) {
      void this.fichas.cargar();
    }
  }

  /**
   * El backend ya calcula si alcanza el stock para 1 unidad (`disponible`,
   * misma cuenta que el descuento). El inventario local solo es respaldo
   * cuando el dato no viene (modo demo).
   */
  stockDe(plato: Plato): StockPlato {
    if (plato.disponible === false) {
      return { etiqueta: 'Sin stock', tono: 'warning' };
    }
    if (plato.disponible === true) {
      return { etiqueta: 'Stock ok', tono: 'success' };
    }
    if (plato.disponible === null) {
      return { etiqueta: 'Sin control de stock', tono: 'neutral' };
    }
    const insuficiente = plato.ingredientes.some((ingrediente) => {
      const insumo = this.inventario.porId(ingrediente.insumoId);
      return insumo ? insumo.stockActual < ingrediente.cantidad : false;
    });
    return insuficiente
      ? { etiqueta: 'Sin stock', tono: 'warning' }
      : { etiqueta: 'Stock ok', tono: 'success' };
  }

  cantidadEnRonda(platoId: number): number {
    return this.items()
      .filter((item) => item.platilloId === platoId)
      .reduce((suma, item) => suma + item.cantidad, 0);
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  reintentar(): void {
    void this.fichas.cargar();
  }
}

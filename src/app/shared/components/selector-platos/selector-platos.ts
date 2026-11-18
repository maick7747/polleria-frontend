import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import type { PedidoDetalle, Plato } from '../../../core/models';
import { formatearMoneda, round2 } from '../../../core/utils/format';
import { MenuPlatosComponent } from '../menu-platos/menu-platos';

/**
 * Selector de platos para armar un pedido fuera de una mesa (delivery propio
 * y delivery externo). Reutiliza `app-menu-platos` (el mismo menú del pedido
 * local) y añade el carrito con cantidades y subtotal.
 *
 * El `id` de cada línea es temporal (solo para `track` y para quitar); la API
 * recibe `platillo_id`, `cantidad` y `notas`.
 */
@Component({
  selector: 'app-selector-platos',
  standalone: true,
  imports: [MenuPlatosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-platos.html',
  styleUrl: './selector-platos.css',
})
export class SelectorPlatosComponent {
  readonly items = model<PedidoDetalle[]>([]);
  readonly titulo = input<string>('Platos del pedido');
  readonly descripcion = input<string>('');
  readonly bloqueado = input<boolean>(false);

  readonly moneda = formatearMoneda;

  readonly subtotal = computed<number>(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly totalUnidades = computed<number>(() =>
    this.items().reduce((suma, item) => suma + item.cantidad, 0),
  );

  agregar(plato: Plato): void {
    if (this.bloqueado()) {
      return;
    }
    const existente = this.items().find((item) => item.platilloId === plato.id);
    if (existente) {
      this.items.update((lista) =>
        lista.map((item) => {
          if (item.platilloId !== plato.id) {
            return item;
          }
          const cantidad = item.cantidad + 1;
          return {
            ...item,
            cantidad,
            subtotal: round2(cantidad * item.precioUnitario),
          };
        }),
      );
      return;
    }

    this.items.update((lista) => [
      ...lista,
      {
        id: this.siguienteId(),
        platilloId: plato.id,
        nombre: plato.nombre,
        cantidad: 1,
        precioUnitario: plato.precioVenta,
        subtotal: plato.precioVenta,
        estadoPreparacion: 'pendiente',
      },
    ]);
  }

  quitar(itemId: number): void {
    if (this.bloqueado()) {
      return;
    }
    this.items.update((lista) => {
      const encontrado = lista.find((item) => item.id === itemId);
      if (!encontrado) {
        return lista;
      }
      if (encontrado.cantidad > 1) {
        return lista.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const cantidad = item.cantidad - 1;
          return {
            ...item,
            cantidad,
            subtotal: round2(cantidad * item.precioUnitario),
          };
        });
      }
      return lista.filter((item) => item.id !== itemId);
    });
  }

  vaciar(): void {
    if (this.bloqueado()) {
      return;
    }
    this.items.set([]);
  }

  private siguienteId(): number {
    return this.items().reduce((maximo, item) => Math.max(maximo, item.id), 0) + 1;
  }
}

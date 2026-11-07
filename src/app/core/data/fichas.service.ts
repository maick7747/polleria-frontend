import { computed, Injectable, signal } from '@angular/core';
import type { Plato } from '../models';
import { MOCK_PLATOS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class FichasService {
  private secuencia = 100;

  readonly platos = signal<Plato[]>(
    MOCK_PLATOS.map((plato) => ({
      ...plato,
      ingredientes: plato.ingredientes.map((ingrediente) => ({ ...ingrediente })),
    })),
  );

  readonly activos = computed<Plato[]>(() => this.platos().filter((plato) => plato.activo));

  porId(id: number): Plato | undefined {
    return this.platos().find((plato) => plato.id === id);
  }

  guardar(plato: Plato): void {
    const existe = this.porId(plato.id);
    if (existe) {
      this.platos.update((lista) =>
        lista.map((actual) => (actual.id === plato.id ? plato : actual)),
      );
      return;
    }
    this.platos.update((lista) => [{ ...plato, id: ++this.secuencia }, ...lista]);
  }

  filtrarPorIngrediente(texto: string): Plato[] {
    const busqueda = texto.trim().toLowerCase();
    if (!busqueda) {
      return this.platos();
    }
    return this.platos().filter((plato) =>
      plato.ingredientes.some((ingrediente) =>
        ingrediente.nombre.toLowerCase().includes(busqueda),
      ),
    );
  }
}

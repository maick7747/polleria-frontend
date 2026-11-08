import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Plato } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, PlatoDto } from '../api/api.types';
import { toPlato } from '../api/api.mappers';
import { MOCK_PLATOS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class FichasService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // En modo API arranca vacío: los mocks solo se usan en modo demo.
  readonly platos = signal<Plato[]>(
    USE_API
      ? []
      : MOCK_PLATOS.map((plato) => ({
          ...plato,
          ingredientes: plato.ingredientes.map((ingrediente) => ({ ...ingrediente })),
        })),
  );

  readonly activos = computed<Plato[]>(() => this.platos().filter((plato) => plato.activo));

  porId(id: number): Plato | undefined {
    return this.platos().find((plato) => plato.id === id);
  }

  async cargar(silencioso = false): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<PlatoDto>>('/platillos', { limit: 100 }),
      );
      this.platos.set(lista.data.map(toPlato));
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso || this.platos().length === 0) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
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

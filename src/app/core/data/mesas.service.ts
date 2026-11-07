import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { EstadoMesa, Mesa } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import type { ApiList, MesaDto } from '../api/api.types';
import { toMesa } from '../api/api.mappers';
import { MOCK_MESAS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class MesasService {
  private readonly api = inject(ApiClient);

  readonly mesas = signal<Mesa[]>(MOCK_MESAS.map((mesa) => ({ ...mesa })));
  readonly cargando = signal<boolean>(false);

  readonly libres = computed<number>(
    () => this.mesas().filter((mesa) => mesa.estado === 'libre').length,
  );

  readonly ocupadas = computed<number>(
    () => this.mesas().filter((mesa) => mesa.estado === 'ocupada').length,
  );

  porId(id: number): Mesa | undefined {
    return this.mesas().find((mesa) => mesa.id === id);
  }

  cambiarEstado(id: number, estado: EstadoMesa): void {
    this.mesas.update((lista) =>
      lista.map((mesa) => (mesa.id === id ? { ...mesa, estado } : mesa)),
    );
  }

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<MesaDto>>('/mesas', { limit: 100 }),
      );
      this.mesas.set(respuesta.data.map(toMesa));
      return true;
    } catch {
      return false;
    } finally {
      this.cargando.set(false);
    }
  }
}

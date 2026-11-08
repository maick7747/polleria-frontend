import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { EstadoMesa, Mesa } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, MesaDto } from '../api/api.types';
import { toMesa } from '../api/api.mappers';
import { MOCK_MESAS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class MesasService {
  private readonly api = inject(ApiClient);

  // En modo API arranca vacío: los mocks solo se usan en modo demo.
  readonly mesas = signal<Mesa[]>(
    USE_API ? [] : MOCK_MESAS.map((mesa) => ({ ...mesa })),
  );
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly errorDetalle = signal<string | null>(null);

  readonly libres = computed<number>(
    () => this.mesas().filter((mesa) => mesa.estado === 'libre').length,
  );

  readonly ocupadas = computed<number>(
    () => this.mesas().filter((mesa) => mesa.estado === 'ocupada').length,
  );

  porId(id: number): Mesa | undefined {
    return this.mesas().find((mesa) => mesa.id === id);
  }

  // Reemplaza todas las mesas de una sola vez (tablero agregado).
  reemplazar(dtos: MesaDto[]): void {
    this.mesas.set(dtos.map(toMesa));
  }

  cambiarEstado(id: number, estado: EstadoMesa): void {
    this.mesas.update((lista) =>
      lista.map((mesa) => (mesa.id === id ? { ...mesa, estado } : mesa)),
    );
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
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<MesaDto>>('/mesas', { limit: 100 }),
      );
      this.mesas.set(respuesta.data.map(toMesa));
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso || this.mesas().length === 0) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  // Detalle de una mesa: GET /mesas/:id devuelve la cuenta abierta con sus
  // pedidos (rondas) y el detalle de platos. Se cachea en la signal `mesas`.
  async cargarDetalle(id: number): Promise<Mesa | null> {
    if (!USE_API) {
      return this.porId(id) ?? null;
    }
    this.errorDetalle.set(null);
    try {
      const dto = await firstValueFrom(this.api.get<MesaDto>(`/mesas/${id}`));
      const mesa = toMesa(dto);
      this.mesas.update((lista) =>
        lista.map((item) => (item.id === mesa.id ? { ...item, ...mesa } : item)),
      );
      return mesa;
    } catch (error) {
      this.errorDetalle.set(mensajeError(error));
      return this.porId(id) ?? null;
    }
  }
}

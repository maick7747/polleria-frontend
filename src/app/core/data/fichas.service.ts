import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Plato } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, PageMeta, PlatoDto } from '../api/api.types';
import { toPlato } from '../api/api.mappers';
import { MOCK_PLATOS } from './mock-data';

export interface FichasQuery {
  page?: number;
  limit?: number;
  q?: string;
  categoria?: string;
  categoria_id?: number;
  activo?: boolean;
}

export interface FichasMeta extends PageMeta {
  totalActivos: number;
  categorias: { nombre: string; total: number }[];
  margenPromedio: number;
  foodCostPromedio: number;
  costoPromedio: number;
  sobre30: number;
  mejor: { id: number; nombre: string; margen: number; foodCostPct: number } | null;
  menor: { id: number; nombre: string; margen: number; foodCostPct: number } | null;
}

@Injectable({ providedIn: 'root' })
export class FichasService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly meta = signal<FichasMeta | null>(null);

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

  async cargar(opciones: FichasQuery | boolean = {}): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    const silencioso = typeof opciones === 'boolean' ? opciones : false;
    const query = typeof opciones === 'boolean' ? {} : opciones;
    const limit = query.limit ?? 100;

    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<PlatoDto>>('/platillos', {
          page: query.page ?? 1,
          limit,
          q: query.q?.trim() || undefined,
          categoria: query.categoria?.trim() || undefined,
          categoria_id: query.categoria_id,
          activo: query.activo,
        }),
      );
      this.platos.set(lista.data.map(toPlato));
      const meta = lista.meta;
      this.meta.set({
        page: meta.page ?? 1,
        limit: meta.limit ?? limit,
        total: meta.total ?? lista.data.length,
        pages: meta.pages ?? 0,
        totalActivos: meta.total_activos ?? lista.data.length,
        categorias: meta.categorias ?? [],
        margenPromedio: meta.margen_promedio ?? 0,
        foodCostPromedio: meta.food_cost_promedio ?? 0,
        costoPromedio: meta.costo_promedio ?? 0,
        sobre30: meta.sobre_30 ?? 0,
        mejor: meta.mejor
          ? {
              id: meta.mejor.id,
              nombre: meta.mejor.nombre,
              margen: meta.mejor.margen,
              foodCostPct: meta.mejor.food_cost_pct,
            }
          : null,
        menor: meta.menor
          ? {
              id: meta.menor.id,
              nombre: meta.menor.nombre,
              margen: meta.menor.margen,
              foodCostPct: meta.menor.food_cost_pct,
            }
          : null,
      });
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

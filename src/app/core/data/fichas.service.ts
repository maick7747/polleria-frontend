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

interface CategoriaPlatilloDto {
  id: number;
  nombre: string;
}

// El detalle de un platillo añade `ficha`, que el listado no siempre trae.
interface PlatoDetalleDto extends PlatoDto {
  ficha?: {
    porciones_rendimiento?: number | null;
    notas?: string | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class FichasService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;
  private ultimaConsulta: FichasQuery = {};

  readonly cargando = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
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
    if (typeof opciones !== 'boolean') {
      this.ultimaConsulta = { ...opciones };
    }
    const query = this.ultimaConsulta;
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

  async guardar(plato: Plato): Promise<boolean> {
    if (!USE_API) {
      this.guardarLocal(plato);
      return true;
    }

    if (this.guardando()) {
      return false;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.guardarRemoto(plato);
      // Alinear la señal con la BD (misma página/filtros de la última consulta).
      await this.cargar(true);
      return true;
    } catch (error) {
      // No se muta la señal local: la pantalla conserva lo que el usuario escribió.
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  private guardarLocal(plato: Plato): void {
    const existe = this.porId(plato.id);
    if (existe) {
      this.platos.update((lista) =>
        lista.map((actual) => (actual.id === plato.id ? plato : actual)),
      );
      return;
    }
    this.platos.update((lista) => [{ ...plato, id: ++this.secuencia }, ...lista]);
  }

  private async guardarRemoto(plato: Plato): Promise<void> {
    const previo = this.porId(plato.id);
    const id = Math.trunc(Number(plato.id));
    const existente = Number.isFinite(id) && id > 0;
    let platilloId: number;

    if (existente) {
      const cambios = this.camposEditables(plato, previo);
      if (Object.keys(cambios).length > 0) {
        await firstValueFrom(this.api.patch<PlatoDto>(`/platillos/${id}`, cambios));
      }
      platilloId = id;
    } else {
      const categoriaId = await this.categoriaId(plato.categoria);
      const creado = await firstValueFrom(
        this.api.post<PlatoDto>('/platillos', {
          categoria_id: categoriaId,
          nombre: plato.nombre.trim(),
          descripcion: plato.descripcion.trim(),
          precio_venta: plato.precioVenta,
        }),
      );
      platilloId = creado.id;
    }

    if (!this.debeGuardarFicha(plato, previo, existente)) {
      return;
    }

    // La ficha completa necesita las porciones y notas vigentes, que el modelo
    // `Plato` no expone; se leen del detalle para no sobrescribirlas con 1/''.
    const detalle = await firstValueFrom(
      this.api.get<PlatoDetalleDto>(`/platillos/${platilloId}`),
    );
    await firstValueFrom(
      this.api.put<PlatoDto>(`/platillos/${platilloId}/ficha`, {
        porciones_rendimiento: this.porcionesDe(detalle),
        ingredientes: plato.ingredientes.map((ingrediente) => ({
          insumo_id: ingrediente.insumoId,
          cantidad: ingrediente.cantidad,
        })),
        notas: detalle.ficha?.notas ?? '',
      }),
    );
  }

  private camposEditables(plato: Plato, previo: Plato | undefined): Record<string, unknown> {
    const cambios: Record<string, unknown> = {};
    const nombre = plato.nombre.trim();
    if (nombre && (!previo || previo.nombre !== nombre)) {
      cambios['nombre'] = nombre;
    }
    const descripcion = plato.descripcion.trim();
    if (!previo || previo.descripcion.trim() !== descripcion) {
      cambios['descripcion'] = descripcion;
    }
    if (!previo || Number(previo.precioVenta) !== plato.precioVenta) {
      cambios['precio_venta'] = plato.precioVenta;
    }
    return cambios;
  }

  private async categoriaId(nombre: string): Promise<number> {
    const lista = await firstValueFrom(
      this.api.get<ApiList<CategoriaPlatilloDto>>('/categorias-platillo'),
    );
    const buscada = nombre.trim().toLowerCase();
    const categoria = lista.data.find(
      (item) => item.nombre.trim().toLowerCase() === buscada,
    );
    if (!categoria) {
      throw new Error(`La categoría "${nombre}" no existe en el catálogo.`);
    }
    return categoria.id;
  }

  private debeGuardarFicha(
    plato: Plato,
    previo: Plato | undefined,
    existente: boolean,
  ): boolean {
    if (!existente || !previo) {
      return plato.ingredientes.length > 0;
    }
    return !this.mismosIngredientes(plato.ingredientes, previo.ingredientes);
  }

  private mismosIngredientes(
    actual: Plato['ingredientes'],
    previo: Plato['ingredientes'],
  ): boolean {
    if (actual.length !== previo.length) {
      return false;
    }
    const ordenActual = [...actual].sort((a, b) => a.insumoId - b.insumoId);
    const ordenPrevio = [...previo].sort((a, b) => a.insumoId - b.insumoId);
    return ordenActual.every((item, indice) => {
      const otro = ordenPrevio[indice];
      if (!otro) {
        return false;
      }
      return (
        item.insumoId === otro.insumoId &&
        Math.abs(item.cantidad - otro.cantidad) < 0.0001
      );
    });
  }

  private porcionesDe(detalle: PlatoDetalleDto): number {
    const porciones = Math.trunc(Number(detalle.ficha?.porciones_rendimiento));
    return Number.isFinite(porciones) && porciones >= 1 ? porciones : 1;
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

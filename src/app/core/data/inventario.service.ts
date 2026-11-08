import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Insumo, MovimientoStock, TipoMovimiento } from '../models';
import { round3 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed, mensajeError } from '../api/api.helpers';
import type { AjusteResponseDto, ApiList, InsumoDto, PageMeta } from '../api/api.types';
import { toInsumo, toMovimiento } from '../api/api.mappers';
import { MOCK_INSUMOS, MOCK_MOVIMIENTOS } from './mock-data';

export interface InventarioMeta extends PageMeta {
  totalInsumos: number;
  totalOk: number;
  totalBajo: number;
  totalCritico: number;
  totalAlertas: number;
  valorInventario: number;
}

export interface InventarioQuery {
  page?: number;
  limit?: number;
  q?: string;
  estado?: string;
}

const META_INICIAL: InventarioMeta = {
  page: 1,
  limit: 20,
  total: 0,
  pages: 0,
  totalInsumos: 0,
  totalOk: 0,
  totalBajo: 0,
  totalCritico: 0,
  totalAlertas: 0,
  valorInventario: 0,
};

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly api = inject(ApiClient);

  private secuencia = 1000;

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly insumos = signal<Insumo[]>(
    USE_API ? [] : MOCK_INSUMOS.map((insumo) => ({ ...insumo })),
  );

  readonly movimientos = signal<MovimientoStock[]>(
    USE_API ? [] : MOCK_MOVIMIENTOS.map((movimiento) => ({ ...movimiento })),
  );

  readonly alertas = signal<Insumo[]>(
    USE_API
      ? []
      : MOCK_INSUMOS.filter((insumo) => insumo.stockActual <= insumo.stockMinimo).map(
          (insumo) => ({ ...insumo }),
        ),
  );

  readonly meta = signal<InventarioMeta>({ ...META_INICIAL });

  readonly stockBajo = computed<Insumo[]>(() => this.alertas());

  readonly valorInventario = computed<number>(() => this.meta().valorInventario);

  readonly conteos = computed(() => {
    const meta = this.meta();
    return {
      todos: meta.totalInsumos,
      ok: meta.totalOk,
      bajo: meta.totalBajo,
      critico: meta.totalCritico,
      alertas: meta.totalAlertas,
    };
  });

  porId(id: number): Insumo | undefined {
    return this.insumos().find((insumo) => insumo.id === id);
  }

  async cargar(opciones: InventarioQuery = {}): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? this.meta().limit;
    const q = opciones.q?.trim() || undefined;
    const estado = opciones.estado || undefined;

    this.cargando.set(true);
    this.error.set(null);
    try {
      const [lista, alertas] = await Promise.all([
        firstValueFrom(
          this.api.get<ApiList<InsumoDto>>('/inventario', { page, limit, q, estado }),
        ),
        firstValueFrom(this.api.get<ApiList<InsumoDto>>('/inventario/alertas')),
      ]);

      this.insumos.set(lista.data.map(toInsumo));
      this.alertas.set(alertas.data.map(toInsumo));
      this.meta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total: lista.meta.total ?? lista.data.length,
        pages: lista.meta.pages ?? 0,
        totalInsumos: lista.meta.total_insumos ?? lista.meta.total ?? lista.data.length,
        totalOk: lista.meta.total_ok ?? 0,
        totalBajo: lista.meta.total_bajo ?? 0,
        totalCritico: lista.meta.total_critico ?? 0,
        totalAlertas: lista.meta.total_alertas ?? alertas.data.length,
        valorInventario: lista.meta.valor_inventario ?? 0,
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  registrarMovimiento(
    insumoId: number,
    tipo: TipoMovimiento,
    cantidad: number,
    referenciaTipo: MovimientoStock['referenciaTipo'],
    referenciaId: number,
    usuarioId: number,
    observacion: string,
  ): MovimientoStock | null {
    const insumo = this.porId(insumoId);
    if (!insumo) {
      return null;
    }
    const signo = tipo === 'entrada' || tipo === 'devolucion' ? 1 : -1;
    const stockResultante = Math.max(0, round3(insumo.stockActual + signo * cantidad));
    this.insumos.update((lista) =>
      lista.map((actual) =>
        actual.id === insumoId ? { ...actual, stockActual: stockResultante } : actual,
      ),
    );
    return this.crearMovimiento(
      insumoId,
      tipo,
      cantidad,
      stockResultante,
      referenciaTipo,
      referenciaId,
      usuarioId,
      observacion,
    );
  }

  async ajustarStock(
    insumoId: number,
    nuevoStock: number,
    usuarioId: number,
    observacion: string,
  ): Promise<MovimientoStock | null> {
    const insumo = this.porId(insumoId);
    if (!insumo) {
      return null;
    }

    if (USE_API) {
      try {
        const respuesta = await firstValueFrom(
          this.api.post<AjusteResponseDto>('/inventario/ajustes', {
            items: [
              {
                insumo_id: insumoId,
                cantidad: nuevoStock,
                observacion,
              },
            ],
          }),
        );
        const movimiento = respuesta.movimientos[0];
        if (movimiento) {
          const normalizado = toMovimiento(movimiento);
          this.insumos.update((lista) =>
            lista.map((actual) =>
              actual.id === insumoId
                ? { ...actual, stockActual: normalizado.stockResultante }
                : actual,
            ),
          );
          this.movimientos.update((lista) => [normalizado, ...lista]);
          return normalizado;
        }
        const stockResultante = this.actualizarStockLocal(insumoId, nuevoStock);
        return this.crearMovimiento(
          insumoId,
          'ajuste',
          round3(nuevoStock - insumo.stockActual),
          stockResultante,
          'ajuste',
          0,
          usuarioId,
          observacion,
        );
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    const cantidad = round3(nuevoStock - insumo.stockActual);
    const stockResultante = this.actualizarStockLocal(insumoId, nuevoStock);
    return this.crearMovimiento(
      insumoId,
      'ajuste',
      cantidad,
      stockResultante,
      'ajuste',
      0,
      usuarioId,
      observacion,
    );
  }

  async ajustarMinimo(insumoId: number, nuevoMinimo: number): Promise<boolean> {
    if (USE_API) {
      try {
        const dto = await firstValueFrom(
          this.api.patch<InsumoDto>(`/inventario/${insumoId}/minimo`, {
            stock_minimo: nuevoMinimo,
          }),
        );
        const normalizado = toInsumo(dto);
        this.insumos.update((lista) =>
          lista.map((actual) => (actual.id === insumoId ? normalizado : actual)),
        );
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    this.insumos.update((lista) =>
      lista.map((actual) =>
        actual.id === insumoId ? { ...actual, stockMinimo: nuevoMinimo } : actual,
      ),
    );
    return true;
  }

  private actualizarStockLocal(insumoId: number, nuevoStock: number): number {
    this.insumos.update((lista) =>
      lista.map((actual) =>
        actual.id === insumoId ? { ...actual, stockActual: nuevoStock } : actual,
      ),
    );
    return nuevoStock;
  }

  private crearMovimiento(
    insumoId: number,
    tipo: TipoMovimiento,
    cantidad: number,
    stockResultante: number,
    referenciaTipo: MovimientoStock['referenciaTipo'],
    referenciaId: number,
    usuarioId: number,
    observacion: string,
  ): MovimientoStock {
    const movimiento: MovimientoStock = {
      id: ++this.secuencia,
      insumoId,
      tipo,
      cantidad,
      stockResultante,
      referenciaTipo,
      referenciaId,
      usuarioId,
      observacion,
      fecha: new Date().toISOString(),
    };
    this.movimientos.update((lista) => [movimiento, ...lista]);
    return movimiento;
  }
}

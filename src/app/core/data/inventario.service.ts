import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Insumo, MovimientoStock, TipoMovimiento } from '../models';
import { round3 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed } from '../api/api.helpers';
import type { AjusteResponseDto, ApiList, InsumoDto } from '../api/api.types';
import { toInsumo, toMovimiento } from '../api/api.mappers';
import { MOCK_INSUMOS, MOCK_MOVIMIENTOS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly api = inject(ApiClient);

  private secuencia = 1000;

  readonly cargando = signal<boolean>(false);

  readonly insumos = signal<Insumo[]>(MOCK_INSUMOS.map((insumo) => ({ ...insumo })));

  readonly movimientos = signal<MovimientoStock[]>(
    MOCK_MOVIMIENTOS.map((movimiento) => ({ ...movimiento })),
  );

  readonly stockBajo = computed<Insumo[]>(() =>
    this.insumos().filter((insumo) => insumo.stockActual <= insumo.stockMinimo),
  );

  readonly valorInventario = computed<number>(() =>
    round3(
      this.insumos().reduce(
        (suma, insumo) => suma + insumo.stockActual * insumo.costoPromedio,
        0,
      ),
    ),
  );

  porId(id: number): Insumo | undefined {
    return this.insumos().find((insumo) => insumo.id === id);
  }

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<InsumoDto>>('/inventario', { limit: 100 }),
      );
      this.insumos.set(respuesta.data.map(toInsumo));
      return true;
    } catch {
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

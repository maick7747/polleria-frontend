import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Gasto } from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, GastoDto, GastoResumenDto, PageMeta } from '../api/api.types';
import { toGasto } from '../api/api.mappers';
import { MOCK_GASTOS } from './mock-data';

const HOY = '2026-10-14';

export interface GastosQuery {
  page?: number;
  limit?: number;
  categoria?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  sort?: string;
}

export interface RangoGastos {
  desde?: string;
  hasta?: string;
}

export interface GastosResumen {
  desde: string;
  hasta: string;
  total: number;
  registros: number;
  porCategoria: { categoria: string; registros: number; total: number }[];
}

const META_INICIAL: PageMeta = {
  page: 1,
  limit: 20,
  total: USE_API ? 0 : MOCK_GASTOS.length,
  pages: USE_API ? 0 : 1,
};

function paginar<T>(
  lista: readonly T[],
  page: number,
  limit: number,
): { items: T[]; meta: PageMeta } {
  const total = lista.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const inicio = (Math.max(1, page) - 1) * limit;
  return {
    items: lista.slice(inicio, inicio + limit),
    meta: { page: Math.max(1, page), limit, total, pages },
  };
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;
  private ultimaConsulta: GastosQuery = {};
  private ultimoRango: RangoGastos = {};

  private readonly todosMock = signal<Gasto[]>(
    MOCK_GASTOS.map((gasto) => ({ ...gasto })),
  );

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly gastos = signal<Gasto[]>(
    USE_API ? [] : MOCK_GASTOS.map((gasto) => ({ ...gasto })),
  );

  readonly meta = signal<PageMeta>({ ...META_INICIAL });

  readonly resumen = signal<GastosResumen | null>(null);

  readonly totalHoy = computed<number>(() => {
    const data = this.resumen();
    if (data) {
      return round2(data.total);
    }
    return round2(
      this.todosMock()
        .filter((gasto) => gasto.fecha === HOY)
        .reduce((suma, gasto) => suma + gasto.monto, 0),
    );
  });

  readonly totalMes = computed<number>(() => {
    const data = this.resumen();
    if (data) {
      return round2(data.total);
    }
    return round2(this.todosMock().reduce((suma, gasto) => suma + gasto.monto, 0));
  });

  async cargar(opciones: GastosQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;
    const q = opciones.q?.trim() || undefined;

    this.ultimaConsulta = {
      page,
      limit,
      categoria: opciones.categoria || undefined,
      desde: opciones.desde || undefined,
      hasta: opciones.hasta || undefined,
      q,
      sort: opciones.sort ?? 'fecha:desc',
    };

    if (!USE_API) {
      return this.cargarMock(this.ultimaConsulta);
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<GastoDto>>('/gastos', {
          page,
          limit,
          categoria: this.ultimaConsulta.categoria,
          desde: this.ultimaConsulta.desde,
          hasta: this.ultimaConsulta.hasta,
          q,
          sort: this.ultimaConsulta.sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.gastos.set(lista.data.map(toGasto));
      this.meta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarResumen(rango: RangoGastos = {}): Promise<boolean> {
    this.ultimoRango = { ...rango };

    if (!USE_API) {
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.get<GastoResumenDto>('/gastos/resumen', {
          desde: rango.desde,
          hasta: rango.hasta,
        }),
      );
      this.resumen.set({
        desde: dto.desde,
        hasta: dto.hasta,
        total: Number(dto.total ?? 0),
        registros: Number(dto.registros ?? 0),
        porCategoria: (dto.por_categoria ?? []).map((fila) => ({
          categoria: fila.categoria,
          registros: Number(fila.registros ?? 0),
          total: Number(fila.total ?? 0),
        })),
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async registrar(entrada: Omit<Gasto, 'id'>): Promise<Gasto | null> {
    if (!USE_API) {
      const gasto: Gasto = { id: ++this.secuencia, ...entrada };
      this.todosMock.update((lista) => [gasto, ...lista]);
      this.gastos.update((lista) => [gasto, ...lista]);
      this.meta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return gasto;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<GastoDto>('/gastos', {
          fecha: entrada.fecha || undefined,
          categoria: entrada.categoria,
          descripcion: entrada.descripcion,
          monto: entrada.monto,
          metodo_pago: entrada.metodoPago,
          descuenta_caja_chica: entrada.descuentaCajaChica,
          comprobante_url: entrada.comprobanteUrl || undefined,
        }),
      );
      const gasto = toGasto(dto);
      await this.cargar(this.ultimaConsulta);
      await this.cargarResumen(this.ultimoRango);
      return gasto;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async recargar(): Promise<boolean> {
    return this.cargar(this.ultimaConsulta);
  }

  private cargarMock(opciones: GastosQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? 20;
    const termino = opciones.q?.trim().toLowerCase() ?? '';
    const desde = opciones.desde;
    const hasta = opciones.hasta;

    const filtradas = this.todosMock().filter(
      (gasto) =>
        (!opciones.categoria || gasto.categoria === opciones.categoria) &&
        (!desde || gasto.fecha >= desde) &&
        (!hasta || gasto.fecha <= hasta) &&
        (!termino ||
          gasto.descripcion.toLowerCase().includes(termino) ||
          (gasto.comprobanteUrl ?? '').toLowerCase().includes(termino)),
    );
    const { items, meta } = paginar(filtradas, page, limit);
    this.gastos.set(items.map((gasto) => ({ ...gasto })));
    this.meta.set(meta);
    return true;
  }
}

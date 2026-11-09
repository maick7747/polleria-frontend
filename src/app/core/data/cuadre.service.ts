import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed, mensajeError } from '../api/api.helpers';
import type { ApiList, CuadreDto, PageMeta } from '../api/api.types';

export interface CuadreHistorialQuery {
  page?: number;
  limit?: number;
  desde?: string;
  hasta?: string;
  sort?: string;
}

export interface CuadrePendienteDto {
  id: number;
  fecha: string;
  estado: string;
  fondo_inicial: number;
  total_ventas?: number;
  total_egresos?: number;
  monto_esperado?: number;
  resumen?: {
    total_ventas?: number;
    total_egresos?: number;
    monto_esperado?: number;
  };
}

export interface CuadrePendiente {
  id: number;
  fecha: string;
  estado: string;
  fondoInicial: number;
  totalVentas: number;
  totalEgresos: number;
  montoEsperado: number;
}

export interface CuadreHistorialFila {
  id: number;
  fecha: string;
  estado: string;
  fondoInicial: number;
  totalVentas: number;
  totalEgresos: number;
  montoEsperado: number;
  efectivoContado: number | null;
  pagosDigitales: number;
  totalReal: number | null;
  diferencia: number | null;
  observaciones: string;
  cerradoPor: string;
}

const HISTORIAL_DEMO: readonly CuadreHistorialFila[] = [
  { id: 1, fecha: '2026-10-14', estado: 'cerrada', fondoInicial: 200, totalVentas: 2450, totalEgresos: 225, montoEsperado: 2425, efectivoContado: 1425, pagosDigitales: 1000, totalReal: 2425, diferencia: 0, observaciones: '', cerradoPor: 'Cajero #3' },
  { id: 2, fecha: '2026-10-13', estado: 'cerrada', fondoInicial: 200, totalVentas: 1980, totalEgresos: 140, montoEsperado: 2040, efectivoContado: 1040, pagosDigitales: 1005, totalReal: 2045, diferencia: 5, observaciones: 'Sobrante menor en efectivo', cerradoPor: 'Cajero #3' },
  { id: 3, fecha: '2026-10-12', estado: 'cerrada', fondoInicial: 200, totalVentas: 2210, totalEgresos: 310, montoEsperado: 2100, efectivoContado: 1100, pagosDigitales: 990, totalReal: 2090, diferencia: -10, observaciones: 'Faltante revisado con administración', cerradoPor: 'Cajero #4' },
  { id: 4, fecha: '2026-10-11', estado: 'cerrada', fondoInicial: 150, totalVentas: 1750, totalEgresos: 90, montoEsperado: 1810, efectivoContado: 810, pagosDigitales: 1000, totalReal: 1810, diferencia: 0, observaciones: '', cerradoPor: 'Cajero #3' },
  { id: 5, fecha: '2026-10-10', estado: 'cerrada', fondoInicial: 200, totalVentas: 2680, totalEgresos: 420, montoEsperado: 2460, efectivoContado: 1460, pagosDigitales: 1000, totalReal: 2460, diferencia: 0, observaciones: '', cerradoPor: 'Cajero #4' },
];

const HISTORIAL_META_INICIAL: PageMeta = {
  page: 1,
  limit: 10,
  total: USE_API ? 0 : HISTORIAL_DEMO.length,
  pages: USE_API ? 0 : Math.ceil(HISTORIAL_DEMO.length / 10),
};

const mapaPendiente = (dto: CuadrePendienteDto): CuadrePendiente => ({
  id: dto.id,
  fecha: dto.fecha,
  estado: dto.estado,
  fondoInicial: Number(dto.fondo_inicial ?? 0),
  totalVentas: Number(dto.resumen?.total_ventas ?? dto.total_ventas ?? 0),
  totalEgresos: Number(dto.resumen?.total_egresos ?? dto.total_egresos ?? 0),
  montoEsperado: Number(dto.resumen?.monto_esperado ?? dto.monto_esperado ?? 0),
});

const mapaCuadre = (dto: CuadreDto): CuadreHistorialFila => ({
  id: dto.id,
  fecha: dto.fecha,
  estado: dto.estado,
  fondoInicial: Number(dto.fondo_inicial ?? 0),
  totalVentas: Number(dto.resumen?.total_ventas ?? dto.total_ventas ?? 0),
  totalEgresos: Number(dto.resumen?.total_egresos ?? dto.total_egresos ?? 0),
  montoEsperado: Number(dto.resumen?.monto_esperado ?? dto.monto_esperado ?? 0),
  efectivoContado:
    dto.efectivo_contado === null || dto.efectivo_contado === undefined
      ? null
      : Number(dto.efectivo_contado),
  pagosDigitales: Number(dto.pagos_digitales ?? 0),
  totalReal: dto.total_real === null || dto.total_real === undefined ? null : Number(dto.total_real),
  diferencia:
    dto.diferencia === null || dto.diferencia === undefined ? null : Number(dto.diferencia),
  observaciones: dto.observaciones ?? '',
  cerradoPor: dto.usuario_cierre_id ? `Usuario #${dto.usuario_cierre_id}` : '—',
});

@Injectable({ providedIn: 'root' })
export class CuadreService {
  private readonly api = inject(ApiClient);

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly cuadreId = signal<number | null>(null);

  readonly historial = signal<CuadreHistorialFila[]>(
    USE_API ? [] : HISTORIAL_DEMO.map((fila) => ({ ...fila })),
  );
  readonly historialMeta = signal<PageMeta>({ ...HISTORIAL_META_INICIAL });
  readonly historialCargando = signal<boolean>(false);
  readonly historialError = signal<string | null>(null);

  // Cajas de días anteriores que siguen abiertas (Opción A: 1 caja por día).
  readonly pendientes = signal<CuadrePendiente[]>([]);
  readonly cargandoPendientes = signal<boolean>(false);
  readonly errorPendientes = signal<string | null>(null);

  readonly abierta = signal<boolean>(false);
  readonly estado = signal<string>(USE_API ? '' : 'abierta');
  readonly reabiertoEn = signal<string | null>(null);
  readonly motivoReapertura = signal<string | null>(null);
  readonly fondoInicial = signal<number>(200);
  readonly totalVentas = signal<number>(2450);
  readonly totalEgresos = signal<number>(225);
  readonly efectivoContado = signal<number>(0);
  readonly pagosDigitales = signal<number>(0);
  readonly fechaApertura = signal<string>('2026-10-14T11:00:00-05:00');

  readonly montoEsperado = computed<number>(() =>
    round2(this.fondoInicial() + this.totalVentas() - this.totalEgresos()),
  );

  readonly totalReal = computed<number>(() =>
    round2(this.efectivoContado() + this.pagosDigitales()),
  );

  readonly diferencia = computed<number>(() =>
    round2(this.totalReal() - this.montoEsperado()),
  );

  async cargar(silencioso = false): Promise<boolean> {
    if (!USE_API) {
      this.error.set(null);
      return true;
    }
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
      // Las cajas pendientes acompañan la carga del día; un fallo no bloquea.
      void this.cargarPendientes();
    }
    try {
      const dto = await firstValueFrom(this.api.get<CuadreDto | null>('/cuadre-caja'));
      if (dto) {
        this.aplicar(dto);
      } else {
        this.cuadreId.set(null);
        this.abierta.set(false);
        this.estado.set('sin_cuadre');
        this.reabiertoEn.set(null);
        this.motivoReapertura.set(null);
        this.totalVentas.set(0);
        this.totalEgresos.set(0);
      }
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  /**
   * Cajas abiertas de días anteriores. Se listan para cerrarlas antes de
   * operar el día de hoy (Opción A: una sola caja por día).
   */
  async cargarPendientes(): Promise<boolean> {
    if (!USE_API) {
      this.pendientes.set([]);
      this.errorPendientes.set(null);
      return true;
    }
    this.cargandoPendientes.set(true);
    this.errorPendientes.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<{ data: CuadrePendienteDto[] }>('/cuadre-caja/pendientes'),
      );
      this.pendientes.set((respuesta?.data ?? []).map(mapaPendiente));
      return true;
    } catch (error) {
      this.errorPendientes.set(mensajeError(error));
      return false;
    } finally {
      this.cargandoPendientes.set(false);
    }
  }

  /**
   * Cierra una caja de un día anterior. Propaga el `ApiError` del servidor
   * (403 SOLO_ADMIN, 409 CUENTAS_ABIERTAS, 422) para que la página lo muestre.
   */
  async cerrarPendiente(
    id: number,
    efectivoContado: number,
    pagosDigitales: number,
    observaciones: string,
  ): Promise<boolean> {
    const obs = observaciones.trim();
    if (!USE_API) {
      this.pendientes.update((lista) => lista.filter((pendiente) => pendiente.id !== id));
      return true;
    }
    await firstValueFrom(
      this.api.post<CuadreDto>(`/cuadre-caja/${id}/cierre`, {
        efectivo_contado: efectivoContado,
        pagos_digitales: pagosDigitales,
        observaciones: obs ? obs : null,
      }),
    );
    await this.cargarPendientes();
    await this.cargar();
    return true;
  }

  async abrir(fondoInicial: number): Promise<boolean> {
    if (USE_API) {
      try {
        const dto = await firstValueFrom(
          this.api.post<CuadreDto>('/cuadre-caja/apertura', {
            fondo_inicial: fondoInicial,
          }),
        );
        this.aplicar(dto);
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    this.fondoInicial.set(fondoInicial);
    this.abierta.set(true);
    this.fechaApertura.set(new Date().toISOString());
    return true;
  }

  registrarVenta(monto: number): void {
    this.totalVentas.update((actual) => round2(actual + monto));
  }

  registrarEgreso(monto: number): void {
    this.totalEgresos.update((actual) => round2(actual + monto));
  }

  async cerrar(efectivoContado: number, pagosDigitales: number): Promise<boolean> {
    if (USE_API) {
      if (this.cuadreId() === null) {
        await this.cargar();
      }
      const id = this.cuadreId();
      if (id !== null) {
        const diferencia = round2(
          efectivoContado + pagosDigitales - this.montoEsperado(),
        );
        try {
          const dto = await firstValueFrom(
            this.api.post<CuadreDto>(`/cuadre-caja/${id}/cierre`, {
              efectivo_contado: efectivoContado,
              pagos_digitales: pagosDigitales,
              observaciones:
                Math.abs(diferencia) > 0.009
                  ? `Cierre desde la app · diferencia ${diferencia.toFixed(2)}`
                  : null,
            }),
          );
          this.aplicar(dto);
          return true;
        } catch (error) {
          if (!esFalloRed(error)) {
            throw error;
          }
        }
      }
    }

    this.efectivoContado.set(efectivoContado);
    this.pagosDigitales.set(pagosDigitales);
    this.abierta.set(false);
    this.estado.set('cerrada');
    return true;
  }

  /**
   * Reabre el cuadre cerrado del día. El motivo es obligatorio (5–300
   * caracteres). Si el backend rechaza la operación (409/422) el `ApiError`
   * se propaga con el mensaje del servidor para que la página lo muestre.
   */
  async reabrir(motivo: string): Promise<boolean> {
    const id = this.cuadreId();
    if (id === null) {
      await this.cargar();
    }
    const cuadreId = this.cuadreId();

    if (!USE_API || cuadreId === null) {
      if (cuadreId === null && USE_API) {
        throw new Error('No hay un cuadre de caja para reabrir.');
      }
      this.abierta.set(true);
      this.estado.set('abierta');
      this.reabiertoEn.set(new Date().toISOString());
      this.motivoReapertura.set(motivo);
      return true;
    }

    const dto = await firstValueFrom(
      this.api.post<CuadreDto>(`/cuadre-caja/${cuadreId}/reabrir`, { motivo }),
    );
    this.aplicar(dto);
    return true;
  }

  async cargarHistorial(opciones: CuadreHistorialQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 10;

    if (!USE_API) {
      const filtradas = HISTORIAL_DEMO.filter(
        (fila) =>
          (!opciones.desde || fila.fecha >= opciones.desde) &&
          (!opciones.hasta || fila.fecha <= opciones.hasta),
      )
        .map((fila) => ({ ...fila }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      const total = filtradas.length;
      const pages = total === 0 ? 0 : Math.ceil(total / limit);
      const inicio = (page - 1) * limit;
      this.historial.set(filtradas.slice(inicio, inicio + limit));
      this.historialMeta.set({ page, limit, total, pages });
      this.historialError.set(null);
      return true;
    }

    this.historialCargando.set(true);
    this.historialError.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<CuadreDto>>('/cuadre-caja/historial', {
          page,
          limit,
          desde: opciones.desde || undefined,
          hasta: opciones.hasta || undefined,
          sort: opciones.sort ?? 'fecha:desc',
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.historial.set(lista.data.map(mapaCuadre));
      this.historialMeta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.historialError.set(mensajeError(error));
      return false;
    } finally {
      this.historialCargando.set(false);
    }
  }

  async descargarPdf(id: number): Promise<Blob> {
    if (!USE_API) {
      throw new Error('Exportación disponible con el servidor.');
    }
    return firstValueFrom(this.api.getBlob(`/cuadre-caja/${id}/pdf`));
  }

  private aplicar(dto: CuadreDto): void {
    this.cuadreId.set(dto.id);
    this.estado.set(dto.estado);
    this.abierta.set(dto.estado === 'abierta');
    this.reabiertoEn.set(dto.reabierto_en ?? null);
    this.motivoReapertura.set(dto.motivo_reapertura ?? null);
    this.fondoInicial.set(dto.fondo_inicial);
    this.totalVentas.set(dto.resumen?.total_ventas ?? dto.total_ventas);
    this.totalEgresos.set(dto.resumen?.total_egresos ?? dto.total_egresos);
    this.efectivoContado.set(dto.efectivo_contado ?? 0);
    this.pagosDigitales.set(dto.pagos_digitales);
    this.fechaApertura.set(dto.fecha_apertura);
  }
}

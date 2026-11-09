import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Devolucion, ResolucionDevolucion } from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, DevolucionDto, PageMeta } from '../api/api.types';
import { toDevolucion } from '../api/api.mappers';
import { MOCK_DEVOLUCIONES } from './mock-data';

export interface DevolucionesQuery {
  page?: number;
  limit?: number;
  estado?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  sort?: string;
}

export interface NuevaDevolucion {
  pedidoId: number;
  pedidoNumero: string;
  pedidoDetalleId?: number;
  motivo: string;
  detalle: string;
  montoReembolsado?: number;
}

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
export class DevolucionesService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;
  private ultimaConsulta: DevolucionesQuery = {};

  private readonly todosMock = signal<Devolucion[]>(
    MOCK_DEVOLUCIONES.map((devolucion) => ({ ...devolucion })),
  );

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly devoluciones = signal<Devolucion[]>(
    USE_API ? [] : MOCK_DEVOLUCIONES.map((devolucion) => ({ ...devolucion })),
  );

  readonly detalle = signal<Devolucion | null>(null);

  readonly meta = signal<PageMeta>({
    page: 1,
    limit: 20,
    total: USE_API ? 0 : MOCK_DEVOLUCIONES.length,
    pages: USE_API ? 0 : MOCK_DEVOLUCIONES.length > 0 ? 1 : 0,
  });

  readonly pendientes = computed<Devolucion[]>(() =>
    this.devoluciones().filter((devolucion) => devolucion.estado === 'pendiente'),
  );

  readonly totalReembolsado = computed<number>(() =>
    round2(
      (USE_API ? this.devoluciones() : this.todosMock()).reduce(
        (suma, devolucion) => suma + devolucion.montoReembolsado,
        0,
      ),
    ),
  );

  async cargar(opciones: DevolucionesQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? this.meta().limit;

    this.ultimaConsulta = {
      page,
      limit,
      estado: opciones.estado || undefined,
      desde: opciones.desde || undefined,
      hasta: opciones.hasta || undefined,
      q: opciones.q?.trim() || undefined,
      sort: opciones.sort ?? 'fecha_reporte:desc',
    };

    if (!USE_API) {
      return this.cargarMock(this.ultimaConsulta);
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<DevolucionDto>>('/devoluciones', {
          page,
          limit,
          estado: this.ultimaConsulta.estado,
          desde: this.ultimaConsulta.desde,
          hasta: this.ultimaConsulta.hasta,
          q: this.ultimaConsulta.q,
          sort: this.ultimaConsulta.sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.devoluciones.set(lista.data.map(toDevolucion));
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

  async cargarDetalle(id: number): Promise<Devolucion | null> {
    if (!USE_API) {
      const local =
        this.todosMock().find((devolucion) => devolucion.id === id) ??
        this.devoluciones().find((devolucion) => devolucion.id === id) ??
        null;
      this.detalle.set(local ? { ...local } : null);
      return local;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.get<DevolucionDto>(`/devoluciones/${id}`),
      );
      const devolucion = toDevolucion(dto);
      this.detalle.set(devolucion);
      this.devoluciones.update((lista) =>
        lista.map((actual) => (actual.id === id ? devolucion : actual)),
      );
      return devolucion;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async registrar(entrada: NuevaDevolucion): Promise<Devolucion | null> {
    if (!USE_API) {
      const devolucion: Devolucion = {
        id: ++this.secuencia,
        pedidoId: entrada.pedidoId,
        pedidoNumero: entrada.pedidoNumero,
        pedidoDetalleId: entrada.pedidoDetalleId,
        fechaReporte: new Date().toISOString(),
        motivo: entrada.motivo,
        detalle: entrada.detalle,
        montoReembolsado: entrada.montoReembolsado ?? 0,
        estado: 'pendiente',
      };
      this.todosMock.update((lista) => [devolucion, ...lista]);
      this.cargarMock(this.ultimaConsulta);
      return devolucion;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DevolucionDto>('/devoluciones', {
          pedido_id: entrada.pedidoId,
          pedido_detalle_id: entrada.pedidoDetalleId,
          motivo: entrada.motivo,
          detalle: entrada.detalle,
          monto_reembolsado: entrada.montoReembolsado,
        }),
      );
      const devolucion = toDevolucion(dto);
      await this.cargar(this.ultimaConsulta);
      return devolucion;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async resolver(
    id: number,
    resolucion: ResolucionDevolucion,
    motivo?: string,
    montoReembolsado?: number,
  ): Promise<boolean> {
    if (!USE_API) {
      this.todosMock.update((lista) =>
        lista.map((actual) =>
          actual.id === id
            ? {
                ...actual,
                estado: 'aceptada',
                resolucion,
                montoReembolsado:
                  montoReembolsado !== undefined
                    ? round2(montoReembolsado)
                    : actual.montoReembolsado,
                fechaResolucion: new Date().toISOString(),
              }
            : actual,
        ),
      );
      this.cargarMock(this.ultimaConsulta);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DevolucionDto>(`/devoluciones/${id}/resolver`, {
          resolucion,
          motivo: motivo?.trim() || undefined,
          monto_reembolsado: montoReembolsado,
        }),
      );
      const devolucion = toDevolucion(dto);
      this.detalle.set(devolucion);
      await this.cargar(this.ultimaConsulta);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async reembolsar(
    id: number,
    metodo: string,
    monto: number,
    observacion?: string,
  ): Promise<boolean> {
    if (!USE_API) {
      this.todosMock.update((lista) =>
        lista.map((actual) =>
          actual.id === id
            ? { ...actual, montoReembolsado: round2(monto) }
            : actual,
        ),
      );
      this.cargarMock(this.ultimaConsulta);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DevolucionDto>(`/devoluciones/${id}/reembolso`, {
          metodo,
          monto,
          observacion: observacion?.trim() || undefined,
        }),
      );
      const devolucion = toDevolucion(dto);
      this.detalle.set(devolucion);
      await this.cargar(this.ultimaConsulta);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  private cargarMock(opciones: DevolucionesQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? 20;
    const desde = opciones.desde;
    const hasta = opciones.hasta;
    const termino = opciones.q?.trim().toLowerCase() ?? '';

    const filtradas = this.todosMock().filter((devolucion) => {
      const fecha = devolucion.fechaReporte.slice(0, 10);
      return (
        (!opciones.estado || devolucion.estado === opciones.estado) &&
        (!desde || fecha >= desde) &&
        (!hasta || fecha <= hasta) &&
        (!termino ||
          devolucion.pedidoNumero.toLowerCase().includes(termino) ||
          devolucion.motivo.toLowerCase().includes(termino) ||
          devolucion.detalle.toLowerCase().includes(termino))
      );
    });

    const ordenadas = [...filtradas];
    const [campo, direccion] = (opciones.sort ?? 'fecha_reporte:desc').split(':');
    const signo = direccion === 'asc' ? 1 : -1;
    ordenadas.sort((a, b) => {
      switch (campo) {
        case 'id':
          return (a.id - b.id) * signo;
        case 'monto_reembolsado':
          return (a.montoReembolsado - b.montoReembolsado) * signo;
        case 'estado':
          return a.estado.localeCompare(b.estado) * signo;
        default:
          return a.fechaReporte.localeCompare(b.fechaReporte) * signo;
      }
    });

    const { items, meta } = paginar(ordenadas, page, limit);
    this.devoluciones.set(items.map((devolucion) => ({ ...devolucion })));
    this.meta.set(meta);
    return true;
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ClasificacionMerma,
  Merma,
  OrigenMerma,
} from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ApiList, MermaDto, PageMeta, TipoMermaDto } from '../api/api.types';
import { toMerma, toTipoMerma } from '../api/api.mappers';
import { InventarioService } from './inventario.service';
import { MOCK_MERMAS } from './mock-data';

export interface TipoMerma {
  id: number;
  nombre: string;
  descripcion: string;
}

export interface MermaQuery {
  page?: number;
  limit?: number;
  estado?: string;
  tipo_merma_id?: number;
  desde?: string;
  hasta?: string;
  sort?: string;
}

export interface NuevaMerma {
  tipoMermaId?: number;
  tipo: string;
  insumoId?: number;
  insumoNombre?: string;
  platilloId?: number;
  platilloNombre?: string;
  cantidad: number;
  costoEstimado?: number;
  clasificacion: ClasificacionMerma;
  causaRaiz: string;
  motivo: string;
  usuarioRegistroId: number;
  origen?: OrigenMerma;
  fecha?: string;
}

const TIPOS_MOCK: readonly TipoMerma[] = [
  { id: 1, nombre: 'Pollo', descripcion: 'Merma de pollo y derivados' },
  { id: 2, nombre: 'Guarniciones', descripcion: 'Papas, ensaladas y acompañamientos' },
  { id: 3, nombre: 'Robo / hurto', descripcion: 'Pérdida no justificada de producto' },
  { id: 4, nombre: 'Sobreproducción', descripcion: 'Producción por encima de la demanda' },
  { id: 5, nombre: 'Caducidad', descripcion: 'Producto vencido o fuera de vida útil' },
  { id: 6, nombre: 'Rotura proveedor', descripcion: 'Producto dañado al recibirlo' },
  { id: 7, nombre: 'Incidente físico', descripcion: 'Caída, quemado o accidente en cocina' },
];

const HOY_DEMO = '2026-10-14';

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = USE_API ? fechaLima(new Date()) : HOY_DEMO;

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
export class MermaService {
  private readonly api = inject(ApiClient);
  private readonly inventario = inject(InventarioService);

  private secuencia = 100;
  private ultimaConsulta: MermaQuery = {};

  private readonly todosMock = signal<Merma[]>(
    MOCK_MERMAS.map((merma) => ({ ...merma })),
  );

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly mermas = signal<Merma[]>(
    USE_API ? [] : MOCK_MERMAS.map((merma) => ({ ...merma })),
  );

  readonly tipos = signal<TipoMerma[]>(USE_API ? [] : TIPOS_MOCK.map((tipo) => ({ ...tipo })));

  readonly meta = signal<PageMeta>({
    page: 1,
    limit: 20,
    total: USE_API ? 0 : MOCK_MERMAS.length,
    pages: USE_API ? 0 : MOCK_MERMAS.length > 0 ? 1 : 0,
  });

  readonly registradosPor = signal<Record<number, string>>({});

  private readonly baseMetricas = computed<Merma[]>(() =>
    USE_API ? this.mermas() : this.todosMock(),
  );

  readonly pendientes = computed<Merma[]>(() =>
    this.mermas().filter((merma) => merma.estado === 'pendiente'),
  );

  readonly registrosHoy = computed<number>(() =>
    this.baseMetricas().filter((merma) => merma.fecha.slice(0, 10) === HOY).length,
  );

  readonly costoHoy = computed<number>(() =>
    round2(
      this.baseMetricas()
        .filter((merma) => merma.fecha.slice(0, 10) === HOY)
        .reduce((suma, merma) => suma + merma.costoEstimado, 0),
    ),
  );

  async cargarTipos(): Promise<boolean> {
    if (!USE_API) {
      return true;
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<TipoMermaDto>>('/merma/tipos-merma'),
      );
      this.tipos.set(lista.data.map(toTipoMerma));
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    }
  }

  async cargar(opciones: MermaQuery = {}, silencioso = false): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? this.meta().limit;

    this.ultimaConsulta = {
      page,
      limit,
      estado: opciones.estado || undefined,
      tipo_merma_id: opciones.tipo_merma_id ?? undefined,
      desde: opciones.desde || undefined,
      hasta: opciones.hasta || undefined,
      sort: opciones.sort ?? 'fecha:desc',
    };

    if (!USE_API) {
      return this.cargarMock(this.ultimaConsulta);
    }

    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<MermaDto>>('/merma/mermas', {
          page,
          limit,
          estado: this.ultimaConsulta.estado,
          tipo_merma_id: this.ultimaConsulta.tipo_merma_id,
          desde: this.ultimaConsulta.desde,
          hasta: this.ultimaConsulta.hasta,
          sort: this.ultimaConsulta.sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.mermas.set(lista.data.map(toMerma));
      this.meta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      this.registrarNombres(lista.data);
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso || this.mermas().length === 0) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  async registrar(entrada: NuevaMerma): Promise<Merma | null> {
    if (!USE_API) {
      const merma: Merma = {
        id: ++this.secuencia,
        tipo: entrada.tipo,
        insumoId: entrada.insumoId,
        insumoNombre: entrada.insumoNombre,
        platilloId: entrada.platilloId,
        platilloNombre: entrada.platilloNombre,
        cantidad: entrada.cantidad,
        costoEstimado: entrada.costoEstimado ?? 0,
        clasificacion: entrada.clasificacion,
        causaRaiz: entrada.causaRaiz,
        motivo: entrada.motivo,
        fecha: entrada.fecha ?? HOY_DEMO,
        estado: 'pendiente',
        origen: entrada.origen ?? 'registro_manual',
        usuarioRegistroId: entrada.usuarioRegistroId,
      };
      this.todosMock.update((lista) => [merma, ...lista]);
      this.cargarMock(this.ultimaConsulta);
      return merma;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<MermaDto>('/merma/mermas', {
          tipo_merma_id: entrada.tipoMermaId,
          insumo_id: entrada.insumoId,
          platillo_id: entrada.platilloId,
          cantidad: entrada.cantidad,
          clasificacion: entrada.clasificacion,
          causa_raiz: entrada.causaRaiz.trim() || undefined,
          motivo: entrada.motivo,
          fecha: entrada.fecha || undefined,
          origen: entrada.origen || undefined,
        }),
      );
      const merma = toMerma(dto);
      if (dto.registrado_por) {
        this.registradosPor.update((mapa) => ({
          ...mapa,
          [merma.id]: dto.registrado_por as string,
        }));
      }
      await this.cargar(this.ultimaConsulta);
      return merma;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async aprobar(id: number, observacion?: string): Promise<boolean> {
    if (!USE_API) {
      const merma = this.todosMock().find((actual) => actual.id === id);
      if (!merma || merma.estado !== 'pendiente') {
        return false;
      }
      this.todosMock.update((lista) =>
        lista.map((actual) =>
          actual.id === id
            ? {
                ...actual,
                estado: 'aprobada',
                usuarioApruebaId: actual.usuarioApruebaId ?? actual.usuarioRegistroId,
                observacionResolucion: observacion?.trim() || actual.observacionResolucion,
              }
            : actual,
        ),
      );
      if (merma.insumoId !== undefined) {
        this.inventario.registrarMovimiento(
          merma.insumoId,
          'merma',
          merma.cantidad,
          'merma',
          merma.id,
          merma.usuarioRegistroId,
          `Merma aprobada: ${merma.motivo}`,
        );
      }
      this.cargarMock(this.ultimaConsulta);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.post<MermaDto>(`/merma/mermas/${id}/aprobar`, {
          observacion: observacion?.trim() || undefined,
        }),
      );
      await this.cargar(this.ultimaConsulta);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async rechazar(id: number, motivo: string): Promise<boolean> {
    if (!USE_API) {
      this.todosMock.update((lista) =>
        lista.map((actual) =>
          actual.id === id
            ? {
                ...actual,
                estado: 'rechazada',
                observacionResolucion: motivo.trim() || 'Sin detalle',
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
      await firstValueFrom(
        this.api.post<MermaDto>(`/merma/mermas/${id}/rechazar`, {
          motivo: motivo.trim() || undefined,
        }),
      );
      await this.cargar(this.ultimaConsulta);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  private registrarNombres(dtos: readonly MermaDto[]): void {
    const nombres = dtos
      .filter((dto) => Boolean(dto.registrado_por))
      .map((dto) => [dto.id, dto.registrado_por as string] as const);
    if (nombres.length === 0) {
      return;
    }
    this.registradosPor.update((mapa) => {
      const siguiente = { ...mapa };
      for (const [id, nombre] of nombres) {
        siguiente[id] = nombre;
      }
      return siguiente;
    });
  }

  private cargarMock(opciones: MermaQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? 20;
    const desde = opciones.desde;
    const hasta = opciones.hasta;
    const tipoNombre =
      opciones.tipo_merma_id !== undefined
        ? this.tipos().find((tipo) => tipo.id === opciones.tipo_merma_id)?.nombre
        : undefined;

    const filtradas = this.todosMock().filter((merma) => {
      const fecha = merma.fecha.slice(0, 10);
      return (
        (!opciones.estado || merma.estado === opciones.estado) &&
        (!tipoNombre || merma.tipo === tipoNombre) &&
        (!desde || fecha >= desde) &&
        (!hasta || fecha <= hasta)
      );
    });

    const ordenadas = [...filtradas];
    const [campo, direccion] = (opciones.sort ?? 'fecha:desc').split(':');
    const signo = direccion === 'asc' ? 1 : -1;
    ordenadas.sort((a, b) => {
      switch (campo) {
        case 'id':
          return (a.id - b.id) * signo;
        case 'cantidad':
          return (a.cantidad - b.cantidad) * signo;
        case 'estado':
          return a.estado.localeCompare(b.estado) * signo;
        default:
          return a.fecha.localeCompare(b.fecha) * signo;
      }
    });

    const { items, meta } = paginar(ordenadas, page, limit);
    this.mermas.set(items.map((merma) => ({ ...merma })));
    this.meta.set(meta);
    return true;
  }
}

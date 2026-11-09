import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  Activo,
  EstadoMantenimiento,
  Mantenimiento,
  TipoMantenimiento,
} from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type {
  ActivoAlertaDto,
  ActivoDto,
  ApiList,
  MantenimientoDto,
  PageMeta,
} from '../api/api.types';
import {
  toActivo,
  toAlerta,
  toMantenimiento,
  type ActivoVista,
  type AlertaActivo,
} from '../api/api.mappers';
import { MOCK_ACTIVOS, MOCK_MANTENIMIENTOS } from './mock-data';

export type { ActivoVista, AlertaActivo } from '../api/api.mappers';

export interface ActivosQuery {
  page?: number;
  limit?: number;
  estado?: string;
  categoria?: string;
  q?: string;
  sort?: string;
}

export interface ActivoEntrada {
  nombre: string;
  categoria: Activo['categoria'];
  cantidad: number;
  costoAdquisicion: number;
  vidaUtilMeses: number;
  fechaAdquisicion: string;
  estado?: Activo['estado'];
  proveedor?: string;
  garantiaMeses?: number;
  observaciones?: string;
}

export interface MantenimientoEntrada {
  tipo: TipoMantenimiento;
  fecha?: string;
  programadaPara?: string;
  descripcion: string;
  costoReparacion?: number;
  costoReposicion?: number;
  decision?: 'reparar' | 'reemplazar';
}

const VENTANA_DIAS = 45;

const META_INICIAL: PageMeta = {
  page: 1,
  limit: 20,
  total: USE_API ? 0 : MOCK_ACTIVOS.length,
  pages: USE_API ? 0 : Math.ceil(MOCK_ACTIVOS.length / 20),
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

const diasHasta = (fecha: string): number =>
  Math.round((Date.parse(`${fecha.slice(0, 10)}T12:00:00-05:00`) - Date.now()) / 86_400_000);

@Injectable({ providedIn: 'root' })
export class ActivosService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;
  private ultimaConsulta: ActivosQuery = {};

  private readonly demoActivos: ActivoVista[] = MOCK_ACTIVOS.map((activo) => ({ ...activo }));
  private readonly demoMantenimientos: Mantenimiento[] = MOCK_MANTENIMIENTOS.map(
    (mantenimiento) => ({ ...mantenimiento }),
  );

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly activos = signal<ActivoVista[]>(
    USE_API ? [] : this.demoActivos.map((activo) => ({ ...activo })),
  );

  readonly alertas = signal<AlertaActivo[]>(USE_API ? [] : this.alertasDemo());

  readonly meta = signal<PageMeta>({ ...META_INICIAL });

  readonly historialMantenimientos = signal<Mantenimiento[]>(
    USE_API ? [] : this.demoMantenimientos.map((mantenimiento) => ({ ...mantenimiento })),
  );

  readonly enReparacion = computed<ActivoVista[]>(() =>
    this.activos().filter((activo) => activo.estado === 'en_reparacion'),
  );

  readonly proximos = computed<ActivoVista[]>(() =>
    this.activos().filter((activo) => {
      if (!activo.proximoMantenimiento) {
        return false;
      }
      const dias = diasHasta(activo.proximoMantenimiento);
      return dias >= 0 && dias <= VENTANA_DIAS;
    }),
  );

  porId(id: number): ActivoVista | undefined {
    return this.activos().find((activo) => activo.id === id);
  }

  async cargar(opciones: ActivosQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;
    const q = opciones.q?.trim() || undefined;

    this.ultimaConsulta = {
      page,
      limit,
      estado: opciones.estado || undefined,
      categoria: opciones.categoria || undefined,
      q,
      sort: opciones.sort ?? 'id:desc',
    };

    if (!USE_API) {
      return this.cargarMock(this.ultimaConsulta);
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<ActivoDto>>('/activos', {
          page,
          limit,
          estado: this.ultimaConsulta.estado,
          categoria: this.ultimaConsulta.categoria,
          q,
          sort: this.ultimaConsulta.sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.activos.set(lista.data.map(toActivo));
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

  async recargar(): Promise<boolean> {
    return this.cargar(this.ultimaConsulta);
  }

  async cargarAlertas(): Promise<boolean> {
    if (!USE_API) {
      this.alertas.set(this.alertasDemo());
      return true;
    }

    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<ActivoAlertaDto>>('/activos/alertas'),
      );
      this.alertas.set(lista.data.map((fila, indice) => toAlerta(fila, indice + 1)));
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    }
  }

  async registrar(entrada: ActivoEntrada): Promise<ActivoVista | null> {
    if (!USE_API) {
      const nuevo: ActivoVista = {
        id: ++this.secuencia,
        nombre: entrada.nombre,
        categoria: entrada.categoria,
        cantidad: entrada.cantidad,
        costoAdquisicion: round2(entrada.costoAdquisicion),
        vidaUtilMeses: entrada.vidaUtilMeses,
        fechaAdquisicion: entrada.fechaAdquisicion,
        estado: entrada.estado ?? 'activo',
        proximoMantenimiento: entrada.fechaAdquisicion || undefined,
        proveedor: entrada.proveedor,
        garantiaMeses: entrada.garantiaMeses,
        observaciones: entrada.observaciones,
        usuarioId: 0,
      };
      this.activos.update((lista) => [nuevo, ...lista]);
      this.demoActivos.unshift(nuevo);
      this.meta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return nuevo;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<ActivoDto>('/activos', this.cuerpoActivo(entrada)),
      );
      const activo = toActivo(dto);
      await this.cargar(this.ultimaConsulta);
      await this.cargarAlertas();
      return activo;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async actualizar(
    id: number,
    cambios: Partial<ActivoEntrada>,
  ): Promise<ActivoVista | null> {
    if (!USE_API) {
      const indice = this.demoActivos.findIndex((activo) => activo.id === id);
      if (indice < 0) {
        return null;
      }
      const actualizado: ActivoVista = { ...this.demoActivos[indice], ...cambios };
      this.demoActivos[indice] = actualizado;
      this.activos.update((lista) =>
        lista.map((activo) => (activo.id === id ? actualizado : activo)),
      );
      return actualizado;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.patch<ActivoDto>(`/activos/${id}`, this.cuerpoActivo(cambios)),
      );
      const activo = toActivo(dto);
      await this.cargar(this.ultimaConsulta);
      await this.cargarAlertas();
      return activo;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async mantenimientos(activoId: number): Promise<Mantenimiento[]> {
    if (!USE_API) {
      const lista = this.demoMantenimientos
        .filter((mantenimiento) => mantenimiento.activoId === activoId)
        .map((mantenimiento) => ({ ...mantenimiento }));
      this.historialMantenimientos.set(lista);
      return lista;
    }

    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<MantenimientoDto>>(`/activos/${activoId}/mantenimientos`),
      );
      const normalizados = lista.data.map(toMantenimiento);
      this.historialMantenimientos.set(normalizados);
      return normalizados;
    } catch (error) {
      this.error.set(mensajeError(error));
      return [];
    }
  }

  async crearMantenimiento(
    activoId: number,
    entrada: MantenimientoEntrada,
  ): Promise<Mantenimiento | null> {
    if (!USE_API) {
      const mantenimiento = this.mantenimientoLocal(activoId, entrada);
      this.demoMantenimientos.unshift(mantenimiento);
      this.historialMantenimientos.update((lista) => [mantenimiento, ...lista]);
      if (entrada.programadaPara) {
        this.fijarProximoLocal(activoId, entrada.programadaPara);
      }
      return mantenimiento;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<MantenimientoDto>(`/activos/${activoId}/mantenimientos`, {
          tipo: entrada.tipo,
          fecha: entrada.fecha,
          programada_para: entrada.programadaPara,
          descripcion: entrada.descripcion,
          costo_reparacion: entrada.costoReparacion ?? 0,
          costo_reposicion: entrada.costoReposicion ?? 0,
          decision: entrada.decision,
        }),
      );
      const mantenimiento = toMantenimiento(dto);
      await this.mantenimientos(activoId);
      await this.cargar(this.ultimaConsulta);
      return mantenimiento;
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async autorizarMantenimiento(
    mantenimientoId: number,
    decision: 'reparar' | 'reemplazar',
  ): Promise<boolean> {
    if (!USE_API) {
      this.historialMantenimientos.update((lista) =>
        lista.map((mantenimiento) =>
          mantenimiento.id === mantenimientoId
            ? {
                ...mantenimiento,
                decision,
                estado: decision === 'reparar' ? 'en_proceso' : 'completado',
              }
            : mantenimiento,
        ),
      );
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.post(`/mantenimientos/${mantenimientoId}/autorizar`, { decision }),
      );
      await this.cargar(this.ultimaConsulta);
      await this.cargarAlertas();
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  programarPreventivo(
    activoId: number,
    fecha: string,
    descripcion: string,
    _usuarioId: number,
    tipo: TipoMantenimiento = 'preventivo',
  ): Mantenimiento {
    const entrada: MantenimientoEntrada = {
      tipo,
      fecha: new Date().toISOString().slice(0, 10),
      programadaPara: fecha,
      descripcion,
    };
    const mantenimiento = this.mantenimientoLocal(activoId, entrada);
    this.demoMantenimientos.unshift(mantenimiento);
    this.historialMantenimientos.update((lista) => [mantenimiento, ...lista]);
    this.fijarProximoLocal(activoId, fecha);
    if (USE_API) {
      void this.crearMantenimiento(activoId, entrada);
    }
    return mantenimiento;
  }

  autorizarDecision(
    activoId: number,
    decision: 'reparar' | 'reemplazar',
    costos: { reparacion: number; reposicion: number },
    descripcion: string,
    _usuarioId: number,
  ): Mantenimiento {
    const hoy = new Date().toISOString().slice(0, 10);
    const mantenimiento: Mantenimiento = {
      id: ++this.secuencia,
      activoId,
      tipo: 'correctivo',
      fecha: hoy,
      descripcion,
      costoReparacion: round2(costos.reparacion),
      costoReposicion: round2(costos.reposicion),
      decision,
      estado: 'programado',
      usuarioId: _usuarioId,
    };
    this.demoMantenimientos.unshift(mantenimiento);
    this.historialMantenimientos.update((lista) => [mantenimiento, ...lista]);
    this.aplicarDecisionLocal(activoId, decision, descripcion, hoy);

    if (USE_API) {
      void this.autorizarRemoto(activoId, mantenimiento, decision);
    }

    return mantenimiento;
  }

  cambiarEstadoMantenimiento(id: number, estado: EstadoMantenimiento): void {
    this.historialMantenimientos.update((lista) =>
      lista.map((actual) => (actual.id === id ? { ...actual, estado } : actual)),
    );
  }

  darDeBaja(activoId: number, motivo: string): void {
    const hoy = new Date().toISOString().slice(0, 10);
    const indice = this.demoActivos.findIndex((activo) => activo.id === activoId);
    if (indice >= 0) {
      this.demoActivos[indice] = {
        ...this.demoActivos[indice],
        estado: 'dado_de_baja',
        fechaBaja: hoy,
        motivoBaja: motivo,
      };
    }
    this.activos.update((lista) =>
      lista.map((activo) =>
        activo.id === activoId
          ? { ...activo, estado: 'dado_de_baja' as const, fechaBaja: hoy, motivoBaja: motivo }
          : activo,
      ),
    );
    if (USE_API) {
      void firstValueFrom(
        this.api.patch<ActivoDto>(`/activos/${activoId}`, { estado: 'dado_de_baja' }),
      ).catch(() => undefined);
    }
  }

  private async autorizarRemoto(
    activoId: number,
    mantenimiento: Mantenimiento,
    decision: 'reparar' | 'reemplazar',
  ): Promise<void> {
    const creado = await this.crearMantenimiento(activoId, {
      tipo: mantenimiento.tipo,
      fecha: mantenimiento.fecha,
      descripcion: mantenimiento.descripcion,
      costoReparacion: mantenimiento.costoReparacion,
      costoReposicion: mantenimiento.costoReposicion,
      decision,
    });
    if (creado) {
      await this.autorizarMantenimiento(creado.id, decision);
    }
  }

  private aplicarDecisionLocal(
    activoId: number,
    decision: 'reparar' | 'reemplazar',
    descripcion: string,
    hoy: string,
  ): void {
    const indice = this.demoActivos.findIndex((activo) => activo.id === activoId);
    if (indice >= 0) {
      const actual = this.demoActivos[indice];
      this.demoActivos[indice] =
        decision === 'reemplazar'
          ? {
              ...actual,
              estado: 'dado_de_baja',
              fechaBaja: hoy,
              motivoBaja: descripcion,
              proximoMantenimiento: undefined,
            }
          : { ...actual, estado: 'en_reparacion' };
    }
    this.activos.update((lista) =>
      lista.map((activo) => {
        if (activo.id !== activoId) {
          return activo;
        }
        if (decision === 'reemplazar') {
          return {
            ...activo,
            estado: 'dado_de_baja' as const,
            fechaBaja: hoy,
            motivoBaja: descripcion,
            proximoMantenimiento: undefined,
          };
        }
        return { ...activo, estado: 'en_reparacion' as const };
      }),
    );
  }

  private fijarProximoLocal(activoId: number, fecha: string): void {
    const indice = this.demoActivos.findIndex((activo) => activo.id === activoId);
    if (indice >= 0) {
      this.demoActivos[indice] = {
        ...this.demoActivos[indice],
        proximoMantenimiento: fecha,
      };
    }
    this.activos.update((lista) =>
      lista.map((activo) =>
        activo.id === activoId ? { ...activo, proximoMantenimiento: fecha } : activo,
      ),
    );
  }

  private mantenimientoLocal(
    activoId: number,
    entrada: MantenimientoEntrada,
  ): Mantenimiento {
    return {
      id: ++this.secuencia,
      activoId,
      tipo: entrada.tipo,
      fecha: entrada.fecha ?? new Date().toISOString().slice(0, 10),
      programadaPara: entrada.programadaPara,
      descripcion: entrada.descripcion,
      costoReparacion: round2(entrada.costoReparacion ?? 0),
      costoReposicion: round2(entrada.costoReposicion ?? 0),
      decision: entrada.decision,
      estado: 'programado',
      usuarioId: 0,
    };
  }

  private cuerpoActivo(entrada: Partial<ActivoEntrada>): Record<string, unknown> {
    const cuerpo: Record<string, unknown> = {};
    if (entrada.nombre !== undefined) {
      cuerpo['nombre'] = entrada.nombre;
    }
    if (entrada.categoria !== undefined) {
      cuerpo['categoria'] = entrada.categoria;
    }
    if (entrada.cantidad !== undefined) {
      cuerpo['cantidad'] = entrada.cantidad;
    }
    if (entrada.costoAdquisicion !== undefined) {
      cuerpo['costo_adquisicion'] = entrada.costoAdquisicion;
    }
    if (entrada.vidaUtilMeses !== undefined) {
      cuerpo['vida_util_meses'] = entrada.vidaUtilMeses;
    }
    if (entrada.fechaAdquisicion !== undefined) {
      cuerpo['fecha_adquisicion'] = entrada.fechaAdquisicion;
    }
    if (entrada.estado !== undefined) {
      cuerpo['estado'] = entrada.estado;
    }
    if (entrada.proveedor !== undefined) {
      cuerpo['proveedor'] = entrada.proveedor;
    }
    if (entrada.garantiaMeses !== undefined) {
      cuerpo['garantia_meses'] = entrada.garantiaMeses;
    }
    if (entrada.observaciones !== undefined) {
      cuerpo['observaciones'] = entrada.observaciones;
    }
    return cuerpo;
  }

  private cargarMock(opciones: ActivosQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? 20;
    const termino = opciones.q?.trim().toLowerCase() ?? '';
    const estado = opciones.estado;
    const categoria = opciones.categoria;

    const filtradas = this.demoActivos.map((activo) => ({ ...activo }))
      .filter((activo) => !estado || activo.estado === estado)
      .filter((activo) => !categoria || activo.categoria === categoria)
      .filter((activo) => !termino || activo.nombre.toLowerCase().includes(termino));

    const { items, meta } = paginar(filtradas, page, limit);
    this.activos.set(items);
    this.meta.set(meta);
    return true;
  }

  private alertasDemo(): AlertaActivo[] {
    const lista: AlertaActivo[] = [];
    let id = 1;
    for (const activo of this.demoActivos) {
      if (activo.estado === 'en_reparacion') {
        lista.push({
          id: id++,
          activoId: activo.id,
          activo: activo.nombre,
          tipo: 'dano',
          severidad: 'alta',
          mensaje: 'Activo en reparación; revisar autorización y costos.',
        });
      }
      if (activo.proximoMantenimiento) {
        const dias = diasHasta(activo.proximoMantenimiento);
        if (dias <= 30) {
          lista.push({
            id: id++,
            activoId: activo.id,
            activo: activo.nombre,
            tipo: 'mantenimiento_preventivo',
            severidad: dias < 0 ? 'alta' : 'media',
            mensaje:
              dias < 0
                ? `Mantenimiento preventivo vencido hace ${Math.abs(dias)} días.`
                : `Mantenimiento preventivo en ${dias} días.`,
          });
        }
      }
    }
    return lista;
  }
}

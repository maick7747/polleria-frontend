import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { KpiResumen, Reporte } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { ReportesTiposDto } from '../api/api.types';
import {
  limitacionReporte,
  toReporteVista,
  toTiposReporte,
  type ReporteTipoId,
  type ReporteVista,
} from '../api/api.mappers';
import { MOCK_KPIS, MOCK_REPORTES } from './mock-data';

export interface ReporteFiltros {
  desde?: string;
  hasta?: string;
  canal?: string;
}

export type FormatoDescarga = 'xlsx' | 'pdf';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly api = inject(ApiClient);

  readonly usaApi = USE_API;

  readonly reportes = signal<Reporte[]>(MOCK_REPORTES.map((reporte) => ({ ...reporte })));
  readonly kpis: KpiResumen = MOCK_KPIS;

  readonly tipos = signal<ReporteTipoId[]>([]);
  readonly vista = signal<ReporteVista | null>(null);
  readonly limitacion = signal<string | null>(null);
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private ultimoTipo: ReporteTipoId = 'ventas';
  private ultimosFiltros: ReporteFiltros = {};

  porTipo(tipo: Reporte['tipo']): Reporte[] {
    return this.reportes().filter((reporte) => reporte.tipo === tipo);
  }

  registrar(reporte: Omit<Reporte, 'id'>): Reporte {
    const nuevo: Reporte = {
      id: this.reportes().length + 1,
      ...reporte,
    };
    this.reportes.update((lista) => [nuevo, ...lista]);
    return nuevo;
  }

  async cargarTipos(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ReportesTiposDto>('/reportes/tipos'),
      );
      this.tipos.set(toTiposReporte(respuesta.data ?? []));
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    }
  }

  async consultar(tipo: ReporteTipoId, filtros: ReporteFiltros = {}): Promise<boolean> {
    this.ultimoTipo = tipo;
    this.ultimosFiltros = { ...filtros };

    if (!USE_API) {
      return false;
    }

    this.cargando.set(true);
    this.error.set(null);
    this.vista.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<unknown>(`/reportes/${tipo}`, {
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
          canal: filtros.canal || undefined,
        }),
      );
      this.vista.set(toReporteVista(tipo, respuesta));
      this.limitacion.set(limitacionReporte(respuesta));
      return true;
    } catch (error) {
      this.vista.set(null);
      this.limitacion.set(null);
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async descargar(
    tipo: ReporteTipoId,
    filtros: ReporteFiltros,
    formato: FormatoDescarga,
  ): Promise<Blob> {
    if (!USE_API) {
      throw new Error('Exportación disponible con el servidor.');
    }
    return firstValueFrom(
      this.api.getBlob(`/reportes/${tipo}/export`, {
        formato,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
      }),
    );
  }

  recargar(): Promise<boolean> {
    return this.consultar(this.ultimoTipo, this.ultimosFiltros);
  }
}

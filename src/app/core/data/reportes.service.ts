import { Injectable, signal } from '@angular/core';
import type { KpiResumen, Reporte } from '../models';
import { MOCK_KPIS, MOCK_REPORTES } from './mock-data';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  readonly reportes = signal<Reporte[]>(MOCK_REPORTES.map((reporte) => ({ ...reporte })));
  readonly kpis: KpiResumen = MOCK_KPIS;

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
}

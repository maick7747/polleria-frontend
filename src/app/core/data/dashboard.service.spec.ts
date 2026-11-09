import { TestBed } from '@angular/core/testing';
import { of, type Observable } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type { EtagResponse } from '../api/api.client';
import type { DashboardDto } from '../api/api.types';

// El runner empaqueta cada spec por separado; `USE_API` se resuelve al
// inicializar `api.config`, así que el modo API se activa antes de importar.
(environment as unknown as { useApi: boolean }).useApi = true;

type ApiClientClass = typeof import('../api/api.client').ApiClient;
type DashboardServiceClass = typeof import('./dashboard.service').DashboardService;

let ApiClient: ApiClientClass;
let DashboardService: DashboardServiceClass;

class ApiClientStub {
  respuesta: EtagResponse<DashboardDto> = { data: null, changed: false, status: 304 };
  llamadas = 0;

  getConEtag<T>(): Observable<EtagResponse<T>> {
    this.llamadas += 1;
    return of(this.respuesta as unknown as EtagResponse<T>);
  }
}

const DTO: DashboardDto = {
  fecha: '2026-11-09',
  kpis: {
    ventas: 4321,
    egresos: 0,
    ganancia_neta: 0,
    pedidos: 42,
    ticket_promedio: 0,
    cuentas_abiertas: 0,
    mesas_ocupadas: 0,
    pedidos_en_cocina: 0,
    mermas_pendientes: 0,
    devoluciones_pendientes: 0,
    alertas_stock: 0,
  },
  top_platillos: [{ platillo_id: 1, platillo: 'Pollo entero', cantidad: 7, monto: 500 }],
};

beforeAll(async () => {
  ({ ApiClient } = await import('../api/api.client'));
  ({ DashboardService } = await import('./dashboard.service'));
});

describe('DashboardService (ETag)', () => {
  let servicio: InstanceType<DashboardServiceClass>;
  let api: ApiClientStub;

  beforeEach(() => {
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }],
    });
    servicio = TestBed.inject(DashboardService);
  });

  it('304: conserva los KPIs previos y la hora de actualización', async () => {
    const kpisAntes = servicio.kpis();
    expect(servicio.actualizado()).toBe('--:--');

    api.respuesta = { data: null, changed: false, status: 304 };
    const ok = await servicio.cargar();

    expect(ok).toBe(true);
    expect(api.llamadas).toBe(1);
    expect(servicio.kpis()).toBe(kpisAntes);
    expect(servicio.kpis().ventasHoy).toBe(kpisAntes.ventasHoy);
    expect(servicio.actualizado()).toBe('--:--');
  });

  it('changed:true aplica los KPIs y sella la hora Lima actual', async () => {
    api.respuesta = { data: DTO, changed: true, status: 200 };
    const ok = await servicio.cargar();

    expect(ok).toBe(true);
    expect(servicio.kpis().ventasHoy).toBe(4321);
    expect(servicio.kpis().pedidosTop).toBe(42);
    expect(servicio.kpis().topPlatos).toHaveLength(1);
    expect(servicio.actualizado()).toMatch(/^\d{2}:\d{2}$/);
    expect(servicio.actualizado()).not.toBe('--:--');
  });

  it('un 304 posterior no pisa la hora ya sellada', async () => {
    api.respuesta = { data: DTO, changed: true, status: 200 };
    await servicio.cargar();
    const hora = servicio.actualizado();
    const kpis = servicio.kpis();

    api.respuesta = { data: null, changed: false, status: 304 };
    await servicio.cargar();

    expect(servicio.kpis()).toBe(kpis);
    expect(servicio.actualizado()).toBe(hora);
  });

  it('sin ventas_ayer ni serie_semana no inventa comparación ni gráfico', async () => {
    api.respuesta = { data: DTO, changed: true, status: 200 };
    await servicio.cargar();

    expect(servicio.kpis().deltaPct).toBeNull();
    expect(servicio.kpis().ventasAyer).toBeNull();
    expect(servicio.kpis().metaVentas).toBeNull();
    expect(servicio.kpis().serieSemana).toEqual([]);
    expect(servicio.tieneMeta()).toBe(false);
  });

  it('usa ventas_ayer, serie_semana y meta_ventas reales cuando llegan', async () => {
    const dto: DashboardDto = {
      ...DTO,
      kpis: { ...DTO.kpis, meta_ventas: 5000 },
      ventas_ayer: 4000,
      serie_semana: [
        { fecha: '2026-11-03', dia: 'L', monto: 100 },
        { fecha: '2026-11-09', dia: 'D', monto: 300 },
      ],
    };
    api.respuesta = { data: dto, changed: true, status: 200 };

    await servicio.cargar();

    // (4321 - 4000) / 4000 = 8.025% -> 8
    expect(servicio.kpis().deltaPct).toBe(8);
    expect(servicio.kpis().ventasAyer).toBe(4000);
    expect(servicio.kpis().metaVentas).toBe(5000);
    expect(servicio.tieneMeta()).toBe(true);
    expect(servicio.kpis().serieSemana).toHaveLength(2);
    expect(servicio.kpis().mejorDia).toBe('D');
    expect(servicio.kpis().mejorDiaMonto).toBe(300);
  });
});

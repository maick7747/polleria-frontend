import { TestBed } from '@angular/core/testing';
import { of, type Observable } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type { CuadreDto } from '../api/api.types';
import type { CuadrePendienteDto } from './cuadre.service';

// El modo API se fija antes de importar `api.config` (que lo congela).
(environment as unknown as { useApi: boolean }).useApi = true;

type ApiClientClass = typeof import('../api/api.client').ApiClient;
type CuadreServiceClass = typeof import('./cuadre.service').CuadreService;

let ApiClient: ApiClientClass;
let CuadreService: CuadreServiceClass;

const PENDIENTES: CuadrePendienteDto[] = [
  {
    id: 7,
    fecha: '2026-11-08',
    estado: 'abierta',
    fondo_inicial: 200,
    total_ventas: 900,
    total_egresos: 100,
    monto_esperado: 1000,
    resumen: {
      total_ventas: 900,
      total_egresos: 100,
      monto_esperado: 1000,
      ventas_efectivo: 600,
      ventas_digital: 300,
    },
  },
  {
    id: 8,
    fecha: '2026-11-07',
    estado: 'abierta',
    fondo_inicial: 150,
    resumen: {
      total_ventas: 500,
      total_egresos: 50,
      monto_esperado: 600,
      ventas_efectivo: 400,
      ventas_digital: 100,
    },
  },
];

class ApiClientStub {
  pendientes: CuadrePendienteDto[] = PENDIENTES.map((p) => ({ ...p }));
  cuadre: CuadreDto | null = null;
  peticiones: string[] = [];
  postLlamadas: { path: string; body: unknown }[] = [];

  get<T>(path: string): Observable<T> {
    this.peticiones.push(path);
    if (path === '/cuadre-caja/pendientes') {
      return of({ data: this.pendientes } as unknown as T);
    }
    return of(this.cuadre as unknown as T);
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    this.postLlamadas.push({ path, body });
    this.pendientes = this.pendientes.filter(
      (p) => path !== `/cuadre-caja/${p.id}/cierre`,
    );
    return of(null as unknown as T);
  }
}

beforeAll(async () => {
  ({ ApiClient } = await import('../api/api.client'));
  ({ CuadreService } = await import('./cuadre.service'));
});

describe('CuadreService (cajas pendientes)', () => {
  let servicio: InstanceType<CuadreServiceClass>;
  let api: ApiClientStub;

  beforeEach(() => {
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }],
    });
    servicio = TestBed.inject(CuadreService);
  });

  it('cargarPendientes mapea la respuesta y normaliza montos', async () => {
    const ok = await servicio.cargarPendientes();

    expect(ok).toBe(true);
    expect(servicio.errorPendientes()).toBeNull();
    expect(servicio.pendientes()).toEqual([
      {
        id: 7,
        fecha: '2026-11-08',
        estado: 'abierta',
        fondoInicial: 200,
        totalVentas: 900,
        totalEgresos: 100,
        montoEsperado: 1000,
        ventasEfectivo: 600,
        ventasDigital: 300,
      },
      {
        id: 8,
        fecha: '2026-11-07',
        estado: 'abierta',
        fondoInicial: 150,
        totalVentas: 500,
        totalEgresos: 50,
        montoEsperado: 600,
        ventasEfectivo: 400,
        ventasDigital: 100,
      },
    ]);
    expect(api.peticiones).toContain('/cuadre-caja/pendientes');
  });

  it('cargarPendientes deja error visible si falla', async () => {
    api.get = () => {
      throw { status: 500, code: 'HTTP_500', message: 'Fallo del servidor', details: [] };
    };

    const ok = await servicio.cargarPendientes();

    expect(ok).toBe(false);
    expect(servicio.errorPendientes()).toBe('Fallo del servidor');
    expect(servicio.cargandoPendientes()).toBe(false);
  });

  it('cerrarPendiente envía el cierre y recarga pendientes y estado', async () => {
    await servicio.cargarPendientes();

    const ok = await servicio.cerrarPendiente(7, 950, 45, 'Cierre tardío');

    expect(ok).toBe(true);
    expect(api.postLlamadas[0]).toEqual({
      path: '/cuadre-caja/7/cierre',
      body: {
        efectivo_contado: 950,
        pagos_digitales: 45,
        observaciones: 'Cierre tardío',
      },
    });
    expect(servicio.pendientes().map((p) => p.id)).toEqual([8]);
    expect(api.peticiones).toContain('/cuadre-caja');
  });

  it('cerrarPendiente propaga el ApiError del servidor', async () => {
    api.post = () => {
      throw { status: 409, code: 'CUENTAS_ABIERTAS', message: 'Hay 2 cuentas abiertas', details: [] };
    };

    await expect(servicio.cerrarPendiente(7, 0, 0, '')).rejects.toMatchObject({
      code: 'CUENTAS_ABIERTAS',
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { of, type Observable } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type { PagosResponseDto } from '../api/api.types';

// El modo API se fija antes de importar `api.config` (que lo congela).
(environment as unknown as { useApi: boolean }).useApi = true;

type ApiClientClass = typeof import('../api/api.client').ApiClient;
type PagosServiceClass = typeof import('./pagos.service').PagosService;

let ApiClient: ApiClientClass;
let PagosService: PagosServiceClass;

class ApiClientStub {
  respuesta: PagosResponseDto = {
    fecha: '2026-11-09',
    data: [],
    total: 0,
    cantidad: 0,
    por_metodo: [],
  };
  llamadas = 0;
  ultimaQuery: Record<string, unknown> | undefined;

  get<T>(_path: string, query?: Record<string, unknown>): Observable<T> {
    this.llamadas += 1;
    this.ultimaQuery = query;
    return of(this.respuesta as unknown as T);
  }
}

const RESPUESTA: PagosResponseDto = {
  fecha: '2026-11-09',
  data: [
    {
      id: 11,
      pedido_id: 5,
      cuenta_id: 3,
      metodo: 'efectivo',
      monto: 50,
      es_contraentrega: false,
      fecha: '2026-11-09T12:00:00-05:00',
      usuario_id: 2,
    },
    {
      id: 12,
      pedido_id: null,
      cuenta_id: 4,
      metodo: 'yape',
      monto: 30,
      es_contraentrega: false,
      fecha: '2026-11-09T12:30:00-05:00',
      usuario_id: 2,
    },
  ],
  total: 80,
  cantidad: 2,
  por_metodo: [],
};

beforeAll(async () => {
  ({ ApiClient } = await import('../api/api.client'));
  ({ PagosService } = await import('./pagos.service'));
});

describe('PagosService (datos reales)', () => {
  let servicio: InstanceType<PagosServiceClass>;
  let api: ApiClientStub;

  beforeEach(() => {
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }],
    });
    servicio = TestBed.inject(PagosService);
  });

  it('en modo API arranca sin los pagos mock', () => {
    expect(servicio.pagos()).toHaveLength(0);
    expect(servicio.totalCobrado()).toBe(0);
  });

  it('cargar() reemplaza la lista con los pagos del backend', async () => {
    api.respuesta = RESPUESTA;

    const ok = await servicio.cargar();

    expect(ok).toBe(true);
    expect(api.llamadas).toBe(1);
    expect(servicio.pagos()).toHaveLength(2);
    expect(servicio.pagos()[0].metodo).toBe('efectivo');
    expect(servicio.pagos()[1].metodo).toBe('yape');
    expect(servicio.totalCobrado()).toBe(80);
    expect(servicio.efectivo()).toBe(50);
    expect(servicio.digitales()).toBe(30);
    expect(servicio.error()).toBeNull();
  });

  it('cargar(fecha) envía la fecha como query', async () => {
    await servicio.cargar('2026-11-09');
    expect(api.ultimaQuery).toEqual({ fecha: '2026-11-09' });
  });

  it('un fallo deja la lista intacta y expone el error', async () => {
    api.get = () => {
      throw { status: 500, code: 'HTTP_500', message: 'Fallo del servidor', details: [] };
    };

    const ok = await servicio.cargar();

    expect(ok).toBe(false);
    expect(servicio.pagos()).toHaveLength(0);
    expect(servicio.error()).toBe('Fallo del servidor');
  });
});

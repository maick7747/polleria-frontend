import { TestBed } from '@angular/core/testing';
import { of, type Observable } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type { EtagResponse } from '../api/api.client';
import type { ApiList, KdsPedidoDto } from '../api/api.types';

// Igual que en `dashboard.service.spec`: el modo API se activa antes de
// importar los servicios (`USE_API` se resuelve al cargar `api.config`).
(environment as unknown as { useApi: boolean }).useApi = true;

type ApiClientClass = typeof import('../api/api.client').ApiClient;
type CocinaServiceClass = typeof import('./cocina.service').CocinaService;

let ApiClient: ApiClientClass;
let CocinaService: CocinaServiceClass;

const PEDIDO: KdsPedidoDto = {
  id: 93,
  numero: 'PED-2026-000093',
  canal: 'local',
  tipo_consumo: 'salon',
  mesa_id: 1,
  mesa_numero: 1,
  cuenta_id: 40,
  estado: 'en_cocina',
  estado_pago: 'pendiente',
  metodo_pago: null,
  estado_entrega: 'pendiente',
  entregado_en: null,
  subtotal: 28.81,
  igv: 5.19,
  total: 34,
  fecha_pedido: '2026-11-10T15:00:00-05:00',
  fecha_inicio_prep: '2026-11-10T15:01:00-05:00',
  fecha_listo: null,
  tiempo_min: 44,
  sla_min: 30,
  prioritario: true,
  listo: false,
  todos_entregados: false,
  observaciones: null,
  detalles: [
    {
      id: 501,
      pedido_id: 93,
      platillo_id: 7,
      cantidad: 1,
      precio_unitario: 34,
      subtotal: 34,
      notas: null,
      estado_preparacion: 'pendiente',
      fecha_inicio_prep: null,
      fecha_listo: null,
      platillo_nombre: '1/2 Pollo a la brasa',
      estacion: 'parrilla',
      curso: 'fondo',
      prep_min: 25,
      entregado_en: null,
      entregado_por_id: null,
    },
  ],
};

const LISTA: ApiList<KdsPedidoDto> = {
  data: [PEDIDO],
  meta: {
    total: 1,
    prioritarios: 1,
    sla_min: 30,
    all_day: [
      {
        platillo_id: 7,
        platillo_nombre: '1/2 Pollo a la brasa',
        estacion: 'parrilla',
        cantidad: 1,
        en_fuego: 0,
      },
    ],
    all_day_total: 1,
  },
};

class ApiClientStub {
  respuesta: EtagResponse<ApiList<KdsPedidoDto>> = {
    data: null,
    changed: false,
    status: 304,
  };
  llamadas = 0;

  getConEtag<T>(): Observable<EtagResponse<T>> {
    this.llamadas += 1;
    return of(this.respuesta as unknown as EtagResponse<T>);
  }
}

beforeAll(async () => {
  ({ ApiClient } = await import('../api/api.client'));
  ({ CocinaService } = await import('./cocina.service'));
});

describe('CocinaService.listKds (ETag)', () => {
  let servicio: InstanceType<CocinaServiceClass>;
  let api: ApiClientStub;

  beforeEach(() => {
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }],
    });
    servicio = TestBed.inject(CocinaService);
  });

  it('200: devuelve los pedidos y marca changed', async () => {
    api.respuesta = { data: LISTA, changed: true, status: 200 };

    const resultado = await servicio.listKds();

    expect(resultado.changed).toBe(true);
    expect(resultado.pedidos).toHaveLength(1);
    expect(resultado.pedidos[0].numero).toBe('PED-2026-000093');
    expect(resultado.meta?.allDayTotal).toBe(1);
  });

  it('304: reenvía el cuerpo cacheado para que otra pantalla se hidrate', async () => {
    api.respuesta = { data: LISTA, changed: false, status: 304 };

    const resultado = await servicio.listKds();

    expect(resultado.changed).toBe(false);
    expect(resultado.pedidos).toHaveLength(1);
    expect(resultado.pedidos[0].items[0].nombre).toBe('1/2 Pollo a la brasa');
    expect(resultado.meta?.total).toBe(1);
  });

  it('304 sin cuerpo cacheado: lista vacía y sin meta', async () => {
    api.respuesta = { data: null, changed: false, status: 304 };

    const resultado = await servicio.listKds();

    expect(resultado.changed).toBe(false);
    expect(resultado.pedidos).toEqual([]);
    expect(resultado.meta).toBeNull();
  });
});

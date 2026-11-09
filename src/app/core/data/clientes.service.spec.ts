import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';

// El runner de Angular empaqueta cada spec y prohíbe `vi.mock` con rutas
// relativas, así que el modo demo se activa antes de cargar el servicio:
// `USE_API` se calcula al inicializar `api.config` a partir de `environment`.
(environment as unknown as { useApi: boolean }).useApi = false;

type ClientesServiceClass = typeof import('./clientes.service').ClientesService;
let ClientesService: ClientesServiceClass;

beforeAll(async () => {
  ({ ClientesService } = await import('./clientes.service'));
});

describe('ClientesService (modo demo, USE_API=false)', () => {
  let servicio: InstanceType<ClientesServiceClass>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    servicio = TestBed.inject(ClientesService);
  });

  it('arranca con los clientes mock y sin error', () => {
    expect(servicio.usaApi).toBe(false);
    expect(servicio.clientes()).toHaveLength(8);
    expect(servicio.error()).toBeNull();
  });

  it('pagina con page=2 y limit=3 y devuelve el total real', async () => {
    const ok = await servicio.cargar({ page: 2, limit: 3 });

    expect(ok).toBe(true);
    expect(servicio.clientes()).toHaveLength(3);
    // La lista mock está ordenada por id: 4, 5 y 6 en la segunda página.
    expect(servicio.clientes().map((cliente) => cliente.id)).toEqual([4, 5, 6]);
    expect(servicio.meta()).toEqual({ page: 2, limit: 3, total: 8, pages: 3 });
  });

  it('filtra por nombre sin distinguir mayúsculas', async () => {
    const ok = await servicio.cargar({ q: 'lucía' });

    expect(ok).toBe(true);
    expect(servicio.clientes().map((cliente) => cliente.id)).toEqual([2, 7]);
    expect(servicio.meta().total).toBe(2);
    expect(servicio.meta().pages).toBe(1);
  });

  it('filtra por número de documento', async () => {
    const ok = await servicio.cargar({ q: '2060' });

    expect(ok).toBe(true);
    expect(servicio.clientes()).toHaveLength(1);
    expect(servicio.clientes()[0].nombre).toBe('Pollos Andinos S.A.C.');
    expect(servicio.clientes()[0].numeroDocumento).toBe('20601234567');
  });

  it('devuelve lista vacía y meta en cero cuando no hay coincidencias', async () => {
    const ok = await servicio.cargar({ q: 'inexistente' });

    expect(ok).toBe(true);
    expect(servicio.clientes()).toEqual([]);
    expect(servicio.meta()).toEqual({ page: 1, limit: 10, total: 0, pages: 0 });
  });

  it('resuelve porId sobre el resultado cargado', async () => {
    await servicio.cargar({ q: 'andinos' });

    expect(servicio.porId(8)?.nombre).toBe('Pollos Andinos S.A.C.');
    expect(servicio.porId(null)).toBeUndefined();
    expect(servicio.porId(999)).toBeUndefined();
  });

  it('cada llamada deja un estado independiente (sin fugas entre pruebas)', async () => {
    await servicio.cargar({ page: 1, limit: 3 });
    const primeraPagina = servicio.clientes().map((cliente) => cliente.id);
    await servicio.cargar({ page: 2, limit: 3 });

    expect(primeraPagina).toEqual([1, 2, 3]);
    expect(servicio.clientes().map((cliente) => cliente.id)).toEqual([4, 5, 6]);
  });
});

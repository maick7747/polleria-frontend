import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';

// El runner de Angular empaqueta cada spec y prohíbe `vi.mock` con rutas
// relativas, así que el modo demo se activa antes de cargar el servicio:
// `USE_API` se calcula al inicializar `api.config` a partir de `environment`.
(environment as unknown as { useApi: boolean }).useApi = false;

type CuentasServiceClass = typeof import('./cuentas.service').CuentasService;
let CuentasService: CuentasServiceClass;

beforeAll(async () => {
  ({ CuentasService } = await import('./cuentas.service'));
});

describe('CuentasService (modo demo, USE_API=false)', () => {
  let servicio: InstanceType<CuentasServiceClass>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    servicio = TestBed.inject(CuentasService);
  });

  it('arranca con las cuentas mock del tablero', () => {
    expect(servicio.cuentas()).toHaveLength(3);
    expect(servicio.cuentas().every((cuenta) => cuenta.estado === 'abierta')).toBe(
      true,
    );
    expect(servicio.abiertas()).toHaveLength(3);
  });

  it('listar({estado:"abierta"}) pagina solo las cuentas abiertas', async () => {
    const ok = await servicio.listar({ estado: 'abierta', page: 1, limit: 2 });

    expect(ok).toBe(true);
    expect(servicio.historial()).toHaveLength(2);
    expect(servicio.historial().every((cuenta) => cuenta.estado === 'abierta')).toBe(
      true,
    );
    expect(servicio.historial().map((cuenta) => cuenta.id)).toEqual([1, 2]);
    expect(servicio.meta()).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
    expect(servicio.error()).toBeNull();
  });

  it('listar no altera el tablero: cuentas() conserva identidad y rondas', async () => {
    const tableroAntes = servicio.cuentas();
    const rondasAntes = tableroAntes.map((cuenta) => cuenta.rondas.length);

    await servicio.listar({ estado: 'abierta', page: 1, limit: 2 });

    expect(servicio.cuentas()).toBe(tableroAntes);
    expect(servicio.cuentas().map((cuenta) => cuenta.rondas.length)).toEqual(
      rondasAntes,
    );
    expect(servicio.cuentas().every((cuenta) => cuenta.rondas.length > 0)).toBe(true);
    // El historial sí es una copia ligera, sin rondas completas.
    expect(servicio.historial().every((cuenta) => cuenta.rondas.length === 0)).toBe(
      true,
    );
  });

  it('devuelve meta en cero cuando el estado filtrado no tiene cuentas', async () => {
    const ok = await servicio.listar({ estado: 'cobrada' });

    expect(ok).toBe(true);
    expect(servicio.historial()).toEqual([]);
    expect(servicio.meta()).toEqual({ page: 1, limit: 10, total: 0, pages: 0 });
  });

  it('mantiene la página solicitada y calcula las páginas totales', async () => {
    await servicio.listar({ estado: 'abierta', page: 2, limit: 2 });

    expect(servicio.historial()).toHaveLength(1);
    expect(servicio.historial()[0].id).toBe(3);
    expect(servicio.meta()).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('los totales del tablero no dependen de listar()', async () => {
    const totalAbiertoAntes = servicio.totalAbierto();

    await servicio.listar({ estado: 'abierta', page: 1, limit: 1 });

    expect(servicio.totalAbierto()).toBe(totalAbiertoAntes);
    expect(servicio.abiertas()).toHaveLength(3);
  });
});

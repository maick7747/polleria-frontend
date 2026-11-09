import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Pago } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import { toPago } from '../api/api.mappers';
import type { PagosResponseDto } from '../api/api.types';
import { round2 } from '../utils/format';
import { MOCK_PAGOS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class PagosService {
  private readonly api = inject(ApiClient);
  private secuencia = 100;

  // En modo API arranca vacío: los mocks solo se usan en modo demo.
  readonly pagos = signal<Pago[]>(
    USE_API ? [] : MOCK_PAGOS.map((pago) => ({ ...pago })),
  );

  readonly reembolsos = signal<Pago[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly totalCobrado = computed<number>(() =>
    round2(this.pagos().reduce((suma, pago) => suma + pago.monto, 0)),
  );

  readonly digitales = computed<number>(() =>
    round2(
      this.pagos()
        .filter((pago) => pago.metodo !== 'efectivo')
        .reduce((suma, pago) => suma + pago.monto, 0),
    ),
  );

  readonly efectivo = computed<number>(() =>
    round2(
      this.pagos()
        .filter((pago) => pago.metodo === 'efectivo')
        .reduce((suma, pago) => suma + pago.monto, 0),
    ),
  );

  /**
   * Carga los pagos reales del backend (por fecha si se indica). El error se
   * expone en una señal pero no rompe la pantalla: el consumidor decide.
   */
  async cargar(fecha?: string, silencioso = false): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const respuesta = await firstValueFrom(
        this.api.get<PagosResponseDto>('/pagos', { fecha: fecha || undefined }),
      );
      const filas = Array.isArray(respuesta?.data) ? respuesta.data : [];
      this.pagos.set(filas.map(toPago));
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  registrar(entrada: Omit<Pago, 'id'>): Pago {
    const pago: Pago = { id: ++this.secuencia, ...entrada };
    this.pagos.update((lista) => [pago, ...lista]);
    return pago;
  }

  registrarPago(pago: Pago): Pago {
    const existe = this.pagos().some((actual) => actual.id === pago.id);
    if (existe) {
      this.pagos.update((lista) =>
        lista.map((actual) => (actual.id === pago.id ? pago : actual)),
      );
      return pago;
    }
    this.pagos.update((lista) => [pago, ...lista]);
    return pago;
  }

  registrarReembolso(entrada: Omit<Pago, 'id'>): Pago {
    const pago: Pago = { id: ++this.secuencia, ...entrada };
    this.reembolsos.update((lista) => [pago, ...lista]);
    return pago;
  }
}

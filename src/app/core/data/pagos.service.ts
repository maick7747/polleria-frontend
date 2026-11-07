import { computed, Injectable, signal } from '@angular/core';
import type { Pago } from '../models';
import { round2 } from '../utils/format';
import { MOCK_PAGOS } from './mock-data';

@Injectable({ providedIn: 'root' })
export class PagosService {
  private secuencia = 100;

  readonly pagos = signal<Pago[]>(MOCK_PAGOS.map((pago) => ({ ...pago })));

  readonly reembolsos = signal<Pago[]>([]);

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

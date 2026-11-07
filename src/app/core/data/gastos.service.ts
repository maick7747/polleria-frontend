import { computed, Injectable, signal } from '@angular/core';
import type { Gasto } from '../models';
import { round2 } from '../utils/format';
import { MOCK_GASTOS } from './mock-data';

const HOY = '2026-10-14';

@Injectable({ providedIn: 'root' })
export class GastosService {
  private secuencia = 100;

  readonly gastos = signal<Gasto[]>(MOCK_GASTOS.map((gasto) => ({ ...gasto })));

  readonly totalHoy = computed<number>(() =>
    round2(
      this.gastos()
        .filter((gasto) => gasto.fecha === HOY)
        .reduce((suma, gasto) => suma + gasto.monto, 0),
    ),
  );

  readonly totalMes = computed<number>(() =>
    round2(this.gastos().reduce((suma, gasto) => suma + gasto.monto, 0)),
  );

  registrar(entrada: Omit<Gasto, 'id'>): Gasto {
    const gasto: Gasto = { id: ++this.secuencia, ...entrada };
    this.gastos.update((lista) => [gasto, ...lista]);
    return gasto;
  }
}

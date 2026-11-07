import { computed, Injectable, signal } from '@angular/core';
import type { Devolucion, ResolucionDevolucion } from '../models';
import { MOCK_DEVOLUCIONES } from './mock-data';

export interface NuevaDevolucion {
  pedidoId: number;
  pedidoNumero: string;
  pedidoDetalleId?: number;
  motivo: string;
  detalle: string;
  montoReembolsado?: number;
}

@Injectable({ providedIn: 'root' })
export class DevolucionesService {
  private secuencia = 100;

  readonly devoluciones = signal<Devolucion[]>(
    MOCK_DEVOLUCIONES.map((devolucion) => ({ ...devolucion })),
  );

  readonly pendientes = computed<Devolucion[]>(() =>
    this.devoluciones().filter((devolucion) => devolucion.estado === 'pendiente'),
  );

  readonly totalReembolsado = computed<number>(() =>
    this.devoluciones().reduce((suma, devolucion) => suma + devolucion.montoReembolsado, 0),
  );

  registrar(entrada: NuevaDevolucion): Devolucion {
    const devolucion: Devolucion = {
      id: ++this.secuencia,
      pedidoId: entrada.pedidoId,
      pedidoNumero: entrada.pedidoNumero,
      pedidoDetalleId: entrada.pedidoDetalleId,
      fechaReporte: new Date().toISOString(),
      motivo: entrada.motivo,
      detalle: entrada.detalle,
      montoReembolsado: entrada.montoReembolsado ?? 0,
      estado: 'pendiente',
    };
    this.devoluciones.update((lista) => [devolucion, ...lista]);
    return devolucion;
  }

  resolver(
    id: number,
    resolucion: ResolucionDevolucion,
    monto: number,
    usuarioId: number,
  ): void {
    this.devoluciones.update((lista) =>
      lista.map((actual) =>
        actual.id === id
          ? {
              ...actual,
              estado: 'aceptada',
              resolucion,
              montoReembolsado: monto,
              decididoPorId: usuarioId,
              fechaResolucion: new Date().toISOString(),
            }
          : actual,
      ),
    );
  }

  rechazar(id: number, usuarioId: number): void {
    this.devoluciones.update((lista) =>
      lista.map((actual) =>
        actual.id === id
          ? {
              ...actual,
              estado: 'rechazada',
              decididoPorId: usuarioId,
              fechaResolucion: new Date().toISOString(),
            }
          : actual,
      ),
    );
  }
}

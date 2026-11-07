import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  ClasificacionMerma,
  Merma,
  OrigenMerma,
} from '../models';
import { round2 } from '../utils/format';
import { InventarioService } from './inventario.service';
import { MOCK_MERMAS } from './mock-data';

const HOY = '2026-10-14';

export interface NuevaMerma {
  tipo: string;
  insumoId?: number;
  insumoNombre?: string;
  platilloId?: number;
  platilloNombre?: string;
  cantidad: number;
  costoEstimado: number;
  clasificacion: ClasificacionMerma;
  causaRaiz: string;
  motivo: string;
  usuarioRegistroId: number;
  origen?: OrigenMerma;
}

@Injectable({ providedIn: 'root' })
export class MermaService {
  private readonly inventario = inject(InventarioService);
  private secuencia = 100;

  readonly mermas = signal<Merma[]>(MOCK_MERMAS.map((merma) => ({ ...merma })));

  readonly pendientes = computed<Merma[]>(() =>
    this.mermas().filter((merma) => merma.estado === 'pendiente'),
  );

  readonly registrosHoy = computed<number>(() =>
    this.mermas().filter((merma) => merma.fecha.startsWith(HOY)).length,
  );

  readonly costoHoy = computed<number>(() =>
    round2(
      this.mermas()
        .filter((merma) => merma.fecha.startsWith(HOY))
        .reduce((suma, merma) => suma + merma.costoEstimado, 0),
    ),
  );

  registrar(entrada: NuevaMerma): Merma {
    const merma: Merma = {
      id: ++this.secuencia,
      tipo: entrada.tipo,
      insumoId: entrada.insumoId,
      insumoNombre: entrada.insumoNombre,
      platilloId: entrada.platilloId,
      platilloNombre: entrada.platilloNombre,
      cantidad: entrada.cantidad,
      costoEstimado: entrada.costoEstimado,
      clasificacion: entrada.clasificacion,
      causaRaiz: entrada.causaRaiz,
      motivo: entrada.motivo,
      fecha: HOY,
      estado: 'pendiente',
      origen: entrada.origen ?? 'registro_manual',
      usuarioRegistroId: entrada.usuarioRegistroId,
    };
    this.mermas.update((lista) => [merma, ...lista]);
    return merma;
  }

  aprobar(id: number, usuarioApruebaId: number): void {
    const merma = this.mermas().find((actual) => actual.id === id);
    if (!merma || merma.estado !== 'pendiente') {
      return;
    }
    this.mermas.update((lista) =>
      lista.map((actual) =>
        actual.id === id
          ? { ...actual, estado: 'aprobada', usuarioApruebaId }
          : actual,
      ),
    );
    if (merma.insumoId !== undefined) {
      this.inventario.registrarMovimiento(
        merma.insumoId,
        'merma',
        merma.cantidad,
        'merma',
        merma.id,
        usuarioApruebaId,
        `Merma aprobada: ${merma.motivo}`,
      );
    }
  }

  rechazar(id: number, usuarioApruebaId: number, observacion: string): void {
    this.mermas.update((lista) =>
      lista.map((actual) =>
        actual.id === id
          ? {
              ...actual,
              estado: 'rechazada',
              usuarioApruebaId,
              observacionResolucion: observacion,
            }
          : actual,
      ),
    );
  }
}

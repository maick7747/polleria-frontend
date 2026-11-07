import { computed, Injectable, signal } from '@angular/core';
import type {
  Activo,
  EstadoMantenimiento,
  Mantenimiento,
  TipoMantenimiento,
} from '../models';
import { round2 } from '../utils/format';
import { MOCK_ACTIVOS, MOCK_MANTENIMIENTOS } from './mock-data';

const AHORA = Date.parse('2026-10-14T12:00:00-05:00');
const VENTANA_DIAS = 45;

@Injectable({ providedIn: 'root' })
export class ActivosService {
  private secuencia = 100;

  readonly activos = signal<Activo[]>(MOCK_ACTIVOS.map((activo) => ({ ...activo })));

  readonly mantenimientos = signal<Mantenimiento[]>(
    MOCK_MANTENIMIENTOS.map((mantenimiento) => ({ ...mantenimiento })),
  );

  readonly enReparacion = computed<Activo[]>(() =>
    this.activos().filter((activo) => activo.estado === 'en_reparacion'),
  );

  readonly proximos = computed<Activo[]>(() =>
    this.activos().filter((activo) => {
      if (!activo.proximoMantenimiento) {
        return false;
      }
      const dias = (Date.parse(activo.proximoMantenimiento) - AHORA) / 86_400_000;
      return dias >= 0 && dias <= VENTANA_DIAS;
    }),
  );

  registrar(activo: Omit<Activo, 'id'>): Activo {
    const nuevo: Activo = { id: ++this.secuencia, ...activo };
    this.activos.update((lista) => [nuevo, ...lista]);
    return nuevo;
  }

  autorizarMantenimiento(
    activoId: number,
    tipo: TipoMantenimiento,
    descripcion: string,
    usuarioId: number,
    decision: 'reparar' | 'reemplazar',
  ): Mantenimiento {
    const mantenimiento: Mantenimiento = {
      id: ++this.secuencia,
      activoId,
      tipo,
      fecha: new Date().toISOString().slice(0, 10),
      descripcion,
      costoReparacion: 0,
      costoReposicion: 0,
      decision,
      estado: 'programado',
      usuarioId,
    };
    this.mantenimientos.update((lista) => [mantenimiento, ...lista]);
    return mantenimiento;
  }

  cambiarEstadoMantenimiento(id: number, estado: EstadoMantenimiento): void {
    this.mantenimientos.update((lista) =>
      lista.map((actual) => (actual.id === id ? { ...actual, estado } : actual)),
    );
  }

  autorizarDecision(
    activoId: number,
    decision: 'reparar' | 'reemplazar',
    costos: { reparacion: number; reposicion: number },
    descripcion: string,
    usuarioId: number,
  ): Mantenimiento {
    const hoy = new Date().toISOString().slice(0, 10);
    const mantenimiento: Mantenimiento = {
      id: ++this.secuencia,
      activoId,
      tipo: 'correctivo',
      fecha: hoy,
      descripcion,
      costoReparacion: round2(costos.reparacion),
      costoReposicion: round2(costos.reposicion),
      decision,
      estado: 'programado',
      usuarioId,
    };
    this.mantenimientos.update((lista) => [mantenimiento, ...lista]);

    this.activos.update((lista) =>
      lista.map((activo) => {
        if (activo.id !== activoId) {
          return activo;
        }
        if (decision === 'reemplazar') {
          return {
            ...activo,
            estado: 'dado_de_baja' as const,
            fechaBaja: hoy,
            motivoBaja: descripcion,
            proximoMantenimiento: undefined,
          };
        }
        return { ...activo, estado: 'en_reparacion' as const };
      }),
    );

    return mantenimiento;
  }

  programarPreventivo(
    activoId: number,
    fecha: string,
    descripcion: string,
    usuarioId: number,
    tipo: TipoMantenimiento = 'preventivo',
  ): Mantenimiento {
    const mantenimiento: Mantenimiento = {
      id: ++this.secuencia,
      activoId,
      tipo,
      fecha: new Date().toISOString().slice(0, 10),
      programadaPara: fecha,
      descripcion,
      costoReparacion: 0,
      costoReposicion: 0,
      estado: 'programado',
      usuarioId,
    };
    this.mantenimientos.update((lista) => [mantenimiento, ...lista]);
    this.activos.update((lista) =>
      lista.map((activo) =>
        activo.id === activoId ? { ...activo, proximoMantenimiento: fecha } : activo,
      ),
    );
    return mantenimiento;
  }

  darDeBaja(activoId: number, motivo: string): void {
    this.activos.update((lista) =>
      lista.map((activo) =>
        activo.id === activoId
          ? {
              ...activo,
              estado: 'dado_de_baja' as const,
              fechaBaja: new Date().toISOString().slice(0, 10),
              motivoBaja: motivo,
            }
          : activo,
      ),
    );
  }
}

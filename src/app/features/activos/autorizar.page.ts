import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import { AuthService } from '../../core/auth/auth.service';
import { ActivosService } from '../../core/data/activos.service';
import type { Activo } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type Decision = 'reparar' | 'reemplazar';

const MESES: readonly string[] = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const AHORA = Date.parse('2026-10-14T12:00:00-05:00');

const fechaLarga = (fecha: string): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  return `${Number(partes[2])} ${MESES[Number(partes[1]) - 1] ?? ''} ${partes[0]}`;
};

const sumarMeses = (fecha: string, meses: number): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  const anio = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);
  return new Date(Date.UTC(anio, mes + meses, dia)).toISOString().slice(0, 10);
};

@Component({
  selector: 'app-activos-autorizar-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './autorizar.page.html',
  styleUrl: './autorizar.page.css',
})
export class ActivosAutorizarPage {
  private readonly activos = inject(ActivosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;
  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;

  readonly activo = computed<Activo | null>(
    () => this.activos.enReparacion()[0] ?? this.activos.activos()[0] ?? null,
  );

  readonly codigo = computed<string>(() => {
    const actual = this.activo();
    return actual ? `M-${String(actual.id).padStart(3, '0')}` : '—';
  });

  readonly costoReposicion = computed<number>(() => this.activo()?.costoAdquisicion ?? 0);

  readonly costoReparacion = computed<number>(() => {
    const actual = this.activo();
    if (!actual) {
      return 0;
    }
    const registrado = this.activos
      .historialMantenimientos()
      .find((item) => item.activoId === actual.id && item.costoReparacion > 0);
    return registrado ? registrado.costoReparacion : round2(actual.costoAdquisicion * 0.17);
  });

  readonly garantiaVencida = computed<boolean>(() => {
    const actual = this.activo();
    if (!actual || actual.garantiaMeses === undefined) {
      return false;
    }
    const fin = Date.parse(`${sumarMeses(actual.fechaAdquisicion, actual.garantiaMeses)}T12:00:00-05:00`);
    return fin < AHORA;
  });

  readonly garantiaTexto = computed<string>(() => {
    const actual = this.activo();
    if (!actual || actual.garantiaMeses === undefined) {
      return 'Sin registro';
    }
    const fin = sumarMeses(actual.fechaAdquisicion, actual.garantiaMeses);
    return `${this.garantiaVencida() ? 'Vencida' : 'Vigente'} · ${fechaLarga(fin)}`;
  });

  readonly recomendacion = computed<Decision>(() => {
    const reposicion = this.costoReposicion();
    if (reposicion <= 0) {
      return 'reparar';
    }
    const proporcion = this.costoReparacion() / reposicion;
    return proporcion >= 0.2 || this.garantiaVencida() ? 'reemplazar' : 'reparar';
  });

  readonly decision = signal<Decision>(this.recomendacion());

  readonly vidaReemplazo = computed<string>(() => {
    const actual = this.activo();
    if (!actual) {
      return '—';
    }
    return `${Math.max(1, Math.round(actual.vidaUtilMeses / 12))} años`;
  });

  readonly garantiaReemplazo = computed<string>(() => {
    const actual = this.activo();
    return actual?.garantiaMeses !== undefined ? `${actual.garantiaMeses} meses` : '12 meses';
  });

  readonly impactoReemplazo = computed<number>(() =>
    round2(this.costoReposicion() / 6),
  );

  readonly ahorro = computed<number>(() =>
    round2(Math.max(0, this.costoReposicion() - this.costoReparacion())),
  );

  readonly subtitulo = computed<string>(() => {
    const actual = this.activo();
    return actual
      ? `Solicitud MO-024 · ${actual.nombre} · generada el 14 oct 2026, 09:12`
      : 'Sin activos registrados';
  });

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);
  readonly procesando = signal<boolean>(false);

  readonly costoSeleccionado = computed<number>(() =>
    this.decision() === 'reemplazar' ? this.costoReposicion() : this.costoReparacion(),
  );

  readonly tituloSeleccionado = computed<string>(() =>
    this.decision() === 'reemplazar' ? 'Reemplazar equipo' : 'Reparar equipo',
  );

  readonly detalleSeleccionado = computed<string>(() => {
    const actual = this.activo();
    if (this.decision() === 'reemplazar') {
      return `${actual?.nombre ?? 'Equipo'} · modelo 2026`;
    }
    return `${actual?.nombre ?? 'Equipo'} · servicio técnico`;
  });

  readonly notaSeleccionada = computed<string>(() =>
    this.decision() === 'reemplazar'
      ? `Incluye instalación, retiro y garantía de ${this.garantiaReemplazo()}`
      : 'Incluye mano de obra y repuestos · garantía de 3 meses',
  );

  readonly justificacion = computed<string>(() => {
    const actual = this.activo();
    if (!actual) {
      return '';
    }
    if (this.recomendacion() === 'reemplazar') {
      return `La reparación cuesta el ${Math.round(
        (this.costoReparacion() / Math.max(1, this.costoReposicion())) * 100,
      )}% del valor nuevo y el equipo ya superó su vida útil: el reemplazo evita una segunda falla en el mismo turno.`;
    }
    return `La reparación cuesta el ${Math.round(
      (this.costoReparacion() / Math.max(1, this.costoReposicion())) * 100,
    )}% del valor nuevo y el equipo aún tiene vida útil: reparar conserva el fondo de activos.`;
  });

  constructor() {
    void (async () => {
      await this.activos.cargar({ limit: 100 });
      const actual = this.activo();
      if (actual) {
        await this.activos.mantenimientos(actual.id);
      }
    })();

    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  numero(monto: number): string {
    return monto.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  fechaAdquisicion(): string {
    const actual = this.activo();
    return actual ? fechaLarga(actual.fechaAdquisicion) : '—';
  }

  elegir(decision: Decision): void {
    this.decision.set(decision);
  }

  adjuntar(): void {
    this.avisar('Cotización adjunta · documento simulado');
  }

  async autorizar(): Promise<void> {
    if (this.procesando()) {
      return;
    }
    const actual = this.activo();
    if (!actual) {
      this.avisar('No hay un activo pendiente de autorización', true);
      return;
    }

    const usuarioId = this.auth.usuario()?.id ?? 1;
    const decision = this.decision();
    this.procesando.set(true);
    try {
      const ok = await this.activos.autorizarDecision(
        actual.id,
        decision,
        { reparacion: this.costoReparacion(), reposicion: this.costoReposicion() },
        `${decision === 'reemplazar' ? 'Reemplazo' : 'Reparación'} autorizado · ${actual.nombre}`,
        usuarioId,
      );

      if (!ok) {
        this.avisar(
          this.activos.error() ?? 'No se pudo autorizar la decisión. Intenta de nuevo.',
          true,
        );
        return;
      }

      this.avisar(
        decision === 'reemplazar'
          ? `Reemplazo autorizado · ${actual.nombre}`
          : `Reparación autorizada · ${actual.nombre}`,
      );

      this.temporizador = window.setTimeout(() => {
        void this.router.navigate(['/activos']);
      }, 950);
    } catch (error) {
      this.avisar(mensajeError(error), true);
    } finally {
      this.procesando.set(false);
    }
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
  }
}

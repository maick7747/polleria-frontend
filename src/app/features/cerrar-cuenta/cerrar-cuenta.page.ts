import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { esApiError, mensajeError } from '../../core/api/api.helpers';
import { CuadreService } from '../../core/data/cuadre.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { NotificacionesService } from '../../core/data/notificaciones.service';
import { RealtimeService } from '../../core/data/realtime.service';
import type { Cuenta } from '../../core/models';
import {
  abreviarNombre,
  formatearMoneda,
  hora as formatearHora,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const UMBRAL_DEMORA = 30;

type FiltroCuentas = 'todas' | 'demora' | 'mayor';

interface CuentaVista {
  cuenta: Cuenta;
  numero: string;
  minutos: number;
  rondas: number;
  mozo: string;
  listos: number;
  prioritaria: boolean;
  subtotal: number;
  igv: number;
}

@Component({
  selector: 'app-cerrar-cuenta-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cerrar-cuenta.page.html',
  styleUrl: './cerrar-cuenta.page.css',
})
export class CerrarCuentaPage {
  private readonly cuentas = inject(CuentasService);
  private readonly cuadre = inject(CuadreService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;
  private ultimaRevision = 0;

  private readonly ahora = signal(Date.now());

  readonly umbral = UMBRAL_DEMORA;
  readonly moneda = formatearMoneda;
  readonly turno = turnoActual();
  readonly hora = formatearHora;
  readonly cajaAbierta = computed(() => this.cuadre.estado() === 'abierta');
  readonly cajaCerradaEstado = computed(() => {
    const estado = this.cuadre.estado();
    return estado === 'cerrada' || estado === 'sin_cuadre';
  });
  readonly filtro = signal<FiltroCuentas>('todas');
  readonly seleccionadaId = signal<number | null>(null);
  readonly liberando = signal(false);
  readonly aviso = signal('');
  readonly avisoLento = signal(false);
  readonly toast = signal('');
  readonly cajaCerrada = signal('');

  readonly cargando = this.cuentas.cargando;
  readonly error = this.cuentas.error;
  readonly avisoCarga = this.cuentas.aviso;

  readonly vistas = computed<CuentaVista[]>(() => {
    const lista = this.cuentas
      .abiertas()
      .map((cuenta) => this.vista(cuenta));
    const filtro = this.filtro();
    if (filtro === 'demora') {
      return lista.filter((item) => item.prioritaria);
    }
    if (filtro === 'mayor') {
      return [...lista].sort((a, b) => b.cuenta.total - a.cuenta.total);
    }
    return lista;
  });

  readonly totalCuentas = computed<number>(() => this.cuentas.abiertas().length);
  readonly enDemora = computed<number>(
    () => this.cuentas.abiertas().filter((cuenta) => this.minutos(cuenta) > UMBRAL_DEMORA).length,
  );
  readonly promedioRondas = computed<number>(() => {
    const abiertas = this.cuentas.abiertas();
    if (abiertas.length === 0) {
      return 0;
    }
    return Math.round(
      abiertas.reduce((suma, cuenta) => suma + cuenta.rondas.length, 0) / abiertas.length,
    );
  });

  readonly seleccionada = computed<CuentaVista | null>(() => {
    const lista = this.vistas();
    return lista.find((item) => item.cuenta.id === this.seleccionadaId()) ?? null;
  });

  readonly idSeleccionada = computed<number | null>(() => this.seleccionada()?.cuenta.id ?? null);
  readonly totalAbierto = this.cuentas.totalAbierto;
  readonly dineroAbierto = computed<string>(() => formatearMoneda(this.totalAbierto()));

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 30000);
    const refresco = setInterval(() => void this.refrescar(), 15000);
    this.realtime.iniciar();
    // Realtime adelanta el refresco silencioso; los 15 s quedan de respaldo.
    effect(() => {
      const revision = this.realtime.revision();
      if (revision === this.ultimaRevision) {
        return;
      }
      this.ultimaRevision = revision;
      if (revision > 0) {
        void this.refrescar();
      }
    });
    this.destroyRef.onDestroy(() => {
      clearInterval(reloj);
      clearInterval(refresco);
      this.realtime.detener();
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
    void this.cargar();
    void this.cuadre.cargar();
  }

  private async cargar(): Promise<void> {
    this.avisoLento.set(false);
    const temporizador = window.setTimeout(() => this.avisoLento.set(true), 5000);
    try {
      await this.cuentas.cargar();
    } finally {
      window.clearTimeout(temporizador);
      this.avisoLento.set(false);
    }
    this.notificaciones.sincronizar(this.cuentas.abiertas(), false);
  }

  // Refresco silencioso: detecta platos listos y avisa al mozo.
  private async refrescar(): Promise<void> {
    if (document.visibilityState !== 'visible' || this.cargando()) {
      return;
    }
    await this.cuentas.cargar(true);
    const nuevos = this.notificaciones.sincronizar(this.cuentas.abiertas());
    if (nuevos.length > 0) {
      const ultimo = nuevos[nuevos.length - 1];
      this.mostrarToast(
        nuevos.length === 1
          ? `Mesa ${String(ultimo.mesaNumero).padStart(2, '0')} · ${ultimo.plato} listo`
          : `${nuevos.length} platos listos en cocina`,
      );
    }
  }

  private mostrarToast(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4000);
  }

  reintentar(): void {
    void this.cargar();
  }

  @HostListener('document:keydown.escape')
  limpiarConEscape(): void {
    this.limpiarSeleccion();
  }

  cambiarFiltro(filtro: FiltroCuentas): void {
    this.filtro.set(filtro);
  }

  seleccionar(cuentaId: number): void {
    this.seleccionadaId.update((actual) => (actual === cuentaId ? null : cuentaId));
  }

  limpiarSeleccion(): void {
    this.seleccionadaId.set(null);
  }

  esSeleccionada(cuentaId: number): boolean {
    return this.idSeleccionada() === cuentaId;
  }

  cobrar(): void {
    const seleccionada = this.seleccionada();
    if (!seleccionada) {
      return;
    }
    void this.router.navigate(['/cerrar-cuenta', seleccionada.cuenta.id]);
  }

  // Libera la mesa cuando la cuenta se creó por error y todavía no tiene pedidos.
  async liberar(): Promise<void> {
    const seleccionada = this.seleccionada();
    if (!seleccionada || seleccionada.rondas > 0 || this.liberando()) {
      return;
    }
    this.liberando.set(true);
    this.aviso.set('');
    this.cajaCerrada.set('');
    try {
      const liberada = await this.cuentas.cancelarCuenta(seleccionada.cuenta.id);
      if (liberada) {
        this.limpiarSeleccion();
      } else {
        this.aviso.set('No se pudo liberar la mesa.');
      }
    } catch (error) {
      const mensaje = mensajeError(error);
      if (esApiError(error) && error.code === 'CAJA_CERRADA') {
        this.cajaCerrada.set(mensaje);
      }
      this.aviso.set(mensaje);
    } finally {
      this.liberando.set(false);
    }
  }

  private vista(cuenta: Cuenta): CuentaVista {
    const minutos = this.minutos(cuenta);
    const subtotal = round2(cuenta.total / 1.18);
    const listos = cuenta.rondas.reduce(
      (total, ronda) =>
        total + ronda.items.filter((item) => item.estadoPreparacion === 'listo').length,
      0,
    );
    return {
      cuenta,
      numero: String(cuenta.mesaId).padStart(2, '0'),
      minutos,
      rondas: cuenta.rondas.length,
      mozo: abreviarNombre(cuenta.usuarioAperturaNombre ?? ''),
      listos,
      prioritaria: minutos > UMBRAL_DEMORA,
      subtotal,
      igv: round2(cuenta.total - subtotal),
    };
  }

  private minutos(cuenta: Cuenta): number {
    return minutosEntre(cuenta.fechaApertura, this.ahora());
  }
}

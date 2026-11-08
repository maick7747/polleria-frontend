import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CuentasService } from '../../core/data/cuentas.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import type { Cuenta } from '../../core/models';
import {
  abreviarNombre,
  formatearMoneda,
  hora as formatearHora,
  minutosEntre,
  round2,
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly ahora = signal(Date.now());

  readonly umbral = UMBRAL_DEMORA;
  readonly moneda = formatearMoneda;
  readonly hora = formatearHora;
  readonly filtro = signal<FiltroCuentas>('todas');
  readonly seleccionadaId = signal<number | null>(null);

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
    const intervalo = setInterval(() => this.ahora.set(Date.now()), 30000);
    this.destroyRef.onDestroy(() => clearInterval(intervalo));
    void this.cuentas.cargar();
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

  private vista(cuenta: Cuenta): CuentaVista {
    const minutos = this.minutos(cuenta);
    const subtotal = round2(cuenta.total / 1.18);
    const usuario = MOCK_USUARIOS.find((candidato) => candidato.id === cuenta.usuarioAperturaId);
    return {
      cuenta,
      numero: String(cuenta.mesaId).padStart(2, '0'),
      minutos,
      rondas: cuenta.rondas.length,
      mozo: usuario ? abreviarNombre(usuario.nombre) : '—',
      prioritaria: minutos > UMBRAL_DEMORA,
      subtotal,
      igv: round2(cuenta.total - subtotal),
    };
  }

  private minutos(cuenta: Cuenta): number {
    return minutosEntre(cuenta.fechaApertura, this.ahora());
  }
}

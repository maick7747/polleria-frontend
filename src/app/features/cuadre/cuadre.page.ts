import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeError } from '../../core/api/api.helpers';
import { CuadreService } from '../../core/data/cuadre.service';
import { PagosService } from '../../core/data/pagos.service';
import type { MetodoPago } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface DesglosePago {
  metodo: MetodoPago;
  etiqueta: string;
  icono: IconName;
  monto: number;
  cobros: number;
}

const METODOS: readonly { metodo: MetodoPago; etiqueta: string; icono: IconName }[] = [
  { metodo: 'efectivo', etiqueta: 'Efectivo', icono: 'money' },
  { metodo: 'tarjeta', etiqueta: 'Tarjeta', icono: 'credit-card' },
  { metodo: 'yape', etiqueta: 'Yape', icono: 'phone' },
  { metodo: 'plin', etiqueta: 'Plin', icono: 'phone' },
];

@Component({
  selector: 'app-cuadre-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cuadre.page.html',
  styleUrl: './cuadre.page.css',
})
export class CuadrePage {
  private readonly cuadre = inject(CuadreService);
  private readonly pagos = inject(PagosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;
  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;

  readonly abierta = this.cuadre.abierta;
  readonly fondoInicial = this.cuadre.fondoInicial;
  readonly totalVentas = this.cuadre.totalVentas;
  readonly totalEgresos = this.cuadre.totalEgresos;
  readonly esperado = this.cuadre.montoEsperado;

  readonly efectivoContado = signal<number>(0);
  readonly pagosDigitales = signal<number>(0);
  readonly confirmando = signal<boolean>(false);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly totalReal = computed<number>(() =>
    round2(this.efectivoContado() + this.pagosDigitales()),
  );

  readonly diferencia = computed<number>(() => round2(this.totalReal() - this.esperado()));

  readonly diferenciaAbs = computed<number>(() => Math.abs(this.diferencia()));

  readonly cuadrado = computed<boolean>(() => this.diferenciaAbs() < 0.005);

  readonly totalCobros = computed<number>(() => this.pagos.pagos().length);

  readonly desglose = computed<DesglosePago[]>(() =>
    METODOS.map((metodo) => {
      const cobros = this.pagos.pagos().filter((pago) => pago.metodo === metodo.metodo);
      return {
        ...metodo,
        monto: round2(cobros.reduce((suma, pago) => suma + pago.monto, 0)),
        cobros: cobros.length,
      };
    }),
  );

  readonly responsable = computed<string>(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : 'Cajero';
  });

  readonly notaDiferencia = computed<string>(() => {
    if (this.cuadrado()) {
      return 'Cuadre exacto · sin sobrante ni faltante';
    }
    return this.diferencia() > 0
      ? 'Sobrante en caja · revisa los cobros del turno'
      : 'Faltante en caja · se genera una alerta al dueño';
  });

  constructor() {
    void this.inicializar();
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  private async inicializar(): Promise<void> {
    const ok = await this.cuadre.cargar();
    if (!ok) {
      this.avisar(this.cuadre.error() ?? 'No se pudo cargar el cuadre de caja.', true);
    }
    this.inicializarCampos();
  }

  private inicializarCampos(): void {
    const contadoGuardado = this.cuadre.efectivoContado();
    const digitalGuardado = this.cuadre.pagosDigitales();
    const digitales = digitalGuardado > 0 ? digitalGuardado : 1000;
    const contado =
      contadoGuardado > 0
        ? contadoGuardado
        : round2(Math.max(0, this.cuadre.montoEsperado() - digitales));

    this.pagosDigitales.set(digitales);
    this.efectivoContado.set(contado);
  }

  onEfectivo(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.efectivoContado.set(Number.isFinite(valor) ? round2(Math.max(0, valor)) : 0);
    this.confirmando.set(false);
  }

  onDigitales(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.pagosDigitales.set(Number.isFinite(valor) ? round2(Math.max(0, valor)) : 0);
    this.confirmando.set(false);
  }

  imprimir(): void {
    this.avisar('Arqueo enviado a impresión · simulado');
  }

  async cerrar(): Promise<void> {
    if (!this.abierta()) {
      this.confirmando.set(false);
      this.avisar('Caja cerrada · abre la caja antes de cerrar el turno', true);
      return;
    }

    if (!this.confirmando()) {
      this.confirmando.set(true);
      return;
    }

    try {
      await this.cuadre.cerrar(this.efectivoContado(), this.pagosDigitales());
      this.confirmando.set(false);

      const mensaje = this.cuadrado()
        ? 'Caja cerrada · cuadre exacto'
        : `Caja cerrada · diferencia ${this.moneda(this.diferencia())}`;
      this.avisar(mensaje);

      this.temporizador = window.setTimeout(() => {
        void this.router.navigate(['/dashboard']);
      }, 1100);
    } catch (error) {
      this.confirmando.set(false);
      this.avisar(mensajeError(error), true);
    }
  }

  cancelarCierre(): void {
    this.confirmando.set(false);
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

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { USE_API } from '../../core/api/api.config';
import { mensajeError } from '../../core/api/api.helpers';
import { CuadreService, type CuadreHistorialFila } from '../../core/data/cuadre.service';
import { PagosService } from '../../core/data/pagos.service';
import type { MetodoPago } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type VistaCuadre = 'dia' | 'historial';

const LIMITES = [10, 20, 50, 100];

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = fechaLima(new Date());
const HACE_TREINTA = fechaLima(new Date(Date.now() - 29 * 86400000));
const HIST_DESDE_INICIAL = USE_API ? HACE_TREINTA : '';
const HIST_HASTA_INICIAL = USE_API ? HOY : '';

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
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
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
  private readonly route = inject(ActivatedRoute);
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

  readonly vista = signal<VistaCuadre>('dia');
  readonly histDesde = signal<string>(HIST_DESDE_INICIAL);
  readonly histHasta = signal<string>(HIST_HASTA_INICIAL);
  readonly histPagina = signal<number>(1);
  readonly histLimite = signal<number>(10);

  readonly historial = this.cuadre.historial;
  readonly historialMeta = this.cuadre.historialMeta;
  readonly historialCargando = this.cuadre.historialCargando;
  readonly historialError = this.cuadre.historialError;

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
    const params = this.route.snapshot.queryParamMap;
    const vista = params.get('vista');
    this.vista.set(vista === 'historial' ? 'historial' : 'dia');
    this.histDesde.set(params.get('desde') ?? HIST_DESDE_INICIAL);
    this.histHasta.set(params.get('hasta') ?? HIST_HASTA_INICIAL);
    this.histPagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.histLimite.set(LIMITES.includes(limite) ? limite : 10);

    void this.inicializar();
    if (this.vista() === 'historial') {
      void this.cargarHistorial();
    }

    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  cambiarVista(vista: VistaCuadre): void {
    if (this.vista() === vista) {
      return;
    }
    this.vista.set(vista);
    if (vista === 'historial') {
      this.histPagina.set(1);
      void this.cargarHistorial();
    }
    this.sincronizarUrl();
  }

  onHistDesde(event: Event): void {
    this.histDesde.set((event.target as HTMLInputElement).value);
    this.histPagina.set(1);
    void this.cargarHistorial();
  }

  onHistHasta(event: Event): void {
    this.histHasta.set((event.target as HTMLInputElement).value);
    this.histPagina.set(1);
    void this.cargarHistorial();
  }

  cambiarHistPagina(page: number): void {
    this.histPagina.set(page);
    void this.cargarHistorial();
  }

  cambiarHistLimite(limit: number): void {
    this.histLimite.set(limit);
    this.histPagina.set(1);
    void this.cargarHistorial();
  }

  reintentarHistorial(): void {
    void this.cargarHistorial();
  }

  diferenciaTono(fila: CuadreHistorialFila): ChipVariant {
    if (fila.diferencia === null) {
      return 'neutral';
    }
    return Math.abs(fila.diferencia) < 0.005 ? 'success' : 'danger';
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

  private async cargarHistorial(): Promise<void> {
    const ok = await this.cuadre.cargarHistorial({
      page: this.histPagina(),
      limit: this.histLimite(),
      desde: this.histDesde() || undefined,
      hasta: this.histHasta() || undefined,
    });
    if (ok) {
      const meta = this.historialMeta();
      this.histPagina.set(meta.page);
      this.histLimite.set(meta.limit);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        vista: this.vista() === 'historial' ? 'historial' : null,
        desde: this.vista() === 'historial' ? this.histDesde() || null : null,
        hasta: this.vista() === 'historial' ? this.histHasta() || null : null,
        page: this.vista() === 'historial' && this.histPagina() > 1 ? this.histPagina() : null,
        limit:
          this.vista() === 'historial' && this.histLimite() !== 10 ? this.histLimite() : null,
      },
      replaceUrl: true,
    });
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

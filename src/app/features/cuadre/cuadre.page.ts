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
import { mensajeError, esApiError } from '../../core/api/api.helpers';
import {
  CuadreService,
  type CuadreHistorialFila,
  type CuadrePendiente,
} from '../../core/data/cuadre.service';
import { PagosService } from '../../core/data/pagos.service';
import type { MetodoPago } from '../../core/models';
import { descargarBlob } from '../../core/utils/descarga';
import {
  abreviarNombre,
  fechaCorta,
  formatearMoneda,
  hora as formatearHora,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import {
  StepperComponent,
  type PasoStepper,
} from '../../shared/components/stepper/stepper';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type VistaCuadre = 'dia' | 'historial';
type EstadoCaja = 'abierta' | 'cerrada' | 'sin_cuadre';

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
    StepperComponent,
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
  readonly usaApi = USE_API;

  // Fecha y turno reales (antes estaban fijos en "miércoles 14 de octubre").
  readonly turno = turnoActual();
  readonly aperturaHora = computed<string>(() => formatearHora(this.cuadre.fechaApertura()));
  readonly subtituloCuadre =
    `Fratelli's · ${fechaCorta()} · ${turnoActual()} · cajero ` +
    abreviarNombre(this.auth.usuario()?.nombre ?? 'Cajero');

  readonly abierta = this.cuadre.abierta;
  readonly estado = this.cuadre.estado;
  readonly reabiertoEn = this.cuadre.reabiertoEn;
  readonly motivoReapertura = this.cuadre.motivoReapertura;
  readonly cuadreId = this.cuadre.cuadreId;
  readonly fondoInicial = this.cuadre.fondoInicial;
  readonly fechaCierre = this.cuadre.fechaCierre;
  readonly totalVentas = this.cuadre.totalVentas;
  readonly totalEgresos = this.cuadre.totalEgresos;
  readonly esperado = this.cuadre.montoEsperado;

  readonly efectivoContado = signal<number>(0);
  readonly pagosDigitales = signal<number>(0);
  readonly confirmando = signal<boolean>(false);
  readonly pdfGenerando = signal<number | null>(null);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly mostrarReabrir = signal<boolean>(false);
  readonly motivoReaperturaInput = signal<string>('');
  readonly errorMotivo = signal<string>('');
  readonly reabriendo = signal<boolean>(false);

  readonly puedeAdministrar = computed<boolean>(() =>
    this.auth.hasAnyRole(['Dueño/Admin', 'Admin'] as const),
  );

  // Cajas de días anteriores sin cerrar.
  readonly pendientes = this.cuadre.pendientes;
  readonly cargandoPendientes = this.cuadre.cargandoPendientes;
  readonly errorPendientes = this.cuadre.errorPendientes;
  readonly pendienteActiva = signal<number | null>(null);
  readonly pendienteEfectivo = signal<number>(0);
  readonly pendienteDigitales = signal<number>(0);
  readonly pendienteObservaciones = signal<string>('');
  readonly errorPendiente = signal<string>('');
  readonly cerrandoPendiente = signal<boolean>(false);

  // Cierre bloqueado por cuentas abiertas (409 CUENTAS_ABIERTAS).
  readonly cierreBloqueado = signal<string>('');

  readonly reabiertaTexto = computed<string>(() => {
    // Solo mientras la caja está reabierta. Si ya se volvió a cerrar, la
    // reapertura queda como dato histórico y no debe mostrarse como estado.
    const fecha = this.reabiertoEn();
    if (!fecha || !this.abierta()) {
      return '';
    }
    const motivo = this.motivoReapertura();
    return motivo ? `Reabierta ${formatearHora(fecha)} · ${motivo}` : `Reabierta ${formatearHora(fecha)}`;
  });

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

  readonly cobrosTexto = computed<string>(
    () => `${this.totalCobros()} ${this.totalCobros() === 1 ? 'cobro' : 'cobros'}`,
  );

  // Estado real de la caja del día: manda la señal `estado` del servicio y,
  // como respaldo, `abierta`. Antes el stepper era decorativo y "Cierre en
  // curso" se mostraba aunque la caja estuviera cerrada.
  readonly estadoCaja = computed<EstadoCaja>(() => {
    const estado = this.estado();
    if (estado === 'cerrada') {
      return 'cerrada';
    }
    if (estado === 'abierta' || this.abierta()) {
      return 'abierta';
    }
    return 'sin_cuadre';
  });

  readonly metaStepper = computed<string>(() => {
    const estado = this.estadoCaja();
    const sufijo =
      estado === 'cerrada'
        ? 'Caja cerrada'
        : estado === 'abierta'
          ? 'Caja abierta'
          : 'Sin caja abierta hoy';
    return `${this.turno} · 11:00 – 22:00 · umbral de diferencia S/ 0.00 · ${sufijo}`;
  });

  readonly pasos = computed<readonly PasoStepper[]>(() => {
    const estado = this.estadoCaja();
    const sinCaja = estado === 'sin_cuadre';
    const reabiertaEn = this.reabiertoEn();
    const fechaCierre = this.fechaCierre();

    const apertura: PasoStepper = {
      numero: 1,
      etiqueta: 'Apertura',
      estado: sinCaja ? 'active' : 'done',
      meta: sinCaja
        ? 'sin abrir'
        : `${this.aperturaHora()} · ${this.moneda(this.fondoInicial())}`,
      link: '/cuadre-caja/apertura',
    };

    const operacion: PasoStepper = {
      numero: 2,
      etiqueta: 'Operación',
      estado: estado === 'abierta' ? 'active' : estado === 'cerrada' ? 'done' : 'pending',
      meta: sinCaja ? 'pendiente' : this.cobrosTexto(),
    };

    const cierre: PasoStepper = {
      numero: 3,
      etiqueta: 'Cierre',
      estado: estado === 'cerrada' ? 'done' : 'pending',
      meta:
        estado === 'cerrada'
          ? fechaCierre
            ? `cerrada ${formatearHora(fechaCierre)}`
            : 'cerrada'
          : estado === 'abierta' && reabiertaEn
            ? `reabierta ${formatearHora(reabiertaEn)}`
            : 'pendiente',
    };

    return [apertura, operacion, cierre];
  });

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

    iniciarRefresco({
      intervaloMs: 30000,
      destroyRef: this.destroyRef,
      tarea: () => this.refrescarSilencioso(),
    });

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
    // Pagos reales del turno: desglose por método y "N cobros" sin inventar.
    await this.pagos.cargar(this.fechaDelCuadre());
    this.inicializarCampos();
  }

  private fechaDelCuadre(): string | undefined {
    if (this.cuadreId() === null) {
      return undefined;
    }
    return this.cuadre.fechaApertura().slice(0, 10) || undefined;
  }

  /**
   * Refresco silencioso: actualiza totales y desglose sin tocar los campos
   * que el cajero está escribiendo (`efectivoContado`/`pagosDigitales`).
   */
  private async refrescarSilencioso(): Promise<void> {
    await this.cuadre.cargar(true);
    await this.pagos.cargar(this.fechaDelCuadre(), true);
  }

  private inicializarCampos(): void {
    // Sin datos guardados no se precarga nada: los campos arrancan en 0.
    const contadoGuardado = this.cuadre.efectivoContado();
    const digitalGuardado = this.cuadre.pagosDigitales();

    this.pagosDigitales.set(digitalGuardado > 0 ? digitalGuardado : 0);
    this.efectivoContado.set(contadoGuardado > 0 ? contadoGuardado : 0);
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
    if (typeof window === 'undefined') {
      return;
    }
    window.print();
  }

  async descargarPdfDia(): Promise<void> {
    const id = this.cuadreId();
    if (id === null) {
      return;
    }
    await this.descargarPdf(id, this.cuadre.fechaApertura().slice(0, 10));
  }

  async descargarPdfFila(fila: CuadreHistorialFila): Promise<void> {
    await this.descargarPdf(fila.id, fila.fecha);
  }

  private async descargarPdf(id: number, fecha: string): Promise<void> {
    if (!USE_API) {
      this.avisar('Exportación disponible con el servidor', true);
      return;
    }
    if (this.pdfGenerando() !== null) {
      return;
    }
    this.pdfGenerando.set(id);
    try {
      const blob = await this.cuadre.descargarPdf(id);
      descargarBlob(blob, `cuadre-${fecha || 'sin-fecha'}.pdf`);
      this.avisar('PDF del cuadre descargado');
    } catch (error) {
      this.avisar(mensajeError(error), true);
    } finally {
      this.pdfGenerando.set(null);
    }
  }

  async cerrar(): Promise<void> {
    if (!this.abierta()) {
      this.confirmando.set(false);
      this.avisar('Caja cerrada · abre la caja antes de cerrar el turno', true);
      return;
    }

    if (!this.confirmando()) {
      this.cierreBloqueado.set('');
      this.confirmando.set(true);
      return;
    }

    try {
      await this.cuadre.cerrar(this.efectivoContado(), this.pagosDigitales());
      this.confirmando.set(false);
      this.cierreBloqueado.set('');

      const mensaje = this.cuadrado()
        ? 'Caja cerrada · cuadre exacto'
        : `Caja cerrada · diferencia ${this.moneda(this.diferencia())}`;
      this.avisar(mensaje);

      this.temporizador = window.setTimeout(() => {
        void this.router.navigate(['/dashboard']);
      }, 1100);
    } catch (error) {
      this.confirmando.set(false);
      // El backend responde 409 CUENTAS_ABIERTAS con el número de cuentas:
      // se muestra el mensaje del servidor y un acceso directo a las mesas.
      if (esApiError(error) && error.code === 'CUENTAS_ABIERTAS') {
        this.cierreBloqueado.set(mensajeError(error));
      }
      this.avisar(mensajeError(error), true);
    }
  }

  cancelarCierre(): void {
    this.confirmando.set(false);
  }

  irApertura(): void {
    void this.router.navigate(['/cuadre-caja/apertura']);
  }

  fechaPendiente(fecha: string): string {
    const [anio, mes, dia] = fecha.slice(0, 10).split('-');
    return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha;
  }

  diferenciaPendiente(pendiente: CuadrePendiente): number {
    return round2(
      this.pendienteEfectivo() + this.pendienteDigitales() - pendiente.montoEsperado,
    );
  }

  pendienteCuadrada(pendiente: CuadrePendiente): boolean {
    return Math.abs(this.diferenciaPendiente(pendiente)) < 0.005;
  }

  abrirCerrarPendiente(pendiente: CuadrePendiente): void {
    if (!this.puedeAdministrar() || this.cerrandoPendiente()) {
      return;
    }
    this.pendienteActiva.set(pendiente.id);
    this.pendienteEfectivo.set(0);
    this.pendienteDigitales.set(0);
    this.pendienteObservaciones.set('');
    this.errorPendiente.set('');
  }

  cancelarCerrarPendiente(): void {
    this.pendienteActiva.set(null);
    this.pendienteObservaciones.set('');
    this.errorPendiente.set('');
  }

  onPendienteEfectivo(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.pendienteEfectivo.set(Number.isFinite(valor) ? round2(Math.max(0, valor)) : 0);
    this.errorPendiente.set('');
  }

  onPendienteDigitales(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.pendienteDigitales.set(Number.isFinite(valor) ? round2(Math.max(0, valor)) : 0);
    this.errorPendiente.set('');
  }

  onPendienteObservaciones(event: Event): void {
    this.pendienteObservaciones.set((event.target as HTMLTextAreaElement).value);
    this.errorPendiente.set('');
  }

  async confirmarCerrarPendiente(pendiente: CuadrePendiente): Promise<void> {
    if (!this.puedeAdministrar() || this.cerrandoPendiente()) {
      return;
    }
    const observaciones = this.pendienteObservaciones().trim();
    const diferencia = this.diferenciaPendiente(pendiente);

    if (observaciones.length > 300) {
      this.errorPendiente.set('La observación no puede superar los 300 caracteres.');
      return;
    }
    if (observaciones.length > 0 && observaciones.length < 5) {
      this.errorPendiente.set('La observación debe tener al menos 5 caracteres.');
      return;
    }
    if (Math.abs(diferencia) >= 0.005 && observaciones.length === 0) {
      this.errorPendiente.set('Registra una observación cuando hay diferencia.');
      return;
    }

    this.cerrandoPendiente.set(true);
    this.errorPendiente.set('');
    try {
      await this.cuadre.cerrarPendiente(
        pendiente.id,
        this.pendienteEfectivo(),
        this.pendienteDigitales(),
        observaciones,
      );
      this.pendienteActiva.set(null);
      this.pendienteObservaciones.set('');
      this.avisar(`Caja del ${this.fechaPendiente(pendiente.fecha)} cerrada`);
    } catch (error) {
      // 403/409/422 llegan con el mensaje del servidor (ApiError).
      this.errorPendiente.set(mensajeError(error));
    } finally {
      this.cerrandoPendiente.set(false);
    }
  }

  abrirReabrir(): void {
    if (!this.puedeAdministrar()) {
      return;
    }
    this.mostrarReabrir.set(true);
    this.motivoReaperturaInput.set('');
    this.errorMotivo.set('');
  }

  cancelarReabrir(): void {
    this.mostrarReabrir.set(false);
    this.motivoReaperturaInput.set('');
    this.errorMotivo.set('');
  }

  onMotivo(event: Event): void {
    this.motivoReaperturaInput.set((event.target as HTMLTextAreaElement).value);
    this.errorMotivo.set('');
  }

  async confirmarReabrir(): Promise<void> {
    if (this.reabriendo()) {
      return;
    }
    if (!this.puedeAdministrar()) {
      this.errorMotivo.set('Solo el Dueño/Admin puede reabrir la caja.');
      return;
    }
    const motivo = this.motivoReaperturaInput().trim();
    if (motivo.length < 5) {
      this.errorMotivo.set('El motivo debe tener al menos 5 caracteres.');
      return;
    }
    if (motivo.length > 300) {
      this.errorMotivo.set('El motivo no puede superar los 300 caracteres.');
      return;
    }

    this.reabriendo.set(true);
    this.errorMotivo.set('');
    try {
      await this.cuadre.reabrir(motivo);
      this.mostrarReabrir.set(false);
      this.motivoReaperturaInput.set('');
      // Recarga estado y avisos; los pagos se refrescan con la fecha real.
      await this.cuadre.cargar();
      await this.pagos.cargar(this.fechaDelCuadre());
      this.inicializarCampos();
      this.avisar('Caja reabierta · ' + motivo);
    } catch (error) {
      // 409/422 llegan con el mensaje del servidor (ApiError).
      this.avisar(mensajeError(error), true);
    } finally {
      this.reabriendo.set(false);
    }
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

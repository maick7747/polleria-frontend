import { SlicePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  DeliveryService,
  type PlataformaExterna,
} from '../../../core/data/delivery.service';
import { formatearMoneda, round2 } from '../../../core/utils/format';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../../shared/components/icon/icon';

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = fechaLima(new Date());
const HACE_SIETE = fechaLima(new Date(Date.now() - 6 * 86400000));

/**
 * Conciliación de delivery externo. Las apps no se cobran en la caja física:
 * el cliente paga en la plataforma y el negocio recibe un depósito neto.
 * Aquí se seleccionan los pedidos, se calcula bruto/comisión/neto y se
 * compara el neto esperado con el monto realmente depositado.
 */
@Component({
  selector: 'app-liquidaciones-apps',
  standalone: true,
  imports: [EmptyStateComponent, IconComponent, SlicePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './liquidaciones-apps.component.html',
  styleUrl: './liquidaciones-apps.component.css',
})
export class LiquidacionesAppsComponent {
  private readonly delivery = inject(DeliveryService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly plataforma = signal<PlataformaExterna>('rappi');
  readonly desde = signal<string>(HACE_SIETE);
  readonly hasta = signal<string>(HOY);
  readonly seleccionados = signal<ReadonlySet<number>>(new Set<number>());
  readonly montoDepositado = signal<string>('');
  readonly referencia = signal<string>('');
  readonly guardando = signal<boolean>(false);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly pendientes = this.delivery.pendientesLiquidar;
  readonly meta = this.delivery.pendientesLiquidarMeta;
  readonly cargando = this.delivery.pendientesLiquidarCargando;
  readonly error = this.delivery.pendientesLiquidarError;
  readonly liquidaciones = this.delivery.liquidaciones;
  readonly liquidacionesCargando = this.delivery.liquidacionesCargando;
  readonly liquidacionesError = this.delivery.liquidacionesError;

  readonly pedidosSeleccionados = computed(() =>
    this.pendientes().filter((pedido) => this.seleccionados().has(pedido.id)),
  );

  readonly bruto = computed<number>(() =>
    round2(this.pedidosSeleccionados().reduce((suma, pedido) => suma + pedido.montoBruto, 0)),
  );
  readonly comision = computed<number>(() =>
    round2(this.pedidosSeleccionados().reduce((suma, pedido) => suma + pedido.comision, 0)),
  );
  readonly neto = computed<number>(() => round2(this.bruto() - this.comision()));

  readonly depositado = computed<number>(() => {
    const valor = Number(this.montoDepositado());
    return Number.isFinite(valor) ? round2(valor) : 0;
  });

  readonly diferencia = computed<number>(() =>
    round2(this.depositado() - this.neto()),
  );

  readonly puedeRegistrar = computed<boolean>(
    () => this.pedidosSeleccionados().length > 0 && !this.guardando(),
  );

  readonly todosSeleccionados = computed<boolean>(
    () =>
      this.pendientes().length > 0 &&
      this.pendientes().every((pedido) => this.seleccionados().has(pedido.id)),
  );

  readonly totalHistorico = computed<number>(() =>
    round2(this.liquidaciones().reduce((suma, fila) => suma + fila.montoNeto, 0)),
  );

  constructor() {
    void this.cargar();
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  cambiarPlataforma(plataforma: PlataformaExterna): void {
    if (this.plataforma() === plataforma) {
      return;
    }
    this.plataforma.set(plataforma);
    this.seleccionados.set(new Set<number>());
    this.montoDepositado.set('');
    void this.cargar();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.seleccionados.set(new Set<number>());
    this.montoDepositado.set('');
    void this.cargar();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.seleccionados.set(new Set<number>());
    this.montoDepositado.set('');
    void this.cargar();
  }

  estaSeleccionado(id: number): boolean {
    return this.seleccionados().has(id);
  }

  toggle(id: number): void {
    const siguientes = new Set(this.seleccionados());
    if (siguientes.has(id)) {
      siguientes.delete(id);
    } else {
      siguientes.add(id);
    }
    this.seleccionados.set(siguientes);
    this.sugerirDeposito();
  }

  alternarTodos(): void {
    this.seleccionados.set(
      this.todosSeleccionados()
        ? new Set<number>()
        : new Set(this.pendientes().map((pedido) => pedido.id)),
    );
    this.sugerirDeposito();
  }

  onMontoDepositado(event: Event): void {
    this.montoDepositado.set((event.target as HTMLInputElement).value);
  }

  onReferencia(event: Event): void {
    this.referencia.set((event.target as HTMLInputElement).value);
  }

  async registrar(): Promise<void> {
    if (!this.puedeRegistrar()) {
      this.avisar('Selecciona al menos un pedido para liquidar.', true);
      return;
    }

    this.guardando.set(true);
    const liquidacion = await this.delivery.liquidarPedidos({
      plataforma: this.plataforma(),
      fecha: this.hasta() || HOY,
      pedidoIds: this.pedidosSeleccionados().map((pedido) => pedido.id),
      montoDepositado: this.depositado(),
      referencia: this.referencia(),
    });
    this.guardando.set(false);

    if (!liquidacion) {
      this.avisar(
        this.liquidacionesError() ?? 'No se pudo registrar la liquidación.',
        true,
      );
      return;
    }

    this.seleccionados.set(new Set<number>());
    this.montoDepositado.set('');
    this.referencia.set('');
    this.avisar(
      `Liquidación #${liquidacion.id} registrada · neto ${this.moneda(liquidacion.montoNeto)}`,
    );
    await this.cargar();
  }

  plataformaTexto(plataforma: string): string {
    return plataforma === 'llamafood' ? 'LlamaFood' : 'Rappi';
  }

  async cargar(): Promise<void> {
    await Promise.all([
      this.delivery.cargarPendientesLiquidar({
        plataforma: this.plataforma(),
        desde: this.desde() || undefined,
        hasta: this.hasta() || undefined,
      }),
      this.delivery.cargarLiquidaciones({ limit: 10 }),
    ]);
  }

  private sugerirDeposito(): void {
    if (this.montoDepositado().trim() === '' && this.pedidosSeleccionados().length > 0) {
      this.montoDepositado.set(this.neto().toFixed(2));
    }
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 3200);
  }
}

// LEGACY (19/11/2026): /venta-local/para-llevar redirige a /venta?modo=mostrador.
// Se conserva como referencia; la pantalla activa es `features/venta`.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuadreService } from '../../core/data/cuadre.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { EstadoPedido, Pedido, PedidoDetalle } from '../../core/models';
import {
  formatearMoneda,
  hora,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { ModoVentaComponent } from '../../shared/components/modo-venta/modo-venta';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SelectorPlatosComponent } from '../../shared/components/selector-platos/selector-platos';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

// Misma regla que el backend: 18 % de IGV sobre el subtotal, con mínimo de S/ 70.
const IGV_PCT = 18;
const IGV_MIN = 70;

const ESTADOS: readonly { valor: EstadoPedido; texto: string; tono: ChipVariant }[] = [
  { valor: 'borrador', texto: 'Borrador', tono: 'neutral' },
  { valor: 'en_cocina', texto: 'En cocina', tono: 'warning' },
  { valor: 'servido', texto: 'Servido', tono: 'info' },
  { valor: 'cobrado', texto: 'Cobrado', tono: 'success' },
  { valor: 'cancelado', texto: 'Cancelado', tono: 'danger' },
];

@Component({
  selector: 'app-para-llevar-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    ModoVentaComponent,
    PanelComponent,
    SelectorPlatosComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './para-llevar.page.html',
  styleUrl: './para-llevar.page.css',
})
export class ParaLlevarPage {
  private readonly pedidos = inject(PedidosService);
  private readonly cuadre = inject(CuadreService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly hora = hora;
  readonly turno = turnoActual();

  // Carrito y alta del pedido.
  readonly items = signal<PedidoDetalle[]>([]);
  readonly cliente = signal<string>('');
  readonly observaciones = signal<string>('');
  readonly enviando = signal<boolean>(false);

  // Pedido recién enviado a cocina: el panel derecho muestra su resumen.
  readonly seleccionado = signal<Pedido | null>(null);

  readonly error = signal<string | null>(null);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly cargandoCola = this.pedidos.paraLLevarCargando;

  readonly cajaAbierta = computed<boolean>(() => this.cuadre.estado() === 'abierta');
  // Solo mientras corre la petición: si falla, `estado` queda vacío y la
  // pantalla debe mostrar el banner (con enlace a apertura), no quedarse
  // bloqueada en "verificando" para siempre.
  readonly cajaVerificando = computed<boolean>(() => this.cuadre.cargando());
  readonly cajaError = this.cuadre.error;

  readonly cola = computed<Pedido[]>(() =>
    this.pedidos
      .paraLLevar()
      .filter((pedido) => pedido.estado !== 'cobrado' && pedido.estado !== 'cancelado'),
  );

  readonly totalEnCurso = computed<number>(() =>
    round2(this.cola().reduce((suma, pedido) => suma + pedido.total, 0)),
  );

  readonly subtotal = computed<number>(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly igv = computed<number>(() =>
    this.subtotal() >= IGV_MIN && this.subtotal() > 0
      ? round2((this.subtotal() * IGV_PCT) / 100)
      : 0,
  );

  readonly total = computed<number>(() => round2(this.subtotal() + this.igv()));

  readonly puedeEnviar = computed<boolean>(
    () => this.cajaAbierta() && this.items().length > 0 && !this.enviando(),
  );

  constructor() {
    void this.cuadre.cargar();
    void this.cargarCola();

    iniciarRefresco({
      intervaloMs: 15000,
      destroyRef: this.destroyRef,
      tarea: async () => {
        await this.pedidos.cargarParaLlevar(true);
      },
    });

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  onCliente(event: Event): void {
    this.cliente.set((event.target as HTMLInputElement).value);
  }

  onObservaciones(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  reintentar(): void {
    void this.cargarCola();
  }

  reintentarCaja(): void {
    void this.cuadre.cargar();
  }

  async enviar(): Promise<void> {
    if (!this.cajaAbierta()) {
      this.avisar('Abre la caja antes de registrar pedidos para llevar.', true);
      return;
    }
    if (this.items().length === 0) {
      this.avisar('Agrega al menos un plato al pedido.', true);
      return;
    }
    if (this.enviando()) {
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    const creado = await this.pedidos.crearParaLlevar({
      items: this.items(),
      clienteNombre: this.cliente().trim() || undefined,
      observaciones: this.observaciones().trim() || undefined,
    });
    this.enviando.set(false);

    if (!creado) {
      const mensaje =
        this.pedidos.paraLLevarError() ?? 'No se pudo enviar el pedido a cocina.';
      this.error.set(mensaje);
      this.avisar(mensaje, true);
      return;
    }

    this.items.set([]);
    this.cliente.set('');
    this.observaciones.set('');
    this.seleccionado.set(creado);
    this.avisar(`${creado.numero} enviado a cocina`);
    await this.cargarCola(true);
  }

  cancelarSeleccion(): void {
    this.seleccionado.set(null);
  }

  /** Reintenta el envío a cocina de un pedido que quedó en borrador. */
  async reintentarEnvio(pedido: Pedido): Promise<void> {
    if (pedido.estado !== 'borrador') {
      return;
    }
    const actualizado = await this.pedidos.enviarCocinaPedido(pedido.id);
    if (!actualizado) {
      const mensaje =
        this.pedidos.paraLLevarError() ?? 'No se pudo enviar el pedido a cocina.';
      this.error.set(mensaje);
      this.avisar(mensaje, true);
      return;
    }
    this.avisar(`${actualizado.numero} enviado a cocina`);
    await this.cargarCola(true);
  }

  estadoTexto(estado: EstadoPedido): string {
    return ESTADOS.find((item) => item.valor === estado)?.texto ?? estado;
  }

  estadoTono(estado: EstadoPedido): ChipVariant {
    return ESTADOS.find((item) => item.valor === estado)?.tono ?? 'neutral';
  }

  horaPedido(pedido: Pedido): string {
    return this.hora(pedido.fechaPedido);
  }

  espera(pedido: Pedido): string {
    const minutos = minutosEntre(pedido.fechaPedido, Date.now());
    return minutos < 1 ? 'ahora' : `${minutos} min`;
  }

  totalUnidades(pedido: Pedido): number {
    return pedido.items.reduce((suma, item) => suma + item.cantidad, 0);
  }

  private async cargarCola(silencioso = false): Promise<void> {
    const ok = await this.pedidos.cargarParaLlevar(silencioso);
    if (!silencioso) {
      this.error.set(ok ? null : this.pedidos.paraLLevarError());
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
    }, 3600);
  }
}

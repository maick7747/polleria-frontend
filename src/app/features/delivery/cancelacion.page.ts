import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  describirRepuestos,
  type ResultadoCancelacion,
} from '../../core/api/cancelacion.helpers';
import { esApiError, mensajeError } from '../../core/api/api.helpers';
import { DeliveryService } from '../../core/data/delivery.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { CanalPedido, EstadoPedido, Pedido, PedidoDetalle } from '../../core/models';
import { formatearMoneda, hora } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const CANAL_TEXTO: Record<CanalPedido, string> = {
  local: 'Local',
  whatsapp: 'WhatsApp',
  delivery_propio: 'Delivery propio',
  rappi: 'Rappi',
  llamafood: 'LlamaFood',
};

const ESTADO_TEXTO: Record<EstadoPedido, string> = {
  borrador: 'Borrador · sin enviar a cocina',
  en_cocina: 'En cocina',
  servido: 'Servido · por cobrar',
  cobrado: 'Cobrado · no cancelable',
  cancelado: 'Cancelado',
};

const ESTADO_ICONO: Record<EstadoPedido, IconName> = {
  borrador: 'clock',
  en_cocina: 'flame',
  servido: 'fork-knife',
  cobrado: 'check-circle',
  cancelado: 'x',
};

@Component({
  selector: 'app-cancelacion-delivery-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cancelacion.page.html',
  styleUrl: './cancelacion.page.css',
})
export class CancelacionDeliveryPage {
  private readonly pedidos = inject(PedidosService);
  private readonly delivery = inject(DeliveryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly motivos = [
    'Cliente canceló',
    'Sin stock',
    'Demora en cocina',
    'Dirección errada',
  ] as const;

  readonly pedidoId = signal<number | null>(null);
  readonly pedido = signal<Pedido | null>(null);
  readonly cargando = signal<boolean>(true);
  readonly errorCarga = signal<string | null>(null);
  readonly procesando = signal<boolean>(false);
  readonly errorAccion = signal<string | null>(null);
  readonly resultado = signal<ResultadoCancelacion | null>(null);
  readonly motivo = signal<string>(this.motivos[0]);
  readonly toast = signal<string>('');

  readonly numero = computed<string>(() => {
    const pedido = this.pedido();
    if (pedido) {
      return pedido.numero;
    }
    const id = this.pedidoId();
    return id === null ? 'Pedido' : `#${id}`;
  });

  readonly canalTexto = computed<string>(() => {
    const pedido = this.pedido();
    return pedido ? CANAL_TEXTO[pedido.canal] : '—';
  });

  readonly esExterno = computed<boolean>(() => {
    const canal = this.pedido()?.canal;
    return canal === 'rappi' || canal === 'llamafood';
  });

  readonly cliente = computed<string>(() => {
    const pedido = this.pedido();
    if (!pedido) {
      return '—';
    }
    const nombre = pedido.clienteNombre?.trim();
    if (nombre) {
      return nombre;
    }
    return pedido.tipoConsumo === 'sala' ? 'Cliente en sala' : 'Sin cliente registrado';
  });

  readonly ubicacionEtiqueta = computed<string>(() => {
    const pedido = this.pedido();
    if (!pedido) {
      return 'Entrega';
    }
    return pedido.mesaId !== null ? 'Mesa' : 'Dirección';
  });

  readonly ubicacionValor = computed<string>(() => {
    const pedido = this.pedido();
    if (!pedido) {
      return '—';
    }
    if (pedido.mesaId !== null) {
      return `Mesa ${pedido.mesaId}`;
    }
    const direccion = pedido.direccionEntrega?.trim();
    return direccion && direccion.length > 0 ? direccion : 'Sin dirección registrada';
  });

  readonly referencia = computed<string>(() => this.pedido()?.referenciaEntrega?.trim() ?? '');

  readonly horaPedido = computed<string>(() => hora(this.pedido()?.fechaPedido));

  readonly items = computed<PedidoDetalle[]>(() => this.pedido()?.items ?? []);

  readonly totalItems = computed<number>(() =>
    this.items().reduce((suma, item) => suma + item.cantidad, 0),
  );

  readonly total = computed<number>(() => this.pedido()?.total ?? 0);

  readonly estado = computed<EstadoPedido | null>(() => this.pedido()?.estado ?? null);

  readonly cancelable = computed<boolean>(() => {
    const estado = this.estado();
    return estado !== null && estado !== 'cobrado' && estado !== 'cancelado';
  });

  readonly puedeConfirmar = computed<boolean>(
    () => this.cancelable() && !this.procesando() && this.resultado() === null,
  );

  readonly volverRuta = computed<string>(() =>
    this.esExterno() ? '/delivery-externo' : '/delivery-propio',
  );

  readonly nombrePedido = computed<string>(() => {
    const pedido = this.pedido();
    return pedido ? `Cancelar pedido · ${this.canalTexto()} ${this.numero()}` : 'Cancelar pedido';
  });

  readonly subtitulo = computed<string>(() => {
    if (this.cargando()) {
      return 'Cargando datos del pedido…';
    }
    if (this.errorCarga()) {
      return 'No se pudo cargar el pedido';
    }
    const estado = this.estado();
    if (this.resultado()) {
      return `${this.numero()} cancelado · ${this.resultado()?.stockRevertido ? 'stock repuesto' : 'sin stock descontado'}`;
    }
    return `${this.numero()} · ${this.canalTexto()}${estado ? ` · ${ESTADO_TEXTO[estado]}` : ''}`;
  });

  constructor() {
    const params = this.route.snapshot.paramMap;
    const query = this.route.snapshot.queryParamMap;
    const desdeRuta = Number(params.get('pedidoId'));
    const desdeQuery = Number(query.get('pedidoId'));
    const id =
      Number.isFinite(desdeRuta) && desdeRuta > 0
        ? desdeRuta
        : Number.isFinite(desdeQuery) && desdeQuery > 0
          ? desdeQuery
          : null;
    this.pedidoId.set(id === null ? null : Math.trunc(id));

    void this.cargar();

    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  async cargar(): Promise<void> {
    const id = this.pedidoId();
    this.errorAccion.set(null);
    this.resultado.set(null);
    if (id === null) {
      this.pedido.set(null);
      this.cargando.set(false);
      this.errorCarga.set('No se indicó el pedido a cancelar.');
      return;
    }

    this.cargando.set(true);
    this.errorCarga.set(null);
    try {
      const pedido = await this.pedidos.obtenerPorId(id);
      this.pedido.set(pedido);
      this.errorCarga.set(
        pedido ? null : `No se encontró el pedido #${id}.`,
      );
    } catch (error) {
      this.pedido.set(null);
      this.errorCarga.set(this.mensajeDe(error));
    } finally {
      this.cargando.set(false);
    }
  }

  reintentar(): void {
    void this.cargar();
  }

  elegirMotivo(motivo: string): void {
    if (!this.puedeConfirmar()) {
      return;
    }
    this.motivo.set(motivo);
  }

  async confirmar(): Promise<void> {
    const pedido = this.pedido();
    if (!pedido || !this.puedeConfirmar()) {
      return;
    }

    this.procesando.set(true);
    this.errorAccion.set(null);
    try {
      if (this.esExterno()) {
        const resultado = await this.delivery.cancelarExterno(pedido.id, this.motivo());
        if (!resultado) {
          this.errorAccion.set(
            this.delivery.externosError() ?? 'No se pudo cancelar el pedido.',
          );
          return;
        }
        this.aplicarCancelacion(resultado);
        return;
      }

      const respuesta = await this.pedidos.cancelarPedido(pedido.id, this.motivo());
      if (!respuesta) {
        this.errorAccion.set('No se pudo cancelar el pedido.');
        return;
      }
      this.pedido.set(respuesta.pedido);
      this.aplicarCancelacion(respuesta.resultado);
    } catch (error) {
      this.errorAccion.set(this.mensajeDe(error));
    } finally {
      this.procesando.set(false);
    }
  }

  mantener(): void {
    void this.router.navigate([this.volverRuta()]);
  }

  estadoTexto(estado: EstadoPedido): string {
    return ESTADO_TEXTO[estado];
  }

  estadoTono(estado: EstadoPedido): string {
    switch (estado) {
      case 'cobrado':
        return 'success';
      case 'cancelado':
        return 'danger';
      case 'servido':
        return 'info';
      case 'en_cocina':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  estadoIcono(estado: EstadoPedido): IconName {
    return ESTADO_ICONO[estado];
  }

  repuestosTexto(): string {
    const resultado = this.resultado();
    return resultado ? describirRepuestos(resultado) : '';
  }

  private aplicarCancelacion(resultado: ResultadoCancelacion): void {
    this.pedido.update((pedido) =>
      pedido ? { ...pedido, estado: 'cancelado' as const } : pedido,
    );
    this.resultado.set(resultado);
    this.toast.set(`Pedido ${this.numero()} cancelado`);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => {
      this.toast.set('');
      this.temporizador = null;
    }, 3600);
  }

  private mensajeDe(error: unknown): string {
    if (esApiError(error)) {
      if (error.status === 0 && error.code !== 'TIMEOUT') {
        return `${error.message} Revisa tu conexión y vuelve a intentarlo.`;
      }
      return error.message;
    }
    return mensajeError(error);
  }
}

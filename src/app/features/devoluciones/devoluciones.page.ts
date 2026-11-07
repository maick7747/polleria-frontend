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
import { DevolucionesService } from '../../core/data/devoluciones.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import { PedidosService } from '../../core/data/pedidos.service';
import type {
  EstadoDevolucion,
  Pedido,
  ResolucionDevolucion,
} from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const MOTIVOS: readonly string[] = [
  'Plato frío',
  'Pedido incompleto',
  'Error de preparación',
  'Demora excesiva',
  'Otro',
];

interface SolucionVista {
  id: ResolucionDevolucion;
  titulo: string;
  descripcion: string;
}

const SOLUCIONES: readonly SolucionVista[] = [
  {
    id: 're_preparar',
    titulo: 'Re-preparar el plato',
    descripcion: 'Vuelve a cocina como prioritario, sin costo para el cliente',
  },
  {
    id: 'corregir',
    titulo: 'Corregir el pedido',
    descripcion: 'Se entrega el faltante o el complemento correcto',
  },
  {
    id: 'reembolso_total',
    titulo: 'Reembolso total',
    descripcion: 'Devuelve el importe completo del pedido',
  },
  {
    id: 'reembolso_parcial',
    titulo: 'Reembolso parcial',
    descripcion: 'Monto acordado con el cliente por el plato observado',
  },
];

@Component({
  selector: 'app-devoluciones-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './devoluciones.page.html',
  styleUrl: './devoluciones.page.css',
})
export class DevolucionesPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly pedidos = inject(PedidosService);
  private readonly devoluciones = inject(DevolucionesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly motivos = MOTIVOS;
  readonly soluciones = SOLUCIONES;
  readonly moneda = formatearMoneda;

  readonly pedidoId = signal<number>(this.pedidos.pedidos()[0]?.id ?? 0);
  readonly motivo = signal<string>('Plato frío');
  readonly solucion = signal<ResolucionDevolucion>('re_preparar');
  readonly montoParcial = signal<string>('24.00');

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly pedidosDisponibles = computed<Pedido[]>(() =>
    this.pedidos.pedidos().filter((pedido) => pedido.estado !== 'cancelado'),
  );

  readonly pedido = computed<Pedido | null>(
    () => this.pedidos.porId(this.pedidoId()) ?? null,
  );

  readonly total = computed<number>(() => this.pedido()?.total ?? 0);
  readonly devolucionesTurno = this.devoluciones.devoluciones;

  readonly esDueno = computed<boolean>(() =>
    this.auth.hasAnyRole(['Dueño/Admin', 'Admin']),
  );

  readonly esReembolso = computed<boolean>(() => {
    const solucion = this.solucion();
    return solucion === 'reembolso_total' || solucion === 'reembolso_parcial';
  });

  readonly montoParcialNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.montoParcial().replace(',', '.'));
    return Number.isFinite(valor) ? round2(valor) : 0;
  });

  readonly montoSolucion = computed<number>(() => {
    if (this.solucion() === 'reembolso_total') {
      return this.total();
    }
    if (this.solucion() === 'reembolso_parcial') {
      return this.montoParcialNumero();
    }
    return 0;
  });

  readonly tituloSolucion = computed<string>(() => this.solucionVista().titulo);
  readonly descripcionSolucion = computed<string>(() => this.solucionVista().descripcion);

  readonly puedeConfirmar = computed<boolean>(() => {
    if (!this.pedido()) {
      return false;
    }
    if (this.solucion() === 'reembolso_parcial') {
      return this.montoParcialNumero() > 0;
    }
    return true;
  });

  readonly platoAfectado = computed<string>(() => {
    const item = this.pedido()?.items[0];
    if (!item) {
      return '—';
    }
    return item.cantidad > 1 ? `${item.nombre} x${item.cantidad}` : item.nombre;
  });

  readonly canalTexto = computed<string>(() => {
    const pedido = this.pedido();
    if (!pedido) {
      return '—';
    }
    return this.textoCanalPedido(pedido);
  });

  readonly mozo = computed<string>(() => {
    const usuario = MOCK_USUARIOS.find(
      (candidato) => candidato.id === this.pedido()?.usuarioCajeroId,
    );
    return usuario ? abreviarNombre(usuario.nombre) : '—';
  });

  readonly devolucionCodigo = computed<string>(() =>
    String(14 + this.devolucionesTurno().length).padStart(3, '0'),
  );

  readonly estadoCocinaTexto = computed<string>(() => {
    const estado = this.pedido()?.estado;
    if (estado === 'en_cocina') {
      return 'En cocina';
    }
    if (estado === 'servido') {
      return 'Servido';
    }
    if (estado === 'cobrado') {
      return 'Cobrado';
    }
    if (estado === 'cancelado') {
      return 'Cancelado';
    }
    return 'Borrador';
  });

  readonly estadoCocinaTono = computed<ChipVariant>(() => {
    const estado = this.pedido()?.estado;
    if (estado === 'cobrado') {
      return 'success';
    }
    if (estado === 'cancelado') {
      return 'danger';
    }
    if (estado === 'en_cocina' || estado === 'servido') {
      return 'warning';
    }
    return 'neutral';
  });

  readonly subtitulo = computed<string>(
    () =>
      `Pedido ${this.pedido()?.numero ?? '—'} · ${this.canalTexto()} · ${this.platoAfectado()}`,
  );

  readonly recientesMeta = computed<string>(() => {
    const total = this.devolucionesTurno().length;
    const pendientes = this.devoluciones.pendientes().length;
    return `${total - pendientes} resueltas · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}`;
  });

  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  onPedido(event: Event): void {
    this.pedidoId.set(Number((event.target as HTMLSelectElement).value));
  }

  elegirMotivo(motivo: string): void {
    this.motivo.set(motivo);
  }

  elegirSolucion(solucion: ResolucionDevolucion): void {
    this.solucion.set(solucion);
  }

  onMontoParcial(event: Event): void {
    this.montoParcial.set((event.target as HTMLInputElement).value);
  }

  confirmar(): void {
    const pedido = this.pedido();
    if (!pedido) {
      this.avisar('Selecciona un pedido observado.', true);
      return;
    }
    if (this.esReembolso() && !this.esDueno()) {
      this.avisar('Solo Dueño/Admin autoriza reembolsos.', true);
      return;
    }
    if (!this.puedeConfirmar()) {
      this.avisar('El monto del reembolso debe ser mayor a 0.', true);
      return;
    }

    const devolucion = this.devoluciones.registrar({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      motivo: this.motivo(),
      detalle: `El cliente reporta "${this.motivo().toLowerCase()}" en el pedido ${pedido.numero}.`,
    });

    if (this.esReembolso()) {
      void this.router.navigate(['/devoluciones/reembolso'], {
        queryParams: {
          devolucionId: devolucion.id,
          monto: this.montoSolucion(),
          pedido: pedido.numero,
          motivo: this.motivo(),
          tipo: this.solucion(),
        },
      });
      return;
    }

    this.devoluciones.resolver(devolucion.id, this.solucion(), 0, this.usuarioId());
    this.avisar(`Devolución registrada · ${this.tituloSolucion()}`);
    this.navTimer = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 1500);
    this.destroyRef.onDestroy(() => {
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
    });
  }

  descartar(): void {
    void this.router.navigate(['/comandas']);
  }

  textoSolucion(resolucion: ResolucionDevolucion | undefined): string {
    if (!resolucion) {
      return 'Por definir';
    }
    return SOLUCIONES.find((solucion) => solucion.id === resolucion)?.titulo ?? '—';
  }

  textoEstado(estado: EstadoDevolucion): string {
    if (estado === 'aceptada') {
      return 'Resuelta';
    }
    if (estado === 'rechazada') {
      return 'Rechazada';
    }
    return 'Pendiente';
  }

  tonoEstado(estado: EstadoDevolucion): ChipVariant {
    if (estado === 'aceptada') {
      return 'success';
    }
    if (estado === 'rechazada') {
      return 'danger';
    }
    return 'warning';
  }

  hora(iso: string): string {
    return iso.length >= 16 ? iso.slice(11, 16) : '—';
  }

  private solucionVista(): SolucionVista {
    return (
      SOLUCIONES.find((solucion) => solucion.id === this.solucion()) ?? SOLUCIONES[0]
    );
  }

  textoCanalPedido(pedido: Pedido): string {
    if (pedido.canal === 'local') {
      return `Local · Mesa ${String(pedido.mesaId ?? 0).padStart(2, '0')}`;
    }
    if (pedido.canal === 'whatsapp') {
      return 'WhatsApp';
    }
    if (pedido.canal === 'delivery_propio') {
      return 'Delivery propio';
    }
    if (pedido.canal === 'rappi') {
      return 'Rappi';
    }
    return 'LlamaFood';
  }

  private usuarioId(): number {
    return this.auth.usuario()?.id ?? 1;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/data/cuentas.service';
import { PagosService } from '../../core/data/pagos.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { Pedido } from '../../core/models';
import { USE_API } from '../../core/api/api.config';
import {
  formatearMoneda,
  formatearNumero,
  horaActual,
  minutosEntre,
  turnoActual,
} from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroComandas = 'todas' | 'local' | 'delivery' | 'rappi' | 'listas';
type CanalTipo = 'local' | 'delivery' | 'rappi';

interface ComandaFila {
  pedidoId: number;
  numero: string;
  canal: string;
  canalTipo: CanalTipo;
  destino: string;
  rondas: number;
  minutos: number;
  estado: string;
  tono: ChipVariant;
  total: number;
}

interface RondaDetalle {
  numero: number;
  hora: string;
  items: number;
  total: number;
}

@Component({
  selector: 'app-comandas-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comandas.page.html',
  styleUrl: './comandas.page.css',
})
export class ComandasPage {
  private readonly pedidos = inject(PedidosService);
  private readonly cuentas = inject(CuentasService);
  private readonly pagos = inject(PagosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly moneda = formatearMoneda;
  readonly filtro = signal<FiltroComandas>('todas');
  readonly busqueda = signal('');
  readonly seleccionadaId = signal<number | null>(null);
  readonly ahora = signal(Date.now());
  // Marca de la última carga que terminó OK; el reloj de `ahora` solo mueve
  // los minutos transcurridos y no debe fingir datos frescos.
  private readonly ultimaCarga = signal<number | null>(null);
  // Solo una carga visible puede encender el banner: los refrescos silenciosos
  // no deben parpadear un error transitorio cada 15 s.
  readonly error = signal<string | null>(null);

  constructor() {
    const reloj = window.setInterval(() => this.ahora.set(Date.now()), 30000);
    iniciarRefresco({
      intervaloMs: 15000,
      destroyRef: this.destroyRef,
      alVolverVisible: false,
      tarea: async () => {
        await this.cargar(true);
      },
    });
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.destroyRef.onDestroy(() => {
      window.clearInterval(reloj);
      document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    });
    void this.cargar();
  }

  private readonly alCambiarVisibilidad = (): void => {
    if (document.visibilityState === 'visible') {
      void this.cargar();
    }
  };

  private async cargar(silencioso = false): Promise<boolean> {
    const [kdsOk, cuentasOk, pagosOk] = await Promise.all([
      this.pedidos.cargarKds(),
      this.cuentas.cargar(silencioso),
      this.pagos.cargar(undefined, silencioso),
    ]);
    // El sello de hora solo avanza cuando la carga completa terminó bien (en
    // modo demo las cargas devuelven `false`, pero los mocks son válidos).
    const ok = kdsOk && cuentasOk && pagosOk;
    if (ok || !USE_API) {
      this.ultimaCarga.set(Date.now());
    }
    if (ok) {
      this.error.set(null);
    } else if (!silencioso) {
      this.error.set(
        this.pedidos.error() ?? this.cuentas.error() ?? this.pagos.error(),
      );
    }
    return ok;
  }

  reintentar(): void {
    void this.cargar();
  }

  readonly filas = computed<ComandaFila[]>(() =>
    this.pedidos.activos().map((pedido) => this.fila(pedido)),
  );

  readonly conteos = computed(() => {
    const filas = this.filas();
    return {
      todas: filas.length,
      local: filas.filter((fila) => fila.canalTipo === 'local').length,
      delivery: filas.filter((fila) => fila.canalTipo === 'delivery').length,
      rappi: filas.filter((fila) => fila.canalTipo === 'rappi').length,
      listas: filas.filter((fila) => fila.estado === 'Listo').length,
    };
  });

  readonly visibles = computed<ComandaFila[]>(() => {
    const filtro = this.filtro();
    const texto = this.busqueda().trim().toLowerCase();
    return this.filas().filter((fila) => {
      if (filtro === 'local' && fila.canalTipo !== 'local') {
        return false;
      }
      if (filtro === 'delivery' && fila.canalTipo !== 'delivery') {
        return false;
      }
      if (filtro === 'rappi' && fila.canalTipo !== 'rappi') {
        return false;
      }
      if (filtro === 'listas' && fila.estado !== 'Listo') {
        return false;
      }
      if (!texto) {
        return true;
      }
      return (
        fila.numero.toLowerCase().includes(texto) ||
        fila.destino.toLowerCase().includes(texto) ||
        fila.canal.toLowerCase().includes(texto)
      );
    });
  });

  readonly seleccionada = computed<ComandaFila | null>(() => {
    const id = this.seleccionadaId();
    if (id === null) {
      return null;
    }
    return this.filas().find((fila) => fila.pedidoId === id) ?? null;
  });

  readonly rondasDetalle = computed<RondaDetalle[]>(() => {
    const fila = this.seleccionada();
    if (!fila) {
      return [];
    }
    const pedido = this.pedidos.porId(fila.pedidoId);
    if (!pedido) {
      return [];
    }
    const cuenta = pedido.cuentaId != null ? this.cuentas.porId(pedido.cuentaId) : null;
    if (cuenta) {
      return cuenta.rondas.map((ronda) => ({
        numero: ronda.numero,
        hora: ronda.creadaEn.slice(11, 16),
        items: ronda.items.length,
        total: ronda.total,
      }));
    }
    return [
      {
        numero: 1,
        hora: pedido.fechaPedido.slice(11, 16),
        items: pedido.items.length,
        total: pedido.subtotal,
      },
    ];
  });

  readonly resumen = computed(() => {
    const filas = this.filas();
    const pagos = this.pagos.pagos();
    const cobrado = this.pagos.totalCobrado();
    return {
      abiertas: filas.length,
      enCocina: filas.filter((fila) => fila.estado === 'En cocina' || fila.estado === 'En mesa').length,
      enCamino: filas.filter((fila) => fila.estado === 'En camino').length,
      listas: filas.filter((fila) => fila.estado === 'Listo').length,
      ventas: cobrado,
      ticket: pagos.length === 0 ? 0 : Math.round((cobrado / pagos.length) * 100) / 100,
      porCobrar: this.cuentas.totalAbierto(),
      cuentasPorCobrar: this.cuentas.abiertas().length,
    };
  });

  readonly ventasTexto = computed<string>(() => formatearNumero(this.resumen().ventas));

  readonly subtitulo = computed<string>(() => {
    const listas = this.conteos().listas;
    const sello = this.ultimaCarga();
    const hora = sello === null ? '—' : horaActual(new Date(sello));
    const turno = turnoActual();
    const turnoMayus = `${turno.charAt(0).toUpperCase()}${turno.slice(1)}`;
    return `${turnoMayus} · ${this.conteos().todas} abiertas · ${listas} ${
      listas === 1 ? 'lista' : 'listas'
    } · actualizado ${hora}`;
  });

  cambiarFiltro(filtro: FiltroComandas): void {
    this.filtro.set(filtro);
  }

  onBuscar(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.busqueda.set(input.value);
  }

  seleccionar(pedidoId: number): void {
    this.seleccionadaId.update((actual) => (actual === pedidoId ? null : pedidoId));
  }

  cerrarResumen(): void {
    this.seleccionadaId.set(null);
  }

  esSeleccionada(pedidoId: number): boolean {
    return this.seleccionada()?.pedidoId === pedidoId;
  }

  iconoCanal(canalTipo: CanalTipo): IconName {
    return canalTipo === 'local' ? 'storefront' : 'package';
  }

  private fila(pedido: Pedido): ComandaFila {
    const cuenta = pedido.cuentaId != null ? this.cuentas.porId(pedido.cuentaId) : null;
    const estado = this.estado(pedido);
    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      canal: this.canal(pedido),
      canalTipo: this.canalTipo(pedido),
      destino: this.destino(pedido),
      rondas: cuenta?.rondas.length ?? 1,
      minutos: minutosEntre(pedido.fechaPedido, this.ahora()),
      estado: estado.estado,
      tono: estado.tono,
      total: cuenta?.total ?? pedido.total,
    };
  }

  private estado(pedido: Pedido): { estado: string; tono: ChipVariant } {
    if (pedido.estado === 'servido') {
      return { estado: 'En mesa', tono: 'neutral' };
    }
    const completo =
      pedido.items.length > 0 &&
      pedido.items.every((item) => item.estadoPreparacion === 'listo');
    if (completo) {
      return { estado: 'Listo', tono: 'success' };
    }
    if (pedido.canal === 'rappi' || pedido.canal === 'llamafood') {
      return { estado: 'En camino', tono: 'warning' };
    }
    if (pedido.canal === 'delivery_propio') {
      return { estado: 'En cocina', tono: 'info' };
    }
    if (pedido.canal === 'whatsapp') {
      return { estado: 'Para llevar', tono: 'neutral' };
    }
    return { estado: 'En mesa', tono: 'neutral' };
  }

  private canal(pedido: Pedido): string {
    switch (pedido.canal) {
      case 'local':
        return 'Local';
      case 'whatsapp':
        return 'WhatsApp';
      case 'delivery_propio':
        return 'Delivery';
      case 'rappi':
        return 'Rappi';
      case 'llamafood':
        return 'LlamaFood';
      default:
        return 'Local';
    }
  }

  private canalTipo(pedido: Pedido): CanalTipo {
    if (pedido.canal === 'rappi' || pedido.canal === 'llamafood') {
      return 'rappi';
    }
    if (pedido.canal === 'delivery_propio') {
      return 'delivery';
    }
    return 'local';
  }

  private destino(pedido: Pedido): string {
    if (pedido.mesaId !== null) {
      return `Mesa ${pedido.mesaId}`;
    }
    if (pedido.direccionEntrega) {
      return pedido.direccionEntrega;
    }
    if (pedido.tipoConsumo === 'para_llevar') {
      return 'Para llevar';
    }
    return pedido.canal === 'rappi' || pedido.canal === 'llamafood' ? 'App' : 'Mostrador';
  }
}

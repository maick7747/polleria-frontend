import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PedidosService } from '../../core/data/pedidos.service';
import type { EstadoPedido, Pedido } from '../../core/models';
import { formatearMoneda } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoFiltro = 'todos' | EstadoPedido;
type CanalFiltro = 'todos' | 'local' | 'whatsapp' | 'delivery_propio' | 'rappi' | 'llamafood';

const LIMITES = [10, 20, 50, 100];

const ESTADOS: readonly EstadoFiltro[] = [
  'todos',
  'borrador',
  'en_cocina',
  'servido',
  'cobrado',
  'cancelado',
];

const CANALES: readonly { valor: CanalFiltro; texto: string }[] = [
  { valor: 'todos', texto: 'Todos los canales' },
  { valor: 'local', texto: 'Local' },
  { valor: 'whatsapp', texto: 'WhatsApp' },
  { valor: 'delivery_propio', texto: 'Delivery propio' },
  { valor: 'rappi', texto: 'Rappi' },
  { valor: 'llamafood', texto: 'LlamaFood' },
];

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

@Component({
  selector: 'app-historial-pedidos-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './historial-pedidos.page.html',
  styleUrl: './historial-pedidos.page.css',
})
export class HistorialPedidosPage {
  private readonly pedidos = inject(PedidosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly moneda = formatearMoneda;
  readonly estados = ESTADOS;
  readonly canales = CANALES;

  readonly estado = signal<EstadoFiltro>('todos');
  readonly canal = signal<CanalFiltro>('todos');
  readonly desde = signal<string>(fechaLima(new Date(Date.now() - 6 * 86400000)));
  readonly hasta = signal<string>(fechaLima(new Date()));
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);

  readonly cargando = this.pedidos.cargando;
  readonly error = this.pedidos.error;
  readonly meta = this.pedidos.meta;

  readonly filas = computed<Pedido[]>(() => this.pedidos.pedidos());

  readonly subtitulo = computed(() => {
    const meta = this.meta();
    if (!meta) {
      return 'Pedidos del turno';
    }
    return `${meta.total} pedidos · página ${meta.page} de ${meta.pages || 1}`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    const canal = params.get('canal');
    const desde = params.get('desde');
    const hasta = params.get('hasta');
    const pagina = Number(params.get('page'));
    const limite = Number(params.get('limit'));

    this.estado.set(ESTADOS.includes(estado as EstadoFiltro) ? (estado as EstadoFiltro) : 'todos');
    this.canal.set(
      CANALES.some((item) => item.valor === canal) ? (canal as CanalFiltro) : 'todos',
    );
    this.desde.set(desde ?? fechaLima(new Date(Date.now() - 6 * 86400000)));
    this.hasta.set(hasta ?? fechaLima(new Date()));
    this.pagina.set(Math.max(1, Number.isFinite(pagina) ? pagina : 1));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.cargar();

    this.destroyRef.onDestroy(() => undefined);
  }

  cambiarEstado(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value as EstadoFiltro);
    this.pagina.set(1);
    void this.cargar();
  }

  cambiarCanal(event: Event): void {
    this.canal.set((event.target as HTMLSelectElement).value as CanalFiltro);
    this.pagina.set(1);
    void this.cargar();
  }

  cambiarDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  cambiarHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargar();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargar();
  }

  limpiar(): void {
    this.estado.set('todos');
    this.canal.set('todos');
    this.desde.set(fechaLima(new Date(Date.now() - 6 * 86400000)));
    this.hasta.set(fechaLima(new Date()));
    this.pagina.set(1);
    void this.cargar();
  }

  reintentar(): void {
    void this.cargar();
  }

  estadoTexto(estado: EstadoPedido): string {
    return estado.replace('_', ' ');
  }

  estadoTono(estado: EstadoPedido): ChipVariant {
    switch (estado) {
      case 'cobrado': return 'success';
      case 'servido': return 'warning';
      case 'en_cocina': return 'info';
      case 'cancelado': return 'danger';
      default: return 'neutral';
    }
  }

  canalTexto(canal: string): string {
    return CANALES.find((item) => item.valor === canal)?.texto ?? canal;
  }

  hora(pedido: Pedido): string {
    return new Date(pedido.fechaPedido).toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  mesa(pedido: Pedido): string {
    return pedido.mesaId ? `Mesa ${pedido.mesaId}` : '—';
  }

  private async cargar(): Promise<void> {
    const ok = await this.pedidos.cargar({
      page: this.pagina(),
      limit: this.limite(),
      estado: this.estado() === 'todos' ? undefined : this.estado(),
      canal: this.canal() === 'todos' ? undefined : this.canal(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
    });
    if (ok) {
      const meta = this.pedidos.meta();
      this.pagina.set(meta?.page ?? 1);
      this.limite.set(meta?.limit ?? 20);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        estado: this.estado() === 'todos' ? null : this.estado(),
        canal: this.canal() === 'todos' ? null : this.canal(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
      },
      replaceUrl: true,
    });
  }
}

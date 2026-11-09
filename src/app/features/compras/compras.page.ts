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
  ComprasService,
  type EstadoCompraFiltro,
  type EstadoOrden,
  type EstadoSugerencia,
  type OrdenCompra,
} from '../../core/data/compras.service';
import { formatearMoneda, formatearNumero } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type TabCompras = 'sugerencia' | 'ordenes' | 'entradas';

type EstadoFiltro = 'todas' | EstadoCompraFiltro;

const ESTADOS: readonly { valor: EstadoFiltro; texto: string }[] = [
  { valor: 'todas', texto: 'Todos los estados' },
  { valor: 'ordenada', texto: 'Ordenada' },
  { valor: 'recibida', texto: 'Recibida' },
  { valor: 'cancelada', texto: 'Cancelada' },
];

const LIMITES = [10, 20, 50, 100];

@Component({
  selector: 'app-compras-page',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compras.page.html',
  styleUrl: './compras.page.css',
})
export class ComprasPage {
  private readonly compras = inject(ComprasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private temporizador: number | null = null;
  private buscarTimer: number | null = null;

  readonly tab = signal<TabCompras>('sugerencia');
  readonly busqueda = signal<string>('');
  readonly estadoFiltro = signal<EstadoFiltro>('todas');
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly proveedorFiltro = signal<string>('todos');
  readonly proveedorOrden = signal<string>('');
  readonly toast = signal<string>('');

  readonly estados = ESTADOS;
  readonly usaApi = this.compras.usaApi;

  readonly sugerencias = this.compras.sugerencias;
  readonly ordenes = this.compras.ordenes;
  readonly entradas = this.compras.entradas;
  readonly conteos = this.compras.conteos;
  readonly subtotal = this.compras.subtotal;
  readonly igv = this.compras.igv;
  readonly total = this.compras.total;
  readonly ordenActiva = this.compras.ordenActiva;
  readonly meta = this.compras.meta;
  readonly cargando = this.compras.cargando;
  readonly error = this.compras.error;
  readonly proveedoresApi = this.compras.proveedoresLista;

  readonly moneda = formatearMoneda;
  readonly numero = formatearNumero;

  readonly proveedoresSugerencia = computed<string[]>(() => {
    const lista: string[] = [];
    for (const sugerencia of this.sugerencias()) {
      if (sugerencia.proveedor && !lista.includes(sugerencia.proveedor)) {
        lista.push(sugerencia.proveedor);
      }
    }
    return lista;
  });

  readonly filasSugerencia = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const proveedor = this.proveedorFiltro();
    return this.sugerencias().filter((sugerencia) => {
      const coincideProveedor = proveedor === 'todos' || sugerencia.proveedor === proveedor;
      const coincideTexto =
        !termino ||
        sugerencia.nombre.toLowerCase().includes(termino) ||
        sugerencia.proveedor.toLowerCase().includes(termino);
      return coincideProveedor && coincideTexto;
    });
  });

  readonly filasOrdenes = computed<OrdenCompra[]>(() => this.ordenes());

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const tab = params.get('tab');
    this.tab.set(tab === 'ordenes' || tab === 'entradas' ? tab : 'sugerencia');

    const estado = params.get('estado');
    this.estadoFiltro.set(
      estado === 'ordenada' || estado === 'recibida' || estado === 'cancelada' ? estado : 'todas',
    );
    this.busqueda.set(params.get('q') ?? '');
    this.desde.set(params.get('desde') ?? '');
    this.hasta.set(params.get('hasta') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

  cambiarTab(tab: TabCompras): void {
    if (this.tab() === tab) {
      return;
    }
    this.tab.set(tab);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    this.buscarTimer = window.setTimeout(() => {
      this.pagina.set(1);
      void this.cargarLista();
    }, 350);
  }

  onProveedor(event: Event): void {
    this.proveedorFiltro.set((event.target as HTMLSelectElement).value);
  }

  onProveedorOrden(event: Event): void {
    this.proveedorOrden.set((event.target as HTMLSelectElement).value);
  }

  cambiarEstado(event: Event): void {
    this.estadoFiltro.set((event.target as HTMLSelectElement).value as EstadoFiltro);
    this.pagina.set(1);
    void this.cargarLista();
  }

  cambiarDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  cambiarHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargarLista();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargarLista();
  }

  recargar(): void {
    void this.inicializar();
  }

  alternar(id: number): void {
    this.compras.alternarSugerencia(id);
  }

  async generarOrden(): Promise<void> {
    const creadas = await this.compras.crearOrden({
      proveedorId: this.proveedorOrdenId(),
    });
    const avisos = this.compras.avisos();

    if (creadas.length === 0) {
      this.mostrarToast(
        avisos[0] ?? this.compras.error() ?? 'Selecciona al menos un insumo con proveedor.',
      );
      return;
    }

    this.tab.set('ordenes');
    this.estadoFiltro.set('todas');
    this.pagina.set(1);
    await this.cargarLista();
    this.mostrarToast(
      avisos.length > 0
        ? `${creadas.length} orden(es) creada(s) · ${avisos.join(' ')}`
        : `${creadas.length} orden(es) de compra creada(s)`,
    );
  }

  async recibir(orden: OrdenCompra): Promise<void> {
    const ok = await this.compras.recibir(orden.id);
    this.mostrarToast(
      ok ? `Compra ${orden.codigo} recibida` : (this.compras.error() ?? 'No se pudo recibir'),
    );
  }

  async cancelar(orden: OrdenCompra): Promise<void> {
    const motivo = window.prompt(`Motivo para cancelar ${orden.codigo}`, '');
    if (motivo === null) {
      return;
    }
    const ok = await this.compras.cancelar(orden.id, motivo.trim() || undefined);
    this.mostrarToast(
      ok ? `Compra ${orden.codigo} cancelada` : (this.compras.error() ?? 'No se pudo cancelar'),
    );
  }

  cantidad(valor: number, unidad: string): string {
    const redondeado = Math.round(valor * 10) / 10;
    const texto = Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
    return `${texto} ${unidad}`;
  }

  monto(valor: number): string {
    return valor.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  textoEstado(estado: EstadoSugerencia): string {
    if (estado === 'critico') {
      return 'Crítico';
    }
    if (estado === 'bajo') {
      return 'Bajo';
    }
    return 'OK';
  }

  tonoEstado(estado: EstadoSugerencia): ChipVariant {
    if (estado === 'critico') {
      return 'danger';
    }
    if (estado === 'bajo') {
      return 'warning';
    }
    return 'neutral';
  }

  textoOrden(estado: EstadoOrden): string {
    if (estado === 'enviada') {
      return 'Enviada';
    }
    if (estado === 'recibida') {
      return 'Recibida';
    }
    if (estado === 'cancelada') {
      return 'Cancelada';
    }
    return 'Borrador';
  }

  tonoOrden(estado: EstadoOrden): ChipVariant {
    if (estado === 'enviada') {
      return 'info';
    }
    if (estado === 'recibida') {
      return 'success';
    }
    if (estado === 'cancelada') {
      return 'danger';
    }
    return 'warning';
  }

  private async inicializar(): Promise<void> {
    await Promise.all([
      this.compras.cargarSugerencias(),
      this.compras.cargarProveedores(),
      this.compras.contarEntradas(),
    ]);
    await this.cargarLista();
  }

  private async cargarLista(): Promise<void> {
    const filtro = this.estadoFiltro();
    const estado: EstadoCompraFiltro | undefined =
      this.tab() === 'entradas' ? 'recibida' : filtro === 'todas' ? undefined : filtro;

    const ok = await this.compras.cargarOrdenes({
      page: this.pagina(),
      limit: this.limite(),
      estado,
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      q: this.busqueda(),
      sort: 'fecha:desc',
    });
    if (ok) {
      this.pagina.set(this.compras.meta().page);
      this.limite.set(this.compras.meta().limit);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.tab() !== 'sugerencia' ? this.tab() : null,
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        estado: this.estadoFiltro() === 'todas' ? null : this.estadoFiltro(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
      },
      replaceUrl: true,
    });
  }

  private proveedorOrdenId(): number | undefined {
    const valor = Number(this.proveedorOrden());
    return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  }

  private mostrarToast(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => {
      this.toast.set('');
      this.temporizador = null;
    }, 2600);
  }
}

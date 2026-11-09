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
import {
  DevolucionesService,
  type DevolucionesQuery,
} from '../../core/data/devoluciones.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import { PedidosService } from '../../core/data/pedidos.service';
import type {
  Devolucion,
  EstadoDevolucion,
  Pedido,
  ResolucionDevolucion,
} from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
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

type EstadoFiltro = 'todos' | EstadoDevolucion;

const ESTADOS: readonly { id: EstadoFiltro; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aceptada', label: 'Resueltas' },
  { id: 'rechazada', label: 'Rechazadas' },
];

const LIMITES = [10, 20, 50, 100];

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

function esEstadoFiltro(valor: string | null): valor is Exclude<EstadoFiltro, 'todos'> {
  return valor === 'pendiente' || valor === 'aceptada' || valor === 'rechazada';
}

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
    PaginadorComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './devoluciones.page.html',
  styleUrl: './devoluciones.page.css',
})
export class DevolucionesPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly pedidos = inject(PedidosService);
  private readonly devoluciones = inject(DevolucionesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly motivos = MOTIVOS;
  readonly soluciones = SOLUCIONES;
  readonly estados = ESTADOS;
  readonly moneda = formatearMoneda;

  readonly pedidoId = signal<number>(this.pedidos.pedidos()[0]?.id ?? 0);
  readonly motivo = signal<string>('Plato frío');
  readonly solucion = signal<ResolucionDevolucion>('re_preparar');
  readonly montoParcial = signal<string>('24.00');

  readonly estadoFiltro = signal<EstadoFiltro>('todos');
  readonly busqueda = signal<string>('');
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly guardando = signal<boolean>(false);

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly meta = this.devoluciones.meta;
  readonly cargando = this.devoluciones.cargando;
  readonly error = this.devoluciones.error;

  readonly pedidosDisponibles = computed<Pedido[]>(() =>
    this.pedidos.pedidos().filter((pedido) => pedido.estado !== 'cancelado'),
  );

  readonly pedido = computed<Pedido | null>(
    () => this.pedidos.porId(this.pedidoId()) ?? null,
  );

  readonly total = computed<number>(() => this.pedido()?.total ?? 0);
  readonly devolucionesTurno = this.devoluciones.devoluciones;
  readonly pendientes = this.devoluciones.pendientes;

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
    if (this.guardando() || !this.pedido()) {
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
    String(14 + this.meta().total).padStart(3, '0'),
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

  readonly recientesMeta = computed<string>(
    () =>
      `${this.meta().total} registros · ${this.pendientes().length} pendiente${this.pendientes().length === 1 ? '' : 's'}`,
  );

  private toastTimer: number | null = null;
  private navTimer: number | null = null;
  private buscarTimer: number | null = null;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    this.estadoFiltro.set(esEstadoFiltro(estado) ? estado : 'todos');
    this.busqueda.set(params.get('q') ?? '');
    this.desde.set(params.get('desde') ?? '');
    this.hasta.set(params.get('hasta') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    iniciarRefresco({
      intervaloMs: 30000,
      destroyRef: this.destroyRef,
      tarea: () => this.refrescarSilencioso(),
    });

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

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

  onEstado(event: Event): void {
    const valor = (event.target as HTMLSelectElement).value;
    this.estadoFiltro.set(esEstadoFiltro(valor) ? valor : 'todos');
    this.pagina.set(1);
    void this.cargarLista();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
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

  async confirmar(): Promise<void> {
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

    this.guardando.set(true);
    const devolucion = await this.devoluciones.registrar({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      motivo: this.motivo(),
      detalle: `El cliente reporta "${this.motivo().toLowerCase()}" en el pedido ${pedido.numero}.`,
    });
    if (!devolucion) {
      this.guardando.set(false);
      this.avisar(
        this.devoluciones.error() ?? 'No se pudo registrar la devolución.',
        true,
      );
      return;
    }

    if (this.esReembolso()) {
      this.guardando.set(false);
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

    const ok = await this.devoluciones.resolver(devolucion.id, this.solucion());
    this.guardando.set(false);
    if (!ok) {
      this.avisar(
        this.devoluciones.error() ?? 'No se pudo resolver la devolución.',
        true,
      );
      return;
    }
    this.sincronizarMeta();
    this.avisar(`Devolución registrada · ${this.tituloSolucion()}`);
    this.navTimer = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 1500);
  }

  reembolsarFila(devolucion: Devolucion): void {
    void this.router.navigate(['/devoluciones/reembolso'], {
      queryParams: {
        devolucionId: devolucion.id,
        monto: devolucion.montoReembolsado || 0,
        pedido: devolucion.pedidoNumero,
        motivo: devolucion.motivo,
        tipo: devolucion.resolucion ?? 'reembolso_total',
      },
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

  private async inicializar(): Promise<void> {
    if (this.pedidos.pedidos().length === 0) {
      await this.pedidos.cargar({ limit: 100 });
    }
    await this.cargarLista();
    this.elegirPrimerPedido();
  }

  private elegirPrimerPedido(): void {
    if (this.pedidoId() > 0) {
      return;
    }
    const primero = this.pedidosDisponibles()[0];
    if (primero) {
      this.pedidoId.set(primero.id);
    }
  }

  private async cargarLista(): Promise<void> {
    const ok = await this.devoluciones.cargar(this.consultaLista());
    if (ok) {
      this.sincronizarMeta();
    }
  }

  private consultaLista(): DevolucionesQuery {
    return {
      page: this.pagina(),
      limit: this.limite(),
      estado: this.estadoFiltro() === 'todos' ? undefined : this.estadoFiltro(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      q: this.busqueda(),
      sort: 'fecha_reporte:desc',
    };
  }

  /**
   * Refresco silencioso de la lista con la misma página, filtros y búsqueda,
   * sin tocar el formulario de devolución ni la URL.
   */
  private async refrescarSilencioso(): Promise<void> {
    await this.devoluciones.cargar(this.consultaLista(), true);
  }

  private sincronizarMeta(): void {
    const meta = this.meta();
    this.pagina.set(meta.page);
    this.limite.set(meta.limit);
    this.sincronizarUrl();
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        estado: this.estadoFiltro() === 'todos' ? null : this.estadoFiltro(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
      },
      replaceUrl: true,
    });
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

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 2800);
  }
}

import { crearGuardiaUrl } from '../../core/utils/url-sync';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DeliveryExternoVista } from '../../core/api/api.mappers';
import { USE_API } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import {
  COMISION_PLATAFORMA,
  DeliveryService,
  type DeliveryExternoQuery,
  type LiquidacionesQuery,
  type PlataformaExterna,
} from '../../core/data/delivery.service';
import type { PedidoDetalle } from '../../core/models';
import { formatearMoneda, hora, round2 } from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SelectorPlatosComponent } from '../../shared/components/selector-platos/selector-platos';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type VistaExterno = 'pedidos' | 'liquidaciones';
type PlataformaFiltro = 'todas' | PlataformaExterna;

const LIMITES = [10, 20, 50, 100];

const ESTADOS: readonly { valor: string; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'borrador', texto: 'Borrador' },
  { valor: 'en_cocina', texto: 'En cocina' },
  { valor: 'servido', texto: 'Servido' },
  { valor: 'cobrado', texto: 'Cobrado' },
  { valor: 'cancelado', texto: 'Cancelado' },
];

const PLATAFORMAS: readonly { valor: PlataformaFiltro; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
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

const HOY = fechaLima(new Date());
const HACE_SIETE = fechaLima(new Date(Date.now() - 6 * 86400000));
const DESDE_INICIAL = USE_API ? HACE_SIETE : '';
const HASTA_INICIAL = USE_API ? HOY : '';
const FECHA_LIQUIDACION = HOY;
// Misma regla que el backend (`igv_pct` / `igv_min_soles`): el preview es
// estimado y la autoridad es el total que devuelve la API al crear el pedido.
const IGV_PCT = 18;
const IGV_MIN = 70;

@Component({
  selector: 'app-delivery-externo-page',
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
    SelectorPlatosComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-externo.page.html',
  styleUrl: './delivery-externo.page.css',
})
export class DeliveryExternoPage {
  private readonly delivery = inject(DeliveryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/delivery-externo');

  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly estados = ESTADOS;
  readonly plataformas = PLATAFORMAS;
  readonly comisiones = COMISION_PLATAFORMA;
  // El menú exige `menu.gestionar`, `venta.registrar` o `cocina.kds`; Admin
  // (solo lectura) no puede armar pedidos, así que se oculta el alta.
  readonly puedeCrearPedidos = this.auth.hasPermission('venta.registrar');

  readonly vista = signal<VistaExterno>('pedidos');
  readonly plataforma = signal<PlataformaFiltro>('todas');
  readonly estado = signal<string>('todos');
  readonly desde = signal<string>(DESDE_INICIAL);
  readonly hasta = signal<string>(HASTA_INICIAL);
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly seleccionId = signal<number | null>(null);

  readonly mostrarAlta = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly altaPlataforma = signal<PlataformaExterna>('rappi');
  readonly altaCliente = signal<string>('');
  readonly altaDireccion = signal<string>('');
  readonly altaReferencia = signal<string>('');
  readonly altaObservaciones = signal<string>('');
  readonly items = signal<PedidoDetalle[]>([]);

  readonly liqPagina = signal<number>(1);
  readonly liqLimite = signal<number>(20);
  readonly liqPlataforma = signal<PlataformaExterna>('rappi');
  readonly liqFecha = signal<string>(FECHA_LIQUIDACION);
  readonly liqMonto = signal<string>('');
  readonly liquidando = signal<boolean>(false);

  readonly accionando = signal<boolean>(false);

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly lista = this.delivery.externos;
  readonly meta = this.delivery.externosMeta;
  readonly cargando = this.delivery.externosCargando;
  readonly error = this.delivery.externosError;

  readonly liquidaciones = this.delivery.liquidaciones;
  readonly liquidacionesMeta = this.delivery.liquidacionesMeta;
  readonly liquidacionesCargando = this.delivery.liquidacionesCargando;
  readonly liquidacionesError = this.delivery.liquidacionesError;

  readonly puedeCancelar = computed<boolean>(() => {
    const pedido = this.seleccionado();
    return (
      pedido !== null &&
      pedido.estado !== 'cancelado' &&
      pedido.estado !== 'cobrado' &&
      pedido.estadoPago !== 'pagado'
    );
  });

  readonly seleccionado = computed<DeliveryExternoVista | null>(() => {
    const id = this.seleccionId();
    const lista = this.lista();
    return lista.find((pedido) => pedido.id === id) ?? lista[0] ?? null;
  });

  readonly subtitulo = computed<string>(() => {
    if (this.vista() === 'liquidaciones') {
      const meta = this.liquidacionesMeta();
      return `Liquidaciones · ${meta.total} registros · página ${meta.page} de ${meta.pages || 1}`;
    }
    const meta = this.meta();
    return `${meta.total} pedidos externos · página ${meta.page} de ${meta.pages || 1}`;
  });

  readonly puedeCrear = computed<boolean>(() => {
    const nombre = this.altaCliente().trim();
    return (
      nombre.length > 1 &&
      this.altaDireccion().trim().length > 3 &&
      this.items().length > 0 &&
      !this.guardando()
    );
  });

  readonly totalUnidades = computed<number>(() =>
    this.items().reduce((suma, item) => suma + item.cantidad, 0),
  );

  readonly subtotalItems = computed<number>(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly igvEstimado = computed<number>(() =>
    this.subtotalItems() >= IGV_MIN && this.subtotalItems() > 0
      ? round2((this.subtotalItems() * IGV_PCT) / 100)
      : 0,
  );

  readonly totalEstimado = computed<number>(() =>
    round2(this.subtotalItems() + this.igvEstimado()),
  );

  readonly comisionAlta = computed<number>(() =>
    round2((this.totalEstimado() * COMISION_PLATAFORMA[this.altaPlataforma()]) / 100),
  );

  readonly netoAlta = computed<number>(() =>
    round2(this.totalEstimado() - this.comisionAlta()),
  );

  readonly comisionActual = computed<number>(() =>
    this.liqPlataforma() === 'rappi'
      ? COMISION_PLATAFORMA.rappi
      : COMISION_PLATAFORMA.llamafood,
  );

  readonly comisionEstimada = computed<number>(() => {
    const bruto = Number(this.liqMonto());
    if (!Number.isFinite(bruto) || bruto <= 0) {
      return 0;
    }
    return round2((bruto * this.comisionActual()) / 100);
  });

  readonly netoLiquidacion = computed<number>(() => {
    const bruto = Number(this.liqMonto());
    if (!Number.isFinite(bruto) || bruto <= 0) {
      return 0;
    }
    return round2(bruto - this.comisionEstimada());
  });

  readonly totalLiquidado = computed<number>(() =>
    round2(this.liquidaciones().reduce((suma, fila) => suma + fila.montoNeto, 0)),
  );

  readonly puedeLiquidar = computed<boolean>(() => {
    const bruto = Number(this.liqMonto());
    return Number.isFinite(bruto) && bruto > 0 && !this.liquidando();
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.vista.set(params.get('vista') === 'liquidaciones' ? 'liquidaciones' : 'pedidos');
    const plataforma = params.get('plataforma');
    this.plataforma.set(
      PLATAFORMAS.some((item) => item.valor === plataforma)
        ? (plataforma as PlataformaFiltro)
        : 'todas',
    );
    const estado = params.get('estado');
    this.estado.set(ESTADOS.some((item) => item.valor === estado) ? (estado as string) : 'todos');
    this.desde.set(params.get('desde') ?? DESDE_INICIAL);
    this.hasta.set(params.get('hasta') ?? HASTA_INICIAL);
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);
    const seleccion = Number(params.get('pedido'));
    if (Number.isFinite(seleccion) && seleccion > 0) {
      this.seleccionId.set(seleccion);
    }

    if (this.vista() === 'liquidaciones') {
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }

    iniciarRefresco({
      intervaloMs: 25000,
      destroyRef: this.destroyRef,
      tarea: () => this.refrescarSilencioso(),
    });

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  cambiarVista(vista: VistaExterno): void {
    if (this.vista() === vista) {
      return;
    }
    this.vista.set(vista);
    this.mostrarAlta.set(false);
    if (vista === 'liquidaciones') {
      this.liqPagina.set(1);
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }
    this.sincronizarUrl();
  }

  onPlataforma(event: Event): void {
    this.plataforma.set((event.target as HTMLSelectElement).value as PlataformaFiltro);
    this.pagina.set(1);
    this.liqPagina.set(1);
    if (this.vista() === 'liquidaciones') {
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }
  }

  onEstado(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    this.liqPagina.set(1);
    if (this.vista() === 'liquidaciones') {
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    this.liqPagina.set(1);
    if (this.vista() === 'liquidaciones') {
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }
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

  cambiarLiqPagina(page: number): void {
    this.liqPagina.set(page);
    void this.cargarLiquidaciones();
  }

  cambiarLiqLimite(limit: number): void {
    this.liqLimite.set(limit);
    this.liqPagina.set(1);
    void this.cargarLiquidaciones();
  }

  seleccionar(id: number): void {
    this.seleccionId.set(id);
    this.sincronizarUrl();
  }

  reintentar(): void {
    if (this.vista() === 'liquidaciones') {
      void this.cargarLiquidaciones();
    } else {
      void this.cargar();
    }
  }

  abrirAlta(): void {
    this.mostrarAlta.set(true);
    this.limpiarAlta();
  }

  cerrarAlta(): void {
    this.mostrarAlta.set(false);
  }

  onAltaPlataforma(event: Event): void {
    this.altaPlataforma.set(
      (event.target as HTMLSelectElement).value as PlataformaExterna,
    );
  }

  onAltaCliente(event: Event): void {
    this.altaCliente.set((event.target as HTMLInputElement).value);
  }

  onAltaDireccion(event: Event): void {
    this.altaDireccion.set((event.target as HTMLInputElement).value);
  }

  onAltaReferencia(event: Event): void {
    this.altaReferencia.set((event.target as HTMLInputElement).value);
  }

  onAltaObservaciones(event: Event): void {
    this.altaObservaciones.set((event.target as HTMLTextAreaElement).value);
  }

  async crearPedido(): Promise<void> {
    if (!this.puedeCrear()) {
      this.avisar(
        'Completa el cliente, la dirección y al menos un plato del pedido.',
        true,
      );
      return;
    }

    this.guardando.set(true);
    const creado = await this.delivery.crearExterno({
      plataforma: this.altaPlataforma(),
      clienteNombre: this.altaCliente().trim(),
      direccionEntrega: this.altaDireccion().trim(),
      referenciaEntrega: this.altaReferencia().trim() || undefined,
      observaciones: this.altaObservaciones().trim() || undefined,
      items: this.items(),
    });
    this.guardando.set(false);

    if (!creado) {
      this.avisar(this.error() ?? 'No se pudo crear el pedido.', true);
      return;
    }

    this.mostrarAlta.set(false);
    this.items.set([]);
    this.seleccionId.set(creado.id);
    this.avisar(`${creado.numero} creado en borrador · acéptalo para enviarlo a cocina`);
    await this.cargar();
  }

  onLiqPlataforma(event: Event): void {
    this.liqPlataforma.set((event.target as HTMLSelectElement).value as PlataformaExterna);
  }

  onLiqFecha(event: Event): void {
    this.liqFecha.set((event.target as HTMLInputElement).value);
  }

  onLiqMonto(event: Event): void {
    this.liqMonto.set((event.target as HTMLInputElement).value);
  }

  async aceptar(): Promise<void> {
    const pedido = this.seleccionado();
    if (!pedido || this.accionando()) {
      return;
    }
    this.accionando.set(true);
    const ok = await this.delivery.aceptarExterno(pedido.id);
    this.accionando.set(false);
    this.avisar(
      ok ? `${pedido.numero} aceptado · enviado a cocina` : this.error() ?? 'No se pudo aceptar.',
      !ok,
    );
    if (ok) {
      await this.cargar();
    }
  }

  async registrarLiquidacion(): Promise<void> {
    if (!this.puedeLiquidar()) {
      this.avisar('Ingresa un monto bruto mayor a cero.', true);
      return;
    }
    this.liquidando.set(true);
    const ok = await this.delivery.crearLiquidacion(
      this.liqPlataforma(),
      this.liqFecha() || HOY,
      Number(this.liqMonto()),
    );
    this.liquidando.set(false);
    if (!ok) {
      this.avisar(this.liquidacionesError() ?? 'No se pudo registrar la liquidación.', true);
      return;
    }
    this.liqMonto.set('');
    this.avisar('Liquidación registrada');
    this.liqPagina.set(1);
    await this.cargarLiquidaciones();
  }

  estadoTexto(estado: string): string {
    return ESTADOS.find((item) => item.valor === estado)?.texto ?? estado.replace('_', ' ');
  }

  estadoTono(estado: string): ChipVariant {
    switch (estado) {
      case 'cobrado':
        return 'success';
      case 'servido':
        return 'warning';
      case 'en_cocina':
        return 'info';
      case 'cancelado':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  plataformaTexto(plataforma: string): string {
    return plataforma === 'llamafood' ? 'LlamaFood' : 'Rappi';
  }

  horaPedido(pedido: DeliveryExternoVista): string {
    return hora(pedido.fecha);
  }

  private async cargar(): Promise<void> {
    const ok = await this.delivery.cargarExternos(this.consultaExternos());
    if (ok) {
      const meta = this.meta();
      this.pagina.set(meta.page);
      this.limite.set(meta.limit);
      const seleccion = this.seleccionado();
      this.seleccionId.set(seleccion ? seleccion.id : null);
      this.sincronizarUrl();
    }
  }

  private consultaExternos(): DeliveryExternoQuery {
    return {
      page: this.pagina(),
      limit: this.limite(),
      plataforma: this.plataforma() === 'todas' ? undefined : this.plataforma(),
      estado: this.estado() === 'todos' ? undefined : this.estado(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
    };
  }

  private async cargarLiquidaciones(): Promise<void> {
    const ok = await this.delivery.cargarLiquidaciones(this.consultaLiquidaciones());
    if (ok) {
      const meta = this.liquidacionesMeta();
      this.liqPagina.set(meta.page);
      this.liqLimite.set(meta.limit);
      this.sincronizarUrl();
    }
  }

  private consultaLiquidaciones(): LiquidacionesQuery {
    return {
      page: this.liqPagina(),
      limit: this.liqLimite(),
      plataforma: this.plataforma() === 'todas' ? undefined : this.plataforma(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
    };
  }

  /**
   * Refresco silencioso de la vista activa (pedidos o liquidaciones) con la
   * misma página y filtros, sin tocar la selección ni el formulario.
   */
  private async refrescarSilencioso(): Promise<void> {
    if (this.vista() === 'liquidaciones') {
      await this.delivery.cargarLiquidaciones(this.consultaLiquidaciones(), true);
    } else {
      await this.delivery.cargarExternos(this.consultaExternos(), true);
    }
  }

  private sincronizarUrl(): void {
    if (!this.urlActiva()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        vista: this.vista(),
        plataforma: this.plataforma() === 'todas' ? null : this.plataforma(),
        estado: this.estado() === 'todos' ? null : this.estado(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        pedido: this.vista() === 'pedidos' ? this.seleccionId() : null,
      },
      replaceUrl: true,
    });
  }

  private limpiarAlta(): void {
    this.altaPlataforma.set('rappi');
    this.altaCliente.set('');
    this.altaDireccion.set('');
    this.altaReferencia.set('');
    this.altaObservaciones.set('');
    this.items.set([]);
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

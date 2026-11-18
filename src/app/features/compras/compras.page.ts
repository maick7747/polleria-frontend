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
import type { ProveedorDto } from '../../core/api/api.types';
import {
  ComprasService,
  type EstadoCompraFiltro,
  type EstadoOrden,
  type EstadoSugerencia,
  type OrdenCompra,
} from '../../core/data/compras.service';
import { InventarioService } from '../../core/data/inventario.service';
import type { Insumo } from '../../core/models';
import {
  formatearMoneda,
  formatearNumero,
  round2,
  round3,
  turnoActual,
} from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { ImageUploadComponent } from '../../shared/components/image-upload/image-upload';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type TabCompras = 'sugerencia' | 'ordenes' | 'entradas' | 'manual';

type EstadoFiltro = 'todas' | EstadoCompraFiltro;

interface LineaCompraManual {
  insumoId: number;
  nombre: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

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
    ImageUploadComponent,
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compras.page.html',
  styleUrl: './compras.page.css',
})
export class ComprasPage {
  private readonly compras = inject(ComprasService);
  private readonly inventario = inject(InventarioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/compras');
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

  // Compra manual
  readonly busquedaInsumo = signal<string>('');
  readonly insumoSeleccionado = signal<Insumo | null>(null);
  readonly cantidadManual = signal<string>('1');
  readonly precioManual = signal<string>('');
  readonly proveedorManual = signal<string>('');
  readonly lineasManuales = signal<LineaCompraManual[]>([]);
  readonly guardandoManual = signal<boolean>(false);
  readonly cargandoInsumos = signal<boolean>(false);
  readonly errorInsumos = this.inventario.error;

  readonly estados = ESTADOS;
  readonly usaApi = this.compras.usaApi;
  readonly turno = turnoActual();

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

  /** Insumos activos del inventario filtrados por nombre o código. */
  readonly insumosDisponibles = computed<Insumo[]>(() => {
    const termino = this.busquedaInsumo().trim().toLowerCase();
    return this.inventario
      .insumos()
      .filter((insumo) => insumo.activo)
      .filter(
        (insumo) =>
          !termino ||
          insumo.nombre.toLowerCase().includes(termino) ||
          insumo.codigo.toLowerCase().includes(termino),
      );
  });

  readonly unidadSeleccionada = computed<string>(
    () => this.insumoSeleccionado()?.unidadMedida ?? '',
  );

  /** Proveedor elegido en la compra manual (logo + cambio de imagen). */
  readonly proveedorManualSeleccionado = computed<ProveedorDto | null>(() => {
    const id = this.proveedorManualId();
    return id === null
      ? null
      : (this.proveedoresApi().find((proveedor) => proveedor.id === id) ?? null);
  });

  /** Proveedor de la orden: el elegido en el selector o el de la orden activa. */
  readonly proveedorOrdenSeleccionado = computed<ProveedorDto | null>(() => {
    const id = this.proveedorOrdenId() ?? this.ordenActiva()?.proveedorId ?? null;
    return id === null
      ? null
      : (this.proveedoresApi().find((proveedor) => proveedor.id === id) ?? null);
  });

  readonly subtotalManual = computed<number>(() =>
    round2(this.lineasManuales().reduce((suma, linea) => suma + linea.subtotal, 0)),
  );

  // Misma regla que el backend: 18 % solo si el subtotal alcanza el mínimo (S/ 70).
  readonly igvManual = computed<number>(() =>
    this.subtotalManual() >= 70 && this.subtotalManual() > 0
      ? round2(this.subtotalManual() * 0.18)
      : 0,
  );

  readonly totalManual = computed<number>(() => round2(this.subtotalManual() + this.igvManual()));

  /**
   * Cobertura mínima de los insumos sugeridos: mínimo de
   * `stock / (consumo / 7)`. `null` si no hay consumo conocido.
   */
  readonly coberturaSugerencia = computed<number | null>(() => {
    const consumo = this.inventario.consumo();
    let minima: number | null = null;
    for (const fila of this.filasSugerencia()) {
      const total = consumo.get(fila.insumoId) ?? 0;
      if (total <= 0) {
        continue;
      }
      const dias = fila.stock / (total / 7);
      if (minima === null || dias < minima) {
        minima = dias;
      }
    }
    return minima === null ? null : Math.round(minima * 10) / 10;
  });

  /** Aviso con los nombres reales de la sugerencia (máx. 2). */
  readonly alertaSugerencia = computed<string>(() => {
    const nombres = this.filasSugerencia()
      .filter((fila) => fila.estado !== 'ok')
      .slice(0, 2)
      .map((fila) => fila.nombre);
    if (nombres.length === 0) {
      return 'Sin insumos bajo mínimo';
    }
    const verbo = nombres.length === 1 ? 'queda' : 'quedan';
    return `${nombres.join(' y ')} ${verbo} bajo mínimo si no entra la orden hoy.`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const tab = params.get('tab');
    this.tab.set(
      tab === 'ordenes' || tab === 'entradas' || tab === 'manual' ? tab : 'sugerencia',
    );

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
    if (this.tab() === 'manual') {
      void this.cargarInsumosManuales();
    }

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
    if (tab === 'manual') {
      this.sincronizarUrl();
      void this.cargarInsumosManuales();
      return;
    }
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

  onBuscarInsumo(event: Event): void {
    this.busquedaInsumo.set((event.target as HTMLInputElement).value);
  }

  onProveedorManual(event: Event): void {
    this.proveedorManual.set((event.target as HTMLSelectElement).value);
  }

  onCantidadManual(event: Event): void {
    this.cantidadManual.set((event.target as HTMLInputElement).value);
  }

  onPrecioManual(event: Event): void {
    this.precioManual.set((event.target as HTMLInputElement).value);
  }

  elegirInsumo(insumo: Insumo): void {
    this.insumoSeleccionado.set(insumo);
    this.cantidadManual.set('1');
    this.precioManual.set(insumo.costoPromedio.toFixed(2));
  }

  agregarLineaManual(): void {
    const insumo = this.insumoSeleccionado();
    if (!insumo) {
      this.mostrarToast('Selecciona un insumo de la lista');
      return;
    }

    const cantidad = this.numeroDesde(this.cantidadManual());
    const precio = this.numeroDesde(this.precioManual());

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      this.mostrarToast('La cantidad debe ser mayor a 0');
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      this.mostrarToast('El precio unitario no puede ser negativo');
      return;
    }

    const existente = this.lineasManuales().find((linea) => linea.insumoId === insumo.id);
    if (existente) {
      const acumulada = round3(existente.cantidad + cantidad);
      this.lineasManuales.update((lineas) =>
        lineas.map((linea) =>
          linea.insumoId === insumo.id
            ? {
                ...linea,
                cantidad: acumulada,
                subtotal: round2(acumulada * linea.precioUnitario),
              }
            : linea,
        ),
      );
    } else {
      this.lineasManuales.update((lineas) => [
        ...lineas,
        {
          insumoId: insumo.id,
          nombre: insumo.nombre,
          unidad: insumo.unidadMedida,
          cantidad: round3(cantidad),
          precioUnitario: round2(precio),
          subtotal: round2(cantidad * precio),
        },
      ]);
    }

    this.insumoSeleccionado.set(null);
    this.cantidadManual.set('1');
    this.precioManual.set('');
  }

  quitarLineaManual(insumoId: number): void {
    this.lineasManuales.update((lineas) =>
      lineas.filter((linea) => linea.insumoId !== insumoId),
    );
  }

  async generarOrdenManual(): Promise<void> {
    if (this.guardandoManual()) {
      return;
    }

    const proveedorId = this.proveedorManualId();
    if (proveedorId === null) {
      this.mostrarToast('Selecciona un proveedor para la orden');
      return;
    }

    const lineas = this.lineasManuales();
    if (lineas.length === 0) {
      this.mostrarToast('Agrega al menos un insumo a la orden');
      return;
    }

    this.guardandoManual.set(true);
    try {
      const orden = await this.compras.crearOrdenManual({
        proveedorId,
        items: lineas.map((linea) => ({
          insumoId: linea.insumoId,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
        })),
      });

      if (!orden) {
        this.mostrarToast(this.compras.error() ?? 'No se pudo generar la orden de compra');
        return;
      }

      this.tab.set('ordenes');
      this.estadoFiltro.set('todas');
      this.pagina.set(1);
      this.reiniciarFormularioManual();
      await this.cargarLista();
      this.mostrarToast(`Orden ${orden.codigo} creada con ${orden.items} ítem(s)`);
    } finally {
      this.guardandoManual.set(false);
    }
  }

  /** Sube o quita el logo del proveedor y refresca la lista local. */
  async cambiarLogoProveedor(proveedorId: number, url: string | null): Promise<void> {
    const ok = await this.compras.actualizarProveedorImagen(proveedorId, url);
    if (!ok) {
      this.mostrarToast(this.compras.error() ?? 'No se pudo actualizar el logo del proveedor');
      return;
    }
    this.mostrarToast('Logo del proveedor actualizado');
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

  private reiniciarFormularioManual(): void {
    this.lineasManuales.set([]);
    this.insumoSeleccionado.set(null);
    this.cantidadManual.set('1');
    this.precioManual.set('');
    this.proveedorManual.set('');
    this.busquedaInsumo.set('');
  }

  private numeroDesde(texto: string): number {
    const limpio = texto.trim().replace(',', '.');
    return limpio === '' ? Number.NaN : Number(limpio);
  }

  private proveedorManualId(): number | null {
    const valor = Number(this.proveedorManual());
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  private async cargarInsumosManuales(): Promise<void> {
    if (this.inventario.insumos().length > 0) {
      return;
    }
    this.cargandoInsumos.set(true);
    try {
      await this.inventario.cargar({ limit: 100 });
    } finally {
      this.cargandoInsumos.set(false);
    }
  }

  private async inicializar(): Promise<void> {
    await Promise.all([
      this.compras.cargarSugerencias(),
      this.compras.cargarProveedores(),
      this.compras.contarEntradas(),
      this.inventario.cargarConsumo(7),
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
    if (!this.urlActiva()) return;
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
